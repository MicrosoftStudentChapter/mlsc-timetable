// AdminLayout — shared chrome (top bar + sub-nav) for every /admin/* route.
// Guards access via useAdminSession; renders the AccessDenied screen when
// the caller isn't on the allowlist.

import { useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { useTheme } from '../../hooks/useTheme'
import { useAdminSession } from '../../hooks/useAdminSession'
import AccessDenied from './AccessDenied'
import './admin.css'

function SunIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  )
}

const NAV_GROUPS = [
  {
    label: 'Overview',
    items: [
      { to: '/admin', label: 'Dashboard', end: true },
      { to: '/admin/analytics', label: 'Analytics' },
    ],
  },
  {
    label: 'Operations',
    items: [
      { to: '/admin/fix', label: 'Fix issues' },
      { to: '/admin/timetables', label: 'Timetables' },
      { to: '/admin/uploads', label: 'Uploads' },
      { to: '/admin/change-requests', label: 'Change requests' },
    ],
  },
  {
    label: 'Academic data',
    items: [
      { to: '/admin/catalog', label: 'Subject catalog' },
      { to: '/admin/library', label: 'Curriculum library' },
      { to: '/admin/baselines', label: 'Baselines' },
      { to: '/admin/teacher-codes', label: 'Teacher codes' },
    ],
  },
  {
    label: 'Settings',
    items: [
      { to: '/admin/content', label: 'Site content' },
      { to: '/admin/contributors', label: 'Contributors' },
      { to: '/admin/users', label: 'Administrators' },
    ],
  },
]

const NAV_ITEMS = NAV_GROUPS.flatMap((group) => group.items)

export default function AdminLayout() {
  const { theme, toggleTheme } = useTheme()
  const { status, error } = useAdminSession()
  const location = useLocation()
  const [menuOpen, setMenuOpen] = useState(false)

  if (status === 'loading') {
    return (
      <div className="admin-app">
        <div className="admin-loading">Checking admin access…</div>
      </div>
    )
  }

  if (status === 'no_backend') {
    return (
      <div className="admin-app">
        <div className="admin-gate">
          <div className="admin-gate-card">
            <h1 className="admin-gate-title">Backend not configured</h1>
            <p className="admin-gate-body">
              Set <code>VITE_BACKEND_URL</code> in <code>.env</code> and restart Vite
              to use the admin panel.
            </p>
            <Link to="/" className="admin-gate-link">← Back to site</Link>
          </div>
        </div>
      </div>
    )
  }

  if (status === 'denied' || status === 'error' || status === 'not_signed_in') {
    return <AccessDenied error={error} status={status} />
  }

  return (
    <div className="admin-app admin-app--shell">
      <aside className={`admin-sidebar ${menuOpen ? 'is-open' : ''}`}>
        <div className="admin-sidebar-head">
          <Link to="/admin" className="admin-brand" aria-label="MLSC Timetable admin dashboard" onClick={() => setMenuOpen(false)}>
            <img src="/MLSC-logo.png" alt="" className="admin-brand-logo" />
            <div className="admin-brand-text">
              <span className="admin-brand-title">MLSC Timetable</span>
              <span className="admin-brand-sub">Administration</span>
            </div>
          </Link>
          <button type="button" className="admin-sidebar-close" onClick={() => setMenuOpen(false)} aria-label="Close navigation">×</button>
        </div>

        <nav className="admin-sidebar-nav" aria-label="Admin sections">
          {NAV_GROUPS.map((group) => (
            <div className="admin-nav-group" key={group.label}>
              <span className="admin-nav-label">{group.label}</span>
              {group.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  onClick={() => setMenuOpen(false)}
                  className={({ isActive }) => (isActive ? 'active' : undefined)}
                >
                  <span className="admin-nav-indicator" aria-hidden="true" />
                  {item.label}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

      </aside>

      {menuOpen && <button type="button" className="admin-sidebar-overlay" onClick={() => setMenuOpen(false)} aria-label="Close navigation" />}

      <div className="admin-shell">
        <header className="admin-topbar">
          <button type="button" className="admin-menu-btn" onClick={() => setMenuOpen(true)} aria-label="Open navigation">
            <span /><span /><span />
          </button>
          <div className="admin-breadcrumb">
            <span>Admin</span>
            <strong>{NAV_ITEMS.find((item) => item.end ? location.pathname === item.to : location.pathname.startsWith(item.to))?.label || 'Workspace'}</strong>
          </div>
          <div className="admin-top-actions">
            <Link to="/" className="admin-back-link">View timetable ↗</Link>
            <button
              type="button"
              className="admin-icon-btn"
              aria-label="Toggle theme"
              onClick={toggleTheme}
            >
              {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
            </button>
          </div>
        </header>

        <main className="admin-main" key={location.pathname}>
          <Outlet />
        </main>
      </div>
    </div>
  )
}
