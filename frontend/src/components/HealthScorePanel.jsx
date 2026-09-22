import React, { useMemo } from 'react';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend
} from 'chart.js';
import { Activity, HeartPulse, Thermometer, Wind, Cpu } from 'lucide-react';
import AiRiskCard, { AiRiskBadge } from './AiRiskCard';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend);
ChartJS.defaults.animation = false;

// Health Score Progress Bar Component
const CircularProgress = ({ score }) => {
  const radius = 60;
  const stroke = 12;
  const normalizedRadius = radius - stroke * 2;
  const circumference = normalizedRadius * 2 * Math.PI;
  const strokeDashoffset = circumference - (score / 100) * circumference;

  let color = 'var(--success)';
  if (score < 50) color = 'var(--warning-critical, #ff4d4f)';
  else if (score < 80) color = 'var(--warning, #ffc107)';

  return (
    <div style={{ position: 'relative', width: '120px', height: '120px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <svg height={radius * 2} width={radius * 2} style={{ transform: 'rotate(-90deg)' }}>
        <circle
          stroke="var(--border-light, #e2e8f0)"
          fill="transparent"
          strokeWidth={stroke}
          r={normalizedRadius}
          cx={radius}
          cy={radius}
        />
        <circle
          stroke={color}
          fill="transparent"
          strokeWidth={stroke}
          strokeDasharray={circumference + ' ' + circumference}
          style={{ strokeDashoffset, transition: 'stroke-dashoffset 0.8s ease-in-out' }}
          strokeLinecap="round"
          r={normalizedRadius}
          cx={radius}
          cy={radius}
        />
      </svg>
      <div style={{ position: 'absolute', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <span style={{ fontSize: '2rem', fontWeight: 800, color, lineHeight: 1 }}>{score}</span>
        <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 600 }}>Score</span>
      </div>
    </div>
  );
};

// Main Panel Component
const HealthScorePanel = ({ currentData, historyData }) => {
  const latestData = currentData?.slice(-1)[0] || {};
  
  // Calculate score if not provided directly via socket (fallback) or use the one from backend
  const rawScore = latestData.healthScore ?? latestData.health_score;
  const score = rawScore !== undefined && rawScore !== null ? rawScore : 100;
  
  let scoreStatus = 'Healthy';
  let tip = 'Patient is in good condition. Continue normal observation.';
  if (score < 50) {
    scoreStatus = 'Critical';
    tip = 'Critical condition! Immediate medical intervention required.';
  } else if (score < 80) {
    scoreStatus = 'Moderate';
    tip = 'Some vitals are abnormal. Monitor closely.';
  }

  // Assess individual vitals
  const getStatus = (val, type) => {
    if (val === undefined || val === null) return { text: '--', color: 'var(--text-secondary)' };
    if (type === 'hr') {
      if (val < 50 || val > 120) return { text: 'Critical', color: '#ff4d4f' };
      if (val < 60 || val > 100) return { text: 'Slightly High/Low', color: '#ffc107' };
      return { text: 'Normal', color: 'var(--success)' };
    }
    if (type === 'bp') {
      if (val < 80 || val > 140) return { text: 'Critical', color: '#ff4d4f' };
      if (val < 90 || val > 120) return { text: 'Slightly High/Low', color: '#ffc107' };
      return { text: 'Normal', color: 'var(--success)' };
    }
    if (type === 'spo2') {
      if (val < 90) return { text: 'Critical', color: '#ff4d4f' };
      if (val < 95) return { text: 'Warning', color: '#ffc107' };
      return { text: 'Normal', color: 'var(--success)' };
    }
    if (type === 'temp') {
      if (val < 95 || val > 101) return { text: 'Critical', color: '#ff4d4f' };
      if (val < 97 || val > 99) return { text: 'Slightly High/Low', color: '#ffc107' };
      return { text: 'Normal', color: 'var(--success)' };
    }
    return { text: 'Unknown', color: 'var(--text-secondary)' };
  };

  const hrVal = latestData.hr ?? latestData.heart_rate ?? latestData.pulse;
  const sysVal = latestData.bpSys ?? latestData.bp_sys;
  const tempVal = latestData.temp ?? latestData.temperature;

  const hrStatus = getStatus(hrVal, 'hr');
  const bpStatus = getStatus(sysVal, 'bp');
  const spo2Status = getStatus(latestData.spo2, 'spo2');
  const tempStatus = getStatus(tempVal, 'temp');

  // Prepare Chart Data
  const chartData = useMemo(() => {
    if (!historyData || historyData.length === 0) return null;
    const sourceData = historyData.length > 500 ? historyData.slice(-500) : historyData;
    
    // Calculate 7 days ago limit
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const sevenDaysAgo = startOfToday - (6 * 24 * 60 * 60 * 1000); // including today makes 7

    // Filter for valid scores from the last 7 days
    const validHistory = sourceData.filter(d => 
      d.health_score !== undefined && 
      d.health_score !== null && 
      d.timestamp >= sevenDaysAgo
    );
    
    // Group by Day (Local Date String)
    const dailyGroups = {};
    validHistory.forEach(d => {
      const date = new Date(d.timestamp);
      // Create a sortable YYYY-MM-DD key using local time to avoid timezone shifts
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const dateKey = `${year}-${month}-${day}`;
      
      if (!dailyGroups[dateKey]) dailyGroups[dateKey] = [];
      dailyGroups[dateKey].push(d.health_score);
    });

    const labels = [];
    const data = [];

    // Sort the dates chronologically
    const sortedDates = Object.keys(dailyGroups).sort();
    
    sortedDates.forEach(dateKey => {
      const scores = dailyGroups[dateKey];
      const avgScore = Math.round(scores.reduce((sum, val) => sum + val, 0) / scores.length);
      
      // Parse dates for label mapping (e.g. "Mar 11")
      const [y, m, d] = dateKey.split('-');
      const dateObj = new Date(y, m - 1, d);
      const displayLabel = dateObj.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
      
      labels.push(displayLabel);
      data.push(avgScore);
    });

    return {
      labels,
      datasets: [
        {
          label: 'Avg Daily Score',
          data,
          borderColor: '#0d9488',
          backgroundColor: 'rgba(13, 148, 136, 0.12)',
          borderWidth: 2.5,
          pointRadius: 4,
          pointBackgroundColor: '#0d9488',
          pointBorderColor: '#ffffff',
          pointBorderWidth: 2,
          fill: true,
          tension: 0.3
        }
      ]
    };
  }, [historyData]);

  const chartOptions = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    plugins: {
      legend: { display: false },
      title: {
        display: true,
        text: 'Previous Score Trend of 7 Days',
        color: '#0f172a',
        font: { size: 15, weight: '700' },
        padding: { bottom: 16 }
      },
      tooltip: {
        mode: 'index',
        intersect: false,
        animation: false,
        padding: 10,
        backgroundColor: 'rgba(15, 23, 42, 0.95)',
        titleFont: { size: 13, weight: '600' },
        bodyFont: { size: 13, weight: '700' },
        callbacks: {
           label: (context) => `Avg Score: ${context.parsed.y}`
        }
      }
    },
    scales: {
      x: {
        display: true,
        title: {
          display: true,
          text: 'Days',
          color: '#64748b',
          font: { size: 12, weight: '600' },
          padding: { top: 8 }
        },
        grid: { display: false },
        ticks: { color: '#64748b', maxRotation: 0, font: { size: 11 } }
      },
      y: {
        display: true,
        title: {
          display: true,
          text: 'Health Score',
          color: '#64748b',
          font: { size: 12, weight: '600' },
          padding: { bottom: 8 }
        },
        min: 0,
        max: 100,
        border: { display: false },
        grid: { color: 'rgba(226, 232, 240, 0.8)', drawBorder: false },
        ticks: { color: '#64748b', stepSize: 20, padding: 8 }
      }
    }
  }), []);

  return (
    <div className="glass-panel health-score-panel-card" style={{ padding: '1.25rem 1.5rem', background: '#ffffff', border: '1px solid var(--border-light)', borderRadius: '12px', boxShadow: 'var(--shadow-sm)' }}>
      <div className="health-score-grid">
        {/* Left Column: Overall Health Score & Vitals Breakdown */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.15rem' }}>
          {/* Score & Tip Row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
            <CircularProgress score={score} />
            <div style={{ flex: 1 }}>
              <h2 style={{ margin: '0 0 0.35rem 0', fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                Overall Health: <span style={{ color: score < 50 ? '#ef4444' : score < 80 ? '#f59e0b' : '#10b981' }}>{scoreStatus}</span>
              </h2>
              <div style={{ background: '#f8fafc', padding: '0.65rem 0.85rem', borderRadius: '8px', border: '1px solid var(--border-light)', borderLeft: `4px solid ${score < 50 ? '#ef4444' : score < 80 ? '#f59e0b' : '#10b981'}` }}>
                <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                  <strong style={{ color: 'var(--text-primary)' }}>Tip:</strong> {tip}
                </p>
              </div>
            </div>
          </div>

          {/* Vitals Status Table */}
          <div>
            <h3 style={{ fontSize: '0.78rem', fontWeight: 700, marginBottom: '0.5rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Vitals Status Breakdown</h3>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-light)', color: 'var(--text-secondary)', textAlign: 'left' }}>
                  <th style={{ padding: '0.45rem 0', fontWeight: 600 }}>Vital Sign</th>
                  <th style={{ padding: '0.45rem 0', textAlign: 'right', fontWeight: 600 }}>Status</th>
                </tr>
              </thead>
              <tbody>
                <tr style={{ borderBottom: '1px solid var(--border-light)' }}>
                  <td style={{ padding: '0.45rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-primary)', fontWeight: 500 }}>
                    <HeartPulse size={15} color="#ef4444" /> Heart Rate
                  </td>
                  <td style={{ padding: '0.45rem 0', textAlign: 'right', color: hrStatus.color, fontWeight: 600 }}>{hrStatus.text}</td>
                </tr>
                <tr style={{ borderBottom: '1px solid var(--border-light)' }}>
                  <td style={{ padding: '0.45rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-primary)', fontWeight: 500 }}>
                    <Activity size={15} color="#f59e0b" /> Blood Pressure
                  </td>
                  <td style={{ padding: '0.45rem 0', textAlign: 'right', color: bpStatus.color, fontWeight: 600 }}>{bpStatus.text}</td>
                </tr>
                <tr style={{ borderBottom: '1px solid var(--border-light)' }}>
                  <td style={{ padding: '0.45rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-primary)', fontWeight: 500 }}>
                    <Thermometer size={15} color="#0d9488" /> Temperature
                  </td>
                  <td style={{ padding: '0.45rem 0', textAlign: 'right', color: tempStatus.color, fontWeight: 600 }}>{tempStatus.text}</td>
                </tr>
                <tr>
                  <td style={{ padding: '0.45rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-primary)', fontWeight: 500 }}>
                    <Wind size={15} color="#2563eb" /> Oxygen Level (SpO2)
                  </td>
                  <td style={{ padding: '0.45rem 0', textAlign: 'right', color: spo2Status.color, fontWeight: 600 }}>{spo2Status.text}</td>
                </tr>
                <tr>
                  <td style={{ padding: '0.45rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-primary)', fontWeight: 500 }}>
                    <Cpu size={15} color="var(--accent-primary)" /> AI Anomaly Risk
                  </td>
                  <td style={{ padding: '0.45rem 0', textAlign: 'right' }}>
                    <AiRiskBadge ai={latestData.ai} telemetryPoint={latestData} />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Right Column: 7-Day History Chart */}
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: '260px' }}>
          {chartData && chartData.labels.length > 0 ? (
            <div style={{ flex: 1, width: '100%', minHeight: '260px', background: '#f8fafc', padding: '0.85rem', borderRadius: '8px', border: '1px solid var(--border-light)' }}>
              <Line data={chartData} options={chartOptions} redraw={false} />
            </div>
          ) : (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '1.5rem', textAlign: 'center', background: '#f8fafc', borderRadius: '8px', border: '1px solid var(--border-light)', color: 'var(--text-secondary)' }}>
              <h4 style={{ fontSize: '0.9rem', marginBottom: '0.25rem', color: 'var(--text-primary)', fontWeight: 600 }}>Previous Score Trend of 7 Days</h4>
              <span style={{ fontSize: '0.8rem' }}>Gathering 7-day health score data...</span>
            </div>
          )}
        </div>
      </div>

      {/* AI Telemetry Risk Engine Card */}
      <div style={{ marginTop: '1.25rem' }}>
        <AiRiskCard ai={latestData.ai} telemetryPoint={latestData} />
      </div>
    </div>
  );
};

export default React.memo(HealthScorePanel);

