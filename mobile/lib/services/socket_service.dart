import 'package:socket_io_client/socket_io_client.dart' as io;
import '../core/constants/api_constants.dart';
import '../models/vital.dart';
import '../models/alert.dart';

class SocketService {
  io.Socket? _socket;
  bool _isConnected = false;

  bool get isConnected => _isConnected;

  void initSocket({
    required Function(VitalPoint) onSensorData,
    required Function(TelemetryAlert) onEmergencyAlert,
  }) {
    _socket = io.io(
      ApiConstants.socketUrl,
      io.OptionBuilder()
          .setTransports(['websocket', 'polling'])
          .enableAutoConnect()
          .build(),
    );

    _socket?.onConnect((_) {
      _isConnected = true;
    });

    _socket?.onDisconnect((_) {
      _isConnected = false;
    });

    _socket?.on('sensor_data', (data) {
      if (data is Map<String, dynamic>) {
        onSensorData(VitalPoint.fromJson(data));
      }
    });

    _socket?.on('emergency_alert', (data) {
      if (data is Map<String, dynamic>) {
        onEmergencyAlert(TelemetryAlert.fromJson(data));
      }
    });

    _socket?.connect();
  }

  void dispose() {
    _socket?.disconnect();
    _socket?.dispose();
    _socket = null;
  }
}
