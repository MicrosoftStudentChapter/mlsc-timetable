// Loads sidebar feed data (announcements, exam dates) with the same
// backend-first → bundled-fallback strategy used by `loadTimetable`.
//
// Backend contract (see docs/API.md):
//   GET ${VITE_BACKEND_URL}/announcements -> Announcement[]
//   GET ${VITE_BACKEND_URL}/exam-dates    -> ExamDate[]
//
// Both endpoints return `[]` when no rows exist. These feeds intentionally do
// not fall back to bundled content: an empty admin collection must render as
// empty rather than appearing seeded on the public site.
//
// Return shape (both helpers):
//   { status: 'ok' | 'fallback' | 'error', items: Array<...> }

import { getBackendUrl } from './backend_url'

const FALLBACK_BASE = `${import.meta.env.BASE_URL || '/'}fallback`.replace(/\/+$/, '')

function backendUrl(path) {
  const base = getBackendUrl()
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

async function loadList({ apiPath }) {
  const live = backendUrl(apiPath)
  if (live) {
    const items = await fetchJsonList(live)
    if (items) return { status: 'ok', items }
  }
  return { status: 'error', items: [] }
}

export function loadAnnouncements() {
  return loadList({ apiPath: '/announcements' })
}

export function loadExamDates(batch) {
  const cleaned = String(batch || '').trim()
  const qs = cleaned ? `?batch=${encodeURIComponent(cleaned)}` : ''
  return loadList({ apiPath: `/exam-dates${qs}` })
}

export function loadCalendarOverrides(batch) {
  const cleaned = String(batch || '').trim()
  const qs = cleaned ? `?batch=${encodeURIComponent(cleaned)}` : ''
  return loadList({
    apiPath: `/calendar-overrides${qs}`,
    fallbackName: 'calendar_overrides.json',
  })
}
