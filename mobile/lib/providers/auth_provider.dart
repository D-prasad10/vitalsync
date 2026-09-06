import 'package:flutter/material.dart';
import '../models/user.dart';
import '../services/auth_service.dart';

class AuthProvider extends ChangeNotifier {
  final AuthService _authService = AuthService();
  User? _currentUser;
  bool _isLoading = true;
  String? _error;

  User? get currentUser => _currentUser;
  bool get isLoading => _isLoading;
  String? get error => _error;
  bool get isAuthenticated => _currentUser != null;

  AuthProvider() {
    initAuthSession();
  }

  Future<void> initAuthSession() async {
    _isLoading = true;
    notifyListeners();
    _currentUser = await _authService.getSavedUserSession();
    _isLoading = false;
    notifyListeners();
  }

  Future<bool> sendOtp(String mobile, String email, String role) async {
    _isLoading = true;
    _error = null;
    notifyListeners();

    final result = await _authService.sendOtp(mobile: mobile, email: email, role: role);
    _isLoading = false;

    if (result['success']) {
      notifyListeners();
      return true;
    } else {
      _error = result['error'];
      notifyListeners();
      return false;
    }
  }

  Future<bool> verifyOtp(String mobile, String otp) async {
    _isLoading = true;
    _error = null;
    notifyListeners();

    final result = await _authService.verifyOtp(mobile: mobile, otp: otp);
    _isLoading = false;

    if (result['success']) {
      _currentUser = result['user'];
      notifyListeners();
      return true;
    } else {
      _error = result['error'];
      notifyListeners();
      return false;
    }
  }

  Future<void> logout() async {
    await _authService.logout();
    _currentUser = null;
    notifyListeners();
  }
}
