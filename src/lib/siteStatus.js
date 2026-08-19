// Utility for checking, updating, and subscribing to site maintenance / takedown status.
//
// The backend is the ONLY source of truth. localStorage is a first-paint cache
// so returning visitors don't flash the wrong screen while the fetch is in
// flight — it is never treated as authoritative, and a failed save never
// silently "succeeds" locally (that made a takedown look applied to the admin
// while every other visitor still saw the live site).

import { getBackendUrl } from './backend_url'

const BACKEND_URL = getBackendUrl()
const STORAGE_KEY = 'mlsc_site_maintenance_status'
const EVENT_NAME = 'mlsc_site_status_changed'

export const DEFAULT_MAINTENANCE_MESSAGE = 'Please use excel provided by the university at thapar.edu'

const NO_BACKEND_ERROR =
  'No backend configured (VITE_BACKEND_URL is empty), so the takedown cannot reach other visitors.'

function getDefaultStatus() {
  return {
    maintenance: false,
    message: DEFAULT_MAINTENANCE_MESSAGE,
    updatedAt: new Date().toISOString(),
  }
}

function normalize(status) {
  return {
    maintenance: Boolean(status.maintenance),
    message:
      typeof status.message === 'string' && status.message.trim()
        ? status.message.trim()
        : DEFAULT_MAINTENANCE_MESSAGE,
    updatedAt: status.updatedAt || new Date().toISOString(),
  }
}

/** Last value the server gave this browser. Cache only — may be stale. */
export function getSiteStatusSync() {
  if (typeof window === 'undefined') return getDefaultStatus()
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return getDefaultStatus()
    return normalize(JSON.parse(raw))
  } catch {
    return getDefaultStatus()
  }
}

function saveStatusToLocal(status) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(status))
    window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: status }))
  } catch {
    // Ignore storage quota or access errors — the cache is optional.
  }
}

async function readError(res, fallback) {
  let detail = ''
  try {
    const body = await res.json()
    detail = body?.detail?.error || body?.error || body?.detail || ''
  } catch {
    // non-JSON body
  }
  if (typeof detail !== 'string') detail = ''
  return new Error(detail ? `${fallback} (${res.status}): ${detail}` : `${fallback} (HTTP ${res.status})`)
}

/**
 * Fetch the authoritative status. Throws if the backend is unreachable or
 * misconfigured — callers decide whether to fail open or surface the error.
 */
export async function fetchSiteStatus() {
  if (!BACKEND_URL) throw new Error(NO_BACKEND_ERROR)

  const res = await fetch(`${BACKEND_URL}/site-status`, {
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  })
  if (!res.ok) throw await readError(res, 'Could not read site status')

  const data = await res.json()
  const status = normalize({
    maintenance: data.maintenance,
    message: data.message,
    updatedAt: data.updated_at,
  })
  saveStatusToLocal(status)
  return status
}

/** Persist the status server-side. Throws on any failure — never falls back to local-only. */
export async function saveSiteStatus({ maintenance, message }) {
  if (!BACKEND_URL) throw new Error(NO_BACKEND_ERROR)

  const clerk = typeof window !== 'undefined' ? window.Clerk : null
  const session = clerk?.session
  const token = session
    ? await session.getToken({ template: 'mlsc-admin' }).catch(() => session.getToken())
    : null

  const res = await fetch(`${BACKEND_URL}/admin/site-status`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      maintenance: Boolean(maintenance),
      message: typeof message === 'string' && message.trim() ? message.trim() : DEFAULT_MAINTENANCE_MESSAGE,
    }),
  })
  if (!res.ok) throw await readError(res, 'Could not update site status')

  const data = await res.json()
  const status = normalize({
    maintenance: data.maintenance,
    message: data.message,
    updatedAt: data.updated_at,
  })
  saveStatusToLocal(status)
  return status
}

export function subscribeSiteStatus(callback) {
  if (typeof window === 'undefined') return () => {}

  const handleCustomEvent = (e) => {
    callback(e.detail ? normalize(e.detail) : getSiteStatusSync())
  }

  const handleStorageEvent = (e) => {
    if (e.key === STORAGE_KEY) callback(getSiteStatusSync())
  }

  window.addEventListener(EVENT_NAME, handleCustomEvent)
  window.addEventListener('storage', handleStorageEvent)

  return () => {
    window.removeEventListener(EVENT_NAME, handleCustomEvent)
    window.removeEventListener('storage', handleStorageEvent)
  }
}
