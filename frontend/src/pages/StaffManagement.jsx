import { useState, useEffect, useMemo } from 'react';
import { Users, UserPlus, Trash2, Stethoscope, Activity, Phone, Mail, ShieldCheck, Search, Filter } from 'lucide-react';

const ROLES = [
  { value: 'doctor', label: 'Doctor', icon: Stethoscope, color: 'var(--accent-primary)', bg: 'rgba(0,210,255,0.1)' },
  { value: 'caretaker', label: 'Caretaker', icon: Activity, color: 'var(--success)', bg: 'rgba(32,201,151,0.1)' },
];

const defaultForm = { staff_id: '', role: 'doctor', name: '', mobile: '', email: '' };

const StaffManagement = () => {
  const [staff, setStaff] = useState([]);
  const [form, setForm] = useState(defaultForm);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);

  // Search & Filter State
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState('All');

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    fetch('http://localhost:5001/api/staff')
      .then(res => res.json())
      .then(data => {
        if (mounted) {
          setStaff(Array.isArray(data) ? data : []);
          setLoading(false);
        }
      })
      .catch(() => {
        if (mounted) setLoading(false);
      });

    return () => { mounted = false; };
  }, []);

  const validate = () => {
    const e = {};
    if (!form.staff_id.trim()) e.staff_id = 'Staff ID is required';
    if (!form.name.trim()) e.name = 'Name is required';
    if (!form.mobile.trim() || !/^\d{10}$/.test(form.mobile.trim())) e.mobile = 'Valid 10-digit mobile required';
    if (!form.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = 'Valid email required';
    return e;
  };

  const handleAdd = async () => {
    const e = validate();
    if (Object.keys(e).length) { setErrors(e); return; }
    setErrors({});
    setServerError('');
    setSaving(true);
    try {
      const res = await fetch('http://localhost:5001/api/staff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form)
      });
      const data = await res.json();
      if (!res.ok) {
        setServerError(data.error || 'Failed to add staff.');
      } else {
        setSuccessMsg(`✅ ${form.name} registered successfully!`);
        if (data.staff) {
          setStaff(prev => [...prev, data.staff]);
        }
        setForm(defaultForm);
        setShowForm(false);
        setTimeout(() => setSuccessMsg(''), 3000);
      }
    } catch {
      setServerError('Cannot connect to server.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id, name) => {
    if (!window.confirm(`Remove "${name}" from hospital staff directory?`)) return;
    await fetch(`http://localhost:5001/api/staff/${id}`, { method: 'DELETE' });
    setStaff((prev) => prev.filter((s) => s.id !== id));
  };

  const roleInfo = (role) => ROLES.find(r => r.value === role) || ROLES[0];

  // Filtered staff records
  const filteredStaff = useMemo(() => {
    return staff.filter(s => {
      const matchesSearch =
        s.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        s.staff_id?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        s.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        s.mobile?.includes(searchTerm);
      const matchesRole = roleFilter === 'All' || s.role === roleFilter;
      return matchesSearch && matchesRole;
    });
  }, [staff, searchTerm, roleFilter]);

  return (
    <div className="fade-in">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ width: '42px', height: '42px', borderRadius: '12px', background: 'rgba(0,210,255,0.1)', border: '1px solid rgba(0,210,255,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <ShieldCheck size={24} style={{ color: 'var(--accent-primary)' }} />
          </div>
          <div>
            <h1 className="glass-header" style={{ marginBottom: '0.2rem', fontSize: '1.6rem' }}>Staff Management & RBAC Directory</h1>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', margin: 0 }}>
              Register and manage verified doctors & caretakers with system access
            </p>
          </div>
        </div>
        <button
          className="btn-primary"
          onClick={() => { setShowForm(f => !f); setErrors({}); setServerError(''); }}
          style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
        >
          <UserPlus size={18} /> {showForm ? 'Close Form' : 'Add Staff Member'}
        </button>
      </div>

      {successMsg && (
        <div style={{ padding: '0.875rem 1.25rem', background: 'rgba(32,201,151,0.1)', border: '1px solid rgba(32,201,151,0.3)', borderRadius: '10px', color: 'var(--success)', marginBottom: '1.5rem', fontWeight: 500 }}>
          {successMsg}
        </div>
      )}

      {/* Add Staff Form */}
      {showForm && (
        <div className="glass-panel fade-in" style={{ padding: '2rem', marginBottom: '2rem', border: '1px solid rgba(0,210,255,0.25)' }}>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--accent-primary)' }}>
            <UserPlus size={20} /> Register New Staff Account
          </h2>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1.25rem' }}>
            {/* Role Toggle */}
            <div>
              <label style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '0.4rem' }}>Role *</label>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                {ROLES.map(r => (
                  <button key={r.value} onClick={() => setForm(f => ({ ...f, role: r.value, staff_id: '' }))}
                    style={{ flex: 1, padding: '0.6rem', borderRadius: '8px', border: '1px solid', borderColor: form.role === r.value ? r.color : 'var(--glass-border)', background: form.role === r.value ? r.bg : 'transparent', color: form.role === r.value ? r.color : 'var(--text-secondary)', cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.35rem' }}>
                    <r.icon size={14} /> {r.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Staff ID */}
            <div>
              <label style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '0.4rem' }}>
                {form.role === 'doctor' ? 'Doctor ID *' : 'Caretaker ID *'}
              </label>
              <input className="glass-input" placeholder={form.role === 'doctor' ? 'DR-00124' : 'CR-00457'} value={form.staff_id}
                onChange={e => setForm(f => ({ ...f, staff_id: e.target.value }))} />
              {errors.staff_id && <p style={{ color: 'var(--danger)', fontSize: '0.78rem', marginTop: '0.25rem' }}>{errors.staff_id}</p>}
            </div>

            {/* Full Name */}
            <div>
              <label style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '0.4rem' }}>Full Name *</label>
              <input className="glass-input" placeholder="Dr. Jane Smith" value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
              {errors.name && <p style={{ color: 'var(--danger)', fontSize: '0.78rem', marginTop: '0.25rem' }}>{errors.name}</p>}
            </div>

            {/* Mobile */}
            <div>
              <label style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '0.4rem' }}>Mobile (10 digits) *</label>
              <div style={{ position: 'relative' }}>
                <Phone size={14} style={{ position: 'absolute', left: '0.85rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
                <input className="glass-input" style={{ paddingLeft: '2.4rem' }} placeholder="9XXXXXXXXX" maxLength={10} value={form.mobile}
                  onChange={e => setForm(f => ({ ...f, mobile: e.target.value.replace(/\D/g, '') }))} />
              </div>
              {errors.mobile && <p style={{ color: 'var(--danger)', fontSize: '0.78rem', marginTop: '0.25rem' }}>{errors.mobile}</p>}
            </div>

            {/* Email */}
            <div style={{ gridColumn: 'span 2' }}>
              <label style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '0.4rem' }}>Email Address *</label>
              <div style={{ position: 'relative' }}>
                <Mail size={14} style={{ position: 'absolute', left: '0.85rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
                <input type="email" className="glass-input" style={{ paddingLeft: '2.4rem' }} placeholder="doctor@hospital.com" value={form.email}
                  onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
              </div>
              {errors.email && <p style={{ color: 'var(--danger)', fontSize: '0.78rem', marginTop: '0.25rem' }}>{errors.email}</p>}
            </div>
          </div>

          {serverError && (
            <div style={{ marginTop: '1rem', padding: '0.75rem 1rem', background: 'rgba(255,77,79,0.1)', border: '1px solid rgba(255,77,79,0.25)', borderRadius: '8px', color: 'var(--danger)', fontSize: '0.875rem' }}>
              {serverError}
            </div>
          )}

          <div style={{ marginTop: '1.5rem', display: 'flex', gap: '1rem' }}>
            <button className="btn-primary" onClick={handleAdd} disabled={saving} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              {saving ? 'Registering...' : <><UserPlus size={16} /> Register Staff Account</>}
            </button>
            <button onClick={() => { setShowForm(false); setErrors({}); }} style={{ background: 'transparent', border: '1px solid var(--glass-border)', color: 'var(--text-secondary)', padding: '0.6rem 1.25rem', borderRadius: '8px', cursor: 'pointer' }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Staff Directory Panel */}
      <div className="glass-panel" style={{ padding: '1.5rem' }}>
        {/* Search & Filter Bar */}
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
          <div style={{ flex: 1, position: 'relative', minWidth: '240px' }}>
            <Search size={18} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
            <input
              type="text"
              placeholder="Search by staff name, ID, email, or mobile..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="glass-input"
              style={{ paddingLeft: '2.75rem' }}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Filter size={18} color="var(--text-secondary)" />
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="glass-select"
              style={{ width: 'auto' }}
            >
              <option value="All">All Roles ({staff.length})</option>
              <option value="doctor">Doctors ({staff.filter(s => s.role === 'doctor').length})</option>
              <option value="caretaker">Caretakers ({staff.filter(s => s.role === 'caretaker').length})</option>
            </select>
          </div>
        </div>

        {/* Directory Table */}
        <div className="table-responsive">
          <table className="glass-table">
            <thead>
              <tr>
                <th style={{ minWidth: '180px' }}>Staff Member</th>
                <th style={{ minWidth: '120px' }}>Staff ID</th>
                <th style={{ minWidth: '130px' }}>Role</th>
                <th style={{ minWidth: '140px' }}>Mobile Number</th>
                <th style={{ minWidth: '200px' }}>Email Address</th>
                <th style={{ minWidth: '130px' }}>Status</th>
                <th style={{ minWidth: '100px', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>
                    Loading staff directory...
                  </td>
                </tr>
              ) : filteredStaff.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>
                    {searchTerm || roleFilter !== 'All' ? 'No staff records matching your search query.' : 'No staff members registered yet. Click "Add Staff Member" above to create an account.'}
                  </td>
                </tr>
              ) : (
                filteredStaff.map(s => {
                  const ri = roleInfo(s.role);
                  return (
                    <tr key={s.id}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                          <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: ri.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', border: `1px solid ${ri.color}40`, flexShrink: 0 }}>
                            <ri.icon size={18} style={{ color: ri.color }} />
                          </div>
                          <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{s.name}</span>
                        </div>
                      </td>
                      <td>
                        <code>{s.staff_id}</code>
                      </td>
                      <td>
                        <span className={`badge ${s.role === 'doctor' ? 'badge-info' : 'badge-stable'}`} style={{ textTransform: 'capitalize' }}>
                          <ri.icon size={13} /> {s.role}
                        </span>
                      </td>
                      <td>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', color: 'var(--text-secondary)' }}>
                          <Phone size={13} /> {s.mobile}
                        </span>
                      </td>
                      <td>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', color: 'var(--text-secondary)' }}>
                          <Mail size={13} /> {s.email}
                        </span>
                      </td>
                      <td>
                        <span className="badge badge-stable">● Verified</span>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <button
                          className="btn-danger btn-sm"
                          onClick={() => handleDelete(s.id, s.name)}
                          title="Remove staff account"
                          style={{ padding: '0.35rem 0.65rem' }}
                        >
                          <Trash2 size={14} /> Remove
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default StaffManagement;
