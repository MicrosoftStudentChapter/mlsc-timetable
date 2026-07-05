// Admin Fix editor — opens a single batch's timetable in the exact same
// grid the public site shows, highlights the cell tied to the inbound
// parser error, and lets the admin add / edit / delete / drag classes,
// then PATCH the batch directly (no change-request hop).

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import TimetableGrid from '../../components/TimetableGrid'
import { useTheme } from '../../hooks/useTheme'
import {
  getAdminTimetable,
  patchAdminTimetable,
  listErrors,
  resolveError,
  ignoreError,
} from '../../lib/admin'

// Mirror lib/timetable.js's adapter: backend snake_case → grid camelCase
// with stable ids so React keys are predictable across re-renders.
let _idCounter = 0
const nextId = () => `adm-entry-${++_idCounter}`

function toGridEntry(raw) {
  return {
    id: nextId(),
    day: raw.day,
    startTime: raw.start_time,
    endTime: raw.end_time,
    subject: raw.subject ?? '',
    code: raw.code ?? '',
    room: raw.room ?? '',
    type: raw.type ?? 'Lecture',
    options: raw.options ?? [],
  }
}

function fromGridEntry(e) {
  return {
    day: e.day,
    start_time: e.startTime,
    end_time: e.endTime,
    subject: e.subject ?? '',
    code: e.code ?? '',
    room: e.room ?? '',
    type: e.type ?? 'Lecture',
    options: Array.isArray(e.options) ? e.options : [],
  }
}

export default function FixTimetablePage() {
  const { batch } = useParams()
  const [searchParams] = useSearchParams()
  const errorId = searchParams.get('error') || null
  const navigate = useNavigate()
  const { theme } = useTheme()
  const isDark = theme === 'dark'

  const [loading, setLoading] = useState(true)
  const [entries, setEntries] = useState([])     // camelCase, id-stamped
  const [baseline, setBaseline] = useState([])   // last-saved snapshot
  const [activeError, setActiveError] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  // Load timetable + the triggering error.
  useEffect(() => {
    let alive = true
    setLoading(true)
    Promise.all([
      getAdminTimetable(batch),
      errorId
        ? listErrors({ limit: 500 })
            .then((r) => (r.items || []).find((it) => it.id === errorId) || null)
            .catch(() => null)
        : Promise.resolve(null),
    ])
      .then(([tt, err]) => {
        if (!alive) return
        const raw = Array.isArray(tt?.classes) ? tt.classes : []
        const adapted = raw.map(toGridEntry)
        setEntries(adapted)
        setBaseline(adapted)
        setActiveError(err)
      })
      .catch((e) => {
        if (alive) setError(e)
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [batch, errorId])

  // "Day|HH:MM" for the grid's error-pulse highlight.
  const errorCellKey = useMemo(() => {
    if (!activeError?.day) return null
    const start = (activeError.start_time || '').slice(0, 5)
    if (!start) return null
    return `${activeError.day[0].toUpperCase()}${activeError.day.slice(1).toLowerCase()}|${start}`
  }, [activeError])

  // Net diff: only enable Save when entries differ from the last-saved baseline.
  const dirty = useMemo(() => {
    const sig = (arr) => arr
      .map((e) => `${e.day}|${e.startTime}|${e.subject}|${e.code}|${e.type}|${e.room ?? ''}`)
      .sort()
      .join('\n')
    return sig(baseline) !== sig(entries)
  }, [baseline, entries])

  const onAdminChange = useCallback((next) => {
    setEntries(next)
  }, [])

  async function save() {
    setSaving(true)
    setError(null)
    try {
      const payload = { classes: entries.map(fromGridEntry) }
      await patchAdminTimetable(batch, payload)
      setBaseline(entries)
    } catch (e) {
      setError(e)
    } finally {
      setSaving(false)
    }
  }

  async function markResolved() {
    if (!activeError) return
    setSaving(true)
    try {
      await resolveError(activeError.id)
      navigate('/admin/fix')
    } catch (e) {
      setError(e)
    } finally {
      setSaving(false)
    }
  }

  async function markIgnored() {
    if (!activeError) return
    setSaving(true)
    try {
      await ignoreError(activeError.id)
      navigate('/admin/fix')
    } catch (e) {
      setError(e)
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="fix-loading">Loading {batch}…</div>

  return (
    <div className="fix-edit-page">
      <div className="fix-edit-header">
        <div>
          <Link to="/admin/fix" className="fix-back">← Back to Fix</Link>
          <h1 className="fix-edit-title">
            Edit timetable · <code>{batch}</code>
          </h1>
          {activeError && (
            <div className="fix-edit-error-callout">
              <span className={`fix-sev fix-sev-${activeError.severity || 'warn'}`} />
              <strong>{activeError.error_type}</strong>
              <span>{activeError.message}</span>
              {activeError.day && (
                <span className="fix-edit-where">
                  at {activeError.day} {activeError.start_time || ''}
                </span>
              )}
            </div>
          )}
        </div>
        <div className="fix-edit-actions">
          <button
            type="button"
            className="fix-edit-btn fix-edit-save"
            onClick={save}
            disabled={!dirty || saving}
          >
            {saving ? 'Saving…' : dirty ? 'Save changes' : 'Saved'}
          </button>
          {activeError && (
            <>
              <button type="button" className="fix-edit-btn fix-edit-resolve" onClick={markResolved} disabled={saving}>
                Mark resolved
              </button>
              <button type="button" className="fix-edit-btn fix-edit-ignore" onClick={markIgnored} disabled={saving}>
                Mark ignored
              </button>
            </>
          )}
        </div>
      </div>

      {error && (
        <div className="fix-error" role="alert">
          {String(error.message || error)}
        </div>
      )}

      <div className="fix-edit-grid-wrap">
        <TimetableGrid
          classes={entries}
          batch={batch}
          isDarkMode={isDark}
          adminMode
          onAdminChange={onAdminChange}
          errorCellKey={errorCellKey}
        />
      </div>
    </div>
  )
}
