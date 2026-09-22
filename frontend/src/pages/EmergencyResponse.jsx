import { useState, useEffect, useRef, useMemo } from 'react';
import {
  Ambulance, AlertOctagon, MapPin, Navigation, Compass,
  Radio, Play, Pause, RotateCcw, CheckCircle2,
  Phone, User, ShieldAlert, WifiOff, Clock, Gauge
} from 'lucide-react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  useEmergencyResponse,
  useAmbulanceFleet,
  getSocket
} from '../utils/telemetryStore';

// Fix Leaflet's default icon path issues in Vite bundling
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

// Custom Patient DivIcon (Pulsing Red Marker)
const createPatientIcon = () => {
  return L.divIcon({
    className: 'custom-patient-marker-container',
    html: `
      <div class="patient-gps-marker">
        <div class="patient-gps-pulse"></div>
        <div class="patient-gps-core">🔴</div>
      </div>
    `,
    iconSize: [36, 36],
    iconAnchor: [18, 18],
    popupAnchor: [0, -18]
  });
};

// Custom Ambulance DivIcon (Emergency Vehicle Marker)
const createAmbulanceIcon = (status) => {
  const isEnRoute = status === 'EN_ROUTE';
  return L.divIcon({
    className: 'custom-ambulance-marker-container',
    html: `
      <div class="ambulance-gps-marker ${isEnRoute ? 'siren-active' : ''}">
        <div class="ambulance-gps-badge">🚑</div>
        <div class="ambulance-gps-beam"></div>
      </div>
    `,
    iconSize: [42, 42],
    iconAnchor: [21, 21],
    popupAnchor: [0, -20]
  });
};

