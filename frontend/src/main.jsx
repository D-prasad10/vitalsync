import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'
// Global API fetch interceptor attaching bearer authorization header if present
const originalFetch = window.fetch;
window.fetch = async (url, options = {}) => {
  const urlStr = typeof url === 'string' ? url : (url && url.url ? url.url : '');
  if (urlStr.includes('/api/')) {
    try {
      const saved = localStorage.getItem('vitals_user');
      if (saved) {
        const u = JSON.parse(saved);
        if (u && u.token) {
          const headers = new Headers(options.headers || {});
          if (!headers.has('Authorization') && !headers.has('authorization')) {
            headers.set('Authorization', `Bearer ${u.token}`);
          }
          options = { ...options, headers };
        }
      }
    } catch {
      // Ignore token retrieval errors
    }
  }
  return originalFetch(url, options);
};

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
