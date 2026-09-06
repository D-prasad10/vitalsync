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

  Future<void> loadPatients({bool force = false}) async {
    if (_isLoadingPatients) return;
    if (!force && _patients.isNotEmpty) return;

    _isLoadingPatients = true;
    notifyListeners();

    try {
      _patients = await _apiService.getPatients();
      if (_patients.isNotEmpty && _selectedPatient == null) {
        await selectPatient(_patients.first);
      }
    } catch (_) {
      // Gracefully handle network exceptions without breaking UI
    } finally {
      _isLoadingPatients = false;
      notifyListeners();
    }
  }

  Future<void> selectPatient(Patient patient) async {
    if (_selectedPatient?.id == patient.id && _history.isNotEmpty) {
      _selectedPatient = patient;
      notifyListeners();
      return;
    }

    _selectedPatient = patient;
    _isLoadingHistory = true;
    notifyListeners();

    try {
      _history = await _apiService.getPatientHistory(patient.id);
    } catch (_) {
      // Gracefully handle network exceptions without breaking UI
    } finally {
      _isLoadingHistory = false;
      notifyListeners();
    }
  }
}
