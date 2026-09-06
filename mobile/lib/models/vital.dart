class VitalPoint {
  final int? patientId;
  final int? hr;
  final int? bpSys;
  final int? bpDia;
  final int? spo2;
  final double? temp;
  final int? healthScore;
  final int timestamp;

  VitalPoint({
    this.patientId,
    this.hr,
    this.bpSys,
    this.bpDia,
    this.spo2,
    this.temp,
    this.healthScore,
    required this.timestamp,
  });

  factory VitalPoint.fromJson(Map<String, dynamic> json) {
    final hrVal = json['hr'] ?? json['heart_rate'] ?? json['pulse'];
    final sysVal = json['bpSys'] ?? json['bp_sys'];
    final diaVal = json['bpDia'] ?? json['bp_dia'];
    final tempVal = json['temp'] ?? json['temperature'];
    final scoreVal = json['healthScore'] ?? json['health_score'];
    final tsVal = json['timestamp'] ?? DateTime.now().millisecondsSinceEpoch;

    return VitalPoint(
      patientId: json['patient_id'] ?? json['patientId'],
      hr: hrVal != null ? int.tryParse(hrVal.toString()) : null,
      bpSys: sysVal != null ? int.tryParse(sysVal.toString()) : null,
      bpDia: diaVal != null ? int.tryParse(diaVal.toString()) : null,
      spo2: json['spo2'] != null ? int.tryParse(json['spo2'].toString()) : null,
      temp: tempVal != null ? double.tryParse(tempVal.toString()) : null,
      healthScore: scoreVal != null ? int.tryParse(scoreVal.toString()) : null,
      timestamp: tsVal is int ? tsVal : (DateTime.tryParse(tsVal.toString())?.millisecondsSinceEpoch ?? DateTime.now().millisecondsSinceEpoch),
    );
  }

  String get bpDisplay {
    if (bpSys != null && bpDia != null) return '$bpSys/$bpDia';
    return '--';
  }
}
