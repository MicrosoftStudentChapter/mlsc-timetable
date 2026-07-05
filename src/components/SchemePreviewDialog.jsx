// Full-screen modal for reviewing + editing a parsed course-scheme PDF
// before it's written to the baselines.
//
// Consumes the raw preview shape returned by `POST /admin/scheme/preview`
// and lets the admin:
//   * inspect keyline → baseline mapping and existing course counts
//   * edit each course row (code, title, category, L/T/P/Cr)
//   * add/remove rows
//   * toggle merge behaviour (union with existing courses vs. replace)
// On save, calls `onApply(editedPlan, { merge, source })` — the parent
// wires this to `applySchemePlan` which POSTs the JSON plan directly
// (no PDF re-parse).

import { useEffect, useMemo, useRef, useState } from 'react'
import './SchemePreviewDialog.css'

const COURSE_FIELDS = [
  { key: 'code', label: 'Code', width: 100, mono: true },
  { key: 'title', label: 'Title', width: null },
  { key: 'category', label: 'Cat', width: 60 },
  { key: 'L', label: 'L', width: 48, center: true },
  { key: 'T', label: 'T', width: 48, center: true },
  { key: 'P', label: 'P', width: 48, center: true },
  { key: 'Cr', label: 'Cr', width: 56, center: true },
]

function emptyCourse() {
  return { code: '', title: '', category: '', L: '', T: '', P: '', Cr: '' }
}

// Derive the student-facing semester number from a baseline key like
// `E1B` or `O2C`.  Formula: sem = 2*year - (1 if parity is 'O' else 0).
// Falls back to the parser's canonical sem when the key is malformed so
// the UI never shows an empty label.
function semFromBaselineKey(key, fallback) {
  const m = /^([EO])(\d+)/.exec(String(key || '').toUpperCase())
  if (!m) return fallback ?? '?'
  const year = parseInt(m[2], 10)
  if (!Number.isFinite(year)) return fallback ?? '?'
  return m[1] === 'O' ? 2 * year - 1 : 2 * year
}

// Deep-copy the plan so local edits don't mutate the parent state.
function clonePlan(plan) {
  return (plan || []).map((row) => ({
    ...row,
    courses: (row.courses || []).map((c) => ({ ...c })),
  }))
}

