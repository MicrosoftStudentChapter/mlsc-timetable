import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import Combobox from '../components/Combobox'
import TimetableGrid from '../components/TimetableGrid'
import Footer from '../components/Footer'
import FollowDayBanner from '../components/FollowDayBanner'
import { loadBatches } from '../lib/batches'
import { loadTimetable } from '../lib/timetable'
import { exportGridAsPng, exportGridAsPdf, ASPECT_PRESETS } from '../lib/export_timetable'
import { DashboardLayout } from '../components/side_columns'
import { useTheme } from '../hooks/useTheme'
import { useAuthUser } from '../lib/auth'
import { getCalendarConfigured, getCalendarStatus } from '../lib/calendar_api'
import './TimetablePage.css'

const NAV_AUTO_CLOSE_MS = 3000
const NAV_COLLAPSE_QUERY = '(max-width: 848px)'
const CARD_THEME_KEY = 'mlsc-card-theme'
const CARD_THEMES = [
  { value: 'default', label: 'Default' },
  { value: 'aurora', label: 'Aurora' },
  { value: 'paper', label: 'Paper' },
]

function getInitialCardTheme() {
  try {
    const saved = localStorage.getItem(CARD_THEME_KEY)
    if (CARD_THEMES.some((t) => t.value === saved)) return saved
  } catch (_) {}
  return 'default'
}

