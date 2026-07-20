// Submits a crowd-sourced edit to the backend for admin review.
//
// POST ${VITE_BACKEND_URL}/change-requests
//   body: { requester_batch, scope, kind, day, start_time, entry? }
//
// `entry` is converted from the grid's camelCase shape (startTime/endTime) to
// the backend's snake_case ClassEntry. Returns the server payload on success.
//
// The endpoint is heavily rate-limited server-side (slowapi: 5/min, 30/hour,
// 100/day per uid|ip + storage-layer quotas). Callers should surface the
// `code` field of the error to the user when status is 4xx so they get a
// meaningful "too many submissions" / "duplicate" message.

import { authHeaders } from './identity'
import { getBackendUrl } from './backend_url'

function entryToBackend(entry) {
  if (!entry) return null
  return {
    day: entry.day,
    start_time: entry.startTime,
    end_time: entry.endTime,
    subject: entry.subject,
    code: entry.code,
    type: entry.type,
    room: entry.room,
  }
}

export function classPrefixOf(batch) {
  if (!batch || typeof batch !== 'string') return ''
  return batch.slice(0, 3).toUpperCase()
}

export async function submitChangeRequest({
  requesterBatch,
  scope,
  kind,
  day,
  startTime,
  entry = null,
}) {
  const baseUrl = getBackendUrl()
  if (!baseUrl) {
    throw Object.assign(new Error('Backend not configured'), { code: 'no_backend' })
  }
  const url = `${baseUrl.replace(/\/$/, '')}/change-requests`
  let res
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: await authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        requester_batch: requesterBatch,
        scope,
        kind,
        day,
        start_time: startTime,
        entry: entryToBackend(entry),
      }),
    })
  } catch (cause) {
    throw Object.assign(new Error('Network error'), { code: 'network', cause })
  }
  let body = null
  try { body = await res.json() } catch { /* non-JSON */ }
  if (!res.ok) {
    const detail = body?.detail ?? body
    const code = detail?.code || body?.code || `http_${res.status}`
    const message = detail?.error || detail?.message || body?.error || `Request failed (${res.status})`
    throw Object.assign(new Error(message), { code, status: res.status, detail })
  }
  return body
}
