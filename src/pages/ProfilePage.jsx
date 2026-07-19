import { useEffect, useMemo, useState, useCallback } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { useUser, useClerk, useAuth } from '@clerk/clerk-react'
import { loadBatches } from '../lib/batches'
import Combobox from '../components/Combobox'
import { RequireAuth } from './LoginPage'
import { AUTH_ENABLED } from '../lib/auth'
import {
  getCalendarStatus,
  connectCalendar,
  enableCalendarSync,
  disableCalendarSync,
  triggerResync,
  disconnectCalendar,
  clearCalendarEvents,
} from '../lib/calendar_api'
import './ProfilePage.css'

function splitName(full) {
  const trimmed = (full || '').trim()
  if (!trimmed) return { firstName: '', lastName: '' }
  const parts = trimmed.split(/\s+/)
  const firstName = parts.shift() || ''
  const lastName = parts.join(' ')
  return { firstName, lastName }
}

function findBatchPath(years, batchCode) {
  if (!batchCode) return { year: '', stream: '', batch: '' }
  for (const y of years) {
    for (const s of y.streams ?? []) {
      if ((s.batches ?? []).includes(batchCode)) {
        return { year: y.label, stream: s.name, batch: batchCode }
      }
    }
  }
  return { year: '', stream: '', batch: '' }
}

function CalendarIcon() {
  return (
    <svg className="gcal-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3" y="5" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="1.8" />
      <path d="M7 3v4M17 3v4M3 9h18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M7 13h.01M12 13h.01M17 13h.01M7 17h.01M12 17h.01" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  )
}

