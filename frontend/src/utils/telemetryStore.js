import { useSyncExternalStore, useCallback } from 'react';
import { io } from 'socket.io-client';

const MAX_POINTS = 30;
const TELEMETRY_NOTIFY_MS = 500;

let socketRef = null;
let globalTelemetry = {};
const globalListeners = new Set();
const patientListeners = new Map(); // patientId -> Set of callbacks

let telemetryNotifyTimer = null;
const pendingChangedPatients = new Set();

let alertsSnapshot = [];
const alertListeners = new Set();

const getGlobalSnapshot = () => globalTelemetry;
const getAlertsSnapshot = () => alertsSnapshot;

const subscribeGlobal = (onChange) => {
  globalListeners.add(onChange);
  return () => globalListeners.delete(onChange);
};

const subscribePatient = (patientId, onChange) => {
  if (!patientId) return () => {};
  const pidStr = String(patientId);
  if (!patientListeners.has(pidStr)) {
    patientListeners.set(pidStr, new Set());
  }
  const set = patientListeners.get(pidStr);
  set.add(onChange);

  return () => {
    set.delete(onChange);
    if (set.size === 0) {
      patientListeners.delete(pidStr);
    }
  };
};

const subscribeAlerts = (onChange) => {
  alertListeners.add(onChange);
  return () => alertListeners.delete(onChange);
};

const flushTelemetry = () => {
  telemetryNotifyTimer = null;
  const pidsToNotify = new Set(pendingChangedPatients);
  pendingChangedPatients.clear();

  // Synchronously notify global subscribers
  globalListeners.forEach((fn) => fn());

  // Synchronously notify specific patient subscribers
  pidsToNotify.forEach((pidStr) => {
    const listeners = patientListeners.get(pidStr);
    if (listeners) {
      listeners.forEach((fn) => fn());
    }
  });
};

const handleSensorData = (data) => {
  if (!data) return;
  const pidRaw = data.patient_id ?? data.patientId;
  if (pidRaw == null) return;
  const pid = String(pidRaw);
  const existing = globalTelemetry[pid] || [];

  // Deduplicate consecutive identical packets (e.g. if server emits both sensor_data and telemetry_update)
  const last = existing[existing.length - 1];
  if (last && data.timestamp && last.timestamp === data.timestamp) {
    return;
  }

  const nextSeries = existing.length >= MAX_POINTS
    ? existing.slice(existing.length - MAX_POINTS + 1).concat(data)
    : existing.concat(data);

  globalTelemetry = { ...globalTelemetry, [pid]: nextSeries };
  pendingChangedPatients.add(pid);

  if (!telemetryNotifyTimer) {
    telemetryNotifyTimer = setTimeout(flushTelemetry, TELEMETRY_NOTIFY_MS);
  }
};

const emitAlerts = () => {
  alertListeners.forEach((fn) => fn());
};

const handleEmergencyAlert = (data) => {
  if (!data) return;
  const alertId = data.id || `alert-${data.patient_id || data.patientId || 'sys'}-${Date.now()}`;
  // Avoid duplicate identical alerts
  if (alertsSnapshot.some(a => a.id === alertId)) return;
  const newAlert = { ...data, id: alertId };
  alertsSnapshot = alertsSnapshot.concat(newAlert).slice(-20);
  emitAlerts();
};

const handleActiveAlerts = (alertsList) => {
  if (Array.isArray(alertsList)) {
    // Preserve any active alerts that may have arrived via real-time socket
    const alertMap = new Map();
    alertsList.forEach(a => {
      if (a && a.id && a.status !== 'dismissed') alertMap.set(a.id, a);
    });
    alertsSnapshot.forEach(a => {
      if (a && a.id && a.status !== 'dismissed' && !alertMap.has(a.id)) {
        alertMap.set(a.id, a);
      }
    });
    alertsSnapshot = Array.from(alertMap.values()).slice(-20);
    emitAlerts();
  }
};

// Initial fetch of active alerts from REST endpoint
export const fetchActiveAlerts = () => {
  fetch('http://localhost:5001/api/alerts')
    .then(res => res.json())
    .then(data => {
      if (Array.isArray(data)) {
        handleActiveAlerts(data);
      }
    })
    .catch(() => {});
};

