import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { User, Phone, MapPin, Activity, ShieldAlert, Users, FileText, ArrowRight } from 'lucide-react';
import PatientCard from '../components/PatientCard';
import { useRealtimeData, seedPatientTelemetry } from '../utils/telemetryStore';

const DetailRow = ({ label, value }) => (
  <div className="glass-panel" style={{ padding: '0.9rem 1.1rem', background: '#f8fafc', border: '1px solid var(--border-light)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
    <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{label}</span>
    <span style={{ fontWeight: 600, fontSize: '0.95rem', color: 'var(--text-primary)' }}>{value || '—'}</span>
  </div>
);

const PatientInfo = () => {
  const { id: urlId } = useParams();
  const navigate = useNavigate();
  const globalRealtimeData = useRealtimeData();
  const [patients, setPatients] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    fetch('http://localhost:5001/api/patients')
      .then(res => res.json())
      .then(data => {
        if (!mounted) return;
        const list = Array.isArray(data) ? data : [];
        setPatients(list);
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
      .catch(err => {
        console.error('Failed to load patients in PatientInfo:', err);
        if (mounted) setLoading(false);
      });

    return () => { mounted = false; };
  }, []);

  const selectedPatient = (() => {
    if (patients.length === 0) return null;
    const match = urlId
      ? patients.find(p => String(p.id) === String(urlId) || String(p.patient_id || '') === String(urlId) || String(urlId).replace('PT-', '') === String(p.id))
      : null;
    return match || patients[0] || null;
  })();

  const handleSelectPatient = (p) => {
    if (p && p.id) {
      navigate(`/patient/${p.id}`);
    }
  };

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

  const initials = selectedPatient?.name
    ? selectedPatient.name.trim().split(/\s+/).map(n => n[0] || '').join('').substring(0, 2).toUpperCase()
    : 'PT';

  if (loading) {
    return (
      <div className="empty-state" style={{ padding: '6rem 2rem' }}>
        <div className="loading-spinner" />
        <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Loading patient directory...</span>
      </div>
    );
  }

  return (
    <div className="fade-in">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ width: '42px', height: '42px', borderRadius: '12px', background: 'var(--accent-gradient-subtle)', border: '1px solid var(--teal-border)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Users size={24} style={{ color: 'var(--accent-primary)' }} />
          </div>
          <div>
            <h1 className="glass-header" style={{ marginBottom: '0.2rem', fontSize: '1.6rem' }}>Patient Information & Dossier</h1>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', margin: 0 }}>
              Comprehensive clinical profile, demographic data, and emergency routing
            </p>
          </div>
        </div>

        {selectedPatient && (
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            <button
              className="btn-secondary"
              onClick={() => navigate('/reports')}
              style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem' }}
            >
              <FileText size={15} /> Clinical Reports
            </button>
            <button
              className="btn-primary"
              onClick={() => navigate('/patient-dashboard')}
              style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem' }}
            >
              <Activity size={15} /> Live Telemetry <ArrowRight size={14} />
            </button>
          </div>
        )}
      </div>

      <div className="dashboard-grid-layout" style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: '1.5rem', alignItems: 'start' }}>

        {/* Patient List Sidebar */}
        <div className="glass-panel" style={{ padding: '1.25rem' }}>
          <h2 style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '1rem', paddingBottom: '0.5rem', borderBottom: '1px solid var(--glass-border)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Patients ({patients.length})
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
            {patients.map(p => (
              <PatientCard
                key={p.id}
                patient={p}
                status={getPatientStatus(p.id)}
                isSelected={selectedPatient?.id === p.id}
                onClick={() => handleSelectPatient(p)}
                variant="compact"
              />
            ))}
            {patients.length === 0 && (
              <div className="empty-state" style={{ padding: '2rem 1rem' }}>
                <User size={28} />
                <span style={{ fontSize: '0.85rem' }}>No patients found</span>
              </div>
            )}
          </div>
        </div>

        {/* Patient Detail Panel */}
        {selectedPatient ? (
          <div className="glass-panel" style={{ padding: '2rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2rem', paddingBottom: '1.5rem', borderBottom: '1px solid var(--glass-border)', flexWrap: 'wrap', gap: '1.25rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
                <div style={{ width: '72px', height: '72px', borderRadius: '50%', background: 'var(--accent-gradient)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', flexShrink: 0, fontWeight: 700, fontSize: '1.4rem' }}>
                  {initials}
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                    <h2 style={{ fontSize: '1.6rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>{selectedPatient.name}</h2>
                    <span className={`badge ${getPatientStatus(selectedPatient.id) === 'Critical' ? 'badge-critical' : getPatientStatus(selectedPatient.id) === 'Warning' ? 'badge-warning' : 'badge-stable'}`}>
                      {getPatientStatus(selectedPatient.id)}
                    </span>
                  </div>
                  <div style={{ color: 'var(--text-secondary)', marginTop: '0.35rem', display: 'flex', gap: '0.85rem', fontSize: '0.875rem', flexWrap: 'wrap', alignItems: 'center' }}>
                    <span>ID: <code style={{ color: 'var(--accent-primary)' }}>PT-00{selectedPatient.id}</code></span>
                    <span>•</span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}><MapPin size={13} /> Room {selectedPatient.room_number || 'N/A'}</span>
                    <span>•</span>
                    <span>Blood: <strong style={{ color: '#ff4d4f' }}>{selectedPatient.blood_group || 'N/A'}</strong></span>
                  </div>
                </div>
              </div>

              <span className="badge badge-info" style={{ padding: '0.4rem 0.85rem' }}>
                Electronic Health Record
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.75rem' }}>
              <div>
                <h3 style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--accent-primary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  <Activity size={16} /> Demographics & Physical
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <DetailRow label="Full Name" value={selectedPatient.name} />
                  <DetailRow label="Age" value={selectedPatient.age ? `${selectedPatient.age} years` : null} />
                  <DetailRow label="Gender" value={selectedPatient.gender} />
                  <DetailRow label="Blood Group" value={selectedPatient.blood_group} />
                  <DetailRow label="Weight" value={selectedPatient.weight ? `${selectedPatient.weight} lbs` : null} />
                </div>
              </div>

              <div>
                <h3 style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--success)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  <ShieldAlert size={16} /> Contact & Primary Care
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <DetailRow label="Room Number" value={selectedPatient.room_number} />
                  <DetailRow
                    label="Mobile"
                    value={selectedPatient.mobile
                      ? <a href={`tel:${selectedPatient.mobile}`} style={{ color: 'var(--text-primary)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '0.4rem' }}><Phone size={14} color="var(--accent-primary)" /> {selectedPatient.mobile}</a>
                      : null}
                  />
                  <DetailRow
                    label="Guardian Contact"
                    value={selectedPatient.guardian_contact
                      ? <a href={`tel:${selectedPatient.guardian_contact}`} style={{ color: 'var(--text-primary)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '0.4rem' }}><Phone size={14} color="var(--success)" /> {selectedPatient.guardian_contact}</a>
                      : null}
                  />
                  <DetailRow label="Attending Doctor" value={selectedPatient.doctor_name} />
                  <DetailRow label="Doctor Phone" value={selectedPatient.doctor_phone} />
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="glass-panel" style={{ padding: '4rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
            Select a patient from the list to view their details.
          </div>
        )}
      </div>
    </div>
  );
};

export default PatientInfo;
