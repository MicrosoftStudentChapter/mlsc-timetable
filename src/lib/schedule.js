// Room and teacher schedules + free/busy lookup.
//
//   GET /schedule/meta
//   GET /schedule/{kind}s?q=
//   GET /schedule/{kind}s/{name}
//   GET /schedule/{kind}s/{name}/free?day=
//   GET /schedule/availability/{kind}?day=&at=  (or &start=&end=)
//
// Room routes are public. Teacher routes are admin-gated unless the backend
// sets TEACHER_SCHEDULE_ACCESS=public, so every call here can come back 401/403
// and callers must render that as "restricted" rather than "broken".

import { authHeaders } from './identity'
import { getBackendUrl } from './backend_url'

export const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

function base() {
  const url = getBackendUrl()
  return url ? `${url.replace(/\/+$/, '')}/schedule` : ''
}

async function get(path, { auth = false } = {}) {
  const root = base()
  if (!root) return { status: 'no_backend', message: 'Backend is not configured' }
  let response
  try {
    response = await fetch(`${root}${path}`, {
      headers: auth ? await authHeaders() : undefined,
    })
  } catch (err) {
    return { status: 'error', message: err?.message || 'Network error' }
  }
  if (response.status === 401 || response.status === 403) {
    return { status: 'restricted', message: 'Teacher schedules are restricted on this server' }
  }
  if (response.status === 404) {
    return { status: 'not_found', message: 'Not found' }
  }
  if (!response.ok) {
    return { status: 'error', message: `Request failed (${response.status})` }
  }
  try {
    return { status: 'ok', data: await response.json() }
  } catch {
    return { status: 'error', message: 'Invalid response' }
  }
}

export function loadMeta() {
  return get('/meta')
}

export function loadResources(kind, query = '') {
  const search = query ? `?q=${encodeURIComponent(query)}` : ''
  return get(`/${kind}s${search}`, { auth: kind === 'teacher' })
}

export function loadResourceWeek(kind, name) {
  return get(`/${kind}s/${encodeURIComponent(name)}`, { auth: kind === 'teacher' })
}

export function loadFreeWindows(kind, name, day) {
  return get(`/${kind}s/${encodeURIComponent(name)}/free?day=${encodeURIComponent(day)}`, {
    auth: kind === 'teacher',
  })
}

export function loadAvailability(kind, { day, at, start, end }) {
  const params = new URLSearchParams({ day })
  if (at) params.set('at', at)
  if (start) params.set('start', start)
  if (end) params.set('end', end)
  return get(`/availability/${kind}?${params}`, { auth: kind === 'teacher' })
}

// ── Time helpers ─────────────────────────────────────────────────────────
export function currentDayName(date = new Date()) {
  return DAYS[(date.getDay() + 6) % 7] ?? 'Monday'
}

export function currentTime(date = new Date()) {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

// The teaching grid runs 08:00–18:50 in 50-minute slots.
export function slotOptions(slots) {
  if (Array.isArray(slots) && slots.length) {
    return slots.map((slot) => slot.start_time)
  }
  return [
    '08:00', '08:50', '09:40', '10:30', '11:20', '12:10',
    '13:00', '13:50', '14:40', '15:30', '16:20', '17:10', '18:00',
  ]
}
