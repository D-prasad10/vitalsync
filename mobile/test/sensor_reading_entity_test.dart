import 'package:flutter_test/flutter_test.dart';
import 'package:vitalsync/models/sensor_reading_entity.dart';
import 'package:vitalsync/entities/sensor_reading_entity.dart' as entity_alias;
import 'package:vitalsync/models/vital.dart';

void main() {
  group('SensorReadingEntity Tests', () {
    test('instantiates with all expected fields matching schema', () {
      const reading = SensorReadingEntity(
        id: 1,
        patientId: 101,
        timestamp: 1725624000000,
        heartRate: 78,
        spo2: 98,
        bodyTemp: 98.6,
        envTemp: 72.5,
        humidity: 45.0,
        bpSys: 120,
        bpDia: 80,
        healthScore: 92,
      );

      expect(reading.id, 1);
      expect(reading.patientId, 101);
      expect(reading.timestamp, 1725624000000);
      expect(reading.heartRate, 78);
      expect(reading.hr, 78);
      expect(reading.spo2, 98);
      expect(reading.bodyTemp, 98.6);
      expect(reading.temp, 98.6);
      expect(reading.envTemp, 72.5);
      expect(reading.humidity, 45.0);
      expect(reading.bpSys, 120);
      expect(reading.bpDia, 80);
      expect(reading.healthScore, 92);
    });

    test('verifies re-export path package:vitalsync/entities/sensor_reading_entity.dart works identically', () {
      const entity = entity_alias.SensorReadingEntity(
        id: 2,
        patientId: 102,
        timestamp: 1725624100000,
        heartRate: 85,
        spo2: 97,
      );

      expect(entity.id, 2);
      expect(entity.heartRate, 85);
    });

    test('serializes to and from SQLite map correctly', () {
      const original = SensorReadingEntity(
        id: 42,
        patientId: 7,
        timestamp: 1725624200000,
        heartRate: 82,
        spo2: 99,
        bodyTemp: 98.4,
        envTemp: 70.0,
        humidity: 50.0,
        bpSys: 118,
        bpDia: 78,
        healthScore: 95,
      );

      final map = original.toMap();
      expect(map['id'], 42);
      expect(map['patient_id'], 7);
      expect(map['timestamp'], 1725624200000);
      expect(map['heart_rate'], 82);
      expect(map['spo2'], 99);
      expect(map['body_temp'], 98.4);
      expect(map['env_temp'], 70.0);
      expect(map['humidity'], 50.0);
      expect(map['bp_sys'], 118);
      expect(map['bp_dia'], 78);
      expect(map['health_score'], 95);

      final reconstructed = SensorReadingEntity.fromMap(map);
      expect(reconstructed.id, original.id);
      expect(reconstructed.patientId, original.patientId);
      expect(reconstructed.timestamp, original.timestamp);
      expect(reconstructed.heartRate, original.heartRate);
      expect(reconstructed.spo2, original.spo2);
      expect(reconstructed.bodyTemp, original.bodyTemp);
      expect(reconstructed.envTemp, original.envTemp);
      expect(reconstructed.humidity, original.humidity);
      expect(reconstructed.bpSys, original.bpSys);
      expect(reconstructed.bpDia, original.bpDia);
      expect(reconstructed.healthScore, original.healthScore);
    });

    test('inter-operates smoothly with VitalPoint', () {
      final vital = VitalPoint(
        patientId: 5,
        hr: 75,
        spo2: 96,
        temp: 99.1,
        bpSys: 125,
        bpDia: 85,
        healthScore: 88,
        timestamp: 1725624300000,
      );

      final entity = SensorReadingEntity.fromVitalPoint(
        vital,
        id: 10,
        envTemp: 74.0,
        humidity: 55.0,
      );

      expect(entity.id, 10);
      expect(entity.patientId, 5);
      expect(entity.heartRate, 75);
      expect(entity.spo2, 96);
      expect(entity.bodyTemp, 99.1);
      expect(entity.envTemp, 74.0);
      expect(entity.humidity, 55.0);

      final backToVital = entity.toVitalPoint();
      expect(backToVital.patientId, vital.patientId);
      expect(backToVital.hr, vital.hr);
      expect(backToVital.spo2, vital.spo2);
      expect(backToVital.temp, vital.temp);
      expect(backToVital.bpSys, vital.bpSys);
      expect(backToVital.bpDia, vital.bpDia);
      expect(backToVital.healthScore, vital.healthScore);
      expect(backToVital.timestamp, vital.timestamp);
    });
  });
}
