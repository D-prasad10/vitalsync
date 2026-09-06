import 'package:flutter/material.dart';
import '../core/theme/app_theme.dart';
import '../models/vital.dart';

class HealthScorePanelWidget extends StatelessWidget {
  final VitalPoint? latestVital;

  const HealthScorePanelWidget({super.key, this.latestVital});

  @override
  Widget build(BuildContext context) {
    final score = latestVital?.healthScore ?? 100;
    Color color = AppTheme.success;
    String status = 'Healthy Condition';
    String tip = 'Patient vitals remain within normal physiological bounds.';

    if (score < 50) {
      color = AppTheme.danger;
      status = 'Critical Condition';
      tip = 'Urgent medical attention required!';
    } else if (score < 80) {
      color = AppTheme.warning;
      status = 'Moderate Warning';
      tip = 'Vitals abnormal. Continuous telemetry monitoring advised.';
    }

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16.0),
        child: Row(
          children: [
            Stack(
              alignment: Alignment.center,
              children: [
                SizedBox(
                  width: 80,
                  height: 80,
                  child: CircularProgressIndicator(
                    value: score / 100.0,
                    strokeWidth: 8,
                    backgroundColor: Colors.white.withOpacity(0.08),
                    color: color,
                  ),
                ),
                Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      '$score',
                      style: TextStyle(fontSize: 22, fontWeight: FontWeight.bold, color: color),
                    ),
                    const Text(
                      'SCORE',
                      style: TextStyle(fontSize: 9, color: AppTheme.textMuted, fontWeight: FontWeight.bold),
                    ),
                  ],
                ),
              ],
            ),
            const SizedBox(width: 16),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    status,
                    style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: color),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    tip,
                    style: const TextStyle(fontSize: 12, color: AppTheme.textSecondary),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
