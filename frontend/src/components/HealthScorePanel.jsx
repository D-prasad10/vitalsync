import React, { useMemo } from 'react';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend
} from 'chart.js';
import { Activity, HeartPulse, Thermometer, Wind } from 'lucide-react';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend);

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
          stroke="rgba(255,255,255,0.1)"
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
        <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Score</span>
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
    
    // Calculate 7 days ago limit
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const sevenDaysAgo = startOfToday - (6 * 24 * 60 * 60 * 1000); // including today makes 7

    // Filter for valid scores from the last 7 days
    const validHistory = historyData.filter(d => 
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
          borderColor: 'rgba(32, 201, 151, 0.9)',
          backgroundColor: 'rgba(32, 201, 151, 0.15)',
          borderWidth: 3,
          pointRadius: 5,
          pointBackgroundColor: 'rgba(32, 201, 151, 1)',
          pointBorderColor: '#fff',
          pointBorderWidth: 2,
          fill: true,
          tension: 0.3
        }
      ]
    };
  }, [historyData]);

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      title: {
        display: true,
        text: 'Previous Score Trend of 7 Days',
        color: 'rgba(255, 255, 255, 0.9)',
        font: { size: 16, weight: 'bold' },
        padding: { bottom: 20 }
      },
      tooltip: { 
        mode: 'index', 
        intersect: false,
        padding: 10,
        backgroundColor: 'rgba(0,0,0,0.8)',
        titleFont: { size: 14 },
        bodyFont: { size: 14, weight: 'bold' },
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
          color: 'var(--text-secondary)',
          font: { size: 12, weight: 'bold' },
          padding: { top: 10 }
        },
        grid: { display: false },
        ticks: { color: 'var(--text-secondary)', maxRotation: 0, font: { size: 11 } }
      },
      y: { 
        display: true,
        title: {
          display: true,
          text: 'Health Score',
          color: 'var(--text-secondary)',
          font: { size: 12, weight: 'bold' },
          padding: { bottom: 10 }
        },
        min: 0, 
        max: 100, 
        border: { display: false }, 
        grid: { color: 'rgba(255,255,255,0.05)', drawBorder: false }, 
        ticks: { color: 'var(--text-secondary)', stepSize: 20, padding: 10 } 
      }
    }
  };

  return (
    <div className="glass-panel" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem', background: 'linear-gradient(145deg, rgba(0,0,0,0.3) 0%, rgba(0,0,0,0.1) 100%)' }}>
      
      {/* Header & Score Section */}
      <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '2rem', alignItems: 'center' }}>
        <CircularProgress score={score} />
        <div>
          <h2 style={{ margin: '0 0 0.5rem 0', fontSize: '1.5rem', color: 'var(--text-primary)' }}>
            Overall Health: <span style={{ color: score < 50 ? '#ff4d4f' : score < 80 ? '#ffc107' : 'var(--success)' }}>{scoreStatus}</span>
          </h2>
          <div style={{ background: 'rgba(255,255,255,0.05)', padding: '0.75rem', borderRadius: '8px', borderLeft: `3px solid ${score < 50 ? '#ff4d4f' : score < 80 ? '#ffc107' : 'var(--success)'}` }}>
            <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
              <strong>Tip:</strong> {tip}
            </p>
          </div>
        </div>
      </div>

      {/* Vitals Status Table */}
      <div>
        <h3 style={{ fontSize: '1.1rem', marginBottom: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '1px' }}>Vitals Status breakdown</h3>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', color: 'var(--text-secondary)', textAlign: 'left' }}>
              <th style={{ padding: '0.75rem 0' }}>Vital Sign</th>
              <th style={{ padding: '0.75rem 0', textAlign: 'right' }}>Status</th>
            </tr>
          </thead>
          <tbody>
            <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
              <td style={{ padding: '0.75rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <HeartPulse size={16} color="#ff4d4f" /> Heart Rate
              </td>
              <td style={{ padding: '0.75rem 0', textAlign: 'right', color: hrStatus.color, fontWeight: 600 }}>{hrStatus.text}</td>
            </tr>
            <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
              <td style={{ padding: '0.75rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Activity size={16} color="#ffc107" /> Blood Pressure
              </td>
              <td style={{ padding: '0.75rem 0', textAlign: 'right', color: bpStatus.color, fontWeight: 600 }}>{bpStatus.text}</td>
            </tr>
            <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
              <td style={{ padding: '0.75rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Thermometer size={16} color="#20c997" /> Temperature
              </td>
              <td style={{ padding: '0.75rem 0', textAlign: 'right', color: tempStatus.color, fontWeight: 600 }}>{tempStatus.text}</td>
            </tr>
            <tr>
              <td style={{ padding: '0.75rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Wind size={16} color="#00d2ff" /> Oxygen Level (SpO2)
              </td>
              <td style={{ padding: '0.75rem 0', textAlign: 'right', color: spo2Status.color, fontWeight: 600 }}>{spo2Status.text}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* History Chart */}
      {chartData && chartData.labels.length > 0 ? (
        <div style={{ marginTop: '1rem' }}>
          <div style={{ height: '240px', width: '100%', background: 'rgba(0,0,0,0.2)', padding: '1rem', borderRadius: '8px' }}>
            <Line data={chartData} options={chartOptions} />
          </div>
        </div>
      ) : (
        <div style={{ marginTop: '1rem' }}>
          <h3 style={{ fontSize: '1.2rem', marginBottom: '0.75rem', color: 'rgba(255, 255, 255, 0.9)', textAlign: 'center', fontWeight: 'bold' }}>Previous Score Trend of 7 Days</h3>
          <div style={{ padding: '2rem', textAlign: 'center', background: 'rgba(0,0,0,0.2)', borderRadius: '8px', color: 'var(--text-secondary)' }}>
            Gathering 7-day health score data...
          </div>
        </div>
      )}

    </div>
  );
};

export default HealthScorePanel;
