// Atomic per-user timetable customization API.

import { authHeaders } from './identity'
import { getBackendUrl } from './backend_url'

const BASE = getBackendUrl()

function backendDisabled() {
  return !BASE
}

async function responseBody(res) {
  try { return await res.json() } catch { return null }
}

function requestError(res, body, fallback) {
  const detail = body?.detail ?? body
  return Object.assign(
    new Error(detail?.error || detail?.message || fallback || `Request failed (${res.status})`),
    {
      code: detail?.code || `http_${res.status}`,
      status: res.status,
      detail,
    },
  )
}

function entryToBackend(entry, targetId) {
  if (!entry) return null
  const out = { ...entry, class_id: targetId }
  if ('startTime' in out) { out.start_time = out.startTime; delete out.startTime }
  if ('endTime' in out) { out.end_time = out.endTime; delete out.endTime }
  if ('alternateWeekStart' in out) {
    out.alternate_week_start = out.alternateWeekStart
    delete out.alternateWeekStart
  }
  delete out.id
  delete out.pairId
  // Live Curriculum Library projection fields are response metadata, not
  // personal data. The backend recalculates them on every timetable read.
  delete out.curriculumSection
  delete out.requiresSelection
  delete out.electiveGroupId
  return out
}

function recordToOperation(record) {
  const targetId = String(record?.targetId || record?.addId || record?.entry?.id || '')
  if (!targetId) throw Object.assign(new Error('A timetable change has no stable class id'), { code: 'missing_target_id' })
  return {
    kind: record.kind,
    target_id: targetId,
    entry: record.kind === 'delete' ? null : entryToBackend(record.entry, targetId),
  }
}

export async function setDefaultBatch(batch) {
  if (backendDisabled() || !batch) throw Object.assign(new Error('Backend is not configured'), { code: 'no_backend' })
  const res = await fetch(`${BASE}/me/batch`, {
    method: 'POST', headers: await authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ batch }),
  })
  const body = await responseBody(res)
  if (!res.ok) throw requestError(res, body, 'Could not save the default batch')
  return body
}

/** Save one complete local draft in a single revision-checked request. */
export async function syncOverridesToBackend(records, batch, { expectedRevision = 0 } = {}) {
  if (backendDisabled()) throw Object.assign(new Error('Backend is not configured'), { code: 'no_backend' })
  if (!batch) throw Object.assign(new Error('No batch supplied'), { code: 'no_batch' })
  if (!records?.length) return { ok: true, batch, revision: expectedRevision, saved_operations: 0 }
  const res = await fetch(`${BASE}/me/customizations/${encodeURIComponent(batch)}`, {
    method: 'PUT',
    headers: await authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({
      expected_revision: expectedRevision,
      operations: records.map(recordToOperation),
    }),
  })
  const body = await responseBody(res)
  if (!res.ok) throw requestError(res, body, 'Could not save personal timetable')
  console.log(
    `[calendar] personal edit saved (batch ${batch}, rev ${body?.revision}, ` +
    `${body?.saved_operations} ops) → calendar sync: ${body?.calendar_sync ?? 'unknown'}`,
  )
  return body
}

/** Restore the official timetable for one batch, atomically. */
export async function clearMyOverrides(batch, { expectedRevision = 0 } = {}) {
  if (backendDisabled() || !batch) throw Object.assign(new Error('Backend is not configured'), { code: 'no_backend' })
  const url = `${BASE}/me/customizations/${encodeURIComponent(batch)}?expected_revision=${encodeURIComponent(expectedRevision)}`
  const res = await fetch(url, { method: 'DELETE', headers: await authHeaders() })
  const body = await responseBody(res)
  if (!res.ok) throw requestError(res, body, 'Could not restore official timetable')
  return body
}
