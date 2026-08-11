import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import Combobox from '../components/Combobox'
import { useTheme } from '../hooks/useTheme'
import { loadBatches } from '../lib/batches'
import {
  loadCourses,
  planImprovements,
  recallBatch,
  rememberBatch,
  severityClass,
} from '../lib/improvement'
import './ImprovementPage.css'

const ORDINAL = ['', '1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th']

function semesterLabel(value) {
  return ORDINAL[value] ? `${ORDINAL[value]} semester` : `Semester ${value}`
}

function SessionRow({ item }) {
  return (
    <li className="im-session">
      <span className="im-session-day">{item.day.slice(0, 3)}</span>
      <span className="im-session-time">{item.start_time}–{item.end_time}</span>
      <span className={`im-type im-type-${String(item.type || '').toLowerCase()}`}>{item.type}</span>
      {item.room_label || item.room ? (
        <span className="im-room">{item.room_label || item.room}</span>
      ) : null}
    </li>
  )
}

function ClashRow({ clash }) {
  const tone = severityClass(clash.severity)
  return (
    <li className={`im-clash im-clash-${tone}`}>
      <span className="im-clash-when">{clash.day.slice(0, 3)} {clash.start_time}</span>
      <span className="im-clash-body">
        <strong>{clash.improvement_class.code || 'Improvement class'}</strong>
        <span className="im-clash-vs">clashes with your</span>
        <strong>{clash.your_class.code || clash.your_class.subject || 'class'}</strong>
        <span className="im-clash-type">({clash.your_class.type})</span>
      </span>
      {clash.uncertain ? (
        <span className="im-clash-note" title="Depends on which elective you pick">
          elective
        </span>
      ) : null}
    </li>
  )
}

function OptionCard({ option }) {
  const [open, setOpen] = useState(false)
  const counts = option.clash_counts
  return (
    <li className={`im-option ${option.feasible ? '' : 'is-blocked'}`}>
      <div className="im-option-head">
        <div className="im-option-batches">
          <strong>{option.batches.join(' · ')}</strong>
          <span className="im-muted">{semesterLabel(option.semester)}</span>
        </div>
        <div className="im-option-status">
          {option.feasible ? (
            counts.total === 0 ? (
              <span className="im-tag im-tag-clean">No clashes</span>
            ) : (
              <span className="im-tag im-tag-ok">
                {counts.total} clash{counts.total === 1 ? '' : 'es'}
              </span>
            )
          ) : (
            <span className="im-tag im-tag-blocked">
              {counts.practical > 0 ? 'Lab clash' : 'Over the limit'}
            </span>
          )}
        </div>
      </div>

      <ul className="im-sessions">
        {option.sessions.map((item, index) => (
          <SessionRow key={`${item.day}-${item.start_time}-${index}`} item={item} />
        ))}
      </ul>

      {option.clashes.length ? (
        <>
          <button type="button" className="im-toggle" onClick={() => setOpen((value) => !value)}>
            {open ? 'Hide' : 'Show'} {option.clashes.length} clash
            {option.clashes.length === 1 ? '' : 'es'}
          </button>
          {open ? (
            <ul className="im-clashes">
              {option.clashes.map((clash, index) => (
                <ClashRow key={index} clash={clash} />
              ))}
            </ul>
          ) : null}
        </>
      ) : null}
    </li>
  )
}

