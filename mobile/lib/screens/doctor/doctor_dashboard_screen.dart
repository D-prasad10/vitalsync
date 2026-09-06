import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/theme/app_theme.dart';
import '../../models/vital.dart';
import '../../providers/patient_provider.dart';
import '../../providers/telemetry_provider.dart';
import '../../widgets/sensor_graph_widget.dart';
import '../../widgets/patient_card_widget.dart';
import '../../widgets/health_score_panel_widget.dart';

class DoctorDashboardScreen extends StatefulWidget {
  const DoctorDashboardScreen({super.key});

  @override
  State<DoctorDashboardScreen> createState() => _DoctorDashboardScreenState();
}

class _DoctorDashboardScreenState extends State<DoctorDashboardScreen> {
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

    final selected = patientProvider.selectedPatient;
    final livePoints = selected != null
        ? telemetryProvider.getPatientLivePoints(selected.id, patientProvider.history)
        : <VitalPoint>[];
    final latestVital = livePoints.isNotEmpty ? livePoints.last : null;

    return Scaffold(
      body: CustomScrollView(
        slivers: [
          // App Header Bar
          SliverAppBar(
            floating: true,
            pinned: true,
            title: const Row(
              children: [
                Icon(Icons.medical_services, color: AppTheme.accentPrimary),
                SizedBox(width: 8),
                Text('Doctor Clinical Dashboard'),
              ],
            ),
            actions: [
              IconButton(
                icon: const Icon(Icons.refresh),
                onPressed: () => patientProvider.loadPatients(),
              ),
            ],
          ),

          SliverPadding(
            padding: const EdgeInsets.all(16.0),
            sliver: SliverList(
              delegate: SliverChildListDelegate([
                // Patient Search Box
                TextField(
                  onChanged: (val) => patientProvider.setSearchTerm(val),
                  decoration: const InputDecoration(
                    hintText: 'Search patient by name, room, or ID...',
                    prefixIcon: Icon(Icons.search, color: AppTheme.textSecondary),
                  ),
                ),
                const SizedBox(height: 16),

                // Patient Roster Horizontal Selector
                const Text(
                  'MY PATIENTS ROSTER',
                  style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: AppTheme.textSecondary, letterSpacing: 0.5),
                ),
                const SizedBox(height: 8),

                if (patientProvider.isLoadingPatients)
                  const Center(child: Padding(padding: EdgeInsets.all(20), child: CircularProgressIndicator()))
                else if (patientProvider.filteredPatients.isEmpty)
                  const Card(child: Padding(padding: EdgeInsets.all(16), child: Text('No patients found.')))
                else
                  SizedBox(
                    height: 140,
                    child: ListView.builder(
                      scrollDirection: Axis.horizontal,
                      itemCount: patientProvider.filteredPatients.length,
                      itemBuilder: (context, index) {
                        final p = patientProvider.filteredPatients[index];
                        final isSelected = selected?.id == p.id;
                        final pLive = telemetryProvider.getPatientLivePoints(p.id, []);
                        final pLatest = pLive.isNotEmpty ? pLive.last : null;

                        return Container(
                          width: 280,
                          margin: const EdgeInsets.only(right: 12),
                          child: PatientCardWidget(
                            patient: p,
                            latestVital: pLatest,
                            isSelected: isSelected,
                            onTap: () => patientProvider.selectPatient(p),
                          ),
                        );
                      },
                    ),
                  ),

                const SizedBox(height: 20),

                // Active Patient Detail View
                if (selected != null) ...[
                  // Patient Info Banner
                  Card(
                    child: Padding(
                      padding: const EdgeInsets.all(16.0),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            mainAxisAlignment: MainAxisAlignment.spaceBetween,
                            children: [
                              Text(
                                selected.name,
                                style: const TextStyle(fontSize: 20, fontWeight: FontWeight.bold, color: AppTheme.textPrimary),
                              ),
                              Container(
                                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                                decoration: BoxDecoration(
                                  color: AppTheme.accentPrimary.withOpacity(0.15),
                                  borderRadius: BorderRadius.circular(6),
                                  border: Border.all(color: AppTheme.accentPrimary.withOpacity(0.3)),
                                ),
                                child: Text('Room ${selected.roomNumber ?? "N/A"}', style: const TextStyle(color: AppTheme.accentPrimary, fontWeight: FontWeight.bold)),
                              ),
                            ],
                          ),
                          const SizedBox(height: 6),
                          Text(
                            'ID: PT-${selected.id} • ${selected.age ?? "--"} yrs • ${selected.gender ?? "Specified"} • Blood: ${selected.bloodGroup ?? "N/A"}',
                            style: const TextStyle(color: AppTheme.textSecondary, fontSize: 13),
                          ),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: 14),

                  // Health Score Panel
                  HealthScorePanelWidget(latestVital: latestVital),
                  const SizedBox(height: 16),

                  // Telemetry Charts
                  const Text(
                    'LIVE SENSOR TELEMETRY STREAMS',
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
                    title: 'Blood Oxygen (SpO2) History',
                    dataPoints: livePoints,
                    metricType: 'spo2',
                    color: AppTheme.accentPrimary,
                    unit: '%',
                  ),
                  const SizedBox(height: 12),

                  SensorGraphWidget(
                    title: 'Blood Pressure History',
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
              ]),
            ),
          ),
        ],
      ),
    );
  }
}
