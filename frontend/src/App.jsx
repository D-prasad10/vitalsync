import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import TopBar from './components/TopBar';
import Login from './pages/Login';
import DoctorDashboard from './pages/DoctorDashboard';
import CaretakerDashboard from './pages/CaretakerDashboard';
import PatientDashboard from './pages/PatientDashboard';
import PatientInfo from './pages/PatientInfo';
import StaffManagement from './pages/StaffManagement';
import Reports from './pages/Reports';
import AlertToast from './components/AlertToast';
import { io } from 'socket.io-client';

const socket = io('http://localhost:5001');

// --- Protected Route Helper ---
const ProtectedRoute = ({ user, requiredRole, children }) => {
  if (!user) return <Navigate to="/login" replace />;
  if (requiredRole && user.role !== requiredRole) {
    const fallbackRoute = user.role === 'doctor' ? '/doctor' : user.role === 'caretaker' ? '/caretaker' : '/patient-dashboard';
    return <Navigate to={fallbackRoute} replace />;
  }
  return children;
};

function App() {
  const [alerts, setAlerts] = useState([]);
  const [globalRealtimeData, setGlobalRealtimeData] = useState({});
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [user, setUser] = useState(() => {
    try {
      const saved = localStorage.getItem('vitals_user');
      return saved ? JSON.parse(saved) : null;
    } catch {
      localStorage.removeItem('vitals_user');
      return null;
    }
  });

  const handleLogin = (userData) => {
    setUser(userData);
    localStorage.setItem('vitals_user', JSON.stringify(userData));
  };

  const handleLogout = () => {
    setUser(null);
    localStorage.removeItem('vitals_user');
    setSidebarOpen(false);
  };

  useEffect(() => {
    socket.on('emergency_alert', (data) => {
      const newAlert = { ...data, id: Date.now() + Math.random() };
      setAlerts(prev => [...prev, newAlert]);
      setTimeout(() => {
        setAlerts(prev => prev.filter(a => a.id !== newAlert.id));
      }, 6000);
    });

    const handleSensorData = (data) => {
      setGlobalRealtimeData(prev => {
        const patientData = prev[data.patient_id] || [];
        const newData = [...patientData, data].slice(-30);
        return { ...prev, [data.patient_id]: newData };
      });
    };

    socket.on('sensor_data', handleSensorData);

    return () => {
      socket.off('emergency_alert');
      socket.off('sensor_data', handleSensorData);
    };
  }, []);

  const dismissAlert = (id) => {
    setAlerts(prev => prev.filter(a => a.id !== id));
  };

  return (
    <BrowserRouter>
      <div className={`app-container ${user ? 'authenticated' : ''}`}>
        {user && (
          <>
            <TopBar
              user={user}
              onLogout={handleLogout}
              alertsCount={alerts.length}
              onToggleSidebar={() => setSidebarOpen(prev => !prev)}
            />
            <Sidebar
              user={user}
              onLogout={handleLogout}
              isOpen={sidebarOpen}
              onClose={() => setSidebarOpen(false)}
            />
          </>
        )}

        <div className={`main-layout ${user ? 'with-topbar' : ''}`}>
          <main className="main-content" style={{ padding: user ? '1.5rem 2rem' : '0' }}>
            <Routes>
              <Route path="/login" element={
                user ? <Navigate to={user.role === 'doctor' ? '/doctor' : '/caretaker'} replace /> : <Login onLogin={handleLogin} />
              } />

              <Route path="/doctor" element={
                <ProtectedRoute user={user} requiredRole="doctor">
                  <DoctorDashboard socket={socket} globalRealtimeData={globalRealtimeData} />
                </ProtectedRoute>
              } />

              <Route path="/caretaker" element={
                <ProtectedRoute user={user} requiredRole="caretaker">
                  <CaretakerDashboard socket={socket} globalRealtimeData={globalRealtimeData} />
                </ProtectedRoute>
              } />

              <Route path="/patient-dashboard" element={
                <ProtectedRoute user={user}>
                  <PatientDashboard socket={socket} globalRealtimeData={globalRealtimeData} />
                </ProtectedRoute>
              } />

              <Route path="/patient/:id" element={
                <ProtectedRoute user={user}>
                  <PatientInfo />
                </ProtectedRoute>
              } />

              <Route path="/staff-management" element={
                <ProtectedRoute user={user} requiredRole="doctor">
                  <StaffManagement />
                </ProtectedRoute>
              } />

              <Route path="/reports" element={
                <ProtectedRoute user={user}>
                  <Reports />
                </ProtectedRoute>
              } />

              <Route path="/" element={<Navigate to="/login" replace />} />
              <Route path="*" element={<Navigate to="/login" replace />} />
            </Routes>
          </main>
        </div>

        {user && (
          <div className="toast-container">
            {alerts.slice(-4).map(alert => (
              <AlertToast key={alert.id} alert={alert} onDismiss={() => dismissAlert(alert.id)} />
            ))}
          </div>
        )}
      </div>
    </BrowserRouter>
  );
}

export default App;
