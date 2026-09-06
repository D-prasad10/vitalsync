import React, { useMemo } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend
} from 'chart.js';
import { Bar } from 'react-chartjs-2';
import { Clock, BarChart2 } from 'lucide-react';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend
);

const HistoryBarGraph = ({
  title,
  dataPoints = [],
  dataKey,
  color = '#3a7bd5',
  yMin,
  yMax,
  unit = '',
  loading = false
}) => {
  // Process data points into 1-minute averaged buckets
  const chartData = useMemo(() => {
    if (!dataPoints || dataPoints.length === 0) return null;

    const buckets = {};
    dataPoints.forEach(pt => {
      if (!pt || pt[dataKey] === undefined) return;
      const date = new Date(pt.timestamp || Date.now());
      const bucketDate = new Date(date);
      bucketDate.setSeconds(0, 0);

      const bucketKey = bucketDate.getTime();
      if (!buckets[bucketKey]) buckets[bucketKey] = [];
      buckets[bucketKey].push(Number(pt[dataKey]));
    });

    const sortedKeys = Object.keys(buckets).map(Number).sort((a, b) => a - b);
    if (sortedKeys.length === 0) return null;

    const labels = [];
    const avgData = [];

    sortedKeys.forEach(key => {
      const d = new Date(key);
      const m = d.getMinutes().toString().padStart(2, '0');
      const h = d.getHours().toString().padStart(2, '0');
      labels.push(`${h}:${m}`);

      const vals = buckets[key];
      const sum = vals.reduce((a, b) => a + b, 0);
      avgData.push(Math.round((sum / vals.length) * 10) / 10);
    });

    return {
      labels,
      datasets: [
        {
          label: title,
          data: avgData,
          backgroundColor: `${color}88`,
          borderColor: color,
          borderWidth: 1,
          borderRadius: 4,
          maxBarThickness: 32,
          minBarLength: 4
        }
      ]
    };
  }, [dataPoints, dataKey, color, title]);

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    color: '#f8f9fa',
    layout: {
      padding: {
        top: 8,
        bottom: 4,
        left: 4,
        right: 8
      }
    },
    scales: {
      y: {
        min: yMin,
        max: yMax,
        grid: { color: 'rgba(255, 255, 255, 0.06)' },
        ticks: {
          color: 'rgba(148, 163, 184, 0.8)',
          font: { size: 11, family: 'Inter, sans-serif' },
          padding: 6
        }
      },
      x: {
        grid: { display: false },
        ticks: {
          color: 'rgba(148, 163, 184, 0.8)',
          font: { size: 10, family: 'Inter, sans-serif' },
          maxTicksLimit: 8,
          autoSkip: true,
          maxRotation: 0,
          minRotation: 0
        }
      }
    },
    plugins: {
      legend: { display: false },
      tooltip: {
        mode: 'index',
        intersect: false,
        backgroundColor: 'rgba(11, 13, 20, 0.95)',
        titleColor: '#ffffff',
        bodyColor: color,
        borderColor: 'rgba(255, 255, 255, 0.12)',
        borderWidth: 1,
        padding: 10,
        callbacks: {
          label: (context) => `Avg: ${context.parsed.y}${unit ? ` ${unit}` : ''}`
        }
      }
    }
  };

  return (
    <div className="history-bar-card glass-panel" style={{ padding: '1.25rem', width: '100%', minWidth: 0 }}>
      {/* Header Row ABOVE Chart */}
      <div className="chart-header-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
        <h3 style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-secondary)', margin: 0, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          {title} (1-Min Averages)
        </h3>
        <span className="badge badge-info" style={{ fontSize: '0.7rem' }}>
          <Clock size={11} style={{ marginRight: '2px' }} /> History Log
        </span>
      </div>

      {/* Chart Canvas / State Wrapper */}
      <div className="chart-body-container" style={{ width: '100%', height: '200px', position: 'relative' }}>
        {loading ? (
          <div className="empty-state" style={{ height: '100%', padding: 0 }}>
            <div className="loading-spinner" />
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Processing historical trends...</span>
          </div>
        ) : !chartData ? (
          <div className="empty-state" style={{ height: '100%', padding: '1rem', border: '1px dashed var(--glass-border)', borderRadius: '8px' }}>
            <BarChart2 size={24} style={{ color: 'var(--text-muted)' }} />
            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 500 }}>No Historical Telemetry Logged</span>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Sensor history will accumulate over time</span>
          </div>
        ) : (
          <Bar options={options} data={chartData} />
        )}
      </div>
    </div>
  );
};

export default HistoryBarGraph;