// ── Confirmation Modal ────────────────────────────────────────────────────────
function ConfirmModal({ open, title, message, confirmLabel = 'Confirm', secondaryLabel = null, danger = false, onConfirm, onSecondary = null, onCancel }) {
  useEffect(() => {
    if (!open) return
    const fn = (e) => { if (e.key === 'Escape') onCancel() }
    document.addEventListener('keydown', fn)
    return () => document.removeEventListener('keydown', fn)
  }, [open, onCancel])

  if (!open) return null
  return (
    <div className="confirm-backdrop" onClick={onCancel}>
      <div className="confirm-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <h3 className="confirm-title">{title}</h3>
        <p className="confirm-message">{message}</p>
        <div className="confirm-actions">
          <button className="confirm-btn confirm-btn--ghost" onClick={onCancel}>Cancel</button>
          {secondaryLabel && onSecondary && (
            <button className="confirm-btn confirm-btn--ghost" onClick={onSecondary}>
              {secondaryLabel}
            </button>
          )}
          <button
            className={`confirm-btn ${danger ? 'confirm-btn--danger' : 'confirm-btn--primary'}`}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Google Calendar Card ──────────────────────────────────────────────────────

function GoogleCalendarCard({ savedBatch }) {
  const { getToken, isLoaded, isSignedIn } = useAuth()
  const [status, setStatus] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [confirm, setConfirm] = useState(null) // {title, message, confirmLabel, danger, onConfirm}

  const tk = useCallback(() => getToken(), [getToken])

  const reload = useCallback(async () => {
    try {
      const s = await getCalendarStatus(tk)
      setStatus(s)
    } catch (err) {
      setStatus({ configured: true, _loadError: err?.message || String(err) })
    }
  }, [tk])

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return
    reload()
    const id = setInterval(reload, 8000)
    return () => clearInterval(id)
  }, [reload, isLoaded, isSignedIn])

  if (!isLoaded || !isSignedIn) return null
  // Show loading state while fetching, hide only if explicitly not configured
  if (status && !status.configured) return null

  async function run(fn, label) {
    setBusy(true)
    setError('')
    try {
      await fn()
      await reload()
    } catch (err) {
      setError(err.message || `${label} failed`)
    } finally {
      setBusy(false)
    }
  }

  const handleConnect    = () => run(() => connectCalendar(tk), 'Connect')
  const handleEnable     = () => run(() => enableCalendarSync(savedBatch, tk), 'Enable')
  const handleDisable    = () => run(() => disableCalendarSync(tk), 'Disable')
  const handleResync     = () => run(() => triggerResync(savedBatch, tk), 'Sync')
  const handleClear      = () => setConfirm({
    title: 'Clear all events?',
    message: 'This will delete all MLSC timetable events from your Google Calendar. You can resync them at any time.',
    confirmLabel: 'Clear events',
    danger: true,
    onConfirm: () => { setConfirm(null); run(() => clearCalendarEvents(tk), 'Clear') },
  })
  const handleDisconnect = () => setConfirm({
    title: 'Disconnect Google Calendar?',
    message: 'Google access will be revoked. Do you also want to remove all MLSC timetable events from your Google Calendar?',
    confirmLabel: 'Remove events & disconnect',
    secondaryLabel: 'Disconnect only',
    danger: true,
    onConfirm: () => { setConfirm(null); run(() => disconnectCalendar(tk, true), 'Disconnect') },
    onSecondary: () => { setConfirm(null); run(() => disconnectCalendar(tk, false), 'Disconnect') },
  })

  const lastSync = status?.last_synced_at
    ? new Date(status.last_synced_at).toLocaleString()
    : null

  if (!status) {
    return (
      <div id="calendar" className="profile-card gcal-card">
        <div className="gcal-header">
          <CalendarIcon />
          <div>
            <h2 className="gcal-title">Google Calendar Sync</h2>
            <p className="gcal-subtitle" style={{ opacity: 0.5 }}>Loading…</p>
          </div>
        </div>
      </div>
    )
  }

  if (status._loadError) {
    return (
      <div className="profile-card gcal-card">
        <div className="gcal-header">
          <CalendarIcon />
          <div>
            <h2 className="gcal-title">Google Calendar Sync</h2>
            <p className="gcal-subtitle" style={{ color: '#f87171' }}>Error: {status._loadError}</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div id="calendar" className="profile-card gcal-card">
      <ConfirmModal
        open={!!confirm}
        title={confirm?.title}
        message={confirm?.message}
        confirmLabel={confirm?.confirmLabel}
        secondaryLabel={confirm?.secondaryLabel}
        danger={confirm?.danger}
        onConfirm={confirm?.onConfirm}
        onSecondary={confirm?.onSecondary}
        onCancel={() => setConfirm(null)}
      />
      <div className="gcal-header">
        <CalendarIcon />
        <div>
          <h2 className="gcal-title">Google Calendar Sync</h2>
          <p className="gcal-subtitle">Auto-push your timetable to Google Calendar</p>
        </div>
        {status.connected && status.enabled && (
          <span className="gcal-status-dot gcal-status-dot--on" title="Sync active" />
        )}
      </div>

      {error && <p className="gcal-error">{error}</p>}

      {status.last_error === 'invalid_grant' && (
        <p className="gcal-error">
          Google access was revoked.{' '}
          <button className="gcal-link" onClick={handleConnect} disabled={busy}>Reconnect</button>
          {' '}to restore sync.
        </p>
      )}

      {!status.connected ? (
        <div className="gcal-section">
          <p className="gcal-hint">
            Connect your Google account to sync your batch timetable into a dedicated calendar.
            Holidays and schedule changes push automatically when admins publish them.
          </p>
          {!savedBatch && (
            <p className="gcal-warn">Save your batch first before connecting.</p>
          )}
          <button
            className="gcal-btn gcal-btn--primary"
            onClick={handleConnect}
            disabled={busy || !savedBatch}
          >
            {busy ? 'Connecting…' : 'Connect Google Calendar'}
          </button>
        </div>
      ) : (
        <div className="gcal-section">
          <div className="gcal-info-grid">
            <span className="gcal-label">Account</span>
            <span className="gcal-value">{status.google_email}</span>
            {lastSync && <>
              <span className="gcal-label">Last synced</span>
              <span className="gcal-value">{lastSync}</span>
            </>}
            {status.batch_code && <>
              <span className="gcal-label">Syncing batch</span>
              <span className="gcal-value">{status.batch_code}</span>
            </>}
          </div>

          {/* Sync now — always available when connected */}
          <div className="gcal-actions">
             <button className="gcal-btn gcal-btn--secondary" onClick={handleResync} disabled={busy || !savedBatch}>
              {busy ? 'Syncing…' : 'Sync now'}
            </button>
          </div>

          {/* Auto-sync toggle — separate from manual sync */}
          <div className="gcal-autosync-row">
            <div className="gcal-autosync-label">
              <span className="gcal-autosync-title">Auto-sync</span>
              <span className="gcal-autosync-sub">
                {status.enabled
                  ? 'Syncs automatically when the admin publishes schedule changes'
                  : 'Off — changes won\'t push automatically'}
              </span>
            </div>
            <button
              className={`gcal-toggle${status.enabled ? ' gcal-toggle--on' : ''}`}
              onClick={status.enabled ? handleDisable : handleEnable}
              disabled={busy || (!status.enabled && !savedBatch)}
              aria-label={status.enabled ? 'Disable auto-sync' : 'Enable auto-sync'}
            >
              <span className="gcal-toggle-knob" />
            </button>
          </div>

          <div className="gcal-danger-row">
            <button className="gcal-link gcal-link--warn" onClick={handleClear} disabled={busy}>
              Clear all events
            </button>
            <button className="gcal-link gcal-link--danger" onClick={handleDisconnect} disabled={busy}>
              Disconnect
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function ProfileInner() {
  const { user, isLoaded } = useUser()
  const { signOut } = useClerk()
  const navigate = useNavigate()
  const location = useLocation()

  // Scroll to #calendar anchor when navigated with hash
  useEffect(() => {
    if (location.hash === '#calendar') {
      const el = document.getElementById('calendar')
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [location.hash])

  const [years, setYears] = useState([])
  const [yearInput, setYearInput] = useState('')
  const [streamInput, setStreamInput] = useState('')
  const [batchInput, setBatchInput] = useState('')

  const [nameInput, setNameInput] = useState('')
  const [originalName, setOriginalName] = useState('')

  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState(null)
  const [error, setError] = useState('')
  const [signingOut, setSigningOut] = useState(false)

  // Load the year→stream→batch tree once.
  useEffect(() => {
    let cancelled = false
    loadBatches()
      .then((y) => {
        if (!cancelled) setYears(Array.isArray(y) ? y : [])
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  // Seed inputs from Clerk profile + previously saved batch metadata.
  useEffect(() => {
    if (!user) return
    const full = user.fullName || [user.firstName, user.lastName].filter(Boolean).join(' ')
    setNameInput(full)
    setOriginalName(full)
  }, [user])

  // When years arrive (or saved batch changes), resolve year+stream from the
  // stored batch code so the three combos reflect it.
  useEffect(() => {
    if (!user || years.length === 0) return
    const stored = user.unsafeMetadata?.batch
    if (typeof stored !== 'string' || !stored) return
    const path = findBatchPath(years, stored)
    setYearInput(path.year)
    setStreamInput(path.stream)
    setBatchInput(path.batch)
  }, [years, user])

  const selectedYear = years.find((y) => y.label === yearInput) ?? null
  const streams = selectedYear?.streams ?? []
  const selectedStream = streams.find((s) => s.name === streamInput) ?? null
  const batches = selectedStream?.batches ?? []

  const yearOptions = useMemo(() => years.map((y) => ({ value: y.label })), [years])
  const streamOptions = useMemo(() => streams.map((s) => ({ value: s.name })), [streams])
  const batchOptions = useMemo(() => batches.map((b) => ({ value: b })), [batches])

  // Cascade resets when an upper field clears.
  useEffect(() => {
    if (!selectedYear && (streamInput || batchInput)) {
      setStreamInput('')
      setBatchInput('')
    }
  }, [selectedYear, streamInput, batchInput])
  useEffect(() => {
    if (!selectedStream && batchInput) setBatchInput('')
  }, [selectedStream, batchInput])

  const initials = useMemo(() => {
    const base = nameInput || user?.primaryEmailAddress?.emailAddress || '?'
    return base
      .split(/[\s@]/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0].toUpperCase())
      .join('')
  }, [nameInput, user])

  const nameDirty = nameInput.trim() !== originalName.trim()
  const savedBatch = user?.unsafeMetadata?.batch || ''
  const batchDirty = batchInput && batchInput !== savedBatch && batches.includes(batchInput)
  const dirty = nameDirty || batchDirty
  const canSave = dirty && !saving

  if (!isLoaded) {
    return (
      <main className="profile-page">
        <p className="profile-loading">Loading…</p>
      </main>
    )
  }

  async function handleSave(e) {
    e.preventDefault()
    if (!user || !canSave) return
    setSaving(true)
    setError('')
    setSavedAt(null)
    try {
      if (nameDirty) {
        const { firstName, lastName } = splitName(nameInput)
        await user.update({ firstName, lastName })
        setOriginalName(nameInput)
      }
      if (batchDirty) {
        await user.update({
          unsafeMetadata: { ...user.unsafeMetadata, batch: batchInput },
        })
      }
      setSavedAt(Date.now())
    } catch (err) {
      setError(err?.errors?.[0]?.message || err?.message || 'Could not save changes.')
    } finally {
      setSaving(false)
    }
  }

  async function handleSignOut() {
    setSigningOut(true)
    try {
      await signOut()
      navigate('/', { replace: true })
    } finally {
      setSigningOut(false)
    }
  }

  function handleOpenTimetable() {
    const target = batchInput || savedBatch
    if (target) navigate(`/timetable/${target}`)
  }

  const displayName = nameInput.trim() || 'Welcome!'
  const emailAddress = user?.primaryEmailAddress?.emailAddress
  const activeBatch = batchInput || savedBatch

  return (
    <main className="profile-page">
      <div className="profile-shell">
        <header className="profile-topbar">
          <button className="profile-back-btn" onClick={() => navigate('/')} aria-label="Back to home">
            ← Home
          </button>
          <span className="profile-topbar-title">Profile</span>
          <button
            className="profile-signout"
            onClick={handleSignOut}
            disabled={signingOut}
            type="button"
          >
            {signingOut ? 'Signing out…' : 'Sign out'}
          </button>
        </header>

        <section className="profile-hero">
          <div className="profile-hero-bg" aria-hidden />
          <div className="profile-hero-content">
            {user?.imageUrl ? (
              <img src={user.imageUrl} alt="" className="profile-avatar" referrerPolicy="no-referrer" />
            ) : (
              <div className="profile-avatar profile-avatar--initials" aria-hidden>{initials}</div>
            )}
            <h1 className="profile-display-name">{displayName}</h1>
            {emailAddress && <p className="profile-display-email">{emailAddress}</p>}
            {activeBatch && (
              <span className="profile-batch-pill">Batch {activeBatch}</span>
            )}
          </div>
        </section>

        <form className="profile-card" onSubmit={handleSave}>
          <div className="profile-card-section">
            <label className="profile-field">
              <span className="profile-field-label">Full name</span>
              <input
                type="text"
                className="profile-input"
                value={nameInput}
                onChange={(e) => { setNameInput(e.target.value); setSavedAt(null) }}
                placeholder="e.g. Anay Sharma"
                autoComplete="name"
              />
              <span className="profile-field-hint">
                Shown on your profile and used across the app.
              </span>
            </label>
          </div>

          <div className="profile-card-divider" aria-hidden />

          <div className="profile-card-section">
            <div className="profile-field">
              <span className="profile-field-label">Default batch</span>

              {/* When fully selected, show a summary card with a Change button */}
              {batchInput && batches.includes(batchInput) ? (
                <div className="profile-batch-selected">
                  <span className="profile-batch-selected-code">{batchInput}</span>
                  <span className="profile-batch-selected-name">
                    {yearInput} · {streamInput}
                  </span>
                  <button
                    type="button"
                    className="profile-batch-change"
                    onClick={() => { setBatchInput(''); setSavedAt(null) }}
                    disabled={saving}
                  >
                    Change
                  </button>
                </div>
              ) : (
                <div className="profile-batch-row">
                  <div className="profile-batch-path">
                    <div className="profile-batch-segment">
                      <span className="profile-batch-segment-label">Year</span>
                      <Combobox
                        className="profile-combobox"
                        value={yearInput}
                        onChange={(v) => { setYearInput(v); setSavedAt(null) }}
                        options={yearOptions}
                        placeholder="Select year"
                        ariaLabel="Year"
                      />
                    </div>
                    <div className="profile-batch-segment">
                      <span className="profile-batch-segment-label">Stream</span>
                      <Combobox
                        className="profile-combobox"
                        value={streamInput}
                        onChange={(v) => { setStreamInput(v); setSavedAt(null) }}
                        options={streamOptions}
                        placeholder={selectedYear ? 'Select stream' : '—'}
                        ariaLabel="Stream"
                        disabled={!selectedYear}
                      />
                    </div>
                    <div className="profile-batch-segment">
                      <span className="profile-batch-segment-label">Batch</span>
                      <Combobox
                        className="profile-combobox"
                        value={batchInput}
                        onChange={(v) => { setBatchInput(v.toUpperCase()); setSavedAt(null) }}
                        options={batchOptions}
                        placeholder={selectedStream ? 'Select batch' : '—'}
                        ariaLabel="Batch"
                        disabled={!selectedStream}
                      />
                    </div>
                  </div>
                </div>
              )}

              <span className="profile-field-hint">
                Saved to your account so it follows you across devices.
              </span>
            </div>
          </div>

          {error && <p className="profile-error">{error}</p>}

          <div className="profile-actions">
            <button
              type="button"
              className="profile-btn profile-btn--ghost"
              onClick={handleOpenTimetable}
              disabled={!activeBatch}
            >
              Open timetable →
            </button>
            <button
              type="submit"
              className="profile-btn profile-btn--primary"
              disabled={!canSave}
            >
              {saving ? 'Saving…' : savedAt && !dirty ? 'Saved ✓' : 'Save changes'}
            </button>
          </div>
        </form>

        <GoogleCalendarCard savedBatch={savedBatch} />
      </div>
    </main>
  )
}

export default function ProfilePage() {
  if (!AUTH_ENABLED) {
    return (
      <main className="profile-page">
        <div className="profile-shell">
          <section className="profile-card profile-card--solo">
            <h1 className="profile-display-name" style={{ textAlign: 'center', marginBottom: 12 }}>
              Profile
            </h1>
            <p className="profile-field-hint" style={{ textAlign: 'center', marginBottom: 20 }}>
              Accounts aren&apos;t enabled in this build yet.
            </p>
            <div style={{ textAlign: 'center' }}>
              <Link to="/" className="profile-btn profile-btn--ghost" style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>
                ← Back home
              </Link>
            </div>
          </section>
        </div>
      </main>
    )
  }
  return (
    <RequireAuth>
      <ProfileInner />
    </RequireAuth>
  )
}
