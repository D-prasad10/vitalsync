import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useState, useCallback, memo } from 'react';
import Sidebar from './components/Sidebar';
import TopBar from './components/TopBar';
import Login from './pages/Login';
import DoctorDashboard from './pages/DoctorDashboard';
import CaretakerDashboard from './pages/CaretakerDashboard';
import PatientDashboard from './pages/PatientDashboard';
import PatientInfo from './pages/PatientInfo';
import StaffManagement from './pages/StaffManagement';
import Reports from './pages/Reports';
import EmergencyAlertPanel from './components/EmergencyAlertPanel';
import { getSocket } from './utils/telemetryStore';

getSocket();

export const getStoredUser = () => {
  try {
    const saved = localStorage.getItem('vitals_user');
    if (!saved) return null;
    const parsed = JSON.parse(saved);
    if (!parsed || typeof parsed !== 'object') return null;
    if (parsed.role) {
      parsed.role = String(parsed.role).toLowerCase().trim();
    }
    return parsed;
  } catch {
    localStorage.removeItem('vitals_user');
    return null;
  }
};

export const roleHome = (user) => {
  if (!user) return '/login';
  const role = (user.role || '').toLowerCase().trim();
  if (role === 'doctor') return '/doctor';
  if (role === 'caretaker') return '/caretaker';
  if (role === 'staff') return '/staff';
  if (role === 'patient') return '/patient-dashboard';
  return '/patient-dashboard';
};

const ProtectedRoute = ({ user, requiredRole, allowedRoles, children }) => {
  // Always resolve latest persisted session or state to eliminate race conditions
  const currentUser = getStoredUser() || user;

  if (!currentUser) {
    console.warn('[AUTH] ProtectedRoute: No authenticated user session found, redirecting to /login');
    return <Navigate to="/login" replace />;
  }

  const role = (currentUser.role || '').toLowerCase().trim();
  const targetHome = roleHome(currentUser);

  if (allowedRoles) {
    const normalizedAllowed = allowedRoles.map(r => r.toLowerCase().trim());
    if (!normalizedAllowed.includes(role)) {
      console.warn(`[AUTH] ProtectedRoute: Role "${role}" not in allowedRoles [${normalizedAllowed.join(', ')}], redirecting to ${targetHome}`);
      return <Navigate to={targetHome} replace />;
    }
  } else if (requiredRole) {
    const normalizedRequired = requiredRole.toLowerCase().trim();
    if (role !== normalizedRequired && role !== 'doctor') {
      console.warn(`[AUTH] ProtectedRoute: Role "${role}" does not match required "${normalizedRequired}", redirecting to ${targetHome}`);
      return <Navigate to={targetHome} replace />;
    }
  }

  console.log(`[AUTH] ProtectedRoute: Access granted for role "${role}"`);
  return children;
};

function App() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [user, setUser] = useState(() => getStoredUser());

  const handleLogin = useCallback((userData) => {
    if (!userData) return;
    const normalizedUser = {
      ...userData,
      role: (userData.role || 'staff').toLowerCase().trim()
    };
    console.log('[AUTH] handleLogin: Storing authenticated user session:', normalizedUser);
    localStorage.setItem('vitals_user', JSON.stringify(normalizedUser));
    setUser(normalizedUser);
  }, []);

  const handleLogout = useCallback(() => {
    console.log('[AUTH] handleLogout: Clearing user session');
    localStorage.removeItem('vitals_user');
    setUser(null);
    setSidebarOpen(false);
  }, []);

  const toggleSidebar = useCallback(() => {
    setSidebarOpen((prev) => !prev);
  }, []);

  const closeSidebar = useCallback(() => {
    setSidebarOpen(false);
  }, []);

  const currentUser = user || getStoredUser();
  const home = roleHome(currentUser);

  return (
    <BrowserRouter>
      <div className={`app-container ${currentUser ? 'authenticated' : ''}`}>
        {currentUser && (
          <>
            <TopBar
              user={currentUser}
              onLogout={handleLogout}
              onToggleSidebar={toggleSidebar}
            />
            <Sidebar
              user={currentUser}
              onLogout={handleLogout}
              isOpen={sidebarOpen}
              onClose={closeSidebar}
            />
          </>
        )}

        <div className={`main-layout ${currentUser ? 'with-topbar' : ''}`}>
          <main className="main-content" style={{ padding: currentUser ? '1.5rem 2rem' : '0' }}>
            <Routes>
              <Route
                path="/login"
                element={currentUser ? <Navigate to={home} replace /> : <Login onLogin={handleLogin} />}
              />

              <Route
                path="/doctor"
                element={
                  <ProtectedRoute user={currentUser} requiredRole="doctor">
                    <DoctorDashboard />
                  </ProtectedRoute>
                }
              />

              <Route
                path="/caretaker"
                element={
                  <ProtectedRoute user={currentUser} allowedRoles={['caretaker', 'doctor']}>
                    <CaretakerDashboard />
                  </ProtectedRoute>
                }
              />

              <Route
                path="/patient-dashboard"
                element={
                  <ProtectedRoute user={currentUser}>
                    <PatientDashboard />
                  </ProtectedRoute>
                }
              />

              <Route
                path="/patient/:id"
                element={
                  <ProtectedRoute user={currentUser}>
                    <PatientInfo />
                  </ProtectedRoute>
                }
              />

              <Route
                path="/staff"
                element={
                  <ProtectedRoute user={currentUser} allowedRoles={['staff', 'doctor']}>
                    <StaffManagement />
                  </ProtectedRoute>
                }
              />

              <Route
                path="/staff-management"
                element={
                  <ProtectedRoute user={currentUser} allowedRoles={['staff', 'doctor']}>
                    <StaffManagement />
                  </ProtectedRoute>
                }
              />

              <Route
                path="/reports"
                element={
                  <ProtectedRoute user={currentUser}>
                    <Reports />
                  </ProtectedRoute>
                }
              />

              <Route path="/" element={<Navigate to={home} replace />} />
              <Route path="*" element={<Navigate to={home} replace />} />
            </Routes>
          </main>
          {currentUser && <EmergencyAlertPanel />}
        </div>
      </div>
    </BrowserRouter>
  );
}

export default App;
