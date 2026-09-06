import 'dart:convert';
import 'package:http/http.dart' as http;
import '../core/constants/api_constants.dart';
import '../models/patient.dart';
import '../models/vital.dart';
import '../models/staff.dart';

class ApiService {
  // Fetch Patients List
  Future<List<Patient>> getPatients() async {
    try {
      final response = await http.get(Uri.parse(ApiConstants.patients));
      if (response.statusCode == 200) {
        final List data = jsonDecode(response.body);
        return data.map((json) => Patient.fromJson(json)).toList();
      }
      return [];
    } catch (e) {
      return [];
    }
  }

  // Fetch Patient History
  Future<List<VitalPoint>> getPatientHistory(int patientId) async {
    try {
      final response = await http.get(Uri.parse(ApiConstants.patientHistory(patientId)));
      if (response.statusCode == 200) {
        final List data = jsonDecode(response.body);
        return data.map((json) => VitalPoint.fromJson(json)).toList();
      }
      return [];
    } catch (e) {
      return [];
    }
  }

  // Save Thresholds
  Future<bool> saveThresholds(int patientId, Map<String, dynamic> thresholds) async {
    try {
      final response = await http.post(
        Uri.parse(ApiConstants.patientThresholds(patientId)),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode(thresholds),
      );
      return response.statusCode == 200;
    } catch (e) {
      return false;
    }
  }

  // Fetch Staff
  Future<List<StaffMember>> getStaff() async {
    try {
      final response = await http.get(Uri.parse(ApiConstants.staff));
      if (response.statusCode == 200) {
        final List data = jsonDecode(response.body);
        return data.map((json) => StaffMember.fromJson(json)).toList();
      }
      return [];
    } catch (e) {
      return [];
    }
  }
}
