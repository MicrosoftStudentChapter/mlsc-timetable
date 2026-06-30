import { useState, useEffect, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import './side_columns.css';
import { loadAnnouncements, loadExamDates } from '../lib/sidebar_feeds';
import { useAuthUser } from '../lib/auth';

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

// ─── Formatters for sidebar feed items ─────────────────────────────────
const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatRelativeDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const now = new Date();
  const diffMs = now - d;
  const diffMin = Math.round(diffMs / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.round(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return `${MONTH_SHORT[d.getMonth()]} ${d.getDate()}`;
}

function formatExamDate(ymd) {
  if (!ymd) return '';
  const [y, m, d] = ymd.split('-').map(Number);
  if (!y || !m || !d) return ymd;
  return `${MONTH_SHORT[m - 1]} ${d}`;
}

function splitExamDate(ymd) {
  if (!ymd) return { month: '', day: '' };
  const [y, m, d] = ymd.split('-').map(Number);
  if (!y || !m || !d) return { month: '', day: ymd };
  return { month: MONTH_SHORT[m - 1], day: String(d) };
}

function examTypeKey(type) {
  if (!type) return 'default';
  const t = type.toLowerCase();
  if (t.includes('end')) return 'end';
  if (t.includes('mid')) return 'mid';
  if (t.includes('quiz')) return 'quiz';
  if (t.includes('lab')) return 'lab';
  return 'default';
}

function useFeed(loader) {
  const [state, setState] = useState({ status: 'loading', items: [] });
  useEffect(() => {
    let alive = true;
    loader().then((result) => {
      if (alive) setState(result);
    });
    return () => {
      alive = false;
    };
  }, [loader]);
  return state;
}

export function SidebarContent({ collapsed = false, onActiveWeekdayChange, batch }) {
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

  // Sidebar feeds — backend with bundled fallback. Exam dates are filtered
  // server-side by the currently-viewed batch (year scope + subject codes).
  const announcements = useFeed(loadAnnouncements);
  const examDatesLoader = useCallback(() => loadExamDates(batch), [batch]);
  const examDates = useFeed(examDatesLoader);

  // Whole-section dropdowns: collapsed by default so the sidebar feels calm
  // on arrival; users opt in by clicking the section header.
  const [announcementsOpen, setAnnouncementsOpen] = useState(false);
  const [examDatesOpen, setExamDatesOpen] = useState(false);

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
      {/* Fixed header */}
      <div className="sidebar-header">
        <Link to="/" className="sidebar-logo-container" aria-label="Go to home">
          <div className="logo-img-wrapper">
            <img src="/MLSC-logo.png" alt="MLSC Logo" className="sidebar-logo-img" />
          </div>
          <h2 className="sidebar-logo-text">MLSC TIMETABLE</h2>
        </Link>
      </div>

      {/* Scrollable middle */}
      <div className="sidebar-scroll">
        {/* Announcement Card — whole section is the dropdown */}
        <div className={`dashboard-card announcement-card section-card ${announcementsOpen ? 'is-open' : ''}`}>
          <button
            type="button"
            className="section-header"
            onClick={() => setAnnouncementsOpen((v) => !v)}
            aria-expanded={announcementsOpen}
          >
            <span className="card-icon"><IconBell /></span>
            <h3 className="card-title">Announcements</h3>
            {announcements.items.length > 0 && (
              <span className="section-count">{announcements.items.length}</span>
            )}
            <span className="feed-chevron section-chevron" aria-hidden="true">
              <IconChevron />
            </span>
          </button>
          {announcementsOpen && (
            <div className="section-body">
              {announcements.status === 'loading' ? (
                <p className="card-placeholder-text">Loading…</p>
              ) : announcements.items.length === 0 ? (
                <p className="card-placeholder-text">No announcements yet</p>
              ) : (
                <ul className="feed-list section-scroll">
                  {announcements.items.map((a) => {
                    const sev = a.severity || 'info';
                    return (
                      <li key={a.id} className="feed-item">
                        <div className="feed-item-head">
                          <span className={`feed-severity feed-severity--${sev}`} aria-hidden="true" />
                          <span className="feed-title">{a.title}</span>
                        </div>
                        {a.body && <p className="feed-body">{a.body}</p>}
                        <div className="feed-item-footer">
                          <span className="feed-meta">{formatRelativeDate(a.posted_at)}</span>
                          {a.link && (
                            <a
                              href={a.link}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="feed-link-inline"
                            >
                              Open ↗
                            </a>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}
        </div>

        {/* Exam Dates Card — whole section is the dropdown */}
        <div className={`dashboard-card exam-card section-card ${examDatesOpen ? 'is-open' : ''}`}>
          <button
            type="button"
            className="section-header"
            onClick={() => setExamDatesOpen((v) => !v)}
            aria-expanded={examDatesOpen}
          >
            <span className="card-icon"><IconExam /></span>
            <h3 className="card-title">Exam Dates</h3>
            {examDates.items.length > 0 && (
              <span className="section-count">{examDates.items.length}</span>
            )}
            <span className="feed-chevron section-chevron" aria-hidden="true">
              <IconChevron />
            </span>
          </button>
          {examDatesOpen && (
            <div className="section-body">
              {examDates.status === 'loading' ? (
                <p className="card-placeholder-text">Loading…</p>
              ) : examDates.items.length === 0 ? (
                <p className="card-placeholder-text">No dates scheduled</p>
              ) : (
                <ul className="feed-list section-scroll">
                  {examDates.items.map((e) => {
                    const typeKey = examTypeKey(e.type);
                    const { month: mLabel, day: dLabel } = splitExamDate(e.date);
                    return (
                      <li key={e.id} className={`exam-row exam-row--${typeKey}`}>
                        <span className="exam-row-stripe" aria-hidden="true" />
                        <span className="exam-row-date">
                          <span className="exam-row-month">{mLabel}</span>
                          <span className="exam-row-day">{dLabel}</span>
                        </span>
                        <div className="exam-row-body">
                          <div className="exam-row-head">
                            <span className="exam-row-subject">{e.subject}</span>
                            {e.type && (
                              <span className={`exam-tag exam-tag--type exam-tag--${typeKey}`}>
                                {e.type}
                              </span>
                            )}
                          </div>
                          <span className="exam-row-code">{e.code}</span>
                          {(e.slot || e.room) && (
                            <div className="exam-row-tags">
                              {e.slot && <span className="exam-tag">{e.slot}</span>}
                              {e.room && <span className="exam-tag exam-tag--room">{e.room}</span>}
                            </div>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}
        </div>

        {/* Calendar Card */}
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
      </div>

      {/* Fixed footer */}
      <div className="sidebar-footer">
        <SidebarProfileCard />
      </div>
    </div>
  );
}

// Bottom-of-sidebar card that pulls from Clerk when signed in, or falls back
// to the placeholder student card so the layout still works without auth.
function SidebarProfileCard() {
  const { isSignedIn, user } = useAuthUser();

  const fullName = user?.fullName
    || [user?.firstName, user?.lastName].filter(Boolean).join(' ')
    || '';
  const displayName = isSignedIn ? (fullName || 'Your profile') : 'Student';
  const savedBatch = user?.unsafeMetadata?.batch;
  const email = user?.primaryEmailAddress?.emailAddress;
  const subtitle = isSignedIn
    ? (savedBatch ? `Batch ${savedBatch}` : (email || 'Set your batch'))
    : 'Sign in to personalise';
  const initial = (displayName || email || 'S').trim().charAt(0).toUpperCase();
  const to = isSignedIn ? '/profile' : '/login';
  const title = isSignedIn ? 'Open profile' : 'Sign in';

  return (
    <Link to={to} className="dashboard-card profile-card profile-card--link" title={title}>
      <span className="card-icon"><IconUser /></span>
      {user?.imageUrl ? (
        <img
          src={user.imageUrl}
          alt=""
          className="profile-avatar profile-avatar--img"
          referrerPolicy="no-referrer"
        />
      ) : (
        <div className="profile-avatar">{initial}</div>
      )}
      <div className="profile-info">
        <span className="profile-name">{displayName}</span>
        <span className="profile-subtitle">{subtitle}</span>
      </div>
    </Link>
  );
}

export function DashboardLayout({ children, onActiveWeekdayChange, headerActions, batch }) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { isSignedIn, user } = useAuthUser();
  const welcomeName = isSignedIn
    ? (user?.firstName || user?.fullName?.split(/\s+/)[0] || 'there')
    : 'Student';
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
        <SidebarContent collapsed={collapsed} onActiveWeekdayChange={onActiveWeekdayChange} batch={batch} />
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
          <SidebarContent batch={batch} />
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
            <h1 className="welcome-heading">Welcome, {welcomeName}</h1>
          </div>
          {headerActions && (
            <div className="header-actions">{headerActions}</div>
          )}
        </header>

        {/* Existing Timetable Page Content */}
        <div className="dashboard-content">
          {children}
        </div>
      </div>
    </div>
  );
}
