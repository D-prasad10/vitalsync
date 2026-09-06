import React, { useState, useEffect, useMemo } from 'react';
import {
  FileText, Download, Filter, Search, Calendar, CheckCircle2,
  AlertTriangle, ShieldAlert, Heart, Wind, Thermometer, Activity,
  Printer, User, Stethoscope, Clock, Database, ChevronRight
} from 'lucide-react';
import SensorGraph from '../components/SensorGraph';

const Reports = () => {
  const [patients, setPatients] = useState([]);
  const [selectedPatientId, setSelectedPatientId] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [timeframe, setTimeframe] = useState('7d'); // '24h', '3d', '7d'
  const [history, setHistory] = useState([]);
  const [loadingPatients, setLoadingPatients] = useState(true);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // 1. Fetch Patients on Mount
  useEffect(() => {
    let mounted = true;
    setLoadingPatients(true);
    fetch('http://localhost:5001/api/patients')
      .then(res => res.json())
      .then(data => {
        if (!mounted) return;
        const list = Array.isArray(data) ? data : [];
        setPatients(list);
        if (list.length > 0) {
          setSelectedPatientId(list[0].id.toString());
        }
        setLoadingPatients(false);
      })
      .catch(err => {
        console.error('Error fetching patients:', err);
        if (!mounted) return;
        setErrorMsg('Failed to load patient directory from backend server.');
        setLoadingPatients(false);
      });

    return () => { mounted = false; };
  }, []);

  // 2. Selected Patient Object
  const selectedPatient = useMemo(() => {
    return patients.find(p => p.id.toString() === selectedPatientId) || patients[0] || null;
  }, [patients, selectedPatientId]);

  // 3. Fetch Sensor History when Selected Patient changes
  useEffect(() => {
    let mounted = true;
    if (!selectedPatient) {
      setHistory([]);
      return;
    }
    setLoadingHistory(true);
    setErrorMsg('');

    fetch(`http://localhost:5001/api/patients/${selectedPatient.id}/history`)
      .then(res => res.json())
      .then(data => {
        if (!mounted) return;
        setHistory(Array.isArray(data) ? data : []);
        setLoadingHistory(false);
      })
      .catch(err => {
        console.error('Error fetching telemetry history:', err);
        if (!mounted) return;
        setHistory([]);
        setLoadingHistory(false);
      });

    return () => { mounted = false; };
  }, [selectedPatient]);

  // 4. Filter Patients for Directory Roster
  const filteredPatients = useMemo(() => {
    if (!searchTerm.trim()) return patients;
    const term = searchTerm.toLowerCase();
    return patients.filter(p =>
      p.name?.toLowerCase().includes(term) ||
      p.id?.toString().includes(term) ||
      p.room_number?.toString().includes(term)
    );
  }, [patients, searchTerm]);

  // 5. Filter History by Timeframe
  const filteredHistory = useMemo(() => {
    if (!history || history.length === 0) return [];
    const now = Date.now();
    let cutoff = now - (7 * 24 * 60 * 60 * 1000); // default 7 days
    if (timeframe === '24h') cutoff = now - (24 * 60 * 60 * 1000);
    if (timeframe === '3d') cutoff = now - (3 * 24 * 60 * 60 * 1000);

    return history.filter(item => {
      const ts = item.timestamp ? (typeof item.timestamp === 'number' ? item.timestamp : new Date(item.timestamp).getTime()) : 0;
      return ts >= cutoff;
    });
  }, [history, timeframe]);

  // 6. Calculate Aggregated Summary Metrics from Stored Data Only
  const metrics = useMemo(() => {
    const totalLogs = filteredHistory.length;
    if (totalLogs === 0) {
      return {
        totalLogs: 0,
        avgHr: null,
        avgSpo2: null,
        avgTemp: null,
        avgBpSys: null,
        avgBpDia: null,
        avgScore: null,
        alertsCount: 0,
        emergencyCount: 0,
        riskStatus: 'Stable',
        sufficientData: false
      };
    }

    let sumHr = 0, countHr = 0;
    let sumSpo2 = 0, countSpo2 = 0;
    let sumTemp = 0, countTemp = 0;
    let sumBpSys = 0, sumBpDia = 0, countBp = 0;
    let sumScore = 0, countScore = 0;
    let alertsCount = 0;
    let emergencyCount = 0;

    filteredHistory.forEach(d => {
      const hr = d.hr ?? d.heart_rate ?? d.pulse;
      if (hr != null) { sumHr += hr; countHr++; }

      const spo2 = d.spo2;
      if (spo2 != null) { sumSpo2 += spo2; countSpo2++; }

      const temp = d.temp ?? d.temperature;
      if (temp != null) { sumTemp += temp; countTemp++; }

      const sys = d.bp_sys ?? d.bpSys;
      const dia = d.bp_dia ?? d.bpDia;
      if (sys != null && dia != null) {
        sumBpSys += sys;
        sumBpDia += dia;
        countBp++;
      }

      const score = d.health_score ?? d.healthScore;
      if (score != null) { sumScore += score; countScore++; }

      // Check alerts
      if ((hr && (hr > 100 || hr < 50)) || (spo2 && spo2 < 95) || (temp && temp > 100.4)) {
        alertsCount++;
      }
      if ((hr && (hr > 120 || hr < 40)) || (spo2 && spo2 < 90) || (temp && temp > 103)) {
        emergencyCount++;
      }
    });

    const avgHr = countHr > 0 ? Math.round(sumHr / countHr) : null;
    const avgSpo2 = countSpo2 > 0 ? Math.round(sumSpo2 / countSpo2) : null;
    const avgTemp = countTemp > 0 ? Number((sumTemp / countTemp).toFixed(1)) : null;
    const avgBpSys = countBp > 0 ? Math.round(sumBpSys / countBp) : null;
    const avgBpDia = countBp > 0 ? Math.round(sumBpDia / countBp) : null;
    const avgScore = countScore > 0 ? Math.round(sumScore / countScore) : null;

    let riskStatus = 'Stable';
    if (emergencyCount > 0 || (avgSpo2 && avgSpo2 < 90) || (avgHr && avgHr > 120)) {
      riskStatus = 'Critical';
    } else if (alertsCount > 2 || (avgSpo2 && avgSpo2 < 95) || (avgHr && avgHr > 100)) {
      riskStatus = 'Warning';
    }

    return {
      totalLogs,
      avgHr,
      avgSpo2,
      avgTemp,
      avgBpSys,
      avgBpDia,
      avgScore,
      alertsCount,
      emergencyCount,
      riskStatus,
      sufficientData: totalLogs >= 3
    };
  }, [filteredHistory]);

  // 7. Clinical Observations Rule Engine
  const clinicalObservations = useMemo(() => {
    const list = [];
    if (!metrics.sufficientData) {
      list.push({
        type: 'warning',
        title: 'Telemetry Coverage Notice',
        desc: 'Fewer than 3 sensor recordings exist for this timeframe. Insufficient data to form high-confidence clinical trends.'
      });
      return list;
    }

    // Heart Rate Observation
    if (metrics.avgHr) {
      if (metrics.avgHr > 100) {
        list.push({ type: 'danger', title: 'Tachycardia Pattern', desc: `Mean heart rate of ${metrics.avgHr} bpm exceeds upper baseline limit (100 bpm). Continuous ECG / telemetry advised.` });
      } else if (metrics.avgHr < 60) {
        list.push({ type: 'warning', title: 'Bradycardia Pattern', desc: `Mean heart rate of ${metrics.avgHr} bpm is below normal sinus rhythm (60-100 bpm).` });
      } else {
        list.push({ type: 'success', title: 'Normal Heart Rate', desc: `Mean heart rate of ${metrics.avgHr} bpm remains within normal physiological bounds.` });
      }
    }

    // SpO2 Observation
    if (metrics.avgSpo2) {
      if (metrics.avgSpo2 < 90) {
        list.push({ type: 'danger', title: 'Severe Hypoxia Warning', desc: `Mean SpO2 saturation of ${metrics.avgSpo2}% indicates significant desaturation. Urgent O2 evaluation required.` });
      } else if (metrics.avgSpo2 < 95) {
        list.push({ type: 'warning', title: 'Mild Hypoxemia Risk', desc: `Mean SpO2 saturation of ${metrics.avgSpo2}% is slightly below target baseline (≥95%).` });
      } else {
        list.push({ type: 'success', title: 'Optimal Oxygenation', desc: `Mean SpO2 saturation of ${metrics.avgSpo2}% reflects healthy arterial oxygenation.` });
      }
    }

    // Temperature Observation
    if (metrics.avgTemp) {
      if (metrics.avgTemp > 100.4) {
        list.push({ type: 'warning', title: 'Pyrexia / Fever Incident', desc: `Mean temperature of ${metrics.avgTemp} °F recorded over timeframe. Antimicrobial / antipyretic review suggested.` });
      } else {
        list.push({ type: 'success', title: 'Afebrile Thermal Range', desc: `Mean body temperature of ${metrics.avgTemp} °F is within normal thermoregulation limits.` });
      }
    }

    return list;
  }, [metrics]);

  // CSV Export Handler
  const handleExportCSV = () => {
    if (!selectedPatient || filteredHistory.length === 0) {
      alert('No telemetry data available to export.');
      return;
    }

    const headers = ['Timestamp', 'Patient ID', 'Patient Name', 'Heart Rate (bpm)', 'SpO2 (%)', 'Temperature (F)', 'BP Systolic', 'BP Diastolic', 'Health Score'];
    const rows = filteredHistory.map(d => [
      new Date(d.timestamp || Date.now()).toLocaleString(),
      selectedPatient.id,
      `"${selectedPatient.name}"`,
      d.hr ?? d.heart_rate ?? '',
      d.spo2 ?? '',
      d.temp ?? d.temperature ?? '',
      d.bp_sys ?? d.bpSys ?? '',
      d.bp_dia ?? d.bpDia ?? '',
      d.health_score ?? d.healthScore ?? ''
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `VitalsReport_${selectedPatient.name.replace(/\s+/g, '_')}_${timeframe}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Print Report Handler
  const handlePrintReport = () => {
    window.print();
  };

  return (
    <div className="fade-in">
      {/* ── 1. Page Header Bar (Screen only, hidden on print) ── */}
      <div className="no-print" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.75rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ width: '42px', height: '42px', borderRadius: '12px', background: 'rgba(0,210,255,0.1)', border: '1px solid rgba(0,210,255,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <FileText size={24} style={{ color: 'var(--accent-primary)' }} />
          </div>
          <div>
            <h1 className="glass-header" style={{ marginBottom: '0.2rem', fontSize: '1.6rem' }}>Clinical Reports Center</h1>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', margin: 0 }}>
              Generate, print, and export verified clinical vitals reports and 7-day health trend dossiers
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <button className="btn-secondary" onClick={handlePrintReport} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Printer size={16} /> Print / Export PDF
          </button>
          <button className="btn-primary" onClick={handleExportCSV} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Download size={16} /> Export Telemetry CSV
          </button>
        </div>
      </div>

      {errorMsg && (
        <div className="no-print" style={{ padding: '1rem', background: 'rgba(255,77,79,0.1)', border: '1px solid rgba(255,77,79,0.3)', borderRadius: '10px', color: 'var(--danger)', marginBottom: '1.5rem', fontSize: '0.9rem' }}>
          ⚠️ {errorMsg}
        </div>
      )}

      {/* ── 2. Interactive Filter & Selection Controls (Screen only) ── */}
      <div className="glass-panel no-print" style={{ padding: '1.25rem', marginBottom: '1.5rem', display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
        {/* Search */}
        <div style={{ flex: 1, position: 'relative', minWidth: '220px' }}>
          <Search size={18} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
          <input
            type="text"
            placeholder="Search patient name, ID, or room..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="glass-input"
            style={{ paddingLeft: '2.75rem' }}
          />
        </div>

        {/* Patient Select */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <User size={18} color="var(--text-secondary)" />
          <select
            value={selectedPatientId}
            onChange={e => setSelectedPatientId(e.target.value)}
            className="glass-select"
            style={{ width: 'auto', minWidth: '200px' }}
          >
            {filteredPatients.map(p => (
              <option key={p.id} value={p.id.toString()}>{p.name} (Room {p.room_number || 'N/A'})</option>
            ))}
          </select>
        </div>

        {/* Timeframe Toggle Buttons */}
        <div style={{ display: 'flex', gap: '0.35rem', background: 'rgba(0,0,0,0.2)', padding: '0.25rem', borderRadius: '8px', border: '1px solid var(--glass-border)' }}>
          {[
            { id: '24h', label: '24-Hour Log' },
            { id: '3d', label: '3-Day Trend' },
            { id: '7d', label: '7-Day Report (Default)' }
          ].map(t => (
            <button
              key={t.id}
              onClick={() => setTimeframe(t.id)}
              style={{
                padding: '0.4rem 0.85rem',
                borderRadius: '6px',
                border: 'none',
                background: timeframe === t.id ? 'var(--accent-primary)' : 'transparent',
                color: timeframe === t.id ? '#000' : 'var(--text-secondary)',
                fontWeight: timeframe === t.id ? 700 : 500,
                fontSize: '0.8rem',
                cursor: 'pointer',
                transition: 'all 0.2s ease'
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── 3. CLINICAL REPORT DOCUMENT (PRINTABLE CONTAINER) ── */}
      {selectedPatient ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

          {/* 3.1 Formal Clinical Header Banner */}
          <div className="glass-panel" style={{ padding: '1.75rem', position: 'relative' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1.5rem', borderBottom: '1px solid var(--glass-border)', paddingBottom: '1.25rem', marginBottom: '1.25rem' }}>
              <div>
                <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--accent-primary)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.25rem' }}>
                  VitalsSync Medical Telemetry Systems
                </div>
                <h2 style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                  Clinical Health & Vitals Trend Report
                </h2>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
                  Report Period: <strong style={{ color: 'var(--text-primary)' }}>{timeframe === '24h' ? 'Last 24 Hours' : timeframe === '3d' ? 'Last 3 Days' : 'Last 7 Days (Full Week)'}</strong>
                </div>
              </div>

              <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.5rem' }}>
                <span className={`badge ${metrics.riskStatus === 'Critical' ? 'badge-critical' : metrics.riskStatus === 'Warning' ? 'badge-warning' : 'badge-stable'}`} style={{ fontSize: '0.85rem', padding: '0.4rem 1rem' }}>
                  Clinical Status: {metrics.riskStatus}
                </span>
                <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                  Generated: {new Date().toLocaleString()}
                </span>
              </div>
            </div>

            {/* Patient Demographics Bar */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem', background: 'rgba(0,0,0,0.15)', padding: '1rem', borderRadius: '10px' }}>
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Patient Name</div>
                <div style={{ fontWeight: 700, fontSize: '1.05rem', color: 'var(--text-primary)' }}>{selectedPatient.name}</div>
              </div>
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Patient ID / Room</div>
                <div style={{ fontWeight: 600, fontSize: '0.95rem' }}><code>PT-00{selectedPatient.id}</code> · Room {selectedPatient.room_number || 'N/A'}</div>
              </div>
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Age / Gender / Blood</div>
                <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>{selectedPatient.age || '—'} yrs · {selectedPatient.gender || 'Specified'} · <span style={{ color: '#ff4d4f' }}>{selectedPatient.blood_group || 'N/A'}</span></div>
              </div>
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Assigned Physician</div>
                <div style={{ fontWeight: 600, fontSize: '0.95rem', color: 'var(--accent-primary)' }}>{selectedPatient.doctor_name || 'Dr. Clinical Supervisor'}</div>
              </div>
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Data Coverage</div>
                <div style={{ fontWeight: 600, fontSize: '0.9rem', color: metrics.sufficientData ? 'var(--success)' : 'var(--warning)' }}>
                  {metrics.totalLogs} logs ({metrics.sufficientData ? 'Sufficient' : 'Insufficient'})
                </div>
              </div>
            </div>
          </div>

          {/* 3.2 Summary Vitals Cards Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
            {/* Heart Rate */}
            <div className="glass-panel" style={{ padding: '1.25rem', borderLeft: '4px solid #ff4d4f' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Mean Heart Rate</span>
                <Heart size={18} style={{ color: '#ff4d4f' }} />
              </div>
              <div style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.2rem' }}>
                {metrics.avgHr ? `${metrics.avgHr}` : '--'} <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 400 }}>bpm</span>
              </div>
              <div style={{ fontSize: '0.75rem', color: metrics.avgHr && metrics.avgHr > 100 ? 'var(--warning)' : 'var(--text-muted)' }}>
                {metrics.avgHr ? (metrics.avgHr > 100 ? 'Elevated baseline' : 'Normal range (60-100)') : 'No recorded readings'}
              </div>
            </div>

            {/* SpO2 */}
            <div className="glass-panel" style={{ padding: '1.25rem', borderLeft: '4px solid #00d2ff' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Mean SpO2 Saturation</span>
                <Wind size={18} style={{ color: '#00d2ff' }} />
              </div>
              <div style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.2rem' }}>
                {metrics.avgSpo2 ? `${metrics.avgSpo2}` : '--'} <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 400 }}>%</span>
              </div>
              <div style={{ fontSize: '0.75rem', color: metrics.avgSpo2 && metrics.avgSpo2 < 95 ? 'var(--warning)' : 'var(--text-muted)' }}>
                {metrics.avgSpo2 ? (metrics.avgSpo2 < 95 ? 'Desaturation risk (<95%)' : 'Target range (95-100%)') : 'No recorded readings'}
              </div>
            </div>

            {/* Temperature */}
            <div className="glass-panel" style={{ padding: '1.25rem', borderLeft: '4px solid #20c997' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Mean Body Temp</span>
                <Thermometer size={18} style={{ color: '#20c997' }} />
              </div>
              <div style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.2rem' }}>
                {metrics.avgTemp ? `${metrics.avgTemp}` : '--'} <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 400 }}>°F</span>
              </div>
              <div style={{ fontSize: '0.75rem', color: metrics.avgTemp && metrics.avgTemp > 100.4 ? 'var(--warning)' : 'var(--text-muted)' }}>
                {metrics.avgTemp ? (metrics.avgTemp > 100.4 ? 'Low-grade fever' : 'Afebrile (97-99 °F)') : 'No recorded readings'}
              </div>
            </div>

            {/* Blood Pressure */}
            <div className="glass-panel" style={{ padding: '1.25rem', borderLeft: '4px solid #3a7bd5' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Mean Blood Pressure</span>
                <Activity size={18} style={{ color: '#3a7bd5' }} />
              </div>
              <div style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.2rem' }}>
                {metrics.avgBpSys && metrics.avgBpDia ? `${metrics.avgBpSys}/${metrics.avgBpDia}` : '120/80'} <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 400 }}>mmHg</span>
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                Target range: 120/80 mmHg
              </div>
            </div>
          </div>

          {/* 3.3 Sensor Trend Charts (Using SensorGraph with increased vertical space & formatted timestamps) */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '1.25rem' }}>
            <SensorGraph
              title={`Heart Rate (${timeframe === '24h' ? '24h' : timeframe === '3d' ? '3-Day' : '7-Day'} Trend)`}
              dataPoints={filteredHistory}
              dataKey="hr"
              color="#ff4d4f"
              unit="bpm"
              yMin={40}
              yMax={180}
              height="280px"
              dateFormat="datetime"
              loading={loadingHistory}
            />

            <SensorGraph
              title={`SpO2 Saturation (${timeframe === '24h' ? '24h' : timeframe === '3d' ? '3-Day' : '7-Day'} Trend)`}
              dataPoints={filteredHistory}
              dataKey="spo2"
              color="#00d2ff"
              unit="%"
              yMin={80}
              yMax={100}
              height="280px"
              dateFormat="datetime"
              loading={loadingHistory}
            />

            <SensorGraph
              title={`Body Temperature (${timeframe === '24h' ? '24h' : timeframe === '3d' ? '3-Day' : '7-Day'} Trend)`}
              dataPoints={filteredHistory}
              dataKey="temp"
              color="#20c997"
              unit="°F"
              yMin={95}
              yMax={105}
              height="280px"
              dateFormat="datetime"
              loading={loadingHistory}
            />

            <SensorGraph
              title={`Blood Pressure (${timeframe === '24h' ? '24h' : timeframe === '3d' ? '3-Day' : '7-Day'} Trend)`}
              dataPoints={filteredHistory}
              datasets={[
                { label: 'Systolic BP', dataKey: 'bp_sys', fallbackKey: 'bpSys', color: '#ffc107' },
                { label: 'Diastolic BP', dataKey: 'bp_dia', fallbackKey: 'bpDia', color: '#3a7bd5' }
              ]}
              unit="mmHg"
              yMin={40}
              yMax={200}
              height="280px"
              dateFormat="datetime"
              loading={loadingHistory}
            />
          </div>

          {/* 3.4 Automated Clinical Insights & Recommendations */}
          <div className="glass-panel" style={{ padding: '1.5rem' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '1rem', paddingBottom: '0.5rem', borderBottom: '1px solid var(--glass-border)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <ShieldAlert size={18} style={{ color: 'var(--accent-primary)' }} /> Clinical Findings & Rule-Based Observations
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {clinicalObservations.map((obs, idx) => (
                <div
                  key={idx}
                  style={{
                    padding: '0.85rem 1.15rem',
                    borderRadius: '8px',
                    background: obs.type === 'danger' ? 'rgba(255,77,79,0.1)' : obs.type === 'warning' ? 'rgba(255,193,7,0.1)' : 'rgba(32,201,151,0.1)',
                    border: `1px solid ${obs.type === 'danger' ? 'rgba(255,77,79,0.25)' : obs.type === 'warning' ? 'rgba(255,193,7,0.25)' : 'rgba(32,201,151,0.25)'}`,
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '0.75rem'
                  }}
                >
                  {obs.type === 'danger' ? <AlertTriangle size={18} color="var(--danger)" style={{ flexShrink: 0, marginTop: '2px' }} /> :
                   obs.type === 'warning' ? <ShieldAlert size={18} color="var(--warning)" style={{ flexShrink: 0, marginTop: '2px' }} /> :
                   <CheckCircle2 size={18} color="var(--success)" style={{ flexShrink: 0, marginTop: '2px' }} />}
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-primary)' }}>{obs.title}</div>
                    <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '0.15rem' }}>{obs.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 3.5 7-DAY PATIENT CLINICAL DATA TABLE */}
          <div className="glass-panel" style={{ padding: '1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 600, margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-primary)' }}>
                <Clock size={16} style={{ color: 'var(--accent-primary)' }} /> 7-Day Patient Telemetry Data Table ({filteredHistory.length} logs)
              </h3>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                Real-time Clinical Readings • {timeframe === '24h' ? 'Last 24 Hours' : timeframe === '3d' ? 'Last 3 Days' : 'Last 7 Days'}
              </span>
            </div>

            <div className="table-responsive" style={{ maxHeight: '420px', overflowY: 'auto' }}>
              <table className="glass-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Time</th>
                    <th>Heart Rate (BPM)</th>
                    <th>SpO2 (%)</th>
                    <th>Blood Pressure (mmHg)</th>
                    <th>Temperature (°F)</th>
                    <th>Patient Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredHistory.length === 0 ? (
                    <tr>
                      <td colSpan={7} style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--text-secondary)' }}>
                        <Database size={28} style={{ opacity: 0.3, marginBottom: '0.5rem' }} />
                        <div>No telemetry readings available for this patient in the selected timeframe.</div>
                      </td>
                    </tr>
                  ) : (
                    filteredHistory.slice(-50).reverse().map((d, i) => {
                      const dt = new Date(d.timestamp || Date.now());
                      const dateStr = dt.toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' });
                      const timeStr = dt.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                      const hr = d.hr ?? d.heart_rate ?? d.pulse;
                      const spo2 = d.spo2;
                      const temp = d.temp ?? d.temperature;
                      const sys = d.bp_sys ?? d.bpSys;
                      const dia = d.bp_dia ?? d.bpDia;
                      const bpDisplay = (sys != null && dia != null) ? `${sys}/${dia} mmHg` : (d.bp ? `${d.bp} mmHg` : '--');
                      const isAlert = (hr > 100 || hr < 50 || spo2 < 95 || temp > 100.4);
                      const isCritical = (hr > 120 || hr < 40 || spo2 < 90 || temp > 103);

                      return (
                        <tr key={i}>
                          <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{dateStr}</td>
                          <td><code>{timeStr}</code></td>
                          <td style={{ fontWeight: 600, color: hr > 100 ? 'var(--danger)' : 'var(--text-primary)' }}>
                            {hr != null ? `${hr} bpm` : '--'}
                          </td>
                          <td style={{ fontWeight: 600, color: spo2 < 95 ? 'var(--warning)' : 'var(--text-primary)' }}>
                            {spo2 != null ? `${spo2}%` : '--'}
                          </td>
                          <td>{bpDisplay}</td>
                          <td>{temp != null ? `${temp} °F` : '--'}</td>
                          <td>
                            <span className={`badge ${isCritical ? 'badge-critical' : isAlert ? 'badge-warning' : 'badge-stable'}`}>
                              {isCritical ? 'Critical' : isAlert ? 'Warning' : 'Stable'}
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
            {filteredHistory.length > 50 && (
              <div style={{ textAlign: 'center', marginTop: '0.75rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                Showing latest 50 of {filteredHistory.length} readings. Use "Export Full Report (CSV)" for complete dataset.
              </div>
            )}
          </div>

        </div>
      ) : (
        <div className="glass-panel" style={{ padding: '4rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
          Select a patient to generate their clinical vitals report.
        </div>
      )}

      {/* ── 4. ALL PATIENTS HOSPITAL SUMMARY TABLE (Screen Only) ── */}
      <div className="glass-panel no-print" style={{ padding: '1.5rem', marginTop: '2rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', paddingBottom: '0.75rem', borderBottom: '1px solid var(--glass-border)' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Database size={18} style={{ color: 'var(--accent-primary)' }} /> Hospital Patient Directory Roster ({filteredPatients.length})
          </h3>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
            Select any patient to load detailed report above
          </span>
        </div>

        <div className="table-responsive">
          <table className="glass-table">
            <thead>
              <tr>
                <th>Patient ID</th>
                <th>Full Name</th>
                <th>Room</th>
                <th>Blood Group</th>
                <th>Guardian Contact</th>
                <th>Assigned Doctor</th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {loadingPatients ? (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--text-secondary)' }}>
                    Loading patient directory...
                  </td>
                </tr>
              ) : filteredPatients.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--text-secondary)' }}>
                    No patient records found matching criteria.
                  </td>
                </tr>
              ) : (
                filteredPatients.map(p => (
                  <tr key={p.id} style={{ background: selectedPatient?.id === p.id ? 'rgba(0,210,255,0.06)' : 'transparent' }}>
                    <td><code>PT-00{p.id}</code></td>
                    <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{p.name}</td>
                    <td>Room {p.room_number || 'N/A'}</td>
                    <td><strong style={{ color: '#ff4d4f' }}>{p.blood_group || 'N/A'}</strong></td>
                    <td>{p.guardian_contact || 'N/A'}</td>
                    <td>{p.doctor_name || 'Dr. Assigned'}</td>
                    <td>
                      <span className="badge badge-stable">● Verified</span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <button
                        className="btn-secondary btn-sm"
                        onClick={() => {
                          setSelectedPatientId(p.id.toString());
                          window.scrollTo({ top: 0, behavior: 'smooth' });
                        }}
                        style={{ padding: '0.35rem 0.75rem' }}
                      >
                        Select & View Report <ChevronRight size={14} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
};

export default Reports;

