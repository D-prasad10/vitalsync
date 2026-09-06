import 'package:flutter/foundation.dart';

class ApiConstants {
  // Base URL resolution for Emulator vs Real Device vs Web
  static String get baseUrl {
    if (kIsWeb) return 'http://localhost:5001';
    if (defaultTargetPlatform == TargetPlatform.android) {
      return 'http://10.0.2.2:5001'; // Android emulator localhost alias
    }
    return 'http://localhost:5001';
  }

  static String get socketUrl => baseUrl;

  // Authentication
  static String get sendOtp => '$baseUrl/api/auth/send-otp';
  static String get verifyOtp => '$baseUrl/api/auth/verify-otp';

  // Patients
  static String get patients => '$baseUrl/api/patients';
  static String patientHistory(int id) => '$baseUrl/api/patients/$id/history';
  static String patientThresholds(int id) => '$baseUrl/api/patients/$id/thresholds';

  // Staff
  static String get staff => '$baseUrl/api/staff';
}
