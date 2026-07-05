// Full-screen modal for reviewing + editing a parsed academic-calendar
// PDF before it's written to the calendar_overrides collection.
//
// Consumes the raw preview returned by `POST /admin/calendar/preview`
// and lets the admin:
//   * pick the scope (global / years / branches) the overrides apply to
//   * see every derived override (holidays + follow-day rules) as an
//     editable row (date, kind, reason, follows-day)
//   * add/remove rows
//   * review ambiguities the parser flagged (MST/EST/Assessment weeks,
//     Sat teaching days without a lieu mapping)
// On save calls `onApply(editedPlan, { scope, scopeValues, replaceRange, source })`.

import { useEffect, useMemo, useState } from 'react'
import './CalendarPreviewDialog.css'

const WEEKDAY_LABELS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']

function clonePlan(plan) {
  return (plan || []).map((row) => ({ ...row }))
}

// Sort overrides chronologically for a stable review order.
function sortByDate(rows) {
  return [...rows].sort((a, b) => String(a.date).localeCompare(String(b.date)))
}

// Compute [minDate, maxDate] across every override + warning so the
// idempotent-replace window covers the whole calendar span.
function computeRange(rows, warnings) {
  const dates = []
  for (const r of rows || []) if (r?.date) dates.push(r.date)
  for (const w of warnings || []) if (w?.date) dates.push(w.date)
  if (dates.length === 0) return null
  dates.sort()
  return { start: dates[0], end: dates[dates.length - 1] }
}

function emptyRow() {
  return {
    date: '',
    kind: 'holiday',
    reason: '',
    follows_day: null,
  }
}

