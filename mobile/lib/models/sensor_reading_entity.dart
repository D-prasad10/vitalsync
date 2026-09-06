import 'vital.dart';

/// SensorReadingEntity represents a comprehensive biometric telemetry point
/// mapped directly to both the SQLite schema and backend sensor stream.
class SensorReadingEntity {
  final int? id;
  final int? patientId;
  final int timestamp;
  final int? heartRate;
  final int? spo2;
  final double? bodyTemp;
  final double? envTemp;
  final double? humidity;
  final int? bpSys;
  final int? bpDia;
  final int? healthScore;

  const SensorReadingEntity({
    this.id,
    this.patientId,
    required this.timestamp,
    this.heartRate,
    this.spo2,
    this.bodyTemp,
    this.envTemp,
    this.humidity,
    this.bpSys,
    this.bpDia,
    this.healthScore,
  });

  /// Convenient aliases for alternate naming conventions
  int? get hr => heartRate;
  double? get temp => bodyTemp;

  /// Serialization to SQLite Map (column names matching SQLite table schema)
  Map<String, dynamic> toMap() {
    return {
      if (id != null) 'id': id,
      'patient_id': patientId,
      'timestamp': timestamp,
      'heart_rate': heartRate,
      'spo2': spo2,
      'body_temp': bodyTemp,
      'env_temp': envTemp,
      'humidity': humidity,
      'bp_sys': bpSys,
      'bp_dia': bpDia,
      'health_score': healthScore,
    };
  }

  /// Deserialization from SQLite Map
  factory SensorReadingEntity.fromMap(Map<String, dynamic> map) {
    return SensorReadingEntity(
      id: map['id'] is int ? map['id'] : int.tryParse(map['id']?.toString() ?? ''),
      patientId: map['patient_id'] is int
          ? map['patient_id']
          : (map['patientId'] is int
              ? map['patientId']
              : int.tryParse(map['patient_id']?.toString() ?? map['patientId']?.toString() ?? '')),
      timestamp: map['timestamp'] is int
          ? map['timestamp']
          : (int.tryParse(map['timestamp']?.toString() ?? '') ?? DateTime.now().millisecondsSinceEpoch),
      heartRate: map['heart_rate'] is int
          ? map['heart_rate']
          : (map['hr'] is int
              ? map['hr']
              : int.tryParse(map['heart_rate']?.toString() ?? map['hr']?.toString() ?? '')),
      spo2: map['spo2'] is int ? map['spo2'] : int.tryParse(map['spo2']?.toString() ?? ''),
      bodyTemp: map['body_temp'] is double
          ? map['body_temp']
          : (map['temp'] is double
              ? map['temp']
              : double.tryParse(map['body_temp']?.toString() ?? map['temp']?.toString() ?? '')),
      envTemp: map['env_temp'] is double
          ? map['env_temp']
          : double.tryParse(map['env_temp']?.toString() ?? ''),
      humidity: map['humidity'] is double
          ? map['humidity']
          : double.tryParse(map['humidity']?.toString() ?? ''),
      bpSys: map['bp_sys'] is int
          ? map['bp_sys']
          : (map['bpSys'] is int
              ? map['bpSys']
              : int.tryParse(map['bp_sys']?.toString() ?? map['bpSys']?.toString() ?? '')),
      bpDia: map['bp_dia'] is int
          ? map['bp_dia']
          : (map['bpDia'] is int
              ? map['bpDia']
              : int.tryParse(map['bp_dia']?.toString() ?? map['bpDia']?.toString() ?? '')),
      healthScore: map['health_score'] is int
          ? map['health_score']
          : (map['healthScore'] is int
              ? map['healthScore']
              : int.tryParse(map['health_score']?.toString() ?? map['healthScore']?.toString() ?? '')),
    );
  }

  /// JSON serialization
  factory SensorReadingEntity.fromJson(Map<String, dynamic> json) => SensorReadingEntity.fromMap(json);
  Map<String, dynamic> toJson() => toMap();

  /// Conversion between VitalPoint (provider/UI format) and SensorReadingEntity (database entity)
  factory SensorReadingEntity.fromVitalPoint(
    VitalPoint vital, {
    int? id,
    double? envTemp,
    double? humidity,
  }) {
    return SensorReadingEntity(
      id: id,
      patientId: vital.patientId,
      timestamp: vital.timestamp,
      heartRate: vital.hr,
      spo2: vital.spo2,
      bodyTemp: vital.temp,
      envTemp: envTemp,
      humidity: humidity,
      bpSys: vital.bpSys,
      bpDia: vital.bpDia,
      healthScore: vital.healthScore,
    );
  }

  VitalPoint toVitalPoint() {
    return VitalPoint(
      patientId: patientId,
      hr: heartRate,
      bpSys: bpSys,
      bpDia: bpDia,
      spo2: spo2,
      temp: bodyTemp,
      healthScore: healthScore,
      timestamp: timestamp,
    );
  }

  @override
  String toString() {
    return 'SensorReadingEntity(id: $id, patientId: $patientId, hr: $heartRate, spo2: $spo2, bodyTemp: $bodyTemp, envTemp: $envTemp, humidity: $humidity, timestamp: $timestamp)';
  }

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is SensorReadingEntity &&
          runtimeType == other.runtimeType &&
          id == other.id &&
          patientId == other.patientId &&
          timestamp == other.timestamp &&
          heartRate == other.heartRate &&
          spo2 == other.spo2;

  @override
  int get hashCode => id.hashCode ^ patientId.hashCode ^ timestamp.hashCode ^ heartRate.hashCode;
}
