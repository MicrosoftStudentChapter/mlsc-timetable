// Uploads history — list of every UploadAttemptDoc.

import { useEffect, useState } from 'react'
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

export default function UploadsPage() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    getUploads({ limit: 200 })
      .then((data) => {
        if (cancelled) return
        setItems(data?.items || [])
      })
      .catch((err) => { if (!cancelled) setError(err) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  return (
    <div className="admin-card">
      <div className="admin-card-header">
        <h2 className="admin-card-title" style={{ textAlign: 'left' }}>Upload history</h2>
      </div>

      {loading && <div className="admin-loading">Loading…</div>}
      {error && (
        <div className="upload-result failed">
          {error.detail?.error || error.message || 'Failed to load uploads'}
        </div>
      )}
      {!loading && !error && items.length === 0 && (
        <div className="error-log-empty">No uploads yet.</div>
      )}
      {!loading && !error && items.length > 0 && (
        <table className="uploads-table">
          <thead>
            <tr>
              <th>When</th>
              <th>Semester</th>
              <th>File</th>
              <th>Sheet</th>
              <th>Actor</th>
              <th>Status</th>
              <th>Batches</th>
              <th>Classes</th>
              <th>Errors</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.map((row) => (
              <tr key={row.id}>
                <td>{fmtDate(row.started_at)}</td>
                <td>{row.semester_label || '—'}</td>
                <td>{row.filename || '—'}</td>
                <td>{row.sheet_selector || '—'}</td>
                <td>{row.actor_kind === 'user' ? row.actor_email : (row.actor_kind || '—')}</td>
                <td><span className={`status-pill ${row.status}`}>{row.status}</span></td>
                <td>{row.batches_written}</td>
                <td>{row.classes_written}</td>
                <td>{row.error_count}</td>
                <td><Link to={`/admin/uploads/${row.id}`} className="admin-card-action">View</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
