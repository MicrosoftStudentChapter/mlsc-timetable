// Utility for checking, updating, and subscribing to site maintenance / takedown status.

import { getBackendUrl } from './backend_url'

const BACKEND_URL = getBackendUrl()
const STORAGE_KEY = 'mlsc_site_maintenance_status'
const EVENT_NAME = 'mlsc_site_status_changed'

export const DEFAULT_MAINTENANCE_MESSAGE = 'Please use excel provided by the university at thapar.edu'

function getDefaultStatus() {
  return {
    maintenance: false,
    message: DEFAULT_MAINTENANCE_MESSAGE,
    updatedAt: new Date().toISOString(),
  }
}

export function getSiteStatusSync() {
  if (typeof window === 'undefined') return getDefaultStatus()
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return getDefaultStatus()
    const parsed = JSON.parse(raw)
    return {
      maintenance: Boolean(parsed.maintenance),
      message: typeof parsed.message === 'string' && parsed.message.trim() ? parsed.message.trim() : DEFAULT_MAINTENANCE_MESSAGE,
      updatedAt: parsed.updatedAt || new Date().toISOString(),
    }
  } catch {
    return getDefaultStatus()
  }
}

function saveStatusToLocal(status) {
  if (typeof window === 'undefined') return
  try {
    const payload = {
      maintenance: Boolean(status.maintenance),
      message: status.message || DEFAULT_MAINTENANCE_MESSAGE,
      updatedAt: status.updatedAt || new Date().toISOString(),
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
    window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: payload }))
  } catch {
    // Ignore storage quota or access errors
  }
}

export async function fetchSiteStatus() {
  // If backend URL exists, fetch from server
  if (BACKEND_URL) {
    try {
      const res = await fetch(`${BACKEND_URL}/site-status`, {
        headers: { Accept: 'application/json' },
      })
      if (res.ok) {
        const data = await res.json()
        const status = {
          maintenance: Boolean(data.maintenance),
          message: data.message || DEFAULT_MAINTENANCE_MESSAGE,
          updatedAt: data.updated_at || new Date().toISOString(),
        }
        saveStatusToLocal(status)
        return status
      }
    } catch {
      // Fallback to local storage if backend request fails
    }
  }

  return getSiteStatusSync()
}

export async function saveSiteStatus({ maintenance, message }) {
  const newStatus = {
    maintenance: Boolean(maintenance),
    message: typeof message === 'string' && message.trim() ? message.trim() : DEFAULT_MAINTENANCE_MESSAGE,
    updatedAt: new Date().toISOString(),
  }

  if (BACKEND_URL) {
    try {
      const clerk = typeof window !== 'undefined' ? window.Clerk : null
      const session = clerk?.session
      const token = session ? await session.getToken({ template: 'mlsc-admin' }).catch(() => session.getToken()) : null

      const res = await fetch(`${BACKEND_URL}/admin/site-status`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          maintenance: newStatus.maintenance,
          message: newStatus.message,
        }),
      })

      if (res.ok) {
        const data = await res.json()
        const updated = {
          maintenance: Boolean(data.maintenance),
          message: data.message || newStatus.message,
          updatedAt: data.updated_at || newStatus.updatedAt,
        }
        saveStatusToLocal(updated)
        return updated
      }
    } catch {
      // Fallback to local save if backend update fails
    }
  }

  saveStatusToLocal(newStatus)
  return newStatus
}

export function subscribeSiteStatus(callback) {
  if (typeof window === 'undefined') return () => {}

  const handleCustomEvent = (e) => {
    if (e.detail) {
      callback(e.detail)
    } else {
      callback(getSiteStatusSync())
    }
  }

  const handleStorageEvent = (e) => {
    if (e.key === STORAGE_KEY) {
      callback(getSiteStatusSync())
    }
  }

  window.addEventListener(EVENT_NAME, handleCustomEvent)
  window.addEventListener('storage', handleStorageEvent)

  return () => {
    window.removeEventListener(EVENT_NAME, handleCustomEvent)
    window.removeEventListener('storage', handleStorageEvent)
  }
}
