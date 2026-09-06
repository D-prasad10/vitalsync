import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:vitalsync/core/theme/app_theme.dart';
import 'package:vitalsync/models/alert.dart';
import 'package:vitalsync/models/patient.dart';
import 'package:vitalsync/providers/auth_provider.dart';
import 'package:vitalsync/providers/patient_provider.dart';
import 'package:vitalsync/providers/telemetry_provider.dart';
import 'package:vitalsync/routes/app_routes.dart';
import 'package:vitalsync/screens/login/login_screen.dart';
import 'package:vitalsync/screens/doctor/doctor_dashboard_screen.dart';
import 'package:vitalsync/screens/caretaker/caretaker_dashboard_screen.dart';
import 'package:vitalsync/screens/patient/patient_dashboard_screen.dart';
import 'package:vitalsync/screens/reports/reports_screen.dart';
import 'package:vitalsync/screens/profile/profile_screen.dart';
import 'package:vitalsync/widgets/alert_toast_widget.dart';
import 'package:vitalsync/widgets/sensor_graph_widget.dart';
import 'package:vitalsync/widgets/health_score_panel_widget.dart';

Widget createTestApp({Widget? child}) {
  return MultiProvider(
    providers: [
      ChangeNotifierProvider(create: (_) => AuthProvider(autoInit: false)),
      ChangeNotifierProvider(create: (_) => PatientProvider()),
      ChangeNotifierProvider(create: (_) => TelemetryProvider(autoInit: false)),
    ],
    child: MaterialApp(
      theme: AppTheme.darkTheme,
      routes: AppRoutes.routes,
      home: child ?? const MainNavigationShell(),
    ),
  );
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('Flutter Mobile App Screen-by-Screen Visual & Flow Tests', () {
    testWidgets('1. Login Screen renders with role selectors, inputs and actions', (tester) async {
      final authProvider = AuthProvider(autoInit: false);

      await tester.pumpWidget(
        ChangeNotifierProvider.value(
          value: authProvider,
          child: MaterialApp(
            theme: AppTheme.darkTheme,
            home: const LoginScreen(),
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('VitalsSync'), findsOneWidget);
      expect(find.text('Real-Time Healthcare Telemetry Portal'), findsOneWidget);
      expect(find.text('Caretaker'), findsOneWidget);
      expect(find.text('Doctor'), findsOneWidget);
      expect(find.text('Send Verification OTP'), findsOneWidget);

      // Tap Doctor role selector
      await tester.tap(find.text('Doctor'));
      await tester.pumpAndSettle();
      expect(find.text('Doctor'), findsOneWidget);
    });

    testWidgets('2. MainNavigationShell & Bottom Navigation between all 5 screens', (tester) async {
      final patientProvider = PatientProvider();
      final mockPatient = Patient(
        id: 101,
        name: 'Eleanor Vance',
        age: 58,
        gender: 'Female',
        roomNumber: 'ICU-3',
        bloodGroup: 'O+',
        doctorName: 'Dr. Ashish Patra',
      );
      patientProvider.selectPatient(mockPatient);

      await tester.pumpWidget(
        MultiProvider(
          providers: [
            ChangeNotifierProvider(create: (_) => AuthProvider(autoInit: false)),
            ChangeNotifierProvider.value(value: patientProvider),
            ChangeNotifierProvider(create: (_) => TelemetryProvider(autoInit: false)),
          ],
          child: MaterialApp(
            theme: AppTheme.darkTheme,
            routes: AppRoutes.routes,
            home: const MainNavigationShell(),
          ),
        ),
      );
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 200));

      // Starts at Doctor tab (index 0)
      expect(find.byType(DoctorDashboardScreen), findsOneWidget);

      // Tap Caretaker tab (index 1)
      await tester.tap(find.text('Caretaker'));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 200));
      expect(find.byType(CaretakerDashboardScreen), findsOneWidget);

      // Tap Patient tab (index 2)
      await tester.tap(find.text('Patient'));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 200));
      expect(find.byType(PatientDashboardScreen), findsOneWidget);

      // Tap Reports tab (index 3)
      await tester.tap(find.text('Reports'));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 200));
      expect(find.byType(ReportsScreen), findsOneWidget);

      // Tap Profile tab (index 4)
      await tester.tap(find.text('Profile'));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 200));
      expect(find.byType(ProfileScreen), findsOneWidget);

      // Tap back to Doctor tab (index 0)
      await tester.tap(find.text('Doctor'));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 200));
      expect(find.byType(DoctorDashboardScreen), findsOneWidget);
    });

    testWidgets('3. Doctor Dashboard search, patient selection, health score and charts', (tester) async {
      tester.view.physicalSize = const Size(1200, 3200);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.resetPhysicalSize);

      final patientProvider = PatientProvider();
      final telemetryProvider = TelemetryProvider(autoInit: false);

      // Seed mock clinical patient for testing
      final mockPatient = Patient(
        id: 101,
        name: 'Eleanor Vance',
        age: 58,
        gender: 'Female',
        roomNumber: 'ICU-3',
        bloodGroup: 'O+',
        doctorName: 'Dr. Ashish Patra',
      );
      patientProvider.selectPatient(mockPatient);

      await tester.pumpWidget(
        MultiProvider(
          providers: [
            ChangeNotifierProvider.value(value: patientProvider),
            ChangeNotifierProvider.value(value: telemetryProvider),
          ],
          child: MaterialApp(
            theme: AppTheme.darkTheme,
            home: const DoctorDashboardScreen(),
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('Doctor Clinical Dashboard'), findsOneWidget);
      expect(find.byType(TextField), findsOneWidget);
      expect(find.text('Eleanor Vance'), findsOneWidget);
      expect(find.text('Room ICU-3'), findsOneWidget);
      expect(find.byType(HealthScorePanelWidget), findsOneWidget);
      expect(find.byType(SensorGraphWidget), findsWidgets);

      // Test Search box input
      await tester.enterText(find.byType(TextField), 'Eleanor');
      await tester.pumpAndSettle();
      expect(patientProvider.searchTerm, 'Eleanor');
    });

    testWidgets('4. Caretaker Dashboard renders assigned feed and emergency alerts', (tester) async {
      final patientProvider = PatientProvider();
      final telemetryProvider = TelemetryProvider(autoInit: false);

      await tester.pumpWidget(
        MultiProvider(
          providers: [
            ChangeNotifierProvider.value(value: patientProvider),
            ChangeNotifierProvider.value(value: telemetryProvider),
          ],
          child: MaterialApp(
            theme: AppTheme.darkTheme,
            home: const CaretakerDashboardScreen(),
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('Caretaker Monitoring Station'), findsOneWidget);
      expect(find.text('ASSIGNED PATIENTS FEED'), findsOneWidget);
    });

    testWidgets('5. Emergency Alert Notification UI renders and dismisses correctly', (tester) async {
      final alert = TelemetryAlert(
        id: 'alt-99',
        patientId: 101,
        patientName: 'Eleanor Vance',
        messages: const ['SpO2 critically low (85%)'],
        severity: AlertSeverity.critical,
        timestamp: DateTime.now().millisecondsSinceEpoch,
      );

      bool dismissed = false;

      await tester.pumpWidget(
        MaterialApp(
          theme: AppTheme.darkTheme,
          home: Scaffold(
            body: AlertToastWidget(
              alert: alert,
              onDismiss: () => dismissed = true,
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('CRITICAL'), findsOneWidget);
      expect(find.text('Eleanor Vance (PT-101)'), findsOneWidget);
      expect(find.text('• SpO2 critically low (85%)'), findsOneWidget);

      // Test dismiss button
      await tester.tap(find.byIcon(Icons.close));
      await tester.pumpAndSettle();
      expect(dismissed, isTrue);
    });

    testWidgets('6. Reports Screen renders timeframe chips and clinical trend charts', (tester) async {
      tester.view.physicalSize = const Size(1200, 3200);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.resetPhysicalSize);

      final patientProvider = PatientProvider();
      final mockPatient = Patient(
        id: 102,
        name: 'Arthur Pendelton',
        age: 64,
        gender: 'Male',
        roomNumber: 'Ward-B',
        bloodGroup: 'A+',
        doctorName: 'Dr. Ashish Patra',
      );
      patientProvider.selectPatient(mockPatient);

      await tester.pumpWidget(
        MultiProvider(
          providers: [
            ChangeNotifierProvider.value(value: patientProvider),
          ],
          child: MaterialApp(
            theme: AppTheme.darkTheme,
            home: const ReportsScreen(),
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('Clinical Reports Dossier'), findsOneWidget);
      expect(find.text('Arthur Pendelton'), findsOneWidget);
      expect(find.text('24-Hour'), findsOneWidget);
      expect(find.text('3-Day'), findsOneWidget);
      expect(find.text('7-Day (Default)'), findsOneWidget);

      // Tap 24h filter chip
      await tester.tap(find.text('24-Hour'));
      await tester.pumpAndSettle();

      expect(find.byType(SensorGraphWidget), findsWidgets);
    });

    testWidgets('7. Profile Screen displays user credentials and logout button', (tester) async {
      final authProvider = AuthProvider();

      await tester.pumpWidget(
        MultiProvider(
          providers: [
            ChangeNotifierProvider.value(value: authProvider),
          ],
          child: MaterialApp(
            theme: AppTheme.darkTheme,
            home: const ProfileScreen(),
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('User Profile & Hospital Roster'), findsOneWidget);
      expect(find.text('Staff ID'), findsOneWidget);
      expect(find.text('Email Address'), findsOneWidget);
      expect(find.text('Mobile Contact'), findsOneWidget);
      expect(find.text('Logout Session'), findsOneWidget);
    });

    testWidgets('8. Stress navigation test rapid tab switching 20+ times', (tester) async {
      final patientProvider = PatientProvider();
      final mockPatient = Patient(
        id: 101,
        name: 'Eleanor Vance',
        age: 58,
        gender: 'Female',
        roomNumber: 'ICU-3',
        bloodGroup: 'O+',
        doctorName: 'Dr. Ashish Patra',
      );
      patientProvider.selectPatient(mockPatient);

      await tester.pumpWidget(
        MultiProvider(
          providers: [
            ChangeNotifierProvider(create: (_) => AuthProvider(autoInit: false)),
            ChangeNotifierProvider.value(value: patientProvider),
            ChangeNotifierProvider(create: (_) => TelemetryProvider(autoInit: false)),
          ],
          child: MaterialApp(
            theme: AppTheme.darkTheme,
            routes: AppRoutes.routes,
            home: const MainNavigationShell(),
          ),
        ),
      );
      await tester.pump();

      // Sequence 1: Doctor -> Caretaker -> Patient -> Reports -> Profile -> Doctor (35 complete cycles = 175 tab switches)
      final allTabs = ['Caretaker', 'Patient', 'Reports', 'Profile', 'Doctor'];
      for (int cycle = 0; cycle < 35; cycle++) {
        for (final tab in allTabs) {
          await tester.tap(find.text(tab));
          await tester.pump(const Duration(milliseconds: 15));
        }
      }

      // Settle on Doctor tab and verify no corruption or crashes
      await tester.pump(const Duration(milliseconds: 100));
      expect(find.byType(DoctorDashboardScreen), findsOneWidget);
      expect(find.text('Eleanor Vance'), findsOneWidget);
    });

    testWidgets('9. Multiple Emergency Alerts render safely without blocking controls and dismiss reliably', (tester) async {
      final alerts = [
        TelemetryAlert(
          id: 'alt-1',
          patientId: 101,
          patientName: 'Eleanor Vance',
          messages: const ['SpO2 low (88%)'],
          severity: AlertSeverity.critical,
          timestamp: DateTime.now().millisecondsSinceEpoch,
        ),
        TelemetryAlert(
          id: 'alt-2',
          patientId: 102,
          patientName: 'Arthur Pendelton',
          messages: const ['Heart Rate Elevated (128 bpm)'],
          severity: AlertSeverity.warning,
          timestamp: DateTime.now().millisecondsSinceEpoch - 60000,
        ),
      ];

      final dismissed = <String>[];

      await tester.pumpWidget(
        MaterialApp(
          theme: AppTheme.darkTheme,
          home: Scaffold(
            body: ListView(
              children: [
                ...alerts.map(
                  (a) => AlertToastWidget(
                    alert: a,
                    onDismiss: () => dismissed.add(a.id),
                  ),
                ),
                ElevatedButton(
                  onPressed: () {},
                  child: const Text('Dashboard Action Button'),
                ),
              ],
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('CRITICAL'), findsOneWidget);
      expect(find.text('WARNING'), findsOneWidget);
      expect(find.text('Dashboard Action Button'), findsOneWidget);

      // Dismiss first alert
      await tester.tap(find.byType(IconButton).first);
      await tester.pumpAndSettle();
      expect(dismissed, contains('alt-1'));
    });
  });
}
