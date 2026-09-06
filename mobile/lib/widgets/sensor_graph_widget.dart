import 'package:flutter/material.dart';
import 'package:fl_chart/fl_chart.dart';
import 'package:intl/intl.dart';
import '../core/theme/app_theme.dart';
import '../models/vital.dart';

class SensorGraphWidget extends StatelessWidget {
  final String title;
  final List<VitalPoint> dataPoints;
  final String metricType; // 'hr', 'spo2', 'bp', 'temp'
  final Color color;
  final String unit;
  final double height;

  const SensorGraphWidget({
    super.key,
    required this.title,
    required this.dataPoints,
    required this.metricType,
    this.color = AppTheme.accentPrimary,
    this.unit = '',
    this.height = 180,
  });

  @override
  Widget build(BuildContext context) {
    final hasData = dataPoints.isNotEmpty;
    final latestPoint = hasData ? dataPoints.last : null;

    String displayVal = '--';
    if (latestPoint != null) {
      if (metricType == 'hr' && latestPoint.hr != null) {
        displayVal = '${latestPoint.hr} $unit';
      } else if (metricType == 'spo2' && latestPoint.spo2 != null) {
        displayVal = '${latestPoint.spo2} $unit';
      } else if (metricType == 'temp' && latestPoint.temp != null) {
        displayVal = '${latestPoint.temp} $unit';
      } else if (metricType == 'bp' && latestPoint.bpSys != null && latestPoint.bpDia != null) {
        displayVal = '${latestPoint.bpSys}/${latestPoint.bpDia} $unit';
      }
    }

    final primarySpots = _getSpots(dataPoints, metricType == 'bp' ? 'bpSys' : metricType);
    final secondarySpots = metricType == 'bp' ? _getSpots(dataPoints, 'bpDia') : <FlSpot>[];
    final hasSpots = primarySpots.isNotEmpty || secondarySpots.isNotEmpty;

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(14.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title.toUpperCase(),
                      style: const TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.bold,
                        color: AppTheme.textSecondary,
                        letterSpacing: 0.5,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      displayVal,
                      style: TextStyle(
                        fontSize: 22,
                        fontWeight: FontWeight.bold,
                        color: color,
                      ),
                    ),
                  ],
                ),
                if (hasData)
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                    decoration: BoxDecoration(
                      color: AppTheme.success.withValues(alpha: 0.15),
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: AppTheme.success.withValues(alpha: 0.3)),
                    ),
                    child: const Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(Icons.circle, color: AppTheme.success, size: 8),
                        SizedBox(width: 4),
                        Text(
                          'Live',
                          style: TextStyle(color: AppTheme.success, fontSize: 10, fontWeight: FontWeight.bold),
                        ),
                      ],
                    ),
                  ),
              ],
            ),
            const SizedBox(height: 12),
            SizedBox(
              height: height,
              child: (!hasData || !hasSpots)
                  ? const Center(
                      child: Text(
                        'No Telemetry Data Available',
                        style: TextStyle(color: AppTheme.textMuted, fontSize: 12),
                      ),
                    )
                  : LineChart(
                      LineChartData(
                        gridData: FlGridData(
                          show: true,
                          drawVerticalLine: false,
                          getDrawingHorizontalLine: (val) => FlLine(
                            color: Colors.white.withValues(alpha: 0.05),
                            strokeWidth: 1,
                          ),
                        ),
                        titlesData: FlTitlesData(
                          topTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
                          rightTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
                          bottomTitles: AxisTitles(
                            sideTitles: SideTitles(
                              showTitles: true,
                              reservedSize: 22,
                              interval: (dataPoints.length / 4).clamp(1, 100).toDouble(),
                              getTitlesWidget: (val, meta) {
                                int idx = val.toInt();
                                if (idx >= 0 && idx < dataPoints.length) {
                                  final dt = DateTime.fromMillisecondsSinceEpoch(dataPoints[idx].timestamp);
                                  return Text(
                                    DateFormat('HH:mm').format(dt),
                                    style: const TextStyle(color: AppTheme.textMuted, fontSize: 9),
                                  );
                                }
                                return const SizedBox.shrink();
                              },
                            ),
                          ),
                          leftTitles: AxisTitles(
                            sideTitles: SideTitles(
                              showTitles: true,
                              reservedSize: 28,
                              getTitlesWidget: (val, meta) => Text(
                                val.toInt().toString(),
                                style: const TextStyle(color: AppTheme.textMuted, fontSize: 9),
                              ),
                            ),
                          ),
                        ),
                        borderData: FlBorderData(show: false),
                        lineBarsData: metricType == 'bp'
                            ? [
                                LineChartBarData(
                                  spots: primarySpots,
                                  isCurved: true,
                                  color: AppTheme.warning,
                                  barWidth: 2,
                                  isStrokeCapRound: true,
                                  dotData: const FlDotData(show: false),
                                ),
                                LineChartBarData(
                                  spots: secondarySpots,
                                  isCurved: true,
                                  color: AppTheme.accentSecondary,
                                  barWidth: 2,
                                  isStrokeCapRound: true,
                                  dotData: const FlDotData(show: false),
                                ),
                              ]
                            : [
                                LineChartBarData(
                                  spots: primarySpots,
                                  isCurved: true,
                                  color: color,
                                  barWidth: 2,
                                  isStrokeCapRound: true,
                                  belowBarData: BarAreaData(
                                    show: true,
                                    color: color.withValues(alpha: 0.12),
                                  ),
                                  dotData: const FlDotData(show: false),
                                ),
                              ],
                      ),
                    ),
            ),
          ],
        ),
      ),
    );
  }

  List<FlSpot> _getSpots(List<VitalPoint> points, String type) {
    List<FlSpot> spots = [];
    for (int i = 0; i < points.length; i++) {
      double? val;
      if (type == 'hr') val = points[i].hr?.toDouble();
      if (type == 'spo2') val = points[i].spo2?.toDouble();
      if (type == 'temp') val = points[i].temp;
      if (type == 'bpSys') val = points[i].bpSys?.toDouble();
      if (type == 'bpDia') val = points[i].bpDia?.toDouble();

      if (val != null) {
        spots.add(FlSpot(i.toDouble(), val));
      }
    }
    return spots;
  }
}
