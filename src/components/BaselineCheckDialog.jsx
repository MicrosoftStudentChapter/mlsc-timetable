// Modal that shows the doctor result after clicking "Check" on a baseline row.
// Receives the full response from POST /admin/baselines/{key}/check.

import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import './BaselineCheckDialog.css'

const TOTAL_KEY = 'total'

function sign(n) {
  return n > 0 ? `+${n}` : String(n)
}

function StatusBadge({ status }) {
  if (status === 'ok') return <span className="bcd-badge bcd-badge-ok">All matched</span>
  if (status === 'mismatch') return <span className="bcd-badge bcd-badge-error">Mismatches found</span>
  if (status === 'no_timetables') return <span className="bcd-badge bcd-badge-warn">No timetables</span>
  if (status === 'no_baseline') return <span className="bcd-badge bcd-badge-warn">No baseline</span>
  return null
}

export default function BaselineCheckDialog({ result, onClose }) {
  const open = result !== null && result !== undefined

  // Close on Escape
  useEffect(() => {
    if (!open) return
    const onKey = (e) => { if (e.key === 'Escape') onClose?.() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const {
    status,
    baseline_key: key,
    group,
    batches,
    written = 0,
    deleted = 0,
    result: groupResult,
  } = result

  const expected = groupResult?.expected || {}
  const expectedSource = groupResult?.expected_source
  const outliers = groupResult?.outliers || []
  const matching = groupResult?.matching ?? (batches - outliers.length)
  const courseCheck = groupResult?.course_check

  // Derive the sorted list of type columns from expected + outlier counts
  const typeKeys = Array.from(new Set([
    ...Object.keys(expected).filter((k) => k !== TOTAL_KEY),
    ...outliers.flatMap((o) => Object.keys(o.counts || {}).filter((k) => k !== TOTAL_KEY)),
  ])).sort()

  const batchesWithMissing = courseCheck?.batches_with_missing || []
  const batchesWithExtra = courseCheck?.batches_with_extra || []
  const hasCourseIssues = batchesWithMissing.length > 0 || batchesWithExtra.length > 0

  return (
    <div className="bcd-backdrop" onClick={onClose}>
      <div
        className="bcd-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="bcd-title"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Header ── */}
        <header className="bcd-header">
          <div className="bcd-header-left">
            <h2 id="bcd-title" className="bcd-title">
              Check: <span className="bcd-key">{key}</span>
              <span className="bcd-group">Group {group}</span>
            </h2>
            <StatusBadge status={status} />
          </div>
          <button type="button" className="bcd-close" onClick={onClose} aria-label="Close">✕</button>
        </header>

        <div className="bcd-body">
          {/* ── Summary bar ── */}
          <div className="bcd-summary">
            <span className="bcd-stat"><strong>{batches}</strong> batch{batches !== 1 ? 'es' : ''} checked</span>
            <span className="bcd-sep">·</span>
            <span className="bcd-stat bcd-stat-ok"><strong>{matching}</strong> matching</span>
            {outliers.length > 0 && <>
              <span className="bcd-sep">·</span>
              <span className="bcd-stat bcd-stat-error"><strong>{outliers.length}</strong> mismatched</span>
            </>}
          </div>

          {/* ── Expected counts ── */}
          {expectedSource !== 'none' && Object.keys(expected).length > 0 && (
            <div className="bcd-expected">
              <span className="bcd-expected-label">Expected per batch:</span>
              {typeKeys.map((t) => (
                expected[t] != null && <span key={t} className="bcd-expected-chip">{t} {expected[t]}</span>
              ))}
              {expected[TOTAL_KEY] != null && (
                <span className="bcd-expected-chip bcd-expected-total">total {expected[TOTAL_KEY]}</span>
              )}
            </div>
          )}

          {/* ── No timetables ── */}
          {status === 'no_timetables' && (
            <div className="bcd-empty">
              No timetable data found for group {group}. Ingest a spreadsheet first.
            </div>
          )}

          {/* ── No baseline (counts not configured) ── */}
          {status === 'no_baseline' && (
            <div className="bcd-empty">
              No per-type counts configured on this baseline yet. The count check was skipped.
            </div>
          )}

          {/* ── Count outliers table ── */}
          {outliers.length > 0 && (
            <section className="bcd-section">
              <h3 className="bcd-section-title">Count mismatches ({outliers.length} batch{outliers.length !== 1 ? 'es' : ''})</h3>
              <div className="bcd-scroll">
                <table className="bcd-table">
                  <thead>
                    <tr>
                      <th>Batch</th>
                      {typeKeys.map((t) => <th key={t}>{t}</th>)}
                      <th>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {outliers.map((o) => (
                      <tr key={o.batch}>
                        <td className="bcd-mono">{o.batch}</td>
                        {typeKeys.map((t) => {
                          const actual = o.counts?.[t] ?? 0
                          const delta = o.deltas?.[t]
                          return (
                            <td key={t}>
                              {actual}
                              {delta != null && delta !== 0 && (
                                <span className={`bcd-delta ${delta > 0 ? 'pos' : 'neg'}`}>
                                  {' '}{sign(delta)}
                                </span>
                              )}
                            </td>
                          )
                        })}
                        <td>
                          {o.counts?.[TOTAL_KEY] ?? 0}
                          {o.deltas?.[TOTAL_KEY] != null && o.deltas[TOTAL_KEY] !== 0 && (
                            <span className={`bcd-delta ${o.deltas[TOTAL_KEY] > 0 ? 'pos' : 'neg'}`}>
                              {' '}{sign(o.deltas[TOTAL_KEY])}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* ── Course check ── */}
          {hasCourseIssues && (
            <section className="bcd-section">
              <h3 className="bcd-section-title">Course mismatches</h3>
              {batchesWithMissing.length > 0 && (
                <div className="bcd-course-group">
                  <div className="bcd-course-group-label">Missing courses</div>
                  <div className="bcd-scroll">
                    <table className="bcd-table">
                      <thead><tr><th>Batch</th><th>Missing codes</th></tr></thead>
                      <tbody>
                        {batchesWithMissing.map((row) => (
                          <tr key={row.batch}>
                            <td className="bcd-mono">{row.batch}</td>
                            <td>{(row.missing || []).join(', ')}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
              {batchesWithExtra.length > 0 && (
                <div className="bcd-course-group">
                  <div className="bcd-course-group-label">Extra courses (not in baseline)</div>
                  <div className="bcd-scroll">
                    <table className="bcd-table">
                      <thead><tr><th>Batch</th><th>Extra codes</th></tr></thead>
                      <tbody>
                        {batchesWithExtra.map((row) => (
                          <tr key={row.batch}>
                            <td className="bcd-mono">{row.batch}</td>
                            <td>{(row.extra || []).join(', ')}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </section>
          )}

          {/* ── All matched ── */}
          {status === 'ok' && outliers.length === 0 && !hasCourseIssues && (
            <div className="bcd-all-ok">
              All {batches} batch{batches !== 1 ? 'es' : ''} match the baseline.
            </div>
          )}

          {/* ── Logged errors notice ── */}
          {written > 0 && (
            <div className="bcd-logged">
              <span className="bcd-logged-icon">ℹ</span>
              {written} issue{written !== 1 ? 's' : ''} logged to the Fix page.{' '}
              <Link
                to="/admin/fix?type=BASELINE_MISMATCH"
                className="bcd-logged-link"
                onClick={onClose}
              >
                View in Fix page →
              </Link>
            </div>
          )}
          {written === 0 && deleted > 0 && (
            <div className="bcd-logged bcd-logged-cleared">
              <span className="bcd-logged-icon">✓</span>
              {deleted} stale error{deleted !== 1 ? 's' : ''} cleared from the Fix page.
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <footer className="bcd-footer">
          <button type="button" className="bcd-close-btn" onClick={onClose}>Close</button>
        </footer>
      </div>
    </div>
  )
}