export default function CalendarPreviewDialog({
  open,
  preview,
  busy,
  defaultScope = 'global',
  defaultScopeValues = [],
  onApply,
  onClose,
}) {
  const [editedPlan, setEditedPlan] = useState(() => sortByDate(clonePlan(preview?.overrides)))
  const [scope, setScope] = useState(defaultScope)
  const [scopeValuesRaw, setScopeValuesRaw] = useState(
    Array.isArray(defaultScopeValues) ? defaultScopeValues.join(', ') : '',
  )
  const [replaceRange, setReplaceRange] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!open) return
    setEditedPlan(sortByDate(clonePlan(preview?.overrides)))
    setScope(defaultScope || 'global')
    setScopeValuesRaw(
      Array.isArray(defaultScopeValues) ? defaultScopeValues.join(', ') : '',
    )
    setReplaceRange(true)
    setError(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, preview])

  useEffect(() => {
    if (!open) return
    const onKey = (e) => {
      if (e.key === 'Escape' && !busy) onClose?.()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, busy, onClose])

  const range = useMemo(
    () => computeRange(preview?.overrides, preview?.warnings),
    [preview],
  )

  const counts = useMemo(() => {
    const c = { holiday: 0, follow_day: 0, mst: 0, est: 0, assessment: 0 }
    for (const r of editedPlan) {
      if (r?.kind && c[r.kind] !== undefined) c[r.kind]++
    }
    return c
  }, [editedPlan])

  if (!open || !preview) return null

  function updateRow(idx, patch) {
    setEditedPlan((rows) => {
      const next = clonePlan(rows)
      next[idx] = { ...next[idx], ...patch }
      // Drop follows_day when the kind isn't follow_day.
      if (patch.kind && patch.kind !== 'follow_day') next[idx].follows_day = null
      // Switching to follow_day → default Monday if missing.
      if (patch.kind === 'follow_day' && next[idx].follows_day == null) {
        next[idx].follows_day = 0
      }
      return next
    })
  }

  function removeRow(idx) {
    setEditedPlan((rows) => rows.filter((_, i) => i !== idx))
  }

  function addRow(seed) {
    setEditedPlan((rows) => [...rows, { ...emptyRow(), ...(seed || {}) }])
  }

  async function handleApply() {
    setError(null)
    const cleaned = editedPlan
      .filter((r) => (r.date || '').trim() && r.kind)
      .map((r) => ({
        date: r.date,
        kind: r.kind,
        reason: r.reason ? String(r.reason).trim() : null,
        follows_day: r.kind === 'follow_day' && Number.isInteger(r.follows_day)
          ? r.follows_day
          : null,
      }))
    try {
      await onApply?.(cleaned, {
        scope,
        scopeValues: scope === 'global'
          ? []
          : scopeValuesRaw
              .split(/[\s,]+/)
              .map((v) => v.trim())
              .filter(Boolean),
        replaceRange: replaceRange && range ? range : null,
        source: preview.source,
      })
    } catch (err) {
      setError(err?.message || String(err))
    }
  }

  return (
    <div className="cal-dialog-backdrop" onClick={busy ? undefined : onClose}>
      <div
        className="cal-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cal-dialog-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="cal-dialog-header">
          <div>
            <h2 id="cal-dialog-title" className="cal-dialog-title">Review calendar</h2>
            <p className="cal-dialog-sub">
              <code>{preview.source}</code>
              {' · '}
              <strong>{preview.sem_kind?.toUpperCase()}</strong> Sem {preview.year_start}
              {'\u2013'}{preview.year_end}
              {' · '}
              {counts.holiday} holiday{counts.holiday === 1 ? '' : 's'}, {counts.follow_day} follow-day rule{counts.follow_day === 1 ? '' : 's'}
              {counts.mst > 0 && <>, {counts.mst} MST</>}
              {counts.est > 0 && <>, {counts.est} EST</>}
              {counts.assessment > 0 && <>, {counts.assessment} assessment</>}
              {(preview.warnings?.length || 0) > 0 && (
                <>{' · '}{preview.warnings.length} warning{preview.warnings.length === 1 ? '' : 's'}</>
              )}
            </p>
          </div>
          <button
            type="button"
            className="cal-dialog-close"
            onClick={onClose}
            disabled={busy}
            aria-label="Close preview"
          >×</button>
        </header>

        <div className="cal-dialog-body">
          {/* Scope selector — applies to every row uniformly. */}
          <div className="cal-scope">
            <label className="cal-scope-field">
              <span className="cal-scope-label">Applies to</span>
              <select value={scope} onChange={(e) => setScope(e.target.value)}>
                <option value="global">Everyone (global)</option>
                <option value="year">Specific years</option>
                <option value="branch">Specific branches</option>
              </select>
            </label>
            {scope !== 'global' && (
              <label className="cal-scope-field cal-scope-field--wide">
                <span className="cal-scope-label">Values</span>
                <input
                  type="text"
                  placeholder={scope === 'year' ? '2, 3, 4' : '2A, 1E, 3B'}
                  value={scopeValuesRaw}
                  onChange={(e) => setScopeValuesRaw(e.target.value)}
                  required
                />
              </label>
            )}
            {range && (
              <label className="cal-scope-field cal-scope-inline" title="Recommended — makes re-uploading the same PDF idempotent.">
                <input
                  type="checkbox"
                  checked={replaceRange}
                  onChange={(e) => setReplaceRange(e.target.checked)}
                />
                <span>
                  Replace existing overrides between{' '}
                  <code>{range.start}</code> and <code>{range.end}</code>
                </span>
              </label>
            )}
          </div>

          {/* Warnings surfaced by the parser. */}
          {preview.warnings?.length > 0 && (
            <div className="cal-warnings">
              <div className="cal-warnings-head">
                <span className="cal-warnings-icon" aria-hidden="true">!</span>
                <span className="cal-warnings-title">
                  {preview.warnings.length} thing{preview.warnings.length === 1 ? '' : 's'} the parser wasn't sure about
                </span>
              </div>
              <ul className="cal-warnings-list">
                {preview.warnings.map((w, idx) => (
                  <li key={idx} className="cal-warnings-row">
                    {w.date && <code className="cal-warning-date">{w.date}</code>}
                    <span className="cal-warning-hint">{w.hint}</span>
                    {w.date && (
                      <button
                        type="button"
                        className="cal-warning-add"
                        onClick={() => addRow({
                          date: w.date,
                          kind: 'holiday',
                          reason: w.phase || 'Manual override',
                        })}
                      >
                        Add as holiday
                      </button>
                    )}
                    {w.date && (
                      <button
                        type="button"
                        className="cal-warning-add"
                        onClick={() => addRow({
                          date: w.date,
                          kind: 'follow_day',
                          follows_day: 0,
                          reason: w.hint || null,
                        })}
                      >
                        Add as follow-day
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Editable override rows. */}
          <div className="cal-table-wrap">
            <table className="cal-table">
              <thead>
                <tr>
                  <th style={{ width: 140 }}>Date</th>
                  <th style={{ width: 130 }}>Kind</th>
                  <th style={{ width: 160 }}>Follows day</th>
                  <th>Reason</th>
                  <th style={{ width: 40 }} aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {editedPlan.length === 0 && (
                  <tr>
                    <td colSpan={5} className="cal-empty">
                      No overrides — parser found no holidays or follow-day
                      rules. Add one manually if needed.
                    </td>
                  </tr>
                )}
                {editedPlan.map((row, idx) => (
                  <tr key={`${row.date || 'new'}-${idx}`}>
                    <td>
                      <input
                        type="date"
                        className="cal-input"
                        value={row.date || ''}
                        onChange={(e) => updateRow(idx, { date: e.target.value })}
                      />
                    </td>
                    <td>
                      <select
                        className="cal-input"
                        value={row.kind || 'holiday'}
                        onChange={(e) => updateRow(idx, { kind: e.target.value })}
                      >
                        <option value="holiday">Holiday</option>
                        <option value="follow_day">Follows day</option>
                        <option value="mst">MST week</option>
                        <option value="est">EST week</option>
                        <option value="assessment">Assessment</option>
                      </select>
                    </td>
                    <td>
                      {row.kind === 'follow_day' ? (
                        <select
                          className="cal-input"
                          value={row.follows_day ?? 0}
                          onChange={(e) => updateRow(idx, { follows_day: Number(e.target.value) })}
                        >
                          {WEEKDAY_LABELS.map((label, i) => (
                            <option key={i} value={i}>{label}</option>
                          ))}
                        </select>
                      ) : (
                        <span className="cal-muted">—</span>
                      )}
                    </td>
                    <td>
                      <input
                        type="text"
                        className="cal-input"
                        value={row.reason || ''}
                        placeholder={row.kind === 'holiday' ? 'e.g. Diwali' : 'e.g. compensatory day'}
                        onChange={(e) => updateRow(idx, { reason: e.target.value })}
                        maxLength={140}
                      />
                    </td>
                    <td>
                      <button
                        type="button"
                        className="cal-row-remove"
                        onClick={() => removeRow(idx)}
                        aria-label="Remove"
                        title="Remove"
                      >×</button>
                    </td>
                  </tr>
                ))}
                <tr>
                  <td colSpan={5}>
                    <button type="button" className="cal-row-add" onClick={() => addRow()}>
                      + Add override
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {error && <div className="cal-dialog-error">{error}</div>}

        <footer className="cal-dialog-footer">
          <div className="cal-dialog-actions">
            <button
              type="button"
              className="cal-btn cal-btn--ghost"
              onClick={onClose}
              disabled={busy}
            >Cancel</button>
            <button
              type="button"
              className="cal-btn cal-btn--primary"
              onClick={handleApply}
              disabled={busy || editedPlan.length === 0 || (scope !== 'global' && !scopeValuesRaw.trim())}
            >
              {busy ? 'Applying…' : `Apply ${editedPlan.length} override${editedPlan.length === 1 ? '' : 's'}`}
            </button>
          </div>
        </footer>
      </div>
    </div>
  )
}
