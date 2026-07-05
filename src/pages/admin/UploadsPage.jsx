// Uploads history — card grid of every UploadAttemptDoc, with per-upload
// triage stats (open / resolved / ignored + top error types). Stats reflect
// the current DB state at fetch time — fixing an error on the Fix page and
// hitting Refresh here will show updated counts.

import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getUploads } from '../../lib/admin'
import './admin.css'

function fmtDate(iso) {
  if (!iso) return '—'
  try {
    const d = new Date(iso)
    return d.toLocaleString(undefined, {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })
  } catch {
    return iso
  }
}

function fmtRelative(iso) {
  if (!iso) return ''
  const ms = Date.now() - new Date(iso).getTime()
  if (Number.isNaN(ms)) return ''
  if (ms < 60_000) return 'just now'
  const m = Math.floor(ms / 60_000)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d < 7) return `${d}d ago`
  return `${Math.floor(d / 7)}w ago`
}

function ErrorBar({ open, resolved, ignored }) {
  const total = open + resolved + ignored
  if (total === 0) return <div className="upload-bar upload-bar-empty">no errors</div>
  const pct = (n) => (n / total) * 100
  return (
    <div className="upload-bar" role="img" aria-label={`${open} open, ${resolved} resolved, ${ignored} ignored`}>
      {resolved > 0 && <span className="upload-bar-seg upload-bar-resolved" style={{ width: `${pct(resolved)}%` }} title={`${resolved} resolved`} />}
      {ignored > 0 && <span className="upload-bar-seg upload-bar-ignored" style={{ width: `${pct(ignored)}%` }} title={`${ignored} ignored`} />}
      {open > 0 && <span className="upload-bar-seg upload-bar-open" style={{ width: `${pct(open)}%` }} title={`${open} open`} />}
    </div>
  )
}

export default function UploadsPage() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [lastFetched, setLastFetched] = useState(null)
  const [refreshing, setRefreshing] = useState(false)

  const load = useCallback(async () => {
    setRefreshing(true)
    try {
      const data = await getUploads({ limit: 50 })
      setItems(data?.items || [])
      setLastFetched(new Date())
      setError(null)
    } catch (err) {
      setError(err)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  return (
    <div className="uploads-page">
      <div className="uploads-header">
        <div>
          <h1 className="uploads-title">Upload history</h1>
          <p className="uploads-sub">
            {items.length} upload{items.length === 1 ? '' : 's'}
            {lastFetched && ` · updated ${fmtRelative(lastFetched.toISOString())}`}
          </p>
        </div>
        <div className="uploads-toolbar">
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

      {error && (
        <div className="upload-result failed">
          {error.detail?.error || error.message || 'Failed to load uploads'}
        </div>
      )}

      {loading && <div className="admin-loading">Loading…</div>}
      {!loading && !error && items.length === 0 && (
        <div className="error-log-empty">No uploads yet.</div>
      )}

      {!loading && !error && items.length > 0 && (
        <div className="uploads-grid">
          {items.map((row) => {
            const open = row.errors_open ?? 0
            const resolved = row.errors_resolved ?? 0
            const ignored = row.errors_ignored ?? 0
            const total = row.errors_total ?? (open + resolved + ignored)
            const resolvedPct = total > 0 ? Math.round((resolved / total) * 100) : 0
            return (
              <Link
                to={`/admin/uploads/${row.id}`}
                key={row.id}
                className={`upload-card upload-card-${row.status}`}
              >
                <div className="upload-card-head">
                  <div className="upload-card-title" title={row.filename || ''}>
                    {row.filename || 'Untitled upload'}
                  </div>
                  <span className={`status-pill ${row.status}`}>{row.status}</span>
                </div>

                <div className="upload-card-meta">
                  <span title={fmtDate(row.started_at)}>{fmtRelative(row.started_at)}</span>
                  <span className="upload-card-dot">·</span>
                  <span>{row.semester_label || '—'}</span>
                  {row.actor_email && (
                    <>
                      <span className="upload-card-dot">·</span>
                      <span className="upload-card-actor" title={row.actor_email}>{row.actor_email}</span>
                    </>
                  )}
                </div>

                <div className="upload-card-stats">
                  <div className="upload-stat">
                    <span className="upload-stat-val">{row.batches_written ?? 0}</span>
                    <span className="upload-stat-label">batches</span>
                  </div>
                  <div className="upload-stat">
                    <span className="upload-stat-val">{row.classes_written ?? 0}</span>
                    <span className="upload-stat-label">classes</span>
                  </div>
                  <div className="upload-stat">
                    <span className="upload-stat-val">{total}</span>
                    <span className="upload-stat-label">errors</span>
                  </div>
                </div>

                <div className="upload-card-triage">
                  <div className="upload-triage-row">
                    <span className="upload-triage-label">
                      <span className="upload-triage-dot upload-triage-dot-open" />
                      {open} open
                    </span>
                    <span className="upload-triage-label">
                      <span className="upload-triage-dot upload-triage-dot-resolved" />
                      {resolved} resolved
                    </span>
                    {ignored > 0 && (
                      <span className="upload-triage-label">
                        <span className="upload-triage-dot upload-triage-dot-ignored" />
                        {ignored} ignored
                      </span>
                    )}
                    <span className="upload-triage-pct">{resolvedPct}% resolved</span>
                  </div>
                  <ErrorBar open={open} resolved={resolved} ignored={ignored} />
                </div>

                {(row.errors_top_types || []).length > 0 && (
                  <div className="upload-card-types">
                    {(row.errors_top_types || []).slice(0, 4).map((t) => (
                      <span key={t.error_type} className="upload-type-chip" title={t.error_type}>
                        <span className="upload-type-name">{t.error_type}</span>
                        <span className="upload-type-count">{t.count}</span>
                      </span>
                    ))}
                  </div>
                )}

                {row.failure_message && (
                  <div className="upload-card-failure" title={row.failure_message}>
                    {row.failure_message}
                  </div>
                )}
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}

