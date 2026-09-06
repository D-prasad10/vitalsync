import { useState, useEffect } from 'react';
import { Activity, ShieldAlert, PhoneCall, Stethoscope, Pencil, Check, X, User, HeartPulse, AlertTriangle, Users } from 'lucide-react';
import SensorGraph from '../components/SensorGraph';
import HealthScorePanel from '../components/HealthScorePanel';
import PatientCard from '../components/PatientCard';

const CaretakerDashboard = ({ socket, globalRealtimeData = {} }) => {
  const [patients, setPatients] = useState([]);
  const [activePatient, setActivePatient] = useState(null);
  const [history, setHistory] = useState([]);
  const [contactEdit, setContactEdit] = useState({ guardian: false, doctor: false });
  const [contactValues, setContactValues] = useState({ guardian_contact: '', doctor_name: '', doctor_phone: '' });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('http://localhost:5001/api/patients')
      .then(res => res.json())
      .then(data => {
        const list = Array.isArray(data) ? data : [];
        setPatients(list);
        if (list.length > 0) selectPatient(list[0]);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const selectPatient = (p) => {
    setActivePatient(p);
    setContactValues({
      guardian_contact: p.guardian_contact || '',
      doctor_name: p.doctor_name || '',
      doctor_phone: p.doctor_phone || ''
    });
    setContactEdit({ guardian: false, doctor: false });

    fetch(`http://localhost:5001/api/patients/${p.id}/history`)
      .then(res => res.json())
      .then(data => setHistory(Array.isArray(data) ? data : []))
      .catch(() => setHistory([]));
  };

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

  const currentRealtimeData = (activePatient && globalRealtimeData[activePatient.id]) ? globalRealtimeData[activePatient.id] : [];
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

  return (
    <div className="fade-in caretaker-dashboard-container">
      {/* ── CARETAKER HEADER ────────────────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.75rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 className="glass-header" style={{ marginBottom: '0.2rem' }}>Caretaker Monitoring Station</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', margin: 0 }}>
            Monitor assigned patients, track live vital streams, and handle emergency contacts
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <span className="badge badge-stable" style={{ padding: '0.4rem 0.85rem' }}>
            ● Active Telemetry Feed
          </span>
        </div>
      </div>

      {/* ── 2-COLUMN RESPONSIVE LAYOUT (PATIENT LIST & MONITORING) ───────── */}
      <div className="dashboard-grid-layout" style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: '1.5rem', alignItems: 'start' }}>

        {/* ── LEFT COLUMN: PATIENT SELECTION LIST ────────────────────────── */}
        <div className="glass-panel" style={{ padding: '1.25rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', paddingBottom: '0.5rem', borderBottom: '1px solid var(--glass-border)' }}>
            <h2 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)', margin: 0, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <Users size={16} style={{ color: 'var(--accent-primary)' }} /> Patients ({patients.length})
            </h2>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
            {loading ? (
              <div className="empty-state" style={{ padding: '2rem 1rem' }}>
                <div className="loading-spinner" />
                <span style={{ fontSize: '0.8rem' }}>Loading patient roster...</span>
              </div>
            ) : patients.length === 0 ? (
              <div className="empty-state" style={{ padding: '2rem 1rem' }}>
                <User size={28} />
                <span style={{ fontSize: '0.85rem' }}>No patients assigned</span>
              </div>
            ) : (
              patients.map(p => (
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

        {/* ── RIGHT COLUMN: SELECTED PATIENT CLINICAL OVERVIEW ───────────── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', minWidth: 0 }}>

          {activePatient ? (
            <>
              {/* Selected Patient Banner */}
              <div className="glass-panel" style={{ padding: '1.25rem 1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  <div className="patient-avatar" style={{ width: '52px', height: '52px', fontSize: '1.15rem' }}>
                    {(activePatient.name || 'Patient').trim().split(/\s+/).map(n => n[0] || '').join('').substring(0, 2).toUpperCase() || 'PT'}
                  </div>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                      <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>{activePatient.name}</h2>
                      <span className={`badge ${getPatientStatus(activePatient.id) === 'Critical' ? 'badge-critical' : getPatientStatus(activePatient.id) === 'Warning' ? 'badge-warning' : 'badge-stable'}`}>
                        {getPatientStatus(activePatient.id)}
                      </span>
                    </div>
                    <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginTop: '0.2rem', display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                      <span>Room: <b>{activePatient.room_number || 'N/A'}</b></span>
                      <span>•</span>
                      <span>Blood: <b style={{ color: '#ff4d4f' }}>{activePatient.blood_group || 'N/A'}</b></span>
                      <span>•</span>
                      <span>Age: <b>{activePatient.age || '--'}</b></span>
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <span className="badge badge-info" style={{ padding: '0.35rem 0.75rem' }}>
                    ID: PT-00{activePatient.id}
                  </span>
                </div>
              </div>

              {/* Emergency Warning Card if Status Critical */}
              {getPatientStatus(activePatient.id) === 'Critical' && (
                <div className="glass-panel alert-card" style={{ padding: '1.25rem', borderLeft: '4px solid var(--danger)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--danger)', marginBottom: '0.4rem' }}>
                    <ShieldAlert size={20} />
                    <h3 style={{ fontSize: '1.05rem', fontWeight: 700, margin: 0 }}>HIGH RISK ALERT DETECTED</h3>
                  </div>
                  <p style={{ color: 'var(--text-primary)', fontSize: '0.875rem', margin: 0 }}>
                    Patient <strong>{activePatient.name}</strong> has entered a high-risk vital range. Please verify quick contacts below and notify the attending physician.
                  </p>
                </div>
              )}

              {/* Health Score Component */}
              <HealthScorePanel currentData={currentRealtimeData} historyData={history} />

              {/* Live Vitals Telemetry Grid */}
              <div className="glass-panel" style={{ padding: '1.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                  <h2 style={{ fontSize: '1.1rem', fontWeight: 600, margin: 0 }}>Live Vital Sensor Feeds</h2>
                  <span className="badge badge-stable">● Real-time Stream</span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.25rem' }}>
                  <SensorGraph
                    title="Heart Rate"
                    unit="BPM"
                    dataPoints={currentRealtimeData}
                    dataKey="hr"
                    color="#ff4d4f"
                    yMin={40}
                    yMax={160}
                  />
                  <SensorGraph
                    title="SpO2 Oxygen"
                    unit="%"
                    dataPoints={currentRealtimeData}
                    dataKey="spo2"
                    color="#00d2ff"
                    yMin={70}
                    yMax={100}
                  />
                  <SensorGraph
                    title="BP Systolic"
                    unit="mmHg"
                    dataPoints={currentRealtimeData}
                    dataKey="bpSys"
                    color="#ffc107"
                    yMin={60}
                    yMax={200}
                    displayValue={latestPoint.bpSys ? `${latestPoint.bpSys} / ${latestPoint.bpDia || '--'}` : '--'}
                  />
                  <SensorGraph
                    title="Temperature"
                    unit="°F"
                    dataPoints={currentRealtimeData}
                    dataKey="temp"
                    color="#20c997"
                    yMin={94}
                    yMax={108}
                  />
                </div>
              </div>

              {/* Quick Contacts & Actions Area */}
              <div className="glass-panel" style={{ padding: '1.5rem' }}>
                <h2 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <PhoneCall size={18} style={{ color: 'var(--accent-primary)' }} /> Emergency Quick Contacts & Escalation
                </h2>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.25rem' }}>

                  {/* Guardian Contact Card */}
                  <div className="glass-panel" style={{ padding: '1.25rem', background: 'rgba(255,193,7,0.04)', border: '1px solid rgba(255,193,7,0.25)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <ShieldAlert size={16} style={{ color: 'var(--warning)' }} />
                        <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--warning)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                          Guardian / Family
                        </span>
                      </div>

                      {!contactEdit.guardian ? (
                        <button
                          onClick={() => setContactEdit(p => ({ ...p, guardian: true }))}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.75rem', padding: '2px 6px', borderRadius: '4px' }}
                        >
                          <Pencil size={12} /> Edit
                        </button>
                      ) : (
                        <div style={{ display: 'flex', gap: '0.35rem' }}>
                          <button
                            onClick={() => saveContact('guardian')}
                            style={{ background: 'rgba(32,201,151,0.15)', border: '1px solid rgba(32,201,151,0.3)', color: 'var(--success)', borderRadius: '4px', padding: '2px 8px', cursor: 'pointer', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}
                          >
                            <Check size={12} /> Save
                          </button>
                          <button
                            onClick={() => {
                              setContactValues(v => ({ ...v, guardian_contact: activePatient.guardian_contact || '' }));
                              setContactEdit(p => ({ ...p, guardian: false }));
                            }}
                            style={{ background: 'rgba(255,77,79,0.1)', border: '1px solid rgba(255,77,79,0.2)', color: 'var(--danger)', borderRadius: '4px', padding: '2px 6px', cursor: 'pointer', fontSize: '0.75rem' }}
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
                        style={{ width: '100%', borderColor: 'rgba(255,193,7,0.3)', color: 'var(--warning)', background: 'rgba(255,193,7,0.1)', minHeight: '40px' }}
                      >
                        <PhoneCall size={15} /> Call Guardian
                      </a>
                    )}
                  </div>

                  {/* Doctor Contact Card */}
                  <div className="glass-panel" style={{ padding: '1.25rem', background: 'rgba(0,210,255,0.04)', border: '1px solid rgba(0,210,255,0.25)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Stethoscope size={16} style={{ color: 'var(--accent-primary)' }} />
                        <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--accent-primary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                          Attending Physician
                        </span>
                      </div>

                      {!contactEdit.doctor ? (
                        <button
                          onClick={() => setContactEdit(p => ({ ...p, doctor: true }))}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.75rem', padding: '2px 6px', borderRadius: '4px' }}
                        >
                          <Pencil size={12} /> Edit
                        </button>
                      ) : (
                        <div style={{ display: 'flex', gap: '0.35rem' }}>
                          <button
                            onClick={() => saveContact('doctor')}
                            style={{ background: 'rgba(32,201,151,0.15)', border: '1px solid rgba(32,201,151,0.3)', color: 'var(--success)', borderRadius: '4px', padding: '2px 8px', cursor: 'pointer', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}
                          >
                            <Check size={12} /> Save
                          </button>
                          <button
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
            </>
          ) : (
            <div className="glass-panel empty-state" style={{ padding: '4rem 2rem' }}>
              <User size={36} />
              <span style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--text-primary)' }}>No Patient Selected</span>
              <span style={{ fontSize: '0.85rem' }}>Select a patient from the roster on the left to view real-time vital streams and contacts.</span>
            </div>
          )}

        </div> {/* END RIGHT COLUMN */}

      </div>
    </div>
  );
};

export default CaretakerDashboard;
