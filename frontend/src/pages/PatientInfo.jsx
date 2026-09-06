import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { User, Phone, MapPin, Activity, ShieldAlert, Users } from 'lucide-react';

const DetailRow = ({ label, value }) => (
  <div className="glass-panel" style={{ padding: '1rem', background: 'rgba(0,0,0,0.1)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
    <span style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>{label}</span>
    <span style={{ fontWeight: 600 }}>{value || '—'}</span>
  </div>
);

const PatientInfo = () => {
  const { id: urlId } = useParams();
  const [patients, setPatients] = useState([]);
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('http://localhost:5001/api/patients')
      .then(res => res.json())
      .then(data => {
        setPatients(data);
        const initial = urlId ? data.find(p => String(p.id) === String(urlId)) : null;
        setSelectedPatient(initial || data[0] || null);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [urlId]);

  if (loading) {
    return <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-secondary)' }}>Loading patients...</div>;
  }

  return (
    <div className="fade-in">
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '2rem' }}>
        <Users size={28} style={{ color: 'var(--accent-primary)' }} />
        <h1 className="glass-header" style={{ marginBottom: 0 }}>Patient Information</h1>
      </div>

      <div className="dashboard-grid-layout" style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: '2rem', alignItems: 'start' }}>

        {/* Patient List Sidebar */}
        <div className="glass-panel" style={{ padding: '1rem' }}>
          <h2 style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '1rem', paddingBottom: '0.5rem', borderBottom: '1px solid var(--glass-border)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            All Patients ({patients.length})
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {patients.map(p => (
              <button
                key={p.id}
                onClick={() => setSelectedPatient(p)}
                style={{
                  padding: '0.875rem 1rem',
                  borderRadius: '10px',
                  border: '1px solid',
                  borderColor: selectedPatient?.id === p.id ? 'var(--accent-primary)' : 'var(--glass-border)',
                  background: selectedPatient?.id === p.id ? 'rgba(0,210,255,0.1)' : 'transparent',
                  color: 'var(--text-primary)',
                  textAlign: 'left',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem'
                }}
              >
                <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: selectedPatient?.id === p.id ? 'rgba(0,210,255,0.2)' : 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <User size={18} style={{ color: selectedPatient?.id === p.id ? 'var(--accent-primary)' : 'var(--text-secondary)' }} />
                </div>
                <div>
                  <div style={{ fontWeight: 600, fontSize: '0.9rem', color: selectedPatient?.id === p.id ? 'var(--accent-primary)' : 'var(--text-primary)' }}>{p.name}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '2px' }}>Room {p.room_number} · Age {p.age}</div>
                </div>
              </button>
            ))}
            {patients.length === 0 && (
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', textAlign: 'center', padding: '1rem 0' }}>No patients found.</p>
            )}
          </div>
        </div>

        {/* Patient Detail Panel */}
        {selectedPatient ? (
          <div className="glass-panel" style={{ padding: '2rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', marginBottom: '2rem', paddingBottom: '1.5rem', borderBottom: '1px solid var(--glass-border)' }}>
              <div style={{ width: '80px', height: '80px', borderRadius: '50%', background: 'linear-gradient(135deg, var(--accent-secondary), var(--accent-primary))', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', flexShrink: 0 }}>
                <User size={40} />
              </div>
              <div>
                <h2 style={{ fontSize: '1.75rem', fontWeight: 700, margin: 0 }}>{selectedPatient.name}</h2>
                <div style={{ color: 'var(--text-secondary)', marginTop: '0.4rem', display: 'flex', gap: '1rem', fontSize: '0.95rem', flexWrap: 'wrap', alignItems: 'center' }}>
                  <span>ID: <strong style={{ color: 'var(--text-primary)' }}>{selectedPatient.id}</strong></span>
                  <span>•</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}><MapPin size={14} /> Room {selectedPatient.room_number}</span>
                  <span>•</span>
                  <span>Blood: <strong style={{ color: '#ff4d4f' }}>{selectedPatient.blood_group || 'N/A'}</strong></span>
                </div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '2rem' }}>
              <div>
                <h3 style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--accent-primary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  <Activity size={16} /> Demographics
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
                  <ShieldAlert size={16} /> Contact & Room
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <DetailRow label="Room Number" value={selectedPatient.room_number} />
                  <DetailRow
                    label="Mobile"
                    value={selectedPatient.mobile
                      ? <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}><Phone size={14} /> {selectedPatient.mobile}</span>
                      : null}
                  />
                  <DetailRow
                    label="Guardian Contact"
                    value={selectedPatient.guardian_contact
                      ? <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}><Phone size={14} /> {selectedPatient.guardian_contact}</span>
                      : null}
                  />
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
