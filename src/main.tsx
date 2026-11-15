import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Clean up any stale Vite dev service workers in development preview
if (import.meta.env.DEV && 'serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then((registrations) => {
    for (const registration of registrations) {
      registration.unregister();
    }
  });
}

createRoot(document.getElementById('root')!).render(<App />);
