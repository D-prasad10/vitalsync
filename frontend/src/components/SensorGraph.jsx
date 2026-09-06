import React, { useMemo } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import { Activity } from 'lucide-react';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

ChartJS.defaults.animation = false;
ChartJS.defaults.responsive = true;
ChartJS.defaults.maintainAspectRatio = false;

const downsample = (points, max = 48) => {
  if (!Array.isArray(points) || points.length <= max) return points || [];
  const step = (points.length - 1) / (max - 1);
  const out = new Array(max);
  for (let i = 0; i < max; i++) out[i] = points[Math.round(i * step)];
  return out;
};

const getValue = (d, key, fallbackKey) => {
  if (!d) return null;
  if (key && d[key] !== undefined && d[key] !== null) return d[key];
  if (fallbackKey && d[fallbackKey] !== undefined && d[fallbackKey] !== null) return d[fallbackKey];
  
  // Implicit key mappings
  if (key === 'hr' || key === 'heart_rate') return d.hr ?? d.heart_rate ?? d.pulse ?? null;
  if (key === 'temp' || key === 'temperature') return d.temp ?? d.temperature ?? null;
  if (key === 'spo2') return d.spo2 ?? null;
  if (key === 'bp_sys' || key === 'bpSys') return d.bp_sys ?? d.bpSys ?? null;
  if (key === 'bp_dia' || key === 'bpDia') return d.bp_dia ?? d.bpDia ?? null;
  if (key === 'health_score' || key === 'healthScore') return d.health_score ?? d.healthScore ?? null;
  
  return null;
};

