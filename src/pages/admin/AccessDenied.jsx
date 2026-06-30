// "You aren't an admin" landing — shows the caller's signed-in email so they
// can ask an existing admin to whitelist it via POST /admin/users.

import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuthUser } from '../../lib/auth'
import './admin.css'

function extractEmail(user) {
  if (!user) return null
  if (typeof user.primaryEmailAddress?.emailAddress === 'string') {
    return user.primaryEmailAddress.emailAddress
  }
  const list = user.emailAddresses || []
  if (Array.isArray(list) && list.length > 0) {
    return list[0]?.emailAddress || null
  }
  return null
}

export default function AccessDenied({ error, status }) {
  const { user } = useAuthUser()
  const email = extractEmail(user)
  const [copied, setCopied] = useState(false)

  function copy() {
    if (!navigator.clipboard || !email) return
    navigator.clipboard
      .writeText(email)
      .then(() => {
        setCopied(true)
        window.setTimeout(() => setCopied(false), 1500)
      })
      .catch(() => {})
  }

  const isNetwork = status === 'error'
  const isNotSignedIn = status === 'not_signed_in'

  let title = 'Access denied'
  let detail = 'Your email is not on the admin allowlist. Share the address below with an existing admin so they can add you.'
  if (isNetwork) {
    title = 'Could not reach the backend'
    detail = 'The admin API did not respond. Try again, or check the backend is running.'
  } else if (isNotSignedIn) {
    title = 'Sign in required'
    detail = 'Sign in with your admin account to use the admin panel.'
  }

  return (
    <div className="admin-app">
      <div className="admin-gate">
        <div className="admin-gate-card">
          <h1 className="admin-gate-title">{title}</h1>
          <p className="admin-gate-body">{detail}</p>

          {!isNetwork && !isNotSignedIn && email && (
            <div className="admin-gate-uid">
              <span>{email}</span>
              <button type="button" className="admin-gate-copy" onClick={copy}>
                {copied ? 'COPIED' : 'COPY'}
              </button>
            </div>
          )}

          {error?.detail?.error && (
            <p className="admin-gate-body" style={{ fontSize: 12, opacity: 0.7 }}>
              {error.detail.error}
            </p>
          )}

          <div className="admin-gate-actions">
            <Link to="/" className="admin-gate-link">← Back to site</Link>
            {isNotSignedIn && (
              <Link to="/login" className="admin-gate-link">Sign in →</Link>
            )}
            {isNetwork && (
              <button
                type="button"
                className="admin-gate-link"
                onClick={() => window.location.reload()}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  font: 'inherit',
                }}
              >
                Retry
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
