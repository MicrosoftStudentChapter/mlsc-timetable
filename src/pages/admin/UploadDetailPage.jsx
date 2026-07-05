// Single UploadAttemptDoc — summary stats + live per-type triage of the
// parsing errors this ingest produced. Errors come from the ParsingErrorDoc
// collection (not the embedded snapshot), so counts reflect current triage.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getUpload, getErrorsSummary, listErrors } from '../../lib/admin'
import './admin.css'

function fmtDate(iso) {
  if (!iso) return '—'
  try { return new Date(iso).toLocaleString() } catch { return iso }
}

const SEV_RANK = { error: 3, warn: 2, warning: 2, info: 1 }
const ORPHAN_TYPES = new Set(['BASELINE_MISSING', 'BASELINE_MISMATCH', 'doctor_mismatch'])

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