export default function TimetablePage() {
  const { batch } = useParams()
  const navigate  = useNavigate()
  const { isSignedIn } = useAuthUser()
  const { theme, toggleTheme } = useTheme()
  const isDark = theme === 'dark'
  const [cardTheme, setCardTheme] = useState(getInitialCardTheme)
  const [years, setYears] = useState([])
  const [batchInput, setBatchInput] = useState(batch ?? '')
  const [timetableState, setTimetableState] = useState({ status: 'loading' })
  const [isCompact, setIsCompact] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(NAV_COLLAPSE_QUERY).matches
  )
  const [navExpanded, setNavExpanded] = useState(false)
  // 0..4 = Mon–Fri column to highlight in the grid header; null = none
  // (Sat/Sun by default, or any date explicitly mapped to null). Driven by
  // sidebar mini-calendar hover; falls back to today's mapping.
  const [activeWeekdayIdx, setActiveWeekdayIdx] = useState(null)
  const closeTimerRef = useRef(null)
  const isMouseHoveringRef = useRef(false)
  const pillRef = useRef(null)
  const exportRef = useRef(null)

  // Show button immediately when backend URL is set; fetch only to hide it if unconfigured
  const [calendarConfigured, setCalendarConfigured] = useState(
    () => !!(import.meta.env.VITE_BACKEND_URL || '')
  )
  const [calendarStatus, setCalendarStatus] = useState(null)
  const [calendarNudge, setCalendarNudge] = useState(false)

  useEffect(() => {
    getCalendarConfigured().then((d) => {
      if (d && !d.configured) setCalendarConfigured(false)
    })
  }, [])

  useEffect(() => {
    if (!isSignedIn) return
    let cancelled = false
    getCalendarStatus()
      .then((s) => { if (!cancelled) setCalendarStatus(s) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [isSignedIn])

  function handleCalendarClick() {
    if (!isSignedIn) { setCalendarNudge(true); return }
    navigate('/profile')
  }

  useEffect(() => {
    const mq = window.matchMedia(NAV_COLLAPSE_QUERY)
    const apply = () => setIsCompact(mq.matches)
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [])

  const cancelClose = () => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current)
      closeTimerRef.current = null
    }
  }
  const armClose = () => {
    cancelClose()
    closeTimerRef.current = setTimeout(() => setNavExpanded(false), NAV_AUTO_CLOSE_MS)
  }

  useEffect(() => () => cancelClose(), [])

  useEffect(() => {
    try { localStorage.setItem(CARD_THEME_KEY, cardTheme) } catch (_) {}
  }, [cardTheme])

  // when leaving compact mode, drop any pending timer + collapsed flag so the
  // nav renders cleanly on desktop
  useEffect(() => {
    if (!isCompact) {
      cancelClose()
      setNavExpanded(false)
      isMouseHoveringRef.current = false
    }
  }, [isCompact])

  // mouse hover keeps the nav open; touch is ignored here so taps don't get
  // mistaken for a permanent hover
  const handleNavEnter = (e) => {
    if (e.pointerType !== 'mouse') return
    isMouseHoveringRef.current = true
    cancelClose()
  }
  const handleNavLeave = (e) => {
    if (e.pointerType !== 'mouse') return
    isMouseHoveringRef.current = false
    if (navExpanded) armClose()
  }
  // any pointer/key activity inside the expanded nav resets the auto-close timer
  // (this is what makes auto-close work on touch devices)
  const handleNavInteract = () => {
    if (navExpanded && !isMouseHoveringRef.current) armClose()
  }
  const openNav = () => {
    setNavExpanded(true)
    if (!isMouseHoveringRef.current) armClose()
  }

  // close when the user taps/clicks anywhere outside the open pill
  useEffect(() => {
    if (!isCompact || !navExpanded) return
    const onDocPointerDown = (e) => {
      if (pillRef.current && pillRef.current.contains(e.target)) return
      cancelClose()
      setNavExpanded(false)
    }
    document.addEventListener('pointerdown', onDocPointerDown)
    return () => document.removeEventListener('pointerdown', onDocPointerDown)
  }, [isCompact, navExpanded])

  useEffect(() => {
    let cancelled = false
    loadBatches().then((y) => {
      if (!cancelled) setYears(y)
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    setBatchInput(batch ?? '')
  }, [batch])

  // Fetch this batch's timetable from the backend whenever the URL batch changes.
  useEffect(() => {
    if (!batch) {
      setTimetableState({ status: 'idle' })
      return
    }
    let cancelled = false
    setTimetableState({ status: 'loading' })
    loadTimetable(batch).then((result) => {
      if (cancelled) return
      setTimetableState(result)
    })
    return () => {
      cancelled = true
    }
  }, [batch])

  const batchOptions = useMemo(() => {
    const out = []
    for (const { label, streams } of years) {
      for (const { name, batches } of streams) {
        for (const code of batches) {
          out.push({ value: code, hint: `${label} \u2014 ${name}` })
        }
      }
    }
    return out
  }, [years])

  const allCodes = useMemo(() => new Set(batchOptions.map((b) => b.value)), [batchOptions])

  const handleBatchChange = (v) => {
    const upper = v.toUpperCase()
    setBatchInput(upper)
    if (allCodes.has(upper) && upper !== batch) navigate(`/timetable/${upper}`)
  }

  const handleShare = () => {
    navigator.share
      ? navigator.share({ title: `MLSC Timetable – ${batch}`, url: window.location.href })
      : navigator.clipboard.writeText(window.location.href)
  }

  return (
    <>
      {/* Sign-in nudge modal for Google Calendar */}
      {calendarNudge && (
        <div className="cal-nudge-backdrop" onClick={() => setCalendarNudge(false)}>
          <div className="cal-nudge" onClick={(e) => e.stopPropagation()}>
            <div className="cal-nudge-icon">📅</div>
            <h3 className="cal-nudge-title">Sync to Google Calendar</h3>
            <p className="cal-nudge-body">
              Sign in to automatically sync your timetable — holidays and schedule changes push to your Google Calendar whenever admins publish them.
            </p>
            <div className="cal-nudge-actions">
              <button className="cal-nudge-btn cal-nudge-btn--primary" onClick={() => { setCalendarNudge(false); navigate('/login') }}>
                Sign in
              </button>
              <button className="cal-nudge-btn cal-nudge-btn--ghost" onClick={() => setCalendarNudge(false)}>
                Maybe later
              </button>
            </div>
          </div>
        </div>
      )}
    <DashboardLayout
      batch={batch}
      onActiveWeekdayChange={setActiveWeekdayIdx}
      footer={<Footer />}
      headerActions={
        <label className="tt-card-theme-picker">
          <span className="tt-card-theme-label">Card style</span>
          <select
            className="tt-card-theme-select"
            value={cardTheme}
            onChange={(e) => setCardTheme(e.target.value)}
            aria-label="Card style"
          >
            {CARD_THEMES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </label>
      }
    >
      <div className="tt-content">
        {/* Mobile-only card-style row — the picker in the header is hidden
            on mobile (no room in the compact strip), so mirror it here as
            a full-width row between header and the follow-day banner. */}
        <div className="tt-card-style-row">
          <label className="tt-card-theme-picker">
            <span className="tt-card-theme-label">Card style</span>
            <select
              className="tt-card-theme-select"
              value={cardTheme}
              onChange={(e) => setCardTheme(e.target.value)}
              aria-label="Card style"
            >
              {CARD_THEMES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </label>
        </div>
        {/* Follow-day alert — shown on desktop AND mobile, but only when
            the current batch has an override in the next 7 days. Component
            returns null when there's nothing to surface. */}
        <div className="tt-follow-day-row">
          <FollowDayBanner batch={batch} />
        </div>
        <div className="tt-export-target" ref={exportRef}>
          <TimetableContent state={timetableState} batch={batch} isDark={isDark} cardTheme={cardTheme} activeWeekdayIdx={activeWeekdayIdx} />
        </div>
      </div>

      {/* Timetable Navbar */}
      <div
        className={`tt-navbar-wrap ${!isCompact ? 'is-wide is-open' : (navExpanded ? 'is-compact is-open' : 'is-compact is-collapsed')}`}
        onPointerEnter={isCompact ? handleNavEnter : undefined}
        onPointerLeave={isCompact ? handleNavLeave : undefined}
        onPointerDown={isCompact ? handleNavInteract : undefined}
        onKeyDown={isCompact ? handleNavInteract : undefined}
      >
        {isCompact && (
          <button
            type="button"
            className="tt-navbar-toggle"
            onClick={openNav}
            aria-label="Show toolbar"
            aria-expanded={navExpanded ? 'true' : 'false'}
            aria-hidden={navExpanded ? 'true' : undefined}
            tabIndex={navExpanded ? -1 : 0}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="5" cy="12" r="1.6" fill="currentColor"/>
              <circle cx="12" cy="12" r="1.6" fill="currentColor"/>
              <circle cx="19" cy="12" r="1.6" fill="currentColor"/>
            </svg>
          </button>
        )}
        <nav
          ref={pillRef}
          className="tt-navbar-pill"
          aria-hidden={isCompact && !navExpanded ? 'true' : undefined}
          {...(isCompact && !navExpanded ? { inert: '' } : {})}
        >
          {/* Batch selector — center */}
          <Combobox
            className="tt-batch-select"
            popupClassName="tt-batch-popup"
            value={batchInput}
            onChange={handleBatchChange}
            options={batchOptions}
            placeholder="Batch"
            ariaLabel="Switch batch"
            direction="up"
          />

          {/* Actions */}
          <div className="tt-actions">
            {/* Group 1: timetable-focused */}
            <div className="tt-action-group">
              {/* Google Calendar — hidden when not configured */}
              {calendarConfigured && (
                <div className="tt-tip-wrap" data-tip={
                  calendarStatus?.connected && calendarStatus?.enabled
                    ? 'Calendar sync active'
                    : calendarStatus?.connected
                    ? 'Calendar connected (sync paused)'
                    : 'Sync timetable to Google Calendar'
                }>
                  <button
                    className="tt-icon-btn tt-cal-btn"
                    aria-label="Google Calendar sync"
                    onClick={handleCalendarClick}
                  >
                    {calendarStatus?.connected && calendarStatus?.enabled && (
                      <span className="tt-cal-dot" aria-hidden="true" />
                    )}
                    <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 48 48">
                      <rect width="22" height="22" x="13" y="13" fill="#fff"/>
                      <polygon fill="#1e88e5" points="25.68,20.92 26.688,22.36 28.272,21.208 28.272,29.56 30,29.56 30,18.616 28.56,18.616"/>
                      <path fill="#1e88e5" d="M22.943,23.745c.625-.574,1.013-1.37,1.013-2.249,0-1.747-1.533-3.168-3.417-3.168-1.602,0-2.972,1.009-3.33,2.453l1.657.421c.165-.664.868-1.146,1.673-1.146.942,0,1.709.646,1.709,1.44,0,.794-.767,1.44-1.709,1.44h-.997v1.728h.997c1.081,0,1.993.751,1.993,1.64,0,.904-.866,1.64-1.931,1.64-.962,0-1.784-.61-1.914-1.418L17,26.802c.262,1.636,1.81,2.87,3.6,2.87,2.007,0,3.64-1.511,3.64-3.368C24.24,25.281,23.736,24.363,22.943,23.745z"/>
                      <polygon fill="#fbc02d" points="34,42 14,42 13,38 14,34 34,34 35,38"/>
                      <polygon fill="#4caf50" points="38,35 42,34 42,14 38,13 34,14 34,34"/>
                      <path fill="#1e88e5" d="M34,14l1-4-1-4H9C7.343,6,6,7.343,6,9v25l4,1,4-1V14H34z"/>
                      <polygon fill="#e53935" points="34,34 34,42 42,34"/>
                      <path fill="#1565c0" d="M39,6h-5v8h8V9C42,7.343,40.657,6,39,6z"/>
                      <path fill="#1565c0" d="M9,42h5v-8H6v5C6,40.657,7.343,42,9,42z"/>
                    </svg>
                  </button>
                </div>
              )}

              {/* Download */}
              <SaveMenu
                exportRef={exportRef}
                batch={batch}
                disabled={timetableState.status !== 'ok' && timetableState.status !== 'no_backend'}
              />

              {/* Share */}
              <div className="tt-tip-wrap" data-tip="Share Link">
                <button className="tt-icon-btn" aria-label="Share link" onClick={handleShare}>
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
                    <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/>
                    <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
                  </svg>
                </button>
              </div>
            </div>

            {/* Group 2: user settings */}
            <div className="tt-action-group">
              {/* Theme */}
              <div className="tt-tip-wrap" data-tip={isDark ? 'Light mode' : 'Dark mode'}>
                <button
                  className={`tt-icon-btn tt-theme-btn${isDark ? ' is-dark' : ''}`}
                  aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
                  onClick={toggleTheme}
                >
                  {isDark ? (
                    /* Sun icon — click to go light */
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="5"/>
                      <line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
                      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
                      <line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
                      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
                    </svg>
                  ) : (
                    /* Moon icon — click to go dark */
                    <svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
                    </svg>
                  )}
                </button>
              </div>

              {/* Profile — route based on Clerk sign-in state. */}
              <div className="tt-tip-wrap" data-tip="Profile">
                <button
                  className="tt-icon-btn"
                  aria-label="Profile"
                  onClick={() => navigate(isSignedIn ? '/profile' : '/login')}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="8" r="4"/>
                    <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </nav>
      </div>
    </DashboardLayout>
    </>
  )
}

// Renders the right thing for each fetch state. Falls back to the grid's
// hard-coded fixture when no backend is configured (dev convenience).
function TimetableContent({ state, batch, isDark, cardTheme, activeWeekdayIdx }) {
  if (state.status === 'loading' || state.status === 'idle') {
    return <div className="tt-status tt-status--loading">Loading {batch ?? 'timetable'}…</div>
  }
  if (state.status === 'no_backend') {
    return (
      <>
        <div className="tt-status tt-status--warning">
          Backend not configured — showing sample data. Set <code>VITE_BACKEND_URL</code> in <code>.env</code> to load <code>{batch}</code>.
        </div>
        <TimetableGrid isDarkMode={isDark} cardTheme={cardTheme} batch={batch} activeWeekdayIdx={activeWeekdayIdx} />
      </>
    )
  }
  if (state.status === 'not_found') {
    return (
      <div className="tt-status tt-status--error">
        Batch <strong>{batch}</strong> not found. Pick a different batch from the toolbar.
      </div>
    )
  }
  if (state.status === 'error') {
    return (
      <div className="tt-status tt-status--error">
        Couldn’t load <strong>{batch}</strong>: {state.message}
      </div>
    )
  }
  if (state.classes.length === 0) {
    return (
      <div className="tt-status tt-status--empty">
        No classes scheduled for <strong>{batch}</strong>.
      </div>
    )
  }
  return <TimetableGrid isDarkMode={isDark} classes={state.classes} cardTheme={cardTheme} batch={batch} activeWeekdayIdx={activeWeekdayIdx} />
}

// ─── SaveMenu ────────────────────────────────────────────────────────────────
// Two-step popover: choose format (PNG / PDF), then aspect ratio. Captures
// whatever's inside `exportRef` (the rendered timetable). Closes on
// outside-click and Escape.
function SaveMenu({ exportRef, batch, disabled }) {
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState('format')   // 'format' | 'aspect'
  const [format, setFormat] = useState(null)   // 'png' | 'pdf' | null
  const [busy, setBusy] = useState(null)       // aspect id while running
  const [error, setError] = useState(null)
  const wrapRef = useRef(null)

  // Reset the wizard whenever the menu closes so reopening starts fresh.
  useEffect(() => {
    if (open) return
    setStep('format')
    setFormat(null)
    setError(null)
  }, [open])

  useEffect(() => {
    if (!open) return
    const onDown = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false)
    }
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const pickFormat = (kind) => {
    setFormat(kind)
    setError(null)
    setStep('aspect')
  }

  const runWithAspect = async (preset) => {
    if (busy || !format) return
    const fn = format === 'png' ? exportGridAsPng : exportGridAsPdf
    setBusy(preset.id); setError(null)
    try {
      await fn({ node: exportRef.current, batch, aspect: preset.ratio })
      setOpen(false)
    } catch (e) {
      setError(e?.message || 'Export failed')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="tt-tip-wrap tt-save-wrap" data-tip="Save" ref={wrapRef}>
      <button
        type="button"
        className="tt-icon-btn"
        aria-label="Save as PDF or image"
        aria-haspopup="menu"
        aria-expanded={open ? 'true' : 'false'}
        disabled={disabled}
        onClick={() => !disabled && setOpen((v) => !v)}
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
          <polyline points="7 10 12 15 17 10"/>
          <line x1="12" y1="15" x2="12" y2="3"/>
        </svg>
      </button>
      {open && (
        <div className="tt-save-menu" role="menu">
          {step === 'format' ? (
            <>
              <button
                type="button"
                role="menuitem"
                className="tt-save-menu-item"
                onClick={() => pickFormat('png')}
              >
                PNG image
              </button>
              <button
                type="button"
                role="menuitem"
                className="tt-save-menu-item"
                onClick={() => pickFormat('pdf')}
              >
                PDF document
              </button>
            </>
          ) : (
            <>
              <div className="tt-save-menu-header">
                <button
                  type="button"
                  className="tt-save-menu-back"
                  onClick={() => { if (!busy) { setStep('format'); setFormat(null); setError(null) } }}
                  disabled={!!busy}
                  aria-label="Back to format"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="15 18 9 12 15 6"/>
                  </svg>
                </button>
                <span className="tt-save-menu-title">
                  {format === 'png' ? 'PNG' : 'PDF'} · aspect
                </span>
              </div>
              <div className="tt-save-menu-aspects">
                {ASPECT_PRESETS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    role="menuitem"
                    className="tt-save-menu-item"
                    disabled={!!busy}
                    onClick={() => runWithAspect(p)}
                  >
                    {busy === p.id ? 'Saving…' : p.label}
                  </button>
                ))}
              </div>
            </>
          )}
          {error && <p className="tt-save-menu-error">{error}</p>}
        </div>
      )}
    </div>
  )
}
