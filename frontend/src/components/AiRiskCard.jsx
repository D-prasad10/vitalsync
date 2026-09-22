import React from 'react';
import { Cpu, ShieldAlert, CheckCircle2, AlertTriangle, AlertCircle, HelpCircle } from 'lucide-react';

/**
 * Normalizes AI data from either real-time socket payload (telemetry.ai)
 * or historical database record (item.ai_risk_level, item.ai_anomaly_score).
 */
export const extractAiInfo = (aiData, telemetryPoint = null) => {
  const source = aiData || telemetryPoint?.ai || null;
  const histRisk = telemetryPoint?.ai_risk_level;
  const histScore = telemetryPoint?.ai_anomaly_score;

  // If source object is present
  if (source && typeof source === 'object') {
    const isUnavailable = source.status === 'unavailable' || source.risk_level === 'unavailable';
    const riskLevel = isUnavailable ? 'unavailable' : (source.risk_level || 'unavailable');
    const anomaly = typeof source.anomaly === 'boolean' ? source.anomaly : (riskLevel === 'warning');
    const anomalyScore = (typeof source.anomaly_score === 'number' && Number.isFinite(source.anomaly_score))
      ? source.anomaly_score
      : null;
    const alert = Boolean(source.alert);
    const reason = source.reason || null;

    return {
      available: !isUnavailable && (riskLevel === 'normal' || riskLevel === 'warning'),
      riskLevel,
      anomaly,
      anomalyScore,
      alert,
      reason
    };
  }

  // Fallback to database scalar columns if present
  if (histRisk) {
    const isUnavailable = histRisk === 'unavailable';
    const riskLevel = isUnavailable ? 'unavailable' : histRisk;
    const anomalyScore = (typeof histScore === 'number' && Number.isFinite(histScore)) ? histScore : null;
    const anomaly = riskLevel === 'warning';

    return {
      available: !isUnavailable && (riskLevel === 'normal' || riskLevel === 'warning'),
      riskLevel,
      anomaly,
      anomalyScore,
      alert: anomaly,
      reason: null
    };
  }

  // Unavailable / missing
  return {
    available: false,
    riskLevel: 'unavailable',
    anomaly: false,
    anomalyScore: null,
    alert: false,
    reason: 'No AI data available'
  };
};

/**
 * Compact inline badge for dossier headers, patient lists, and status lines.
 */
export const AiRiskBadge = ({ ai, telemetryPoint, style = {} }) => {
  const info = extractAiInfo(ai, telemetryPoint);

  if (!info.available) {
    return (
      <span
        className="badge"
        style={{
          background: 'rgba(255, 255, 255, 0.07)',
          color: 'var(--text-muted)',
          border: '1px solid rgba(255, 255, 255, 0.12)',
          fontSize: '0.78rem',
          ...style
        }}
        title={info.reason || 'AI Engine offline or not evaluated'}
      >
        <HelpCircle size={12} /> AI Unavailable
      </span>
    );
  }

  if (info.riskLevel === 'warning' || info.anomaly) {
    return (
      <span
        className="badge badge-warning"
        style={{
          background: 'rgba(255, 193, 7, 0.18)',
          color: '#ffc107',
          border: '1px solid rgba(255, 193, 7, 0.4)',
          fontSize: '0.78rem',
          ...style
        }}
      >
        <AlertTriangle size={12} /> AI Warning
        {info.anomalyScore != null && ` (${(info.anomalyScore * 100).toFixed(1)}%)`}
      </span>
    );
  }

  return (
    <span
      className="badge badge-stable"
      style={{
        fontSize: '0.78rem',
        ...style
      }}
    >
      <CheckCircle2 size={12} /> AI Normal
      {info.anomalyScore != null && ` (${(info.anomalyScore * 100).toFixed(1)}%)`}
    </span>
  );
};

/**
 * Full card component displaying:
 * 1. AI Risk State (Normal / Warning / Unavailable)
 * 2. Anomaly Status (Normal / No anomaly vs Anomaly detected vs AI Unavailable)
 * 3. Anomaly Score (formatted float, or "Unavailable" when absent)
 * 4. Engine health status
 */
