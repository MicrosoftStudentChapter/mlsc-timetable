// Public TIET Tentative Event Calendar client.
//
// The month endpoint is deliberately used for the mini-calendar so opening a
// timetable never downloads the full event collection. Full event records are
// fetched only after a student opens a marked date. Both layers keep a short
// in-memory cache because users commonly move between adjacent months.

const DEFAULT_BASE_URL = 'https://campusconnect.thapar.edu/tc-api'
const API_BASE_URL = String(
  import.meta.env.VITE_TENTATIVE_CALENDAR_API_URL || DEFAULT_BASE_URL,
).replace(/\/+$/, '')

const MONTH_CACHE_TTL = 10 * 60 * 1000
const DATE_CACHE_TTL = 5 * 60 * 1000
const REQUEST_TIMEOUT = 8000

const monthCache = new Map()
const monthRequests = new Map()
const dateCache = new Map()
const dateRequests = new Map()

function readCache(cache, key) {
  const cached = cache.get(key)
  if (!cached) return null
  if (cached.expiresAt <= Date.now()) {
    cache.delete(key)
    return null
  }
  return cached.value
}

function writeCache(cache, key, value, ttl) {
  cache.set(key, { value, expiresAt: Date.now() + ttl })
  return value
}

async function fetchCalendarJson(path) {
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT)
  try {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    })
    if (!response.ok) throw new Error(`Tentative Calendar returned ${response.status}`)
    return await response.json()
  } finally {
    window.clearTimeout(timeout)
  }
}

function safeMonthSummary(value) {
  if (!value || Array.isArray(value) || typeof value !== 'object') return {}
  const days = {}
  for (const [date, summary] of Object.entries(value)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !summary || typeof summary !== 'object') continue
    const count = Math.max(0, Number(summary.count) || 0)
    if (!summary.hasEvent && count === 0) continue
    days[date] = {
      hasEvent: true,
      hasConflict: Boolean(summary.hasConflict),
      count: Math.max(1, count),
    }
  }
  return days
}

function safeEvent(value) {
  if (!value || typeof value !== 'object') return null
  const id = String(value._id || '').trim()
  const event = String(value.event || '').trim()
  if (!id || !event) return null
  return {
    id,
    event,
    society: String(value.society || '').trim(),
    startDate: String(value.startDate || '').trim(),
    startTime: String(value.startTime || '').trim(),
    endDate: String(value.endDate || '').trim(),
    endTime: String(value.endTime || '').trim(),
    venue: String(value.venue || '').trim(),
    description: String(value.description || '').trim(),
    conflict: Boolean(value.dateConflict ?? value.conflict),
    status: String(value.status || '').trim(),
  }
}

export async function loadTentativeCalendarMonth(year, month) {
  const key = `${Number(year)}-${Number(month)}`
  const cached = readCache(monthCache, key)
  if (cached) return cached
  if (monthRequests.has(key)) return monthRequests.get(key)

  const request = fetchCalendarJson(`/api/events/calendar/${Number(year)}/${Number(month)}`)
    .then((data) => writeCache(monthCache, key, {
      status: 'ok',
      days: safeMonthSummary(data),
    }, MONTH_CACHE_TTL))
    .catch(() => ({ status: 'error', days: {} }))
    .finally(() => monthRequests.delete(key))

  monthRequests.set(key, request)
  return request
}

export async function loadTentativeCalendarDate(date) {
  const key = String(date || '').trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return { status: 'error', items: [] }
  const cached = readCache(dateCache, key)
  if (cached) return cached
  if (dateRequests.has(key)) return dateRequests.get(key)

  const request = fetchCalendarJson(`/api/events/by-date/${encodeURIComponent(key)}`)
    .then((data) => writeCache(dateCache, key, {
      status: 'ok',
      items: Array.isArray(data) ? data.map(safeEvent).filter(Boolean) : [],
    }, DATE_CACHE_TTL))
    .catch(() => ({ status: 'error', items: [] }))
    .finally(() => dateRequests.delete(key))

  dateRequests.set(key, request)
  return request
}

