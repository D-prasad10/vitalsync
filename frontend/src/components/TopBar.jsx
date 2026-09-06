import React from 'react';
import { HeartPulse, Menu, Bell, Shield, LogOut, Activity, User } from 'lucide-react';

const TopBar = ({ user, onLogout, alertsCount = 0, onToggleSidebar }) => {
  if (!user) return null;

  const roleLabel = user.role === 'doctor' ? 'Doctor' : user.role === 'caretaker' ? 'Caretaker' : user.role || 'Staff';
  const roleBadgeClass = user.role === 'doctor' ? 'badge-info' : 'badge-stable';

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

        <div className="topbar-brand">
          <div className="brand-icon">
            <HeartPulse size={24} color="var(--accent-primary)" />
          </div>
          <div className="brand-text">
            <span className="brand-title">VoltVertex</span>
            <span className="brand-subtitle">VitalsSync</span>
          </div>
        </div>
      </div>

      <div className="topbar-right">
        {/* Live Telemetry Status Badge */}
        <div className="telemetry-badge">
          <span className="pulse-dot"></span>
          <span className="telemetry-text">Live Telemetry</span>
        </div>

        {/* Emergency Alert Indicator */}
        {alertsCount > 0 && (
          <div className="alert-indicator" title={`${alertsCount} Active Emergency Alert(s)`}>
            <Bell size={18} className="bell-icon-pulsing" />
            <span className="alert-count-badge">{alertsCount}</span>
          </div>
        )}

        {/* User Profile Pill */}
        <div className="user-profile-pill">
          <div className="user-avatar-sm">
            {user.name ? user.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() : <User size={16} />}
          </div>
          <div className="user-details">
            <span className="user-name">{user.name || 'Healthcare Staff'}</span>
            <span className={`badge ${roleBadgeClass} user-role-badge`}>{roleLabel}</span>
          </div>
        </div>

        {/* Direct Logout Action */}
        <button
          onClick={onLogout}
          className="topbar-logout-btn"
          title="Sign Out"
        >
          <LogOut size={18} />
          <span className="logout-text">Logout</span>
        </button>
      </div>
    </header>
  );
};

export default TopBar;
