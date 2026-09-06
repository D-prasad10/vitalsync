import 'package:flutter/material.dart';
import '../screens/login/login_screen.dart';
import '../screens/doctor/doctor_dashboard_screen.dart';
import '../screens/caretaker/caretaker_dashboard_screen.dart';
import '../screens/patient/patient_dashboard_screen.dart';
import '../screens/reports/reports_screen.dart';
import '../screens/profile/profile_screen.dart';

class MainNavigationShell extends StatefulWidget {
  const MainNavigationShell({super.key});

  @override
  State<MainNavigationShell> createState() => _MainNavigationShellState();
}

class _MainNavigationShellState extends State<MainNavigationShell> {
  int _currentIndex = 0;

  final List<Widget> _screens = const [
    DoctorDashboardScreen(),
    CaretakerDashboardScreen(),
    PatientDashboardScreen(),
    ReportsScreen(),
    ProfileScreen(),
  ];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: IndexedStack(
        index: _currentIndex,
        children: _screens,
      ),
      bottomNavigationBar: BottomNavigationBar(
        currentIndex: _currentIndex,
        onTap: (index) => setState(() => _currentIndex = index),
        type: BottomNavigationBarType.fixed,
        backgroundColor: const Color(0xFF141824),
        selectedItemColor: const Color(0xFF00D2FF),
        unselectedItemColor: const Color(0xFF64748B),
        selectedFontSize: 11,
        unselectedFontSize: 11,
        items: const [
          BottomNavigationBarItem(icon: Icon(Icons.medical_services), label: 'Doctor'),
          BottomNavigationBarItem(icon: Icon(Icons.local_hospital), label: 'Caretaker'),
          BottomNavigationBarItem(icon: Icon(Icons.person), label: 'Patient'),
          BottomNavigationBarItem(icon: Icon(Icons.assessment), label: 'Reports'),
          BottomNavigationBarItem(icon: Icon(Icons.account_circle), label: 'Profile'),
        ],
      ),
    );
  }
}

class AppRoutes {
  static Map<String, WidgetBuilder> get routes => {
        '/login': (context) => const LoginScreen(),
        '/main': (context) => const MainNavigationShell(),
        '/doctor': (context) => const DoctorDashboardScreen(),
        '/caretaker': (context) => const CaretakerDashboardScreen(),
        '/patient': (context) => const PatientDashboardScreen(),
        '/reports': (context) => const ReportsScreen(),
        '/profile': (context) => const ProfileScreen(),
      };
}
