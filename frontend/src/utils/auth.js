/**
 * Authentication and session persistence utilities for MediResQ.
 */

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
  if (role === 'staff') return '/staff-management';
  return '/caretaker';
};