export const pushTestAlert = (alertData) => {
  handleEmergencyAlert(alertData || {
    patient_id: 1,
    patient_name: 'Eleanor Vance',
    severity: 'critical',
    message: 'SpO2 critically low (86%) - immediate attention needed'
  });
};

if (typeof window !== 'undefined') {
  window.pushTestAlert = pushTestAlert;
}

export const seedPatientTelemetry = (patientId, points) => {
  if (!patientId || !Array.isArray(points) || points.length === 0) return;
  const pid = String(patientId);
  const existing = globalTelemetry[pid] || [];

  // Deduplicate and merge history points with any existing live points by timestamp
  const pointMap = new Map();
  points.forEach((pt) => {
    if (pt && pt.timestamp) {
      pointMap.set(pt.timestamp, pt);
    }
  });
  existing.forEach((pt) => {
    if (pt && pt.timestamp) {
      pointMap.set(pt.timestamp, pt);
    }
  });

  const merged = Array.from(pointMap.values())
    .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0))
    .slice(-MAX_POINTS);

  globalTelemetry = { ...globalTelemetry, [pid]: merged };
  pendingChangedPatients.add(pid);
  flushTelemetry();
};

// ── Active Emergency & Ambulance Fleet Reactive Stores ─────────────────────────
let activeEmergencySnapshot = null;
const emergencyListeners = new Set();

let ambulanceFleetSnapshot = [];
const ambulanceListeners = new Set();

const getEmergencySnapshot = () => activeEmergencySnapshot;
const getAmbulanceSnapshot = () => ambulanceFleetSnapshot;

const subscribeEmergency = (onChange) => {
  emergencyListeners.add(onChange);
  return () => emergencyListeners.delete(onChange);
};

const subscribeAmbulance = (onChange) => {
  ambulanceListeners.add(onChange);
  return () => ambulanceListeners.delete(onChange);
};

const emitEmergency = () => {
  emergencyListeners.forEach((fn) => fn());
};

const emitAmbulances = () => {
  ambulanceListeners.forEach((fn) => fn());
};

export const fetchActiveEmergency = () => {
  fetch('http://localhost:5001/api/emergencies/active')
    .then((res) => res.json())
    .then((data) => {
      activeEmergencySnapshot = data || null;
      emitEmergency();
    })
    .catch(() => {});
};

export const fetchAmbulanceFleet = () => {
  fetch('http://localhost:5001/api/ambulances')
    .then((res) => res.json())
    .then((data) => {
      if (Array.isArray(data)) {
        ambulanceFleetSnapshot = data;
        emitAmbulances();
      }
    })
    .catch(() => {});
};

const handleEmergencyUpdate = (data) => {
  if (!data) return;
  activeEmergencySnapshot = {
    ...(activeEmergencySnapshot || {}),
    ...data,
    patientId: data.patient_id ?? data.patientId,
    patientName: data.patient_name ?? data.patientName,
    emergencyType: data.emergency_type ?? data.emergencyType,
    ambulanceId: data.ambulance_id ?? data.ambulanceId,
    currentDistance: data.current_distance ?? data.currentDistance,
    estimatedEta: data.estimated_eta_minutes ?? data.estimatedEta,
    gpsFix: Boolean(data.gps_fix ?? data.gpsFix),
    gpsSat: data.gps_sat ?? data.gpsSat ?? 0
  };
  emitEmergency();
  fetchAmbulanceFleet();

  // Synchronize with active alerts panel
  if (data.id && data.status && data.status !== 'COMPLETED' && data.status !== 'CANCELLED') {
    const alertId = `alert-emg-${data.id}`;
    if (!alertsSnapshot.some(a => a.id === alertId)) {
      const typeStr = (data.emergencyType || data.emergency_type || 'SOS').toUpperCase();
      const pName = data.patientName || data.patient_name || 'Patient';
      const ambStr = data.ambulanceId || data.ambulance_id ? ` — Unit ${data.ambulanceId || data.ambulance_id} Dispatched` : '';
      const alertMsg = `EMERGENCY [${typeStr}]: ${pName}${ambStr}`;
      handleEmergencyAlert({
        id: alertId,
        patient_id: data.patientId || data.patient_id,
        patient_name: pName,
        severity: 'critical',
        message: alertMsg,
        alerts: [alertMsg],
        timestamp: data.timestamp || Date.now(),
        status: 'active'
      });
    }
  } else if (data.status === 'COMPLETED' || data.status === 'CANCELLED') {
    const alertId = `alert-emg-${data.id}`;
    if (alertsSnapshot.some(a => a.id === alertId)) {
      alertsSnapshot = alertsSnapshot.filter(a => a.id !== alertId);
      emitAlerts();
    }
  }
};

