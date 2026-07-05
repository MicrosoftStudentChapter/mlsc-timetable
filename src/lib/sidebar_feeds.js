// Loads sidebar feed data (announcements, exam dates) with the same
// backend-first → bundled-fallback strategy used by `loadTimetable`.
//
// Backend contract (see docs/API.md):
//   GET ${VITE_BACKEND_URL}/announcements -> Announcement[]
//   GET ${VITE_BACKEND_URL}/exam-dates    -> ExamDate[]
//
// Both endpoints return `[]` on missing data, never an error envelope, so a
// successful HTTP response is always usable. On network/5xx we silently fall
// back to /public/fallback/<name>.json so the UI still has something to show.
//
// Return shape (both helpers):
//   { status: 'ok' | 'fallback' | 'error', items: Array<...> }

const FALLBACK_BASE = `${import.meta.env.BASE_URL || '/'}fallback`.replace(/\/+$/, '')

function backendUrl(path) {
  const base = (import.meta.env.VITE_BACKEND_URL || '').replace(/\/$/, '')
  return base ? `${base}${path}` : null
}

async function fetchJsonList(url) {
  try {
    const response = await fetch(url)
    if (!response.ok) return null
    const data = await response.json()
    return Array.isArray(data) ? data : null
  } catch {
    return null
  }
}

async function loadList({ apiPath, fallbackName }) {
  const live = backendUrl(apiPath)
  if (live) {
    const items = await fetchJsonList(live)
    if (items) return { status: 'ok', items }
  }
  const fallback = await fetchJsonList(`${FALLBACK_BASE}/${fallbackName}`)
  if (fallback) return { status: 'fallback', items: fallback }
  return { status: 'error', items: [] }
}

export function loadAnnouncements() {
  return loadList({ apiPath: '/announcements', fallbackName: 'announcements.json' })
}

export function loadExamDates(batch) {
  const cleaned = String(batch || '').trim()
  const qs = cleaned ? `?batch=${encodeURIComponent(cleaned)}` : ''
  return loadList({ apiPath: `/exam-dates${qs}`, fallbackName: 'exam_dates.json' })
}

export function loadCalendarOverrides(batch) {
  const cleaned = String(batch || '').trim()
  const qs = cleaned ? `?batch=${encodeURIComponent(cleaned)}` : ''
  return loadList({
    apiPath: `/calendar-overrides${qs}`,
    fallbackName: 'calendar_overrides.json',
  })
}
