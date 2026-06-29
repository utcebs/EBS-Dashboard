import React from 'react'
import ReactDOM from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import App, { ErrorBoundary, showToast } from './App'
import './index.css'

// Kill any service worker + clear caches. Stale SWs were serving old code after
// navigating back from the EBS tracker. Runs on every app load — belt & suspenders.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations()
    .then(regs => { regs.forEach(r => r.unregister()) })
    .catch(() => {})
  if (window.caches) {
    caches.keys()
      .then(keys => keys.forEach(k => caches.delete(k)))
      .catch(() => {})
  }
}

// Global safety nets — surface unhandled rejections + uncaught errors so they
// stop being silent. Throttle to once per 3s so a runaway loop doesn't spam.
let _lastErrorAt = 0
// Noise injected by mobile browsers / extensions (Firefox iOS reader, Brave,
// crypto-wallet providers, Grammarly, ResizeObserver, cross-origin "Script
// error.") — NOT our app.
const IGNORE_ERR = /__firefox__|__brave__|reader|window\.ethereum|selectedAddress|web3|evmAsk|solana|ResizeObserver loop|Script error\.?$|Non-Error promise rejection|chrome-extension|moz-extension/i
function reportGlobal(label, detail) {
  const msg = (detail && detail.message) || (typeof detail === 'string' ? detail : '') || ''
  if (IGNORE_ERR.test(msg)) return
  const now = Date.now()
  if (now - _lastErrorAt < 3000) return
  _lastErrorAt = now
  console.error('[global]', label, detail)
  try { showToast(`${label}: ${msg || 'unknown error'}`, 'error') } catch {}
}
window.addEventListener('unhandledrejection', (e) => reportGlobal('Unhandled rejection', e.reason))
window.addEventListener('error', (e) => {
  // Ignore errors coming from scripts not served by our own origin (browser
  // extensions / injected content scripts), which we can't act on anyway.
  const file = (e && e.filename) || ''
  if (file && !file.startsWith(window.location.origin)) return
  reportGlobal('Runtime error', e.error || e.message)
})

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <HashRouter>
        <App />
      </HashRouter>
    </ErrorBoundary>
  </React.StrictMode>
)
