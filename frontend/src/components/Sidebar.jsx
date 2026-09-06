import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { Activity, Stethoscope, Users, LogOut, ShieldCheck, FileText, HeartPulse, X } from 'lucide-react';

const Sidebar = ({ user, onLogout, isOpen, onClose }) => {
  const location = useLocation(); // Subscribe to location updates
  if (!user) return null;

  const handleNavClick = () => {
    if (isOpen) {
      onClose();
    }
  };

  return (
    <>
      {/* Dark overlay backdrop on mobile/tablet when drawer is open */}
      {isOpen && (
        <div
          className="sidebar-overlay"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      <aside className={`sidebar ${isOpen ? 'open' : ''}`}>
        <div className="sidebar-header">
          <div className="sidebar-logo">
            <HeartPulse size={24} color="var(--accent-primary)" />
            <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.15 }}>
              <span style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>VoltVertex</span>
              <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--accent-primary)' }}>VitalsSync</span>
            </div>
          </div>
          <button className="sidebar-close-btn" onClick={onClose} aria-label="Close Sidebar">
            <X size={20} />
          </button>
        </div>

        <nav className="nav-links">
          {user.role === 'doctor' && (
            <>
              <NavLink
                to="/doctor"
                end
                className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
                onClick={handleNavClick}
              >
                <Stethoscope size={18} />
                <span>Doctor Dashboard</span>
              </NavLink>

              <NavLink
                to="/caretaker"
                className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
                onClick={handleNavClick}
              >
                <Activity size={18} />
                <span>Caretaker Station</span>
              </NavLink>

              <NavLink
                to="/patient-dashboard"
                className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
                onClick={handleNavClick}
              >
                <Users size={18} />
                <span>Patients</span>
              </NavLink>

              <NavLink
                to="/staff-management"
                className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
                onClick={handleNavClick}
              >
                <ShieldCheck size={18} />
                <span>Staff Management</span>
              </NavLink>

              <NavLink
                to="/reports"
                className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
                onClick={handleNavClick}
              >
                <FileText size={18} />
                <span>Reports</span>
              </NavLink>
            </>
          )}

          {user.role === 'caretaker' && (
            <>
              <NavLink
                to="/caretaker"
                className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
                onClick={handleNavClick}
              >
                <Activity size={18} />
                <span>Caretaker Dashboard</span>
              </NavLink>

              <NavLink
                to="/patient-dashboard"
                className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
                onClick={handleNavClick}
              >
                <Users size={18} />
                <span>Patients</span>
              </NavLink>

              <NavLink
                to="/reports"
                className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
                onClick={handleNavClick}
              >
                <FileText size={18} />
                <span>Reports</span>
              </NavLink>
            </>
          )}

          {user.role === 'staff' && (
            <>
              <NavLink
                to="/staff"
                className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
                onClick={handleNavClick}
              >
                <ShieldCheck size={18} />
                <span>Staff Management</span>
              </NavLink>

              <NavLink
                to="/patient-dashboard"
                className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
                onClick={handleNavClick}
              >
                <Users size={18} />
                <span>Patients</span>
              </NavLink>

              <NavLink
                to="/reports"
                className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
                onClick={handleNavClick}
              >
                <FileText size={18} />
                <span>Reports</span>
              </NavLink>
            </>
          )}

          {user.role !== 'doctor' && user.role !== 'caretaker' && user.role !== 'staff' && (
            <>
              <NavLink
                to="/patient-dashboard"
                className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
                onClick={handleNavClick}
              >
                <Users size={18} />
                <span>Patients</span>
              </NavLink>

              <NavLink
                to={`/patient/${user.patient_id || user.id || '1'}`}
                className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
                onClick={handleNavClick}
              >
                <Activity size={18} />
                <span>Patient Vitals</span>
              </NavLink>

              <NavLink
                to="/reports"
                className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
                onClick={handleNavClick}
              >
                <FileText size={18} />
                <span>Reports</span>
              </NavLink>
            </>
          )}

          <div className="sidebar-footer">
            <button
              onClick={() => {
                onClose();
                onLogout();
              }}
              className="nav-link logout-nav-link"
            >
              <LogOut size={18} />
              <span>Logout</span>
            </button>
          </div>
        </nav>
      </aside>
    </>
  );
};

export default Sidebar;
