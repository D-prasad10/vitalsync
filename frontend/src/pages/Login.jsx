import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  HeartPulse, Stethoscope, Activity, ArrowRight,
  Phone, Mail, Shield, CheckCircle, Loader, ArrowLeft,
  User
} from 'lucide-react';

const API = 'http://localhost:5001';

const inputStyle = {
  width: '100%',
  padding: '0.85rem 1rem',
  background: 'rgba(0,0,0,0.3)',
  border: '1px solid var(--glass-border)',
  borderRadius: '10px',
  color: 'var(--text-primary)',
  outline: 'none',
  fontSize: '1rem',
  transition: 'border-color 0.2s',
  boxSizing: 'border-box'
};

const errorStyle = { color: 'var(--danger)', fontSize: '0.8rem', marginTop: '0.3rem' };

const Login = ({ onLogin }) => {
  const navigate = useNavigate();
  // Step 1: unified credentials + role, Step 2: otp
  const [step, setStep] = useState(1); 
  const [role, setRole] = useState('caretaker');
  const [form, setForm] = useState({ phone: '', email: '' });
  const [otp, setOtp] = useState('');
  const [errors, setErrors] = useState({});
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [otpError, setOtpError] = useState('');
  const [serverError, setServerError] = useState('');

  const accentColor = role === 'caretaker' ? 'var(--success)' : 'var(--accent-primary)';

  const validateCredentials = () => {
    const e = {};
    if (!form.phone.trim()) {
      e.phone = 'Mobile number is required';
    } else if (!/^\d{10}$/.test(form.phone.replace(/\s/g, ''))) {
      e.phone = 'Enter a valid 10-digit mobile number';
    }
    if (!form.email.trim()) {
      e.email = 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      e.email = 'Enter a valid email address';
    }
    return e;
  };

  const handleSendOtp = async () => {
    const e = validateCredentials();
    if (Object.keys(e).length) { setErrors(e); return; }
    setErrors({});
    setServerError('');
    setSending(true);
    try {
      const res = await fetch(`${API}/api/auth/send-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mobile: form.phone.trim(),
          email: form.email.trim().toLowerCase(),
          role
        })
      });
      const data = await res.json();
      if (!res.ok) {
        setServerError(data.error || 'Failed to send OTP.');
      } else {
        setStep(2);
        // Dev mode: auto-fill OTP when email is not configured
        if (data.devOtp) {
          setOtp(data.devOtp);
          setServerError('⚠️ Dev mode: Email not configured. OTP auto-filled below.');
        }
      }
    } catch {
      setServerError('Cannot connect to server. Make sure the backend is running.');
    } finally {
      setSending(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (otp.trim().length !== 6) return;
    setOtpError('');
    setVerifying(true);
    try {
      const res = await fetch(`${API}/api/auth/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mobile: form.phone.trim(), otp: otp.trim() })
      });
      const data = await res.json();
      if (!res.ok) {
        setOtpError(data.error || 'Verification failed.');
        setVerifying(false);
      } else {
        onLogin({ role: data.user.role, name: data.user.name, staffId: data.user.staffId });
        navigate(data.user.role === 'doctor' ? '/doctor' : '/caretaker');
      }
    } catch {
      setOtpError('Cannot connect to server.');
      setVerifying(false);
    }
  };

  const handleResend = async () => {
    setSending(true);
    setOtp('');
    setOtpError('');
    setServerError('');
    try {
      const res = await fetch(`${API}/api/auth/send-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mobile: form.phone.trim(), email: form.email.trim().toLowerCase(), role })
      });
      const data = await res.json();
      if (!res.ok) setServerError(data.error || 'Failed to resend OTP.');
    } catch {
      setServerError('Cannot connect to server.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh', width: '100%', display: 'flex',
      alignItems: 'center', justifyContent: 'center',
      background: 'radial-gradient(circle at top left, #1a1d29, #0f111a)',
      padding: '2rem'
    }}>

      {/* Decorative blobs */}
      <div style={{ position: 'fixed', top: '-10%', left: '-10%', width: '400px', height: '400px', background: 'var(--accent-secondary)', filter: 'blur(120px)', opacity: 0.08, zIndex: 0 }} />
      <div style={{ position: 'fixed', bottom: '-10%', right: '-10%', width: '400px', height: '400px', background: 'var(--success)', filter: 'blur(120px)', opacity: 0.06, zIndex: 0 }} />

      <div style={{ width: '100%', maxWidth: '480px', zIndex: 1 }}>

        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', color: 'var(--accent-primary)', marginBottom: '2rem', justifyContent: 'center' }}>
          <HeartPulse size={36} />
          <span style={{ fontSize: '1.75rem', fontWeight: 800, letterSpacing: '-0.5px' }}>VitalsSync</span>
        </div>

        {/* STEP 1: Credentials & Role */}
        {step === 1 && (
          <div className="glass-panel fade-in" style={{ padding: '2.5rem' }}>
            <h2 style={{ fontSize: '1.4rem', fontWeight: 700, marginBottom: '0.5rem' }}>Welcome to VitalsSync</h2>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem', fontSize: '0.9rem' }}>
              Enter your details to receive an OTP and access the dashboard.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              {/* Role Selection */}
              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '0.4rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Login As</label>
                <div style={{ position: 'relative' }}>
                  <User size={16} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
                  <select
                    style={{ ...inputStyle, paddingLeft: '2.75rem', appearance: 'none', cursor: 'pointer' }}
                    value={role}
                    onChange={e => setRole(e.target.value)}
                  >
                    <option value="caretaker">Caretaker</option>
                    <option value="doctor">Doctor</option>
                  </select>
                </div>
              </div>

              {/* Mobile */}
              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '0.4rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Mobile Number</label>
                <div style={{ position: 'relative' }}>
                  <Phone size={16} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
                  <input
                    style={{ ...inputStyle, paddingLeft: '2.75rem', borderColor: errors.phone ? 'var(--danger)' : 'var(--glass-border)' }}
                    placeholder="10-digit mobile number"
                    value={form.phone}
                    maxLength={10}
                    onChange={e => setForm(f => ({ ...f, phone: e.target.value.replace(/\D/g, '') }))}
                    onFocus={e => e.target.style.borderColor = accentColor}
                    onBlur={e => e.target.style.borderColor = errors.phone ? 'var(--danger)' : 'var(--glass-border)'}
                  />
                </div>
                {errors.phone && <p style={errorStyle}>{errors.phone}</p>}
              </div>

              {/* Email */}
              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '0.4rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Email Address</label>
                <div style={{ position: 'relative' }}>
                  <Mail size={16} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
                  <input
                    type="email"
                    style={{ ...inputStyle, paddingLeft: '2.75rem', borderColor: errors.email ? 'var(--danger)' : 'var(--glass-border)' }}
                    placeholder="your@email.com"
                    value={form.email}
                    onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                    onFocus={e => e.target.style.borderColor = accentColor}
                    onBlur={e => e.target.style.borderColor = errors.email ? 'var(--danger)' : 'var(--glass-border)'}
                  />
                </div>
                {errors.email && <p style={errorStyle}>{errors.email}</p>}
              </div>

              {serverError && (
                <div style={{ padding: '0.75rem 1rem', background: 'rgba(255,77,79,0.1)', border: '1px solid rgba(255,77,79,0.25)', borderRadius: '8px', fontSize: '0.85rem', color: 'var(--danger)' }}>
                  {serverError}
                </div>
              )}

              <button
                className="btn-primary"
                onClick={handleSendOtp}
                disabled={sending}
                style={{ marginTop: '0.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.75rem', opacity: sending ? 0.7 : 1 }}
              >
                {sending ? <><Loader size={18} style={{ animation: 'spin 1s linear infinite' }} /> Sending OTP...</> : 'Send Verification Code'}
              </button>
            </div>
          </div>
        )}

        {/* STEP 2: OTP */}
        {step === 2 && (
          <div className="glass-panel fade-in" style={{ padding: '2.5rem' }}>
            <button onClick={() => { setStep(1); setOtp(''); setOtpError(''); setServerError(''); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem', fontSize: '0.9rem', padding: 0 }}>
              <ArrowLeft size={16} /> Back
            </button>

            {verifying ? (
              <div style={{ textAlign: 'center', padding: '2rem 0' }}>
                <CheckCircle size={64} style={{ color: 'var(--success)', marginBottom: '1rem' }} />
                <h2 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--success)' }}>Verified!</h2>
                <p style={{ color: 'var(--text-secondary)' }}>Opening your dashboard...</p>
              </div>
            ) : (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
                  <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'rgba(0,210,255,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent-primary)' }}>
                    <Shield size={22} />
                  </div>
                  <h2 style={{ fontSize: '1.3rem', fontWeight: 700 }}>Enter OTP</h2>
                </div>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '0.5rem' }}>
                  A 6-digit code was sent to
                </p>
                <p style={{ color: 'var(--text-primary)', fontWeight: 600, marginBottom: '2rem', fontSize: '0.95rem' }}>
                  {form.phone} & {form.email}
                </p>

                {serverError && (
                  <div style={{ padding: '0.75rem 1rem', background: 'rgba(255,255,0,0.1)', border: '1px solid rgba(255,255,0,0.25)', borderRadius: '8px', fontSize: '0.85rem', color: 'var(--accent-primary)', marginBottom: '1rem' }}>
                    {serverError}
                  </div>
                )}

                <input
                  style={{ ...inputStyle, fontSize: '2rem', fontWeight: 700, letterSpacing: '1rem', textAlign: 'center', borderColor: otpError ? 'var(--danger)' : 'var(--glass-border)', marginBottom: '0.5rem' }}
                  placeholder="------"
                  maxLength={6}
                  value={otp}
                  onChange={e => { setOtp(e.target.value.replace(/\D/g, '')); setOtpError(''); }}
                  onFocus={e => e.target.style.borderColor = accentColor}
                  onBlur={e => e.target.style.borderColor = otpError ? 'var(--danger)' : 'var(--glass-border)'}
                />
                {otpError && <p style={{ ...errorStyle, marginBottom: '1rem' }}>{otpError}</p>}

                <button
                  className="btn-primary"
                  onClick={handleVerifyOtp}
                  disabled={otp.length !== 6 || verifying}
                  style={{ width: '100%', marginTop: '1.25rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.75rem', opacity: otp.length !== 6 || verifying ? 0.5 : 1 }}
                >
                  {verifying ? <><Loader size={18} style={{ animation: 'spin 1s linear infinite' }} /> Verifying...</> : <><Shield size={18} /> Verify & Enter Dashboard</>}
                </button>

                <div style={{ textAlign: 'center', marginTop: '1.5rem', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                  Didn't receive it?{' '}
                  <button onClick={handleResend} disabled={sending} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent-primary)', fontWeight: 600, fontSize: '0.875rem' }}>
                    {sending ? 'Resending...' : 'Resend OTP'}
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {/* Step indicators */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem', marginTop: '1.5rem' }}>
          {[1, 2].map(s => (
            <div key={s} style={{ width: s === step ? '24px' : '8px', height: '8px', borderRadius: '99px', background: s === step ? 'var(--accent-primary)' : 'rgba(255,255,255,0.2)', transition: 'all 0.3s ease' }} />
          ))}
        </div>
      </div>

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
};

export default Login;
