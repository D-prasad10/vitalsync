import 'package:flutter/material.dart';
import '../core/theme/app_theme.dart';
import '../models/patient.dart';
import '../models/vital.dart';

class PatientCardWidget extends StatelessWidget {
  final Patient patient;
  final VitalPoint? latestVital;
  final String status;
  final bool isSelected;
  final VoidCallback onTap;

  const PatientCardWidget({
    super.key,
    required this.patient,
    this.latestVital,
    this.status = 'Stable',
    this.isSelected = false,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    Color statusColor = AppTheme.success;
    if (status == 'Critical') statusColor = AppTheme.danger;
    if (status == 'Warning') statusColor = AppTheme.warning;

    return Card(
      color: isSelected ? AppTheme.accentPrimary.withValues(alpha: 0.08) : AppTheme.bgPanelSolid,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
        side: BorderSide(
          color: isSelected ? AppTheme.accentPrimary : statusColor.withValues(alpha: 0.4),
          width: isSelected ? 1.5 : 1,
        ),
      ),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Padding(
          padding: const EdgeInsets.all(14.0),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Header Row
              Row(
                children: [
                  CircleAvatar(
                    radius: 20,
                    backgroundColor: AppTheme.accentSecondary,
                    child: Text(
                      patient.name.trim().isNotEmpty
                          ? patient.name.trim().split(RegExp(r'\s+')).where((e) => e.isNotEmpty).map((e) => e[0]).take(2).join().toUpperCase()
                          : 'PT',
                      style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 13),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          patient.name,
                          style: TextStyle(
                            fontSize: 15,
                            fontWeight: FontWeight.bold,
                            color: isSelected ? AppTheme.accentPrimary : AppTheme.textPrimary,
                          ),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                        const SizedBox(height: 2),
                        Text(
                          'Room ${patient.roomNumber ?? "N/A"} • ${patient.age ?? "--"} yrs • ${patient.bloodGroup ?? "N/A"}',
                          style: const TextStyle(fontSize: 12, color: AppTheme.textSecondary),
                        ),
                      ],
                    ),
                  ),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                    decoration: BoxDecoration(
                      color: statusColor.withValues(alpha: 0.15),
                      borderRadius: BorderRadius.circular(6),
                      border: Border.all(color: statusColor.withValues(alpha: 0.3)),
                    ),
                    child: Text(
                      status,
                      style: TextStyle(color: statusColor, fontSize: 11, fontWeight: FontWeight.bold),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),

              // Mini Vitals Grid
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceAround,
                children: [
                  _miniVital(Icons.favorite, AppTheme.danger, '${latestVital?.hr ?? "--"} BPM'),
                  _miniVital(Icons.air, AppTheme.accentPrimary, '${latestVital?.spo2 ?? "--"}%'),
                  _miniVital(Icons.thermostat, AppTheme.success, '${latestVital?.temp ?? "--"}°F'),
                  _miniVital(Icons.speed, AppTheme.warning, latestVital?.bpDisplay ?? '--'),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _miniVital(IconData icon, Color color, String value) {
    return Row(
      children: [
        Icon(icon, color: color, size: 14),
        const SizedBox(width: 4),
        Text(
          value,
          style: const TextStyle(color: AppTheme.textPrimary, fontSize: 11, fontWeight: FontWeight.w600),
        ),
      ],
    );
  }
}
