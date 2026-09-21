import React, { useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { Activity, Stethoscope, LogOut, ShieldCheck, FileText, HeartPulse, X } from 'lucide-react';

const Sidebar = ({ user, onLogout, isOpen, onClose }) => {
  const location = useLocation();

  // Close mobile drawer on route changes automatically
  useEffect(() => {
    if (isOpen) {
      onClose();
    }
  }, [location.pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keyboard accessibility: ESC closes drawer
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!user) return null;

  return (
    <>
      {/* Mobile Backdrop Overlay */}
      {isOpen && (
        <div
          className="sidebar-overlay"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      <aside
        className={`sidebar ${isOpen ? 'open' : ''}`}
        aria-label="Mobile Navigation Menu"
        aria-hidden={!isOpen}
      >
        <div className="sidebar-header">
          <div className="topbar-brand">
            <div className="brand-icon">
              <HeartPulse size={22} />
            </div>
            <div className="brand-text">
              <span className="brand-title">MediResQ</span>
              <span className="brand-subtitle">Healthcare Monitoring</span>
            </div>
          </div>
          <button
            className="sidebar-close-btn"
            onClick={onClose}
            aria-label="Close Navigation Menu"
          >
            <X size={20} />
          </button>
        </div>

        <nav className="nav-links">
          <NavLink
            to="/doctor"
            end
            className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
            onClick={onClose}
          >
            <Stethoscope size={18} />
            <span>Doctor Dashboard</span>
          </NavLink>

          <NavLink
            to="/caretaker"
            className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
            onClick={onClose}
          >
            <Activity size={18} />
            <span>Caretaker Station</span>
          </NavLink>

          <NavLink
            to="/reports"
            className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
            onClick={onClose}
          >
            <FileText size={18} />
            <span>Management</span>
          </NavLink>

          <NavLink
            to="/staff-management"
            className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
            onClick={onClose}
          >
            <ShieldCheck size={18} />
            <span>Staff Management Station</span>
          </NavLink>

          <div className="sidebar-footer">
            <button
              onClick={() => {
                onClose();
                onLogout();
              }}
              className="nav-link logout-nav-link"
              aria-label="Sign Out"
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
