// Edit dialog for a single baseline — same design as SchemePreviewDialog.
// Left pane: per-type count inputs.
// Right pane: editable course roster (Code / Title / Cat / L / T / P / Cr).
// On save calls setBaseline(key, counts, { courses }) so both fields are
// written in one round-trip.

import { useEffect, useRef, useState } from 'react'
import './SchemePreviewDialog.css' // reuse every scheme-* class

const COURSE_FIELDS = [
  { key: 'code',     label: 'Code',  width: 100, mono: true  },
  { key: 'title',    label: 'Title', width: null              },
  { key: 'category', label: 'Cat',   width: 60               },
  { key: 'L',        label: 'L',     width: 48, center: true },
  { key: 'T',        label: 'T',     width: 48, center: true },
  { key: 'P',        label: 'P',     width: 48, center: true },
  { key: 'Cr',       label: 'Cr',    width: 56, center: true },
]

const DEFAULT_TYPES = ['Lecture', 'Tutorial', 'Practical']

function emptyCourse() {
  return { code: '', title: '', category: '', L: '', T: '', P: '', Cr: '' }
}

function cloneCourses(courses) {
  return (courses || []).map((c) => ({ ...c }))
}

// Build initial counts state: start from explicit counts, fall back to
// DEFAULT_TYPES so there's always something to edit.
function initCounts(row) {
  const explicit = row?.counts || {}
  const keys = Object.keys(explicit).length > 0
    ? Object.keys(explicit)
    : DEFAULT_TYPES
  return Object.fromEntries(keys.map((k) => [k, String(explicit[k] ?? '')]))
}

