import { Link } from 'react-router-dom'
import { useTheme } from '../hooks/useTheme'
import { useAuthUser } from '../lib/auth'
import './Navbar.css'

function SunIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="5" />
      <line x1="12" y1="1" x2="12" y2="3" />
      <line x1="12" y1="21" x2="12" y2="23" />
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
      <line x1="1" y1="12" x2="3" y2="12" />
      <line x1="21" y1="12" x2="23" y2="12" />
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
    </svg>
  )
}

function MoonIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  )
}

function PersonIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
    </svg>
  )
}

export default function Navbar() {
  const { theme, toggleTheme } = useTheme()
  const isDark = theme === 'dark'
  const { isSignedIn } = useAuthUser()
  const profileHref = isSignedIn ? '/profile' : '/login'
  const profileLabel = isSignedIn ? 'Open profile' : 'Sign in'

  return (
    <header className="navbar">
      <nav className="navbar-pill">
        <Link to="/" aria-label="Go to home" className="navbar-logo-link">
          <img src="/MLSC-logo.png" alt="MLSC" className="navbar-logo-img" />
        </Link>

        <div className="navbar-actions">
          <span className="navbar-tip-wrap" data-tip={isDark ? 'Switch to light' : 'Switch to dark'}>
            <button
              type="button"
              className="navbar-icon-btn"
              aria-label="Toggle theme"
              aria-pressed={isDark}
              onClick={toggleTheme}
            >
              {isDark ? <SunIcon /> : <MoonIcon />}
            </button>
          </span>

          <span className="navbar-tip-wrap" data-tip="Profile">
            <Link to={profileHref} className="navbar-icon-btn" aria-label={profileLabel}>
              <PersonIcon />
            </Link>
          </span>
        </div>
      </nav>
    </header>
  )
}
