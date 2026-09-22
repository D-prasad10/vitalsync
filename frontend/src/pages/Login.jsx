import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  HeartPulse, Stethoscope, Activity, ArrowRight,
  Phone, Mail, CheckCircle2, Loader, ArrowLeft,
  User, ShieldCheck, AlertCircle
} from 'lucide-react';
import { roleHome } from '../utils/auth';

const API = 'http://localhost:5001';

const Login = ({ onLogin }) => {
  const navigate = useNavigate();
  // Step 1: credentials + role, Step 2: otp
  const [step, setStep] = useState(1);
  const [role, setRole] = useState('caretaker');
  const [form, setForm] = useState({ phone: '', email: '' });
  const [otp, setOtp] = useState('');
  const [errors, setErrors] = useState({});
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [otpError, setOtpError] = useState('');
  const [serverError, setServerError] = useState('');

  const validateCredentials = () => {
    const e = {};
    if (!form.phone.trim()) {
      e.phone = 'Mobile number is required';
    } else if (!/^\d{10}$/.test(form.phone.replace(/\s/g, ''))) {
      e.phone = 'Enter a valid 10-digit mobile number';
    }
    if (!form.email.trim()) {
      e.email = 'Email address is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      e.email = 'Enter a valid email address';
    }
    return e;
  };

  const handleSendOtp = async (e) => {
    if (e) e.preventDefault();
    const eMap = validateCredentials();
    if (Object.keys(eMap).length) {
      setErrors(eMap);
      return;
    }
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
        setServerError(data.error || 'Failed to send verification code.');
      } else {
        setStep(2);
        // Development mode: auto-fill OTP when email delivery is not configured
        if (data.devOtp) {
          setOtp(data.devOtp);
          setServerError('Notice: Development mode active — OTP code auto-filled.');
        }
      }
    } catch {
      setServerError('Unable to reach authentication service. Please ensure the backend is active.');
    } finally {
      setSending(false);
    }
  };

  const handleVerifyOtp = async (e) => {
    if (e) e.preventDefault();
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
        setOtpError(data.error || 'Invalid verification code.');
        setVerifying(false);
      } else {
        const rawRole = (data.user && data.user.role) || role || 'staff';
        const userRole = String(rawRole).toLowerCase().trim();
        const userData = {
          role: userRole,
          name: (data.user && data.user.name) || form.email.split('@')[0],
          staffId: (data.user && data.user.staffId) || (data.user && data.user.id) || '',
          id: (data.user && data.user.id) || '',
          token: data.token || ''
        };

        const targetRoute = roleHome(userData);

        // Commit to localStorage
        localStorage.setItem('vitals_user', JSON.stringify(userData));

        // Update App state
        onLogin(userData);

        // Immediate redirection
        navigate(targetRoute, { replace: true });
      }
    } catch {
      setOtpError('Unable to connect to verification service.');
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
        body: JSON.stringify({
          mobile: form.phone.trim(),
          email: form.email.trim().toLowerCase(),
          role
        })
      });
      const data = await res.json();
      if (!res.ok) {
        setServerError(data.error || 'Failed to resend verification code.');
      } else if (data.devOtp) {
        setOtp(data.devOtp);
        setServerError('Notice: Development mode active — OTP code auto-filled.');
      }
    } catch {
      setServerError('Unable to reconnect to authentication service.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#f8fafc',
        backgroundImage: 'radial-gradient(at 10% 20%, #eff6ff 0px, transparent 50%), radial-gradient(at 90% 80%, #f0fdfa 0px, transparent 50%)',
        padding: '1.5rem'
      }}
    >
      <div style={{ width: '100%', maxWidth: '460px', zIndex: 1 }}>
        {/* Brand Header */}
        <div style={{ textAlign: 'center', marginBottom: '1.75rem' }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '54px',
              height: '54px',
              borderRadius: '14px',
              background: 'linear-gradient(135deg, #2563eb, #0d9488)',
              color: '#ffffff',
              boxShadow: '0 4px 12px rgba(37, 99, 235, 0.25)',
              marginBottom: '0.75rem'
            }}
          >
            <HeartPulse size={30} />
          </div>
          <h1
            style={{
              fontSize: '1.75rem',
              fontWeight: 800,
              color: '#0f172a',
              letterSpacing: '-0.025em',
              margin: '0 0 0.25rem 0'
            }}
          >
            MediResQ
          </h1>
          <p
            style={{
              fontSize: '0.85rem',
              fontWeight: 500,
              color: '#0d9488',
              letterSpacing: '0.02em',
              margin: 0
            }}
          >
            Healthcare Monitoring & Clinical Management
          </p>
        </div>

        {/* STEP 1: Role & Credentials Form */}
        {step === 1 && (
          <div
            className="fade-in"
            style={{
              background: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: '16px',
              padding: '2rem 2.25rem',
              boxShadow: '0 4px 20px -2px rgba(15, 23, 42, 0.08)'
            }}
          >
            <div style={{ marginBottom: '1.5rem' }}>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#0f172a', margin: '0 0 0.35rem 0' }}>
                Clinical Portal Sign In
              </h2>
              <p style={{ color: '#64748b', fontSize: '0.875rem', margin: 0 }}>
                Select your role and provide your authorized credentials.
              </p>
            </div>

            {serverError && (
              <div
                role="alert"
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '0.6rem',
                  padding: '0.75rem 0.95rem',
                  borderRadius: '8px',
                  background: '#fef2f2',
                  border: '1px solid #fecaca',
                  color: '#991b1b',
                  fontSize: '0.82rem',
                  marginBottom: '1.25rem',
                  lineHeight: 1.4
                }}
              >
                <AlertCircle size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
                <span>{serverError}</span>
              </div>
            )}

            <form onSubmit={handleSendOtp} noValidate>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.15rem' }}>
                {/* Role Selector */}
                <div>
                  <label
                    htmlFor="role-select"
                    style={{
                      display: 'block',
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      color: '#475569',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      marginBottom: '0.4rem'
                    }}
                  >
                    Clinical Role
                  </label>
                  <div style={{ position: 'relative' }}>
                    <div style={{ position: 'absolute', left: '0.9rem', top: '50%', transform: 'translateY(-50%)', color: '#64748b', display: 'flex', alignItems: 'center', pointerEvents: 'none' }}>
                      {role === 'doctor' ? <Stethoscope size={16} /> : role === 'caretaker' ? <Activity size={16} /> : role === 'staff' ? <ShieldCheck size={16} /> : <User size={16} />}
                    </div>
                    <select
                      id="role-select"
                      className="glass-select"
                      style={{ paddingLeft: '2.5rem', cursor: 'pointer' }}
                      value={role}
                      onChange={(e) => setRole(e.target.value)}
                    >
                      <option value="doctor">Doctor — Clinical Lead</option>
                      <option value="caretaker">Caretaker — Patient Care</option>
                      <option value="staff">Staff — Hospital Administration</option>
                    </select>
                  </div>
                </div>

                {/* Mobile Number */}
                <div>
                  <label
                    htmlFor="mobile-input"
                    style={{
                      display: 'block',
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      color: '#475569',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      marginBottom: '0.4rem'
                    }}
                  >
                    Registered Mobile Number
                  </label>
                  <div style={{ position: 'relative' }}>
                    <div style={{ position: 'absolute', left: '0.9rem', top: '50%', transform: 'translateY(-50%)', color: '#64748b', display: 'flex', alignItems: 'center', pointerEvents: 'none' }}>
                      <Phone size={16} />
                    </div>
                    <input
                      id="mobile-input"
                      type="tel"
                      className="glass-input"
                      style={{
                        paddingLeft: '2.5rem',
                        borderColor: errors.phone ? '#dc2626' : undefined
                      }}
                      placeholder="10-digit mobile number"
                      value={form.phone}
                      maxLength={10}
                      onChange={(e) => setForm(f => ({ ...f, phone: e.target.value.replace(/\D/g, '') }))}
                      autoComplete="tel"
                    />
                  </div>
                  {errors.phone && (
                    <p style={{ color: '#dc2626', fontSize: '0.78rem', marginTop: '0.35rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                      <AlertCircle size={13} />
                      {errors.phone}
                    </p>
                  )}
                </div>

                {/* Email Address */}
                <div>
                  <label
                    htmlFor="email-input"
                    style={{
                      display: 'block',
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      color: '#475569',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      marginBottom: '0.4rem'
                    }}
                  >
                    Hospital / Official Email
                  </label>
                  <div style={{ position: 'relative' }}>
                    <div style={{ position: 'absolute', left: '0.9rem', top: '50%', transform: 'translateY(-50%)', color: '#64748b', display: 'flex', alignItems: 'center', pointerEvents: 'none' }}>
                      <Mail size={16} />
                    </div>
                    <input
                      id="email-input"
                      type="email"
                      className="glass-input"
                      style={{
                        paddingLeft: '2.5rem',
                        borderColor: errors.email ? '#dc2626' : undefined
                      }}
                      placeholder="name@hospital.org"
                      value={form.email}
                      onChange={(e) => setForm(f => ({ ...f, email: e.target.value }))}
                      autoComplete="email"
                    />
                  </div>
                  {errors.email && (
                    <p style={{ color: '#dc2626', fontSize: '0.78rem', marginTop: '0.35rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                      <AlertCircle size={13} />
                      {errors.email}
                    </p>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={sending}
                  className="btn-primary"
                  style={{ width: '100%', marginTop: '0.5rem' }}
                >
                  {sending ? (
                    <>
                      <Loader size={18} style={{ animation: 'spin 0.8s linear infinite' }} />
                      <span>Sending Security Code...</span>
                    </>
                  ) : (
                    <>
                      <span>Send Authentication Code</span>
                      <ArrowRight size={18} />
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* STEP 2: OTP Verification Form */}
        {step === 2 && (
          <div
            className="fade-in"
            style={{
              background: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: '16px',
              padding: '2rem 2.25rem',
              boxShadow: '0 4px 20px -2px rgba(15, 23, 42, 0.08)'
            }}
          >
            <div style={{ marginBottom: '1.5rem' }}>
              <button
                type="button"
                onClick={() => { setStep(1); setOtp(''); setOtpError(''); setServerError(''); }}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#64748b',
                  fontSize: '0.8rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                  cursor: 'pointer',
                  padding: 0,
                  marginBottom: '1rem'
                }}
              >
                <ArrowLeft size={15} />
                <span>Change Mobile or Email</span>
              </button>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#0f172a', margin: '0 0 0.35rem 0' }}>
                Verify Security Code
              </h2>
              <p style={{ color: '#64748b', fontSize: '0.875rem', margin: 0 }}>
                A 6-digit code has been dispatched to your registered credentials.
              </p>
            </div>

            {serverError && (
              <div
                role="alert"
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '0.6rem',
                  padding: '0.75rem 0.95rem',
                  borderRadius: '8px',
                  background: '#fef3c7',
                  border: '1px solid #fde68a',
                  color: '#92400e',
                  fontSize: '0.82rem',
                  marginBottom: '1.25rem',
                  lineHeight: 1.4
                }}
              >
                <AlertCircle size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
                <span>{serverError}</span>
              </div>
            )}

            <form onSubmit={handleVerifyOtp} noValidate>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                <div>
                  <label
                    htmlFor="otp-input"
                    style={{
                      display: 'block',
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      color: '#475569',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      marginBottom: '0.4rem'
                    }}
                  >
                    Enter 6-Digit Code
                  </label>
                  <input
                    id="otp-input"
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    className="glass-input"
                    style={{
                      textAlign: 'center',
                      fontSize: '1.5rem',
                      fontWeight: 700,
                      letterSpacing: '0.35em',
                      borderColor: otpError ? '#dc2626' : undefined
                    }}
                    placeholder="••••••"
                    maxLength={6}
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                    autoFocus
                  />
                  {otpError && (
                    <p style={{ color: '#dc2626', fontSize: '0.78rem', marginTop: '0.35rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                      <AlertCircle size={13} />
                      {otpError}
                    </p>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={verifying || otp.trim().length !== 6}
                  className="btn-primary"
                  style={{ width: '100%' }}
                >
                  {verifying ? (
                    <>
                      <Loader size={18} style={{ animation: 'spin 0.8s linear infinite' }} />
                      <span>Verifying Session...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 size={18} />
                      <span>Verify & Open Dashboard</span>
                    </>
                  )}
                </button>

                <div style={{ textAlign: 'center', marginTop: '0.5rem' }}>
                  <button
                    type="button"
                    onClick={handleResend}
                    disabled={sending}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#2563eb',
                      fontSize: '0.85rem',
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    {sending ? 'Resending Code...' : 'Did not receive code? Resend OTP'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        )}

        {/* Security / Compliance Footnote */}
        <p
          style={{
            textAlign: 'center',
            fontSize: '0.75rem',
            color: '#94a3b8',
            marginTop: '1.5rem'
          }}
        >
          MediResQ Clinical Telemetry System • Secure TLS Encrypted Session
        </p>
      </div>
    </div>
  );
};

export default Login;
