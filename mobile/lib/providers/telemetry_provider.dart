import 'package:flutter/material.dart';
import '../models/vital.dart';
import '../models/alert.dart';
import '../services/socket_service.dart';

class TelemetryProvider extends ChangeNotifier {
  final SocketService _socketService = SocketService();
  final Map<int, List<VitalPoint>> _realtimeStream = {};
  final List<TelemetryAlert> _alerts = [];

  Map<int, List<VitalPoint>> get realtimeStream => _realtimeStream;
  List<TelemetryAlert> get alerts => _alerts;
  bool get isConnected => _socketService.isConnected;

  TelemetryProvider() {
    initTelemetry();
  }

  void initTelemetry() {
    _socketService.initSocket(
      onSensorData: (vital) {
        if (vital.patientId != null) {
          final list = _realtimeStream[vital.patientId!] ?? [];
          list.add(vital);
          if (list.length > 30) list.removeAt(0);
          _realtimeStream[vital.patientId!] = list;
          notifyListeners();
        }
      },
      onEmergencyAlert: (alert) {
        _alerts.insert(0, alert);
        if (_alerts.length > 10) _alerts.removeLast();
        notifyListeners();
      },
    );
  }

  List<VitalPoint> getPatientLivePoints(int patientId, List<VitalPoint> historyPoints) {
    final live = _realtimeStream[patientId];
    if (live != null && live.isNotEmpty) {
      final combined = List<VitalPoint>.from(historyPoints);
      for (var l in live) {
        if (!combined.any((h) => (h.timestamp - l.timestamp).abs() < 500)) {
          combined.add(l);
        }
      }
      return combined;
    }
    return historyPoints;
  }

  void dismissAlert(String id) {
    _alerts.removeWhere((a) => a.id == id);
    notifyListeners();
  }

  @override
  void dispose() {
    _socketService.dispose();
    super.dispose();
  }
}
