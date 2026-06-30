// Contributors — GitHub usernames shown on the landing page scroller.
// The backend stores only the username; avatars are fetched live.

import { useCallback, useEffect, useState } from 'react'
import {
  listContributors,
  addContributor,
  deleteContributor,
  AdminAuthError,
} from '../../lib/admin'
import './admin.css'

function errMessage(err) {
  if (err instanceof AdminAuthError) return err.detail?.error || err.message
  return err?.message || 'Unknown error'
}

// Hit the public GitHub API directly to confirm the username resolves.
// Returns the resolved profile on 200 (handles renames — GitHub redirects
// old logins to the current canonical one), null on 404, or throws on
// network / rate-limit failures (so the caller can surface that distinctly).
async function verifyGithubUser(username) {
  const url = `https://api.github.com/users/${encodeURIComponent(username)}`
  const res = await fetch(url, {
    headers: { Accept: 'application/vnd.github+json' },
  })
  if (res.status === 404) return null
  if (res.status === 403 || res.status === 429) {
    const err = new Error('GitHub rate limit hit while verifying — try again in a minute.')
    err.code = 'rate_limited'
    throw err
  }
  if (!res.ok) {
    const err = new Error(`GitHub returned ${res.status} while verifying.`)
    err.code = 'github_error'
    throw err
  }
  const data = await res.json()
  return {
    login: data.login,
    name: data.name,
    avatar_url: data.avatar_url,
    html_url: data.html_url,
  }
}

export default function ContributorsPage() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [removing, setRemoving] = useState(null)

  const [username, setUsername] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [preview, setPreview] = useState(null) // { login, name, avatar_url, html_url } | null

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await listContributors()
      setItems(Array.isArray(data) ? data : data?.items || [])
    } catch (err) {
      setError(err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { refresh() }, [refresh])

  // Clear the verified preview as soon as the username field changes.
  useEffect(() => { setPreview(null) }, [username])

  async function onAdd(evt) {
    evt.preventDefault()
    const clean = username.trim().replace(/^@/, '')
    if (!clean || submitting) return

    setSubmitting(true)
    setError(null)
    try {
      const profile = await verifyGithubUser(clean)
      if (!profile) {
        setError(new Error(`GitHub user "${clean}" does not exist.`))
        return
      }
      // Show the resolved profile in the UI before doing the write — this
      // also catches typos that resolve to a different (renamed) user.
      setPreview(profile)
      // Use the canonical login GitHub returned (renames get fixed here).
      await addContributor({
        username: profile.login,
        displayName: displayName.trim() || null,
      })
      setUsername('')
      setDisplayName('')
      setPreview(null)
      await refresh()
    } catch (err) {
      setError(err)
    } finally {
      setSubmitting(false)
    }
  }

  async function onRemove(login) {
    if (!window.confirm(`Remove ${login} from the contributors list?`)) return
    setRemoving(login)
    try {
      await deleteContributor(login)
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
        <h2 className="admin-card-title" style={{ textAlign: 'left' }}>Add a contributor</h2>
        <p className="admin-card-sub" style={{ textAlign: 'left' }}>
          The username is verified against GitHub before saving. If the user has
          renamed their account, GitHub's canonical login is stored.
        </p>
        <form className="upload-form" onSubmit={onAdd} style={{ marginTop: 12 }}>
          <div>
            <label htmlFor="contrib-username">GitHub username</label>
            <input
              id="contrib-username"
              type="text"
              className="upload-input"
              placeholder="octocat"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="off"
              required
            />
          </div>
          <div>
            <label htmlFor="contrib-name">Display name (optional override)</label>
            <input
              id="contrib-name"
              type="text"
              className="upload-input"
              placeholder="leave blank to use GitHub name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
          </div>

          {preview && (
            <div className="upload-result ok" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <img
                src={preview.avatar_url}
                alt={preview.login}
                width={28}
                height={28}
                style={{ borderRadius: '50%' }}
              />
              <span>
                Verified <strong>@{preview.login}</strong>
                {preview.name ? ` · ${preview.name}` : ''}
              </span>
            </div>
          )}

          <button type="submit" className="upload-btn" disabled={submitting || !username.trim()}>
            {submitting ? 'Verifying…' : 'Add contributor'}
          </button>
        </form>
      </div>

      <div className="admin-card">
        <div className="admin-card-header" style={{ alignItems: 'center' }}>
          <h2 className="admin-card-title" style={{ textAlign: 'left' }}>Roster</h2>
          <button
            type="button"
            className="admin-card-action"
            onClick={refresh}
            disabled={loading}
          >
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>

        {error && (
          <div className="upload-result failed" style={{ marginBottom: 12 }}>
            {errMessage(error)}
          </div>
        )}

        {loading && <div className="admin-loading">Loading…</div>}
        {!loading && items.length === 0 && (
          <div className="error-log-empty">No contributors configured.</div>
        )}
        {!loading && items.length > 0 && (
          <table className="uploads-table">
            <thead>
              <tr>
                <th></th>
                <th>Username</th>
                <th>Name</th>
                <th>Profile</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {items.map((row) => (
                <tr key={row.login || row.username}>
                  <td>
                    {row.avatar_url ? (
                      <img
                        src={row.avatar_url}
                        alt={row.login}
                        width={28}
                        height={28}
                        style={{ borderRadius: '50%', display: 'block' }}
                        loading="lazy"
                      />
                    ) : (
                      <span style={{ opacity: 0.4 }}>—</span>
                    )}
                  </td>
                  <td style={{ fontFamily: 'var(--mono, monospace)' }}>{row.login || row.username}</td>
                  <td>{row.name || row.display_name || '—'}</td>
                  <td>
                    {row.html_url ? (
                      <a
                        href={row.html_url}
                        target="_blank"
                        rel="noreferrer"
                        className="admin-card-action"
                      >
                        github ↗
                      </a>
                    ) : '—'}
                  </td>
                  <td>
                    <button
                      type="button"
                      className="admin-card-action"
                      onClick={() => onRemove(row.login || row.username)}
                      disabled={removing === (row.login || row.username)}
                      style={{ color: '#f87171' }}
                    >
                      {removing === (row.login || row.username) ? 'Removing…' : 'Remove'}
                    </button>
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
