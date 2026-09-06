import 'dart:io' show Platform;
import 'package:flutter/foundation.dart';
import 'package:path/path.dart';
import 'package:sqflite/sqflite.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';
import '../models/sensor_reading_entity.dart';

class DatabaseService {
  static final DatabaseService _instance = DatabaseService._internal();
  factory DatabaseService() => _instance;
  DatabaseService._internal();

  static Database? _database;
  static const String tableName = 'sensor_readings';
  static const String dbName = 'vitalsync_local.db';

  // In-memory fallback cache for Web platform where SQLite native is unavailable
  final List<SensorReadingEntity> _webFallbackStorage = [];

  Future<Database?> get database async {
    if (kIsWeb) return null;
    if (_database != null) return _database!;
    _database = await _initDatabase();
    return _database;
  }

  Future<Database> _initDatabase() async {
    // Initialize FFI for desktop platforms and unit test runners
    if (!kIsWeb && (Platform.isMacOS || Platform.isLinux || Platform.isWindows)) {
      sqfliteFfiInit();
      databaseFactory = databaseFactoryFfi;
    }

    final dbPath = await getDatabasesPath();
    final path = join(dbPath, dbName);

    return await openDatabase(
      path,
      version: 1,
      onCreate: (db, version) async {
        await db.execute('''
          CREATE TABLE IF NOT EXISTS $tableName (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            patient_id INTEGER,
            timestamp INTEGER NOT NULL,
            heart_rate INTEGER,
            spo2 INTEGER,
            body_temp REAL,
            env_temp REAL,
            humidity REAL,
            bp_sys INTEGER,
            bp_dia INTEGER,
            health_score INTEGER
          )
        ''');

        // Create indexes for efficient patient query filtering and timestamp sorting
        await db.execute('CREATE INDEX IF NOT EXISTS idx_patient_ts ON $tableName (patient_id, timestamp DESC)');
      },
    );
  }

  /// Insert a single sensor reading
  Future<int> insertReading(SensorReadingEntity reading) async {
    if (kIsWeb) {
      final newId = _webFallbackStorage.length + 1;
      final assigned = SensorReadingEntity(
        id: newId,
        patientId: reading.patientId,
        timestamp: reading.timestamp,
        heartRate: reading.heartRate,
        spo2: reading.spo2,
        bodyTemp: reading.bodyTemp,
        envTemp: reading.envTemp,
        humidity: reading.humidity,
        bpSys: reading.bpSys,
        bpDia: reading.bpDia,
        healthScore: reading.healthScore,
      );
      _webFallbackStorage.add(assigned);
      return newId;
    }

    final db = await database;
    if (db == null) return 0;
    return await db.insert(
      tableName,
      reading.toMap(),
      conflictAlgorithm: ConflictAlgorithm.replace,
    );
  }

  /// Batch insert sensor readings
  Future<void> insertReadings(List<SensorReadingEntity> readings) async {
    if (kIsWeb) {
      for (var r in readings) {
        await insertReading(r);
      }
      return;
    }

    final db = await database;
    if (db == null || readings.isEmpty) return;

    final batch = db.batch();
    for (var r in readings) {
      batch.insert(
        tableName,
        r.toMap(),
        conflictAlgorithm: ConflictAlgorithm.replace,
      );
    }
    await batch.commit(noResult: true);
  }

  /// Retrieve readings by patient ID, sorted newest first
  Future<List<SensorReadingEntity>> getReadingsByPatientId(
    int patientId, {
    int? limit,
    int? sinceTimestamp,
  }) async {
    if (kIsWeb) {
      var list = _webFallbackStorage.where((r) => r.patientId == patientId).toList();
      if (sinceTimestamp != null) {
        list = list.where((r) => r.timestamp >= sinceTimestamp).toList();
      }
      list.sort((a, b) => b.timestamp.compareTo(a.timestamp));
      if (limit != null && list.length > limit) {
        list = list.sublist(0, limit);
      }
      return list;
    }

    final db = await database;
    if (db == null) return [];

    String whereClause = 'patient_id = ?';
    List<dynamic> whereArgs = [patientId];

    if (sinceTimestamp != null) {
      whereClause += ' AND timestamp >= ?';
      whereArgs.add(sinceTimestamp);
    }

    final List<Map<String, dynamic>> maps = await db.query(
      tableName,
      where: whereClause,
      whereArgs: whereArgs,
      orderBy: 'timestamp DESC',
      limit: limit,
    );

    return maps.map((m) => SensorReadingEntity.fromMap(m)).toList();
  }

  /// Retrieve all stored readings across patients
  Future<List<SensorReadingEntity>> getAllReadings({int? limit}) async {
    if (kIsWeb) {
      var list = List<SensorReadingEntity>.from(_webFallbackStorage);
      list.sort((a, b) => b.timestamp.compareTo(a.timestamp));
      if (limit != null && list.length > limit) {
        list = list.sublist(0, limit);
      }
      return list;
    }

    final db = await database;
    if (db == null) return [];

    final List<Map<String, dynamic>> maps = await db.query(
      tableName,
      orderBy: 'timestamp DESC',
      limit: limit,
    );

    return maps.map((m) => SensorReadingEntity.fromMap(m)).toList();
  }

  /// Get the latest reading for a given patient
  Future<SensorReadingEntity?> getLatestReading(int patientId) async {
    final list = await getReadingsByPatientId(patientId, limit: 1);
    return list.isNotEmpty ? list.first : null;
  }

  /// Total count of readings stored locally
  Future<int> getReadingsCount({int? patientId}) async {
    if (kIsWeb) {
      if (patientId != null) {
        return _webFallbackStorage.where((r) => r.patientId == patientId).length;
      }
      return _webFallbackStorage.length;
    }

    final db = await database;
    if (db == null) return 0;

    if (patientId != null) {
      final result = await db.rawQuery('SELECT COUNT(*) as count FROM $tableName WHERE patient_id = ?', [patientId]);
      return Sqflite.firstIntValue(result) ?? 0;
    }

    final result = await db.rawQuery('SELECT COUNT(*) as count FROM $tableName');
    return Sqflite.firstIntValue(result) ?? 0;
  }

  /// Delete a reading by ID
  Future<int> deleteReading(int id) async {
    if (kIsWeb) {
      final initialLen = _webFallbackStorage.length;
      _webFallbackStorage.removeWhere((r) => r.id == id);
      return initialLen - _webFallbackStorage.length;
    }

    final db = await database;
    if (db == null) return 0;
    return await db.delete(tableName, where: 'id = ?', whereArgs: [id]);
  }

  /// Clear all stored local readings
  Future<int> clearAllReadings() async {
    if (kIsWeb) {
      final count = _webFallbackStorage.length;
      _webFallbackStorage.clear();
      return count;
    }

    final db = await database;
    if (db == null) return 0;
    return await db.delete(tableName);
  }

  /// Close database connection
  Future<void> close() async {
    if (_database != null) {
      await _database!.close();
      _database = null;
    }
  }
}