const AiRiskCard = ({ ai, telemetryPoint, variant = 'card', style = {} }) => {
  const info = extractAiInfo(ai, telemetryPoint);

  // Determine appearance based on risk level
  const isWarning = info.available && (info.riskLevel === 'warning' || info.anomaly);
  const isNormal = info.available && info.riskLevel === 'normal' && !info.anomaly;

  const borderColor = !info.available
    ? 'var(--glass-border)'
    : isWarning
    ? 'rgba(255, 193, 7, 0.4)'
    : 'rgba(32, 201, 151, 0.4)';

  const accentColor = !info.available
    ? 'var(--text-muted)'
    : isWarning
    ? 'var(--warning)'
    : 'var(--success)';

  const StatusIcon = !info.available ? HelpCircle : (isWarning ? AlertTriangle : CheckCircle2);

  // Score display: strictly no fake score
  const scoreDisplay = info.anomalyScore != null
    ? `${(info.anomalyScore * 100).toFixed(2)}% (Score: ${info.anomalyScore.toFixed(4)})`
    : 'Unavailable';

  const anomalyStatusText = !info.available
    ? 'AI Unavailable'
    : (isWarning ? 'Anomaly Detected' : 'Normal / No Anomaly');

  const riskLevelText = !info.available
    ? 'Unavailable'
    : (isWarning ? 'Warning' : 'Normal');

  if (variant === 'metric') {
    // Single vital metric card format (matches PatientDashboard cards)
    return (
      <div
        className="glass-panel"
        style={{
          padding: '1.25rem',
          borderLeft: `4px solid ${accentColor}`,
          ...style
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
          <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            AI Risk & Anomaly Engine
          </span>
          <Cpu size={18} style={{ color: accentColor }} />
        </div>
        <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.2rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <StatusIcon size={18} style={{ color: accentColor }} />
          <span>{anomalyStatusText}</span>
        </div>
        <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>Risk: <strong style={{ color: accentColor }}>{riskLevelText}</strong></span>
          <span>Score: <strong style={{ color: info.anomalyScore != null ? 'var(--text-primary)' : 'var(--text-muted)' }}>{info.anomalyScore != null ? info.anomalyScore.toFixed(4) : 'Unavailable'}</strong></span>
        </div>
      </div>
    );
  }

  // Default detailed panel format (for HealthScorePanel or standalone dashboard section)
  return (
    <div
      className="glass-panel"
      style={{
        padding: '1.25rem',
        background: !info.available
          ? 'rgba(255, 255, 255, 0.02)'
          : isWarning
          ? 'rgba(255, 193, 7, 0.06)'
          : 'rgba(32, 201, 151, 0.06)',
        border: `1px solid ${borderColor}`,
        borderRadius: '10px',
        ...style
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <div
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '8px',
              background: 'rgba(0, 210, 255, 0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <Cpu size={18} style={{ color: 'var(--accent-primary)' }} />
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-primary)' }}>
              AI Telemetry Risk Engine
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
              Neural inference pipeline • /analyze on :5002
            </div>
          </div>
        </div>

        <AiRiskBadge ai={info} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.75rem' }}>
        {/* Risk State */}
        <div style={{ padding: '0.65rem 0.85rem', background: 'rgba(0,0,0,0.2)', borderRadius: '8px' }}>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Risk State
          </div>
          <div style={{ fontSize: '1rem', fontWeight: 700, color: accentColor, marginTop: '0.15rem' }}>
            {riskLevelText}
          </div>
        </div>

        {/* Anomaly Status */}
        <div style={{ padding: '0.65rem 0.85rem', background: 'rgba(0,0,0,0.2)', borderRadius: '8px' }}>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Anomaly Status
          </div>
          <div style={{ fontSize: '0.92rem', fontWeight: 600, color: 'var(--text-primary)', marginTop: '0.15rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <StatusIcon size={14} style={{ color: accentColor, flexShrink: 0 }} />
            <span>{anomalyStatusText}</span>
          </div>
        </div>

        {/* Anomaly Score */}
        <div style={{ padding: '0.65rem 0.85rem', background: 'rgba(0,0,0,0.2)', borderRadius: '8px' }}>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Anomaly Score
          </div>
          <div style={{ fontSize: '0.92rem', fontWeight: 700, color: info.anomalyScore != null ? 'var(--text-primary)' : 'var(--text-muted)', marginTop: '0.15rem' }}>
            {scoreDisplay}
          </div>
        </div>
      </div>

      {!info.available && info.reason && (
        <div style={{ marginTop: '0.65rem', fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
          <AlertCircle size={12} />
          <span>{info.reason}</span>
        </div>
      )}
    </div>
  );
};

export default React.memo(AiRiskCard);
