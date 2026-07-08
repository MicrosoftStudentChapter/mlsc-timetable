// Google Calendar sync API client.
//
// All calls require a valid Clerk session JWT (the user's `sub` claim is
// the key used on the backend).  getClerkToken() fetches it lazily.

const BASE = (import.meta?.env?.VITE_BACKEND_URL || '').replace(/\/$/, '')

function backendDisabled() {
  return !BASE
}

async function getClerkToken() {
  try {
    // window.Clerk is available when ClerkProvider is mounted.
    // getToken() with no args returns the default session token (has `sub`).
    const token = await window.Clerk?.session?.getToken()
    return token || null
  } catch {
    return null
  }
}

async function calendarFetch(path, opts = {}, getTokenFn = null) {
  if (backendDisabled()) throw new Error('Backend not configured')
  const token = getTokenFn ? await getTokenFn() : await getClerkToken()
  if (!token) throw new Error('Not signed in')
  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(opts.headers || {}),
    },
  })
  if (!res.ok) {
    let detail = {}
    try { detail = await res.json() } catch {}
    const err = new Error(detail?.error || detail?.detail || `HTTP ${res.status}`)
    err.code = detail?.code || String(res.status)
    err.status = res.status
    throw err
  }
  if (res.status === 204) return null
  return res.json()
}

// ── Status ──────────────────────────────────────────────────────────────

/**
 * GET /api/calendar/configured  (no auth)
 * Returns { configured: bool } — safe to call before the user signs in.
 */
export async function getCalendarConfigured() {
  if (backendDisabled()) return { configured: false }
  try {
    const res = await fetch(`${BASE}/api/calendar/configured`)
    if (!res.ok) return { configured: false }
    return res.json()
  } catch {
    return { configured: false }
  }
}

/**
 * GET /api/calendar/status
 * Returns { configured, connected, enabled, google_email, last_synced_at, last_error, ... }
 */
export async function getCalendarStatus(getTokenFn = null) {
  return calendarFetch('/api/calendar/status', {}, getTokenFn)
}

// ── OAuth ────────────────────────────────────────────────────────────────

/**
 * Open the Google OAuth popup. Returns a Promise that resolves when the
 * popup posts back `mlsc_calendar_connected`, or rejects on error/close.
 */
export function openOAuthPopup(redirectUrl) {
  return new Promise((resolve, reject) => {
    const popup = window.open(redirectUrl, 'gcal_oauth', 'width=520,height=680,popup=1')
    if (!popup) {
      reject(new Error('Popup blocked — allow popups for this site and try again'))
      return
    }

    function onMessage(evt) {
      if (!evt.data || typeof evt.data !== 'object') return
      if (evt.data.type === 'mlsc_calendar_connected') {
        cleanup()
        resolve()
      } else if (evt.data.type === 'mlsc_calendar_error') {
        cleanup()
        reject(new Error(evt.data.error || 'Google OAuth failed'))
      }
    }

    // Poll for popup close (user closed without completing)
    const pollClosed = setInterval(() => {
      if (popup.closed) {
        cleanup()
        reject(new Error('Window closed'))
      }
    }, 500)

    function cleanup() {
      window.removeEventListener('message', onMessage)
      clearInterval(pollClosed)
    }

    window.addEventListener('message', onMessage)
  })
}

/**
 * GET /api/calendar/oauth/start → { redirect_url }
 * Then opens the popup and waits for the postMessage.
 */
export async function connectCalendar(getTokenFn = null) {
  const { redirect_url } = await calendarFetch('/api/calendar/oauth/start', {}, getTokenFn)
  await openOAuthPopup(redirect_url)
}

// ── Enable / disable / resync ─────────────────────────────────────────────

/** POST /api/calendar/enable  body { batch } */
export async function enableCalendarSync(batch, getTokenFn = null) {
  return calendarFetch('/api/calendar/enable', {
    method: 'POST',
    body: JSON.stringify({ batch }),
  }, getTokenFn)
}

/** POST /api/calendar/disable */
export async function disableCalendarSync(getTokenFn = null) {
  return calendarFetch('/api/calendar/disable', { method: 'POST' }, getTokenFn)
}

/** POST /api/calendar/resync  optionally updates batch */
export async function triggerResync(batch, getTokenFn = null) {
  const url = batch
    ? `/api/calendar/resync?batch=${encodeURIComponent(batch)}`
    : '/api/calendar/resync'
  return calendarFetch(url, { method: 'POST' }, getTokenFn)
}

// ── Disconnect / clear ────────────────────────────────────────────────────

/**
 * DELETE /api/calendar/disconnect
 * Revokes Google token, deletes the MLSC calendar, wipes all DB rows.
 */
export async function disconnectCalendar(getTokenFn = null) {
  return calendarFetch('/api/calendar/disconnect', { method: 'DELETE' }, getTokenFn)
}

/**
 * DELETE /api/calendar/clear
 * Deletes all events we created + the MLSC calendar, but keeps the Google
 * connection active. User can resync to start fresh.
 */
export async function clearCalendarEvents(getTokenFn = null) {
  return calendarFetch('/api/calendar/clear', { method: 'DELETE' }, getTokenFn)
}
