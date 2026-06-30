// Change-request moderation — list pending / approved / rejected proposals
// from users and approve or reject them. Approval rewrites the canonical
// timetable for every batch in scope (batch-scope = single batch; class-scope
// = every batch sharing the 3-char prefix).

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  listChangeRequests,
  approveChangeRequest,
  rejectChangeRequest,
  AdminAuthError,
} from '../../lib/admin'
import './admin.css'

const STATUS_TABS = [
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
  { value: '', label: 'All' },
]

function errMessage(err) {
  if (err instanceof AdminAuthError) return err.detail?.error || err.message
  return err?.message || 'Unknown error'
}

function fmtDate(iso) {
  if (!iso) return '—'
  try { return new Date(iso).toLocaleString() } catch { return iso }
}

function fmtEntry(entry) {
  if (!entry || typeof entry !== 'object') return '—'
  const code = entry.code || ''
  const subject = entry.subject || ''
  const type = entry.type || ''
  const room = entry.room ? ` @ ${entry.room}` : ''
  const time = entry.end_time ? ` (${entry.start_time}–${entry.end_time})` : ''
  const head = [code, subject].filter(Boolean).join(' · ')
  return `${head}${time} ${type ? `[${type}]` : ''}${room}`.trim() || '—'
}

function RequestCard({ row, busy, onApprove, onReject }) {
  const [note, setNote] = useState('')
  const isPending = row.status === 'pending'

  return (
    <div className="admin-card" style={{ marginBottom: 12 }}>
      <div className="admin-card-header" style={{ alignItems: 'center' }}>
        <h3
          className="admin-card-title"
          style={{ textAlign: 'left', fontSize: 16, margin: 0 }}
        >
          {row.kind?.toUpperCase()} · {row.scope}-scope · {row.requester_batch}
        </h3>
        <span className={`status-pill ${row.status === 'approved' ? 'ok' : row.status === 'rejected' ? 'failed' : 'partial'}`}>
          {row.status}
        </span>
      </div>

      <div className="cr-meta">
        <div><span className="cr-key">Slot</span> {row.day} · {row.start_time}</div>
        <div><span className="cr-key">Semester</span> {row.semester || '—'}</div>
        <div><span className="cr-key">Requester</span> <code>{row.requester_id || 'anon'}</code></div>
        <div><span className="cr-key">Created</span> {fmtDate(row.created_at)}</div>
        {row.decided_at && (
          <div><span className="cr-key">Decided</span> {fmtDate(row.decided_at)}</div>
        )}
        {row.decision_note && (
          <div><span className="cr-key">Note</span> {row.decision_note}</div>
        )}
      </div>

      <div className="cr-entry">
        <span className="cr-key">Entry</span> {fmtEntry(row.entry)}
      </div>

      {isPending && (
        <div className="cr-actions">
          <input
            type="text"
            className="upload-input"
            placeholder="Optional decision note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={500}
            style={{ flex: 1, marginRight: 8 }}
          />
          <button
            type="button"
            className="upload-btn"
            onClick={() => onApprove(row.id, note)}
            disabled={busy}
            style={{ background: '#16a34a', marginRight: 8 }}
          >
            Approve
          </button>
          <button
            type="button"
            className="upload-btn"
            onClick={() => onReject(row.id, note)}
            disabled={busy}
            style={{ background: '#dc2626' }}
          >
            Reject
          </button>
        </div>
      )}
    </div>
  )
}

export default function ChangeRequestsPage() {
  const [status, setStatus] = useState('pending')
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await listChangeRequests(status ? { status } : {})
      setItems(data?.items || [])
    } catch (err) {
      setError(err)
    } finally {
      setLoading(false)
    }
  }, [status])

  useEffect(() => { refresh() }, [refresh])

  async function decide(id, note, fn) {
    setBusy(id)
    setError(null)
    try {
      await fn(id, note?.trim() || undefined)
      await refresh()
    } catch (err) {
      setError(err)
    } finally {
      setBusy(null)
    }
  }

  const tabCounts = useMemo(() => ({
    [status || 'all']: items.length,
  }), [items, status])

  return (
    <>
      <div className="admin-card" style={{ marginBottom: 12 }}>
        <div className="admin-card-header" style={{ alignItems: 'center' }}>
          <h2 className="admin-card-title" style={{ textAlign: 'left' }}>Change requests</h2>
          <button
            type="button"
            className="admin-card-action"
            onClick={refresh}
            disabled={loading}
          >
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
        <p className="admin-card-sub" style={{ textAlign: 'left' }}>
          Approving a <code>batch</code>-scope request rewrites that single batch;
          a <code>class</code>-scope request rewrites every batch sharing the
          first three characters of the requester batch code.
        </p>
        <div className="cr-tabs">
          {STATUS_TABS.map((t) => (
            <button
              key={t.value || 'all'}
              type="button"
              className={`cr-tab${status === t.value ? ' active' : ''}`}
              onClick={() => setStatus(t.value)}
            >
              {t.label}
              {status === t.value && ` · ${tabCounts[t.value || 'all'] ?? 0}`}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="upload-result failed" style={{ marginBottom: 12 }}>
          {errMessage(error)}
        </div>
      )}

      {loading && <div className="admin-loading">Loading…</div>}
      {!loading && items.length === 0 && (
        <div className="admin-card">
          <div className="error-log-empty">
            No {status || 'change'} requests.
          </div>
        </div>
      )}
      {!loading && items.map((row) => (
        <RequestCard
          key={row.id}
          row={row}
          busy={busy === row.id}
          onApprove={(id, note) => decide(id, note, approveChangeRequest)}
          onReject={(id, note) => decide(id, note, rejectChangeRequest)}
        />
      ))}
    </>
  )
}
