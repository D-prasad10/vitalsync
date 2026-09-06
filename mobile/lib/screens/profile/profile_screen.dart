import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/theme/app_theme.dart';
import '../../providers/auth_provider.dart';

class ProfileScreen extends StatelessWidget {
  const ProfileScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final authProvider = Provider.of<AuthProvider>(context);
    final user = authProvider.currentUser;

    return Scaffold(
      appBar: AppBar(
        title: const Text('User Profile & Hospital Roster'),
      ),
      body: ListView(
        padding: const EdgeInsets.all(16.0),
        children: [
          // Profile Header
          Card(
            child: Padding(
              padding: const EdgeInsets.all(20.0),
              child: Column(
                children: [
                  CircleAvatar(
                    radius: 36,
                    backgroundColor: AppTheme.accentSecondary,
                    child: Text(
                      user?.name.isNotEmpty == true ? user!.name[0].toUpperCase() : 'U',
                      style: const TextStyle(fontSize: 28, fontWeight: FontWeight.bold, color: Colors.white),
                    ),
                  ),
                  const SizedBox(height: 12),
                  Text(
                    user?.name ?? 'Healthcare Staff',
                    style: const TextStyle(fontSize: 20, fontWeight: FontWeight.bold, color: AppTheme.textPrimary),
                  ),
                  const SizedBox(height: 4),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                    decoration: BoxDecoration(
                      color: AppTheme.accentPrimary.withValues(alpha: 0.15),
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: AppTheme.accentPrimary.withValues(alpha: 0.3)),
                    ),
                    child: Text(
                      (user?.role ?? 'Staff').toUpperCase(),
                      style: const TextStyle(color: AppTheme.accentPrimary, fontWeight: FontWeight.bold, fontSize: 11),
                    ),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 20),

          // User Info Fields
          Card(
            child: Column(
              children: [
                ListTile(
                  leading: const Icon(Icons.badge_outlined, color: AppTheme.accentPrimary),
                  title: const Text('Staff ID', style: TextStyle(fontSize: 13, color: AppTheme.textSecondary)),
                  subtitle: Text(user?.staffId ?? 'ST-101', style: const TextStyle(fontWeight: FontWeight.bold, color: AppTheme.textPrimary)),
                ),
                const Divider(height: 1, color: AppTheme.glassBorder),
                ListTile(
                  leading: const Icon(Icons.email_outlined, color: AppTheme.accentPrimary),
                  title: const Text('Email Address', style: TextStyle(fontSize: 13, color: AppTheme.textSecondary)),
                  subtitle: Text(user?.email ?? 'doctor@vitalsync.com', style: const TextStyle(fontWeight: FontWeight.bold, color: AppTheme.textPrimary)),
                ),
                const Divider(height: 1, color: AppTheme.glassBorder),
                ListTile(
                  leading: const Icon(Icons.phone_android, color: AppTheme.accentPrimary),
                  title: const Text('Mobile Contact', style: TextStyle(fontSize: 13, color: AppTheme.textSecondary)),
                  subtitle: Text(user?.mobile ?? '+1 555-0199', style: const TextStyle(fontWeight: FontWeight.bold, color: AppTheme.textPrimary)),
                ),
              ],
            ),
          ),
          const SizedBox(height: 24),

          // Logout Action Button
          ElevatedButton.icon(
            style: ElevatedButton.styleFrom(
              backgroundColor: AppTheme.danger.withValues(alpha: 0.2),
              foregroundColor: AppTheme.danger,
              side: const BorderSide(color: AppTheme.danger),
            ),
            onPressed: () async {
              await authProvider.logout();
              if (context.mounted) {
                Navigator.of(context).pushReplacementNamed('/login');
              }
            },
            icon: const Icon(Icons.logout),
            label: const Text('Logout Session'),
          ),
        ],
      ),
    );
  }
}