export default function ImprovementPage() {
  const { theme, toggleTheme } = useTheme()
  // Signed-in students already told us their batch on their profile; everyone
  // else is remembered locally after answering once. Read it during the first
  // render so step 1 is skipped without a state round-trip.
  const [batch, setBatch] = useState(recallBatch)
  const [confirmedBatch, setConfirmedBatch] = useState(recallBatch)
  const [batchOptions, setBatchOptions] = useState([])
  const [courses, setCourses] = useState({ status: 'idle' })
  const [picked, setPicked] = useState([])
  const [search, setSearch] = useState('')
  const [plan, setPlan] = useState({ status: 'idle' })

  useEffect(() => {
    let cancelled = false
    loadBatches().then((years) => {
      if (cancelled) return
      const options = []
      for (const year of years || []) {
        for (const stream of year.streams || []) {
          for (const code of stream.batches || []) {
            options.push({ value: code, label: code, hint: `${year.label} — ${stream.name}` })
          }
        }
      }
      setBatchOptions(options)
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    // Step 2 only renders once a batch is confirmed, so there is no stale
    // course list to clear when it is not.
    if (!confirmedBatch) return undefined
    let cancelled = false
    setCourses({ status: 'loading' })
    setPicked([])
    setPlan({ status: 'idle' })
    loadCourses(confirmedBatch).then((response) => {
      if (!cancelled) setCourses(response)
    })
    return () => {
      cancelled = true
    }
  }, [confirmedBatch])

  const visibleCourses = useMemo(() => {
    if (courses.status !== 'ok') return []
    const needle = search.trim().toUpperCase()
    if (!needle) return courses.data.courses
    return courses.data.courses.filter(
      (course) =>
        course.code.toUpperCase().includes(needle) ||
        String(course.subject || '').toUpperCase().includes(needle),
    )
  }, [courses, search])

  function togglePick(code) {
    setPicked((current) =>
      current.includes(code) ? current.filter((value) => value !== code) : [...current, code],
    )
    // Leaving `loading` is what invalidates any search still in flight.
    setPlan({ status: 'idle' })
  }

  function confirmBatch() {
    const value = batch.trim().toUpperCase()
    if (!value) return
    rememberBatch(value)
    setConfirmedBatch(value)
  }

  // A reply is only accepted while the search that asked for it is still the
  // one running. Changing the selection moves the state off `loading`, so a
  // slow answer for a selection the student has abandoned is discarded rather
  // than shown against the courses now ticked.
  function runPlan() {
    if (!confirmedBatch || picked.length === 0) return
    const key = `${confirmedBatch}|${picked.join(',')}`
    setPlan({ status: 'loading', key })
    planImprovements(confirmedBatch, picked).then((response) => {
      setPlan((current) =>
        current.status === 'loading' && current.key === key ? { ...response, key } : current,
      )
    })
  }

  const data = plan.status === 'ok' ? plan.data : null

  return (
    <div className="im-page">
      <header className="im-header">
        <div className="im-header-left">
          <Link to="/" className="im-back" aria-label="Back to home">←</Link>
          <div>
            <h1>Improvement courses</h1>
            <p className="im-sub">
              Find a junior batch whose classes you can actually sit for a course you are repeating
            </p>
          </div>
        </div>
        <button type="button" className="im-theme" onClick={toggleTheme} aria-label="Toggle theme">
          {theme === 'dark' ? '☀' : '☾'}
        </button>
      </header>

      {/* Step 1 — batch */}
      <section className="im-step">
        <h2><span className="im-stepno">1</span> Your batch</h2>
        {confirmedBatch ? (
          <p className="im-confirmed">
            <strong>{confirmedBatch}</strong>
            {courses.status === 'ok' ? (
              <span className="im-muted">
                {semesterLabel(courses.data.semester)}
                {courses.data.semester_label ? ` · ${courses.data.semester_label}` : ''}
              </span>
            ) : null}
            <button type="button" className="im-link" onClick={() => setConfirmedBatch('')}>
              change
            </button>
          </p>
        ) : (
          <div className="im-batchrow">
            <Combobox
              value={batch}
              onChange={setBatch}
              options={batchOptions}
              placeholder="Search your batch…"
              ariaLabel="Your batch"
              className="im-batchpicker"
            />
            <button type="button" className="im-primary" onClick={confirmBatch} disabled={!batch}>
              Continue
            </button>
          </div>
        )}
      </section>

      {/* Step 2 — courses */}
      {confirmedBatch ? (
        <section className="im-step">
          <h2><span className="im-stepno">2</span> Courses you are repeating</h2>

          {courses.status === 'loading' ? <p className="im-muted">Loading courses…</p> : null}
          {courses.status === 'error' || courses.status === 'not_found' || courses.status === 'no_backend' ? (
            <p className="im-error">{courses.message}</p>
          ) : null}

          {courses.status === 'ok' ? (
            courses.data.count === 0 ? (
              <p className="im-muted">
                There is no earlier semester running alongside {confirmedBatch} this term.
              </p>
            ) : (
              <>
                <p className="im-hint">
                  Only courses from earlier semesters running this term are listed. Semesters
                  alternate, so in your {semesterLabel(courses.data.semester)} you can sit{' '}
                  {courses.data.semester % 2 === 1 ? 'odd' : 'even'}-numbered semesters below
                  yours
                  {courses.data.first_year_semesters_pooled
                    ? ', plus first-year courses from either semester 1 or 2'
                    : ''}
                  .
                </p>
                <input
                  type="search"
                  className="im-search"
                  value={search}
                  placeholder="Search by code or name…"
                  onChange={(event) => setSearch(event.target.value)}
                />
                <ul className="im-courselist">
                  {visibleCourses.slice(0, 120).map((course) => {
                    const active = picked.includes(course.code)
                    return (
                      <li key={course.code}>
                        <button
                          type="button"
                          className={`im-course ${active ? 'is-picked' : ''}`}
                          onClick={() => togglePick(course.code)}
                          aria-pressed={active}
                        >
                          <span className="im-course-code">{course.code}</span>
                          <span className="im-course-name">{course.subject || '—'}</span>
                          <span className="im-course-meta">
                            sem {course.semesters.join('/')} · {course.batch_count} batches
                          </span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
                {visibleCourses.length > 120 ? (
                  <p className="im-muted">
                    Showing the first 120 of {visibleCourses.length}. Narrow the search to see more.
                  </p>
                ) : null}

                <div className="im-actions">
                  <span className="im-muted">
                    {picked.length} selected{picked.length ? `: ${picked.join(', ')}` : ''}
                  </span>
                  <button
                    type="button"
                    className="im-primary"
                    onClick={runPlan}
                    disabled={picked.length === 0 || plan.status === 'loading'}
                  >
                    {plan.status === 'loading' ? 'Searching…' : 'Find batches'}
                  </button>
                </div>
              </>
            )
          ) : null}
        </section>
      ) : null}

      {/* Step 3 — results */}
      {plan.status === 'error' ? <p className="im-error">{plan.message}</p> : null}

      {data ? (
        <section className="im-step">
          <h2><span className="im-stepno">3</span> Your options</h2>

          <p className="im-limits">
            Allowed overlap per course: <strong>{data.limits.max_lecture_clashes}</strong> lecture,{' '}
            <strong>{data.limits.max_tutorial_clashes}</strong> tutorial,{' '}
            <strong>{data.limits.max_practical_clashes}</strong> practical.
            {data.personalized ? ' Your saved elective picks were applied.' : null}
          </p>

          {/* Signing in applies the picks that were saved — it does not mean
              every elective has been chosen, so the caveat still stands
              whenever the backend reports an unresolved slot. */}
          {data.has_unresolved_electives ? (
            <div className="im-notice">
              You still have electives you have not chosen. Those slots are treated as their
              strictest option, so some batches may be rejected that would actually work. Pick your
              electives on your timetable for a more accurate answer.
            </div>
          ) : null}

          {data.unavailable_codes.length ? (
            <div className="im-notice im-notice-warn">
              Not offered by any batch you can join: {data.unavailable_codes.join(', ')}
            </div>
          ) : null}
          {data.blocked_codes.length ? (
            <div className="im-notice im-notice-warn">
              Every batch clashes too much for: {data.blocked_codes.join(', ')}
            </div>
          ) : null}

          {data.plans.length ? (
            <div className="im-plans">
              <h3>Combined timetables</h3>
              <p className="im-muted im-plans-sub">
                One batch per course, checked against each other so two improvement courses never
                land in the same slot.
                {data.plans.length > 5 ? ` Best 5 of ${data.plans.length} shown.` : ''}
                {data.plans_truncated
                  ? ' There are more combinations than were ranked, so a better one may exist.'
                  : ''}
              </p>
              <ol className="im-planlist">
                {data.plans.slice(0, 5).map((entry, index) => (
                  <li key={index} className="im-plan">
                    <span className="im-plan-rank">{index + 1}</span>
                    <div className="im-plan-body">
                      {entry.picks.map((pick) => (
                        <div key={pick.code} className="im-plan-pick">
                          <strong>{pick.code}</strong>
                          <span className="im-muted">join {pick.batches.join(' · ')}</span>
                          <span className="im-plan-clash">
                            {pick.clash_counts.total === 0
                              ? 'clean'
                              : `${pick.clash_counts.total} clash`}
                          </span>
                        </div>
                      ))}
                    </div>
                    <span className="im-plan-total">
                      {entry.total_clashes === 0 ? 'No clashes' : `${entry.total_clashes} total`}
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          ) : null}

          {data.courses.map((course) => (
            <div key={course.code} className="im-course-result">
              <h3>
                {course.code}
                {course.subject ? <span className="im-muted"> · {course.subject}</span> : null}
                <span className="im-result-count">
                  {course.feasible_count} of {course.options.length} workable
                </span>
              </h3>
              {course.options.length === 0 ? (
                <p className="im-muted">No junior batch you can join offers this course.</p>
              ) : (
                <ul className="im-options">
                  {course.options.slice(0, 12).map((option, index) => (
                    <OptionCard key={`${option.batch}-${index}`} option={option} />
                  ))}
                </ul>
              )}
            </div>
          ))}
        </section>
      ) : null}
    </div>
  )
}
