// Single UploadAttemptDoc — summary stats + live per-type triage of the
// parsing errors this ingest produced. Errors come from the ParsingErrorDoc
// collection (not the embedded snapshot), so counts reflect current triage.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  applyUploadReview,
  discardUploadReview,
  getUpload,
  getUploadChanges,
  getErrorsSummary,
  listErrors,
  saveUploadDecisions,
} from '../../lib/admin'
import './admin.css'

function fmtDate(iso) {
  if (!iso) return '—'
  try { return new Date(iso).toLocaleString() } catch { return iso }
}

const SEV_RANK = { error: 3, warn: 2, warning: 2, info: 1 }
const ORPHAN_TYPES = new Set(['BASELINE_MISSING', 'BASELINE_MISMATCH', 'doctor_mismatch'])
const CHANGE_LABELS = {
  modified: 'Details changed',
  moved: 'Class moved',
  replaced: 'Class replaced',
  added: 'New class',
  removed: 'Class removed',
}

function entrySearch(entry) {
  if (!entry) return ''
  return [entry.subject, entry.code, entry.teacher, entry.room, entry.day, entry.start_time, entry.type]
    .filter(Boolean).join(' ').toLowerCase()
}

function ChangeSnapshot({ entry, emptyLabel, changedFields = [] }) {
  if (!entry) return <div className="ir-empty-snapshot">{emptyLabel}</div>
  const changed = new Set(changedFields)
  return (
    <div className="ir-snapshot">
      <div className="ir-snapshot-top">
        <span className="ir-session-type">{entry.type || 'Class'}</span>
        <span className={changed.has('day') || changed.has('start_time') ? 'is-changed' : ''}>
          {entry.day || '—'} · {entry.start_time || '—'}{entry.end_time ? `–${entry.end_time}` : ''}
        </span>
      </div>
      <strong className={changed.has('subject') ? 'is-changed' : ''}>{entry.subject || entry.code || 'Untitled class'}</strong>
      <code className={changed.has('code') ? 'is-changed' : ''}>{entry.code || 'No course code'}</code>
      <div className="ir-snapshot-meta">
        <span className={changed.has('teacher') ? 'is-changed' : ''}>Teacher {entry.teacher || '—'}</span>
        <span className={changed.has('room') ? 'is-changed' : ''}>Room {entry.room || '—'}</span>
        {entry.alternate_week_start != null && (
          <span className={changed.has('alternate_week_start') ? 'is-changed' : ''}>Week {entry.alternate_week_start}</span>
        )}
      </div>
      {Array.isArray(entry.options) && entry.options.length > 0 && (
        <details className={changed.has('options') ? 'ir-options is-changed' : 'ir-options'}>
          <summary>{entry.options.length} elective option{entry.options.length === 1 ? '' : 's'}</summary>
          <div>
            {entry.options.map((option, index) => (
              <span key={`${option.subject_code || 'option'}-${index}`}>
                <code>{option.subject_code || 'No code'}</code>
                {option.subject_name && <b>{option.subject_name}</b>}
                <small>{[option.type, option.place, option.teacher].filter(Boolean).join(' · ')}</small>
              </span>
            ))}
          </div>
        </details>
      )}
    </div>
  )
}

function ReviewConfirm({ mode, count, onCancel, onConfirm, busy }) {
  const apply = mode === 'apply'
  return (
    <div className="fix-modal-backdrop" onClick={busy ? undefined : onCancel}>
      <div className="ir-confirm" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <span className={`ir-confirm-icon ${apply ? 'is-apply' : 'is-discard'}`}>{apply ? '✓' : '×'}</span>
        <h2>{apply ? 'Publish reviewed timetable changes?' : 'Discard this upload?'}</h2>
        <p>
          {apply
            ? `${count} uploaded change${count === 1 ? '' : 's'} will be applied. Current choices marked “Keep current” remain untouched.`
            : 'The staged comparison will be closed. Live timetables will not change.'}
        </p>
        <div className="ir-confirm-actions">
          <button type="button" className="uploads-refresh" onClick={onCancel} disabled={busy}>Cancel</button>
          <button type="button" className={apply ? 'ir-primary-btn' : 'ir-danger-btn'} onClick={onConfirm} disabled={busy}>
            {busy ? 'Working…' : apply ? 'Publish changes' : 'Discard upload'}
          </button>
        </div>
      </div>
    </div>
  )
}