const handleAmbulanceLocation = (data) => {
  if (!data || !data.ambulanceId) return;
  ambulanceFleetSnapshot = ambulanceFleetSnapshot.map((a) =>
    a.id === data.ambulanceId || a.ambulanceId === data.ambulanceId
      ? { ...a, ...data, latitude: data.latitude, longitude: data.longitude }
      : a
  );
  emitAmbulances();

  if (activeEmergencySnapshot && (activeEmergencySnapshot.ambulanceId === data.ambulanceId || activeEmergencySnapshot.ambulance_id === data.ambulanceId)) {
    activeEmergencySnapshot = {
      ...activeEmergencySnapshot,
      ambulance_lat: data.latitude,
      ambulance_lng: data.longitude,
      current_distance: data.distance ?? activeEmergencySnapshot.current_distance,
      currentDistance: data.distance ?? activeEmergencySnapshot.currentDistance,
      estimated_eta_minutes: data.eta ?? activeEmergencySnapshot.estimated_eta_minutes,
      estimatedEta: data.eta ?? activeEmergencySnapshot.estimatedEta,
      progress: data.progress ?? activeEmergencySnapshot.progress
    };
    emitEmergency();
  }
};

const handleAmbulanceStatus = (data) => {
  if (!data) return;
  if (data.reset) {
    fetchAmbulanceFleet();
    fetchActiveEmergency();
    return;
  }
  if (data.ambulanceId) {
    ambulanceFleetSnapshot = ambulanceFleetSnapshot.map((a) =>
      a.id === data.ambulanceId || a.ambulanceId === data.ambulanceId
        ? { ...a, status: data.status, assigned_patient_id: data.assignedPatientId, assigned_emergency_id: data.assignedEmergencyId }
        : a
    );
    emitAmbulances();
  }
};

const handlePatientLocation = (data) => {
  if (!data || !data.patientId) return;
  if (activeEmergencySnapshot && String(activeEmergencySnapshot.patientId || activeEmergencySnapshot.patient_id) === String(data.patientId)) {
    activeEmergencySnapshot = {
      ...activeEmergencySnapshot,
      latitude: data.latitude,
      longitude: data.longitude,
      gpsFix: Boolean(data.gpsFix),
      gps_fix: data.gpsFix ? 1 : 0,
      gpsSat: data.gpsSat,
      gps_sat: data.gpsSat
    };
    emitEmergency();
  }
};

export const getSocket = () => {
  if (socketRef) return socketRef;

  socketRef = io('http://localhost:5001', {
    transports: ['websocket', 'polling'],
    reconnection: true,
  });

  socketRef.on('sensor_data', handleSensorData);
  socketRef.on('telemetry_update', handleSensorData);
  socketRef.on('emergency_alert', handleEmergencyAlert);
  socketRef.on('patient_alert', handleEmergencyAlert);
  socketRef.on('active_alerts', handleActiveAlerts);

  // Emergency Response & Ambulance events
  socketRef.on('emergency:created', handleEmergencyUpdate);
  socketRef.on('emergency:updated', handleEmergencyUpdate);
  socketRef.on('emergency:active', handleEmergencyUpdate);
  socketRef.on('ambulance:location', handleAmbulanceLocation);
  socketRef.on('ambulance:status', handleAmbulanceStatus);
  socketRef.on('patient:location', handlePatientLocation);

  socketRef.on('connect', () => {
    fetchActiveAlerts();
    fetchActiveEmergency();
    fetchAmbulanceFleet();
  });

  fetchActiveAlerts();
  fetchActiveEmergency();
  fetchAmbulanceFleet();

  return socketRef;
};

