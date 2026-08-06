import { useState, useEffect, useLayoutEffect, useMemo, useCallback, useRef, memo } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import './side_columns.css';
import { loadAnnouncements, loadExamDates, loadCalendarOverrides } from '../lib/sidebar_feeds';
import { loadTentativeCalendarDate, loadTentativeCalendarMonth } from '../lib/tentative_calendar';
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

const IconCalendarArrow = ({ direction }) => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points={direction === 'next' ? '9 6 15 12 9 18' : '15 6 9 12 15 18'} />
  </svg>
);

// ─── Calendar weekday-mapping ─────────────────────────────────────────
// Header order is Mon-Sun. Indices: 0=M 1=T 2=W 3=T 4=F 5=S 6=S.
// A date can "follow" any weekday's timetable (e.g. a Saturday running
// Monday's schedule). Sunday is always a holiday → null.
// Default rule: Mon–Fri map to themselves, Sat/Sun map to null.
// Per-date overrides are now loaded from the backend
// (`/calendar-overrides?batch=<code>`) — see `loadCalendarOverrides`.
const MON_SUN = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const WEEKDAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
const CALENDAR_KIND_LABELS = {
  holiday: 'Holiday',
  follow_day: 'Different timetable',
  mst: 'MST week',
  est: 'EST week',
  assessment: 'Assessment',
  frosh: 'Frosh',
};

const pad2 = (n) => String(n).padStart(2, '0');
const ymdKey = (y, m, d) => `${y}-${pad2(m + 1)}-${pad2(d)}`;
// JS getDay: 0=Sun..6=Sat → our 0=Mon..6=Sun
const toMonSunIdx = (jsDay) => (jsDay + 6) % 7;

function defaultWeekdayIdx(monSunIdx) {
  return monSunIdx <= 4 ? monSunIdx : null;
}

// Given the backend override rows, return a { 'YYYY-MM-DD': overrideRow } map
// keyed by date. If multiple rows land on the same date we prefer the more
// specific scope (branch > year > global) so a per-branch holiday can shadow
// a global follow-day rule for that same date.
const SCOPE_PRIORITY = { branch: 2, year: 1, global: 0 };
function buildOverrideMap(rows) {
  const map = new Map();
  if (!Array.isArray(rows)) return map;
  for (const row of rows) {
    if (!row || typeof row.date !== 'string' || !row.kind) continue;
    const prev = map.get(row.date);
    const prevRank = prev ? (SCOPE_PRIORITY[prev.scope] ?? 0) : -1;
    const nextRank = SCOPE_PRIORITY[row.scope] ?? 0;
    if (!prev || nextRank >= prevRank) map.set(row.date, row);
  }
  return map;
}

// Resolve the weekday-index to use for a given date, honouring overrides:
//   - kind = 'holiday'    → null (no classes)
//   - kind = 'follow_day' → follows_day (0..4)
//   - no override         → default Mon..Fri map, Sat/Sun → null
function weekdayIdxFor(year, month, day, overrideMap) {
  const key = ymdKey(year, month, day);
  if (overrideMap && overrideMap.has(key)) {
    const row = overrideMap.get(key);
    if (row.kind === 'holiday') return null;
    if (row.kind === 'follow_day' && Number.isInteger(row.follows_day)) {
      return row.follows_day;
    }
  }
  const jsDay = new Date(year, month, day).getDay();
  return defaultWeekdayIdx(toMonSunIdx(jsDay));
}

function calendarOverridePresentation(override) {
  if (!override) return null;
  if (override.kind === 'follow_day') {
    const followedDay = WEEKDAY_NAMES[override.follows_day] || 'another day';
    return {
      label: `Follows ${followedDay}`,
      detail: override.reason || `Classes follow ${followedDay}'s timetable.`,
    };
  }
  const label = CALENDAR_KIND_LABELS[override.kind] || 'Schedule update';
  return {
    label,
    detail: override.reason || (override.kind === 'holiday' ? 'No classes scheduled.' : label),
  };
}

