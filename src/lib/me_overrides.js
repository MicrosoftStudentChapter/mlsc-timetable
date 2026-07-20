// Per-user override sync against the backend.
//
// The backend stores one `OverrideDoc` per (user, semester) with entries
// keyed by `${day}|${start_time}`. This module is the thin client wrapper:
// PUT/DELETE the user's personal overrides as they edit, so the next device
// they open the timetable on sees the same view.
//
// All calls are best-effort. If the backend is down, offline, or the user
// is anonymous (no VITE_BACKEND_URL), we silently no-op; localStorage is
// the source of truth for rendering.

import { authHeaders } from './identity'
import { getBackendUrl } from './backend_url'

const BASE = getBackendUrl()

function backendDisabled() {
  return !BASE
}

function entryToBackend(entry) {
  if (!entry) return null
  // Backend ClassEntry is snake_case; the grid uses camelCase.
  const out = { ...entry }
  if ('startTime' in out) { out.start_time = out.startTime; delete out.startTime }
  if ('endTime' in out)   { out.end_time   = out.endTime;   delete out.endTime }
  // Drop fields the backend schema doesn't accept.
  delete out.id
  delete out.pairId
  return out
}

/**
 * PUT /me/overrides/{day}/{slot}
 *   body = { kind: 'add'|'edit'|'delete'|'elective_pick', entry: ClassEntry|null }
 * Resolves true on 2xx, false otherwise (including network failures).
 */
export async function putMyOverride({ day, startTime, kind, entry }) {
  if (backendDisabled()) return false
  try {
    const url = `${BASE}/me/overrides/${encodeURIComponent(day)}/${encodeURIComponent(startTime)}`
    const res = await fetch(url, {
      method: 'PUT',
      headers: await authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        kind,
        entry: kind === 'delete' ? null : entryToBackend(entry),
      }),
    })
    return res.ok
  } catch {
    return false
  }
}

/** DELETE /me/overrides/{day}/{slot} — removes the user's override at that slot. */
export async function deleteMyOverride({ day, startTime }) {
  if (backendDisabled()) return false
  try {
    const url = `${BASE}/me/overrides/${encodeURIComponent(day)}/${encodeURIComponent(startTime)}`
    const res = await fetch(url, {
      method: 'DELETE',
      headers: await authHeaders(),
    })
    return res.ok
  } catch {
    return false
  }
}

/**
 * Push a list of frontend override records to the backend.
 * Maps each record to the appropriate PUT or DELETE call.
 *
 *   record shape: { kind, day, startTime, entry?, targetId? }
 */
export async function syncOverridesToBackend(records) {
  if (!records || records.length === 0 || backendDisabled()) return
  await Promise.all(records.map(async (rec) => {
    if (!rec || !rec.kind) return
    if (rec.kind === 'delete') {
      await deleteMyOverride({ day: rec.day, startTime: rec.startTime })
      return
    }
    await putMyOverride({
      day: rec.day,
      startTime: rec.startTime,
      kind: rec.kind,
      entry: rec.entry,
    })
  }))
}
