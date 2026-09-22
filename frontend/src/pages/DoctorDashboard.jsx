import React, { useState, useEffect, useMemo } from 'react';
import { Search, Filter, ArrowLeft, Heart, Wind, Thermometer, Activity, User, Phone, Stethoscope, Bell, Plus, Trash2, CheckCircle2, AlertTriangle, ShieldAlert, Settings, Waves, Radio, MapPin, Gauge, Cpu, Navigation, Flame } from 'lucide-react';
import SensorGraph from '../components/SensorGraph';
import HistoryBarGraph from '../components/HistoryBarGraph';
import HealthScorePanel from '../components/HealthScorePanel';
import PatientCard from '../components/PatientCard';
import { AiRiskBadge } from '../components/AiRiskCard';
import { useRealtimeData, seedPatientTelemetry } from '../utils/telemetryStore';

const DoctorDashboard = () => {
  const globalRealtimeData = useRealtimeData();
  const [isMuted, setIsMuted] = useState(false);
  const [patients, setPatients] = useState([]);
  const [activePatient, setActivePatient] = useState(null);
  const [history, setHistory] = useState([]);
  const [_groupedHistory, setGroupedHistory] = useState({});
  const [_selectedDate, setSelectedDate] = useState('');
  const [thresholds, setThresholds] = useState({});
  const [_loading, setLoading] = useState(false);
  const [deviceStatus, setDeviceStatus] = useState({ online: false, deviceId: null, lastSeen: null, ip: null });

  // Hardware Config & Modal state
  const [hardwareConfig, setHardwareConfig] = useState({
    ip: '',
    localLanIp: '',
    lanIngestionUrl: '',
    isPolling: true,
    lastPollStatus: 'IDLE',
    lastPollError: null
  });
  const [ipInput, setIpInput] = useState('');
  const [showHardwareModal, setShowHardwareModal] = useState(false);
  const [savingHardware, setSavingHardware] = useState(false);
  const [pulseSuccess, setPulseSuccess] = useState(false);

  // Poll device status every 4 seconds
  useEffect(() => {
    const checkDevice = () => {
      fetch('http://localhost:5001/api/device/status')
        .then(res => res.json())
        .then(data => setDeviceStatus(data))
        .catch(() => setDeviceStatus({ online: false }));
    };
    checkDevice();
    const interval = setInterval(checkDevice, 4000);
    return () => clearInterval(interval);
  }, []);

  // Fetch hardware config on mount
  useEffect(() => {
    fetch('http://localhost:5001/api/hardware/config')
      .then(r => r.json())
      .then(cfg => {
        setHardwareConfig(cfg);
        if (cfg.ip) setIpInput(cfg.ip);
      })
      .catch(() => {});
  }, []);

  // Search & Filter state
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');

  // Medicine Reminders & Precautions state
  const [reminders, setReminders] = useState([
    { id: 1, time: '08:00 AM', medicine: 'Paracetamol 500mg', status: 'Pending' },
    { id: 2, time: '01:00 PM', medicine: 'Amoxicillin 250mg', status: 'Pending' },
    { id: 3, time: '08:00 PM', medicine: 'Vitamin C 1000mg', status: 'Completed' }
  ]);
  const [precautions, setPrecautions] = useState([
    'Check BP every 2 hours',
    'Patient allergic to penicillin',
    'Maintain oxygen level above 95%',
    'Monitor body temperature regularly'
  ]);
  const [newPrecaution, setNewPrecaution] = useState('');

  // Add Patient Modal state
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newPatientForm, setNewPatientForm] = useState({
    name: '', age: '', gender: 'Not Specified', blood_group: '',
    weight: '', mobile: '', guardian_contact: '', room_number: ''
  });

  useEffect(() => {
    let mounted = true;
    fetch('http://localhost:5001/api/patients')
      .then(res => res.json())
      .then(data => {
        if (!mounted) return;
        const list = Array.isArray(data) ? data : [];
        setPatients(list);

        // Pre-seed telemetry for each patient from history so cards immediately render real data
        list.forEach(p => {
          fetch(`http://localhost:5001/api/patients/${p.id}/history`)
            .then(r => r.json())
            .then(hist => {
              if (Array.isArray(hist) && hist.length > 0) {
                seedPatientTelemetry(p.id, hist);
              }
            })
            .catch(() => {});
        });
      })
      .catch(err => console.error('Failed to fetch patients:', err));

    return () => { mounted = false; };
  }, []);

  const handleSelectPatient = (patient) => {
    setActivePatient(patient);
    setLoading(true);

    // Fetch History
    fetch(`http://localhost:5001/api/patients/${patient.id}/history`)
      .then(res => res.json())
      .then(data => {
        const hist = Array.isArray(data) ? data : [];
        setHistory(hist);
        if (hist.length > 0) {
          seedPatientTelemetry(patient.id, hist);
        }
        const grouped = hist.reduce((acc, curr) => {
          const date = new Date(curr.timestamp).toLocaleDateString();
          if (!acc[date]) acc[date] = [];
          acc[date].push(curr);
          return acc;
        }, {});
        setGroupedHistory(grouped);
        const dates = Object.keys(grouped).sort((a, b) => new Date(b) - new Date(a));
        if (dates.length > 0) setSelectedDate(dates[0]);
        else setSelectedDate('');
      })
      .catch(() => setHistory([]));

    // Fetch Thresholds
    fetch(`http://localhost:5001/api/patients/${patient.id}/thresholds`)
      .then(res => res.json())
      .then(data => {
        setThresholds(data || {});
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  const handleSaveHardwareConfig = async (e) => {
    e?.preventDefault?.();
    setSavingHardware(true);
    try {
      const res = await fetch('http://localhost:5001/api/hardware/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ip: ipInput.trim(),
          patientId: activePatient?.id || 1,
          isPolling: true
        })
      });
      const data = await res.json();
      if (data.success) {
        setHardwareConfig(data.config);
        setShowHardwareModal(false);
      }
    } catch (err) {
      alert('Failed to save hardware config: ' + err.message);
    } finally {
      setSavingHardware(false);
    }
  };

  const handleTriggerTestPulse = async () => {
    try {
      const res = await fetch('http://localhost:5001/api/hardware/test-pulse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ patientId: activePatient?.id || 1 })
      });
      const data = await res.json();
      if (data.success) {
        setPulseSuccess(true);
        setTimeout(() => setPulseSuccess(false), 2500);
      }
    } catch (err) {
      alert('Failed to send test pulse: ' + err.message);
    }
  };

  const handleThresholdChange = (e) => {
    setThresholds({ ...thresholds, [e.target.name]: Number(e.target.value) });
  };

  const saveThresholds = (e) => {
    e.preventDefault();
    if (!activePatient) return;
    fetch(`http://localhost:5001/api/patients/${activePatient.id}/thresholds`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(thresholds)
    })
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          alert('Threshold parameters saved successfully!');
        }
      });
  };

  const handleMarkGiven = (id) => {
    setReminders(reminders.map(r => r.id === id ? { ...r, status: 'Completed' } : r));
  };

  const handleAddPrecaution = (e) => {
    e.preventDefault();
    if (newPrecaution.trim()) {
      setPrecautions([...precautions, newPrecaution.trim()]);
      setNewPrecaution('');
    }
  };

  const handleRemovePrecaution = (index) => {
    setPrecautions(precautions.filter((_, i) => i !== index));
  };

  const handleAddPatientSubmit = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch('http://localhost:5001/api/patients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newPatientForm)
      });
      const data = await res.json();
      if (data.success) {
        setPatients([...patients, data.patient]);
        setIsAddModalOpen(false);
        setNewPatientForm({ name: '', age: '', gender: 'Not Specified', blood_group: '', weight: '', mobile: '', guardian_contact: '', room_number: '' });
      }
    } catch {
      alert('Error registering patient');
    }
  };

  const handleNewPatientChange = (e) => {
    setNewPatientForm({ ...newPatientForm, [e.target.name]: e.target.value });
  };

  // Determine health status from real-time stream
  const getPatientStatusData = (patientId, rtData = globalRealtimeData) => {
    const data = rtData[patientId];
    if (!data || data.length === 0) return { status: 'Stable', className: 'status-stable', color: 'var(--status-stable)' };
    const latest = data[data.length - 1];
    const score = latest.healthScore ?? latest.health_score ?? 100;
    const hr = latest.hr ?? latest.heart_rate;
    const spo2 = latest.spo2;
    const temp = latest.temp ?? latest.temperature;

    if (score < 50 || (spo2 && spo2 < 90) || (hr && (hr > 120 || hr < 40)) || (temp && temp > 103)) {
      return { status: 'Critical', className: 'status-critical', color: 'var(--status-critical)' };
    }
    if (score < 80 || (spo2 && spo2 < 95) || (hr && (hr > 100 || hr < 50)) || (temp && temp > 100.4)) {
      return { status: 'Warning', className: 'status-warning', color: 'var(--status-warning)' };
    }
    return { status: 'Stable', className: 'status-stable', color: 'var(--status-stable)' };
  };

  const filteredPatients = useMemo(() => {
    return patients.filter(p => {
      const matchesSearch =
        p.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (p.room_number && p.room_number.toString().includes(searchTerm)) ||
        (p.blood_group && p.blood_group.toLowerCase().includes(searchTerm.toLowerCase()));
      const data = globalRealtimeData[p.id];
      const score = (data && data.length > 0 && data[data.length - 1].healthScore !== undefined)
        ? data[data.length - 1].healthScore
        : 100;
      const status = score < 50 ? 'Critical' : score < 80 ? 'Warning' : 'Stable';
      const matchesStatus = statusFilter === 'All' || status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [patients, searchTerm, statusFilter, globalRealtimeData]);

  const realtimeForPatient = (activePatient && globalRealtimeData[activePatient.id]) ? globalRealtimeData[activePatient.id] : [];
  const currentRealtimeData = realtimeForPatient.length > 0 ? realtimeForPatient : history;
  const latestVitalPoint = currentRealtimeData.length > 0 ? currentRealtimeData[currentRealtimeData.length - 1] : {};

  return (
    <div className="fade-in doctor-dashboard-container">
      {/* ── TOP HEADER BAR ───────────────────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.75rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 className="glass-header" style={{ marginBottom: '0.2rem' }}>Doctor Clinical Dashboard</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', margin: 0 }}>
            Real-time patient vitals triage, clinical telemetry, and emergency management
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          {/* Hardware Connection Quick Link */}
          <button
            onClick={() => setShowHardwareModal(true)}
            className="btn-secondary"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              borderColor: deviceStatus.online ? 'var(--status-stable)' : 'var(--warning-border)',
              background: deviceStatus.online ? 'rgba(32, 201, 151, 0.1)' : 'rgba(255, 193, 7, 0.1)',
              color: deviceStatus.online ? 'var(--status-stable)' : 'var(--warning)',
              fontWeight: 600,
              fontSize: '0.85rem'
            }}
            title="Configure ESP8266 Sensor Link"
          >
            <Cpu size={16} />
            <span>ESP8266: {deviceStatus.online ? 'ONLINE' : 'OFFLINE'}</span>
            <span style={{ fontSize: '0.75rem', opacity: 0.8 }}>({hardwareConfig.ip || deviceStatus.ip || 'Configure IP'})</span>
          </button>

          {/* Test Hardware Pulse */}
          <button
            onClick={handleTriggerTestPulse}
            className="btn-secondary"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              fontSize: '0.85rem'
            }}
            title="Inject real telemetry schema pulse"
          >
            <Radio size={15} color={pulseSuccess ? 'var(--status-stable)' : 'var(--accent-primary)'} />
            {pulseSuccess ? '✓ Pulse Transmitted' : 'Test Hardware Pulse'}
          </button>

          {/* Alerts Mute Toggle */}
          <button
            onClick={() => setIsMuted(!isMuted)}
            className="btn-secondary"
            style={{
              borderColor: isMuted ? 'var(--glass-border)' : 'var(--warning-border)',
              background: isMuted ? 'var(--bg-panel)' : 'var(--warning-bg)',
              color: isMuted ? 'var(--text-secondary)' : 'var(--warning)',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              fontWeight: 600
            }}
          >
            {isMuted ? '🔕 Alerts Muted' : '🔔 Alerts Active'}
          </button>
        </div>
      </div>

      {/* ── PATIENT DIRECTORY (GRID VIEW) ────────────────────────────────── */}
      {!activePatient ? (
        <div>
          {/* Search & Status Filter Control Bar */}
          <div className="glass-panel" style={{ padding: '1.25rem', marginBottom: '1.5rem', display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ flex: 1, position: 'relative', minWidth: '240px' }}>
              <Search size={18} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
              <input
                type="text"
                placeholder="Search patient name, room number, or blood group..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="glass-input"
                style={{ paddingLeft: '2.75rem' }}
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Filter size={18} color="var(--text-secondary)" />
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="glass-select"
                style={{ width: 'auto' }}
              >
                <option value="All">All Health Statuses</option>
                <option value="Stable">Stable</option>
                <option value="Warning">Warning</option>
                <option value="Critical">Critical</option>
              </select>
            </div>

            <button className="btn-primary" onClick={() => setIsAddModalOpen(true)}>
              + Register New Patient
            </button>
          </div>

          {/* Unified Patient Grid */}
          <div className="patient-grid">
            {filteredPatients.length === 0 ? (
              <div className="empty-state glass-panel" style={{ gridColumn: '1 / -1', padding: '4rem 2rem' }}>
                <User size={36} />
                <span style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)' }}>No Patients Found</span>
                <span style={{ fontSize: '0.85rem' }}>No patient records match your search criteria.</span>
              </div>
            ) : (
              filteredPatients.map(p => {
                const { status } = getPatientStatusData(p.id);
                const rtData = globalRealtimeData[p.id] || [];
                const latest = rtData.length > 0 ? rtData[rtData.length - 1] : {};

                return (
                  <PatientCard
                    key={p.id}
                    patient={p}
                    status={status}
                    latestVitals={latest}
                    onClick={() => handleSelectPatient(p)}
                    onViewDetails={() => handleSelectPatient(p)}
                  />
                );
              })
            )}
          </div>
        </div>
      ) : (
        /* ── DETAILED PATIENT MONITORING VIEW ────────────────────────────── */
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

          {/* Top Dossier Header Card */}
          <div style={{ display: 'flex', gap: '1.25rem', alignItems: 'stretch', flexWrap: 'wrap' }}>
            <button
              className="btn-secondary"
              onClick={() => setActivePatient(null)}
              style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', height: 'auto', alignSelf: 'stretch' }}
            >
              <ArrowLeft size={18} /> Back to Directory
            </button>

            <div className="glass-panel" style={{ flex: 1, padding: '1.25rem 1.5rem', display: 'flex', alignItems: 'center', gap: '1.5rem', flexWrap: 'wrap', minWidth: '280px' }}>
              <div className="patient-avatar" style={{ width: '56px', height: '56px', fontSize: '1.25rem' }}>
                {(activePatient.name || 'Patient').trim().split(/\s+/).map(n => n[0] || '').join('').substring(0, 2).toUpperCase() || 'PT'}
              </div>

              <div style={{ flex: 1, minWidth: '200px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                  <h2 style={{ fontSize: '1.35rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>{activePatient.name}</h2>
                  <span className={`badge ${getPatientStatusData(activePatient.id).status === 'Critical' ? 'badge-critical' : getPatientStatusData(activePatient.id).status === 'Warning' ? 'badge-warning' : 'badge-stable'}`}>
                    {getPatientStatusData(activePatient.id).status}
                  </span>
                  <AiRiskBadge ai={latestVitalPoint?.ai} telemetryPoint={latestVitalPoint} />
                </div>

                <div style={{ display: 'flex', gap: '1.25rem', marginTop: '0.4rem', flexWrap: 'wrap', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                  <span>ID: <code>PT-00{activePatient.id}</code></span>
                  <span>Age: <b>{activePatient.age || '--'}</b></span>
                  <span>Gender: <b>{activePatient.gender || 'Not Specified'}</b></span>
                  <span>Room: <b>{activePatient.room_number || 'N/A'}</b></span>
                  <span>Blood Group: <b style={{ color: '#ff4d4f' }}>{activePatient.blood_group || 'N/A'}</b></span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                    <Cpu size={14} color="var(--accent-primary)" />
                    ESP8266: <b style={{ color: deviceStatus.online ? 'var(--success)' : 'var(--danger)' }}>
                      {deviceStatus.online ? `ONLINE (${deviceStatus.ip || latestVitalPoint.ip || '192.168.1.105'})` : 'OFFLINE'}
                    </b>
                    {deviceStatus.secondsAgo != null && (
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        ({deviceStatus.secondsAgo}s ago)
                      </span>
                    )}
                  </span>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.85rem', color: 'var(--text-secondary)', borderLeft: '1px solid var(--glass-border)', paddingLeft: '1.25rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <Stethoscope size={14} color="var(--accent-primary)" /> Doctor: <b>{activePatient.doctor_name || 'Dr. Smith'}</b>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <Phone size={14} color="var(--success)" /> Emergency: <b>{activePatient.guardian_contact || 'N/A'}</b>
                </div>
              </div>
            </div>
          </div>

          {/* Main 2-Column Responsive Dashboard Layout */}
          <div className="dashboard-grid-layout" style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: '1.5rem', alignItems: 'start' }}>

            {/* ── LEFT COLUMN: Real-Time Vitals & Health Analytics ────────── */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', minWidth: 0 }}>

              {/* Critical Alert Banner */}
              {getPatientStatusData(activePatient.id).status === 'Critical' && (
                <div className="glass-panel alert-card" style={{ padding: '1.25rem', borderLeft: '4px solid var(--danger)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--danger)' }}>
                      <ShieldAlert size={20} />
                      <h3 style={{ fontSize: '1.1rem', fontWeight: 700, margin: 0 }}>CRITICAL CLINICAL ALERT</h3>
                    </div>
                    <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>Detected at {new Date().toLocaleTimeString()}</span>
                  </div>
                  <p style={{ color: 'var(--text-primary)', fontSize: '0.9rem', marginBottom: '1rem' }}>
                    <strong>{activePatient.name}'s</strong> vital parameters have crossed critical safety thresholds. Immediate clinical triage recommended.
                  </p>
                  <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                    <button className="btn-danger btn-sm" onClick={() => alert('Calling Nurse Station for urgent assistance...')}>
                      Call Nurse Station
                    </button>
                    <button className="btn-secondary btn-sm" onClick={() => alert(`Notifying emergency guardian: ${activePatient.guardian_contact || 'N/A'}`)}>
                      Notify Family
                    </button>
                  </div>
                </div>
              )}

              {/* Health Score Component */}
              <HealthScorePanel currentData={currentRealtimeData} historyData={history} />

              {/* Live Vitals Telemetry Grid */}
              <div className="glass-panel" style={{ padding: '1.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                  <div>
                    <h2 style={{ fontSize: '1.1rem', fontWeight: 600, margin: 0 }}>Live Telemetry Streams</h2>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                      Real ESP8266 WiFi Telemetry • Device IP: <code>{deviceStatus.ip || latestVitalPoint.ip || '192.168.1.105'}</code>
                    </span>
                  </div>
                  <span className={`badge ${deviceStatus.online ? 'badge-stable' : 'badge-critical'}`}>
                    ● {deviceStatus.online ? 'ESP8266 ONLINE' : 'ESP8266 OFFLINE'}
                  </span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1.25rem' }}>
                  {/* Temperature: Both DHT11 & BMP280 */}
                  <SensorGraph
                    title="Temperature (DHT11 & BMP280)"
                    unit="°C"
                    dataPoints={currentRealtimeData}
                    dataKey="temp"
                    color="#20c997"
                    yMin={15}
                    yMax={50}
                    displayValue={
                      latestVitalPoint.dhtTemp != null || latestVitalPoint.bmpTemp != null
                        ? `DHT: ${latestVitalPoint.dhtTemp ?? '--'}°C | BMP: ${latestVitalPoint.bmpTemp ?? '--'}°C`
                        : (latestVitalPoint.temp != null ? `${latestVitalPoint.temp}°F` : '--')
                    }
                  />

                  {/* MAX30100 Raw Optical Signals - DO NOT INVENT FAKE MEDICAL VITALS */}
                  <SensorGraph
                    title="MAX30100 (Raw Optical Only)"
                    unit="IR/RED"
                    dataPoints={currentRealtimeData}
                    dataKey="maxIR"
                    color="#ff4d4f"
                    yMin={0}
                    yMax={30000}
                    displayValue={
                      latestVitalPoint.maxFound !== false
                        ? `IR: ${latestVitalPoint.maxIR ?? 0} | RED: ${latestVitalPoint.maxRED ?? 0}`
                        : 'Sensor Disconnected'
                    }
                  />

                  {/* Blood Pressure: No Sensor */}
                  <SensorGraph
                    title="Blood Pressure"
                    unit="mmHg"
                    dataPoints={currentRealtimeData}
                    dataKey="bpSys"
                    color="#ffc107"
                    yMin={60}
                    yMax={200}
                    displayValue="Unavailable (No Sensor)"
                  />

                  {/* Humidity DHT11 */}
                  <SensorGraph
                    title="Humidity (DHT11)"
                    unit="%"
                    dataPoints={currentRealtimeData}
                    dataKey="humidity"
                    color="#00d2ff"
                    yMin={10}
                    yMax={100}
                    displayValue={latestVitalPoint.humidity != null ? `${latestVitalPoint.humidity}%` : '--'}
                  />
                </div>
              </div>

              {/* ── AD8232 ECG Oscilloscope Card ────────────────────────────── */}
              <div className="glass-panel" style={{ padding: '1.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                    <Activity size={20} color="#00f0ff" />
                    <div>
                      <h2 style={{ fontSize: '1.1rem', fontWeight: 600, margin: 0 }}>AD8232 Electrocardiogram (ECG)</h2>
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                        Analog A0 Signal Trace • Lead-off LO+: <b>{latestVitalPoint.loPlus ?? (latestVitalPoint.leadOffPlus ? 1 : 0)}</b> | LO-: <b>{latestVitalPoint.loMinus ?? (latestVitalPoint.leadOffMinus ? 1 : 0)}</b>
                      </span>
                    </div>
                  </div>
                  <span className={`badge ${(latestVitalPoint.leadOffPlus || latestVitalPoint.leadOffMinus || latestVitalPoint.loPlus === 1 || latestVitalPoint.loMinus === 1) ? 'badge-critical' : 'badge-stable'}`}>
                    {(latestVitalPoint.leadOffPlus || latestVitalPoint.leadOffMinus || latestVitalPoint.loPlus === 1 || latestVitalPoint.loMinus === 1) ? '⚠ LEADS OFF' : '● Trace Active'}
                  </span>
                </div>

                {(latestVitalPoint.leadOffPlus || latestVitalPoint.leadOffMinus || latestVitalPoint.loPlus === 1 || latestVitalPoint.loMinus === 1) && (
                  <div style={{ padding: '0.85rem 1rem', background: 'rgba(255, 77, 79, 0.15)', border: '1px solid rgba(255, 77, 79, 0.4)', borderRadius: '8px', color: '#ff4d4f', fontSize: '0.85rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
                    <AlertTriangle size={18} />
                    <span>ECG LEADS DISCONNECTED — LO+ or LO- Active! Verify AD8232 electrode pads on patient chest (RA, LA, RL).</span>
                  </div>
                )}

                <SensorGraph
                  title="AD8232 Continuous ECG Waveform"
                  unit="ADC"
                  dataPoints={currentRealtimeData}
                  dataKey="ecg_val"
                  color="#00f0ff"
                  yMin={0}
                  yMax={1024}
                  displayValue={
                    (latestVitalPoint.leadOffPlus || latestVitalPoint.leadOffMinus || latestVitalPoint.loPlus === 1 || latestVitalPoint.loMinus === 1)
                      ? 'LEADS DISCONNECTED'
                      : (latestVitalPoint.ecg_val != null ? `${latestVitalPoint.ecg_val} ADC (0-1023)` : '--')
                  }
                />
              </div>

              {/* ── Environmental, Air Quality, IMU & GPS Hardware Suite ──────── */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1.25rem' }}>
                {/* DHT11 & BMP280 Environmental + MQ-135 Gas Card */}
                <div className="glass-panel" style={{ padding: '1.25rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
                    <Gauge size={18} color="var(--accent-primary)" />
                    <h3 style={{ fontSize: '1rem', fontWeight: 600, margin: 0 }}>Environment & Air Quality</h3>
                  </div>

                  {latestVitalPoint.mq135 === 'ALERT' && (
                    <div style={{ padding: '0.6rem 0.8rem', background: 'rgba(255,77,79,0.18)', border: '1px solid rgba(255,77,79,0.5)', borderRadius: '6px', color: '#ff4d4f', fontSize: '0.8rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.85rem' }}>
                      <Flame size={15} /> HAZARDOUS GAS / SMOKE DETECTED (MQ-135 LOW)!
                    </div>
                  )}

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', fontSize: '0.85rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.4rem 0', borderBottom: '1px solid var(--glass-border)' }}>
                      <span style={{ color: 'var(--text-secondary)' }}>DHT11 Humidity:</span>
                      <b>{latestVitalPoint.humidity != null ? `${latestVitalPoint.humidity} %` : '--'}</b>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.4rem 0', borderBottom: '1px solid var(--glass-border)' }}>
                      <span style={{ color: 'var(--text-secondary)' }}>BMP280 Barometric Pressure:</span>
                      <b>{latestVitalPoint.pressure != null ? `${latestVitalPoint.pressure} hPa` : '--'}</b>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.4rem 0' }}>
                      <span style={{ color: 'var(--text-secondary)' }}>MQ-135 Digital State:</span>
                      <span className={`badge ${latestVitalPoint.mq135 === 'ALERT' ? 'badge-critical' : 'badge-stable'}`}>
                        {latestVitalPoint.mq135Digital != null ? `Digital: ${latestVitalPoint.mq135Digital}` : (latestVitalPoint.mq135 === 'ALERT' ? '0 (LOW Alert)' : '1 (HIGH Normal)')}
                      </span>
                    </div>
                  </div>
                </div>

                {/* MPU-6050 Motion / IMU & GPS Geolocation Card */}
                <div className="glass-panel" style={{ padding: '1.25rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
                    <Navigation size={18} color="#00d2ff" />
                    <h3 style={{ fontSize: '1rem', fontWeight: 600, margin: 0 }}>Motion & Geolocation</h3>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', fontSize: '0.85rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.4rem 0', borderBottom: '1px solid var(--glass-border)' }}>
                      <span style={{ color: 'var(--text-secondary)' }}>MPU6050 Accel (X,Y,Z):</span>
                      <code>{latestVitalPoint.accelX ?? 0}, {latestVitalPoint.accelY ?? 0}, {latestVitalPoint.accelZ ?? 0}</code>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.4rem 0', borderBottom: '1px solid var(--glass-border)' }}>
                      <span style={{ color: 'var(--text-secondary)' }}>MPU6050 Gyro (X,Y,Z):</span>
                      <code>{latestVitalPoint.gyroX ?? 0}, {latestVitalPoint.gyroY ?? 0}, {latestVitalPoint.gyroZ ?? 0}</code>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.4rem 0' }}>
                      <span style={{ color: 'var(--text-secondary)' }}>GPS NEO-M8N:</span>
                      <b>
                        {latestVitalPoint.gpsFix || latestVitalPoint.gpsSat > 0
                          ? `Fix Active (${latestVitalPoint.gpsSat ?? 0} Sats)`
                          : 'No Fix (Outdoor sight needed)'}
                      </b>
                    </div>
                  </div>
                </div>
              </div>

              {/* Historical Vitals Trend */}
              <div className="glass-panel" style={{ padding: '1.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                  <div>
                    <h2 style={{ fontSize: '1.1rem', fontWeight: 600, margin: 0 }}>Historical Vitals Averaged Logs</h2>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>1-minute aggregated vital readings</span>
                  </div>
                  <span className="badge badge-info">1-Min Average</span>
                </div>
                <HistoryBarGraph
                  title="Heart Rate Average Log"
                  dataPoints={history}
                  dataKey="hr"
                  color="#3a7bd5"
                  yMin={40}
                  yMax={160}
                  unit="BPM"
                />
              </div>

            </div> {/* END LEFT COLUMN */}

            {/* ── RIGHT COLUMN: Clinical Actions & Threshold Controls ───────── */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', minWidth: 0 }}>

              {/* Medicine Reminders Panel */}
              <div className="glass-panel" style={{ padding: '1.25rem' }}>
                <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--accent-primary)' }}>
                  <span>💊</span> Prescribed Reminders
                </h2>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {reminders.map(reminder => (
                    <div
                      key={reminder.id}
                      style={{
                        padding: '0.85rem',
                        borderRadius: '10px',
                        background: 'rgba(0,0,0,0.25)',
                        borderLeft: `4px solid ${reminder.status === 'Completed' ? 'var(--success)' : 'var(--warning)'}`
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
                        <span style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--text-primary)' }}>
                          🔔 {reminder.time}
                        </span>
                        <span className={`badge ${reminder.status === 'Completed' ? 'badge-stable' : 'badge-warning'}`} style={{ fontSize: '0.68rem', padding: '2px 6px' }}>
                          {reminder.status}
                        </span>
                      </div>
                      <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
                        <b style={{ color: 'var(--accent-primary)' }}>{reminder.medicine}</b>
                      </div>
                      {reminder.status === 'Pending' && (
                        <button
                          onClick={() => handleMarkGiven(reminder.id)}
                          className="btn-primary btn-sm"
                          style={{ width: '100%', padding: '0.35rem', fontSize: '0.78rem' }}
                        >
                          Mark Administered
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Threshold Parameters Form */}
              <div className="glass-panel" style={{ padding: '1.25rem', border: '1px solid var(--warning-border)' }}>
                <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--warning)' }}>
                  <Settings size={18} /> Safety Thresholds
                </h2>
                <form onSubmit={saveThresholds} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <div style={{ background: 'rgba(0,0,0,0.25)', padding: '0.75rem', borderRadius: '8px', borderLeft: '3px solid #ff4d4f' }}>
                    <label style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', color: '#ff4d4f', fontWeight: 600, marginBottom: '0.4rem' }}>
                      Heart Rate Limits (BPM)
                    </label>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                      <input type="number" name="hr_min" placeholder="Min" value={thresholds.hr_min || ''} onChange={handleThresholdChange} className="glass-input" style={{ padding: '0.4rem 0.6rem', fontSize: '0.8rem' }} />
                      <input type="number" name="hr_max" placeholder="Max" value={thresholds.hr_max || ''} onChange={handleThresholdChange} className="glass-input" style={{ padding: '0.4rem 0.6rem', fontSize: '0.8rem' }} />
                    </div>
                  </div>

                  <div style={{ background: 'rgba(0,0,0,0.25)', padding: '0.75rem', borderRadius: '8px', borderLeft: '3px solid #ffc107' }}>
                    <label style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', color: '#ffc107', fontWeight: 600, marginBottom: '0.4rem' }}>
                      Max Systolic/Diastolic (mmHg)
                    </label>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                      <input type="number" name="bp_sys_max" placeholder="Sys Max" value={thresholds.bp_sys_max || ''} onChange={handleThresholdChange} className="glass-input" style={{ padding: '0.4rem 0.6rem', fontSize: '0.8rem' }} />
                      <input type="number" name="bp_dia_max" placeholder="Dia Max" value={thresholds.bp_dia_max || ''} onChange={handleThresholdChange} className="glass-input" style={{ padding: '0.4rem 0.6rem', fontSize: '0.8rem' }} />
                    </div>
                  </div>

                  <button type="submit" className="btn-secondary btn-sm" style={{ width: '100%', borderColor: 'var(--warning-border)', color: 'var(--warning)', fontWeight: 600 }}>
                    Save Threshold Limits
                  </button>
                </form>
              </div>

              {/* Patient Precautions & Clinical Notes */}
              <div className="glass-panel" style={{ padding: '1.25rem' }}>
                <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#ff4d4f' }}>
                  <span>📋</span> Care Precautions
                </h2>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1rem', maxHeight: '180px', overflowY: 'auto' }}>
                  {precautions.map((p, index) => (
                    <div key={index} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,77,79,0.08)', padding: '0.5rem 0.75rem', borderRadius: '6px', border: '1px solid rgba(255,77,79,0.2)' }}>
                      <span style={{ fontSize: '0.82rem', color: 'var(--text-primary)' }}>{p}</span>
                      <button onClick={() => handleRemovePrecaution(index)} style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', padding: '2px' }}>
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))}
                </div>

                <form onSubmit={handleAddPrecaution} style={{ display: 'flex', gap: '0.5rem' }}>
                  <input
                    className="glass-input"
                    placeholder="Add care precaution..."
                    value={newPrecaution}
                    onChange={e => setNewPrecaution(e.target.value)}
                    style={{ padding: '0.4rem 0.75rem', fontSize: '0.8rem' }}
                  />
                  <button type="submit" className="btn-primary btn-sm" style={{ padding: '0.4rem 0.75rem' }}>
                    <Plus size={14} /> Add
                  </button>
                </form>
              </div>

            </div> {/* END RIGHT COLUMN */}

          </div>
        </div>
      )}

      {/* ── ADD PATIENT MODAL ────────────────────────────────────────────── */}
      {isAddModalOpen && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '1rem' }}>
          <div className="glass-panel fade-in" style={{ padding: '2rem', width: '100%', maxWidth: '520px', position: 'relative', border: '1px solid var(--accent-primary)' }}>
            <h2 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: '1.5rem', borderBottom: '1px solid var(--glass-border)', paddingBottom: '0.75rem', color: 'var(--accent-primary)' }}>
              Register New Patient Record
            </h2>

            <form onSubmit={handleAddPatientSubmit} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.4rem', textTransform: 'uppercase' }}>Full Name *</label>
                <input required type="text" name="name" value={newPatientForm.name} onChange={handleNewPatientChange} className="glass-input" placeholder="e.g. John Doe" />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.4rem', textTransform: 'uppercase' }}>Age *</label>
                <input required type="number" name="age" value={newPatientForm.age} onChange={handleNewPatientChange} className="glass-input" placeholder="e.g. 45" />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.4rem', textTransform: 'uppercase' }}>Gender</label>
                <select name="gender" value={newPatientForm.gender} onChange={handleNewPatientChange} className="glass-select">
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                  <option value="Other">Other</option>
                  <option value="Not Specified">Not Specified</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.4rem', textTransform: 'uppercase' }}>Room Number *</label>
                <input required type="text" name="room_number" value={newPatientForm.room_number} onChange={handleNewPatientChange} className="glass-input" placeholder="e.g. 204" />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.4rem', textTransform: 'uppercase' }}>Blood Group</label>
                <select name="blood_group" value={newPatientForm.blood_group} onChange={handleNewPatientChange} className="glass-select">
                  <option value="">Select Blood Group</option>
                  <option value="A+">A+</option>
                  <option value="A-">A-</option>
                  <option value="B+">B+</option>
                  <option value="B-">B-</option>
                  <option value="AB+">AB+</option>
                  <option value="AB-">AB-</option>
                  <option value="O+">O+</option>
                  <option value="O-">O-</option>
                </select>
              </div>

              <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '1rem' }}>
                <button type="button" onClick={() => setIsAddModalOpen(false)} style={{ background: 'transparent', border: '1px solid var(--glass-border)', color: 'var(--text-secondary)', padding: '0.6rem 1.25rem', borderRadius: '8px', cursor: 'pointer' }}>Cancel</button>
                <button type="submit" className="btn-primary">Register Patient</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── ESP8266 HARDWARE CONNECTION MODAL ────────────────────────────── */}
      {showHardwareModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.78)', backdropFilter: 'blur(5px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '1rem' }}>
          <div className="glass-panel fade-in" style={{ padding: '2rem', width: '100%', maxWidth: '580px', position: 'relative', border: '1px solid var(--accent-primary)', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', borderBottom: '1px solid var(--glass-border)', paddingBottom: '0.75rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <Cpu size={22} color="var(--accent-primary)" />
                <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                  ESP8266 Hardware Link
                </h2>
              </div>
              <button onClick={() => setShowHardwareModal(false)} style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '1.2rem' }}>
                ✕
              </button>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.85rem 1rem', background: deviceStatus.online ? 'rgba(32, 201, 151, 0.12)' : 'rgba(255, 193, 7, 0.12)', border: `1px solid ${deviceStatus.online ? 'var(--status-stable)' : 'var(--warning)'}`, borderRadius: '10px', marginBottom: '1.25rem' }}>
              <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: deviceStatus.online ? 'var(--status-stable)' : 'var(--warning)', boxShadow: deviceStatus.online ? '0 0 8px var(--status-stable)' : 'none' }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: '0.9rem', color: deviceStatus.online ? 'var(--status-stable)' : 'var(--warning)' }}>
                  Status: {deviceStatus.online ? 'ESP8266 CONNECTED & TRANSMITTING' : 'WAITING FOR HARDWARE / OFFLINE'}
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                  {deviceStatus.online ? `Last packet received: ${deviceStatus.secondsAgo != null ? `${deviceStatus.secondsAgo}s ago` : 'just now'}` : 'No live telemetry packets received in the last 10 seconds.'}
                </div>
              </div>
            </div>

            {/* Mode 1: Polling ESP8266 IP */}
            <form onSubmit={handleSaveHardwareConfig} style={{ marginBottom: '1.5rem' }}>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.35rem' }}>
                Option A: Connect via ESP8266 Web Server IP
              </label>
              <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', margin: '0 0 0.75rem 0' }}>
                If your ESP8266 serves <code>GET /data</code> on your Wi-Fi, enter its IP address below. SWASTHYAEDGE will automatically poll it every 1.5 seconds.
              </p>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <input
                  type="text"
                  value={ipInput}
                  onChange={(e) => setIpInput(e.target.value)}
                  placeholder="e.g. 192.168.1.105 or 10.173.x.x"
                  className="glass-input"
                  style={{ flex: 1, fontFamily: 'monospace' }}
                />
                <button type="submit" disabled={savingHardware} className="btn-primary" style={{ whiteSpace: 'nowrap' }}>
                  {savingHardware ? 'Connecting...' : 'Save & Poll'}
                </button>
              </div>
              {hardwareConfig.lastPollStatus === 'ERROR' && (
                <div style={{ fontSize: '0.75rem', color: 'var(--danger)', marginTop: '0.4rem' }}>
                  Poll Error: {hardwareConfig.lastPollError}
                </div>
              )}
            </form>

            {/* Mode 2: ESP8266 HTTP POST Address */}
            <div style={{ padding: '1rem', background: 'rgba(0, 210, 255, 0.05)', border: '1px solid rgba(0, 210, 255, 0.2)', borderRadius: '10px', marginBottom: '1.5rem' }}>
              <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--accent-primary)', marginBottom: '0.35rem' }}>
                Option B: ESP8266 Direct HTTP POST Address
              </div>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', margin: '0 0 0.5rem 0' }}>
                If your ESP8266 Arduino code is configured to POST JSON packets directly, configure it to send to this Local Wi-Fi address:
              </p>
              <div style={{ background: 'rgba(0,0,0,0.4)', padding: '0.5rem 0.75rem', borderRadius: '6px', fontFamily: 'monospace', fontSize: '0.82rem', color: '#00d2ff', wordBreak: 'break-all', userSelect: 'all' }}>
                {hardwareConfig.lanIngestionUrl || `http://${window.location.hostname}:5001/api/telemetry/esp8266`}
              </div>
            </div>

            {/* Test Hardware Pulse */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '1rem', borderTop: '1px solid var(--glass-border)' }}>
              <button
                type="button"
                onClick={handleTriggerTestPulse}
                className="btn-secondary"
                style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem' }}
              >
                <Radio size={14} color="var(--accent-primary)" />
                {pulseSuccess ? '✓ Test Pulse Sent!' : 'Send Test Hardware Pulse'}
              </button>
              <button
                type="button"
                onClick={() => setShowHardwareModal(false)}
                className="btn-secondary"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DoctorDashboard;
