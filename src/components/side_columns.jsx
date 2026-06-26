import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import './side_columns.css';

const IconBell = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
    <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
  </svg>
);
const IconExam = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
    <line x1="16" y1="2" x2="16" y2="6" />
    <line x1="8" y1="2" x2="8" y2="6" />
    <line x1="3" y1="10" x2="21" y2="10" />
    <path d="M9 16l2 2 4-4" />
  </svg>
);
const IconCalendar = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
    <line x1="16" y1="2" x2="16" y2="6" />
    <line x1="8" y1="2" x2="8" y2="6" />
    <line x1="3" y1="10" x2="21" y2="10" />
  </svg>
);
const IconUser = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </svg>
);
const IconSidebar = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
    <path d="M21.25 6.72v10.56a2.97 2.97 0 0 1-2.97 2.97H5.72a2.97 2.97 0 0 1-2.97-2.97V6.72a2.97 2.97 0 0 1 2.97-2.97h12.56a2.97 2.97 0 0 1 2.97 2.97" />
    <path d="M6.25 7.25v9.5" />
  </svg>
);

const IconChevron = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="15 6 9 12 15 18" />
  </svg>
);

// ─── Calendar weekday-mapping ─────────────────────────────────────────
// Header order is Mon-Sun. Indices: 0=M 1=T 2=W 3=T 4=F 5=S 6=S.
// A date can "follow" any weekday's timetable (e.g. a Saturday running
// Monday's schedule). Sunday is always a holiday → null.
// Default rule: Mon–Fri map to themselves, Sat/Sun map to null.
// Per-date overrides (keyed by 'YYYY-MM-DD') come from the college's
// semester calendar — drop them into DAY_OVERRIDES below.
const MON_SUN = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

// Example: '2026-06-27': 0  →  this Saturday follows Monday's schedule
//          '2026-08-15': null →  declared holiday
const DAY_OVERRIDES = {
  // populate from semester calendar
};

const pad2 = (n) => String(n).padStart(2, '0');
const ymdKey = (y, m, d) => `${y}-${pad2(m + 1)}-${pad2(d)}`;
// JS getDay: 0=Sun..6=Sat → our 0=Mon..6=Sun
const toMonSunIdx = (jsDay) => (jsDay + 6) % 7;

function defaultWeekdayIdx(monSunIdx) {
  return monSunIdx <= 4 ? monSunIdx : null;
}

