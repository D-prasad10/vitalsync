import React, { memo } from 'react';
import { ShieldAlert, AlertTriangle, AlertCircle, Info, CheckCircle2, X } from 'lucide-react';
import { useEmergencyAlerts } from '../utils/telemetryStore';

export const AlertCard = memo(({ alert, onDismiss }) => {
  if (!alert) return null;

  const rawSeverity = (alert.severity || alert.level || alert.type || 'critical').toLowerCase();
  let severity = 'critical';
  if (rawSeverity.includes('warn')) severity = 'warning';
  else if (rawSeverity.includes('info')) severity = 'info';
  else if (rawSeverity.includes('success') || rawSeverity.includes('resolved') || rawSeverity.includes('normal')) severity = 'success';

  const config = {
    critical: {
      icon: AlertTriangle,
      color: '#ff4d4f',
      label: 'CRITICAL',
      cardClass: 'card-critical',
      badgeClass: 'toast-badge-critical'
    },
    warning: {
      icon: AlertCircle,
      color: '#ffc107',
      label: 'WARNING',
      cardClass: 'card-warning',
      badgeClass: 'toast-badge-warning'
    },
    info: {
      icon: Info,
      color: '#00d2ff',
      label: 'INFO',
      cardClass: 'card-info',
      badgeClass: 'toast-badge-info'
    },
    success: {
      icon: CheckCircle2,
      color: '#20c997',
      label: 'RESOLVED',
      cardClass: 'card-success',
      badgeClass: 'toast-badge-success'
    }
  }[severity];

  const IconComponent = config.icon;

  const timeString = alert.timestamp
    ? new Date(alert.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  const rawMessages = Array.isArray(alert.alerts)
    ? alert.alerts
    : (alert.message ? [alert.message] : ['Threshold breach detected']);

  const messageText = rawMessages.join(' • ');

  const patientName = alert.patient_name || alert.patientName || alert.name || 'Patient';
  const rawId = alert.patient_id || alert.patientId || alert.id;
  const formattedPatientId = rawId
    ? (String(rawId).startsWith('PT-') ? String(rawId) : `PT-00${rawId}`)
    : 'PT-001';

  return (
    <div
      className={`alert-panel-card ${config.cardClass}`}
      role={severity === 'critical' || severity === 'warning' ? 'alert' : 'status'}
    >
      <div className="alert-card-header">
        <div className="alert-card-badge-row">
          <IconComponent size={12} style={{ color: config.color, flexShrink: 0 }} />
          <span className={`alert-card-badge ${config.badgeClass}`}>
            {config.label}
          </span>
          <span className="alert-card-time">{timeString}</span>
        </div>

        <button
          onClick={(e) => {
            e.stopPropagation();
            onDismiss();
          }}
          aria-label="Dismiss alert"
          className="alert-card-dismiss-btn"
          title="Dismiss alert"
        >
          <X size={13} />
        </button>
      </div>

      <div className="alert-card-patient-row">
        <span className="alert-patient-name">{patientName}</span>
        <span className="alert-patient-dot">•</span>
        <span className="alert-patient-id">{formattedPatientId}</span>
      </div>

      <div className="alert-card-message" title={messageText}>
        {messageText}
      </div>
    </div>
  );
});

const EmergencyAlertPanel = () => {
  const { alerts, dismissAlert, dismissAll } = useEmergencyAlerts();
  const hasAlerts = Boolean(alerts && alerts.length > 0);

  return (
    <aside
      className={`emergency-alert-panel ${hasAlerts ? 'open' : ''}`}
      aria-label="Emergency Alerts Side Panel"
      aria-hidden={!hasAlerts}
    >
      {hasAlerts && (
        <div className="emergency-alert-panel-inner">
          <div className="emergency-alert-panel-header">
            <div className="alert-panel-title-group">
              <ShieldAlert size={16} style={{ color: '#ff4d4f', flexShrink: 0 }} />
              <h3 className="alert-panel-title">Emergency Alerts</h3>
              <span className="alert-count-pill" title={`${alerts.length} active alert(s)`}>
                {alerts.length}
              </span>
            </div>

            {alerts.length > 1 && (
              <button
                type="button"
                onClick={dismissAll}
                className="alert-clear-all-btn"
                title="Dismiss all alerts"
              >
                Clear All
              </button>
            )}
          </div>

          <div className="emergency-alert-panel-body">
            {[...alerts].reverse().map((alert) => (
              <AlertCard
                key={alert.id}
                alert={alert}
                onDismiss={() => dismissAlert(alert.id)}
              />
            ))}
          </div>
        </div>
      )}
    </aside>
  );
};

export default memo(EmergencyAlertPanel);
