import 'package:flutter/material.dart';
import '../models/patient.dart';
import '../models/vital.dart';
import '../services/api_service.dart';

class PatientProvider extends ChangeNotifier {
  final ApiService _apiService = ApiService();

  List<Patient> _patients = [];
  Patient? _selectedPatient;
  List<VitalPoint> _history = [];
  bool _isLoadingPatients = false;
  bool _isLoadingHistory = false;
  String _searchTerm = '';

  List<Patient> get patients => _patients;
  Patient? get selectedPatient => _selectedPatient;
  List<VitalPoint> get history => _history;
  bool get isLoadingPatients => _isLoadingPatients;
  bool get isLoadingHistory => _isLoadingHistory;
  String get searchTerm => _searchTerm;

  List<Patient> get filteredPatients {
    if (_searchTerm.trim().isEmpty) return _patients;
    final term = _searchTerm.toLowerCase();
    return _patients.where((p) {
      final nameMatch = p.name.toLowerCase().contains(term);
      final roomMatch = p.roomNumber?.contains(term) ?? false;
      final idMatch = p.id.toString().contains(term);
      return nameMatch || roomMatch || idMatch;
    }).toList();
  }

  void setSearchTerm(String term) {
    _searchTerm = term;
    notifyListeners();
  }

  Future<void> loadPatients() async {
    _isLoadingPatients = true;
    notifyListeners();

    _patients = await _apiService.getPatients();
    if (_patients.isNotEmpty && _selectedPatient == null) {
      selectPatient(_patients.first);
    }
    _isLoadingPatients = false;
    notifyListeners();
  }

  Future<void> selectPatient(Patient patient) async {
    _selectedPatient = patient;
    _isLoadingHistory = true;
    notifyListeners();

    _history = await _apiService.getPatientHistory(patient.id);
    _isLoadingHistory = false;
    notifyListeners();
  }
}