function weekdayIdxFor(year, month, day) {
  const key = ymdKey(year, month, day);
  if (key in DAY_OVERRIDES) return DAY_OVERRIDES[key];
  const jsDay = new Date(year, month, day).getDay();
  return defaultWeekdayIdx(toMonSunIdx(jsDay));
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export function SidebarContent({ collapsed = false, onActiveWeekdayChange }) {
  // ─── Mini calendar: real current month, real today ─────
  const today = useMemo(() => new Date(), []);
  const year = today.getFullYear();
  const month = today.getMonth();              // 0-indexed
  const todayDate = today.getDate();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstWeekdayIdx = toMonSunIdx(new Date(year, month, 1).getDay());

  // hovered day → number (1..daysInMonth) or null
  const [hoveredDay, setHoveredDay] = useState(null);

  // weekday header column to highlight: hovered day's mapping if any,
  // else today's mapping
  const activeDay = hoveredDay ?? todayDate;
  const activeWeekdayIdx = weekdayIdxFor(year, month, activeDay);

  // Broadcast the active weekday index so the main timetable grid can
  // sync its sliding column highlight with the calendar.
  useEffect(() => {
    if (onActiveWeekdayChange) onActiveWeekdayChange(activeWeekdayIdx);
  }, [activeWeekdayIdx, onActiveWeekdayChange]);

  // grid cells: leading blanks + 1..daysInMonth
  const cells = [];
  for (let i = 0; i < firstWeekdayIdx; i++) cells.push({ key: `blank-${i}`, blank: true });
  for (let d = 1; d <= daysInMonth; d++) cells.push({ key: `d-${d}`, day: d });

  return (
    <div className={`sidebar-inner ${collapsed ? 'sidebar-inner--collapsed' : ''}`}>
      {/* 1. Logo Section */}
      <Link to="/" className="sidebar-logo-container" aria-label="Go to home">
        <div className="logo-img-wrapper">
          <img src="/MLSC-logo.png" alt="MLSC Logo" className="sidebar-logo-img" />
        </div>
        <h2 className="sidebar-logo-text">MLSC TIMETABLE</h2>
      </Link>

      {/* 2. Announcement Card */}
      <div className="dashboard-card announcement-card">
        <span className="card-icon"><IconBell /></span>
        <h3 className="card-title">Announcements</h3>
        <p className="card-placeholder-text">No announcements yet</p>
      </div>

      {/* 3. Exam Dates Card */}
      <div className="dashboard-card exam-card">
        <span className="card-icon"><IconExam /></span>
        <h3 className="card-title">Exam Dates</h3>
        <p className="card-placeholder-text">No dates scheduled</p>
      </div>

      {/* 4. Calendar Card */}
      <div className="dashboard-card calendar-card">
        <span className="card-icon"><IconCalendar /></span>
        <div className="calendar-header">
          <h3 className="card-title">Calendar</h3>
          <span className="calendar-month-year">{`${MONTH_NAMES[month]} ${year}`}</span>
        </div>
        <div className="mini-calendar">
          <div className="calendar-weekdays">
            {MON_SUN.map((label, idx) => (
              <span
                key={idx}
                className={`calendar-weekday ${idx === activeWeekdayIdx ? 'active' : ''}`}
              >
                {label}
              </span>
            ))}
          </div>
          <div
            className="calendar-grid"
            onMouseLeave={() => setHoveredDay(null)}
          >
            {cells.map((cell) => {
              if (cell.blank) {
                return <span key={cell.key} className="calendar-day calendar-day--blank" />;
              }
              const isToday = cell.day === todayDate;
              const isHovered = cell.day === hoveredDay;
              return (
                <span
                  key={cell.key}
                  className={`calendar-day ${isToday ? 'today' : ''} ${isHovered ? 'hovered' : ''}`}
                  onMouseEnter={() => setHoveredDay(cell.day)}
                >
                  {cell.day}
                </span>
              );
            })}
          </div>
        </div>
      </div>

      {/* 5. Profile Card */}
      <div className="dashboard-card profile-card" title="Profile">
        <span className="card-icon"><IconUser /></span>
        <div className="profile-avatar">S</div>
        <div className="profile-info">
          <span className="profile-name">Student</span>
          <span className="profile-subtitle">Profile placeholder</span>
        </div>
      </div>
    </div>
  );
}

export function DashboardLayout({ children, onActiveWeekdayChange }) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem('mlsc.sidebarCollapsed') === '1';
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem('mlsc.sidebarCollapsed', collapsed ? '1' : '0');
  }, [collapsed]);

  const toggleDrawer = () => {
    setDrawerOpen(!drawerOpen);
  };

  return (
    <div className="dashboard-layout">
      {/* Desktop & Tablet Sidebar (fixed/static) */}
      <aside className={`dashboard-sidebar ${collapsed ? 'dashboard-sidebar--collapsed' : ''}`}>
        <SidebarContent collapsed={collapsed} onActiveWeekdayChange={onActiveWeekdayChange} />
        <button
          type="button"
          className="sidebar-edge-toggle"
          onClick={() => setCollapsed(c => !c)}
          aria-expanded={!collapsed}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <span className="sidebar-edge-toggle__rail" aria-hidden="true" />
          <span className="sidebar-edge-toggle__handle" aria-hidden="true">
            <IconChevron />
          </span>
        </button>
      </aside>

      {/* Mobile Drawer */}
      <div className={`mobile-drawer-overlay ${drawerOpen ? 'open' : ''}`} onClick={() => setDrawerOpen(false)}>
        <div className="mobile-drawer" onClick={(e) => e.stopPropagation()}>
          <button className="close-drawer-btn" onClick={() => setDrawerOpen(false)} aria-label="Close menu">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
          <SidebarContent />
        </div>
      </div>

      {/* Main Content Area */}
      <div className="dashboard-main">
        {/* Header Section */}
        <header className="dashboard-header">
          <div className="header-left">
            {/* Hamburger Button for mobile */}
            <button className="hamburger-btn" onClick={toggleDrawer} aria-label="Open menu">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="3" y1="12" x2="21" y2="12"></line>
                <line x1="3" y1="6" x2="21" y2="6"></line>
                <line x1="3" y1="18" x2="21" y2="18"></line>
              </svg>
            </button>
            <h1 className="welcome-heading">Welcome, Student</h1>
          </div>
        </header>

        {/* Existing Timetable Page Content */}
        <div className="dashboard-content">
          {children}
        </div>
      </div>
    </div>
  );
}
