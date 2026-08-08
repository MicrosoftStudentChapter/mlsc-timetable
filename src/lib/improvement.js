// Improvement (course re-take) planning.
//
//   GET  /improvement/courses?batch=          what this student may repeat
//   POST /improvement/plan {batch, codes[]}   ranked batches + combined plans
//
// `/plan` folds in the caller's saved elective picks when a Clerk token is
// present, which narrows their committed slots — so always send auth headers.

import { authHeaders } from './identity'
import { getBackendUrl } from './backend_url'

const BATCH_KEY = 'mlsc.improvement.batch'

function base() {
  const url = getBackendUrl()
  return url ? `${url.replace(/\/+$/, '')}/improvement` : ''
}

function fail(response) {
  if (response.status === 404) return { status: 'not_found', message: 'Unknown batch' }
  return { status: 'error', message: `Request failed (${response.status})` }
}

export async function loadCourses(batch) {
  const root = base()
  if (!root) return { status: 'no_backend', message: 'Backend is not configured' }
  let response
  try {
    response = await fetch(`${root}/courses?batch=${encodeURIComponent(batch)}`)
  } catch (err) {
    return { status: 'error', message: err?.message || 'Network error' }
  }
  if (!response.ok) return fail(response)
  try {
    return { status: 'ok', data: await response.json() }
  } catch {
    return { status: 'error', message: 'Invalid response' }
  }
}

export async function planImprovements(batch, codes) {
  const root = base()
  if (!root) return { status: 'no_backend', message: 'Backend is not configured' }
  let response
  try {
    response = await fetch(`${root}/plan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
      body: JSON.stringify({ batch, codes }),
    })
  } catch (err) {
    return { status: 'error', message: err?.message || 'Network error' }
  }
  if (!response.ok) {
    // The backend explains refusals (no earlier semester, unknown batch) in
    // detail.error; surface that rather than a bare status code.
    try {
      const body = await response.json()
      const message = body?.detail?.error || body?.error
      if (message) return { status: 'error', message }
    } catch {
      // fall through
    }
    return fail(response)
  }
  try {
    return { status: 'ok', data: await response.json() }
  } catch {
    return { status: 'error', message: 'Invalid response' }
  }
}

// ── Remembering the student's batch ──────────────────────────────────────
// The flow asks for a batch only when we do not already know one: signed-in
// students already told us on their profile, and everyone else is remembered
// locally after they answer once.
export function rememberBatch(batch) {
  try {
    window.localStorage.setItem(BATCH_KEY, String(batch || '').toUpperCase())
  } catch {
    // storage disabled; the value simply is not remembered
  }
}

export function recallBatch() {
  try {
    const saved = window.Clerk?.user?.unsafeMetadata?.batch
    if (saved) return String(saved).toUpperCase()
  } catch {
    // Clerk may not be loaded, or auth may be disabled entirely.
  }
  try {
    const explicit = window.localStorage.getItem(BATCH_KEY)
    if (explicit) return explicit.toUpperCase()
  } catch {
    // ignore
  }
  return ''
}

export function severityClass(severity) {
  const value = String(severity || '').toLowerCase()
  if (value === 'practical') return 'blocking'
  if (value === 'tutorial') return 'warn'
  return 'mild'
}
