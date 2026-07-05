// Client for the backend's /admin/* endpoints.
//
// Auth = Clerk session JWT. The frontend calls
// `await window.Clerk.session.getToken({ template: 'mlsc-admin' })` and
// sends it as `Authorization: Bearer <jwt>`. The backend verifies the
// signature against Clerk's JWKS and checks the verified `email` claim
// against the admin allowlist (env `ADMIN_EMAILS` ∪ AdminEmailDoc).
//
// The Clerk dashboard must have a JWT template named `mlsc-admin` whose
// body is `{ "email": "{{user.primary_email_address}}" }`.

const BACKEND_URL = (import.meta.env.VITE_BACKEND_URL || '').replace(/\/$/, '')
const CLERK_JWT_TEMPLATE = 'mlsc-admin'

export class AdminAuthError extends Error {
  constructor(status, detail) {
    super(detail?.error || `Admin auth error (${status})`)
    this.name = 'AdminAuthError'
    this.status = status
    this.code = detail?.code || 'admin_error'
    this.detail = detail || null
  }
}

export function isAdminEnabled() {
  return Boolean(BACKEND_URL)
}

async function getClerkToken() {
  const clerk = typeof window !== 'undefined' ? window.Clerk : null
  const session = clerk?.session
  if (!session) {
    throw new AdminAuthError(401, {
      error: 'Not signed in. Please sign in with your admin account.',
      code: 'not_signed_in',
    })
  }
  try {
    // Try the dedicated admin template first (carries the verified email).
    const token = await session.getToken({ template: CLERK_JWT_TEMPLATE })
    if (token) return token
  } catch {
    // fall through to default token
  }
  // Fallback: default session token (only works if the user added `email` to
  // the default session token customization).
  const fallback = await session.getToken()
  if (!fallback) {
    throw new AdminAuthError(401, {
      error: 'Could not get a Clerk session token.',
      code: 'no_token',
    })
  }
  return fallback
}

async function parseDetail(res) {
  try {
    const body = await res.json()
    return body?.detail || body
  } catch {
    return null
  }
}

async function adminAuthHeaders() {
  const token = await getClerkToken()
  return { Authorization: `Bearer ${token}` }
}

async function adminFetch(path, opts = {}) {
  if (!BACKEND_URL) {
    throw new AdminAuthError(0, { error: 'Backend URL not configured', code: 'no_backend' })
  }
  const auth = await adminAuthHeaders()
  const headers = {
    Accept: 'application/json',
    ...(opts.headers || {}),
    ...auth,
  }
  if (opts.body && !(opts.body instanceof FormData) && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json'
  }
  const res = await fetch(`${BACKEND_URL}${path}`, { ...opts, headers })
  if (!res.ok) {
    const detail = await parseDetail(res)
    throw new AdminAuthError(res.status, detail)
  }
  if (res.status === 204) return null
  return res.json()
}

export function getWhoami() {
  return adminFetch('/admin/whoami')
}

export function getStats() {
  return adminFetch('/admin/stats')
}

export function getUploads({ limit = 50, status } = {}) {
  const qs = new URLSearchParams()
  qs.set('limit', String(limit))
  if (status) qs.set('status', status)
  return adminFetch(`/admin/uploads?${qs.toString()}`)
}

export function getUpload(id) {
  return adminFetch(`/admin/uploads/${encodeURIComponent(id)}`)
}

export function listAdminUsers() {
  return adminFetch('/admin/users')
}

export function addAdminUser({ email, displayName }) {
  return adminFetch('/admin/users', {
    method: 'POST',
    body: JSON.stringify({ email, display_name: displayName || null }),
  })
}

export function deleteAdminUser(email) {
  return adminFetch(`/admin/users/${encodeURIComponent(email)}`, { method: 'DELETE' })
}

// ── Semester label (current) ──────────────────────────────────────────
export function getCurrent() {
  return adminFetch('/current')
}

export function setCurrent(label) {
  return adminFetch('/admin/current', {
    method: 'PUT',
    body: JSON.stringify({ label }),
  })
}

// ── Baselines ─────────────────────────────────────────────────────────
export function listBaselines() {
  return adminFetch('/baselines')
}

