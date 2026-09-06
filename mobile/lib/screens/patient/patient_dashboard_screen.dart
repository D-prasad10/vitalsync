import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/theme/app_theme.dart';
import '../../models/vital.dart';
import '../../providers/patient_provider.dart';
import '../../providers/telemetry_provider.dart';
import '../../widgets/sensor_graph_widget.dart';
import '../../widgets/health_score_panel_widget.dart';

class PatientDashboardScreen extends StatefulWidget {
  const PatientDashboardScreen({super.key});

  @override
  State<PatientDashboardScreen> createState() => _PatientDashboardScreenState();
}

class _PatientDashboardScreenState extends State<PatientDashboardScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      Provider.of<PatientProvider>(context, listen: false).loadPatients();
    });
  }

  @override
  Widget build(BuildContext context) {
    final patientProvider = Provider.of<PatientProvider>(context);
    final telemetryProvider = Provider.of<TelemetryProvider>(context);

    final p = patientProvider.selectedPatient ?? (patientProvider.patients.isNotEmpty ? patientProvider.patients.first : null);
    final livePoints = p != null
        ? telemetryProvider.getPatientLivePoints(p.id, patientProvider.history)
        : <VitalPoint>[];
    final latestVital = livePoints.isNotEmpty ? livePoints.last : null;

    return Scaffold(
      appBar: AppBar(
        title: const Row(
          children: [
            Icon(Icons.person, color: AppTheme.accentPrimary),
            SizedBox(width: 8),
            Text('Patient Vitals Portal'),
          ],
        ),
      ),
      body: p == null
          ? const Center(child: CircularProgressIndicator())
          : ListView(
              padding: const EdgeInsets.all(16.0),
              children: [
                // Profile Banner
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(16.0),
                    child: Row(
                      children: [
                        CircleAvatar(
                          radius: 26,
                          backgroundColor: AppTheme.accentPrimary,
                          child: Text(
                            p.name.isNotEmpty ? p.name[0].toUpperCase() : 'P',
                            style: const TextStyle(fontSize: 22, fontWeight: FontWeight.bold, color: Colors.black),
                          ),
                        ),
                        const SizedBox(width: 14),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(p.name, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: AppTheme.textPrimary)),
                              const SizedBox(height: 2),
                              Text('Room ${p.roomNumber ?? "N/A"} • ID: PT-${p.id} • Blood: ${p.bloodGroup ?? "N/A"}', style: const TextStyle(color: AppTheme.textSecondary, fontSize: 12)),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 14),

                // Health Score Panel
                HealthScorePanelWidget(latestVital: latestVital),
                const SizedBox(height: 16),

                // Vitals 2x2 Sensor Graphs
                const Text(
                  'HEALTH VITAL TREND GRAPHS',
                  style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: AppTheme.textSecondary, letterSpacing: 0.5),
                ),
                const SizedBox(height: 10),

                SensorGraphWidget(
                  title: 'Heart Rate History',
                  dataPoints: livePoints,
                  metricType: 'hr',
                  color: AppTheme.danger,
                  unit: 'bpm',
                ),
                const SizedBox(height: 12),

                SensorGraphWidget(
                  title: 'Blood Oxygen (SpO2) Saturation',
                  dataPoints: livePoints,
                  metricType: 'spo2',
                  color: AppTheme.accentPrimary,
                  unit: '%',
                ),
                const SizedBox(height: 12),

                SensorGraphWidget(
                  title: 'Blood Pressure Trend',
                  dataPoints: livePoints,
                  metricType: 'bp',
                  color: AppTheme.warning,
                  unit: 'mmHg',
                ),
                const SizedBox(height: 12),

                SensorGraphWidget(
                  title: 'Body Temperature History',
                  dataPoints: livePoints,
                  metricType: 'temp',
                  color: AppTheme.success,
                  unit: '°F',
                ),
              ],
            ),
    );
  }
}
