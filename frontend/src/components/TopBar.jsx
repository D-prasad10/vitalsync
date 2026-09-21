import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  HeartPulse, Menu, Bell, LogOut, User,
  Stethoscope, Activity, FileText, ShieldCheck
} from 'lucide-react';
import { useEmergencyAlerts } from '../utils/telemetryStore';

const TopBarAlertBadge = () => {
  const { alerts } = useEmergencyAlerts();
  if (!alerts.length) return null;
  return (
    <div
      className="alert-indicator"
      title={`${alerts.length} Active Emergency Alert(s)`}
      role="status"
      aria-label={`${alerts.length} Active Emergency Alerts`}
    >
      <Bell size={18} className="bell-icon-pulsing" />
      <span className="alert-count-badge">{alerts.length}</span>
    </div>
  );
};

const TopBar = ({ user, onLogout, onToggleSidebar }) => {
  if (!user) return null;

  const role = (user.role || '').toLowerCase().trim();
  const roleLabel = role === 'doctor' ? 'Doctor' : role === 'caretaker' ? 'Caretaker' : role === 'staff' ? 'Staff' : role || 'User';
  const roleBadgeClass = role === 'doctor' ? 'badge-info' : role === 'caretaker' ? 'badge-stable' : 'badge-info';

  return (
    <header className="top-bar">
      <div className="topbar-left">
        <button
          className="mobile-nav-toggle"
          onClick={onToggleSidebar}
          aria-label="Toggle Navigation Menu"
        >
          <Menu size={22} />
        </button>

        <NavLink to="/" className="topbar-brand" aria-label="MediResQ Home">
          <div className="brand-icon">
            <HeartPulse size={22} />
          </div>
          <div className="brand-text">
            <span className="brand-title">MediResQ</span>
            <span className="brand-subtitle">Healthcare Monitoring</span>
          </div>
        </NavLink>
      </div>

      {/* Horizontal Top Navigation Links */}
      <nav className="topbar-center-nav" aria-label="Main Navigation">
        <NavLink
          to="/doctor"
          end
          className={({ isActive }) => `topbar-nav-link ${isActive ? 'active' : ''}`}
        >
          <Stethoscope size={16} />
          <span>Doctor Dashboard</span>
        </NavLink>

        <NavLink
          to="/caretaker"
          className={({ isActive }) => `topbar-nav-link ${isActive ? 'active' : ''}`}
        >
          <Activity size={16} />
          <span>Caretaker Station</span>
        </NavLink>

        <NavLink
          to="/reports"
          className={({ isActive }) => `topbar-nav-link ${isActive ? 'active' : ''}`}
        >
          <FileText size={16} />
          <span>Management</span>
        </NavLink>

        <NavLink
          to="/staff-management"
          className={({ isActive }) => `topbar-nav-link ${isActive ? 'active' : ''}`}
        >
          <ShieldCheck size={16} />
          <span>Staff Management Station</span>
        </NavLink>
      </nav>

      <div className="topbar-right">
        {/* Live Telemetry Status Badge */}
        <div className="telemetry-badge" title="Live Telemetry Ingestion Active">
          <span className="pulse-dot" aria-hidden="true"></span>
          <span className="telemetry-text">Live Telemetry</span>
        </div>

        <TopBarAlertBadge />

        {/* User Profile Pill */}
        <div className="user-profile-pill">
          <div className="user-avatar-sm">
            {user.name ? user.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() : <User size={16} />}
          </div>
          <div className="user-details">
            <span className="user-name">{user.name || 'Clinical Staff'}</span>
            <span className={`badge ${roleBadgeClass} user-role-badge`}>{roleLabel}</span>
          </div>
        </div>

        {/* Direct Logout Action */}
        <button
          onClick={onLogout}
          className="topbar-logout-btn"
          title="Sign Out of MediResQ"
          aria-label="Sign Out"
        >
          <LogOut size={16} />
          <span className="logout-text">Logout</span>
        </button>
      </div>
    </header>
  );
};

export default React.memo(TopBar);