const SensorGraph = ({
  title,
  dataPoints = [],
  dataKey,
  color = '#00d2ff',
  yMin,
  yMax,
  unit = '',
  loading = false,
  displayValue = null,
  height = '180px',
  dateFormat = 'time', // 'time' or 'datetime'
  maxTicksLimit,
  datasets = null // Optional array of { label, dataKey, fallbackKey, color }
}) => {
  const sampledPoints = useMemo(() => downsample(dataPoints, 48), [dataPoints]);
  const hasData = sampledPoints.length > 0;
  const latestPoint = hasData ? sampledPoints[sampledPoints.length - 1] : null;

  // Formatted display value
  let formattedValue = '--';
  if (displayValue !== null) {
    formattedValue = displayValue;
  } else if (latestPoint) {
    if (datasets && datasets.length >= 2) {
      const val1 = getValue(latestPoint, datasets[0].dataKey, datasets[0].fallbackKey);
      const val2 = getValue(latestPoint, datasets[1].dataKey, datasets[1].fallbackKey);
      formattedValue = (val1 !== null && val2 !== null) ? `${val1}/${val2}${unit ? ` ${unit}` : ''}` : '--';
    } else if (dataKey) {
      const rawVal = getValue(latestPoint, dataKey);
      formattedValue = (rawVal !== null && rawVal !== undefined) ? `${rawVal}${unit ? ` ${unit}` : ''}` : '--';
    }
  }

  // Generate X-axis labels
  const labels = useMemo(() => {
    return hasData
      ? sampledPoints.map(d => {
          const date = new Date(d.timestamp || 0);
          if (dateFormat === 'datetime') {
            const day = date.getDate().toString().padStart(2, '0');
            const month = date.toLocaleString('en-US', { month: 'short' });
            const timeStr = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
            return `${day} ${month}, ${timeStr}`;
          }
          return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        })
      : [];
  }, [hasData, sampledPoints, dateFormat]);

  const chartDatasets = useMemo(() => {
    return datasets && datasets.length > 0
      ? datasets.map(ds => ({
          label: ds.label || title,
          data: hasData ? sampledPoints.map(d => getValue(d, ds.dataKey, ds.fallbackKey)) : [],
          borderColor: ds.color || color,
          backgroundColor: `${ds.color || color}18`,
          fill: ds.fill ?? false,
          tension: 0.35,
          borderWidth: 2,
          pointRadius: hasData && sampledPoints.length < 20 ? 3 : 0,
          pointHoverRadius: 5,
          pointBackgroundColor: ds.color || color
        }))
      : [
          {
            label: title,
            data: hasData ? sampledPoints.map(d => getValue(d, dataKey)) : [],
            borderColor: color,
            backgroundColor: `${color}22`,
            fill: true,
            tension: 0.35,
            borderWidth: 2,
            pointRadius: hasData && sampledPoints.length < 20 ? 3 : 0,
            pointHoverRadius: 5,
            pointBackgroundColor: color
          }
        ];
  }, [datasets, title, hasData, sampledPoints, color, dataKey]);

  const chartData = useMemo(() => ({ labels, datasets: chartDatasets }), [labels, chartDatasets]);

  const hasMultipleDatasets = Boolean(datasets && datasets.length > 1);

  const options = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    color: '#f8f9fa',
    layout: {
      padding: {
        top: 8,
        bottom: 6,
        left: 4,
        right: 8
      }
    },
    scales: {
      y: {
        min: yMin,
        max: yMax,
        grid: {
          color: 'rgba(255, 255, 255, 0.06)'
        },
        ticks: {
          color: 'rgba(148, 163, 184, 0.85)',
          font: { size: 11, family: 'Inter, sans-serif' },
          padding: 6
        }
      },
      x: {
        grid: { display: false },
        ticks: {
          color: 'rgba(148, 163, 184, 0.85)',
          font: { size: 10, family: 'Inter, sans-serif' },
          maxTicksLimit: maxTicksLimit || (dateFormat === 'datetime' ? 8 : 6),
          autoSkip: true,
          maxRotation: dateFormat === 'datetime' ? 25 : 0,
          minRotation: 0
        }
      }
    },
    plugins: {
      legend: {
        display: hasMultipleDatasets,
        position: 'top',
        align: 'end',
        labels: {
          color: '#cbd5e1',
          font: { size: 11, family: 'Inter, sans-serif' },
          boxWidth: 12,
          padding: 8
        }
      },
      tooltip: {
        enabled: true,
        mode: 'index',
        intersect: false,
        animation: false,
        backgroundColor: 'rgba(11, 13, 20, 0.95)',
        titleColor: '#ffffff',
        bodyColor: '#cbd5e1',
        borderColor: 'rgba(255, 255, 255, 0.15)',
        borderWidth: 1,
        padding: 10,
        callbacks: {
          label: (item) => {
            const val = item.raw;
            return `${item.dataset.label}: ${val !== null && val !== undefined ? val : '--'} ${unit}`;
          }
        }
      }
    }
  }), [yMin, yMax, maxTicksLimit, dateFormat, hasMultipleDatasets, unit]);

  return (
    <div className="sensor-graph-card glass-panel" style={{ padding: '1.25rem', width: '100%', minWidth: 0 }}>
      {/* Header Row */}
      <div className="chart-header-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem', gap: '0.5rem' }}>
        <div>
          <h3 style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)', margin: 0, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            {title}
          </h3>
          <div style={{ fontSize: '1.4rem', fontWeight: 700, color: color, marginTop: '0.2rem', lineHeight: 1.2 }}>
            {formattedValue}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          {hasData && (
            <span className="badge badge-stable" style={{ fontSize: '0.7rem', padding: '2px 8px' }}>
              ● Live Stream
            </span>
          )}
        </div>
      </div>

      {/* Chart Body Container */}
      <div className="chart-body-container" style={{ width: '100%', height, position: 'relative' }}>
        {loading ? (
          <div className="empty-state" style={{ height: '100%', padding: 0 }}>
            <div className="loading-spinner" />
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Updating sensor stream...</span>
          </div>
        ) : !hasData ? (
          <div className="empty-state" style={{ height: '100%', padding: '1rem', border: '1px dashed var(--glass-border)', borderRadius: '8px' }}>
            <Activity size={24} style={{ color: 'var(--text-muted)' }} />
            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 500 }}>No Telemetry Data Available</span>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Waiting for live device stream...</span>
          </div>
        ) : (
          <Line options={options} data={chartData} redraw={false} />
        )}
      </div>
    </div>
  );
};

export default React.memo(SensorGraph);