const EmergencyResponse = () => {
  const { activeEmergency, triggerEmergency, updateEmergencyStatus } = useEmergencyResponse();
  const { ambulances, dispatchAmbulance, refreshAmbulances } = useAmbulanceFleet();

  const [patients, setPatients] = useState([]);
  const [isSocketConnected, setIsSocketConnected] = useState(() => getSocket()?.connected ?? true);
  const [simRunning, setSimRunning] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [showTriggerModal, setShowTriggerModal] = useState(false);
  const [feedback, setFeedback] = useState(null);

  // New Emergency Form State
  const [triggerForm, setTriggerForm] = useState({
    patientId: '',
    emergencyType: 'SOS',
    notes: '',
    gpsFix: true,
    latitude: 20.2961,
    longitude: 85.8245,
    gpsSat: 8,
    ambulanceId: 'AMB-001'
  });

  // Map Container & References
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const patientMarkerRef = useRef(null);
  const ambulanceMarkerRef = useRef(null);
  const routePolylineRef = useRef(null);

  // Load patients roster for emergency trigger modal
  useEffect(() => {
    fetch('http://localhost:5001/api/patients')
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) {
          setPatients(data);
          if (data.length > 0 && !triggerForm.patientId) {
            setTriggerForm(prev => ({ ...prev, patientId: String(data[0].id) }));
          }
        }
      })
      .catch(() => {});
  }, [triggerForm.patientId]);

  // Monitor Socket.IO connection status
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    const onConnect = () => setIsSocketConnected(true);
    const onDisconnect = () => setIsSocketConnected(false);

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
    };
  }, []);

  const showToast = (msg, type = 'success') => {
    setFeedback({ msg, type });
    setTimeout(() => setFeedback(null), 4000);
  };

  // Validate patient coordinates
  const isPatientGpsValid = useMemo(() => {
    if (!activeEmergency) return false;
    const fix = Boolean(activeEmergency.gpsFix ?? activeEmergency.gps_fix);
    const lat = Number(activeEmergency.latitude);
    const lng = Number(activeEmergency.longitude);
    if (!fix) return false;
    if (isNaN(lat) || isNaN(lng) || (lat === 0 && lng === 0)) return false;
    return lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
  }, [activeEmergency]);

  // Find active assigned ambulance
  const assignedAmbulance = useMemo(() => {
    if (!activeEmergency || !activeEmergency.ambulanceId) return null;
    return ambulances.find(
      a => a.id === activeEmergency.ambulanceId || a.ambulanceId === activeEmergency.ambulanceId
    ) || {
      id: activeEmergency.ambulanceId,
      name: activeEmergency.ambulance_name || 'Emergency Unit',
      status: activeEmergency.status === 'EN_ROUTE' ? 'EN_ROUTE' : (activeEmergency.status || 'ASSIGNED'),
      latitude: activeEmergency.ambulance_lat || 20.3002,
      longitude: activeEmergency.ambulance_lng || 85.8150
    };
  }, [activeEmergency, ambulances]);

  // Initialize and update Leaflet Map
  useEffect(() => {
    if (!mapContainerRef.current) return;

    // Initialize Map once
    if (!mapInstanceRef.current) {
      const defaultCenter = [20.2980, 85.8200]; // Bhubaneswar medical center baseline
      const map = L.map(mapContainerRef.current, {
        center: defaultCenter,
        zoom: 14,
        zoomControl: true,
        attributionControl: true
      });

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '© OpenStreetMap contributors | MediResQ Emergency Dispatch'
      }).addTo(map);

      mapInstanceRef.current = map;
    }

    const map = mapInstanceRef.current;

    // Default hospital coordinate anchor if GPS is unavailable
    const hospitalCoords = [20.2961, 85.8245];
    const patientCoords = isPatientGpsValid
      ? [Number(activeEmergency.latitude), Number(activeEmergency.longitude)]
      : null;

    const ambulanceCoords = assignedAmbulance && assignedAmbulance.latitude && assignedAmbulance.longitude
      ? [Number(assignedAmbulance.latitude), Number(assignedAmbulance.longitude)]
      : null;

    // 1. Patient Marker
    if (patientCoords) {
      if (!patientMarkerRef.current) {
        patientMarkerRef.current = L.marker(patientCoords, { icon: createPatientIcon() }).addTo(map);
      } else {
        patientMarkerRef.current.setLatLng(patientCoords);
      }

      patientMarkerRef.current.bindPopup(`
        <div style="font-family: var(--font-family-base); font-size: 13px; line-height: 1.4;">
          <b style="color: #dc2626;">🔴 PATIENT: ${activeEmergency.patientName || activeEmergency.patient_name || 'Inpatient'}</b><br/>
          <span>Type: <b>${activeEmergency.emergencyType || activeEmergency.emergency_type || 'SOS'}</b></span><br/>
          <span>Room: ${activeEmergency.room_number || 'ICU-01'}</span><br/>
          <span style="font-size: 11px; color: #64748b;">GPS: ${patientCoords[0].toFixed(4)}°, ${patientCoords[1].toFixed(4)}° (Sats: ${activeEmergency.gpsSat || 8})</span>
        </div>
      `);
    } else if (patientMarkerRef.current) {
      map.removeLayer(patientMarkerRef.current);
      patientMarkerRef.current = null;
    }

    // 2. Ambulance Marker
    if (ambulanceCoords) {
      if (!ambulanceMarkerRef.current) {
        ambulanceMarkerRef.current = L.marker(ambulanceCoords, {
          icon: createAmbulanceIcon(assignedAmbulance.status)
        }).addTo(map);
      } else {
        ambulanceMarkerRef.current.setLatLng(ambulanceCoords);
        ambulanceMarkerRef.current.setIcon(createAmbulanceIcon(assignedAmbulance.status));
      }

      const distStr = activeEmergency && activeEmergency.currentDistance != null
        ? `${Number(activeEmergency.currentDistance).toFixed(1)} km`
        : 'Stationed';
      const etaStr = activeEmergency && activeEmergency.estimatedEta != null
        ? `${activeEmergency.estimatedEta} mins`
        : '--';

      ambulanceMarkerRef.current.bindPopup(`
        <div style="font-family: var(--font-family-base); font-size: 13px; line-height: 1.4;">
          <b style="color: #2563eb;">🚑 AMBULANCE: ${assignedAmbulance.id || 'AMB-001'}</b><br/>
          <span>Unit: ${assignedAmbulance.name || 'Critical Care Unit'}</span><br/>
          <span>Status: <b>${assignedAmbulance.status}</b></span><br/>
          <span>Distance: <b>${distStr}</b> (ETA: <b>${etaStr}</b>)</span><br/>
          <span style="display: inline-block; margin-top: 4px; padding: 2px 6px; background: #eff6ff; color: #1d4ed8; font-size: 10px; font-weight: bold; border-radius: 4px;">DEMO / SIMULATED</span>
        </div>
      `);
    } else if (ambulanceMarkerRef.current) {
      map.removeLayer(ambulanceMarkerRef.current);
      ambulanceMarkerRef.current = null;
    }

    // 3. Polyline Trajectory
    if (patientCoords && ambulanceCoords) {
      const lineCoords = [ambulanceCoords, patientCoords];
      if (!routePolylineRef.current) {
        routePolylineRef.current = L.polyline(lineCoords, {
          color: '#2563eb',
          weight: 4,
          dashArray: '8, 8',
          opacity: 0.85
        }).addTo(map);
      } else {
        routePolylineRef.current.setLatLngs(lineCoords);
      }

      // Auto fit bounds between responder and patient
      try {
        const bounds = L.latLngBounds([patientCoords, ambulanceCoords]);
        map.fitBounds(bounds, { padding: [60, 60], maxZoom: 16 });
      } catch (err) {
        console.debug('Map bounds error:', err);
      }
    } else {
      if (routePolylineRef.current) {
        map.removeLayer(routePolylineRef.current);
        routePolylineRef.current = null;
      }
      if (ambulanceCoords) {
        map.setView(ambulanceCoords, 14);
      } else if (patientCoords) {
        map.setView(patientCoords, 14);
      } else {
        map.setView(hospitalCoords, 14);
      }
    }
  }, [activeEmergency, assignedAmbulance, isPatientGpsValid]);

  // Clean up Leaflet on unmount
  useEffect(() => {
    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  // Simulator controls
  const handleToggleSimulator = async () => {
    try {
      const res = await fetch('http://localhost:5001/api/ambulances/simulator/toggle', { method: 'POST' });
      const data = await res.json();
      setSimRunning(Boolean(data.isRunning));
      showToast(data.isRunning ? 'Ambulance simulation loop active.' : 'Ambulance simulation paused.', 'info');
    } catch (err) {
      showToast('Simulator communication error: ' + err.message, 'error');
    }
  };

  const handleStepSimulator = async () => {
    try {
      await fetch('http://localhost:5001/api/ambulances/simulator/step', { method: 'POST' });
      showToast('Simulation advanced 1 tick.', 'info');
    } catch (err) {
      showToast('Step error: ' + err.message, 'error');
    }
  };

  const handleResetSimulator = async () => {
    try {
      await fetch('http://localhost:5001/api/ambulances/simulator/reset', { method: 'POST' });
      refreshAmbulances();
      showToast('Ambulances returned to base stations.', 'info');
    } catch (err) {
      showToast('Reset error: ' + err.message, 'error');
    }
  };

  // Status transitions
  const handleUpdateStatus = async (status) => {
    if (!activeEmergency) return;
    setActionLoading(true);
    const res = await updateEmergencyStatus(activeEmergency.id, status);
    setActionLoading(false);
    if (res.success) {
      showToast(`Emergency status transitioned to ${status}.`);
      refreshAmbulances();
    } else {
      showToast(res.error || 'Failed to update status', 'error');
    }
  };

  // Dispatch specific ambulance
  const handleDispatch = async (ambId) => {
    if (!activeEmergency) {
      showToast('No active emergency selected for dispatch.', 'error');
      return;
    }
    setActionLoading(true);
    const res = await dispatchAmbulance(ambId, activeEmergency.id);
    setActionLoading(false);
    if (res.success) {
      showToast(`Ambulance ${ambId} dispatched.`);
    } else {
      showToast(res.error || 'Dispatch failed', 'error');
    }
  };

  // Handle trigger new emergency modal submit
  const handleCreateEmergency = async (e) => {
    e.preventDefault();
    if (!triggerForm.patientId) {
      showToast('Please select a patient.', 'error');
      return;
    }
    setActionLoading(true);

    const payload = {
      patientId: Number(triggerForm.patientId),
      emergencyType: triggerForm.emergencyType,
      notes: triggerForm.notes,
      gpsFix: triggerForm.gpsFix,
      latitude: triggerForm.gpsFix ? Number(triggerForm.latitude) : null,
      longitude: triggerForm.gpsFix ? Number(triggerForm.longitude) : null,
      gpsSat: triggerForm.gpsFix ? Number(triggerForm.gpsSat) : 0,
      ambulanceId: triggerForm.ambulanceId || null
    };

    const res = await triggerEmergency(payload);
    setActionLoading(false);
    if (res.success) {
      setShowTriggerModal(false);
      showToast(`Emergency [${triggerForm.emergencyType}] successfully triggered!`);
      refreshAmbulances();
    } else {
      showToast(res.error || 'Failed to trigger emergency.', 'error');
    }
  };

  const getEmergencyTypeBadgeColor = (type) => {
    switch (type) {
      case 'SOS': return 'badge-danger-glow';
      case 'CRITICAL_HEALTH': return 'badge-danger-glow';
      case 'FALL': return 'badge-warning-glow';
      case 'RESPIRATORY_DISTRESS': return 'badge-teal-glow';
      case 'HEAT_STRESS': return 'badge-warning-glow';
      default: return 'badge-info-glow';
    }
  };

  const getStatusBadgeColor = (status) => {
    switch (status) {
      case 'CREATED': return 'badge-warning';
      case 'ASSIGNED': return 'badge-info';
      case 'EN_ROUTE': return 'badge-danger';
      case 'ARRIVED': return 'badge-stable';
      case 'COMPLETED': return 'badge-stable';
      case 'CANCELLED': return 'badge-disabled';
      default: return 'badge-info';
    }
  };

  const progressVal = activeEmergency ? Math.round(Number(activeEmergency.progress || 0)) : 0;
  const currentDistVal = activeEmergency && activeEmergency.currentDistance != null ? Number(activeEmergency.currentDistance).toFixed(1) : '--';
  const etaVal = activeEmergency && activeEmergency.estimatedEta != null ? `${activeEmergency.estimatedEta} min` : '--';

  return (
    <div className="fade-in emergency-response-page">
      {/* ── TOP ACTION HEADER BAR ─────────────────────────────────────────── */}
      <div className="emergency-header-row">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <h1 className="glass-header" style={{ margin: 0 }}>Emergency GPS & Ambulance Response</h1>
            <span className="demo-simulated-pill">
              DEMO / SIMULATED
            </span>
          </div>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginTop: '0.25rem', marginBottom: 0 }}>
            Real-time patient telemetry geolocation, automated triage dispatch, and responder tracking
          </p>
        </div>

        <div className="emergency-header-actions">
          {/* Socket Connection Status */}
          <div
            className={`connection-status-pill ${isSocketConnected ? 'online' : 'offline'}`}
            title={isSocketConnected ? 'Socket.IO live stream connected' : 'Connection lost. Showing last known telemetry.'}
          >
            <span className="pulse-dot" style={{ backgroundColor: isSocketConnected ? '#10b981' : '#dc2626' }} />
            <span>{isSocketConnected ? 'Live Socket Stream' : 'Connection Lost — Last Known'}</span>
          </div>

          {/* Trigger Emergency Button */}
          <button
            onClick={() => setShowTriggerModal(true)}
            className="btn-danger pulse-emergency-btn"
            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 700 }}
          >
            <AlertOctagon size={18} />
            <span>Trigger Emergency SOS</span>
          </button>
        </div>
      </div>

      {/* ── TOAST NOTIFICATIONS ───────────────────────────────────────────── */}
      {feedback && (
        <div className={`emergency-toast ${feedback.type === 'error' ? 'toast-error' : 'toast-success'}`}>
          {feedback.type === 'error' ? <ShieldAlert size={18} /> : <CheckCircle2 size={18} />}
          <span>{feedback.msg}</span>
        </div>
      )}

      {/* ── DISCONNECTED WARNING BANNER ───────────────────────────────────── */}
      {!isSocketConnected && (
        <div className="emergency-warning-banner">
          <WifiOff size={20} color="#dc2626" />
          <div>
            <b>Connection Lost</b> — Real-time tracking paused. Displaying last known patient and ambulance coordinates.
          </div>
        </div>
      )}

      {/* ── MAIN DASHBOARD GRID (ACTIVE EMERGENCY + LIVE MAP) ─────────────── */}
      <div className="emergency-split-grid">

        {/* LEFT COLUMN: ACTIVE EMERGENCY HERO CARD & RESPONDER METRICS ──────── */}
        <div className="emergency-left-panel">
          {activeEmergency ? (
            <div className="med-card emergency-hero-card">
              {/* Card Header */}
              <div className="emergency-card-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span className={`status-badge-lg ${getEmergencyTypeBadgeColor(activeEmergency.emergencyType || activeEmergency.emergency_type)}`}>
                    {activeEmergency.emergencyType || activeEmergency.emergency_type || 'SOS'}
                  </span>
                  <span className={`badge ${getStatusBadgeColor(activeEmergency.status)}`}>
                    {activeEmergency.status}
                  </span>
                </div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  ID: <b>{activeEmergency.id}</b>
                </div>
              </div>

              {/* Patient Demographics & Ward */}
              <div className="emergency-patient-info">
                <div className="patient-avatar-badge">
                  <User size={24} color="var(--accent-primary)" />
                </div>
                <div style={{ flex: 1 }}>
                  <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                    {activeEmergency.patientName || activeEmergency.patient_name || 'Inpatient'}
                  </h2>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginTop: '0.2rem' }}>
                    <span>Patient ID: <b>PT-00{activeEmergency.patientId || activeEmergency.patient_id}</b></span>
                    <span>Bed: <b>{activeEmergency.room_number || 'ICU-01'}</b></span>
                    <span>Gender: <b>{activeEmergency.gender || 'Not Specified'}</b></span>
                    <span>Age: <b>{activeEmergency.age || 'N/A'} yrs</b></span>
                    {activeEmergency.guardian_contact && (
                      <span style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                        <Phone size={12} /> {activeEmergency.guardian_contact}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Patient GPS Telemetry Section */}
              <div className="emergency-gps-box">
                <div className="gps-box-header">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 600, fontSize: '0.85rem', color: 'var(--text-primary)' }}>
                    <MapPin size={16} color={isPatientGpsValid ? '#16a34a' : '#dc2626'} />
                    <span>Patient Hardware GPS (NEO-M8N)</span>
                  </div>
                  <span className={`badge ${isPatientGpsValid ? 'badge-stable' : 'badge-danger'}`} style={{ fontSize: '0.75rem' }}>
                    {isPatientGpsValid ? `3D Fix (${activeEmergency.gpsSat || 8} Sats)` : 'No Fix'}
                  </span>
                </div>

                {isPatientGpsValid ? (
                  <div className="gps-coords-display">
                    <div>
                      <span className="coord-label">Latitude:</span>
                      <span className="coord-val">{Number(activeEmergency.latitude).toFixed(5)}° N</span>
                    </div>
                    <div>
                      <span className="coord-label">Longitude:</span>
                      <span className="coord-val">{Number(activeEmergency.longitude).toFixed(5)}° E</span>
                    </div>
                  </div>
                ) : (
                  <div className="gps-unavailable-display">
                    <div style={{ fontWeight: 600, color: '#dc2626' }}>GPS unavailable</div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                      Waiting for valid GPS signal... (Emergency remains active and dispatched to ward/bed location)
                    </div>
                  </div>
                )}
              </div>

              {/* Responder Tracking Metrics Grid */}
              <div className="emergency-metrics-grid">
                <div className="metric-tile">
                  <div className="metric-icon-wrap" style={{ background: '#eff6ff', color: '#2563eb' }}>
                    <Ambulance size={18} />
                  </div>
                  <div>
                    <div className="metric-label">Ambulance Unit</div>
                    <div className="metric-value">{assignedAmbulance ? assignedAmbulance.id : 'Pending'}</div>
                    <div className="metric-sub">{assignedAmbulance ? assignedAmbulance.name : 'Awaiting Assignment'}</div>
                  </div>
                </div>

                <div className="metric-tile">
                  <div className="metric-icon-wrap" style={{ background: '#ecfdf5', color: '#10b981' }}>
                    <Compass size={18} />
                  </div>
                  <div>
                    <div className="metric-label">Distance: {currentDistVal} km</div>
                    <div className="metric-value">{currentDistVal} km</div>
                    <div className="metric-sub">Haversine Airway Distance</div>
                  </div>
                </div>

                <div className="metric-tile">
                  <div className="metric-icon-wrap" style={{ background: '#fffbeb', color: '#d97706' }}>
                    <Clock size={18} />
                  </div>
                  <div>
                    <div className="metric-label">Estimated ETA</div>
                    <div className="metric-value">{etaVal}</div>
                    <div className="metric-sub">Simulated Urban Speed</div>
                  </div>
                </div>

                <div className="metric-tile">
                  <div className="metric-icon-wrap" style={{ background: '#fdf2f8', color: '#db2777' }}>
                    <Gauge size={18} />
                  </div>
                  <div>
                    <div className="metric-label">Progress</div>
                    <div className="metric-value">{progressVal}%</div>
                    <div className="metric-sub">{activeEmergency.status === 'ARRIVED' ? 'Arrived at Patient' : 'En Route'}</div>
                  </div>
                </div>
              </div>

              {/* Progress Bar */}
              <div className="response-progress-section">
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', fontWeight: 600, marginBottom: '0.4rem' }}>
                  <span style={{ color: 'var(--text-primary)' }}>Response Progress</span>
                  <span style={{ color: 'var(--accent-primary)' }}>{progressVal}%</span>
                </div>
                <div className="progress-bar-track">
                  <div
                    className="progress-bar-fill"
                    style={{ width: `${progressVal}%`, backgroundColor: progressVal >= 100 ? '#10b981' : '#2563eb' }}
                  />
                </div>
              </div>

              {/* Clinical Notes */}
              {activeEmergency.notes && (
                <div style={{ fontSize: '0.82rem', background: '#f8fafc', padding: '0.6rem 0.85rem', borderRadius: '8px', border: '1px solid var(--border-light)', color: 'var(--text-secondary)' }}>
                  <b>Dispatch Notes:</b> {activeEmergency.notes}
                </div>
              )}

              {/* Lifecycle Action Buttons */}
              <div className="emergency-actions-toolbar">
                {activeEmergency.status === 'CREATED' && (
                  <button
                    disabled={actionLoading}
                    onClick={() => handleUpdateStatus('EN_ROUTE')}
                    className="btn-primary"
                    style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem' }}
                  >
                    <Navigation size={15} />
                    <span>Dispatch Ambulance</span>
                  </button>
                )}

                {activeEmergency.status === 'EN_ROUTE' && (
                  <button
                    disabled={actionLoading}
                    onClick={() => handleUpdateStatus('ARRIVED')}
                    className="btn-secondary"
                    style={{ flex: 1, borderColor: '#10b981', color: '#10b981', fontWeight: 600 }}
                  >
                    <CheckCircle2 size={16} />
                    <span>Mark Arrived</span>
                  </button>
                )}

                {activeEmergency.status === 'ARRIVED' && (
                  <button
                    disabled={actionLoading}
                    onClick={() => handleUpdateStatus('COMPLETED')}
                    className="btn-primary"
                    style={{ flex: 1, background: '#10b981', borderColor: '#10b981' }}
                  >
                    <CheckCircle2 size={16} />
                    <span>Complete Emergency</span>
                  </button>
                )}

                {activeEmergency.status !== 'COMPLETED' && activeEmergency.status !== 'CANCELLED' && (
                  <button
                    disabled={actionLoading}
                    onClick={() => handleUpdateStatus('CANCELLED')}
                    className="btn-secondary"
                    style={{ color: '#dc2626', borderColor: '#fecaca' }}
                  >
                    <span>Cancel</span>
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="med-card no-emergency-standby">
              <div className="standby-icon-circle">
                <CheckCircle2 size={36} color="#16a34a" />
              </div>
              <h3 style={{ margin: '0.5rem 0', color: 'var(--text-primary)' }}>Emergency Response Standby</h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', maxWidth: '340px', margin: '0 auto 1.25rem' }}>
                All emergency systems operational. No active critical incidents or emergency dispatches currently in progress.
              </p>
              <button
                onClick={() => setShowTriggerModal(true)}
                className="btn-primary"
                style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}
              >
                <AlertOctagon size={16} />
                <span>Simulate Emergency Dispatch</span>
              </button>
            </div>
          )}

          {/* SIMULATOR CONTROLS PANEL ────────────────────────────────────── */}
          <div className="med-card simulator-controls-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                <Radio size={16} color="var(--accent-primary)" />
                <span style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-primary)' }}>Ambulance Simulation Engine</span>
              </div>
              <span className="demo-simulated-pill">
                DEMO / SIMULATED
              </span>
            </div>

            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: '0 0 0.85rem 0' }}>
              Simulates realistic telemetry transit between medical dispatch station and patient coordinates without generating synthetic medical vitals.
            </p>

            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <button
                onClick={handleToggleSimulator}
                className={`btn-secondary ${simRunning ? 'sim-active' : ''}`}
                style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.82rem' }}
              >
                {simRunning ? <Pause size={14} color="#dc2626" /> : <Play size={14} color="#16a34a" />}
                <span>{simRunning ? 'Pause Auto-Drive' : 'Start Auto-Drive'}</span>
              </button>

              <button
                onClick={handleStepSimulator}
                className="btn-secondary"
                style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.82rem' }}
                title="Advance ambulance 1 step toward patient"
              >
                <Navigation size={14} />
                <span>Step Forward</span>
              </button>

              <button
                onClick={handleResetSimulator}
                className="btn-secondary"
                style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.82rem', marginLeft: 'auto' }}
                title="Reset ambulances to base station coordinates"
              >
                <RotateCcw size={14} />
                <span>Reset Fleet</span>
              </button>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: LIVE INTERACTIVE MAP ──────────────────────────────── */}
        <div className="emergency-right-panel">
          <div className="med-card map-card-container">
            {/* Map Top Header */}
            <div className="map-header-bar">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <MapPin size={18} color="var(--accent-primary)" />
                <span style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-primary)' }}>Live Dispatch Geolocation Map</span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div className="map-legend-item">
                  <span className="legend-dot red" />
                  <span>Patient</span>
                </div>
                <div className="map-legend-item">
                  <span className="legend-dot blue" />
                  <span>Ambulance</span>
                </div>
                <span className="demo-simulated-pill">
                  DEMO / SIMULATED
                </span>
              </div>
            </div>

            {/* Map Canvas */}
            <div className="map-canvas-wrapper">
              <div ref={mapContainerRef} className="leaflet-map-canvas" />

              {/* No GPS Fix Alert Box inside map if applicable */}
              {activeEmergency && !isPatientGpsValid && (
                <div className="map-floating-overlay">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#b91c1c', fontWeight: 700, fontSize: '0.85rem' }}>
                    <ShieldAlert size={16} /> Awaiting Patient GPS Signal
                  </div>
                  <div style={{ fontSize: '0.78rem', color: '#475569', marginTop: '0.15rem' }}>
                    Emergency created for Bed <b>{activeEmergency.room_number || 'ICU-01'}</b>. Coordinates will populate automatically upon satellite acquisition.
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

      </div>

      {/* ── AMBULANCE FLEET DIRECTORY TABLE ───────────────────────────────── */}
      <div className="med-card ambulance-fleet-section">
        <div className="fleet-header-row">
          <div>
            <h3 style={{ fontSize: '1.05rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
              <Ambulance size={18} color="var(--accent-primary)" /> Emergency Ambulance Fleet Directory
            </h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.82rem', margin: '0.2rem 0 0' }}>
              Active responders, GPS locations, assignments, and transit telemetry
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span className="demo-simulated-pill">DEMO / SIMULATED</span>
            <button
              onClick={refreshAmbulances}
              className="btn-secondary"
              style={{ fontSize: '0.8rem', padding: '0.35rem 0.75rem' }}
            >
              Refresh Fleet
            </button>
          </div>
        </div>

        <div className="table-responsive">
          <table className="med-table">
            <thead>
              <tr>
                <th>Ambulance</th>
                <th>Status</th>
                <th>Current Coordinates</th>
                <th>Assigned Patient</th>
                <th>Distance</th>
                <th>Simulated ETA</th>
                <th>Mode</th>
                <th style={{ textAlign: 'right' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {ambulances.map((amb) => {
                const isAssigned = amb.status === 'EN_ROUTE' || amb.status === 'ASSIGNED';
                const distText = amb.current_distance != null ? `${Number(amb.current_distance).toFixed(1)} km` : (amb.distance != null ? `${Number(amb.distance).toFixed(1)} km` : '--');
                const etaText = amb.estimated_eta_minutes != null ? `${amb.estimated_eta_minutes} min` : (amb.eta != null ? `${amb.eta} min` : '--');

                return (
                  <tr key={amb.id || amb.ambulanceId}>
                    <td>
                      <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{amb.id || amb.ambulanceId}</div>
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{amb.name}</div>
                    </td>
                    <td>
                      <span className={`badge ${getStatusBadgeColor(amb.status)}`}>
                        {amb.status}
                      </span>
                    </td>
                    <td>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.82rem', color: 'var(--text-primary)' }}>
                        {amb.latitude ? `${Number(amb.latitude).toFixed(4)}°, ${Number(amb.longitude).toFixed(4)}°` : 'Base Station'}
                      </span>
                    </td>
                    <td>
                      {amb.assigned_patient_name ? (
                        <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{amb.assigned_patient_name}</span>
                      ) : (
                        <span style={{ color: 'var(--text-muted)' }}>Standby (Unassigned)</span>
                      )}
                    </td>
                    <td>{distText}</td>
                    <td>{etaText}</td>
                    <td>
                      <span className="demo-simulated-pill" style={{ fontSize: '10px' }}>
                        DEMO / SIMULATED
                      </span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      {amb.status === 'AVAILABLE' && activeEmergency ? (
                        <button
                          disabled={actionLoading}
                          onClick={() => handleDispatch(amb.id || amb.ambulanceId)}
                          className="btn-primary"
                          style={{ fontSize: '0.78rem', padding: '0.3rem 0.75rem' }}
                        >
                          Dispatch
                        </button>
                      ) : isAssigned ? (
                        <span style={{ fontSize: '0.78rem', color: '#2563eb', fontWeight: 600 }}>Active Responder</span>
                      ) : (
                        <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Standby</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── TRIGGER EMERGENCY MODAL ───────────────────────────────────────── */}
      {showTriggerModal && (
        <div className="modal-overlay" onClick={() => setShowTriggerModal(false)}>
          <div className="modal-card" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <AlertOctagon size={22} color="#dc2626" />
                <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700 }}>Trigger Emergency Dispatch</h2>
              </div>
              <button onClick={() => setShowTriggerModal(false)} className="modal-close-btn">✕</button>
            </div>

            <form onSubmit={handleCreateEmergency} className="modal-form">
              <div className="form-group">
                <label>Select Inpatient</label>
                <select
                  value={triggerForm.patientId}
                  onChange={e => setTriggerForm({ ...triggerForm, patientId: e.target.value })}
                  className="form-control"
                  required
                >
                  <option value="">-- Choose Patient --</option>
                  {patients.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.name} (Bed: {p.room_number || 'N/A'})
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label>Emergency Type</label>
                <select
                  value={triggerForm.emergencyType}
                  onChange={e => setTriggerForm({ ...triggerForm, emergencyType: e.target.value })}
                  className="form-control"
                >
                  <option value="SOS">SOS — Immediate Distress Signal</option>
                  <option value="FALL">FALL — Fall Detection Sensor Trigger</option>
                  <option value="CRITICAL_HEALTH">CRITICAL_HEALTH — Multi-Vital Breach</option>
                  <option value="RESPIRATORY_DISTRESS">RESPIRATORY_DISTRESS — Hypoxemia / SpO2 Drop</option>
                  <option value="HEAT_STRESS">HEAT_STRESS — Hyperthermia Threshold</option>
                  <option value="OTHER">OTHER — Clinical Escalation</option>
                </select>
              </div>

              <div className="form-group">
                <label>Assign Responder Ambulance</label>
                <select
                  value={triggerForm.ambulanceId}
                  onChange={e => setTriggerForm({ ...triggerForm, ambulanceId: e.target.value })}
                  className="form-control"
                >
                  <option value="">Auto-Assign First Available</option>
                  {ambulances.map(a => (
                    <option key={a.id || a.ambulanceId} value={a.id || a.ambulanceId}>
                      {a.id || a.ambulanceId} — {a.name} ({a.status})
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
                  <label style={{ margin: 0 }}>Hardware GPS Fix Simulation</label>
                  <label className="toggle-switch">
                    <input
                      type="checkbox"
                      checked={triggerForm.gpsFix}
                      onChange={e => setTriggerForm({ ...triggerForm, gpsFix: e.target.checked })}
                    />
                    <span className="toggle-slider" />
                  </label>
                </div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                  {triggerForm.gpsFix
                    ? 'GPS fix acquired: Will transmit valid coordinates to responder.'
                    : 'GPS unavailable: Simulates indoor bed emergency without satellite fix.'}
                </div>
              </div>

              {triggerForm.gpsFix && (
                <div className="coords-input-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                  <div className="form-group">
                    <label style={{ fontSize: '0.78rem' }}>Latitude (-90 to +90)</label>
                    <input
                      type="number"
                      step="0.0001"
                      value={triggerForm.latitude}
                      onChange={e => setTriggerForm({ ...triggerForm, latitude: parseFloat(e.target.value) })}
                      className="form-control"
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label style={{ fontSize: '0.78rem' }}>Longitude (-180 to +180)</label>
                    <input
                      type="number"
                      step="0.0001"
                      value={triggerForm.longitude}
                      onChange={e => setTriggerForm({ ...triggerForm, longitude: parseFloat(e.target.value) })}
                      className="form-control"
                      required
                    />
                  </div>
                </div>
              )}

              <div className="form-group">
                <label>Dispatch Notes</label>
                <textarea
                  rows="2"
                  value={triggerForm.notes}
                  onChange={e => setTriggerForm({ ...triggerForm, notes: e.target.value })}
                  placeholder="e.g., Patient collapsed in corridor, rapid response requested"
                  className="form-control"
                />
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  onClick={() => setShowTriggerModal(false)}
                  className="btn-secondary"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="btn-danger"
                  style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}
                >
                  <AlertOctagon size={16} />
                  <span>{actionLoading ? 'Dispatching...' : 'Dispatch Emergency'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default EmergencyResponse;