function formatCampusClock(value) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(value || '').trim());
  if (!match) return '';
  const date = new Date(2000, 0, 1, Number(match[1]), Number(match[2]));
  return date.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
}

function formatCampusDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || '').trim());
  if (!match) return '';
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
  });
}

function formatCampusEventRange(event) {
  const startTime = formatCampusClock(event.startTime);
  const endTime = formatCampusClock(event.endTime);
  if (event.startDate && event.endDate && event.startDate !== event.endDate) {
    return `${formatCampusDate(event.startDate)}${startTime ? `, ${startTime}` : ''} – ${formatCampusDate(event.endDate)}${endTime ? `, ${endTime}` : ''}`;
  }
  if (startTime && endTime) return `${startTime}–${endTime}`;
  return startTime || endTime || 'Time not specified';
}

function isMlscCampusEvent(event) {
  return [event?.event, event?.society, event?.description]
    .some((value) => String(value || '').toLocaleLowerCase().includes('mlsc'));
}

function prioritizeMlscCampusEvents(items) {
  if (!Array.isArray(items)) return [];
  return items
    .map((event, index) => ({ event, index, isMlsc: isMlscCampusEvent(event) }))
    .sort((a, b) => Number(b.isMlsc) - Number(a.isMlsc) || a.index - b.index)
    .map(({ event }) => event);
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

const feedCache = new Map()
const feedPromises = new Map()

function useCachedFeed(key, loader) {
  const [state, setState] = useState(() => feedCache.get(key) || { status: 'loading', items: [] })
  useEffect(() => {
    if (feedCache.has(key)) {
      setState(feedCache.get(key))
      return undefined
    }
    const pending = feedPromises.get(key) || loader()
    feedPromises.set(key, pending)
    let alive = true
    pending.then((result) => {
      feedCache.set(key, result)
      feedPromises.delete(key)
      if (alive) setState(result)
    })
    return () => { alive = false }
  }, [key, loader])
  return state
}

export const SidebarContent = memo(function SidebarContent({ onActiveWeekdayChange, batch, showLogo = false }) {
  // ─── Mini calendar ──────────────────────────────────────
  const today = useMemo(() => new Date(), []);
  const [visibleMonth, setVisibleMonth] = useState(
    () => new Date(today.getFullYear(), today.getMonth(), 1),
  );
  const year = visibleMonth.getFullYear();
  const month = visibleMonth.getMonth();        // 0-indexed
  const todayDate = today.getDate();
  const isCurrentMonth = year === today.getFullYear() && month === today.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstWeekdayIdx = toMonSunIdx(new Date(year, month, 1).getDay());

  // hovered day → number (1..daysInMonth) or null
  const [hoveredDay, setHoveredDay] = useState(null);
  const [dayTooltip, setDayTooltip] = useState(null);
  const dayTooltipRef = useRef(null);
  const [selectedDay, setSelectedDay] = useState(() => today.getDate());

  const showDayTooltip = useCallback((day, text, element) => {
    setHoveredDay(day);
    if (!text || !element) {
      setDayTooltip(null);
      return;
    }
    const rect = element.getBoundingClientRect();
    setDayTooltip({
      day,
      text,
      anchorX: rect.left + rect.width / 2,
      left: rect.left + rect.width / 2,
      arrowOffset: 0,
      top: Math.max(8, rect.top - 8),
    });
  }, []);

  useLayoutEffect(() => {
    const tooltip = dayTooltipRef.current;
    if (!dayTooltip || !tooltip) return;
    const halfWidth = tooltip.offsetWidth / 2;
    const edgeGap = 8;
    const left = Math.min(
      window.innerWidth - halfWidth - edgeGap,
      Math.max(halfWidth + edgeGap, dayTooltip.anchorX),
    );
    const arrowOffset = dayTooltip.anchorX - left;
    if (Math.abs(left - dayTooltip.left) < 0.5 && Math.abs(arrowOffset - dayTooltip.arrowOffset) < 0.5) return;
    setDayTooltip((current) => current && ({ ...current, left, arrowOffset }));
  }, [dayTooltip]);

  useEffect(() => {
    if (!dayTooltip) return undefined;
    const hideTooltip = () => setDayTooltip(null);
    window.addEventListener('resize', hideTooltip);
    window.addEventListener('scroll', hideTooltip, true);
    return () => {
      window.removeEventListener('resize', hideTooltip);
      window.removeEventListener('scroll', hideTooltip, true);
    };
  }, [dayTooltip]);

  // Sidebar feeds — backend with bundled fallback. Exam dates + calendar
  // overrides are filtered server-side by the currently-viewed batch
  // (year scope + subject codes / global vs year vs branch).
  const announcements = useCachedFeed('announcements', loadAnnouncements);
  const examDatesLoader = useCallback(() => loadExamDates(batch), [batch]);
  const examDates = useCachedFeed(`exam-dates:${batch || ''}`, examDatesLoader);
  const overridesLoader = useCallback(() => loadCalendarOverrides(batch), [batch]);
  const calendarOverrides = useCachedFeed(`calendar-overrides:${batch || ''}`, overridesLoader);

  // Campus events are a separate public feed from the academic overrides.
  // Only the compact month summary is loaded here; full records are deferred
  // until the user opens a date.
  const campusMonthKey = `${year}-${month + 1}`;
  const todayKey = useMemo(
    () => ymdKey(today.getFullYear(), today.getMonth(), today.getDate()),
    [today],
  );
  const [campusMonthState, setCampusMonthState] = useState({
    key: '',
    status: 'loading',
    days: {},
  });
  const [campusDateStates, setCampusDateStates] = useState(() => ({
    [todayKey]: { status: 'loading', items: [] },
  }));
  const preserveSelectionForNextMonth = useRef(false);
  useEffect(() => {
    let alive = true;
    loadTentativeCalendarDate(todayKey).then((result) => {
      if (alive) {
        setCampusDateStates((current) => ({ ...current, [todayKey]: result }));
      }
    });
    return () => { alive = false; };
  }, [todayKey]);
  useEffect(() => {
    let alive = true;
    loadTentativeCalendarMonth(year, month + 1).then((result) => {
      if (!alive) return;
      setCampusMonthState({ key: campusMonthKey, ...result });

      if (!preserveSelectionForNextMonth.current) return;
      preserveSelectionForNextMonth.current = false;
      const firstEventDate = Object.keys(result.days || {}).sort()[0];
      if (!firstEventDate) return;

      setSelectedDay(Number(firstEventDate.slice(-2)));
      setCampusDateStates((current) => ({
        ...current,
        [firstEventDate]: { status: 'loading', items: current[firstEventDate]?.items || [] },
      }));
      loadTentativeCalendarDate(firstEventDate).then((dateResult) => {
        if (alive) {
          setCampusDateStates((current) => ({ ...current, [firstEventDate]: dateResult }));
        }
      });
    });
    return () => { alive = false; };
  }, [campusMonthKey, month, year]);
  const campusEventDays = campusMonthState.key === campusMonthKey
    ? campusMonthState.days
    : {};

  // Build a fast { 'YYYY-MM-DD' → override } lookup from the loaded rows;
  // more-specific scopes (branch > year > global) shadow less-specific ones
  // on the same date.
  const overrideMap = useMemo(
    () => buildOverrideMap(calendarOverrides.items),
    [calendarOverrides.items],
  );

  // Weekday header column to highlight: hovered day's mapping if any,
  // otherwise today's mapping only while the current month is visible.
  const activeDay = hoveredDay ?? selectedDay ?? (isCurrentMonth ? todayDate : null);
  const activeWeekdayIdx = activeDay == null
    ? null
    : weekdayIdxFor(year, month, activeDay, overrideMap);

  const changeMonth = (offset) => {
    setHoveredDay(null);
    setDayTooltip(null);
    preserveSelectionForNextMonth.current = selectedDay != null;
    setSelectedDay(null);
    setVisibleMonth((current) => (
      new Date(current.getFullYear(), current.getMonth() + offset, 1)
    ));
  };

  const showCurrentMonth = () => {
    setHoveredDay(null);
    setDayTooltip(null);
    if (isCurrentMonth) return;
    preserveSelectionForNextMonth.current = selectedDay != null;
    setSelectedDay(null);
    setVisibleMonth(new Date(today.getFullYear(), today.getMonth(), 1));
  };

  const selectedDateKey = selectedDay == null ? '' : ymdKey(year, month, selectedDay);
  const selectedOverride = selectedDateKey ? overrideMap.get(selectedDateKey) : null;
  const selectedCampusSummary = selectedDateKey ? campusEventDays[selectedDateKey] : null;
  const selectedCampusState = selectedDateKey
    ? (campusDateStates[selectedDateKey] || { status: 'loading', items: [] })
    : { status: 'idle', items: [] };
  const selectedCampusEvents = useMemo(
    () => prioritizeMlscCampusEvents(selectedCampusState.items),
    [selectedCampusState.items],
  );
  const selectedPresentation = calendarOverridePresentation(selectedOverride);
  const selectedDateLabel = selectedDay == null
    ? ''
    : new Date(year, month, selectedDay).toLocaleDateString('en-IN', {
      weekday: 'long',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });

  const requestCampusDate = useCallback((dateKey) => {
    setCampusDateStates((current) => ({
      ...current,
      [dateKey]: { status: 'loading', items: current[dateKey]?.items || [] },
    }));
    loadTentativeCalendarDate(dateKey).then((result) => {
      setCampusDateStates((current) => ({ ...current, [dateKey]: result }));
    });
  }, []);

  const selectCalendarDay = (day, hasCampusEvents) => {
    setHoveredDay(null);
    setDayTooltip(null);
    preserveSelectionForNextMonth.current = false;
    setSelectedDay(day);
    const dateKey = ymdKey(year, month, day);
    if (hasCampusEvents && !campusDateStates[dateKey]) requestCampusDate(dateKey);
  };

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
    <div className="sidebar-inner">
      {showLogo && (
        <div className="sidebar-header">
          <Link to="/" className="sidebar-logo-container" aria-label="Go to home">
            <div className="logo-img-wrapper">
              <img src="/MLSC-logo.png" alt="MLSC Logo" className="sidebar-logo-img" />
            </div>
          </Link>
        </div>
      )}

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
          </div>
          <div className="mini-calendar">
            <div className="calendar-month-controls" aria-label="Calendar month navigation">
              <button
                type="button"
                className="calendar-month-arrow"
                onClick={() => changeMonth(-1)}
                aria-label="Previous month"
                title="Previous month"
              >
                <IconCalendarArrow direction="previous" />
              </button>
              <button
                type="button"
                className={`calendar-month-year ${isCurrentMonth ? 'is-current' : ''}`}
                onClick={showCurrentMonth}
                aria-label={`${MONTH_NAMES[month]} ${year}. Go to current month`}
                title={isCurrentMonth ? 'Current month' : 'Go to current month'}
              >
                {`${MONTH_NAMES[month]} ${year}`}
              </button>
              <button
                type="button"
                className="calendar-month-arrow"
                onClick={() => changeMonth(1)}
                aria-label="Next month"
                title="Next month"
              >
                <IconCalendarArrow direction="next" />
              </button>
            </div>
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
              onMouseLeave={() => {
                setHoveredDay(null);
                setDayTooltip(null);
              }}
            >
              {cells.map((cell) => {
                if (cell.blank) {
                  return <span key={cell.key} className="calendar-day calendar-day--blank" />;
                }
                const isToday = isCurrentMonth && cell.day === todayDate;
                const isHovered = cell.day === hoveredDay;
                const dateKey = ymdKey(year, month, cell.day);
                const override = overrideMap.get(dateKey);
                const campusSummary = campusEventDays[dateKey];
                const hasCampusEvents = Boolean(campusSummary?.hasEvent && campusSummary.count > 0);
                const hasMlscEvent = Boolean(campusSummary?.hasMlscEvent);
                const KIND_CLASS = {
                  holiday: 'calendar-day--holiday',
                  follow_day: 'calendar-day--follow',
                  mst: 'calendar-day--mst',
                  est: 'calendar-day--est',
                  assessment: 'calendar-day--assessment',
                  frosh: 'calendar-day--frosh',
                };
                const overrideClass = override ? (KIND_CLASS[override.kind] || '') : '';
                // Sat/Sun with no override at all → dim so it visually reads
                // as "no class here". Weekends that HAVE a follow_day override
                // don't get dimmed (they become class days via the ring style).
                const jsDay = new Date(year, month, cell.day).getDay();
                const isWeekend = jsDay === 0 || jsDay === 6;
                const dimClass = (isWeekend && !override) ? 'calendar-day--dim' : '';
                const presentation = calendarOverridePresentation(override);
                const cellDateLabel = new Date(year, month, cell.day).toLocaleDateString('en-IN', {
                  weekday: 'long',
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                });
                const academicTitle = presentation
                  ? `${presentation.label}${presentation.detail !== presentation.label ? ` · ${presentation.detail}` : ''}`
                  : (isWeekend ? 'No classes' : undefined);
                const campusTitle = hasCampusEvents
                  ? `${campusSummary.count} campus event${campusSummary.count === 1 ? '' : 's'}${hasMlscEvent ? ' · includes MLSC' : ''}${campusSummary.hasConflict ? ' · scheduling conflict' : ''}`
                  : '';
                const title = [academicTitle, campusTitle].filter(Boolean).join(' · ') || undefined;
                const className = `calendar-day ${isToday ? 'today' : ''} ${isHovered ? 'hovered' : ''} ${selectedDay === cell.day ? 'calendar-day--selected' : ''} ${overrideClass} ${dimClass} ${hasCampusEvents ? 'calendar-day--campus-event' : ''} ${hasMlscEvent ? 'calendar-day--mlsc-event' : ''} ${campusSummary?.hasConflict ? 'calendar-day--campus-conflict' : ''}`;
                return (
                  <button
                    type="button"
                    key={cell.key}
                    className={className}
                    data-campus-event-count={hasCampusEvents ? campusSummary.count : undefined}
                    onMouseEnter={(event) => showDayTooltip(cell.day, title, event.currentTarget)}
                    onFocus={(event) => {
                      if (event.currentTarget.matches(':focus-visible')) {
                        showDayTooltip(cell.day, title, event.currentTarget);
                      } else {
                        setHoveredDay(cell.day);
                      }
                    }}
                    onBlur={() => {
                      setHoveredDay(null);
                      setDayTooltip(null);
                    }}
                    onClick={() => selectCalendarDay(cell.day, hasCampusEvents)}
                    aria-describedby={title && dayTooltip?.day === cell.day ? 'calendar-day-tooltip' : undefined}
                    aria-label={title ? `${cellDateLabel}. ${title}` : cellDateLabel}
                    aria-pressed={selectedDay === cell.day}
                  >
                    {cell.day}
                  </button>
                );
              })}
            </div>
            {dayTooltip && typeof document !== 'undefined' && createPortal(
              <div
                id="calendar-day-tooltip"
                className="calendar-day-tooltip"
                role="tooltip"
                ref={dayTooltipRef}
                style={{
                  left: dayTooltip.left,
                  top: dayTooltip.top,
                  '--calendar-tooltip-arrow-offset': `${dayTooltip.arrowOffset}px`,
                }}
              >
                {dayTooltip.text}
              </div>,
              document.body,
            )}
            {selectedDay != null && (
              <div
                className={`calendar-date-detail calendar-date-detail--${selectedOverride?.kind || 'campus'}`}
                role="status"
                aria-live="polite"
              >
                <div className="calendar-date-detail-head">
                  <span
                    className={`calendar-legend-swatch calendar-legend-swatch--${selectedOverride ? (selectedOverride.kind === 'follow_day' ? 'follow' : selectedOverride.kind) : 'campus'}`}
                    aria-hidden="true"
                  />
                  <div>
                    <strong>{selectedDateLabel}</strong>
                    <span>
                      {[
                        selectedPresentation?.label,
                        selectedCampusSummary
                          ? `${selectedCampusSummary.count} campus event${selectedCampusSummary.count === 1 ? '' : 's'}${selectedCampusSummary.hasMlscEvent ? ' · MLSC' : ''}`
                          : (campusMonthState.key !== campusMonthKey ? 'Checking campus events…' : 'No campus events'),
                      ].filter(Boolean).join(' · ')}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="calendar-date-detail-close"
                    onClick={() => setSelectedDay(null)}
                    aria-label="Close calendar date details"
                  >
                    ×
                  </button>
                </div>
                {selectedPresentation && selectedPresentation.detail !== selectedPresentation.label && (
                  <p>{selectedPresentation.detail}</p>
                )}
                {selectedCampusSummary && (
                  <div className="campus-event-details">
                    {selectedCampusState.status === 'loading' ? (
                      <div className="campus-event-loading" aria-label="Loading campus events">
                        <span aria-hidden="true" />
                        Loading event details…
                      </div>
                    ) : selectedCampusState.status === 'error' ? (
                      <div className="campus-event-error">
                        <span>Event details are temporarily unavailable.</span>
                        <button type="button" onClick={() => requestCampusDate(selectedDateKey)}>Retry</button>
                      </div>
                    ) : selectedCampusEvents.length === 0 ? (
                      <span className="campus-event-empty">No event details available.</span>
                    ) : (
                      <div className="campus-event-list">
                        {selectedCampusEvents.map((event) => (
                          <article key={event.id} className="campus-event-item">
                            <div className="campus-event-item-head">
                              <strong>{event.event}</strong>
                              {event.status && <span className="campus-event-status">{event.status}</span>}
                            </div>
                            {event.society && <span className="campus-event-society">{event.society}</span>}
                            <div className="campus-event-meta">
                              <span>{formatCampusEventRange(event)}</span>
                              {event.venue && <span>{event.venue}</span>}
                              {event.conflict && <span className="campus-event-conflict">Scheduling conflict</span>}
                            </div>
                            {event.description && event.description.toLocaleLowerCase() !== event.event.toLocaleLowerCase() && (
                              <p className="campus-event-description">{event.description}</p>
                            )}
                          </article>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                {!selectedCampusSummary && campusMonthState.key === campusMonthKey && (
                  <div className="campus-event-details">
                    <span className="campus-event-empty">No campus events on this date.</span>
                  </div>
                )}
              </div>
            )}
            {/* Legend — only shows swatches for kinds actually visible
                this month. "Today" is always shown. */}
            <div className="calendar-legend" aria-label="Calendar legend">
              <span className="calendar-legend-item">
                <span className="calendar-legend-swatch calendar-legend-swatch--today" aria-hidden="true" />
                Today
              </span>
              {Object.values(campusEventDays).some((summary) => !summary.hasMlscEvent) && (
                <span className="calendar-legend-item">
                  <span className="calendar-legend-swatch calendar-legend-swatch--campus" aria-hidden="true" />
                  Campus event
                </span>
              )}
              {Object.values(campusEventDays).some((summary) => summary.hasMlscEvent) && (
                <span className="calendar-legend-item">
                  <span className="calendar-legend-swatch calendar-legend-swatch--mlsc" aria-hidden="true" />
                  MLSC event
                </span>
              )}
              {(() => {
                const kindsPresent = new Set();
                for (const cell of cells) {
                  if (cell.blank) continue;
                  const ov = overrideMap.get(ymdKey(year, month, cell.day));
                  if (ov && ov.kind) kindsPresent.add(ov.kind);
                }
                const items = [
                  { kind: 'holiday', label: 'Holiday', swatch: 'holiday' },
                  { kind: 'follow_day', label: 'Follows day', swatch: 'follow' },
                  { kind: 'mst', label: 'MST week', swatch: 'mst' },
                  { kind: 'est', label: 'EST week', swatch: 'est' },
                  { kind: 'assessment', label: 'Assessment', swatch: 'assessment' },
                  { kind: 'frosh', label: 'Frosh', swatch: 'frosh' },
                ];
                return items
                  .filter((it) => kindsPresent.has(it.kind))
                  .map((it) => (
                    <span key={it.kind} className="calendar-legend-item">
                      <span
                        className={`calendar-legend-swatch calendar-legend-swatch--${it.swatch}`}
                        aria-hidden="true"
                      />
                      {it.label}
                    </span>
                  ));
              })()}
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
});

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

export function DashboardLayout({ children, footer, onActiveWeekdayChange, headerActions, headerBanner, batch }) {
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
        <SidebarContent onActiveWeekdayChange={onActiveWeekdayChange} batch={batch} />
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
          <SidebarContent batch={batch} showLogo />
        </div>
      </div>

      {/* Right column: main content + footer stacked (footer is OUTSIDE
          .dashboard-main so its 24px padding doesn't push the footer up
          from the true bottom edge). */}
      <div className="dashboard-column">
        {/* Main Content Area */}
        <div className="dashboard-main">
          {/* Header Section */}
          <header className="dashboard-header" data-signed-in={isSignedIn ? 'true' : 'false'}>
            {/* Hamburger — desktop hides it via CSS, only shown at hamburger breakpoint. */}
            <button className="hamburger-btn" onClick={toggleDrawer} aria-label="Open menu">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="3" y1="12" x2="21" y2="12"></line>
                <line x1="3" y1="6" x2="21" y2="6"></line>
                <line x1="3" y1="18" x2="21" y2="18"></line>
              </svg>
            </button>
            <Link to="/" className="dashboard-brand" aria-label="MLSC home">
              <img src="/MLSC-logo.png" alt="" className="dashboard-brand-mark" />
              <div className="dashboard-brand-text">
                <span className="dashboard-brand-name">MLSC</span>
                <span className="dashboard-brand-sub">Timetable</span>
              </div>
            </Link>
            <div className="dashboard-brand-divider" aria-hidden="true" />
            {/* Right-side welcome block mirrors .dashboard-brand's structure
                exactly — same wrapper, same padding, same gap, and a hidden
                logo placeholder so both blocks have identical box geometry
                and vertical centering. */}
            <div className="dashboard-welcome">
              <img
                src="/MLSC-logo.png"
                alt=""
                className="dashboard-brand-mark dashboard-brand-mark--ghost"
                aria-hidden="true"
              />
              <h1 className="welcome-heading">
                <span className="welcome-line">Welcome,</span>{' '}
                <span className="welcome-name">{welcomeName}</span>
              </h1>
            </div>
            {headerBanner && (
              <div className="header-banner-slot">{headerBanner}</div>
            )}
            {headerActions && (
              <div className="header-actions">{headerActions}</div>
            )}
          </header>

          {/* Existing Timetable Page Content */}
          <div className="dashboard-content">
            {children}
          </div>
        </div>

        {footer}
      </div>
    </div>
  );
}
