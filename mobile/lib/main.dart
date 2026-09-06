import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'core/theme/app_theme.dart';
import 'providers/auth_provider.dart';
import 'providers/patient_provider.dart';
import 'providers/telemetry_provider.dart';
import 'routes/app_routes.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const VitalsSyncApp());
}

class VitalsSyncApp extends StatelessWidget {
  const VitalsSyncApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MultiProvider(
      providers: [
        ChangeNotifierProvider(create: (_) => AuthProvider()),
        ChangeNotifierProvider(create: (_) => PatientProvider()),
        ChangeNotifierProvider(create: (_) => TelemetryProvider()),
      ],
      child: Consumer<AuthProvider>(
        builder: (context, authProvider, _) {
          if (authProvider.isLoading) {
            return MaterialApp(
              theme: AppTheme.darkTheme,
              home: const Scaffold(
                body: Center(child: CircularProgressIndicator()),
              ),
            );
          }

          return MaterialApp(
            title: 'VitalsSync Healthcare',
            debugShowCheckedModeBanner: false,
            theme: AppTheme.darkTheme,
            initialRoute: authProvider.isAuthenticated ? '/main' : '/login',
            routes: AppRoutes.routes,
          );
        },
      ),
    );
  }
}