export default function BaselineEditDialog({ row, busy, onSave, onClose }) {
  const open = !!row
  const dialogRef = useRef(null)

  const [counts, setCounts]       = useState({})
  const [courses, setCourses]     = useState([])
  const [extraType, setExtraType] = useState('')
  const [error, setError]         = useState(null)

  // Reset whenever a new row is opened.
  useEffect(() => {
    if (!open) return
    setCounts(initCounts(row))
    setCourses(cloneCourses(row?.courses))
    setExtraType('')
    setError(null)
  }, [open, row])

  // Escape to close.
  useEffect(() => {
    if (!open) return
    const onKey = (e) => { if (e.key === 'Escape' && !busy) onClose?.() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, busy, onClose])

  if (!open) return null

  // ── Counts helpers ────────────────────────────────────────
  function setCount(type, raw) {
    setCounts((prev) => ({ ...prev, [type]: raw }))
  }

  function addType() {
    const name = extraType.trim()
    if (!name || counts[name] !== undefined) return
    setCounts((prev) => ({ ...prev, [name]: '' }))
    setExtraType('')
  }

  function removeType(type) {
    setCounts((prev) => {
      const next = { ...prev }
      delete next[type]
      return next
    })
  }

  // ── Course helpers ────────────────────────────────────────
  function updateCourse(idx, field, value) {
    setCourses((prev) => {
      const next = cloneCourses(prev)
      next[idx][field] = value
      return next
    })
  }

  function addCourse() {
    setCourses((prev) => [...prev, emptyCourse()])
  }

  function removeCourse(idx) {
    setCourses((prev) => prev.filter((_, i) => i !== idx))
  }

  // ── Save ──────────────────────────────────────────────────
  async function handleSave() {
    setError(null)
    const cleaned = {}
    for (const [k, v] of Object.entries(counts)) {
      if (v === '' || v == null) continue
      const n = Number(v)
      if (!Number.isInteger(n) || n < 0) {
        setError(`'${k}' must be a non-negative integer.`)
        return
      }
      cleaned[k] = n
    }
    if (Object.keys(cleaned).length === 0) {
      setError('Provide at least one type count.')
      return
    }
    const cleanedCourses = courses
      .filter((c) => (c.code || '').trim())
      .map((c) => ({
        code:     (c.code     || '').trim().toUpperCase(),
        title:    (c.title    || '').trim(),
        category: (c.category || '').trim(),
        L: c.L ?? '', T: c.T ?? '', P: c.P ?? '', Cr: c.Cr ?? '',
      }))
    try {
      await onSave(row.key, cleaned, cleanedCourses)
    } catch (err) {
      setError(err?.message || String(err))
    }
  }

  const total = Object.values(counts).reduce((s, v) => {
    const n = Number(v)
    return s + (Number.isFinite(n) && n >= 0 ? n : 0)
  }, 0)

  return (
    <div className="scheme-dialog-backdrop" onClick={busy ? undefined : onClose}>
      <div
        className="scheme-dialog bed-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="bed-title"
        ref={dialogRef}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Header ── */}
        <header className="scheme-dialog-header">
          <div>
            <h2 id="bed-title" className="scheme-dialog-title">
              Edit baseline
            </h2>
            <p className="scheme-dialog-sub">
              <code>{row.key}</code>
              {' · '}
              Group <strong>{row.group}</strong>
              {' · '}
              {row.semester_prefix === 'E' ? 'Even semester' : 'Odd semester'}
              {row.scheme_source && <>{' · '}source: <code>{row.scheme_source}</code></>}
            </p>
          </div>
          <button
            type="button"
            className="scheme-dialog-close"
            onClick={onClose}
            disabled={busy}
            aria-label="Close"
          >
            ×
          </button>
        </header>

        {/* ── Body: counts pane (left) + courses pane (right) ── */}
        <div className="scheme-dialog-body">

          {/* Left — counts */}
          <div className="scheme-tabs bed-counts-pane">
            <div className="bed-counts-heading">
              <span className="bed-counts-title">Counts</span>
              <span className="bed-counts-total" title="Expected total classes per batch">
                = {total}
              </span>
            </div>

            {Object.keys(counts).map((type) => (
              <div key={type} className="bed-count-row">
                <label className="bed-count-label">{type}</label>
                <div className="bed-count-input-wrap">
                  <input
                    type="number"
                    className="scheme-input bed-count-input"
                    min="0"
                    step="1"
                    value={counts[type]}
                    onChange={(e) => setCount(type, e.target.value)}
                    placeholder="0"
                  />
                  {!DEFAULT_TYPES.includes(type) && (
                    <button
                      type="button"
                      className="scheme-row-remove bed-type-remove"
                      onClick={() => removeType(type)}
                      aria-label={`Remove ${type}`}
                      title="Remove type"
                    >
                      ×
                    </button>
                  )}
                </div>
              </div>
            ))}

            <div className="bed-add-type">
              <input
                type="text"
                className="scheme-input bed-add-type-input"
                placeholder="e.g. Project"
                value={extraType}
                onChange={(e) => setExtraType(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addType() } }}
              />
              <button
                type="button"
                className="bed-add-type-btn"
                onClick={addType}
                disabled={!extraType.trim() || counts[extraType.trim()] !== undefined}
              >
                Add
              </button>
            </div>
          </div>

          {/* Right — courses */}
          <div className="scheme-detail">
            <div className="scheme-meta" style={{ marginBottom: 16 }}>
              <div className="scheme-meta-row">
                <span className="scheme-meta-label">Baseline key</span>
                <span className="scheme-meta-value"><code>{row.key}</code></span>
              </div>
              <div className="scheme-meta-row">
                <span className="scheme-meta-label">Semester</span>
                <span className="scheme-meta-value">
                  {row.semester_prefix === 'E' ? 'Even' : 'Odd'}
                </span>
              </div>
              <div className="scheme-meta-row">
                <span className="scheme-meta-label">Courses</span>
                <span className="scheme-meta-value">{courses.length} in roster</span>
              </div>
            </div>

            <div className="scheme-table-wrap">
              <table className="scheme-courses">
                <thead>
                  <tr>
                    {COURSE_FIELDS.map((f) => (
                      <th
                        key={f.key}
                        style={{ width: f.width || undefined, textAlign: f.center ? 'center' : 'left' }}
                      >
                        {f.label}
                      </th>
                    ))}
                    <th style={{ width: 40 }} />
                  </tr>
                </thead>
                <tbody>
                  {courses.map((c, idx) => (
                    <tr key={idx}>
                      {COURSE_FIELDS.map((f) => (
                        <td key={f.key} style={{ textAlign: f.center ? 'center' : 'left' }}>
                          <input
                            type="text"
                            className={`scheme-input${f.mono ? ' is-mono' : ''}${f.center ? ' is-center' : ''}`}
                            value={c[f.key] ?? ''}
                            onChange={(e) => updateCourse(idx, f.key, e.target.value)}
                            placeholder={f.label}
                          />
                        </td>
                      ))}
                      <td>
                        <button
                          type="button"
                          className="scheme-row-remove"
                          onClick={() => removeCourse(idx)}
                          aria-label={`Remove course ${c.code || idx + 1}`}
                          title="Remove"
                        >
                          ×
                        </button>
                      </td>
                    </tr>
                  ))}
                  <tr>
                    <td colSpan={COURSE_FIELDS.length + 1}>
                      <button type="button" className="scheme-row-add" onClick={addCourse}>
                        + Add course
                      </button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {error && <div className="scheme-dialog-error">{error}</div>}

        <footer className="scheme-dialog-footer">
          <span style={{ fontSize: 12, color: 'var(--text-muted, rgba(255,255,255,0.45))' }}>
            Saving updates both counts and the course roster.
          </span>
          <div className="scheme-dialog-actions">
            <button
              type="button"
              className="scheme-btn scheme-btn--ghost"
              onClick={onClose}
              disabled={busy}
            >
              Cancel
            </button>
            <button
              type="button"
              className="scheme-btn scheme-btn--primary"
              onClick={handleSave}
              disabled={busy}
            >
              {busy ? 'Saving…' : 'Save baseline'}
            </button>
          </div>
        </footer>
      </div>
    </div>
  )
}
