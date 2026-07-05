import { useEffect, useMemo, useState } from 'react'
import { loadCalendarOverrides } from '../lib/sidebar_feeds'
import './FollowDayBanner.css'

const WEEKDAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']
const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// Midnight of the given date, in local time — so a follow-day dated today
// still counts as "upcoming" until the next day starts.
function startOfDay(d) {
  const out = new Date(d)
  out.setHours(0, 0, 0, 0)
  return out
}

function parseYmd(ymd) {
  if (!ymd || typeof ymd !== 'string') return null
  const [y, m, d] = ymd.split('-').map((x) => parseInt(x, 10))
  if (!y || !m || !d) return null
  return new Date(y, m - 1, d)
}

// Days-until label: "Today", "Tomorrow", or "In N days".
function relativeLabel(target, today) {
  const diffDays = Math.round(
    (startOfDay(target).getTime() - startOfDay(today).getTime()) / 86_400_000,
  )
  if (diffDays <= 0) return 'Today'
  if (diffDays === 1) return 'Tomorrow'
  return `In ${diffDays} days`
}

function formatDateLong(d) {
  const wd = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()]
  return `${wd} · ${MONTH_SHORT[d.getMonth()]} ${d.getDate()}`
}

/**
 * Compact alert banner shown above the grid whenever the current batch has
 * a follow-day override in the next 7 days (e.g. "This Saturday follows
 * Monday's schedule"). Returns null when there's nothing to surface so
 * pages can render it unconditionally.
 */
export default function FollowDayBanner({ batch }) {
  const [feed, setFeed] = useState({ status: 'loading', items: [] })

  useEffect(() => {
    let alive = true
    loadCalendarOverrides(batch).then((res) => {
      if (alive) setFeed(res)
    })
    return () => {
      alive = false
    }
  }, [batch])

  // Re-tick every 15 min so "Today"/"Tomorrow" labels stay accurate across
  // midnight without hammering the browser.
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 15 * 60_000)
    return () => clearInterval(id)
  }, [])

  const upcoming = useMemo(() => {
    if (!Array.isArray(feed.items)) return []
    const now = new Date()
    const today = startOfDay(now)
    const cutoff = new Date(today.getTime() + 7 * 86_400_000)
    return feed.items
      .filter((o) => o?.kind === 'follow_day' && Number.isInteger(o.follows_day))
      .map((o) => ({ ...o, _date: parseYmd(o.date) }))
      .filter((o) => o._date && o._date >= today && o._date < cutoff)
      .sort((a, b) => a._date - b._date)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feed.items, tick])

  if (upcoming.length === 0) return null

  const now = new Date()

  return (
    <div className="follow-day-banner" role="status" aria-live="polite">
      <div className="follow-day-head">
        <span className="follow-day-icon" aria-hidden="true">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
          </svg>
        </span>
        <span className="follow-day-title">
          Heads up · schedule change{upcoming.length > 1 ? 's' : ''} this week
        </span>
      </div>
      <ul className="follow-day-list">
        {upcoming.map((o) => (
          <li key={o.id} className="follow-day-row">
            <span className="follow-day-when">{relativeLabel(o._date, now)}</span>
            <span className="follow-day-dot" aria-hidden="true">·</span>
            <span className="follow-day-date">{formatDateLong(o._date)}</span>
            <span className="follow-day-dot" aria-hidden="true">→</span>
            <span className="follow-day-target">
              runs {WEEKDAY_NAMES[o.follows_day]}&apos;s schedule
            </span>
            {o.reason && (
              <span className="follow-day-reason"> — {o.reason}</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
