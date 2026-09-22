import React from 'react';
import { User, Heart, Wind, Thermometer, Activity, MapPin, ChevronRight, Clock } from 'lucide-react';
import { AiRiskBadge } from './AiRiskCard';

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
        role="button"
        aria-pressed={isSelected}
        aria-label={`Patient ${patient.name}, Room ${patient.room_number || 'N/A'}, Status: ${status}`}
        style={{
          padding: '0.85rem 1rem',
          width: '100%',
          textAlign: 'left',
          cursor: 'pointer',
          border: '1px solid',
          borderColor: isSelected ? 'var(--accent-primary)' : 'var(--border-light)',
          background: isSelected ? 'rgba(37, 99, 235, 0.08)' : '#ffffff',
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

  // Mini vitals data extraction with hardware sensor adaptation
  const hr = latestVitals.hr ?? latestVitals.heartRate ?? latestVitals.heart_rate ?? latestVitals.pulse;
  const maxIR = latestVitals.maxIR != null && latestVitals.maxIR > 0 ? latestVitals.maxIR : null;
  const hrLabel = hr != null ? `${hr} BPM` : (maxIR != null ? `IR ${maxIR}` : '--');
  const hrTitle = hr != null ? `Heart Rate: ${hr} BPM` : (maxIR != null ? `MAX30100 Raw Optical IR: ${maxIR}` : 'Heart Rate / Optical Stream');

  const spo2 = latestVitals.spo2;
  const maxRED = latestVitals.maxRED != null && latestVitals.maxRED > 0 ? latestVitals.maxRED : null;
  const spo2Label = spo2 != null ? `${spo2}%` : (maxRED != null ? `RED ${maxRED}` : '--');
  const spo2Title = spo2 != null ? `SpO2: ${spo2}%` : (maxRED != null ? `MAX30100 Raw Optical RED: ${maxRED}` : 'SpO2 / Optical Stream');

  const dhtTemp = latestVitals.dhtTemp;
  const bmpTemp = latestVitals.bmpTemp;
  const temp = latestVitals.temp ?? latestVitals.temperature;
  const tempDisplay = (dhtTemp != null || bmpTemp != null) ? `${dhtTemp ?? bmpTemp}°C` : (temp != null ? `${temp}°F` : '--');
  const tempTitle = (dhtTemp != null || bmpTemp != null) ? `DHT11: ${dhtTemp ?? '--'}°C | BMP280: ${bmpTemp ?? '--'}°C` : (temp != null ? `Body Temp: ${temp}°F` : 'Temperature');

  const ecgVal = latestVitals.ecg_val != null ? latestVitals.ecg_val : (latestVitals.ecg?.value ?? null);
  const sys = latestVitals.bpSys ?? latestVitals.bp_sys;
  const dia = latestVitals.bpDia ?? latestVitals.bp_dia;
  const pressureVal = latestVitals.pressure ?? latestVitals.bmpPress;
  const ecgBpDisplay = (sys != null && dia != null)
    ? `${sys}/${dia}`
    : (ecgVal != null ? `ECG ${ecgVal}` : (latestVitals.bp ?? (pressureVal != null ? `${pressureVal} hPa` : 'No Sensor')));
  const ecgBpTitle = (sys != null && dia != null)
    ? `Blood Pressure: ${sys}/${dia} mmHg`
    : (ecgVal != null ? `AD8232 ECG Amplitude: ${ecgVal} ADC` : (pressureVal != null ? `Barometric Pressure: ${pressureVal} hPa` : 'Sensor Stream'));

  // Default Grid Variant
  return (
    <div
      className={`patient-card ${cardBorderClass}`}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick?.(); } }}
      aria-label={`Patient ${patient.name}, Room ${patient.room_number || 'N/A'}, Health Status: ${status}`}
      style={{
        borderColor: isSelected ? 'var(--accent-primary)' : undefined,
        background: isSelected ? 'rgba(37, 99, 235, 0.06)' : undefined,
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

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', alignItems: 'flex-end', flexShrink: 0 }}>
          <span className={`badge ${statusBadgeClass}`}>
            {status === 'Critical' && <span className="pulse-dot" style={{ width: '6px', height: '6px', backgroundColor: '#ff4d4f', marginRight: '4px' }} />}
            {status}
          </span>
          <AiRiskBadge ai={latestVitals?.ai} telemetryPoint={latestVitals} style={{ fontSize: '0.68rem', padding: '0.15rem 0.5rem' }} />
        </div>
      </div>

      {/* Mini Vitals Grid (Real-time telemetry & sensors) */}
      <div className="mini-vitals-grid">
        <div className="mini-vital" title={hrTitle}>
          <Heart color="#ff4d4f" />
          <span>{hrLabel}</span>
        </div>
        <div className="mini-vital" title={spo2Title}>
          <Wind color="#0d9488" />
          <span>{spo2Label}</span>
        </div>
        <div className="mini-vital" title={tempTitle}>
          <Thermometer color="#059669" />
          <span>{tempDisplay}</span>
        </div>
        <div className="mini-vital" title={ecgBpTitle}>
          <Activity color="#d97706" />
          <span>{ecgBpDisplay}</span>
        </div>
      </div>

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

export default React.memo(PatientCard);
