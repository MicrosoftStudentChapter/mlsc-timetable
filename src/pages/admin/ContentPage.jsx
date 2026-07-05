// Admin "Content" tab — everything that shows up in the public sidebar or
// on the timetable pages (announcements, exam dates, calendar overrides).
//
// Split out of Dashboard.jsx so the dashboard stays focused on ingest +
// health, and this page stays focused on day-to-day content editing.
//
// All three cards follow the same visual pattern: header + subtitle,
// error banner, list of existing rows with a red × remove button,
// and an `.manager-add` form using shared `.upload-input` styling.

import { useCallback, useEffect, useState } from 'react'
import {
  listAnnouncements,
  addAnnouncement,
  deleteAnnouncement,
  resetAnnouncements,
  listExamDates,
  addExamDate,
  deleteExamDate,
  resetExamDates,
  listCalendarOverrides,
  addCalendarOverride,
  deleteCalendarOverride,
  resetCalendarOverrides,
  previewCalendarPdf,
  applyCalendarPlan,
  AdminAuthError,
} from '../../lib/admin'
import CalendarPreviewDialog from '../../components/CalendarPreviewDialog'
import './admin.css'

const MONTH_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
function monthShort(dateStr) {
  if (!dateStr) return '?'
  const m = parseInt(dateStr.slice(5, 7), 10)
  return MONTH_SHORT[m - 1] || dateStr.slice(5, 7)
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
const KIND_LABELS = {
  holiday: 'Holiday',
  follow_day: 'Follows day',
  mst: 'MST week',
  est: 'EST week',
  assessment: 'Assessment',
  frosh: 'Frosh',
}
const WEEKDAY_LABELS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']
const SCOPE_LABELS = { global: 'Everyone', year: 'Year', branch: 'Branch' }

// ─── Announcements ─────────────────────────────────────────────────────
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

  async function onReset() {
    if (!window.confirm('Reset announcements to defaults? This will delete all current announcements and restore the bundled ones.')) return
    setLoading(true)
    setError(null)
    try {
      await resetAnnouncements()
      await refresh()
    } catch (err) {
      setError(err)
      setLoading(false)
    }
  }

  return (
    <div className="admin-card manager-card">
      <div className="admin-card-header" style={{ alignItems: 'center' }}>
        <h2 className="admin-card-title" style={{ textAlign: 'left' }}>Announcements</h2>
        <button type="button" className="admin-card-action" onClick={refresh} disabled={loading}>
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
        <button type="button" className="admin-card-action" style={{ color: '#f87171' }} onClick={onReset} disabled={loading}>
          Reset
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

// ─── Exam dates ────────────────────────────────────────────────────────
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

  async function onReset() {
    if (!window.confirm('Reset exam dates to defaults? This will delete all current exam dates and restore the bundled ones.')) return
    setLoading(true)
    setError(null)
    try {
      await resetExamDates()
      await refresh()
    } catch (err) {
      setError(err)
      setLoading(false)
    }
  }

  return (
    <div className="admin-card manager-card">
      <div className="admin-card-header" style={{ alignItems: 'center' }}>
        <h2 className="admin-card-title" style={{ textAlign: 'left' }}>Exam dates</h2>
        <button type="button" className="admin-card-action" onClick={refresh} disabled={loading}>
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
        <button type="button" className="admin-card-action" style={{ color: '#f87171' }} onClick={onReset} disabled={loading}>
          Reset
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
              <span className="manager-exam-m">{monthShort(e.date)}</span>
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

// ─── Calendar overrides ────────────────────────────────────────────────
// Overrides drive the sidebar mini-calendar: mark a date as a holiday
// (with optional reason) or make it follow another weekday's timetable.
// Scope: global (everyone), year (["1","2"] etc.), branch (["2A","1E"] etc.).
function CalendarOverridesCard() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [removing, setRemoving] = useState(null)
  const emptyForm = {
    date: '',
    kind: 'holiday',
    reason: '',
    follows_day: '0',
    scope: 'global',
    scope_values_raw: '',
  }
  const [form, setForm] = useState(emptyForm)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await listCalendarOverrides()
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
    if (submitting || !form.date.trim()) return
    setSubmitting(true)
    setError(null)
    try {
      const scopeValues = form.scope === 'global'
        ? []
        : form.scope_values_raw
            .split(/[\s,]+/)
            .map((v) => v.trim())
            .filter(Boolean)
      await addCalendarOverride({
        date: form.date.trim(),
        kind: form.kind,
        reason: form.kind === 'holiday' ? form.reason : form.reason || null,
        followsDay: form.kind === 'follow_day' ? Number(form.follows_day) : null,
        scope: form.scope,
        scopeValues,
      })
      setForm(emptyForm)
      await refresh()
    } catch (err) {
      setError(err)
    } finally {
      setSubmitting(false)
    }
  }

  async function onRemove(id) {
    if (!window.confirm('Delete this calendar override?')) return
    setRemoving(id)
    try {
      await deleteCalendarOverride(id)
      await refresh()
    } catch (err) {
      setError(err)
    } finally {
      setRemoving(null)
    }
  }

  async function onReset() {
    if (!window.confirm('Reset calendar overrides to defaults? This will delete all current overrides and restore the bundled ones.')) return
    setLoading(true)
    setError(null)
    try {
      await resetCalendarOverrides()
      await refresh()
    } catch (err) {
      setError(err)
      setLoading(false)
    }
  }

  return (
    <div className="admin-card manager-card">
      <div className="admin-card-header" style={{ alignItems: 'center' }}>
        <h2 className="admin-card-title" style={{ textAlign: 'left' }}>Calendar overrides</h2>
        <button type="button" className="admin-card-action" onClick={refresh} disabled={loading}>
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
        <button type="button" className="admin-card-action" style={{ color: '#f87171' }} onClick={onReset} disabled={loading}>
          Reset
        </button>
      </div>
      <p className="admin-card-sub" style={{ textAlign: 'left', marginBottom: 12 }}>
        Mark holidays or make a date follow another weekday's schedule.
        Scope can be global, per year, or per branch (e.g. <code>2A</code>).
      </p>

      {error && (
        <div className="upload-result failed" style={{ marginBottom: 10 }}>
          {errMessage(error)}
        </div>
      )}

      <ul className="manager-list" aria-label="Calendar overrides">
        {loading && <li className="manager-empty">Loading…</li>}
        {!loading && items.length === 0 && (
          <li className="manager-empty">No overrides yet.</li>
        )}
        {!loading && items.map((o) => (
          <li key={o.id} className="manager-row">
            <div className="manager-exam-date">
              <span className="manager-exam-d">{o.date?.slice(8, 10) || '?'}</span>
              <span className="manager-exam-m">{monthShort(o.date)}</span>
            </div>
            <div className="manager-row-body">
              <div className="manager-row-title">
                {o.kind === 'follow_day'
                  ? `Follows ${WEEKDAY_LABELS[o.follows_day] || '?'}`
                  : (o.reason || KIND_LABELS[o.kind] || 'Override')}
                <span className="manager-year-pill manager-year-pill--all">
                  {KIND_LABELS[o.kind] || o.kind}
                </span>
              </div>
              <div className="manager-row-sub">
                {SCOPE_LABELS[o.scope] || o.scope}
                {o.scope !== 'global' && o.scope_values?.length > 0 && (
                  <> · <code style={{ fontFamily: 'var(--mono, monospace)' }}>{o.scope_values.join(', ')}</code></>
                )}
                {o.kind === 'follow_day' && o.reason && <> · {o.reason}</>}
              </div>
            </div>
            <button
              type="button"
              className="manager-remove"
              onClick={() => onRemove(o.id)}
              disabled={removing === o.id}
              aria-label="Delete override"
              title="Delete"
            >
              {removing === o.id ? '…' : '×'}
            </button>
          </li>
        ))}
      </ul>

      <form className="manager-add" onSubmit={onSubmit}>
        <div className="manager-add-row">
          <input
            type="date"
            className="upload-input"
            value={form.date}
            onChange={(e) => update('date', e.target.value)}
            required
          />
          <select
            className="upload-input manager-sev-select"
            value={form.kind}
            onChange={(e) => update('kind', e.target.value)}
            aria-label="Override type"
          >
            <option value="holiday">Holiday</option>
            <option value="follow_day">Follows day</option>
            <option value="mst">MST week</option>
            <option value="est">EST week</option>
            <option value="assessment">Assessment</option>
            <option value="frosh">Frosh</option>
          </select>
        </div>

        {form.kind === 'follow_day' && (
          <div className="manager-add-row">
            <label className="manager-scope-label" htmlFor="override-follows">Follows</label>
            <select
              id="override-follows"
              className="upload-input manager-sev-select"
              value={form.follows_day}
              onChange={(e) => update('follows_day', e.target.value)}
            >
              {WEEKDAY_LABELS.map((label, idx) => (
                <option key={idx} value={String(idx)}>{label}</option>
              ))}
            </select>
          </div>
        )}

        <input
          type="text"
          className="upload-input"
          placeholder={
            form.kind === 'holiday' ? 'Reason (e.g. Diwali) — optional'
              : form.kind === 'follow_day' ? 'Note (e.g. compensatory day) — optional'
              : `Note for ${KIND_LABELS[form.kind] || form.kind} — optional`
          }
          value={form.reason}
          onChange={(e) => update('reason', e.target.value)}
          maxLength={140}
        />

        <div className="manager-add-row">
          <label className="manager-scope-label" htmlFor="override-scope">Applies to</label>
          <select
            id="override-scope"
            className="upload-input manager-sev-select"
            value={form.scope}
            onChange={(e) => update('scope', e.target.value)}
          >
            <option value="global">Everyone (global)</option>
            <option value="year">Specific years</option>
            <option value="branch">Specific branches</option>
          </select>
        </div>

        {form.scope !== 'global' && (
          <input
            type="text"
            className="upload-input"
            placeholder={form.scope === 'year' ? '1, 2, 3' : '2A, 1E, 3B'}
            value={form.scope_values_raw}
            onChange={(e) => update('scope_values_raw', e.target.value)}
            required
          />
        )}

        <button
          type="submit"
          className="upload-btn"
          disabled={submitting || !form.date.trim()}
        >
          {submitting ? 'Adding…' : 'Add override'}
        </button>
      </form>
    </div>
  )
}

// ─── Calendar PDF upload ──────────────────────────────────────────────
// Parses a Thapar academic-calendar PDF and lets the admin review + edit
// the derived overrides in a modal before writing them to the same
// `calendar_overrides` collection that `CalendarOverridesCard` manages
// manually. Companion to the course-scheme PDF flow on the Baselines page.
function CalendarPdfCard({ onApplied }) {
  const [file, setFile] = useState(null)
  const [dragging, setDragging] = useState(false)
  const [busy, setBusy] = useState(false)
  const [preview, setPreview] = useState(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [error, setError] = useState(null)
  const [result, setResult] = useState(null)
  // Admin picks which UG years this calendar applies to before parsing.
  // Empty set = applies to everyone (global scope in the DB).
  const [selectedYears, setSelectedYears] = useState(() => new Set())

  function toggleYear(y) {
    setSelectedYears((prev) => {
      const next = new Set(prev)
      if (next.has(y)) next.delete(y); else next.add(y)
      return next
    })
  }

  function resetAll() {
    setFile(null)
    setPreview(null)
    setDialogOpen(false)
    setError(null)
    setResult(null)
    setSelectedYears(new Set())
  }

  async function onPreview(evt) {
    evt.preventDefault()
    if (!file || busy) return
    setBusy(true)
    setError(null)
    setResult(null)
    try {
      const data = await previewCalendarPdf({ file })
      setPreview(data)
      setDialogOpen(true)
    } catch (err) {
      setError(err)
    } finally {
      setBusy(false)
    }
  }

  async function onApply(editedPlan, opts) {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      const data = await applyCalendarPlan({
        plan: editedPlan,
        scope: opts.scope,
        scopeValues: opts.scopeValues,
        replaceRange: opts.replaceRange,
        source: opts.source,
      })
      setResult(data)
      setPreview(null)
      setDialogOpen(false)
      onApplied?.()
    } catch (err) {
      setError(err)
      throw err
    } finally {
      setBusy(false)
    }
  }

  // Default scope for the review dialog: derived from the years the admin
  // picked in the card (empty set → global, otherwise year-scoped).
  const defaultScope = selectedYears.size === 0 ? 'global' : 'year'
  const defaultScopeValues = Array.from(selectedYears).sort().map(String)

  return (
    <div className="admin-card manager-card">
      <div className="admin-card-header" style={{ alignItems: 'center' }}>
        <h2 className="admin-card-title" style={{ textAlign: 'left' }}>
          Calendar upload (PDF)
        </h2>
        {(preview || result) && (
          <button type="button" className="admin-card-action" onClick={resetAll}>
            Start over
          </button>
        )}
      </div>
      <p className="admin-card-sub" style={{ textAlign: 'left', marginBottom: 12 }}>
        Upload a Thapar academic-calendar PDF (e.g. <code>ODD SEM 2026-27</code>)
        to extract holidays, Diwali break, and follow-day rules automatically.
        Pick the years this calendar applies to, then review + edit every row
        before it's saved.
      </p>

      {error && (
        <div className="upload-result failed" style={{ marginBottom: 10 }}>
          {errMessage(error)}
        </div>
      )}

      <form className="upload-form cal-upload-form" onSubmit={onPreview}>
        <label
          className={`dropzone${dragging ? ' is-active' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragging(false)
            const f = e.dataTransfer?.files?.[0]
            if (f && f.name.toLowerCase().endsWith('.pdf')) {
              setFile(f)
              setPreview(null)
              setResult(null)
            }
          }}
        >
          <input
            type="file"
            accept="application/pdf,.pdf"
            style={{ display: 'none' }}
            onChange={(e) => {
              setFile(e.target.files?.[0] || null)
              setPreview(null)
              setResult(null)
            }}
          />
          {file ? (
            <span className="dropzone-filename">{file.name}</span>
          ) : (
            <>
              Drop the calendar <code>.pdf</code> here,
              <br />or click to browse
            </>
          )}
        </label>

        {/* Year picker — pill-style checkbox row. No selection = global. */}
        <div className="cal-year-picker">
          <span className="cal-year-picker-label">Applies to</span>
          <div className="cal-year-picker-pills">
            {[1, 2, 3, 4].map((y) => {
              const active = selectedYears.has(y)
              return (
                <button
                  key={y}
                  type="button"
                  className={`cal-year-pill${active ? ' is-active' : ''}`}
                  onClick={() => toggleYear(y)}
                  aria-pressed={active}
                >
                  Year {y}
                </button>
              )
            })}
          </div>
          <span className="cal-year-picker-hint">
            {selectedYears.size === 0
              ? 'Uncheck all = applies to everyone'
              : `${selectedYears.size} year${selectedYears.size === 1 ? '' : 's'} selected`}
          </span>
        </div>

        {result && (
          <div className="upload-result">
            Wrote <strong>{result.written?.length ?? 0}</strong> override(s)
            {result.deleted > 0 && <> (replaced {result.deleted} in the same date range)</>}
            {result.errors?.length > 0 && <> · <span style={{ color: '#f87171' }}>{result.errors.length} error(s)</span></>}.
          </div>
        )}

        <button
          type="submit"
          className="upload-btn cal-upload-submit"
          disabled={!file || busy}
        >
          {busy ? 'Working…' : 'Parse & review'}
        </button>
      </form>

      <CalendarPreviewDialog
        open={dialogOpen}
        preview={preview}
        busy={busy}
        defaultScope={defaultScope}
        defaultScopeValues={defaultScopeValues}
        onApply={onApply}
        onClose={() => setDialogOpen(false)}
      />
    </div>
  )
}

export default function ContentPage() {
  // Bump `refreshTick` after a calendar apply so the manual card refetches.
  const [refreshTick, setRefreshTick] = useState(0)
  return (
    <div className="admin-page">
      <header className="admin-page-header">
        <h1 className="admin-page-title">Content</h1>
        <p className="admin-page-sub">
          Manages what appears on the public sidebar &amp; timetable pages:
          announcements, exam dates, and the mini-calendar's holiday /
          follow-day overrides.
        </p>
      </header>

      <div className="admin-grid-2">
        <AnnouncementsCard />
        <ExamDatesCard />
      </div>
      <div className="admin-grid-2" style={{ marginTop: 16 }}>
        <CalendarPdfCard onApplied={() => setRefreshTick((t) => t + 1)} />
        <CalendarOverridesCard key={refreshTick} />
      </div>
    </div>
  )
}
