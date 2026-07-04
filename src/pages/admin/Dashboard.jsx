// Admin dashboard.
//
// Top: 4 stat cards (batches, uploads, failed/partial, total errors).
// Middle: Upload dropzone | live open-errors log.
// Bottom: Parsing accuracy donut.

import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  getStats,
  uploadTimetable,
  getCurrent,
  setCurrent,
  listAnnouncements,
  addAnnouncement,
  deleteAnnouncement,
  listExamDates,
  addExamDate,
  deleteExamDate,
  getIngestCooldown,
  getErrorsSummary,
  AdminAuthError,
} from '../../lib/admin'
import './admin.css'

function fmtCooldown(seconds) {
  if (!seconds || seconds <= 0) return 'a moment'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

function StatCard({ label, value, accent, sub }) {
  return (
    <div className={`stat-card stat-card--${accent}`}>
      <span className="stat-card-label">{label}</span>
      <span className="stat-card-value">{value}</span>
      {sub && <span className="stat-card-sub">{sub}</span>}
    </div>
  )
}

function ErrorLog({ summary, status, onRefresh, refreshing }) {
  const totals = summary?.totals || { open: 0, resolved: 0, ignored: 0 }
  const byType = (summary?.by_type || []).filter((t) => (t.open || 0) > 0)
  const grandOpen = totals.open || 0
  return (
    <div className="admin-card">
      <div className="admin-card-header" style={{ alignItems: 'center' }}>
        <h2 className="admin-card-title" style={{ textAlign: 'left' }}>
          Open parsing errors
          {grandOpen > 0 && <span className="dash-err-count">{grandOpen}</span>}
        </h2>
        <button
          type="button"
          className="admin-card-action"
          onClick={onRefresh}
          disabled={refreshing}
        >
          {refreshing ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>
      <p className="admin-card-sub" style={{ textAlign: 'left', marginBottom: 14 }}>
        {grandOpen > 0
          ? `${byType.length} error type${byType.length === 1 ? '' : 's'} across your timetables. Click a row to triage on the Fix tab.`
          : 'Live view — rows disappear as you resolve or ignore them from the Fix tab.'}
      </p>

      <div className="dash-err-log">
        {status === 'loading' && (
          <div className="error-log-empty">Loading…</div>
        )}
        {status === 'ready' && byType.length === 0 && (
          <div className="error-log-empty">
            No open parsing errors. 🎉
          </div>
        )}
        {status === 'ready' && byType.map((t) => {
          const total = t.total || (t.open + t.resolved + t.ignored)
          const resolvedPct = total > 0 ? Math.round((t.resolved / total) * 100) : 0
          return (
            <Link
              key={t.error_type}
              to={`/admin/fix?type=${encodeURIComponent(t.error_type)}`}
              className="dash-err-type-row"
            >
              <span className="dash-err-type-count">{t.open}</span>
              <code className="dash-err-type" title={t.error_type}>{t.error_type}</code>
              <span className="dash-err-type-meta">
                {resolvedPct > 0 && (
                  <span className="dash-err-type-resolved" title={`${t.resolved} already resolved`}>
                    {resolvedPct}% done
                  </span>
                )}
                {t.ignored > 0 && (
                  <span className="dash-err-type-ignored" title={`${t.ignored} ignored`}>
                    · {t.ignored} ignored
                  </span>
                )}
              </span>
              <span className="dash-err-type-arrow">→</span>
            </Link>
          )
        })}
      </div>
    </div>
  )
}

function AccuracyDonut({ pct }) {
  const value = typeof pct === 'number' ? pct : 0
  const radius = 64
  const circumference = 2 * Math.PI * radius
  const dash = (value / 100) * circumference
  const rest = circumference - dash

  return (
    <div className="admin-card accuracy-card">
      <h2 className="admin-card-title">Parsing accuracy</h2>
      <div className="donut-wrap">
        <svg viewBox="0 0 160 160" width="180" height="180">
          <circle
            cx="80"
            cy="80"
            r={radius}
            fill="none"
            stroke="rgba(255,255,255,0.07)"
            strokeWidth="14"
          />
          <circle
            cx="80"
            cy="80"
            r={radius}
            fill="none"
            stroke="#3b82f6"
            strokeWidth="14"
            strokeDasharray={`${dash} ${rest}`}
            strokeDashoffset={circumference / 4}
            strokeLinecap="round"
            transform="rotate(-90 80 80)"
          />
        </svg>
        <span className="donut-label">{typeof pct === 'number' ? `${Math.round(value)}%` : '—'}</span>
      </div>
      <div className="donut-legend">
        <span className="donut-legend-dot" />
        Parsed — {typeof pct === 'number' ? `${Math.round(value)}%` : 'n/a'}
      </div>
    </div>
  )
}

function UploadCard({ onUploaded }) {
  const navigate = useNavigate()
  const [file, setFile] = useState(null)
  const [semester, setSemester] = useState('')
  const [sheet, setSheet] = useState('all')
  const [force, setForce] = useState(false)
  const [progress, setProgress] = useState(0)
  const [uploading, setUploading] = useState(false)
  const [result, setResult] = useState(null)
  const [dragging, setDragging] = useState(false)
  const [cooldown, setCooldown] = useState(null)
  const [ingestModal, setIngestModal] = useState(null) // { data, summary } | null

  useEffect(() => {
    let alive = true
    getIngestCooldown()
      .then((d) => { if (alive) setCooldown(d) })
      .catch(() => { if (alive) setCooldown(null) })
    return () => { alive = false }
  }, [])

  const cooldownActive = !force && cooldown?.active === true

  function onPick(evt) {
    const f = evt.target.files?.[0] || null
    setFile(f)
    setResult(null)
  }

  function onDrop(evt) {
    evt.preventDefault()
    setDragging(false)
    const f = evt.dataTransfer.files?.[0]
    if (f) {
      setFile(f)
      setResult(null)
    }
  }

  async function submit(evt) {
    evt.preventDefault()
    if (!file || !semester.trim() || uploading) return
    setUploading(true)
    setProgress(0)
    setResult(null)
    try {
      const data = await uploadTimetable({
        file,
        semester: semester.trim(),
        sheet: sheet.trim() || 'all',
        force,
        onProgress: setProgress,
      })
      setResult({ kind: data?.status || 'ok', data })
      if (onUploaded) onUploaded()
      // Post-ingest triage prompt: fetch an updated error summary and open
      // a custom modal so the admin can act (or dismiss) without a browser
      // confirm() interrupting them.
      let summary = null
      try {
        summary = await getErrorsSummary()
      } catch {
        // ignore summary fetch failures — the modal still renders with counts
        // taken from the ingest response.
      }
      setIngestModal({ data, summary })
    } catch (err) {
      const detail = err instanceof AdminAuthError ? err.detail : null
      setResult({
        kind: 'failed',
        message: detail?.error || err.message || 'Upload failed',
        code: detail?.code,
        retry_after_seconds: detail?.retry_after_seconds,
      })
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="admin-card">
      <h2 className="admin-card-title">Upload semester timetable</h2>
      <form className="upload-form" onSubmit={submit}>
        <label
          className={`dropzone${dragging ? ' is-active' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
        >
          <input
            type="file"
            accept=".xlsx,.xlsm"
            style={{ display: 'none' }}
            onChange={onPick}
          />
          {file ? (
            <span className="dropzone-filename">{file.name}</span>
          ) : (
            <>
              Drop the semester <code>.xlsx</code> workbook here,
              <br />or click to browse
            </>
          )}
        </label>

        <div>
          <label htmlFor="upload-semester">Semester label</label>
          <input
            id="upload-semester"
            type="text"
            className="upload-input"
            placeholder="e.g. JAN-MAY 2026"
            value={semester}
            onChange={(e) => setSemester(e.target.value)}
            required
          />
        </div>

        <div>
          <label htmlFor="upload-sheet">Sheet selector</label>
          <input
            id="upload-sheet"
            type="text"
            className="upload-input"
            placeholder="all"
            value={sheet}
            onChange={(e) => setSheet(e.target.value)}
          />
        </div>

        <button
          type="submit"
          className="upload-btn"
          disabled={!file || !semester.trim() || uploading || cooldownActive}
        >
          {uploading ? 'Uploading…' : cooldownActive ? 'On cooldown' : 'Upload semester timetable'}
        </button>

        {cooldown?.active && (
          <div className="upload-cooldown">
            <span>
              ⏱️ Cooldown active. Next ingest available in{' '}
              <strong>{fmtCooldown(cooldown.retry_after_seconds)}</strong>{' '}
              (last ingest: {cooldown.last_ingest_at ? new Date(cooldown.last_ingest_at).toLocaleString() : '—'}).
            </span>
            <label className="upload-force">
              <input
                type="checkbox"
                checked={force}
                onChange={(e) => setForce(e.target.checked)}
              />
              <span>Force (bypass cooldown)</span>
            </label>
          </div>
        )}

        {uploading && (
          <div className="upload-progress">
            <div style={{ width: `${Math.round(progress * 100)}%` }} />
          </div>
        )}

        {result && result.kind && (
          <div className={`upload-result ${result.kind === 'ok' ? 'ok' : result.kind === 'partial' ? 'partial' : 'failed'}`}>
            {result.kind === 'failed' ? (
              <>Upload failed: {result.message}</>
            ) : (
              <>
                Status: <strong>{result.kind}</strong>
                {result.data?.batches != null && (
                  <> · {result.data.batches} batches · {result.data.classes} classes</>
                )}
                {typeof result.data?.error_count === 'number' && (
                  <> · {result.data.error_count} parser warnings</>
                )}
              </>
            )}
          </div>
        )}
      </form>

      {ingestModal && (
        <IngestResultModal
          data={ingestModal.data}
          summary={ingestModal.summary}
          onClose={() => setIngestModal(null)}
          onReview={() => {
            setIngestModal(null)
            navigate('/admin/fix')
          }}
        />
      )}
    </div>
  )
}

function IngestResultModal({ data, summary, onClose, onReview }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const status  = data?.status || (data?.ok ? 'ok' : 'partial')
  const doctor  = data?.doctor || null
  const batches = data?.batches ?? 0
  const classes = data?.classes ?? 0
  const sheets  = Array.isArray(data?.sheets_used) ? data.sheets_used : []
  const openCount = summary?.totals?.open || 0
  const topTypes  = (summary?.by_type || [])
    .filter((t) => (t.open || 0) > 0)
    .slice(0, 5)

  const hasIssues = openCount > 0 || (doctor && doctor.mismatched_groups > 0)
  const tone = status === 'failed' ? 'failed' : hasIssues ? 'partial' : 'ok'
  const icon = tone === 'ok' ? '✓' : tone === 'partial' ? '!' : '×'
  const title =
    tone === 'ok'
      ? 'Ingest successful'
      : tone === 'partial'
        ? 'Ingest complete — review needed'
        : 'Ingest failed'

  return (
    <div className="fix-modal-backdrop" onClick={onClose}>
      <div
        className={`ingest-modal ingest-modal--${tone}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="ingest-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="ingest-modal-head">
          <div className={`ingest-modal-icon ingest-modal-icon--${tone}`}>{icon}</div>
          <div>
            <h2 id="ingest-modal-title">{title}</h2>
            <p className="ingest-modal-sub">
              Semester <strong>{data?.semester || '—'}</strong>
              {sheets.length > 0 && <> · {sheets.length} sheet{sheets.length === 1 ? '' : 's'} parsed</>}
            </p>
          </div>
          <button
            type="button"
            className="fix-modal-x"
            aria-label="Close"
            onClick={onClose}
          >
            ×
          </button>
        </div>

        <div className="ingest-modal-stats">
          <div className="ingest-stat">
            <span className="ingest-stat-value">{batches}</span>
            <span className="ingest-stat-label">Batches</span>
          </div>
          <div className="ingest-stat">
            <span className="ingest-stat-value">{classes.toLocaleString()}</span>
            <span className="ingest-stat-label">Classes</span>
          </div>
          {doctor && (
            <div className="ingest-stat">
              <span className="ingest-stat-value">
                {doctor.consistent_groups}<span className="ingest-stat-denom">/{doctor.total_groups}</span>
              </span>
              <span className="ingest-stat-label">Groups consistent</span>
            </div>
          )}
          <div className={`ingest-stat${openCount > 0 ? ' ingest-stat--warn' : ''}`}>
            <span className="ingest-stat-value">{openCount}</span>
            <span className="ingest-stat-label">Open issues</span>
          </div>
        </div>

        {topTypes.length > 0 && (
          <div className="ingest-modal-types">
            <div className="ingest-modal-types-title">Top error types</div>
            <ul>
              {topTypes.map((t) => (
                <li key={t.error_type}>
                  <span className="ingest-type-count">{t.open}</span>
                  <code>{t.error_type}</code>
                </li>
              ))}
              {(summary?.by_type || []).length > topTypes.length && (
                <li className="ingest-type-more">
                  +{(summary.by_type.length - topTypes.length)} more type{summary.by_type.length - topTypes.length === 1 ? '' : 's'}
                </li>
              )}
            </ul>
          </div>
        )}

        <div className="ingest-modal-foot">
          <button
            type="button"
            className="ingest-btn ingest-btn--ghost"
            onClick={onClose}
          >
            {hasIssues ? 'Dismiss' : 'Done'}
          </button>
          {hasIssues && (
            <button
              type="button"
              className="ingest-btn ingest-btn--primary"
              onClick={onReview}
              autoFocus
            >
              Review {openCount > 0 ? `${openCount} issue${openCount === 1 ? '' : 's'}` : 'ingest'} →
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function SemesterLabelCard() {
  const [label, setLabel] = useState('')
  const [original, setOriginal] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [result, setResult] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setResult(null)
    try {
      const data = await getCurrent()
      const next = data?.label || ''
      setLabel(next)
      setOriginal(next)
    } catch (err) {
      // 503 data_missing is normal before first ingest.
      const detail = err instanceof AdminAuthError ? err.detail : null
      if (detail?.code !== 'data_missing') {
        setResult({ kind: 'failed', message: detail?.error || err.message })
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function onSubmit(evt) {
    evt.preventDefault()
    const next = label.trim()
    if (!next || saving || next === original) return
    setSaving(true)
    setResult(null)
    try {
      const data = await setCurrent(next)
      setOriginal(data?.label || next)
      setResult({ kind: 'ok', message: `Semester label set to "${data?.label || next}".` })
    } catch (err) {
      const detail = err instanceof AdminAuthError ? err.detail : null
      setResult({ kind: 'failed', message: detail?.error || err.message })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="admin-card">
      <h2 className="admin-card-title">Semester label</h2>
      <p className="admin-card-sub" style={{ marginBottom: 12 }}>
        Shown on the landing page's brand card. Drives the doctor's
        E/O baseline prefix.
      </p>
      <form className="upload-form" onSubmit={onSubmit}>
        <div>
          <label htmlFor="semester-label">Current label</label>
          <input
            id="semester-label"
            type="text"
            className="upload-input"
            placeholder={loading ? 'Loading…' : 'e.g. EVEN 25-26'}
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            disabled={loading || saving}
            required
          />
        </div>
        <button
          type="submit"
          className="upload-btn"
          disabled={saving || loading || !label.trim() || label.trim() === original}
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        {result && (
          <div className={`upload-result ${result.kind === 'ok' ? 'ok' : 'failed'}`}>
            {result.message}
          </div>
        )}
      </form>
    </div>
  )
}

function errMessage(err) {
  if (err instanceof AdminAuthError) return err.detail?.error || err.message
  return err?.message || 'Unknown error'
}

function formatPostedAt(value) {
  if (!value) return ''
  try {
    return new Date(value).toLocaleString(undefined, {
      year: 'numeric', month: 'short', day: '2-digit',
      hour: '2-digit', minute: '2-digit',
    })
  } catch { return value }
}

const SEVERITY_LABEL = { info: 'Info', warn: 'Warning', critical: 'Critical' }

function AnnouncementsCard() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [removing, setRemoving] = useState(null)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [severity, setSeverity] = useState('info')
  const [link, setLink] = useState('')

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await listAnnouncements()
      setItems(Array.isArray(data) ? data : [])
    } catch (err) {
      setError(err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { refresh() }, [refresh])

  async function onSubmit(evt) {
    evt.preventDefault()
    if (!title.trim() || !body.trim() || submitting) return
    setSubmitting(true)
    setError(null)
    try {
      await addAnnouncement({
        title: title.trim(),
        body: body.trim(),
        severity,
        link: link.trim() || undefined,
      })
      setTitle(''); setBody(''); setLink(''); setSeverity('info')
      await refresh()
    } catch (err) {
      setError(err)
    } finally {
      setSubmitting(false)
    }
  }

  async function onRemove(id) {
    if (!window.confirm('Delete this announcement?')) return
    setRemoving(id)
    try {
      await deleteAnnouncement(id)
      await refresh()
    } catch (err) {
      setError(err)
    } finally {
      setRemoving(null)
    }
  }

  return (
    <div className="admin-card manager-card">
      <div className="admin-card-header" style={{ alignItems: 'center' }}>
        <h2 className="admin-card-title" style={{ textAlign: 'left' }}>Announcements</h2>
        <button type="button" className="admin-card-action" onClick={refresh} disabled={loading}>
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>
      <p className="admin-card-sub" style={{ textAlign: 'left', marginBottom: 12 }}>
        Shown on the public sidebar, latest first.
      </p>

      {error && (
        <div className="upload-result failed" style={{ marginBottom: 10 }}>{errMessage(error)}</div>
      )}

      <ul className="manager-list" aria-label="Announcements">
        {loading && <li className="manager-empty">Loading…</li>}
        {!loading && items.length === 0 && (
          <li className="manager-empty">No announcements yet.</li>
        )}
        {!loading && items.map((a) => (
          <li key={a.id} className="manager-row">
            <span className={`manager-sev sev-${a.severity || 'info'}`} aria-label={SEVERITY_LABEL[a.severity] || 'Info'} />
            <div className="manager-row-body">
              <div className="manager-row-title">{a.title}</div>
              <div className="manager-row-sub">{a.body}</div>
              <div className="manager-row-meta">
                {formatPostedAt(a.posted_at)}
                {a.link && <> · <a href={a.link} target="_blank" rel="noreferrer">link</a></>}
              </div>
            </div>
            <button
              type="button"
              className="manager-remove"
              aria-label={`Remove ${a.title}`}
              onClick={() => onRemove(a.id)}
              disabled={removing === a.id}
              title="Remove"
            >
              {removing === a.id ? '…' : '×'}
            </button>
          </li>
        ))}
      </ul>

      <form className="manager-add" onSubmit={onSubmit}>
        <div className="manager-add-row">
          <input
            type="text"
            className="upload-input"
            placeholder="Title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={140}
            required
          />
          <select
            className="upload-input manager-sev-select"
            value={severity}
            onChange={(e) => setSeverity(e.target.value)}
          >
            <option value="info">Info</option>
            <option value="warn">Warning</option>
            <option value="critical">Critical</option>
          </select>
        </div>
        <textarea
          className="upload-input"
          placeholder="Body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={2}
          maxLength={500}
          required
        />
        <input
          type="url"
          className="upload-input"
          placeholder="Link (optional)"
          value={link}
          onChange={(e) => setLink(e.target.value)}
        />
        <button
          type="submit"
          className="upload-btn"
          disabled={submitting || !title.trim() || !body.trim()}
        >
          {submitting ? 'Posting…' : 'Post announcement'}
        </button>
      </form>
    </div>
  )
}

function ExamDatesCard() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [removing, setRemoving] = useState(null)
  const [form, setForm] = useState({
    subject: '', code: '', date: '', slot: '', type: '', room: '',
    target_year: 'all',
  })

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await listExamDates()
      setItems(Array.isArray(data) ? data : [])
    } catch (err) {
      setError(err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { refresh() }, [refresh])

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }))
  }

  async function onSubmit(evt) {
    evt.preventDefault()
    if (!form.subject.trim() || !form.code.trim() || !form.date.trim() || submitting) return
    setSubmitting(true)
    setError(null)
    try {
      await addExamDate({
        subject: form.subject.trim(),
        code: form.code.trim().toUpperCase(),
        date: form.date.trim(),
        slot: form.slot.trim() || undefined,
        type: form.type.trim() || undefined,
        room: form.room.trim() || undefined,
        targetYear: form.target_year === 'all' ? null : Number(form.target_year),
      })
      setForm({ subject: '', code: '', date: '', slot: '', type: '', room: '', target_year: 'all' })
      await refresh()
    } catch (err) {
      setError(err)
    } finally {
      setSubmitting(false)
    }
  }

  async function onRemove(id) {
    if (!window.confirm('Delete this exam date?')) return
    setRemoving(id)
    try {
      await deleteExamDate(id)
      await refresh()
    } catch (err) {
      setError(err)
    } finally {
      setRemoving(null)
    }
  }

  return (
    <div className="admin-card manager-card">
      <div className="admin-card-header" style={{ alignItems: 'center' }}>
        <h2 className="admin-card-title" style={{ textAlign: 'left' }}>Exam dates</h2>
        <button type="button" className="admin-card-action" onClick={refresh} disabled={loading}>
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>
      <p className="admin-card-sub" style={{ textAlign: 'left', marginBottom: 12 }}>
        Shown on the public sidebar, earliest first.
      </p>

      {error && (
        <div className="upload-result failed" style={{ marginBottom: 10 }}>{errMessage(error)}</div>
      )}

      <ul className="manager-list" aria-label="Exam dates">
        {loading && <li className="manager-empty">Loading…</li>}
        {!loading && items.length === 0 && (
          <li className="manager-empty">No exam dates yet.</li>
        )}
        {!loading && items.map((e) => (
          <li key={e.id} className="manager-row">
            <div className="manager-exam-date">
              <span className="manager-exam-d">{e.date?.slice(8, 10) || '?'}</span>
              <span className="manager-exam-m">{(e.date || '').slice(5, 7)}</span>
            </div>
            <div className="manager-row-body">
              <div className="manager-row-title">
                {e.subject}
                <span className={`manager-year-pill ${e.target_year ? '' : 'manager-year-pill--all'}`}>
                  {e.target_year ? `Year ${e.target_year}` : 'All years'}
                </span>
              </div>
              <div className="manager-row-sub">
                <code style={{ fontFamily: 'var(--mono, monospace)' }}>{e.code}</code>
                {e.type && <> · {e.type}</>}
                {e.slot && <> · {e.slot}</>}
                {e.room && <> · {e.room}</>}
              </div>
            </div>
            <button
              type="button"
              className="manager-remove"
              aria-label={`Remove ${e.subject}`}
              onClick={() => onRemove(e.id)}
              disabled={removing === e.id}
              title="Remove"
            >
              {removing === e.id ? '…' : '×'}
            </button>
          </li>
        ))}
      </ul>

      <form className="manager-add" onSubmit={onSubmit}>
        <div className="manager-add-row">
          <input
            type="text"
            className="upload-input"
            placeholder="Subject"
            value={form.subject}
            onChange={(e) => update('subject', e.target.value)}
            required
          />
          <input
            type="text"
            className="upload-input manager-code"
            placeholder="UCS027"
            value={form.code}
            onChange={(e) => update('code', e.target.value)}
            required
          />
        </div>
        <div className="manager-add-row">
          <input
            type="date"
            className="upload-input"
            value={form.date}
            onChange={(e) => update('date', e.target.value)}
            required
          />
          <input
            type="text"
            className="upload-input"
            placeholder="Slot (09:00–10:30)"
            value={form.slot}
            onChange={(e) => update('slot', e.target.value)}
          />
        </div>
        <div className="manager-add-row">
          <input
            type="text"
            className="upload-input"
            placeholder="Type (Mid-Sem, Quiz, …)"
            value={form.type}
            onChange={(e) => update('type', e.target.value)}
          />
          <input
            type="text"
            className="upload-input"
            placeholder="Room"
            value={form.room}
            onChange={(e) => update('room', e.target.value)}
          />
        </div>
        <div className="manager-add-row">
          <label className="manager-scope-label" htmlFor="exam-target-year">Applies to</label>
          <select
            id="exam-target-year"
            className="upload-input manager-sev-select"
            value={form.target_year}
            onChange={(e) => update('target_year', e.target.value)}
          >
            <option value="all">All years</option>
            <option value="1">Year 1 only</option>
            <option value="2">Year 2 only</option>
            <option value="3">Year 3 only</option>
            <option value="4">Year 4 only</option>
            <option value="5">Year 5 only</option>
          </select>
        </div>
        <button
          type="submit"
          className="upload-btn"
          disabled={submitting || !form.subject.trim() || !form.code.trim() || !form.date.trim()}
        >
          {submitting ? 'Adding…' : 'Add exam date'}
        </button>
      </form>
    </div>
  )
}

export default function Dashboard() {
  const [stats, setStats] = useState(null)
  const [errSummary, setErrSummary] = useState(null)
  const [logStatus, setLogStatus] = useState('loading')
  const [refreshing, setRefreshing] = useState(false)
  const [activeSection, setActiveSection] = useState('overview')

  const refresh = useCallback(async () => {
    setRefreshing(true)
    try {
      const [s, sum] = await Promise.allSettled([
        getStats(),
        getErrorsSummary(),
      ])
      if (s.status === 'fulfilled') setStats(s.value)
      if (sum.status === 'fulfilled') {
        setErrSummary(sum.value || null)
      } else {
        setErrSummary(null)
      }
      setLogStatus('ready')
    } finally {
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  // Scrollspy: highlight the section nav item whose anchor is closest to the top.
  useEffect(() => {
    const sectionIds = ['overview', 'ingest', 'semester', 'content']
    const targets = sectionIds
      .map((id) => document.getElementById(`dash-${id}`))
      .filter(Boolean)
    if (!targets.length || typeof IntersectionObserver === 'undefined') return
    const obs = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
        if (visible.length > 0) {
          const id = visible[0].target.id.replace('dash-', '')
          setActiveSection(id)
        }
      },
      { rootMargin: '-30% 0px -55% 0px', threshold: 0 },
    )
    targets.forEach((t) => obs.observe(t))
    return () => obs.disconnect()
  }, [])

  function jumpTo(id) {
    const el = document.getElementById(`dash-${id}`)
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const pct = stats?.parsing_accuracy_pct

  const NAV = [
    { id: 'overview', label: 'Overview' },
    { id: 'ingest', label: 'Ingest' },
    { id: 'semester', label: 'Semester' },
    { id: 'content', label: 'Content' },
  ]

  return (
    <>
      <nav className="dash-section-nav" aria-label="Dashboard sections">
        {NAV.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`dash-section-nav-item${activeSection === item.id ? ' is-active' : ''}`}
            onClick={() => jumpTo(item.id)}
          >
            {item.label}
          </button>
        ))}
      </nav>

      <section id="dash-overview" className="dash-section">
        <div className="admin-stats-row">
          <StatCard
            accent="green"
            label="Batches with timetables"
            value={stats?.batches_with_timetables ?? '—'}
          />
          <StatCard
            accent="slate"
            label="Uploads logged"
            value={stats?.uploads_logged ?? '—'}
          />
          <StatCard
            accent="purple"
            label="Failed / partial uploads"
            value={stats?.failed_partial_uploads ?? '—'}
          />
          <StatCard
            accent="blue"
            label="Total parsing errors"
            value={stats?.total_parsing_errors ?? '—'}
          />
        </div>
      </section>

      <section id="dash-ingest" className="dash-section">
        <div className="admin-grid-2">
          <UploadCard onUploaded={refresh} />
          <ErrorLog
            summary={errSummary}
            status={logStatus}
            onRefresh={refresh}
            refreshing={refreshing}
          />
        </div>
      </section>

      <section id="dash-semester" className="dash-section">
        <div className="admin-grid-2">
          <SemesterLabelCard />
          <AccuracyDonut pct={pct} />
        </div>
      </section>

      <section id="dash-content" className="dash-section">
        <div className="admin-grid-2">
          <AnnouncementsCard />
          <ExamDatesCard />
        </div>
      </section>
    </>
  )
}
