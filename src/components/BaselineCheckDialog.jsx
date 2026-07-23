// Modal that shows the doctor result after clicking "Check" on a baseline row.
// Receives the full response from POST /admin/baselines/{key}/check.

import { Fragment, useEffect, useMemo, useState } from 'react'
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

  const {
    status,
    baseline_key: key,
    group,
    batches,
    written = 0,
    deleted = 0,
    result: groupResult,
  } = result || {}

  const expected = groupResult?.expected || {}
  const expectedSource = groupResult?.expected_source
  const outliers = groupResult?.outliers || []
  const matching = groupResult?.matching ?? (batches - outliers.length)
  const courseCheck = groupResult?.course_check

  // Derive the sorted list of type columns from expected + outlier counts
  const typeKeys = Array.from(new Set([
    ...Object.keys(expected).filter((k) => k !== TOTAL_KEY && isScalar(expected[k])),
    ...outliers.flatMap((o) => Object.keys(o.counts || {}).filter((k) => k !== TOTAL_KEY && isScalar(o.counts[k]))),
  ])).sort()

  const hasCourseIssues = Boolean(courseCheck?.has_drift)
  const [expandedBatches, setExpandedBatches] = useState(() => new Set())

  const batchDiagnostics = useMemo(() => {
    const byBatch = new Map()
    for (const outlier of outliers) {
      byBatch.set(outlier.batch, { batch: outlier.batch, outlier, course: null })
    }
    for (const [batch, detail] of Object.entries(courseCheck?.per_batch_detail || {})) {
      const row = byBatch.get(batch) || { batch, outlier: null, course: null }
      row.course = detail
      byBatch.set(batch, row)
    }
    return [...byBatch.values()].sort((a, b) => a.batch.localeCompare(b.batch))
  }, [outliers, courseCheck])

  function toggleBatch(batch) {
    setExpandedBatches((current) => {
      const next = new Set(current)
      if (next.has(batch)) next.delete(batch)
      else next.add(batch)
      return next
    })
  }

  if (!open) return null

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
                isScalar(expected[t]) && <span key={t} className="bcd-expected-chip">{t} {expected[t]}</span>
              ))}
              {isScalar(expected[TOTAL_KEY]) && (
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

          {/* ── Per-batch diagnostics ── */}
          {batchDiagnostics.length > 0 && (
            <section className="bcd-section">
              <h3 className="bcd-section-title">Batch diagnostics ({batchDiagnostics.length})</h3>
              <div className="bcd-scroll">
                <table className="bcd-table">
                  <thead>
                    <tr>
                      <th></th><th>Batch</th>
                      {typeKeys.map((t) => <th key={t}>{t}</th>)}
                      <th>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {batchDiagnostics.map((diagnostic) => {
                      const o = diagnostic.outlier
                      const course = diagnostic.course
                      const expanded = expandedBatches.has(diagnostic.batch)
                      const countDeltas = o?.deltas || {}
                      const courseDeltas = course?.course_deltas || []
                      const missing = course?.missing_details || []
                      const extra = course?.extra_details || []
                      return (
                      <Fragment key={diagnostic.batch}>
                      <tr className="bcd-expand-row">
                        <td>
                          <button type="button" className="bcd-expand-btn" onClick={() => toggleBatch(diagnostic.batch)} aria-expanded={expanded}>
                            {expanded ? '▾' : '▸'}
                          </button>
                        </td>
                        <td className="bcd-mono">{diagnostic.batch}</td>
                        {typeKeys.map((t) => {
                          const actual = o?.counts?.[t] ?? 0
                          const delta = countDeltas[t]
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
                          {o?.counts?.[TOTAL_KEY] ?? '—'}
                          {countDeltas[TOTAL_KEY] != null && countDeltas[TOTAL_KEY] !== 0 && (
                            <span className={`bcd-delta ${countDeltas[TOTAL_KEY] > 0 ? 'pos' : 'neg'}`}>
                              {' '}{sign(countDeltas[TOTAL_KEY])}
                            </span>
                          )}
                        </td>
                      </tr>
                      {expanded && (
                        <tr className="bcd-detail-row">
                          <td colSpan={typeKeys.length + 3}>
                            <div className="bcd-batch-detail">
                              <strong>What differs in {diagnostic.batch}</strong>
                              {Object.keys(countDeltas).length > 0 && (
                                <div className="bcd-detail-line"><b>Overall type delta:</b> {formatDeltas(countDeltas)}</div>
                              )}
                              {missing.length > 0 && (
                                <div className="bcd-detail-block"><b>Missing courses:</b> {missing.map((item) => `${item.code}${item.title ? ` (${item.title})` : ''}${formatExpectedSuffix(item.expected)}`).join(', ')}</div>
                              )}
                              {extra.length > 0 && (
                                <div className="bcd-detail-block"><b>Extra courses:</b> {extra.map((item) => `${item.code}${item.actual ? ` (${formatTypeCounts(item.actual)})` : ''}`).join(', ')}</div>
                              )}
                              {courseDeltas.length > 0 && (
                                <div className="bcd-detail-block">
                                  <b>Course-level differences:</b>
                                  {courseDeltas.map((item) => (
                                    <div key={item.code} className="bcd-course-delta-row">
                                      <span className="bcd-mono">{item.code}</span>{item.title && <span>{item.title}</span>}
                                      <span>expected {formatTypeCounts(item.expected)}</span>
                                      <span>actual {formatTypeCounts(item.actual)}</span>
                                      <strong>{formatDeltas(item.deltas)}</strong>
                                    </div>
                                  ))}
                                </div>
                              )}
                              {Object.keys(countDeltas).length === 0 && missing.length === 0 && extra.length === 0 && courseDeltas.length === 0 && (
                                <div className="bcd-detail-line">No detailed course data was returned for this mismatch.</div>
                              )}
                              {courseDeltas.length === 0 && Object.keys(countDeltas).length > 0 && (
                                <div className="bcd-detail-line"><b>Course attribution unavailable:</b> this legacy result only contains aggregate type counts. Re-run the check after the updated backend is deployed.</div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                      </Fragment>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* ── All matched ── */}
          {status === 'ok' && batchDiagnostics.length === 0 && !hasCourseIssues && (
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

function formatTypeCounts(counts) {
  return ['Lecture', 'Tutorial', 'Practical']
    .filter((type) => counts?.[type] != null || counts?.[type] === 0)
    .map((type) => `${type[0]} ${counts[type] ?? 0}`)
    .join(' · ') || '—'
}

function formatDeltas(deltas) {
  return ['Lecture', 'Tutorial', 'Practical']
    .filter((type) => deltas?.[type] != null)
    .map((type) => `${type[0]} ${sign(deltas[type])}`)
    .join(' · ') || '—'
}

function formatExpectedSuffix(counts) {
  const formatted = formatTypeCounts(counts)
  return formatted === '—' ? '' : ` [expected ${formatted}]`
}

function isScalar(value) {
  return value == null || typeof value === 'string' || typeof value === 'number'
}
