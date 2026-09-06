import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:intl/intl.dart';
import '../../core/theme/app_theme.dart';
import '../../providers/patient_provider.dart';
import '../../widgets/sensor_graph_widget.dart';

class ReportsScreen extends StatefulWidget {
  const ReportsScreen({super.key});

  @override
  State<ReportsScreen> createState() => _ReportsScreenState();
}

class _ReportsScreenState extends State<ReportsScreen> {
  String _timeframe = '7d'; // '24h', '3d', '7d'

  @override
  Widget build(BuildContext context) {
    final patientProvider = Provider.of<PatientProvider>(context);
    final p = patientProvider.selectedPatient ?? (patientProvider.patients.isNotEmpty ? patientProvider.patients.first : null);

    final history = patientProvider.history;

    // Filter history based on timeframe
    final now = DateTime.now().millisecondsSinceEpoch;
    int cutoff = now - (7 * 24 * 60 * 60 * 1000);
    if (_timeframe == '24h') cutoff = now - (24 * 60 * 60 * 1000);
    if (_timeframe == '3d') cutoff = now - (3 * 24 * 60 * 60 * 1000);

    final filteredHistory = history.where((pt) => pt.timestamp >= cutoff).toList();

    return Scaffold(
      appBar: AppBar(
        title: const Row(
          children: [
            Icon(Icons.assessment_outlined, color: AppTheme.accentPrimary),
            SizedBox(width: 8),
            Text('Clinical Reports Dossier'),
          ],
        ),
      ),
      body: p == null
          ? const Center(child: Text('Please select a patient to view report.'))
          : ListView(
              padding: const EdgeInsets.all(16.0),
              children: [
                // Timeframe Selector Buttons
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(8.0),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.spaceAround,
                      children: [
                        _timeframeChip('24h', '24-Hour'),
                        _timeframeChip('3d', '3-Day'),
                        _timeframeChip('7d', '7-Day (Default)'),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 16),

                // Report Header Dossier
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(16.0),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text(
                          'CLINICAL HEALTH & VITALS REPORT',
                          style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: AppTheme.accentPrimary),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          p.name,
                          style: const TextStyle(fontSize: 20, fontWeight: FontWeight.bold, color: AppTheme.textPrimary),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          'ID: PT-${p.id} • Room ${p.roomNumber ?? "N/A"} • Doctor: ${p.doctorName ?? "Dr. Assigned"}',
                          style: const TextStyle(color: AppTheme.textSecondary, fontSize: 12),
                        ),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 16),

                // 7-Day Trend Charts
                SensorGraphWidget(
                  title: 'Heart Rate Trend',
                  dataPoints: filteredHistory,
                  metricType: 'hr',
                  color: AppTheme.danger,
                  unit: 'bpm',
                  height: 200,
                ),
                const SizedBox(height: 12),

                SensorGraphWidget(
                  title: 'SpO2 Saturation Trend',
                  dataPoints: filteredHistory,
                  metricType: 'spo2',
                  color: AppTheme.accentPrimary,
                  unit: '%',
                  height: 200,
                ),
                const SizedBox(height: 12),

                SensorGraphWidget(
                  title: 'Blood Pressure Trend',
                  dataPoints: filteredHistory,
                  metricType: 'bp',
                  color: AppTheme.warning,
                  unit: 'mmHg',
                  height: 200,
                ),
                const SizedBox(height: 16),

                // Clinical Telemetry Table
                const Text(
                  '7-DAY PATIENT TELEMETRY DATA TABLE',
                  style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: AppTheme.textSecondary, letterSpacing: 0.5),
                ),
                const SizedBox(height: 8),

                Card(
                  child: SingleChildScrollView(
                    scrollDirection: Axis.horizontal,
                    child: DataTable(
                      headingRowHeight: 40,
                      dataRowMinHeight: 38,
                      dataRowMaxHeight: 44,
                      columns: const [
                        DataColumn(label: Text('Date', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 12))),
                        DataColumn(label: Text('Time', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 12))),
                        DataColumn(label: Text('HR (BPM)', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 12))),
                        DataColumn(label: Text('SpO2 (%)', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 12))),
                        DataColumn(label: Text('BP (mmHg)', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 12))),
                        DataColumn(label: Text('Temp (°F)', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 12))),
                        DataColumn(label: Text('Status', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 12))),
                      ],
                      rows: filteredHistory.reversed.map((pt) {
                        final dt = DateTime.fromMillisecondsSinceEpoch(pt.timestamp);
                        final dateStr = DateFormat('dd MMM yyyy').format(dt);
                        final timeStr = DateFormat('HH:mm:ss').format(dt);
                        final isAlert = (pt.hr != null && (pt.hr! > 100 || pt.hr! < 50)) || (pt.spo2 != null && pt.spo2! < 95);

                        return DataRow(cells: [
                          DataCell(Text(dateStr, style: const TextStyle(fontSize: 12))),
                          DataCell(Text(timeStr, style: const TextStyle(fontSize: 12, fontFamily: 'monospace'))),
                          DataCell(Text(pt.hr != null ? '${pt.hr} bpm' : '--', style: const TextStyle(fontSize: 12))),
                          DataCell(Text(pt.spo2 != null ? '${pt.spo2}%' : '--', style: const TextStyle(fontSize: 12))),
                          DataCell(Text(pt.bpDisplay, style: const TextStyle(fontSize: 12))),
                          DataCell(Text(pt.temp != null ? '${pt.temp} °F' : '--', style: const TextStyle(fontSize: 12))),
                          DataCell(
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                              decoration: BoxDecoration(
                                color: isAlert ? AppTheme.warning.withValues(alpha: 0.2) : AppTheme.success.withValues(alpha: 0.2),
                                borderRadius: BorderRadius.circular(4),
                              ),
                              child: Text(
                                isAlert ? 'Alert' : 'Normal',
                                style: TextStyle(fontSize: 10, color: isAlert ? AppTheme.warning : AppTheme.success, fontWeight: FontWeight.bold),
                              ),
                            ),
                          ),
                        ]);
                      }).toList(),
                    ),
                  ),
                ),
              ],
            ),
    );
  }

  Widget _timeframeChip(String id, String label) {
    final isSelected = _timeframe == id;
    return ChoiceChip(
      label: Text(label, style: TextStyle(color: isSelected ? Colors.black : AppTheme.textSecondary, fontSize: 12, fontWeight: isSelected ? FontWeight.bold : FontWeight.normal)),
      selected: isSelected,
      selectedColor: AppTheme.accentPrimary,
      backgroundColor: Colors.transparent,
      onSelected: (_) => setState(() => _timeframe = id),
    );
  }
}
