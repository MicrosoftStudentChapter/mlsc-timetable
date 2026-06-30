// Admin allowlist — list of emails granted admin access (env + DB).

import { useCallback, useEffect, useState } from 'react'
import {
  listAdminUsers,
  addAdminUser,
  deleteAdminUser,
  AdminAuthError,
} from '../../lib/admin'
import './admin.css'

function fmtDate(iso) {
  if (!iso) return '—'
  try { return new Date(iso).toLocaleString() } catch { return iso }
}

export default function AdminUsersPage() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [newEmail, setNewEmail] = useState('')
  const [newName, setNewName] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [removing, setRemoving] = useState(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await listAdminUsers()
      setItems(data?.items || [])
    } catch (err) {
      setError(err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { refresh() }, [refresh])

  async function onAdd(evt) {
    evt.preventDefault()
    if (!newEmail.trim() || submitting) return
    setSubmitting(true)
    setError(null)
    try {
      await addAdminUser({
        email: newEmail.trim().toLowerCase(),
        displayName: newName.trim() || null,
      })
      setNewEmail('')
      setNewName('')
      await refresh()
    } catch (err) {
      setError(err)
    } finally {
      setSubmitting(false)
    }
  }

  async function onRemove(email) {
    if (!window.confirm(`Remove admin access for ${email}?`)) return
    setRemoving(email)
    try {
      await deleteAdminUser(email)
      await refresh()
    } catch (err) {
      setError(err)
    } finally {
      setRemoving(null)
    }
  }

  return (
    <>
      <div className="admin-card" style={{ marginBottom: 16 }}>
        <h2 className="admin-card-title" style={{ textAlign: 'left' }}>Add an admin</h2>
        <p className="admin-card-sub" style={{ textAlign: 'left' }}>
          Use the email associated with their Clerk account — they'll get
          access immediately after signing in.
        </p>
        <form className="upload-form" onSubmit={onAdd} style={{ marginTop: 12 }}>
          <div>
            <label htmlFor="admin-email">Email</label>
            <input
              id="admin-email"
              type="email"
              className="upload-input"
              placeholder="name@example.com"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              required
            />
          </div>
          <div>
            <label htmlFor="admin-name">Display name (optional)</label>
            <input
              id="admin-name"
              type="text"
              className="upload-input"
              placeholder="e.g. Anay"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
            />
          </div>
          <button type="submit" className="upload-btn" disabled={submitting || !newEmail.trim()}>
            {submitting ? 'Adding…' : 'Add admin'}
          </button>
        </form>
      </div>

      <div className="admin-card">
        <h2 className="admin-card-title" style={{ textAlign: 'left', marginBottom: 12 }}>
          Allowlist
        </h2>

        {error && (
          <div className="upload-result failed" style={{ marginBottom: 12 }}>
            {error instanceof AdminAuthError
              ? error.detail?.error || error.message
              : (error.message || 'Unknown error')}
          </div>
        )}

        {loading && <div className="admin-loading">Loading…</div>}
        {!loading && items.length === 0 && (
          <div className="error-log-empty">No admins configured.</div>
        )}
        {!loading && items.length > 0 && (
          <table className="uploads-table">
            <thead>
              <tr>
                <th>Email</th>
                <th>Display name</th>
                <th>Source</th>
                <th>Added</th>
                <th>Added by</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {items.map((row) => (
                <tr key={`${row.source}-${row.email}`}>
                  <td style={{ fontFamily: 'var(--mono, monospace)' }}>{row.email}</td>
                  <td>{row.display_name || '—'}</td>
                  <td>
                    <span className={`status-pill ${row.source === 'env' ? 'partial' : 'ok'}`}>
                      {row.source}
                    </span>
                  </td>
                  <td>{fmtDate(row.added_at)}</td>
                  <td>{row.added_by || '—'}</td>
                  <td>
                    {row.source === 'env' ? (
                      <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                        env-managed
                      </span>
                    ) : (
                      <button
                        type="button"
                        className="admin-card-action"
                        onClick={() => onRemove(row.email)}
                        disabled={removing === row.email}
                        style={{ color: '#f87171' }}
                      >
                        {removing === row.email ? 'Removing…' : 'Remove'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  )
}
