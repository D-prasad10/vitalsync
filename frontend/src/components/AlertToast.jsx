import React from 'react';
import { AlertTriangle, AlertCircle, Info, CheckCircle2, X } from 'lucide-react';

const AlertToast = ({ alert, onDismiss }) => {
  if (!alert) return null;

  // Severity resolution
  const rawSeverity = (alert.severity || alert.level || alert.type || 'critical').toLowerCase();
  let severity = 'critical';
  if (rawSeverity.includes('warn')) severity = 'warning';
  else if (rawSeverity.includes('info')) severity = 'info';
  else if (rawSeverity.includes('success') || rawSeverity.includes('resolved') || rawSeverity.includes('normal')) severity = 'success';

  const config = {
    critical: {
      icon: AlertTriangle,
      color: 'var(--danger)',
      bgTag: 'rgba(255, 77, 79, 0.15)',
      borderTag: 'rgba(255, 77, 79, 0.3)',
      label: 'CRITICAL'
    },
    warning: {
      icon: AlertCircle,
      color: 'var(--warning)',
      bgTag: 'rgba(255, 193, 7, 0.15)',
      borderTag: 'rgba(255, 193, 7, 0.3)',
      label: 'WARNING'
    },
    info: {
      icon: Info,
      color: 'var(--accent-primary)',
      bgTag: 'rgba(0, 210, 255, 0.15)',
      borderTag: 'rgba(0, 210, 255, 0.3)',
      label: 'INFO'
    },
    success: {
      icon: CheckCircle2,
      color: 'var(--success)',
      bgTag: 'rgba(32, 201, 151, 0.15)',
      borderTag: 'rgba(32, 201, 151, 0.3)',
      label: 'RESOLVED'
    }
  }[severity];

  const IconComponent = config.icon;

  const timeString = alert.timestamp
    ? new Date(alert.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : 'Just now';

  const messages = Array.isArray(alert.alerts)
    ? alert.alerts
    : (alert.message ? [alert.message] : ['Telemetry threshold breach detected.']);

  const patientName = alert.patient_name || alert.patientName || alert.name || 'Patient';
  const patientId = alert.patient_id || alert.patientId;

  return (
    <div className={`toast toast-${severity}`} role={severity === 'critical' || severity === 'warning' ? 'alert' : 'status'} aria-live="polite">
      {/* Header Row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', gap: '0.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <IconComponent size={15} style={{ color: config.color, flexShrink: 0 }} />
          <span style={{
            fontSize: '0.68rem',
            fontWeight: 700,
            color: config.color,
            background: config.bgTag,
            border: `1px solid ${config.borderTag}`,
            padding: '1px 6px',
            borderRadius: '4px',
            letterSpacing: '0.04em'
          }}>
            {config.label}
          </span>
          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
            • {timeString}
          </span>
        </div>

        <button
          onClick={onDismiss}
          aria-label="Dismiss alert"
          style={{
            background: 'transparent',
            border: 'none',
            color: 'var(--text-secondary)',
            cursor: 'pointer',
            padding: '2px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: '4px'
          }}
        >
          <X size={15} />
        </button>
      </div>

      {/* Patient Info & Messages */}
      <div style={{ wordBreak: 'break-word', overflowWrap: 'anywhere' }}>
        <div style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--text-primary)', marginBottom: '0.2rem' }}>
          {patientName} {patientId ? <span style={{ fontWeight: 400, color: 'var(--text-secondary)', fontSize: '0.78rem' }}>(PT-{patientId})</span> : null}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
          {messages.map((msg, i) => (
            <div key={i} style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.35 }}>
              {messages.length > 1 ? `• ${msg}` : msg}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default AlertToast;
