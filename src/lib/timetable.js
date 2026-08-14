// Fetches a single batch's timetable from the backend and adapts it to the
// grid's expected shape (camelCase + stable ids + pairId for practicals).
//
// Backend contract (see BACKEND_PLAN.md §4):
//   GET ${VITE_BACKEND_URL}/timetable/{batch}
//   200 -> { batch, semester:{label}, classes:[{day,start_time,end_time,subject,code,type,room,options}] }
//   404 -> { detail:{ code:"batch_not_found", ... } }
//
// `loadMyTimetable(batch)` hits `/me/timetable?batch=...` with the persistent
// `X-User-Id` header so the backend can merge per-user overrides server-side.

import { authHeaders } from './identity'
import { getBackendUrl } from './backend_url'

const TIME_SLOTS = [
  '08:00', '08:50', '09:40', '10:30', '11:20', '12:10',
  '13:00', '13:50', '14:40', '15:30', '16:20', '17:10',
  '18:00',
]

let _idCounter = 0
const myTimetableRequests = new Map()
const nextId = () => `entry-${++_idCounter}`
const nextPairId = () => `pair-${++_idCounter}`

function adaptEntry(raw, teacherCodesVisible = false) {
  const requiresSelection = raw.requires_selection === true
  return {
    id: raw.class_id || nextId(),
    day: raw.day,
    startTime: raw.start_time,
    endTime: raw.end_time,
    subject: raw.subject ?? (requiresSelection ? '' : ''),
    code: raw.code ?? '',
    teacher: teacherCodesVisible ? (raw.teacher ?? '') : '',
    room: raw.room ?? '',
    type: raw.type ?? 'Lecture',
    options: Array.isArray(raw.options)
      ? raw.options.map((option) => (teacherCodesVisible ? option : { ...option, teacher: null }))
      : [],
    alternateWeekStart: raw.alternate_week_start ?? null,
    electiveChoice: raw.electiveChoice ?? raw.elective_choice ?? null,
    electiveDismissed: raw.electiveDismissed === true || raw.elective_dismissed === true,
    curriculumSection: raw.curriculum_section ?? null,
    requiresSelection,
    electiveGroupId: raw.elective_group_id ?? null,
  }
}

// Walk per-day practicals in slot order and stamp consecutive matching pairs
// with a shared pairId (mirrors the legacy grouping in TimetableGrid.jsx).
function assignPairIds(entries) {
  const byDay = new Map()
  for (const e of entries) {
    if (!byDay.has(e.day)) byDay.set(e.day, [])
    byDay.get(e.day).push(e)
  }
  for (const dayEntries of byDay.values()) {
    const practicals = TIME_SLOTS
      .flatMap((slot) => dayEntries.filter((e) => e.startTime === slot && e.type === 'Practical'))
    let i = 0
    while (i < practicals.length) {
      const cur = practicals[i]
      const next = practicals[i + 1]
      const curIdx = TIME_SLOTS.indexOf(cur.startTime)
      const consecutive =
        next &&
        TIME_SLOTS[curIdx + 1] === next.startTime &&
        next.subject === cur.subject &&
        next.code === cur.code &&
        next.teacher === cur.teacher &&
        next.room === cur.room
      if (consecutive) {
        const pid = nextPairId()
        cur.pairId = pid
        next.pairId = pid
        i += 2
      } else {
        i += 1
      }
    }
  }
  return entries
}

// Bundled snapshot lives in /public/fallback/timetable/<BATCH>.json. Resolved
// relative to Vite's base URL so it keeps working under a sub-path deploy.
const FALLBACK_BASE = `${import.meta.env.BASE_URL || '/'}fallback`.replace(/\/+$/, '')
const fallbackTimetableUrl = (batch) =>
  `${FALLBACK_BASE}/timetable/${encodeURIComponent(batch)}.json`

// status: 'ok' | 'not_found' | 'coming_soon' | 'error' | 'no_backend'
export async function loadTimetable(batch) {
  const baseUrl = getBackendUrl()
  if (baseUrl) {
    const url = `${baseUrl.replace(/\/$/, '')}/timetable/${encodeURIComponent(batch)}`
    const result = await fetchTimetable(url)
    if (result.status === 'ok' || result.status === 'not_found') return result
    // Network/5xx → try the bundled snapshot before giving up.
  }
  return fetchTimetable(fallbackTimetableUrl(batch))
}

// Same shape as loadTimetable, but applies the current user's overrides
// server-side. Signed-in users must not fall back to canonical data because
// that would briefly show a timetable without their personal changes.
export async function loadMyTimetable(batch) {
  const baseUrl = getBackendUrl()
  if (!baseUrl) return { status: 'error', message: 'Backend is not configured' }
  if (!batch) return { status: 'error', message: 'No batch supplied' }
  const root = baseUrl.replace(/\/$/, '')
  const url = `${root}/me/timetable?batch=${encodeURIComponent(batch)}`
  const key = url
  if (myTimetableRequests.has(key)) return myTimetableRequests.get(key)
  const request = authHeaders().then((headers) => fetchTimetable(url, { headers }))
  myTimetableRequests.set(key, request)
  request.finally(() => myTimetableRequests.delete(key))
  return request
}

async function fetchTimetable(url, init = {}) {
  let res
  try {
    res = await fetch(url, init)
  } catch (err) {
    return { status: 'error', message: err?.message || 'Network error' }
  }
  if (res.status === 404) {
    return { status: 'not_found' }
  }
  if (res.status === 503) {
    try {
      const body = await res.clone().json()
      const code = body?.code ?? body?.detail?.code
      if (code === 'first_year_timetable_unavailable') {
        return { status: 'coming_soon', batch: body?.batch ?? body?.detail?.batch ?? '' }
      }
    } catch {
      // Fall through to the normal HTTP error below.
    }
  }
  if (!res.ok) {
    return { status: 'error', message: `Backend returned ${res.status}` }
  }
  let body
  try {
    body = await res.json()
  } catch {
    return { status: 'error', message: 'Invalid JSON from backend' }
  }
  const classes = Array.isArray(body?.classes) ? body.classes : []
  const teacherCodesVisible = body?.teacher_codes_visible === true
  const entries = assignPairIds(classes.map((entry) => adaptEntry(entry, teacherCodesVisible)))
  const canonicalClasses = Array.isArray(body?.canonical_classes)
    ? assignPairIds(body.canonical_classes.map((entry) => adaptEntry(entry, teacherCodesVisible)))
    : entries
  return {
    status: 'ok',
    batch: body?.batch ?? '',
    semester: body?.semester ?? null,
    termStartDate: body?.term_start_date ?? null,
    teacherCodesVisible,
    classes: entries,
    canonicalClasses,
    overridesApplied: typeof body?.overrides_applied === 'number' ? body.overrides_applied : 0,
    personalRevision: typeof body?.personal_revision === 'number' ? body.personal_revision : 0,
    customizationSource: body?.customization_source || 'none',
    staleOverrideIds: Array.isArray(body?.stale_override_ids) ? body.stale_override_ids : [],
    scheduleUpdate: body?.schedule_update && typeof body.schedule_update === 'object'
      ? {
          changedAt: body.schedule_update.changed_at || null,
          sourceFile: body.schedule_update.source_file || null,
          changedCount: Number(body.schedule_update.changed_count || 0),
        }
      : null,
  }
}
