import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import Footer from '../components/Footer'
import Combobox from '../components/Combobox'
import Navbar from '../components/Navbar'
import { loadBatches } from '../lib/batches'
import './TimetablePage.css'

const NAV_AUTO_CLOSE_MS = 3000
const NAV_COLLAPSE_QUERY = '(max-width: 848px)'

export default function TimetablePage() {
  const { batch } = useParams()
  const navigate  = useNavigate()
  const [years, setYears] = useState([])
  const [batchInput, setBatchInput] = useState(batch ?? '')
  const [isCompact, setIsCompact] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(NAV_COLLAPSE_QUERY).matches
  )
  const [navExpanded, setNavExpanded] = useState(false)
  const closeTimerRef = useRef(null)
  const isMouseHoveringRef = useRef(false)
  const pillRef = useRef(null)

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
      <main className="tt-main">
        {/* Top bar: logo left + centered heading */}
        <div className="tt-topbar">
          <button className="tt-logo-btn" onClick={() => navigate('/')} aria-label="Home">
            <img src="/MLSC-logo.png" alt="MLSC" className="tt-logo" />
          </button>
          <h1 className="tt-heading">Timetable for {batch}</h1>
        </div>

        <div className="tt-content">
          <p className="tt-placeholder">Content for <strong>{batch}</strong> will appear here.</p>
        </div>
      </main>

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
              {/* Google Calendar */}
              <div className="tt-tip-wrap" data-tip="Google Calendar">
                <button className="tt-icon-btn" aria-label="Add to Google Calendar">
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

              {/* Download */}
              <div className="tt-tip-wrap" data-tip="Save">
                <button className="tt-icon-btn" aria-label="Save as PDF or image">
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                    <polyline points="7 10 12 15 17 10"/>
                    <line x1="12" y1="15" x2="12" y2="3"/>
                  </svg>
                </button>
              </div>

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
              <div className="tt-tip-wrap" data-tip="Toggle theme">
                <button className="tt-icon-btn" aria-label="Toggle theme">
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="5"/>
                    <line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
                    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
                    <line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
                    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
                  </svg>
                </button>
              </div>

              {/* Profile */}
              <div className="tt-tip-wrap" data-tip="Profile">
                <button className="tt-icon-btn" aria-label="Profile">
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

      <Footer />
      
    </>
  )
}
