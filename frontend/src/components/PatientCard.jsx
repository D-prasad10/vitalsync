import React from 'react';
import { User, Heart, Wind, Thermometer, Activity, MapPin, ChevronRight, Clock } from 'lucide-react';

const PatientCard = ({
  patient,
  status = 'Stable',
  latestVitals = {},
  isSelected = false,
  onClick,
  variant = 'grid',
  onViewDetails
}) => {
  if (!patient) return null;

  const initials = patient.name
    ? patient.name
        .split(' ')
        .map(n => n[0])
        .join('')
        .substring(0, 2)
        .toUpperCase()
    : 'PT';

  const statusBadgeClass =
    status === 'Critical'
      ? 'badge-critical'
      : status === 'Warning'
      ? 'badge-warning'
      : 'badge-stable';

  const cardBorderClass =
    status === 'Critical'
      ? 'status-critical'
      : status === 'Warning'
      ? 'status-warning'
      : 'status-stable';

  // Compact Variant (for Sidebar / Selector lists)
  if (variant === 'compact') {
    return (
      <button
        onClick={onClick}
        className="glass-panel"
        style={{
          padding: '0.85rem 1rem',
          width: '100%',
          textAlign: 'left',
          cursor: 'pointer',
          border: '1px solid',
          borderColor: isSelected ? 'var(--accent-primary)' : 'var(--glass-border)',
          background: isSelected ? 'rgba(0, 210, 255, 0.08)' : 'var(--bg-panel)',
          borderRadius: '10px',
          transition: 'all 0.2s ease',
          display: 'flex',
          alignItems: 'center',
          gap: '0.85rem'
        }}
      >
        <div
          className="patient-avatar"
          style={{
            width: '38px',
            height: '38px',
            fontSize: '0.85rem',
            backgroundImage: patient.photo ? `url(${patient.photo})` : 'none',
            backgroundSize: 'cover',
            backgroundPosition: 'center'
          }}
        >
          {!patient.photo && initials}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontWeight: isSelected ? 700 : 600,
              fontSize: '0.9rem',
              color: isSelected ? 'var(--accent-primary)' : 'var(--text-primary)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis'
            }}
          >
            {patient.name}
          </div>
          <div
            style={{
              fontSize: '0.78rem',
              color: 'var(--text-secondary)',
              marginTop: '2px',
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              flexWrap: 'wrap'
            }}
          >
            <span>Room {patient.room_number || 'N/A'}</span>
            <span>•</span>
            <span style={{ color: '#ff4d4f', fontWeight: 600 }}>{patient.blood_group || 'N/A'}</span>
          </div>
        </div>
        <ChevronRight
          size={16}
          style={{
            color: isSelected ? 'var(--accent-primary)' : 'var(--text-muted)',
            flexShrink: 0
          }}
        />
      </button>
    );
  }

  // Default Grid Variant
  return (
    <div
      className={`patient-card ${cardBorderClass}`}
      onClick={onClick}
      style={{
        borderColor: isSelected ? 'var(--accent-primary)' : undefined,
        background: isSelected ? 'rgba(0, 210, 255, 0.06)' : undefined,
        cursor: 'pointer'
      }}
    >
      <div className="patient-card-header">
        <div
          className="patient-avatar"
          style={{
            backgroundImage: patient.photo ? `url(${patient.photo})` : 'none',
            backgroundSize: 'cover',
            backgroundPosition: 'center'
          }}
        >
          {!patient.photo && initials}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <h3
            style={{
              fontSize: '1.05rem',
              fontWeight: 700,
              marginBottom: '0.2rem',
              color: 'var(--text-primary)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis'
            }}
          >
            {patient.name}
          </h3>
          <div
            style={{
              fontSize: '0.8rem',
              color: 'var(--text-secondary)',
              display: 'flex',
              gap: '0.4rem',
              alignItems: 'center',
              flexWrap: 'wrap'
            }}
          >
            <span>Age {patient.age || '--'}</span>
            <span>•</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
              <MapPin size={11} /> Room {patient.room_number || 'N/A'}
            </span>
            <span>•</span>
            <span style={{ color: '#ff4d4f', fontWeight: 600 }}>{patient.blood_group || 'N/A'}</span>
          </div>
        </div>

        <span className={`badge ${statusBadgeClass}`}>{status}</span>
      </div>

      {/* Mini Vitals Grid (Real-time data) */}
      {(() => {
        const hr = latestVitals.hr ?? latestVitals.heart_rate ?? latestVitals.pulse;
        const spo2 = latestVitals.spo2;
        const temp = latestVitals.temp ?? latestVitals.temperature;
        const sys = latestVitals.bpSys ?? latestVitals.bp_sys;
        const dia = latestVitals.bpDia ?? latestVitals.bp_dia;
        const bpDisplay = (sys != null && dia != null) ? `${sys}/${dia}` : (latestVitals.bp ?? '--');

        return (
          <div className="mini-vitals-grid">
            <div className="mini-vital">
              <Heart color="#ff4d4f" />
              <span>{hr != null ? `${hr} BPM` : '--'}</span>
            </div>
            <div className="mini-vital">
              <Wind color="#00d2ff" />
              <span>{spo2 != null ? `${spo2}%` : '--'}</span>
            </div>
            <div className="mini-vital">
              <Thermometer color="#20c997" />
              <span>{temp != null ? `${temp}°F` : '--'}</span>
            </div>
            <div className="mini-vital">
              <Activity color="#ffc107" />
              <span>{bpDisplay}</span>
            </div>
          </div>
        );
      })()}

      {/* Action Footer if provided */}
      {onViewDetails && (
        <div
          style={{
            marginTop: '1rem',
            paddingTop: '0.75rem',
            borderTop: '1px solid var(--glass-border)',
            display: 'flex',
            justify: 'space-between',
            alignItems: 'center'
          }}
        >
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <Clock size={11} /> ID: PT-00{patient.id}
          </span>
          <button
            className="btn-secondary btn-sm"
            onClick={(e) => {
              e.stopPropagation();
              onViewDetails(patient);
            }}
          >
            View Details
          </button>
        </div>
      )}
    </div>
  );
};

export default PatientCard;
