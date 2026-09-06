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
  if (!data || data.patient_id == null) return;
  const pid = String(data.patient_id);
  const existing = globalTelemetry[pid] || [];
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
  const newAlert = { ...data, id: Date.now() + Math.random() };
  alertsSnapshot = alertsSnapshot.concat(newAlert).slice(-20);
  emitAlerts();
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

export const getSocket = () => {
  if (socketRef) return socketRef;

  socketRef = io('http://localhost:5001', {
    transports: ['websocket', 'polling'],
    reconnection: true,
  });

  socketRef.on('sensor_data', handleSensorData);
  socketRef.on('emergency_alert', handleEmergencyAlert);

  return socketRef;
};

export const initTelemetrySocket = (socket) => {
  if (socketRef) return socketRef;
  if (socket) {
    socketRef = socket;
    socketRef.on('sensor_data', handleSensorData);
    socketRef.on('emergency_alert', handleEmergencyAlert);
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
  }, []);

  const dismissAll = useCallback(() => {
    alertsSnapshot = [];
    emitAlerts();
  }, []);

  return { alerts, dismissAlert, dismissAll };
};