export function setBaseline(key, counts, { courses, schemeSource } = {}) {
  const body = { counts }
  if (Array.isArray(courses)) body.courses = courses
  if (schemeSource) body.scheme_source = schemeSource
  return adminFetch(`/admin/baselines/${encodeURIComponent(key)}`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export function deleteBaseline(key) {
  return adminFetch(`/admin/baselines/${encodeURIComponent(key)}`, { method: 'DELETE' })
}

export function checkBaseline(key) {
  return adminFetch(`/admin/baselines/${encodeURIComponent(key)}/check`, { method: 'POST' })
}

export function syncBaselineCounts() {
  return adminFetch('/admin/baselines/sync-counts', { method: 'POST' })
}

// ── Course-scheme PDF upload ──────────────────────────────────────────
// Parses a Thapar SUGC/SPGC course-scheme PDF and returns/writes the
// per-semester baseline course rosters.
//
// `branch` is either a single letter A–Z (branch code) or one of the
// special selectors "POOL_A" / "POOL_B" for the year-1 pool rotation.
// The backend derives the target key + semester filter from that value —
// pool uploads only touch Sem 1 & 2, pool-following branches skip year 1,
// independent branches (X/G/J/R) write all 8 semesters.
function schemeFormData({ file, branch, merge }) {
  const fd = new FormData()
  fd.append('file', file)
  fd.append('branch', String(branch || '').toUpperCase())
  if (merge !== undefined) fd.append('merge', merge ? 'true' : 'false')
  return fd
}

export function previewScheme({ file, branch }) {
  return adminFetch('/admin/scheme/preview', {
    method: 'POST',
    body: schemeFormData({ file, branch }),
  })
}

export function applyScheme({ file, branch, merge = false }) {
  return adminFetch('/admin/scheme/apply', {
    method: 'POST',
    body: schemeFormData({ file, branch, merge }),
  })
}

// Apply a hand-edited scheme plan (no PDF re-parse). Companion to
// `applyScheme` for the edit-in-modal flow: after previewing a PDF the
// admin can tweak the parsed course rosters row-by-row, then send the
// edited plan as JSON.
//
// `plan` shape: `[{ baseline_key, semester?, courses: [{code, title, category, L, T, P, Cr}] }, ...]`
export function applySchemePlan({ plan, source, merge = false }) {
  return adminFetch('/admin/scheme/apply-plan', {
    method: 'POST',
    body: JSON.stringify({
      plan,
      source: source || undefined,
      merge: !!merge,
    }),
  })
}

// ── Contributors ──────────────────────────────────────────────────────
export function listContributors() {
  return adminFetch('/contributors')
}

export function addContributor({ username, displayName }) {
  return adminFetch('/admin/contributors', {
    method: 'POST',
    body: JSON.stringify({ username, display_name: displayName || null }),
  })
}

export function deleteContributor(username) {
  return adminFetch(`/admin/contributors/${encodeURIComponent(username)}`, { method: 'DELETE' })
}

// ── Announcements ─────────────────────────────────────────────────────
export function listAnnouncements() {
  return adminFetch('/announcements')
}

export function addAnnouncement({ title, body, severity, postedAt, link } = {}) {
  return adminFetch('/admin/announcements', {
    method: 'POST',
    body: JSON.stringify({
      title,
      body,
      severity: severity || 'info',
      posted_at: postedAt || undefined,
      link: link || undefined,
    }),
  })
}

export function deleteAnnouncement(id) {
  return adminFetch(`/admin/announcements/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

export function resetAnnouncements() {
  return adminFetch('/admin/announcements/reset', { method: 'POST' })
}

// ── Exam dates ────────────────────────────────────────────────────────
export function listExamDates() {
  return adminFetch('/exam-dates')
}

export function addExamDate({ subject, code, date, slot, type, room, targetYear } = {}) {
  return adminFetch('/admin/exam-dates', {
    method: 'POST',
    body: JSON.stringify({
      subject,
      code,
      date,
      slot: slot || undefined,
      type: type || undefined,
      room: room || undefined,
      target_year: targetYear == null ? null : Number(targetYear),
    }),
  })
}

export function deleteExamDate(id) {
  return adminFetch(`/admin/exam-dates/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

export function resetExamDates() {
  return adminFetch('/admin/exam-dates/reset', { method: 'POST' })
}

// ── Calendar overrides ─────────────────────────────────────────────────
// Overrides drive the mini-calendar in the sidebar: mark a date as a
// holiday (with optional reason) or make it follow another weekday's
// timetable. Scope is one of `global` | `year` | `branch`; when scope is
// `year` or `branch`, `scopeValues` must be non-empty (e.g. ['1','2'] or
// ['2A','1E']).
export function listCalendarOverrides() {
  // Public GET returns all rows when no batch is supplied — perfect for
  // admin listing since the admin panel shouldn't be batch-scoped.
  return adminFetch('/calendar-overrides')
}

function toOverridePayload({ date, kind, reason, followsDay, scope, scopeValues } = {}) {
  return {
    date,
    kind,
    reason: reason ? String(reason).trim() : null,
    follows_day: kind === 'follow_day' ? Number(followsDay) : null,
    scope: scope || 'global',
    scope_values: Array.isArray(scopeValues)
      ? scopeValues.map((v) => String(v).trim().toUpperCase()).filter(Boolean)
      : [],
  }
}

export function addCalendarOverride(input = {}) {
  return adminFetch('/admin/calendar-overrides', {
    method: 'POST',
    body: JSON.stringify(toOverridePayload(input)),
  })
}

export function updateCalendarOverride(id, input = {}) {
  return adminFetch(`/admin/calendar-overrides/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify(toOverridePayload(input)),
  })
}

export function deleteCalendarOverride(id) {
  return adminFetch(`/admin/calendar-overrides/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  })
}

export function resetCalendarOverrides() {
  return adminFetch('/admin/calendar-overrides/reset', { method: 'POST' })
}

// ── Calendar PDF parser ────────────────────────────────────────────────
// Parses a Thapar academic-calendar PDF and returns a preview of the
// calendar overrides that would be written (holidays + follow-day rules
// + ambiguous cells surfaced as warnings).
export function previewCalendarPdf({ file }) {
  const fd = new FormData()
  fd.append('file', file)
  return adminFetch('/admin/calendar/preview', {
    method: 'POST',
    body: fd,
  })
}

// Apply a hand-edited calendar plan (no PDF re-parse). `plan` is the
// array of override rows the admin confirmed in the review dialog.
// `scope` + `scopeValues` are applied uniformly to every row; use
// `replaceRange` for idempotent re-uploads — every existing override
// whose date falls in [start, end] AND matches the same scope is
// deleted before the fresh plan is inserted.
export function applyCalendarPlan({
  plan,
  scope = 'global',
  scopeValues = [],
  replaceRange = null,
  source = null,
}) {
  return adminFetch('/admin/calendar/apply-plan', {
    method: 'POST',
    body: JSON.stringify({
      plan,
      scope,
      scope_values: Array.isArray(scopeValues)
        ? scopeValues.map((v) => String(v).trim().toUpperCase()).filter(Boolean)
        : [],
      replace_range: replaceRange || undefined,
      source: source || undefined,
    }),
  })
}

// ── Change requests ───────────────────────────────────────────────────
export function listChangeRequests({ status, limit = 100 } = {}) {
  const qs = new URLSearchParams()
  qs.set('limit', String(limit))
  if (status) qs.set('status', status)
  return adminFetch(`/admin/change-requests?${qs.toString()}`)
}

export function approveChangeRequest(id, note) {
  return adminFetch(`/admin/change-requests/${encodeURIComponent(id)}/approve`, {
    method: 'POST',
    body: JSON.stringify(note ? { note } : {}),
  })
}

export function rejectChangeRequest(id, note) {
  return adminFetch(`/admin/change-requests/${encodeURIComponent(id)}/reject`, {
    method: 'POST',
    body: JSON.stringify(note ? { note } : {}),
  })
}

export async function uploadTimetable({ file, semester, sheet = 'all', force = false, onProgress } = {}) {
  if (!file) throw new Error('file required')
  if (!semester) throw new Error('semester required')
  if (!BACKEND_URL) {
    throw new AdminAuthError(0, { error: 'Backend URL not configured', code: 'no_backend' })
  }

  const auth = await adminAuthHeaders()

  // XHR for progress events; fetch() doesn't expose upload progress in browsers.
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    const fd = new FormData()
    fd.append('file', file)
    fd.append('semester', semester)
    fd.append('sheet', sheet)
    if (force) fd.append('force', 'true')
    xhr.open('POST', `${BACKEND_URL}/admin/ingest`)
    Object.entries(auth).forEach(([k, v]) => xhr.setRequestHeader(k, v))
    xhr.setRequestHeader('Accept', 'application/json')
    if (typeof onProgress === 'function' && xhr.upload) {
      xhr.upload.onprogress = (evt) => {
        if (evt.lengthComputable) {
          onProgress(evt.loaded / evt.total)
        }
      }
    }
    xhr.onload = () => {
      let body = null
      try {
        body = xhr.responseText ? JSON.parse(xhr.responseText) : null
      } catch {
        // leave body null
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(body)
      } else {
        reject(new AdminAuthError(xhr.status, body?.detail || body))
      }
    }
    xhr.onerror = () => reject(new AdminAuthError(0, { error: 'Network error', code: 'network_error' }))
    xhr.send(fd)
  })
}

// ── Ingest cooldown + rollback ───────────────────────────────────────────
export function getIngestCooldown() {
  return adminFetch('/admin/ingest/cooldown')
}

export function getRollbackMeta() {
  return adminFetch('/admin/ingest/rollback')
}

export function performRollback() {
  return adminFetch('/admin/ingest/rollback', { method: 'POST' })
}

// ── Parsing errors / Fix tab ─────────────────────────────────────────────
export function listErrors({ status, uploadId, errorType, batchCode, limit } = {}) {
  const params = new URLSearchParams()
  if (status) params.set('status', status)
  if (uploadId) params.set('upload_id', uploadId)
  if (errorType) params.set('error_type', errorType)
  if (batchCode) params.set('batch_code', batchCode)
  if (limit) params.set('limit', String(limit))
  const qs = params.toString()
  return adminFetch(`/admin/errors${qs ? `?${qs}` : ''}`)
}

export function getErrorsSummary({ uploadId } = {}) {
  const qs = uploadId ? `?upload_id=${encodeURIComponent(uploadId)}` : ''
  return adminFetch(`/admin/errors/summary${qs}`)
}

export function resolveError(id, note) {
  return adminFetch(`/admin/errors/${encodeURIComponent(id)}/resolve`, {
    method: 'POST',
    body: JSON.stringify(note ? { note } : {}),
  })
}

export function ignoreError(id, note) {
  return adminFetch(`/admin/errors/${encodeURIComponent(id)}/ignore`, {
    method: 'POST',
    body: JSON.stringify(note ? { note } : {}),
  })
}

export function reopenError(id) {
  return adminFetch(`/admin/errors/${encodeURIComponent(id)}/reopen`, {
    method: 'POST',
  })
}

export function bulkErrors({ ids, action }) {
  return adminFetch('/admin/errors/bulk', {
    method: 'POST',
    body: JSON.stringify({ ids, action }),
  })
}

export function backfillBaselineErrors() {
  return adminFetch('/admin/errors/backfill-baselines', { method: 'POST' })
}

// ── Timetable editor (Fix grid) ──────────────────────────────────────────
export function getAdminTimetable(batch) {
  return adminFetch(`/admin/timetables/${encodeURIComponent(batch)}`)
}

export function patchAdminTimetable(batch, payload) {
  return adminFetch(`/admin/timetables/${encodeURIComponent(batch)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })
}

// ── Subject catalog (DB-backed) ──────────────────────────────────────────
export function listSubjects({ q, source, limit = 500 } = {}) {
  const qs = new URLSearchParams()
  if (q) qs.set('q', q)
  if (source) qs.set('source', source)
  if (limit) qs.set('limit', String(limit))
  const s = qs.toString()
  return adminFetch(`/admin/subjects${s ? `?${s}` : ''}`)
}

export function addSubject({ code, name, aliases, note } = {}) {
  return adminFetch('/admin/subjects', {
    method: 'POST',
    body: JSON.stringify({ code, name, aliases, note }),
  })
}

export function patchSubject(code, { name, aliases, note } = {}) {
  return adminFetch(`/admin/subjects/${encodeURIComponent(code)}`, {
    method: 'PATCH',
    body: JSON.stringify({ name, aliases, note }),
  })
}

export function deleteSubject(code, { force = false } = {}) {
  return adminFetch(`/admin/subjects/${encodeURIComponent(code)}${force ? '?force=true' : ''}`, {
    method: 'DELETE',
  })
}

export function bulkSubjects(items) {
  return adminFetch('/admin/subjects/bulk', {
    method: 'POST',
    body: JSON.stringify({ items }),
  })
}

export function backfillTimetablesAgainstCatalog() {
  return adminFetch('/admin/subjects/backfill-timetables', { method: 'POST' })
}
