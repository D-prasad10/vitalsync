import { useState, useEffect, useRef, useMemo } from 'react';
import {
  User, Phone, ShieldAlert, Edit2, Save, X, Camera, Users, MapPin,
  Stethoscope, Mail, Heart, Wind, Thermometer, Activity, Search,
  AlertTriangle, CheckCircle2, AlertCircle, Clock, ExternalLink
} from 'lucide-react';
import PatientCard from '../components/PatientCard';
import SensorGraph from '../components/SensorGraph';

const FieldBlock = ({ label, value, editing, name, onChange, type = 'text', children }) => (
  <div className="glass-panel" style={{ padding: '1rem', background: 'rgba(0,0,0,0.15)' }}>
    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>
      {label}
    </div>
    {editing ? (
      children || <input type={type} name={name} value={value || ''} onChange={onChange} className="glass-input" />
    ) : (
      <div style={{ fontSize: '1.05rem', fontWeight: 600, color: 'var(--text-primary)' }}>{value || '—'}</div>
    )}
  </div>
);

const PatientDashboard = ({ socket, globalRealtimeData = {} }) => {
  const [patients, setPatients] = useState([]);
  const [activePatient, setActivePatient] = useState(null);
  const [history, setHistory] = useState([]);
  const [isEditing, setIsEditing] = useState(false);
  const [editFormData, setEditFormData] = useState({});
  const [searchTerm, setSearchTerm] = useState('');
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [fetchingPatients, setFetchingPatients] = useState(true);
  const fileInputRef = useRef(null);

  const handleSelectPatient = (patient) => {
    setActivePatient(patient);
    setEditFormData(patient);
    setIsEditing(false);
    setLoadingHistory(true);

    fetch(`http://localhost:5001/api/patients/${patient.id}/history`)
      .then(res => res.json())
      .then(data => {
        setHistory(Array.isArray(data) ? data : []);
        setLoadingHistory(false);
      })
      .catch(() => {
        setHistory([]);
        setLoadingHistory(false);
      });
  };

  useEffect(() => {
    setFetchingPatients(true);
    fetch('http://localhost:5001/api/patients')
      .then(res => res.json())
      .then(data => {
        const list = Array.isArray(data) ? data : [];
        setPatients(list);
        if (list.length > 0) {
          handleSelectPatient(list[0]);
        }
        setFetchingPatients(false);
      })
      .catch(err => {
        console.error('Failed to fetch patients:', err);
        setFetchingPatients(false);
      });
  }, []);

  const handleEditChange = (e) => {
    setEditFormData({ ...editFormData, [e.target.name]: e.target.value });
  };

  const handlePhotoUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => setEditFormData({ ...editFormData, photo: reader.result });
      reader.readAsDataURL(file);
    }
  };

  const handleSaveProfile = async () => {
    try {
      const res = await fetch(`http://localhost:5001/api/patients/${activePatient.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editFormData),
      });
      const data = await res.json();
      if (data.success) {
        setActivePatient(editFormData);
        setPatients(patients.map(p => p.id === editFormData.id ? editFormData : p));
        setIsEditing(false);
      }
    } catch (err) {
      alert('Error updating profile');
    }
  };

  // Filter patient roster
  const filteredPatients = useMemo(() => {
    if (!searchTerm.trim()) return patients;
    const term = searchTerm.toLowerCase();
    return patients.filter(p =>
      p.name?.toLowerCase().includes(term) ||
      p.id?.toString().includes(term) ||
      p.room_number?.toString().includes(term)
    );
  }, [patients, searchTerm]);

  // Combine history + websocket live data for sensor graph
  const liveSensorPoints = useMemo(() => {
    if (!activePatient) return [];
    const socketPoints = globalRealtimeData[activePatient.id] || [];
    if (socketPoints.length > 0) {
      const combined = [...history];
      socketPoints.forEach(sp => {
        const ts = sp.timestamp ? (typeof sp.timestamp === 'number' ? sp.timestamp : new Date(sp.timestamp).getTime()) : 0;
        if (!combined.some(hp => {
          const hts = hp.timestamp ? (typeof hp.timestamp === 'number' ? hp.timestamp : new Date(hp.timestamp).getTime()) : 0;
          return Math.abs(hts - ts) < 500;
        })) {
          combined.push(sp);
        }
      });
      return combined;
    }
    return history;
  }, [activePatient, globalRealtimeData, history]);

  // Get latest vital metrics
  const latestVitalPoint = useMemo(() => {
    if (liveSensorPoints.length > 0) {
      return liveSensorPoints[liveSensorPoints.length - 1];
    }
    return {};
  }, [liveSensorPoints]);

  const heartRate = latestVitalPoint.hr ?? latestVitalPoint.heart_rate ?? latestVitalPoint.pulse ?? null;
  const spo2 = latestVitalPoint.spo2 ?? null;
  const temp = latestVitalPoint.temp ?? latestVitalPoint.temperature ?? null;
  const sys = latestVitalPoint.bp_sys ?? latestVitalPoint.bpSys ?? null;
  const dia = latestVitalPoint.bp_dia ?? latestVitalPoint.bpDia ?? null;
  const bp = (sys !== null && dia !== null) ? `${sys}/${dia}` : (latestVitalPoint.bp ?? latestVitalPoint.blood_pressure ?? '--');

  // Compute Health Status
  const healthStatus = useMemo(() => {
    if (!heartRate && !spo2 && !temp) {
      return { status: 'Stable', className: 'badge-stable', color: 'var(--success)', icon: CheckCircle2 };
    }
    if ((heartRate && heartRate > 120) || (spo2 && spo2 < 90) || (temp && temp > 103)) {
      return { status: 'Critical', className: 'badge-critical', color: 'var(--danger)', icon: AlertTriangle };
    }
    if ((heartRate && heartRate > 100) || (spo2 && spo2 < 95) || (temp && temp > 100)) {
      return { status: 'Warning', className: 'badge-warning', color: 'var(--warning)', icon: ShieldAlert };
    }
    return { status: 'Stable', className: 'badge-stable', color: 'var(--success)', icon: CheckCircle2 };
  }, [heartRate, spo2, temp]);

  const StatusIcon = healthStatus.icon;

  return (
    <div className="fade-in">
      {/* ── Page Title Header ────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.75rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ width: '42px', height: '42px', borderRadius: '12px', background: 'rgba(0,210,255,0.1)', border: '1px solid rgba(0,210,255,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Users size={24} style={{ color: 'var(--accent-primary)' }} />
          </div>
          <div>
            <h1 className="glass-header" style={{ marginBottom: '0.2rem', fontSize: '1.6rem' }}>Patient Clinical Portal</h1>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', margin: 0 }}>
              Live telemetry monitoring, health records & clinical dossier
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <span className="badge badge-info" style={{ padding: '0.5rem 0.85rem' }}>
            <Activity size={14} /> Telemetry Active
          </span>
        </div>
      </div>

      {/* ── Main Layout: Patient Roster + Detail Panel ───────────────────── */}
      <div className="dashboard-grid-layout" style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 320px) 1fr', gap: '1.75rem', alignItems: 'start' }}>

        {/* ── LEFT COLUMN: Patient Directory Sidebar ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* Search Box */}
          <div className="glass-panel" style={{ padding: '0.75rem 1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Search size={16} color="var(--text-secondary)" />
            <input
              type="text"
              placeholder="Search patients..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="glass-input"
              style={{ border: 'none', background: 'transparent', padding: '0.25rem', height: 'auto' }}
            />
          </div>

          {/* Roster Cards */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', maxHeight: '780px', overflowY: 'auto', paddingRight: '0.25rem' }}>
            {fetchingPatients ? (
              <div className="glass-panel" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
                Loading patients...
              </div>
            ) : filteredPatients.length === 0 ? (
              <div className="glass-panel" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
                No matching patients found.
              </div>
            ) : (
              filteredPatients.map(p => (
                <PatientCard
                  key={p.id}
                  patient={p}
                  isSelected={activePatient?.id === p.id}
                  onClick={() => handleSelectPatient(p)}
                  variant="compact"
                />
              ))
            )}
          </div>
        </div>

        {/* ── RIGHT COLUMN: Active Patient Detail & Vitals Dashboard ── */}
        {activePatient ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

            {/* 1. Header Profile & Health Status Banner */}
            <div className="glass-panel" style={{ padding: '1.75rem', position: 'relative' }}>
              
              {/* Header Action Buttons */}
              <div style={{ position: 'absolute', top: '1.25rem', right: '1.25rem', display: 'flex', gap: '0.5rem' }}>
                {!isEditing ? (
                  <button className="btn-secondary" onClick={() => setIsEditing(true)} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.45rem 0.9rem', fontSize: '0.85rem', minHeight: '36px' }}>
                    <Edit2 size={14} /> Edit Profile
                  </button>
                ) : (
                  <>
                    <button onClick={() => { setEditFormData(activePatient); setIsEditing(false); }} style={{ background: 'transparent', border: '1px solid var(--glass-border)', color: 'var(--text-secondary)', padding: '0.45rem 0.9rem', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem' }}>
                      <X size={14} /> Cancel
                    </button>
                    <button className="btn-primary" onClick={handleSaveProfile} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.45rem 0.9rem', fontSize: '0.85rem', minHeight: '36px' }}>
                      <Save size={14} /> Save Changes
                    </button>
                  </>
                )}
              </div>

              {/* Profile Main Info */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', flexWrap: 'wrap' }}>
                <div style={{ position: 'relative', flexShrink: 0 }}>
                  <div style={{
                    width: '84px', height: '84px', borderRadius: '50%',
                    background: 'linear-gradient(135deg, var(--accent-secondary), var(--accent-primary))',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff',
                    overflow: 'hidden', border: '3px solid rgba(255,255,255,0.15)',
                    backgroundImage: (isEditing ? editFormData.photo : activePatient.photo) ? `url(${isEditing ? editFormData.photo : activePatient.photo})` : 'none',
                    backgroundSize: 'cover', backgroundPosition: 'center',
                    boxShadow: 'var(--shadow-md)'
                  }}>
                    {!(isEditing ? editFormData.photo : activePatient.photo) && <User size={40} />}
                  </div>
                  {isEditing && (
                    <button onClick={() => fileInputRef.current.click()} style={{ position: 'absolute', bottom: 0, right: 0, background: 'var(--bg-panel-solid)', border: '1px solid var(--accent-primary)', borderRadius: '50%', width: '30px', height: '30px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--accent-primary)' }}>
                      <Camera size={14} />
                    </button>
                  )}
                  <input type="file" accept="image/*" capture="user" ref={fileInputRef} style={{ display: 'none' }} onChange={handlePhotoUpload} />
                </div>

                <div style={{ flex: 1, minWidth: '220px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.4rem', flexWrap: 'wrap' }}>
                    {isEditing ? (
                      <input type="text" name="name" value={editFormData.name || ''} onChange={handleEditChange} className="glass-input" style={{ fontSize: '1.25rem', fontWeight: 700 }} />
                    ) : (
                      <h2 style={{ fontSize: '1.4rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>{activePatient.name}</h2>
                    )}
                    
                    {/* Clinical Health Status Badge */}
                    <span className={`badge ${healthStatus.className}`} style={{ fontSize: '0.8rem', padding: '0.3rem 0.85rem' }}>
                      <StatusIcon size={13} /> {healthStatus.status}
                    </span>
                  </div>

                  <div style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', display: 'flex', gap: '0.85rem', flexWrap: 'wrap', alignItems: 'center' }}>
                    <span>ID: <code>{activePatient.id}</code></span>
                    <span>•</span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}><MapPin size={13} /> Room {activePatient.room_number || 'N/A'}</span>
                    <span>•</span>
                    <span>Blood: <strong style={{ color: '#ff4d4f' }}>{activePatient.blood_group || 'N/A'}</strong></span>
                  </div>
                </div>
              </div>
            </div>

            {/* 2. Emergency / SOS Callout Bar */}
            <div className="glass-panel" style={{ padding: '1.25rem 1.5rem', background: healthStatus.status === 'Critical' ? 'rgba(255,77,79,0.1)' : 'rgba(0,0,0,0.15)', border: `1px solid ${healthStatus.status === 'Critical' ? 'rgba(255,77,79,0.3)' : 'var(--glass-border)'}` }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
                  <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: healthStatus.status === 'Critical' ? 'rgba(255,77,79,0.2)' : 'rgba(255,193,7,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <ShieldAlert size={22} style={{ color: healthStatus.status === 'Critical' ? 'var(--danger)' : 'var(--warning)' }} />
                  </div>
                  <div>
                    <div style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                      Emergency Contacts & SOS Response
                    </div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                      Guardian: <strong style={{ color: 'var(--text-primary)' }}>{activePatient.guardian_contact || 'None listed'}</strong>
                      {activePatient.doctor_phone && <> • Doctor: <strong style={{ color: 'var(--accent-primary)' }}>{activePatient.doctor_phone}</strong></>}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  {activePatient.guardian_contact && (
                    <a href={`tel:${activePatient.guardian_contact}`} className="btn-secondary" style={{ textDecoration: 'none', padding: '0.4rem 0.85rem', fontSize: '0.8rem', minHeight: '34px' }}>
                      <Phone size={13} /> Call Guardian
                    </a>
                  )}
                  {activePatient.doctor_phone && (
                    <a href={`tel:${activePatient.doctor_phone}`} className="btn-primary" style={{ textDecoration: 'none', padding: '0.4rem 0.85rem', fontSize: '0.8rem', minHeight: '34px' }}>
                      <Phone size={13} /> Call Doctor
                    </a>
                  )}
                </div>
              </div>
            </div>

            {/* 3. Live Vitals Metrics Cards Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
              {/* Heart Rate */}
              <div className="glass-panel" style={{ padding: '1.25rem', borderLeft: '4px solid #ff4d4f' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Heart Rate</span>
                  <Heart size={18} style={{ color: '#ff4d4f' }} />
                </div>
                <div style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.2rem' }}>
                  {heartRate !== null ? heartRate : '--'} <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 400 }}>bpm</span>
                </div>
                <div style={{ fontSize: '0.75rem', color: heartRate && heartRate > 100 ? 'var(--warning)' : 'var(--text-muted)' }}>
                  Normal range: 60-100 bpm
                </div>
              </div>

              {/* SpO2 */}
              <div className="glass-panel" style={{ padding: '1.25rem', borderLeft: '4px solid #00d2ff' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Blood Oxygen (SpO2)</span>
                  <Wind size={18} style={{ color: '#00d2ff' }} />
                </div>
                <div style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.2rem' }}>
                  {spo2 !== null ? spo2 : '--'} <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 400 }}>%</span>
                </div>
                <div style={{ fontSize: '0.75rem', color: spo2 && spo2 < 95 ? 'var(--warning)' : 'var(--text-muted)' }}>
                  Normal range: 95-100%
                </div>
              </div>

              {/* Body Temperature */}
              <div className="glass-panel" style={{ padding: '1.25rem', borderLeft: '4px solid #20c997' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Body Temp</span>
                  <Thermometer size={18} style={{ color: '#20c997' }} />
                </div>
                <div style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.2rem' }}>
                  {temp !== null ? temp : '--'} <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 400 }}>°F</span>
                </div>
                <div style={{ fontSize: '0.75rem', color: temp && temp > 100 ? 'var(--warning)' : 'var(--text-muted)' }}>
                  Normal range: 97-99 °F
                </div>
              </div>

              {/* Blood Pressure */}
              <div className="glass-panel" style={{ padding: '1.25rem', borderLeft: '4px solid #3a7bd5' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Blood Pressure</span>
                  <Activity size={18} style={{ color: '#3a7bd5' }} />
                </div>
                <div style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.2rem' }}>
                  {bp || '120/80'} <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 400 }}>mmHg</span>
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  Normal range: 120/80 mmHg
                </div>
              </div>
            </div>

            {/* 4. Sensor Telemetry Graphs (Heart Rate, SpO2, Blood Pressure, Body Temp) */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.25rem' }}>
              <SensorGraph
                title="Heart Rate History"
                dataPoints={liveSensorPoints}
                dataKey="hr"
                color="#ff4d4f"
                unit="bpm"
                yMin={40}
                yMax={180}
                height="190px"
                loading={loadingHistory}
              />

              <SensorGraph
                title="SpO2 Saturation History"
                dataPoints={liveSensorPoints}
                dataKey="spo2"
                color="#00d2ff"
                unit="%"
                yMin={80}
                yMax={100}
                height="190px"
                loading={loadingHistory}
              />

              <SensorGraph
                title="Blood Pressure Trend"
                dataPoints={liveSensorPoints}
                datasets={[
                  { label: 'Systolic BP', dataKey: 'bp_sys', fallbackKey: 'bpSys', color: '#ffc107' },
                  { label: 'Diastolic BP', dataKey: 'bp_dia', fallbackKey: 'bpDia', color: '#3a7bd5' }
                ]}
                unit="mmHg"
                yMin={40}
                yMax={200}
                height="190px"
                loading={loadingHistory}
              />

              <SensorGraph
                title="Body Temperature History"
                dataPoints={liveSensorPoints}
                dataKey="temp"
                color="#20c997"
                unit="°F"
                yMin={95}
                yMax={105}
                height="190px"
                loading={loadingHistory}
              />
            </div>

            {/* 5. Patient Profile & Clinical Record Details */}
            <div className="glass-panel" style={{ padding: '1.75rem' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '1.25rem', paddingBottom: '0.5rem', borderBottom: '1px solid var(--glass-border)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <User size={18} style={{ color: 'var(--accent-primary)' }} /> Patient Demographics & Profile Details
              </h3>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
                <FieldBlock label="Age (years)" value={isEditing ? editFormData.age : activePatient.age} editing={isEditing} name="age" type="number" onChange={handleEditChange} />
                <FieldBlock label="Gender" value={isEditing ? editFormData.gender : activePatient.gender} editing={isEditing} name="gender" onChange={handleEditChange}>
                  <select name="gender" value={editFormData.gender || ''} onChange={handleEditChange} className="glass-input">
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Other">Other</option>
                    <option value="Not Specified">Not Specified</option>
                  </select>
                </FieldBlock>
                <FieldBlock label="Blood Group" value={isEditing ? editFormData.blood_group : <span style={{ color: '#ff4d4f' }}>{activePatient.blood_group || 'N/A'}</span>} editing={isEditing} name="blood_group">
                  <select name="blood_group" value={editFormData.blood_group || ''} onChange={handleEditChange} className="glass-input">
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
                </FieldBlock>
                <FieldBlock label="Weight (lbs)" value={isEditing ? editFormData.weight : activePatient.weight} editing={isEditing} name="weight" type="number" onChange={handleEditChange} />
                <FieldBlock label="Room Number" value={isEditing ? editFormData.room_number : activePatient.room_number} editing={isEditing} name="room_number" onChange={handleEditChange} />
              </div>

              {/* Contact Block */}
              <div className="glass-panel" style={{ padding: '1.25rem', background: 'rgba(0,0,0,0.15)', marginBottom: '1.5rem' }}>
                <div style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '1rem' }}>Contact Information</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <Phone size={16} color="var(--accent-primary)" style={{ flexShrink: 0 }} />
                    <span style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>Mobile:</span>
                    {isEditing ? (
                      <input type="text" name="mobile" value={editFormData.mobile || ''} onChange={handleEditChange} className="glass-input" style={{ flex: 1 }} />
                    ) : (
                      <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{activePatient.mobile || '—'}</span>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <ShieldAlert size={16} color="var(--warning)" style={{ flexShrink: 0 }} />
                    <span style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>Guardian:</span>
                    {isEditing ? (
                      <input type="text" name="guardian_contact" value={editFormData.guardian_contact || ''} onChange={handleEditChange} className="glass-input" style={{ flex: 1 }} />
                    ) : (
                      <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{activePatient.guardian_contact || '—'}</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Assigned Doctor Card */}
              <div className="glass-panel" style={{ padding: '1.5rem', background: 'rgba(0,210,255,0.03)', border: '1px solid rgba(0,210,255,0.18)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem', paddingBottom: '0.75rem', borderBottom: '1px solid var(--glass-border)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                    <Stethoscope size={20} style={{ color: 'var(--accent-primary)' }} />
                    <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: 'var(--accent-primary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Assigned Primary Doctor</h4>
                  </div>
                  {!isEditing && (
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontStyle: 'italic' }}>Edit profile above to modify</span>
                  )}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', gridColumn: '1 / -1', marginBottom: '0.25rem' }}>
                    <div style={{ width: '50px', height: '50px', borderRadius: '50%', background: 'linear-gradient(135deg, #007cf0, #00d2ff)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <Stethoscope size={24} color="#fff" />
                    </div>
                    <div>
                      {isEditing ? (
                        <input type="text" name="doctor_name" value={editFormData.doctor_name || ''} onChange={handleEditChange} className="glass-input" placeholder="Dr. Full Name" style={{ fontWeight: 700, fontSize: '1rem' }} />
                      ) : (
                        <div style={{ fontWeight: 700, fontSize: '1.05rem', color: 'var(--text-primary)' }}>{activePatient.doctor_name || <span style={{ color: 'var(--text-secondary)', fontStyle: 'italic', fontWeight: 400 }}>Not assigned</span>}</div>
                      )}
                      {isEditing ? (
                        <input type="text" name="doctor_specialization" value={editFormData.doctor_specialization || ''} onChange={handleEditChange} className="glass-input" placeholder="Specialization (e.g. Cardiologist)" style={{ fontSize: '0.85rem', marginTop: '0.4rem' }} />
                      ) : (
                        <div style={{ color: 'var(--accent-primary)', fontSize: '0.85rem', marginTop: '0.2rem' }}>{activePatient.doctor_specialization || 'Specialization not specified'}</div>
                      )}
                    </div>
                  </div>

                  <div className="glass-panel" style={{ padding: '0.85rem 1rem', background: 'rgba(0,0,0,0.15)' }}>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.3rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <Phone size={12} /> Direct Line
                    </div>
                    {isEditing ? (
                      <input type="text" name="doctor_phone" value={editFormData.doctor_phone || ''} onChange={handleEditChange} className="glass-input" placeholder="+1 555-0000" />
                    ) : (
                      <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>{activePatient.doctor_phone || '—'}</div>
                    )}
                  </div>

                  <div className="glass-panel" style={{ padding: '0.85rem 1rem', background: 'rgba(0,0,0,0.15)' }}>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.3rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <Mail size={12} /> Email Address
                    </div>
                    {isEditing ? (
                      <input type="email" name="doctor_email" value={editFormData.doctor_email || ''} onChange={handleEditChange} className="glass-input" placeholder="doctor@hospital.com" />
                    ) : (
                      <div style={{ fontWeight: 600, fontSize: '0.9rem', wordBreak: 'break-all' }}>{activePatient.doctor_email || '—'}</div>
                    )}
                  </div>
                </div>
              </div>
            </div>

          </div>
        ) : (
          <div className="glass-panel" style={{ padding: '4rem 2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
            <Users size={48} style={{ opacity: 0.3, marginBottom: '1rem', color: 'var(--accent-primary)' }} />
            <h3 style={{ fontSize: '1.2rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.5rem' }}>No Patient Selected</h3>
            <p style={{ margin: 0, fontSize: '0.9rem' }}>Select a patient from the directory on the left to view live telemetry and clinical details.</p>
          </div>
        )}

      </div>
    </div>
  );
};

export default PatientDashboard;

