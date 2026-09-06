import React from 'react';
import { NavLink } from 'react-router-dom';
import { Activity, Stethoscope, Users, LogOut, ShieldCheck, FileText, X } from 'lucide-react';

const Sidebar = ({ user, onLogout, isOpen, onClose }) => {
  if (!user) return null;

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
            <Stethoscope size={26} color="var(--accent-primary)" />
            <span>VitalsSync Navigation</span>
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
                className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
                onClick={onClose}
              >
                <Stethoscope size={18} />
                <span>Doctor Dashboard</span>
              </NavLink>

              <NavLink
                to="/patient-dashboard"
                className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
                onClick={onClose}
              >
                <Users size={18} />
                <span>Patients</span>
              </NavLink>

              <NavLink
                to="/staff-management"
                className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
                onClick={onClose}
              >
                <ShieldCheck size={18} />
                <span>Staff Management</span>
              </NavLink>

              <NavLink
                to="/reports"
                className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
                onClick={onClose}
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
                onClick={onClose}
              >
                <Activity size={18} />
                <span>Caretaker Dashboard</span>
              </NavLink>

              <NavLink
                to="/patient-dashboard"
                className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
                onClick={onClose}
              >
                <Users size={18} />
                <span>Patients</span>
              </NavLink>

              <NavLink
                to="/reports"
                className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
                onClick={onClose}
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
