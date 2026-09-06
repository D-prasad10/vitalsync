import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/theme/app_theme.dart';
import '../../models/vital.dart';
import '../../providers/patient_provider.dart';
import '../../providers/telemetry_provider.dart';
import '../../widgets/patient_card_widget.dart';
import '../../widgets/alert_toast_widget.dart';

class CaretakerDashboardScreen extends StatefulWidget {
  const CaretakerDashboardScreen({super.key});

  @override
  State<CaretakerDashboardScreen> createState() => _CaretakerDashboardScreenState();
}

class _CaretakerDashboardScreenState extends State<CaretakerDashboardScreen> {
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

    return Scaffold(
      appBar: AppBar(
        title: const Row(
          children: [
            Icon(Icons.local_hospital, color: AppTheme.success),
            SizedBox(width: 8),
            Text('Caretaker Monitoring Station'),
          ],
        ),
      ),
      body: RefreshIndicator(
        onRefresh: () => patientProvider.loadPatients(),
        child: ListView(
          padding: const EdgeInsets.all(16.0),
          children: [
            // Active Emergency Alerts Notification Section
            if (telemetryProvider.alerts.isNotEmpty) ...[
              const Text(
                'LIVE SAFETY & EMERGENCY ALERTS',
                style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: AppTheme.danger, letterSpacing: 0.5),
              ),
              const SizedBox(height: 8),
              ...telemetryProvider.alerts.map(
                (alert) => AlertToastWidget(
                  alert: alert,
                  onDismiss: () => telemetryProvider.dismissAlert(alert.id),
                ),
              ),
              const SizedBox(height: 16),
            ],

            const Text(
              'ASSIGNED PATIENTS FEED',
              style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: AppTheme.textSecondary, letterSpacing: 0.5),
            ),
            const SizedBox(height: 10),

            if (patientProvider.isLoadingPatients)
              const Center(child: Padding(padding: EdgeInsets.all(24), child: CircularProgressIndicator()))
            else if (patientProvider.patients.isEmpty)
              const Card(
                child: Padding(
                  padding: EdgeInsets.all(24.0),
                  child: Center(child: Text('No assigned patients found.')),
                ),
              )
            else
              ...patientProvider.patients.map((p) {
                final livePoints = telemetryProvider.getPatientLivePoints(p.id, []);
                final latestVital = livePoints.isNotEmpty ? livePoints.last : null;
                final score = latestVital?.healthScore ?? 100;
                String status = score < 50 ? 'Critical' : (score < 80 ? 'Warning' : 'Stable');

                return Padding(
                  padding: const EdgeInsets.only(bottom: 12.0),
                  child: PatientCardWidget(
                    patient: p,
                    latestVital: latestVital,
                    status: status,
                    onTap: () {
                      patientProvider.selectPatient(p);
                      _showPatientDetailsModal(context, p, latestVital);
                    },
                  ),
                );
              }),
          ],
        ),
      ),
    );
  }

  void _showPatientDetailsModal(BuildContext context, p, VitalPoint? vital) {
    showModalBottomSheet(
      context: context,
      backgroundColor: AppTheme.bgPanelSolid,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (context) => Padding(
        padding: const EdgeInsets.all(20.0),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(p.name, style: const TextStyle(fontSize: 20, fontWeight: FontWeight.bold, color: AppTheme.textPrimary)),
            const SizedBox(height: 4),
            Text('Room ${p.roomNumber ?? "N/A"} • ID: PT-${p.id}', style: const TextStyle(color: AppTheme.textSecondary)),
            const Divider(height: 24, color: AppTheme.glassBorder),
            Text('Guardian Contact: ${p.guardianContact ?? "None listed"}', style: const TextStyle(color: AppTheme.textPrimary)),
            const SizedBox(height: 8),
            Text('Doctor: ${p.doctorName ?? "Dr. Supervisor"} (${p.doctorPhone ?? "No Direct Line"})', style: const TextStyle(color: AppTheme.accentPrimary)),
            const SizedBox(height: 20),
            Row(
              children: [
                Expanded(
                  child: ElevatedButton.icon(
                    style: ElevatedButton.styleFrom(backgroundColor: AppTheme.success),
                    onPressed: () {},
                    icon: const Icon(Icons.phone, color: Colors.black),
                    label: const Text('Call Guardian'),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: ElevatedButton.icon(
                    style: ElevatedButton.styleFrom(backgroundColor: AppTheme.accentPrimary),
                    onPressed: () {},
                    icon: const Icon(Icons.medical_services, color: Colors.black),
                    label: const Text('Call Doctor'),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
