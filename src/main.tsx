// Intercept and suppress benign internal Firebase Auth and Firestore network connection failures in sandboxed/preview environments
if (typeof window !== 'undefined') {
  const isFirebaseAssertion = (msg: any): boolean => {
    if (!msg) return false;
    const str = typeof msg === 'string' ? msg : (msg.message || msg.stack || String(msg));
    return (
      str.includes('Pending promise was never set') ||
      str.includes('INTERNAL ASSERTION FAILED') ||
      str.includes('auth/network-request-failed') ||
      str.includes('auth/popup-closed-by-user') ||
      str.includes('Could not reach Cloud Firestore backend') ||
      str.includes('The client will operate in offline mode') ||
      str.includes('code=unavailable') ||
      str.includes('firebase/firestore') ||
      str.includes('@firebase/firestore')
    );
  };

  const originalConsoleError = console.error;
  console.error = function (...args: any[]) {
    if (args.some(isFirebaseAssertion)) {
      console.warn('[Bypassed Firebase Auth Error in Sandboxed Frame]:', ...args);
      return;
    }
    originalConsoleError.apply(this, args);
  };

  window.addEventListener('error', (event) => {
    if (isFirebaseAssertion(event.error) || isFirebaseAssertion(event.message)) {
      event.preventDefault();
      event.stopPropagation();
      console.warn('[Suppressed Uncaught Firebase Auth Exception]:', event.error || event.message);
    }
  }, true);

  window.addEventListener('unhandledrejection', (event) => {
    if (isFirebaseAssertion(event.reason)) {
      event.preventDefault();
      event.stopPropagation();
      console.warn('[Suppressed Unhandled Firebase Auth Promise Rejection]:', event.reason);
    }
  }, true);
}

import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    console.log('Registering Service Worker...');
    navigator.serviceWorker.register('/sw.js').then((registration) => {
      console.log('Service Worker registered with scope:', registration.scope);
    }).catch((error) => {
      console.error('Service Worker registration failed:', error);
    });
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Trigger deployment build commit

