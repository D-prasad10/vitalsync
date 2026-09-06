import 'package:flutter_test/flutter_test.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';
import 'package:vitalsync/models/sensor_reading_entity.dart';
import 'package:vitalsync/services/database_service.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  // Initialize FFI for unit test execution environment
  sqfliteFfiInit();
  databaseFactory = databaseFactoryFfi;

  late DatabaseService dbService;

  setUp(() async {
    dbService = DatabaseService();
    await dbService.clearAllReadings();
  });

  tearDown(() async {
    await dbService.clearAllReadings();
  });

  group('DatabaseService SQLite Storage Tests', () {
    test('inserts and retrieves sensor readings for a patient', () async {
      const reading1 = SensorReadingEntity(
        patientId: 1,
        timestamp: 1000,
        heartRate: 72,
        spo2: 98,
        bodyTemp: 98.6,
        envTemp: 72.0,
        humidity: 45.0,
        bpSys: 120,
        bpDia: 80,
        healthScore: 95,
      );

      const reading2 = SensorReadingEntity(
        patientId: 1,
        timestamp: 2000,
        heartRate: 78,
        spo2: 97,
        bodyTemp: 98.7,
        envTemp: 72.5,
        humidity: 46.0,
        bpSys: 122,
        bpDia: 82,
        healthScore: 91,
      );

      final id1 = await dbService.insertReading(reading1);
      final id2 = await dbService.insertReading(reading2);

      expect(id1, greaterThan(0));
      expect(id2, greaterThan(0));

      final count = await dbService.getReadingsCount(patientId: 1);
      expect(count, 2);

      final patientReadings = await dbService.getReadingsByPatientId(1);
      expect(patientReadings.length, 2);
      // Newest reading first
      expect(patientReadings.first.timestamp, 2000);
      expect(patientReadings.first.heartRate, 78);
      expect(patientReadings.last.timestamp, 1000);
      expect(patientReadings.last.heartRate, 72);

      final latest = await dbService.getLatestReading(1);
      expect(latest, isNotNull);
      expect(latest!.timestamp, 2000);
      expect(latest.heartRate, 78);
      expect(latest.spo2, 97);
    });

    test('batch inserts multiple readings and queries across patients', () async {
      final list = [
        const SensorReadingEntity(patientId: 2, timestamp: 100, heartRate: 80, spo2: 99),
        const SensorReadingEntity(patientId: 2, timestamp: 200, heartRate: 82, spo2: 98),
        const SensorReadingEntity(patientId: 3, timestamp: 300, heartRate: 90, spo2: 95),
      ];

      await dbService.insertReadings(list);

      final totalCount = await dbService.getReadingsCount();
      expect(totalCount, 3);

      final p2Count = await dbService.getReadingsCount(patientId: 2);
      expect(p2Count, 2);

      final p3Count = await dbService.getReadingsCount(patientId: 3);
      expect(p3Count, 1);
    });

    test('deletes specific reading and clears all readings', () async {
      const reading = SensorReadingEntity(
        patientId: 4,
        timestamp: 500,
        heartRate: 65,
        spo2: 99,
      );

      final id = await dbService.insertReading(reading);
      expect(await dbService.getReadingsCount(patientId: 4), 1);

      await dbService.deleteReading(id);
      expect(await dbService.getReadingsCount(patientId: 4), 0);

      await dbService.insertReading(reading);
      final cleared = await dbService.clearAllReadings();
      expect(cleared, greaterThanOrEqualTo(1));
      expect(await dbService.getReadingsCount(), 0);
    });
  });
}
