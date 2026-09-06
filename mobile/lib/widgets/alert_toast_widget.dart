import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../core/theme/app_theme.dart';
import '../models/alert.dart';

class AlertToastWidget extends StatelessWidget {
  final TelemetryAlert alert;
  final VoidCallback onDismiss;

  const AlertToastWidget({
    super.key,
    required this.alert,
    required this.onDismiss,
  });

  @override
  Widget build(BuildContext context) {
    Color color = AppTheme.danger;
    String label = 'CRITICAL';
    if (alert.severity == AlertSeverity.warning) {
      color = AppTheme.warning;
      label = 'WARNING';
    } else if (alert.severity == AlertSeverity.info) {
      color = AppTheme.info;
      label = 'INFO';
    } else if (alert.severity == AlertSeverity.resolved) {
      color = AppTheme.success;
      label = 'RESOLVED';
    }

    final dt = DateTime.fromMillisecondsSinceEpoch(alert.timestamp);
    final timeStr = DateFormat('HH:mm').format(dt);

    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(10),
        side: BorderSide(color: color.withValues(alpha: 0.4), width: 1),
      ),
      child: Container(
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(10),
          border: Border(left: BorderSide(color: color, width: 4)),
        ),
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Row(
                  children: [
                    Icon(
                      alert.severity == AlertSeverity.resolved
                          ? Icons.check_circle_outline
                          : Icons.warning_amber_rounded,
                      color: color,
                      size: 16,
                    ),
                    const SizedBox(width: 6),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                      decoration: BoxDecoration(
                        color: color.withValues(alpha: 0.15),
                        borderRadius: BorderRadius.circular(4),
                        border: Border.all(color: color.withValues(alpha: 0.3)),
                      ),
                      child: Text(
                        label,
                        style: TextStyle(color: color, fontSize: 10, fontWeight: FontWeight.bold),
                      ),
                    ),
                    const SizedBox(width: 6),
                    Text(
                      '• $timeStr',
                      style: const TextStyle(color: AppTheme.textMuted, fontSize: 11),
                    ),
                  ],
                ),
                IconButton(
                  icon: const Icon(Icons.close, size: 18, color: AppTheme.textSecondary),
                  onPressed: onDismiss,
                  tooltip: 'Dismiss Alert',
                  constraints: const BoxConstraints(minWidth: 40, minHeight: 40),
                  padding: const EdgeInsets.all(8),
                ),
              ],
            ),
            const SizedBox(height: 6),
            Text(
              '${alert.patientName} (PT-${alert.patientId})',
              style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13, color: AppTheme.textPrimary),
            ),
            const SizedBox(height: 2),
            ...alert.messages.map(
              (msg) => Text(
                '• $msg',
                style: const TextStyle(fontSize: 12, color: AppTheme.textSecondary),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
