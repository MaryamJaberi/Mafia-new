/// <reference types="vite/client" />
import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Static hosting mode (GitHub Pages): there is no Express backend, so any /api call
// fails fast and the app's built-in local fallbacks take over (single-device mode).
const IS_STATIC = import.meta.env.VITE_STATIC_HOSTING === 'true';
if (IS_STATIC) {
  const isApi = (u: string) => {
    try { return new URL(u, window.location.href).pathname.startsWith('/api/'); } catch { return false; }
  };
  const origFetch = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (isApi(url)) return Promise.reject(new TypeError('Static hosting: no backend for ' + url));
    return origFetch(input, init);
  };
  const OrigES = window.EventSource;
  class StaticEventSource extends OrigES {
    constructor(url: string | URL, cfg?: EventSourceInit) {
      if (isApi(String(url))) {
        super('data:text/event-stream,', cfg);
        setTimeout(() => this.close(), 0);
        return;
      }
      super(url, cfg);
    }
  }
  window.EventSource = StaticEventSource as typeof EventSource;
}

// Register PWA Service Worker only in production; unregister in development to prevent stale caches.
// Skipped entirely on static hosting (shared origin with other sites; avoids stale caches while testing).
if ('serviceWorker' in navigator && !IS_STATIC) {
  if (process.env.NODE_ENV === 'production') {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch((err) => {
        console.log('SW registration note:', err);
      });
    });
  } else {
    // In development mode, unregister existing service workers to avoid stale iframe caches
    navigator.serviceWorker.getRegistrations().then((registrations) => {
      for (const reg of registrations) {
        reg.unregister();
      }
    });
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