export default function SchemePreviewDialog({
  open,
  preview,
  branchLabel,
  busy,
  onApply,
  onClose,
}) {
  const [editedPlan, setEditedPlan] = useState(() => clonePlan(preview?.plan))
  const [activeIdx, setActiveIdx] = useState(0)
  const [merge, setMerge] = useState(false)
  const [error, setError] = useState(null)
  const dialogRef = useRef(null)

  // Reset local state whenever a fresh preview is fed in.
  useEffect(() => {
    if (!open) return
    setEditedPlan(clonePlan(preview?.plan))
    setActiveIdx(0)
    setMerge(false)
    setError(null)
  }, [open, preview])

  // Close on Escape while open.
  useEffect(() => {
    if (!open) return
    const onKey = (e) => {
      if (e.key === 'Escape' && !busy) onClose?.()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, busy, onClose])

  const active = editedPlan[activeIdx]

  const totalCourses = useMemo(
    () => editedPlan.reduce((sum, s) => sum + (s.courses?.length || 0), 0),
    [editedPlan],
  )

  if (!open || !preview) return null

  function updateCourse(courseIdx, field, value) {
    setEditedPlan((plan) => {
      const next = clonePlan(plan)
      next[activeIdx].courses[courseIdx][field] = value
      return next
    })
  }

  function addCourse() {
    setEditedPlan((plan) => {
      const next = clonePlan(plan)
      next[activeIdx].courses.push(emptyCourse())
      return next
    })
  }

  function removeCourse(courseIdx) {
    setEditedPlan((plan) => {
      const next = clonePlan(plan)
      next[activeIdx].courses.splice(courseIdx, 1)
      return next
    })
  }

  async function handleApply() {
    setError(null)
    // Only keep rows that have at least a code (empty rows are noise).
    const cleaned = editedPlan.map((sem) => ({
      baseline_key: sem.baseline_key,
      semester: sem.semester,
      courses: (sem.courses || []).filter((c) => (c.code || '').trim()).map((c) => ({
        code: (c.code || '').trim().toUpperCase(),
        title: (c.title || '').trim(),
        category: (c.category || '').trim(),
        L: c.L ?? '',
        T: c.T ?? '',
        P: c.P ?? '',
        Cr: c.Cr ?? '',
      })),
    }))
    try {
      await onApply?.(cleaned, { merge, source: preview.source })
    } catch (err) {
      setError(err?.message || String(err))
    }
  }

  return (
    <div className="scheme-dialog-backdrop" onClick={busy ? undefined : onClose}>
      <div
        className="scheme-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="scheme-dialog-title"
        ref={dialogRef}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="scheme-dialog-header">
          <div>
            <h2 id="scheme-dialog-title" className="scheme-dialog-title">
              Review scheme
            </h2>
            <p className="scheme-dialog-sub">
              <strong>{branchLabel || preview.branch}</strong>
              {' · '}
              <code>{preview.source}</code>
              {' · '}
              {preview.semester_count} semester{preview.semester_count === 1 ? '' : 's'} detected
              {' · '}
              {totalCourses} course{totalCourses === 1 ? '' : 's'} across{' '}
              {editedPlan.length} baseline{editedPlan.length === 1 ? '' : 's'}
            </p>
          </div>
          <button
            type="button"
            className="scheme-dialog-close"
            onClick={onClose}
            disabled={busy}
            aria-label="Close preview"
          >
            ×
          </button>
        </header>

        <div className="scheme-dialog-body">
          <div className="scheme-tabs" role="tablist">
            {editedPlan.map((sem, idx) => {
              const displaySem = semFromBaselineKey(sem.baseline_key, sem.semester)
              return (
              <button
                key={sem.baseline_key}
                type="button"
                role="tab"
                aria-selected={idx === activeIdx}
                className={`scheme-tab ${idx === activeIdx ? 'is-active' : ''}`}
                onClick={() => setActiveIdx(idx)}
                title={`Baseline ${sem.baseline_key} (Sem ${displaySem} of that stream)`}
              >
                <span className="scheme-tab-sem">Sem {displaySem}</span>
                <span className="scheme-tab-key">{sem.baseline_key}</span>
                <span className={`scheme-tab-count ${sem.would_create ? 'is-new' : ''}`}>
                  {sem.courses?.length ?? 0}
                </span>
              </button>
              )
            })}
          </div>

          {active && (
            <div className="scheme-detail">
              <div className="scheme-meta">
                <div className="scheme-meta-row">
                  <span className="scheme-meta-label">Baseline key</span>
                  <span className="scheme-meta-value">
                    <code>{active.baseline_key}</code>
                    {active.keyline && active.keyline !== active.baseline_key.slice(0, active.baseline_key.length - 1) && (
                      <span
                        className="scheme-meta-hint"
                        title="Parser detected this block as the semester on the left. It maps to the baseline on the right for the target stream — Pool B has swapped parity at year 1, so O1 lands on E1B (and E1 lands on O1B). For other cohorts the mapping is straightforward."
                      >
                        {' '}(from PDF's <code>{active.keyline}</code>)
                      </span>
                    )}
                  </span>
                </div>
                <div className="scheme-meta-row">
                  <span className="scheme-meta-label">Semester (for this stream)</span>
                  <span className="scheme-meta-value">
                    Sem {semFromBaselineKey(active.baseline_key, active.semester)} · Year {active.year}
                  </span>
                </div>
                <div className="scheme-meta-row">
                  <span className="scheme-meta-label">Existing baseline</span>
                  <span className="scheme-meta-value">
                    {active.would_create
                      ? <span className="scheme-badge scheme-badge--new">new</span>
                      : `${active.existing_course_count} courses (will be ${merge ? 'merged' : 'replaced'})`}
                  </span>
                </div>
                {active.option_count > 1 && (
                  <div className="scheme-meta-row">
                    <span className="scheme-meta-label">Alternatives</span>
                    <span className="scheme-meta-value">
                      {active.option_count} option groups flattened
                    </span>
                  </div>
                )}
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
                      <th style={{ width: 40 }} aria-label="Actions" />
                    </tr>
                  </thead>
                  <tbody>
                    {(active.courses || []).map((c, cIdx) => (
                      <tr key={cIdx}>
                        {COURSE_FIELDS.map((f) => (
                          <td
                            key={f.key}
                            style={{ textAlign: f.center ? 'center' : 'left' }}
                          >
                            <input
                              type="text"
                              className={`scheme-input${f.mono ? ' is-mono' : ''}${f.center ? ' is-center' : ''}`}
                              value={c[f.key] ?? ''}
                              onChange={(e) => updateCourse(cIdx, f.key, e.target.value)}
                              placeholder={f.label}
                            />
                          </td>
                        ))}
                        <td>
                          <button
                            type="button"
                            className="scheme-row-remove"
                            onClick={() => removeCourse(cIdx)}
                            aria-label={`Remove course ${c.code || cIdx + 1}`}
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
          )}
        </div>

        {error && <div className="scheme-dialog-error">{error}</div>}

        <footer className="scheme-dialog-footer">
          <label className="scheme-merge-label">
            <input
              type="checkbox"
              checked={merge}
              onChange={(e) => setMerge(e.target.checked)}
              disabled={busy}
            />
            Merge with existing courses (keep any codes already on the baseline)
          </label>
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
              onClick={handleApply}
              disabled={busy || editedPlan.length === 0}
            >
              {busy ? 'Applying…' : `Apply to ${editedPlan.length} baseline${editedPlan.length === 1 ? '' : 's'}`}
            </button>
          </div>
        </footer>
      </div>
    </div>
  )
}
