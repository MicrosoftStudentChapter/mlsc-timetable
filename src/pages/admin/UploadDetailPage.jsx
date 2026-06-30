// Single UploadAttemptDoc — all per-error rows + doctor summary.

import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getUpload } from '../../lib/admin'
import './admin.css'

function fmtDate(iso) {
  if (!iso) return '—'
  try { return new Date(iso).toLocaleString() } catch { return iso }
}

export default function UploadDetailPage() {
  const { id } = useParams()
  const [doc, setDoc] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    getUpload(id)
      .then((data) => { if (!cancelled) setDoc(data) })
      .catch((err) => { if (!cancelled) setError(err) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [id])

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
            <span className="stat-card-label">Errors / mismatches</span>
            <span className="stat-card-value">{doc.error_count}</span>
            <span className="stat-card-sub">
              {doctor.mismatched_groups != null && (
                <>{doctor.consistent_groups}/{doctor.total_groups} groups consistent</>
              )}
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
        <h2 className="admin-card-title" style={{ textAlign: 'left', marginBottom: 12 }}>
          Parsing errors ({doc.errors?.length || 0})
        </h2>
        <div className="error-log" style={{ maxHeight: 'none' }}>
          {(doc.errors || []).map((row, idx) => (
            <div className="error-row" key={`${row.batch}-${row.day}-${row.start_time}-${row.code}-${idx}`}>
              <span className="error-row-batch">{row.batch || '—'}</span>
              <span className="error-row-slot">{row.day?.slice(0, 3)} {row.start_time}</span>
              <span className="error-row-msg">{row.message || row.code}</span>
              <span className={`error-row-sev sev-${row.severity}`}>{row.severity}</span>
            </div>
          ))}
          {(!doc.errors || doc.errors.length === 0) && (
            <div className="error-log-empty">No parser warnings on this run.</div>
          )}
        </div>
      </div>
    </>
  )
}