export const initTelemetrySocket = (socket) => {
  if (socketRef) return socketRef;
  if (socket) {
    socketRef = socket;
    socketRef.on('sensor_data', handleSensorData);
    socketRef.on('telemetry_update', handleSensorData);
    socketRef.on('emergency_alert', handleEmergencyAlert);
    socketRef.on('patient_alert', handleEmergencyAlert);
    socketRef.on('active_alerts', handleActiveAlerts);
    socketRef.on('emergency:created', handleEmergencyUpdate);
    socketRef.on('emergency:updated', handleEmergencyUpdate);
    socketRef.on('emergency:active', handleEmergencyUpdate);
    socketRef.on('ambulance:location', handleAmbulanceLocation);
    socketRef.on('ambulance:status', handleAmbulanceStatus);
    socketRef.on('patient:location', handlePatientLocation);
    fetchActiveAlerts();
    fetchActiveEmergency();
    fetchAmbulanceFleet();
    return socketRef;
  }
  return getSocket();
};

export const useRealtimeData = () => {
  return useSyncExternalStore(subscribeGlobal, getGlobalSnapshot, getGlobalSnapshot);
};

export const usePatientTelemetry = (patientId) => {
  const pidStr = patientId ? String(patientId) : null;
  const getSnapshot = useCallback(() => {
    return pidStr ? (globalTelemetry[pidStr] || []) : [];
  }, [pidStr]);

  const subscribe = useCallback((onChange) => {
    return subscribePatient(pidStr, onChange);
  }, [pidStr]);

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
};

export const useEmergencyAlerts = () => {
  const alerts = useSyncExternalStore(subscribeAlerts, getAlertsSnapshot, getAlertsSnapshot);

  const dismissAlert = useCallback((id) => {
    alertsSnapshot = alertsSnapshot.filter((a) => a.id !== id);
    emitAlerts();
    fetch(`http://localhost:5001/api/alerts/${id}/dismiss`, { method: 'POST' }).catch(() => {});
  }, []);

  const dismissAll = useCallback(() => {
    alertsSnapshot = [];
    emitAlerts();
    fetch('http://localhost:5001/api/alerts/clear', { method: 'POST' }).catch(() => {});
  }, []);

  return { alerts, dismissAlert, dismissAll };
};

export const useEmergencyResponse = () => {
  const activeEmergency = useSyncExternalStore(subscribeEmergency, getEmergencySnapshot, getEmergencySnapshot);

  const triggerEmergency = useCallback(async (payload) => {
    try {
      const res = await fetch('http://localhost:5001/api/emergencies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data.success && data.emergency) {
        handleEmergencyUpdate(data.emergency);
      }
      return data;
    } catch (err) {
      console.error('Failed to trigger emergency:', err);
      return { error: err.message };
    }
  }, []);

  const updateEmergencyStatus = useCallback(async (emergencyId, status, notes) => {
    try {
      const res = await fetch(`http://localhost:5001/api/emergencies/${emergencyId}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, notes })
      });
      const data = await res.json();
      if (data.success && data.emergency) {
        handleEmergencyUpdate(data.emergency);
      }
      return data;
    } catch (err) {
      console.error('Failed to update emergency status:', err);
      return { error: err.message };
    }
  }, []);

  return {
    activeEmergency,
    triggerEmergency,
    updateEmergencyStatus,
    refreshEmergency: fetchActiveEmergency
  };
};

export const useAmbulanceFleet = () => {
  const ambulances = useSyncExternalStore(subscribeAmbulance, getAmbulanceSnapshot, getAmbulanceSnapshot);

  const dispatchAmbulance = useCallback(async (ambulanceId, emergencyId) => {
    try {
      const res = await fetch(`http://localhost:5001/api/ambulances/${ambulanceId}/dispatch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emergencyId })
      });
      const data = await res.json();
      fetchAmbulanceFleet();
      fetchActiveEmergency();
      return data;
    } catch (err) {
      console.error('Failed to dispatch ambulance:', err);
      return { error: err.message };
    }
  }, []);

  return {
    ambulances,
    dispatchAmbulance,
    refreshAmbulances: fetchAmbulanceFleet
  };
};
