import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';
import '../core/constants/api_constants.dart';
import '../models/user.dart';

class AuthService {
  static const String _userKey = 'vitals_user';

  // Send OTP
  Future<Map<String, dynamic>> sendOtp({
    required String mobile,
    required String email,
    required String role,
  }) async {
    try {
      final response = await http.post(
        Uri.parse(ApiConstants.sendOtp),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({
          'mobile': mobile.trim(),
          'email': email.trim().toLowerCase(),
          'role': role,
        }),
      );

      final data = jsonDecode(response.body);
      if (response.statusCode == 200) {
        return {'success': true, 'devOtp': data['devOtp']};
      }
      return {'success': false, 'error': data['error'] ?? 'Failed to send OTP'};
    } catch (e) {
      return {'success': false, 'error': 'Cannot connect to server. Check connection.'};
    }
  }

  // Verify OTP
  Future<Map<String, dynamic>> verifyOtp({
    required String mobile,
    required String otp,
  }) async {
    try {
      final response = await http.post(
        Uri.parse(ApiConstants.verifyOtp),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({
          'mobile': mobile.trim(),
          'otp': otp.trim(),
        }),
      );

      final data = jsonDecode(response.body);
      if (response.statusCode == 200 && data['user'] != null) {
        final user = User.fromJson(data['user']);
        await saveUserSession(user);
        return {'success': true, 'user': user};
      }
      return {'success': false, 'error': data['error'] ?? 'Verification failed'};
    } catch (e) {
      return {'success': false, 'error': 'Cannot connect to server.'};
    }
  }

  // Save Session
  Future<void> saveUserSession(User user) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_userKey, jsonEncode(user.toJson()));
  }

  // Load Session
  Future<User?> getSavedUserSession() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final userStr = prefs.getString(_userKey);
      if (userStr != null) {
        return User.fromJson(jsonDecode(userStr));
      }
    } catch (e) {
      // Clear corrupt session
      final prefs = await SharedPreferences.getInstance();
      await prefs.remove(_userKey);
    }
    return null;
  }

  // Logout
  Future<void> logout() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_userKey);
  }
}
