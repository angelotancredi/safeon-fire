import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// Early Boot Error Handler (Non-React fallback)
window.onerror = (msg, url, line, col, error) => {
  const container = document.getElementById('boot-error');
  const content = document.getElementById('error-content');
  if (container && content) {
    container.style.display = 'block';
    content.textContent = `${msg}\nAt: ${url}:${line}:${col}\nStack: ${error?.stack || 'N/A'}`;
  }
  return false;
};

window.onunhandledrejection = (event) => {
  const container = document.getElementById('boot-error');
  const content = document.getElementById('error-content');
  if (container && content) {
    container.style.display = 'block';
    content.textContent = `Unhandled Rejection: ${event.reason?.message || event.reason}\nStack: ${event.reason?.stack || 'N/A'}`;
  }
};

// 4️⃣ PWA/Service Worker Kill-switch (Cache Busting)
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations()
    .then(regs => {
      regs.forEach(r => {
        r.unregister();
        console.log('SW Unregistered for V31 Cache Clear');
      });
    })
    .catch(err => console.error('SW Unregister Fail', err));
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Root element not found");
}

createRoot(rootElement).render(
  <App />
)