function IngestReviewPanel({ uploadId, upload, onChanged }) {
  const [review, setReview] = useState(null)
  const [query, setQuery] = useState('')
  const [kind, setKind] = useState('all')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [confirmMode, setConfirmMode] = useState(null)

  const loadReview = useCallback(async () => {
    try {
      const data = await getUploadChanges(uploadId)
      setReview(data)
      setError(null)
    } catch (err) {
      setError(err)
    }
  }, [uploadId])

  useEffect(() => { loadReview() }, [loadReview])

  const batches = review?.batches || []
  const allChanges = batches.flatMap((batch) =>
    (batch.changes || []).map((change) => ({ ...change, batch_code: batch.batch_code })))
  const unresolved = allChanges.filter((change) => !change.decision).length
  const accepted = allChanges.filter((change) => change.decision === 'use_uploaded').length
  const state = review?.upload?.ingest_state || upload.ingest_state
  const normalizedQuery = query.trim().toLowerCase()

  const visibleBatches = batches.map((batch) => ({
    ...batch,
    visibleChanges: (batch.changes || []).filter((change) => {
      if (kind !== 'all' && change.kind !== kind) return false
      if (!normalizedQuery) return true
      return `${entrySearch(change.before)} ${entrySearch(change.after)} ${batch.batch_code.toLowerCase()}`.includes(normalizedQuery)
    }),
  })).filter((batch) => batch.visibleChanges.length > 0)

  async function decide(decisions) {
    setBusy(true)
    try {
      await saveUploadDecisions(uploadId, decisions)
      setReview((current) => ({
        ...current,
        batches: (current?.batches || []).map((batch) => ({
          ...batch,
          changes: (batch.changes || []).map((change) => (
            decisions[change.change_id]
              ? { ...change, decision: decisions[change.change_id] }
              : change
          )),
        })),
      }))
      setError(null)
    } catch (err) {
      setError(err)
    } finally {
      setBusy(false)
    }
  }

  async function confirmAction() {
    setBusy(true)
    try {
      if (confirmMode === 'apply') await applyUploadReview(uploadId)
      else await discardUploadReview(uploadId)
      setConfirmMode(null)
      await Promise.all([loadReview(), onChanged?.()])
    } catch (err) {
      setError(err)
      setConfirmMode(null)
    } finally {
      setBusy(false)
    }
  }

  if (!review && !error) return <div className="admin-card ir-panel"><div className="admin-loading">Loading timetable comparison…</div></div>
  if (!review && error) return null
  if (!batches.length && !['pending_review', 'applied', 'discarded'].includes(state)) return null

  return (
    <div className="admin-card ir-panel">
      <div className="ir-header">
        <div>
          <div className="ir-eyebrow">Spreadsheet review</div>
          <h2 className="admin-card-title">Choose the timetable changes to publish</h2>
          <p className="admin-card-sub">
            Nothing below reaches students until you resolve every row and publish it.
          </p>
        </div>
        <span className={`ir-state ir-state-${state}`}>{String(state || '').replaceAll('_', ' ')}</span>
      </div>

      <div className="ir-summary">
        <div><strong>{allChanges.length}</strong><span>differences</span></div>
        <div><strong>{batches.filter((batch) => batch.changes?.length).length}</strong><span>batches affected</span></div>
        <div><strong>{unresolved}</strong><span>awaiting choice</span></div>
        <div><strong>{accepted}</strong><span>using uploaded</span></div>
      </div>

      {error && <div className="upload-result failed">{error.detail?.error || error.message || 'Review action failed'}</div>}

      {state === 'pending_review' && (
        <>
          <div className="ir-toolbar">
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search batch, course, teacher or room…" />
            <select value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="all">All change types</option>
              {Object.entries(CHANGE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            <button type="button" onClick={() => decide(Object.fromEntries(allChanges.map((c) => [c.change_id, 'keep_current'])))} disabled={busy || !allChanges.length}>Keep all current</button>
            <button type="button" onClick={() => decide(Object.fromEntries(allChanges.map((c) => [c.change_id, 'use_uploaded'])))} disabled={busy || !allChanges.length}>Use all uploaded</button>
          </div>

          {allChanges.length === 0 ? (
            <div className="ir-no-changes">The spreadsheet matches the live timetable. You can close or publish this review without changing any class.</div>
          ) : visibleBatches.length === 0 ? (
            <div className="ir-no-changes">No timetable changes match these filters.</div>
          ) : (
            <div className="ir-batches">
              {visibleBatches.map((batch, index) => (
                <details key={batch.batch_code} className="ir-batch" open={index === 0 || visibleBatches.length <= 4}>
                  <summary>
                    <span><code>{batch.batch_code}</code>{batch.source_sheet && <small>{batch.source_sheet}</small>}</span>
                    <span>{batch.visibleChanges.length} shown · {(batch.changes || []).filter((c) => !c.decision).length} unresolved</span>
                  </summary>
                  <div className="ir-change-list">
                    {batch.visibleChanges.map((change) => (
                      <article key={change.change_id} className={`ir-change is-${change.decision || 'unresolved'}`}>
                        <header>
                          <span className={`ir-kind ir-kind-${change.kind}`}>{CHANGE_LABELS[change.kind] || change.kind}</span>
                          <span className="ir-fields">{(change.changed_fields || []).join(' · ')}</span>
                        </header>
                        <div className="ir-compare">
                          <div><span className="ir-side-label">Current</span><ChangeSnapshot entry={change.before} emptyLabel="No current class" changedFields={change.changed_fields} /></div>
                          <span className="ir-arrow" aria-hidden="true">→</span>
                          <div><span className="ir-side-label">Uploaded</span><ChangeSnapshot entry={change.after} emptyLabel="Class absent from upload" changedFields={change.changed_fields} /></div>
                        </div>
                        <footer>
                          <button type="button" className={change.decision === 'keep_current' ? 'is-selected' : ''} onClick={() => decide({ [change.change_id]: 'keep_current' })} disabled={busy}>Keep current</button>
                          <button type="button" className={change.decision === 'use_uploaded' ? 'is-selected is-uploaded' : ''} onClick={() => decide({ [change.change_id]: 'use_uploaded' })} disabled={busy}>Use uploaded</button>
                        </footer>
                      </article>
                    ))}
                  </div>
                </details>
              ))}
            </div>
          )}

          <div className="ir-publish-bar">
            <div><strong>{unresolved ? `${unresolved} choices remaining` : 'Ready to publish'}</strong><span>{accepted} uploaded changes selected</span></div>
            <button type="button" className="ir-discard-btn" onClick={() => setConfirmMode('discard')} disabled={busy}>Discard upload</button>
            <button type="button" className="ir-primary-btn" onClick={() => setConfirmMode('apply')} disabled={busy || unresolved > 0}>Publish reviewed changes</button>
          </div>
        </>
      )}

      {state !== 'pending_review' && (
        <div className="ir-closed-state">
          {state === 'applied'
            ? 'This reviewed upload has been published.'
            : state === 'discarded'
              ? 'This upload was discarded; the live timetable was not changed.'
              : 'This upload review is closed.'}
        </div>
      )}

      {confirmMode && <ReviewConfirm mode={confirmMode} count={accepted} onCancel={() => setConfirmMode(null)} onConfirm={confirmAction} busy={busy} />}
    </div>
  )
}

function TypeGroupRow({ group, uploadId, samples, onLoadSamples, expanded, onToggle }) {
  const total = group.total || (group.open + group.resolved + group.ignored)
  const openPct = total > 0 ? (group.open / total) * 100 : 0
  const resolvedPct = total > 0 ? (group.resolved / total) * 100 : 0
  const ignoredPct = total > 0 ? (group.ignored / total) * 100 : 0

  return (
    <div className={`ud-group${expanded ? ' is-open' : ''}`}>
      <button
        type="button"
        className="ud-group-head"
        onClick={() => {
          onToggle(group.error_type)
          if (!expanded && !samples) onLoadSamples(group.error_type)
        }}
        aria-expanded={expanded}
      >
        <span className={`ud-caret${expanded ? ' is-open' : ''}`}>▸</span>
        <code className="ud-group-code">{group.error_type}</code>
        <span className="ud-group-bar" aria-hidden="true">
          {resolvedPct > 0 && <span className="ud-bar-seg ud-bar-resolved" style={{ width: `${resolvedPct}%` }} />}
          {ignoredPct > 0 && <span className="ud-bar-seg ud-bar-ignored" style={{ width: `${ignoredPct}%` }} />}
          {openPct > 0 && <span className="ud-bar-seg ud-bar-open" style={{ width: `${openPct}%` }} />}
        </span>
        <span className="ud-group-counts">
          {group.open > 0 && (
            <span className="ud-count ud-count-open" title="Open">
              <span className="ud-count-dot" /> {group.open}
            </span>
          )}
          {group.resolved > 0 && (
            <span className="ud-count ud-count-resolved" title="Resolved">
              <span className="ud-count-dot" /> {group.resolved}
            </span>
          )}
          {group.ignored > 0 && (
            <span className="ud-count ud-count-ignored" title="Ignored">
              <span className="ud-count-dot" /> {group.ignored}
            </span>
          )}
        </span>
        <Link
          to={
            group.error_type === 'BASELINE_MISSING' || group.error_type === 'BASELINE_MISMATCH' || group.error_type === 'doctor_mismatch'
              ? `/admin/fix?type=${encodeURIComponent(group.error_type)}`
              : `/admin/fix?upload=${encodeURIComponent(uploadId)}&type=${encodeURIComponent(group.error_type)}`
          }
          className="ud-group-jump"
          onClick={(e) => e.stopPropagation()}
        >
          Fix →
        </Link>
      </button>

      {expanded && (
        <div className="ud-group-body">
          {!samples && <div className="ud-samples-loading">Loading samples…</div>}
          {samples && samples.length === 0 && (
            <div className="ud-samples-empty">No open rows — all resolved or ignored.</div>
          )}
          {samples && samples.length > 0 && (
            <div className="ud-samples">
              {samples.map((row) => (
                <div key={row.id} className="ud-sample">
                  <span className={`ud-sample-sev sev-${row.severity || 'warn'}`} title={row.severity} />
                  <span className="ud-sample-batch">
                    {row.batch_code ? <code>{row.batch_code}</code> : <span className="ud-dim">—</span>}
                  </span>
                  <span className="ud-sample-where">
                    {row.day ? row.day.slice(0, 3) : ''}{row.start_time ? ` ${row.start_time}` : ''}
                  </span>
                  <span className="ud-sample-msg" title={row.message}>{row.message}</span>
                </div>
              ))}
              {samples.length >= 10 && (
                <Link
                  to={
                    ORPHAN_TYPES.has(group.error_type)
                      ? `/admin/fix?type=${encodeURIComponent(group.error_type)}`
                      : `/admin/fix?upload=${encodeURIComponent(uploadId)}&type=${encodeURIComponent(group.error_type)}`
                  }
                  className="ud-samples-more"
                >
                  See all {group.open} open →
                </Link>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function UploadDetailPage() {
  const { id } = useParams()
  const [doc, setDoc] = useState(null)
  const [summary, setSummary] = useState(null)
  const [samplesByType, setSamplesByType] = useState({}) // type -> row[]
  const [expanded, setExpanded] = useState(() => new Set())
  const [statusFilter, setStatusFilter] = useState('all') // all|open|resolved|ignored
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [refreshing, setRefreshing] = useState(false)

  const load = useCallback(async () => {
    setRefreshing(true)
    try {
      const [d, s] = await Promise.all([
        getUpload(id),
        getErrorsSummary({ uploadId: id }),
      ])
      setDoc(d)
      setSummary(s)
      setError(null)
    } catch (err) {
      setError(err)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [id])

  useEffect(() => { load() }, [load])

  const loadSamples = useCallback(async (errorType) => {
    try {
      const res = await listErrors({
        uploadId: ORPHAN_TYPES.has(errorType) ? undefined : id,
        errorType,
        status: 'open',
        limit: 10,
      })
      setSamplesByType((prev) => ({ ...prev, [errorType]: res.items || [] }))
    } catch {
      setSamplesByType((prev) => ({ ...prev, [errorType]: [] }))
    }
  }, [id])

  const filteredGroups = useMemo(() => {
    const groups = summary?.by_type || []
    const withCount = groups.filter((g) => {
      if (statusFilter === 'all') return (g.total || 0) > 0
      return (g[statusFilter] || 0) > 0
    })
    // Severity-ish sort: highest OPEN count first, then resolved.
    return withCount.slice().sort((a, b) => (b.open - a.open) || (b.total - a.total))
  }, [summary, statusFilter])

  if (loading) return <div className="admin-loading">Loading…</div>
  if (error) {
    return (
      <div className="upload-result failed">
        {error.detail?.error || error.message || 'Failed to load upload'}
      </div>
    )
  }
  if (!doc) return null

  const conf = doc.confidence_summary || {}
  const doctor = doc.doctor || {}
  const totals = summary?.totals || { open: 0, resolved: 0, ignored: 0 }
  const grand = summary?.grand_total || 0
  const resolvedPct = grand > 0 ? Math.round((totals.resolved / grand) * 100) : 0

  return (
    <>
      <div className="admin-card" style={{ marginBottom: 16 }}>
        <Link to="/admin/uploads" className="admin-back-link" style={{ marginBottom: 12, display: 'inline-block' }}>
          ← All uploads
        </Link>
        <h2 className="admin-card-title" style={{ textAlign: 'left' }}>
          {doc.filename || 'Upload'} — <span className={`status-pill ${doc.status}`}>{doc.status}</span>
        </h2>
        <p className="admin-card-sub" style={{ textAlign: 'left' }}>
          {fmtDate(doc.started_at)} · by {doc.actor_kind === 'user' ? doc.actor_email : (doc.actor_kind || 'unknown')}
        </p>

        <div className="admin-stats-row" style={{ marginTop: 16, gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}>
          <div className="stat-card stat-card--green">
            <span className="stat-card-label">Batches</span>
            <span className="stat-card-value">{doc.batches_written}</span>
          </div>
          <div className="stat-card stat-card--slate">
            <span className="stat-card-label">Classes</span>
            <span className="stat-card-value">{doc.classes_written}</span>
          </div>
          <div className="stat-card stat-card--purple">
            <span className="stat-card-label">Blocks parsed</span>
            <span className="stat-card-value">{doc.total_blocks}</span>
            <span className="stat-card-sub">
              HIGH {conf.HIGH || 0} · MEDIUM {conf.MEDIUM || 0} · LOW {conf.LOW || 0} · UNRELIABLE {conf.UNRELIABLE || 0}
            </span>
          </div>
          <div className="stat-card stat-card--blue">
            <span className="stat-card-label">Errors</span>
            <span className="stat-card-value">{grand}</span>
            <span className="stat-card-sub">
              {totals.open} open · {totals.resolved} resolved · {totals.ignored} ignored
              {doctor.mismatched_groups != null && <> · {doctor.consistent_groups}/{doctor.total_groups} groups OK</>}
            </span>
          </div>
        </div>

        {doc.failure_message && (
          <div className="upload-result failed" style={{ marginTop: 16 }}>
            {doc.failure_message}
          </div>
        )}
      </div>

      <IngestReviewPanel uploadId={id} upload={doc} onChanged={load} />

      <div className="admin-card">
        <div className="ud-panel-head">
          <div>
            <h2 className="admin-card-title" style={{ textAlign: 'left', margin: 0 }}>
              Parsing errors
            </h2>
            <p className="admin-card-sub" style={{ textAlign: 'left', margin: '4px 0 0' }}>
              {resolvedPct}% resolved · {totals.open} still open across {filteredGroups.length} type{filteredGroups.length === 1 ? '' : 's'}
            </p>
          </div>
          <div className="ud-panel-toolbar">
            <div className="ud-filter-group" role="group" aria-label="Filter by status">
              {['all', 'open', 'resolved', 'ignored'].map((s) => (
                <button
                  key={s}
                  type="button"
                  className={`ud-filter${statusFilter === s ? ' is-active' : ''}`}
                  onClick={() => setStatusFilter(s)}
                >
                  {s === 'all' ? 'All' : s[0].toUpperCase() + s.slice(1)}
                  <span className="ud-filter-count">
                    {s === 'all' ? grand : (totals[s] || 0)}
                  </span>
                </button>
              ))}
            </div>
            <button
              type="button"
              className="uploads-refresh"
              onClick={load}
              disabled={refreshing}
            >
              {refreshing ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>
        </div>

        {grand === 0 ? (
          <div className="error-log-empty" style={{ marginTop: 16 }}>
            No errors on this run. 🎉
          </div>
        ) : filteredGroups.length === 0 ? (
          <div className="error-log-empty" style={{ marginTop: 16 }}>
            No errors match this filter.
          </div>
        ) : (
          <div className="ud-groups">
            {filteredGroups.map((g) => (
              <TypeGroupRow
                key={g.error_type}
                group={g}
                uploadId={id}
                samples={samplesByType[g.error_type]}
                onLoadSamples={loadSamples}
                expanded={expanded.has(g.error_type)}
                onToggle={(t) => setExpanded((prev) => {
                  const next = new Set(prev)
                  if (next.has(t)) next.delete(t)
                  else next.add(t)
                  return next
                })}
              />
            ))}
          </div>
        )}
      </div>
    </>
  )
}
