enum AlertSeverity { critical, warning, info, resolved }

class TelemetryAlert {
  final String id;
  final int patientId;
  final String patientName;
  final List<String> messages;
  final AlertSeverity severity;
  final int timestamp;

  TelemetryAlert({
    required this.id,
    required this.patientId,
    required this.patientName,
    required this.messages,
    required this.severity,
    required this.timestamp,
  });

  factory TelemetryAlert.fromJson(Map<String, dynamic> json) {
    final rawMessages = json['alerts'];
    List<String> msgList = [];
    if (rawMessages is List) {
      msgList = rawMessages.map((e) => e.toString()).toList();
    } else if (json['message'] != null) {
      msgList = [json['message'].toString()];
    } else {
      msgList = ['Telemetry threshold breach detected.'];
    }

    final rawSeverity = (json['severity'] ?? json['type'] ?? 'critical').toString().toLowerCase();
    AlertSeverity sev = AlertSeverity.critical;
    if (rawSeverity.contains('warn')) {
      sev = AlertSeverity.warning;
    } else if (rawSeverity.contains('info')) {
      sev = AlertSeverity.info;
    } else if (rawSeverity.contains('resolved') || rawSeverity.contains('success') || rawSeverity.contains('normal')) {
      sev = AlertSeverity.resolved;
    }

    return TelemetryAlert(
      id: json['id']?.toString() ?? '${DateTime.now().millisecondsSinceEpoch}',
      patientId: json['patient_id'] ?? json['patientId'] ?? 0,
      patientName: json['patient_name'] ?? json['patientName'] ?? 'Patient',
      messages: msgList,
      severity: sev,
      timestamp: json['timestamp'] ?? DateTime.now().millisecondsSinceEpoch,
    );
  }
}
