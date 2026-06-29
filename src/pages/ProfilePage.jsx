import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useUser, useClerk } from '@clerk/clerk-react'
import { loadBatches } from '../lib/batches'
import Combobox from '../components/Combobox'
import { RequireAuth } from './LoginPage'
import { AUTH_ENABLED } from '../lib/auth'
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

function ProfileInner() {
  const { user, isLoaded } = useUser()
  const { signOut } = useClerk()
  const navigate = useNavigate()

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
              <div className="profile-batch-row">
                <Combobox
                  className="profile-combobox"
                  value={yearInput}
                  onChange={(v) => { setYearInput(v); setSavedAt(null) }}
                  options={yearOptions}
                  placeholder="Year"
                  ariaLabel="Year"
                />
                <Combobox
                  className="profile-combobox"
                  value={streamInput}
                  onChange={(v) => { setStreamInput(v); setSavedAt(null) }}
                  options={streamOptions}
                  placeholder="Stream"
                  ariaLabel="Stream"
                  disabled={!selectedYear}
                />
                <Combobox
                  className="profile-combobox"
                  value={batchInput}
                  onChange={(v) => { setBatchInput(v.toUpperCase()); setSavedAt(null) }}
                  options={batchOptions}
                  placeholder="Batch"
                  ariaLabel="Batch"
                  disabled={!selectedStream}
                />
              </div>
              <span className="profile-field-hint">
                Pick year → stream → batch. Saved to your account so it
                follows you across devices.
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
