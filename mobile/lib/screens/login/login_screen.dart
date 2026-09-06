import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/theme/app_theme.dart';
import '../../providers/auth_provider.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  int _step = 1;
  String _selectedRole = 'caretaker';
  final _phoneController = TextEditingController();
  final _emailController = TextEditingController();
  final _otpController = TextEditingController();

  @override
  void dispose() {
    _phoneController.dispose();
    _emailController.dispose();
    _otpController.dispose();
    super.dispose();
  }

  void _handleSendOtp() async {
    final phone = _phoneController.text.trim();
    final email = _emailController.text.trim();

    if (phone.isEmpty || phone.length < 10) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Please enter a valid 10-digit mobile number')),
      );
      return;
    }
    if (email.isEmpty || !email.contains('@')) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Please enter a valid email address')),
      );
      return;
    }

    final authProvider = Provider.of<AuthProvider>(context, listen: false);
    final success = await authProvider.sendOtp(phone, email, _selectedRole);

    if (success) {
      setState(() {
        _step = 2;
      });
    }
  }

  void _handleVerifyOtp() async {
    final phone = _phoneController.text.trim();
    final otp = _otpController.text.trim();

    if (otp.length != 6) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('OTP must be 6 digits')),
      );
      return;
    }

    final authProvider = Provider.of<AuthProvider>(context, listen: false);
    final success = await authProvider.verifyOtp(phone, otp);

    if (success) {
      if (mounted) {
        Navigator.of(context).pushReplacementNamed('/main');
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final authProvider = Provider.of<AuthProvider>(context);
    final accentColor = _selectedRole == 'caretaker' ? AppTheme.success : AppTheme.accentPrimary;

    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24.0),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                // Branding Header
                const Icon(Icons.favorite_rounded, size: 56, color: AppTheme.accentPrimary),
                const SizedBox(height: 12),
                const Text(
                  'VitalsSync',
                  textAlign: TextAlign.center,
                  style: TextStyle(fontSize: 28, fontWeight: FontWeight.bold, color: AppTheme.textPrimary),
                ),
                const SizedBox(height: 4),
                const Text(
                  'Real-Time Healthcare Telemetry Portal',
                  textAlign: TextAlign.center,
                  style: TextStyle(fontSize: 13, color: AppTheme.textSecondary),
                ),
                const SizedBox(height: 32),

                // Login Card
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(20.0),
                    child: _step == 1
                        ? Column(
                            crossAxisAlignment: CrossAxisAlignment.stretch,
                            children: [
                              const Text(
                                'Select Role',
                                style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: AppTheme.textSecondary),
                              ),
                              const SizedBox(height: 8),
                              Row(
                                children: [
                                  Expanded(child: _roleButton('caretaker', 'Caretaker', Icons.local_hospital)),
                                  const SizedBox(width: 8),
                                  Expanded(child: _roleButton('doctor', 'Doctor', Icons.medical_services)),
                                ],
                              ),
                              const SizedBox(height: 16),
                              TextField(
                                controller: _phoneController,
                                keyboardType: TextInputType.phone,
                                decoration: const InputDecoration(
                                  labelText: 'Mobile Number',
                                  prefixIcon: Icon(Icons.phone_android),
                                  hintText: '10-digit mobile number',
                                ),
                              ),
                              const SizedBox(height: 12),
                              TextField(
                                controller: _emailController,
                                keyboardType: TextInputType.emailAddress,
                                decoration: const InputDecoration(
                                  labelText: 'Email Address',
                                  prefixIcon: Icon(Icons.email_outlined),
                                  hintText: 'staff@hospital.com',
                                ),
                              ),
                              const SizedBox(height: 20),
                              if (authProvider.error != null)
                                Padding(
                                  padding: const EdgeInsets.only(bottom: 12),
                                  child: Text('⚠️ ${authProvider.error}', style: const TextStyle(color: AppTheme.danger, fontSize: 13)),
                                ),
                              ElevatedButton(
                                style: ElevatedButton.styleFrom(backgroundColor: accentColor),
                                onPressed: authProvider.isLoading ? null : _handleSendOtp,
                                child: authProvider.isLoading
                                    ? const SizedBox(height: 20, width: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.black))
                                    : const Text('Send Verification OTP'),
                              ),
                            ],
                          )
                        : Column(
                            crossAxisAlignment: CrossAxisAlignment.stretch,
                            children: [
                              Row(
                                children: [
                                  IconButton(
                                    icon: const Icon(Icons.arrow_back),
                                    onPressed: () => setState(() => _step = 1),
                                  ),
                                  const Text(
                                    'Enter OTP Code',
                                    style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
                                  ),
                                ],
                              ),
                              const SizedBox(height: 12),
                              Text(
                                'A 6-digit verification code was sent to ${_phoneController.text.trim()}',
                                style: const TextStyle(fontSize: 13, color: AppTheme.textSecondary),
                              ),
                              const SizedBox(height: 16),
                              TextField(
                                controller: _otpController,
                                keyboardType: TextInputType.number,
                                maxLength: 6,
                                textAlign: TextAlign.center,
                                style: const TextStyle(fontSize: 22, letterSpacing: 8, fontWeight: FontWeight.bold),
                                decoration: const InputDecoration(
                                  hintText: '000000',
                                  counterText: '',
                                ),
                              ),
                              const SizedBox(height: 20),
                              if (authProvider.error != null)
                                Padding(
                                  padding: const EdgeInsets.only(bottom: 12),
                                  child: Text('⚠️ ${authProvider.error}', style: const TextStyle(color: AppTheme.danger, fontSize: 13)),
                                ),
                              ElevatedButton(
                                style: ElevatedButton.styleFrom(backgroundColor: accentColor),
                                onPressed: authProvider.isLoading ? null : _handleVerifyOtp,
                                child: authProvider.isLoading
                                    ? const SizedBox(height: 20, width: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.black))
                                    : const Text('Verify & Login'),
                              ),
                            ],
                          ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _roleButton(String role, String label, IconData icon) {
    final isSelected = _selectedRole == role;
    final color = role == 'caretaker' ? AppTheme.success : AppTheme.accentPrimary;

    return OutlinedButton.icon(
      style: OutlinedButton.styleFrom(
        side: BorderSide(color: isSelected ? color : AppTheme.glassBorder, width: isSelected ? 1.5 : 1),
        backgroundColor: isSelected ? color.withOpacity(0.15) : Colors.transparent,
        padding: const EdgeInsets.symmetric(vertical: 12),
      ),
      onPressed: () => setState(() => _selectedRole = role),
      icon: Icon(icon, size: 18, color: isSelected ? color : AppTheme.textSecondary),
      label: Text(
        label,
        style: TextStyle(color: isSelected ? color : AppTheme.textSecondary, fontWeight: isSelected ? FontWeight.bold : FontWeight.normal),
      ),
    );
  }
}
