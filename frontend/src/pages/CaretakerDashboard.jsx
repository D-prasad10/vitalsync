import { useState, useEffect, useCallback } from 'react';
import { Activity, ShieldAlert, PhoneCall, Stethoscope, Pencil, Check, X, User, AlertTriangle, Users, Search, Heart, Wind, Thermometer } from 'lucide-react';
import SensorGraph from '../components/SensorGraph';
import HealthScorePanel from '../components/HealthScorePanel';
import PatientCard from '../components/PatientCard';
import EmergencyAlertPanel from '../components/EmergencyAlertPanel';
import { useRealtimeData, seedPatientTelemetry } from '../utils/telemetryStore';

const CaretakerDashboard = () => {
  const globalRealtimeData = useRealtimeData();
  const [patients, setPatients] = useState([]);
  const [activePatient, setActivePatient] = useState(null);
  const [history, setHistory] = useState([]);
  const [contactEdit, setContactEdit] = useState({ guardian: false, doctor: false });
  const [contactValues, setContactValues] = useState({ guardian_contact: '', doctor_name: '', doctor_phone: '' });
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);

  const selectPatient = useCallback((p) => {
    setActivePatient(p);
    setContactValues({
      guardian_contact: p.guardian_contact || '',
      doctor_name: p.doctor_name || '',
      doctor_phone: p.doctor_phone || ''
    });
    setContactEdit({ guardian: false, doctor: false });

    fetch(`http://localhost:5001/api/patients/${p.id}/history`)
      .then(res => res.json())
      .then(data => {
        const hist = Array.isArray(data) ? data : [];
        setHistory(hist);
        if (hist.length > 0) {
          seedPatientTelemetry(p.id, hist);
        }
      })
      .catch(() => setHistory([]));
  }, []);

  useEffect(() => {
    let mounted = true;
    fetch('http://localhost:5001/api/patients')
      .then(res => res.json())
      .then(data => {
        if (!mounted) return;
        const list = Array.isArray(data) ? data : [];
        setPatients(list);
        if (list.length > 0) selectPatient(list[0]);
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
        setLoading(false);
      })
      .catch(() => { if (mounted) setLoading(false); });

    return () => { mounted = false; };
  }, [selectPatient]);

  const saveContact = async (field) => {
    if (!activePatient) return;
    const updated = { ...activePatient, ...contactValues };
    try {
      const res = await fetch(`http://localhost:5001/api/patients/${activePatient.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated),
      });
      const data = await res.json();
      if (data.success) {
        setActivePatient(updated);
        setPatients(prev => prev.map(p => p.id === updated.id ? updated : p));
      }
    } catch (e) {
      console.error('Failed to update contact:', e);
    }
    setContactEdit(prev => ({ ...prev, [field]: false }));
  };

  const realtimeForPatient = (activePatient && globalRealtimeData[activePatient.id]) ? globalRealtimeData[activePatient.id] : [];
  const currentRealtimeData = realtimeForPatient.length > 0 ? realtimeForPatient : history;
  const latestPoint = currentRealtimeData.length > 0 ? currentRealtimeData[currentRealtimeData.length - 1] : {};

  // Status helper
  const getPatientStatus = (patientId) => {
    const data = globalRealtimeData[patientId];
    if (!data || data.length === 0) return 'Stable';
    const latest = data[data.length - 1];
    const score = latest.healthScore ?? latest.health_score ?? 100;
    const hr = latest.hr ?? latest.heart_rate;
    const spo2 = latest.spo2;
    const temp = latest.temp ?? latest.temperature;

    if (score < 50 || (spo2 && spo2 < 90) || (hr && (hr > 120 || hr < 40)) || (temp && temp > 103)) return 'Critical';
    if (score < 80 || (spo2 && spo2 < 95) || (hr && (hr > 100 || hr < 50)) || (temp && temp > 100.4)) return 'Warning';
    return 'Stable';
  };

  const filteredPatients = patients.filter(p =>
    (p.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
    (p.room_number || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="fade-in caretaker-dashboard-layout">
      {/* ── 1. MAIN CONTENT AREA (HEADER, PATIENT OVERVIEW & TELEMETRY) ── */}
      <div className="caretaker-main-content">
        {/* ── CARETAKER STATION HEADER ────────────────────────────────────── */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h1 className="glass-header" style={{ marginBottom: '0.2rem' }}>Caretaker Monitoring Station</h1>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', margin: 0 }}>
              Continuous physiological telemetry, patient overview, and emergency escalation
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <span className="badge badge-stable" style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '0.4rem 0.85rem' }}>
              <span className="pulse-dot" style={{ width: '7px', height: '7px', backgroundColor: '#10b981' }} />
              Live Hardware Stream
            </span>
          </div>
        </div>

        {/* ── 1. TOP SECTION: PATIENT LIST (LEFT) & SELECTED PATIENT OVERVIEW WITH VITALS (RIGHT) ── */}
        <div className="caretaker-top-section">

          {/* LEFT COLUMN: PATIENT LIST ROSTER */}
          <div className="caretaker-patients-box">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', paddingBottom: '0.5rem', borderBottom: '1px solid var(--border-light)' }}>
              <h2 style={{ fontSize: '0.98rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0, display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                <Users size={17} style={{ color: 'var(--accent-primary)' }} /> Patients ({patients.length})
              </h2>
              <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--accent-primary)', background: 'var(--accent-subtle, #eff6ff)', padding: '2px 7px', borderRadius: '12px' }}>
                Active Roster
              </span>
            </div>

            {/* Quick Filter / Search Bar */}
            <div style={{ marginBottom: '0.65rem', position: 'relative' }}>
              <input
                type="text"
                placeholder="Search by name or room..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.45rem 0.65rem 0.45rem 2rem',
                  background: '#f8fafc',
                  border: '1px solid var(--border-light)',
                  borderRadius: '6px',
                  fontSize: '0.8rem',
                  color: 'var(--text-primary)',
                  outline: 'none',
                  boxSizing: 'border-box'
                }}
              />
              <Search size={13} style={{ position: 'absolute', left: '0.65rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)', pointerEvents: 'none' }} />
            </div>

            {/* Scrollable Patient List */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', overflowY: 'auto', maxHeight: '255px', paddingRight: '2px' }}>
              {loading ? (
                <div className="empty-state" style={{ padding: '1.5rem 1rem' }}>
                  <div className="loading-spinner" />
                  <span style={{ fontSize: '0.8rem' }}>Loading patient roster...</span>
                </div>
              ) : filteredPatients.length === 0 ? (
                <div className="empty-state" style={{ padding: '1.5rem 1rem' }}>
                  <User size={24} />
                  <span style={{ fontSize: '0.8rem' }}>No patients found</span>
                </div>
              ) : (
                filteredPatients.map(p => (
                  <PatientCard
                    key={p.id}
                    patient={p}
                    status={getPatientStatus(p.id)}
                    isSelected={activePatient?.id === p.id}
                    onClick={() => selectPatient(p)}
                    variant="compact"
                  />
                ))
              )}
            </div>
          </div>

          {/* RIGHT COLUMN: SELECTED PATIENT OVERVIEW WITH VITAL CARDS */}
          {activePatient ? (
            <div className="caretaker-overview-box">
              {/* Selected Patient Identity Banner */}
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '0.75rem',
                paddingBottom: '0.75rem',
                borderBottom: '1px solid var(--border-light)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
                  <div className="patient-avatar" style={{ width: '46px', height: '46px', fontSize: '1.05rem' }}>
                    {(activePatient.name || 'Patient').trim().split(/\s+/).map(n => n[0] || '').join('').substring(0, 2).toUpperCase() || 'PT'}
                  </div>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <h2 style={{ fontSize: '1.15rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>{activePatient.name}</h2>
                      <span className={`badge ${getPatientStatus(activePatient.id) === 'Critical' ? 'badge-critical' : getPatientStatus(activePatient.id) === 'Warning' ? 'badge-warning' : 'badge-stable'}`}>
                        {getPatientStatus(activePatient.id)}
                      </span>
                    </div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.15rem', display: 'flex', gap: '0.65rem', flexWrap: 'wrap' }}>
                      <span>Room: <strong style={{ color: 'var(--text-primary)' }}>{activePatient.room_number || 'N/A'}</strong></span>
                      <span>•</span>
                      <span>Blood: <strong style={{ color: '#dc2626' }}>{activePatient.blood_group || 'N/A'}</strong></span>
                      <span>•</span>
                      <span>Age: <strong style={{ color: 'var(--text-primary)' }}>{activePatient.age || '--'}</strong></span>
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span className="badge badge-info" style={{ padding: '0.3rem 0.65rem', fontWeight: 600, fontSize: '0.75rem' }}>
                    ID: PT-00{activePatient.id}
                  </span>
                  {activePatient.doctor_phone && (
                    <a
                      href={`tel:${activePatient.doctor_phone}`}
                      className="btn-primary"
                      style={{ fontSize: '0.78rem', padding: '0.35rem 0.75rem', display: 'inline-flex', alignItems: 'center', gap: '0.35rem', textDecoration: 'none', borderRadius: '6px', fontWeight: 600 }}
                    >
                      <PhoneCall size={13} /> Call Doctor
                    </a>
                  )}
                </div>
              </div>

              {/* Hardware Sensor Warnings if any */}
              {((latestPoint.leadOffPlus || latestPoint.leadOffMinus) || latestPoint.mq135 === 'ALERT') && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  {(latestPoint.leadOffPlus || latestPoint.leadOffMinus) && (
                    <div style={{ padding: '0.5rem 0.75rem', background: '#fef2f2', border: '1px solid #dc2626', borderLeft: '4px solid #b91c1c', borderRadius: '6px', color: '#b91c1c', fontSize: '0.78rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <AlertTriangle size={14} style={{ color: '#dc2626' }} />
                      <span>ECG LEADS DISCONNECTED — LO+/LO- Active! Reposition AD8232 electrodes.</span>
                    </div>
                  )}
                  {latestPoint.mq135 === 'ALERT' && (
                    <div style={{ padding: '0.5rem 0.75rem', background: '#fef2f2', border: '1px solid #dc2626', borderLeft: '4px solid #b91c1c', borderRadius: '6px', color: '#b91c1c', fontSize: '0.78rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <AlertTriangle size={14} style={{ color: '#dc2626' }} />
                      <span>HAZARDOUS GAS / SMOKE DETECTED — MQ-135 alert triggered!</span>
                    </div>
                  )}
                </div>
              )}

              {/* 4 Patient Vital Mini-Cards */}
              <div className="patient-vitals-grid">
                {/* Heart Rate */}
                <div className="vital-mini-card hr">
                  <div className="vital-mini-header">
                    <div className="vital-mini-icon hr"><Heart size={14} /></div>
                    <span className="vital-mini-title">Heart Rate</span>
                  </div>
                  <div className="vital-mini-value">
                    {latestPoint.hr != null ? latestPoint.hr : (latestPoint.maxIR > 0 ? `IR ${latestPoint.maxIR}` : '72')}
                    <span className="vital-mini-unit">BPM</span>
                  </div>
                  <span className={`vital-mini-badge ${(latestPoint.hr > 120 || (latestPoint.hr && latestPoint.hr < 50)) ? 'critical' : (latestPoint.hr > 100 || (latestPoint.hr && latestPoint.hr < 60)) ? 'warning' : 'stable'}`}>
                    {(latestPoint.hr > 120 || (latestPoint.hr && latestPoint.hr < 50)) ? 'Critical' : (latestPoint.hr > 100 || (latestPoint.hr && latestPoint.hr < 60)) ? 'Warning' : 'Normal'}
                  </span>
                </div>

                {/* SpO2 */}
                <div className="vital-mini-card spo2">
                  <div className="vital-mini-header">
                    <div className="vital-mini-icon spo2"><Wind size={14} /></div>
                    <span className="vital-mini-title">SpO2 Oxygen</span>
                  </div>
                  <div className="vital-mini-value">
                    {latestPoint.spo2 != null ? latestPoint.spo2 : (latestPoint.maxRED > 0 ? `RED ${latestPoint.maxRED}` : '98')}
                    <span className="vital-mini-unit">%</span>
                  </div>
                  <span className={`vital-mini-badge ${(latestPoint.spo2 && latestPoint.spo2 < 90) ? 'critical' : (latestPoint.spo2 && latestPoint.spo2 < 95) ? 'warning' : 'stable'}`}>
                    {(latestPoint.spo2 && latestPoint.spo2 < 90) ? 'Critical' : (latestPoint.spo2 && latestPoint.spo2 < 95) ? 'Warning' : 'Normal'}
                  </span>
                </div>

                {/* Blood Pressure */}
                <div className="vital-mini-card bp">
                  <div className="vital-mini-header">
                    <div className="vital-mini-icon bp"><Activity size={14} /></div>
                    <span className="vital-mini-title">Blood Pressure</span>
                  </div>
                  <div className="vital-mini-value">
                    {latestPoint.bpSys != null ? `${latestPoint.bpSys}/${latestPoint.bpDia || '--'}` : (latestPoint.bmpPress != null ? `${latestPoint.bmpPress} hPa` : '120/80')}
                    <span className="vital-mini-unit">{latestPoint.bpSys != null ? 'mmHg' : ''}</span>
                  </div>
                  <span className={`vital-mini-badge ${(latestPoint.bpSys > 140 || (latestPoint.bpSys && latestPoint.bpSys < 80)) ? 'critical' : (latestPoint.bpSys > 120 || (latestPoint.bpSys && latestPoint.bpSys < 90)) ? 'warning' : 'stable'}`}>
                    {(latestPoint.bpSys > 140 || (latestPoint.bpSys && latestPoint.bpSys < 80)) ? 'Crisis' : (latestPoint.bpSys > 120 || (latestPoint.bpSys && latestPoint.bpSys < 90)) ? 'Elevated' : 'Normal'}
                  </span>
                </div>

                {/* Temperature */}
                <div className="vital-mini-card temp">
                  <div className="vital-mini-header">
                    <div className="vital-mini-icon temp"><Thermometer size={14} /></div>
                    <span className="vital-mini-title">Temperature</span>
                  </div>
                  <div className="vital-mini-value">
                    {latestPoint.dhtTemp != null ? `${latestPoint.dhtTemp}°C` : (latestPoint.temp != null ? `${latestPoint.temp}°F` : '98.6°F')}
                  </div>
                  <span className={`vital-mini-badge ${(latestPoint.temp > 101 || (latestPoint.temp && latestPoint.temp < 95)) ? 'critical' : (latestPoint.temp > 99 || (latestPoint.temp && latestPoint.temp < 97)) ? 'warning' : 'stable'}`}>
                    {(latestPoint.temp > 101 || (latestPoint.temp && latestPoint.temp < 95)) ? 'Fever' : 'Normal'}
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <div className="glass-panel empty-state caretaker-overview-box" style={{ padding: '2.5rem 1.5rem' }}>
              <User size={32} />
              <span style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)' }}>No Patient Selected</span>
              <span style={{ fontSize: '0.8rem' }}>Select a patient from the roster to view real-time vital streams and contacts.</span>
            </div>
          )}

        </div>

        {/* ── 2. PATIENT HEALTH SCORE & TRENDS ────────────────────────────── */}
        <HealthScorePanel currentData={currentRealtimeData} historyData={history} />

        {/* ── 3. EMERGENCY QUICK CONTACTS & ESCALATION ────────────────────── */}
        {activePatient && (
          <div className="glass-panel" style={{
            padding: '1.25rem 1.5rem',
            background: '#ffffff',
            border: '1px solid var(--border-light)',
            borderRadius: '12px',
            boxShadow: 'var(--shadow-sm)'
          }}>
            <h2 style={{ fontSize: '0.98rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <PhoneCall size={17} style={{ color: 'var(--accent-primary)' }} /> Emergency Quick Contacts & Escalation
            </h2>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.25rem' }}>

              {/* Guardian Contact Card */}
              <div className="glass-panel" style={{ padding: '1.25rem', background: '#fffbeb', border: '1px solid #fde68a' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <ShieldAlert size={16} style={{ color: 'var(--warning)' }} />
                    <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--warning)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Guardian / Family
                    </span>
                  </div>

                  {!contactEdit.guardian ? (
                    <button
                      type="button"
                      onClick={() => setContactEdit(p => ({ ...p, guardian: true }))}
                      style={{ background: '#ffffff', border: '1px solid #fde68a', cursor: 'pointer', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.75rem', padding: '3px 8px', borderRadius: '4px' }}
                    >
                      <Pencil size={12} /> Edit
                    </button>
                  ) : (
                    <div style={{ display: 'flex', gap: '0.35rem' }}>
                      <button
                        type="button"
                        onClick={() => saveContact('guardian')}
                        style={{ background: 'var(--success-bg)', border: '1px solid var(--success-border)', color: 'var(--success)', borderRadius: '4px', padding: '2px 8px', cursor: 'pointer', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}
                      >
                        <Check size={12} /> Save
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setContactValues(v => ({ ...v, guardian_contact: activePatient.guardian_contact || '' }));
                          setContactEdit(p => ({ ...p, guardian: false }));
                        }}
                        style={{ background: 'var(--danger-bg)', border: '1px solid var(--danger-border)', color: 'var(--danger)', borderRadius: '4px', padding: '2px 6px', cursor: 'pointer', fontSize: '0.75rem' }}
                      >
                        <X size={12} />
                      </button>
                    </div>
                  )}
                </div>

                {contactEdit.guardian ? (
                  <input
                    className="glass-input"
                    style={{ marginBottom: '0.75rem', fontSize: '0.85rem' }}
                    placeholder="Guardian phone number"
                    value={contactValues.guardian_contact}
                    onChange={e => setContactValues(v => ({ ...v, guardian_contact: e.target.value }))}
                  />
                ) : (
                  <div style={{ fontSize: '0.9rem', color: 'var(--text-primary)', fontWeight: 600, marginBottom: '0.85rem' }}>
                    {activePatient.guardian_contact || <span style={{ color: 'var(--text-muted)', fontStyle: 'italic', fontWeight: 400 }}>No phone configured</span>}
                  </div>
                )}

                {activePatient.guardian_contact && !contactEdit.guardian && (
                  <a
                    href={`tel:${activePatient.guardian_contact}`}
                    className="btn-secondary"
                    style={{ width: '100%', borderColor: 'rgba(217, 119, 6, 0.3)', color: '#b45309', background: '#fef3c7', minHeight: '40px' }}
                  >
                    <PhoneCall size={15} /> Call Guardian
                  </a>
                )}
              </div>

              {/* Doctor Contact Card */}
              <div className="glass-panel" style={{ padding: '1.25rem', background: '#eff6ff', border: '1px solid #bfdbfe' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Stethoscope size={16} style={{ color: 'var(--accent-primary)' }} />
                    <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--accent-primary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Attending Physician
                    </span>
                  </div>

                  {!contactEdit.doctor ? (
                    <button
                      type="button"
                      onClick={() => setContactEdit(p => ({ ...p, doctor: true }))}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.75rem', padding: '2px 6px', borderRadius: '4px' }}
                    >
                      <Pencil size={12} /> Edit
                    </button>
                  ) : (
                    <div style={{ display: 'flex', gap: '0.35rem' }}>
                      <button
                        type="button"
                        onClick={() => saveContact('doctor')}
                        style={{ background: 'rgba(32,201,151,0.15)', border: '1px solid rgba(32,201,151,0.3)', color: 'var(--success)', borderRadius: '4px', padding: '2px 8px', cursor: 'pointer', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}
                      >
                        <Check size={12} /> Save
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setContactValues(v => ({ ...v, doctor_name: activePatient.doctor_name || '', doctor_phone: activePatient.doctor_phone || '' }));
                          setContactEdit(p => ({ ...p, doctor: false }));
                        }}
                        style={{ background: 'rgba(255,77,79,0.1)', border: '1px solid rgba(255,77,79,0.2)', color: 'var(--danger)', borderRadius: '4px', padding: '2px 6px', cursor: 'pointer', fontSize: '0.75rem' }}
                      >
                        <X size={12} />
                      </button>
                    </div>
                  )}
                </div>

                {contactEdit.doctor ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '0.75rem' }}>
                    <input className="glass-input" style={{ fontSize: '0.85rem' }} placeholder="Doctor name" value={contactValues.doctor_name} onChange={e => setContactValues(v => ({ ...v, doctor_name: e.target.value }))} />
                    <input className="glass-input" style={{ fontSize: '0.85rem' }} placeholder="Doctor phone" value={contactValues.doctor_phone} onChange={e => setContactValues(v => ({ ...v, doctor_phone: e.target.value }))} />
                  </div>
                ) : (
                  <div style={{ marginBottom: '0.85rem' }}>
                    <div style={{ fontSize: '0.9rem', color: 'var(--text-primary)', fontWeight: 600 }}>
                      {activePatient.doctor_name || <span style={{ color: 'var(--text-muted)', fontStyle: 'italic', fontWeight: 400 }}>Dr. Smith</span>}
                    </div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                      {activePatient.doctor_phone || <span style={{ fontStyle: 'italic', color: 'var(--text-muted)' }}>No phone configured</span>}
                    </div>
                  </div>
                )}

                {activePatient.doctor_phone && !contactEdit.doctor && (
                  <a
                    href={`tel:${activePatient.doctor_phone}`}
                    className="btn-primary"
                    style={{ width: '100%', minHeight: '40px' }}
                  >
                    <PhoneCall size={15} /> Call Physician
                  </a>
                )}
              </div>

            </div>
          </div>
        )}


      {/* ── 2. FULL-WIDTH TELEMETRY GRAPHS SECTION ─────────────────────── */}
      <div className="caretaker-telemetry-section" style={{
        padding: '1.5rem',
        background: '#ffffff',
        border: '1px solid var(--border-light)',
        borderRadius: '12px',
        boxShadow: 'var(--shadow-sm)',
        width: '100%'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.75rem' }}>
          <div>
            <h2 style={{ fontSize: '1.15rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Activity size={20} style={{ color: 'var(--accent-primary)' }} /> Live Telemetry & Physiological Sensor Streams
            </h2>
            <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
              Continuous IoT sensor telemetry (DHT11, BMP280, MAX30100 optical pulse/SpO2, AD8232 ECG)
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <span className="badge badge-stable" style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '0.35rem 0.85rem' }}>
              <span className="pulse-dot" style={{ width: '7px', height: '7px', backgroundColor: '#10b981' }} />
              Active Telemetry Stream
            </span>
          </div>
        </div>

        {/* Responsive Horizontal Cards Grid spanning 100% available width */}
        <div className="telemetry-graphs-grid">
          {/* 1. Heart Rate (MAX30100) - Deep red/pink */}
          <div className="telemetry-graph-card">
            <SensorGraph
              title="Heart Rate (MAX30100)"
              unit="BPM"
              dataPoints={currentRealtimeData}
              dataKey="hr"
              color="#e11d48"
              yMin={40}
              yMax={160}
              displayValue={
                latestPoint.hr != null
                  ? `${latestPoint.hr} BPM`
                  : (latestPoint.maxIR != null && latestPoint.maxIR > 0 ? `IR ${latestPoint.maxIR}` : '--')
              }
            />
          </div>

          {/* 2. SpO2 Blood Oxygen (MAX30100) - Deep purple */}
          <div className="telemetry-graph-card">
            <SensorGraph
              title="Oxygen Saturation (SpO2)"
              unit="%"
              dataPoints={currentRealtimeData}
              dataKey="spo2"
              color="#7e22ce"
              yMin={70}
              yMax={100}
              displayValue={
                latestPoint.spo2 != null
                  ? `${latestPoint.spo2}%`
                  : (latestPoint.maxRED != null && latestPoint.maxRED > 0 ? `RED ${latestPoint.maxRED}` : '--')
              }
            />
          </div>

          {/* 3. Temperature (DHT11 & BMP280) - Deep blue */}
          <div className="telemetry-graph-card">
            <SensorGraph
              title="Temperature (DHT11 & BMP280)"
              unit="°C"
              dataPoints={currentRealtimeData}
              dataKey="temp"
              color="#1d4ed8"
              yMin={15}
              yMax={45}
              displayValue={
                latestPoint.dhtTemp != null || latestPoint.bmpTemp != null
                  ? `DHT: ${latestPoint.dhtTemp ?? '--'}°C | BMP: ${latestPoint.bmpTemp ?? '--'}°C`
                  : (latestPoint.temp != null ? `${latestPoint.temp}°F` : '--')
              }
            />
          </div>

          {/* 4. Pressure (BMP280 Barometric) - Deep teal */}
          <div className="telemetry-graph-card">
            <SensorGraph
              title="Pressure (BMP280 Barometric)"
              unit="hPa"
              dataPoints={currentRealtimeData}
              dataKey="bmpPress"
              color="#0f766e"
              yMin={900}
              yMax={1100}
              displayValue={
                latestPoint.bmpPress != null
                  ? `${latestPoint.bmpPress} hPa`
                  : (latestPoint.bpSys != null ? `${latestPoint.bpSys}/${latestPoint.bpDia || '--'} mmHg` : 'Unavailable (No Sensor)')
              }
            />
          </div>

          {/* 5. ECG Waveform (AD8232) - Deep blue, spans 2 columns */}
          <div className="telemetry-graph-card ecg-span-2">
            <SensorGraph
              title="ECG Waveform (AD8232)"
              unit="ADC"
              dataPoints={currentRealtimeData}
              dataKey="ecg_val"
              color="#1e40af"
              yMin={0}
              yMax={1024}
              displayValue={
                latestPoint.leadOffPlus || latestPoint.leadOffMinus
                  ? 'Leads Disconnected'
                  : (latestPoint.ecg_val != null
                      ? `${latestPoint.ecg_val} ADC`
                      : (latestPoint.ecg?.value != null ? `${latestPoint.ecg.value} ADC` : 'Live Stream'))
              }
            />
          </div>
        </div>
      </div>
      </div> {/* END caretaker-main-content */}

      {/* ── 2. DEDICATED RIGHT-SIDE EMERGENCY ALERTS SIDEBAR ───────────── */}
      <aside className="caretaker-alerts-sidebar" aria-label="Active Emergency Alerts Sidebar">
        <EmergencyAlertPanel isStationSidebar={true} />
      </aside>
    </div>
  );
};

export default CaretakerDashboard;
