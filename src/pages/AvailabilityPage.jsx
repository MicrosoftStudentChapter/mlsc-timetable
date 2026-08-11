import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import Combobox from '../components/Combobox'
import { useTheme } from '../hooks/useTheme'
import {
  DAYS,
  currentDayName,
  currentTime,
  loadAvailability,
  loadMeta,
  loadResourceWeek,
  loadResources,
  slotOptions,
} from '../lib/schedule'
import './AvailabilityPage.css'

const KINDS = [
  { id: 'room', label: 'Rooms', noun: 'room' },
  { id: 'teacher', label: 'Teachers', noun: 'teacher' },
]

// Round the clock down to the slot that is actually running, so "now" lands
// on a real period instead of a time no class starts at.
function nearestSlot(slots, time) {
  const usable = slotOptions(slots)
  let chosen = usable[0]
  for (const slot of usable) {
    if (slot <= time) chosen = slot
    else break
  }
  return chosen
}

function ClassLine({ item }) {
  const label = item.subject || item.code || 'Class'
  return (
    <li className="av-class">
      <span className="av-class-time">{item.start_time}–{item.end_time}</span>
      <span className="av-class-main">
        <strong>{label}</strong>
        {item.code && item.subject ? <span className="av-class-code">{item.code}</span> : null}
      </span>
      <span className="av-class-meta">
        <span className={`av-type av-type-${String(item.type || '').toLowerCase()}`}>{item.type}</span>
        {item.room_label && item.room_label !== item.room ? (
          <span className="av-room" title={`Indexed as ${item.room}`}>{item.room_label}</span>
        ) : item.room ? (
          <span className="av-room">{item.room}</span>
        ) : null}
        {item.teacher ? <span className="av-teacher">{item.teacher}</span> : null}
      </span>
      <span className="av-batches" title={item.batches?.join(', ')}>
        {item.batches?.length === 1
          ? item.batches[0]
          : `${item.batches?.length ?? 0} batches`}
      </span>
    </li>
  )
}

export default function AvailabilityPage() {
  const { theme, toggleTheme } = useTheme()
  const [kind, setKind] = useState('room')
  const [meta, setMeta] = useState(null)
  const [day, setDay] = useState(() => currentDayName())
  const [time, setTime] = useState('')
  const [result, setResult] = useState({ status: 'idle' })
  const [directory, setDirectory] = useState({ status: 'idle' })
  // Keyed by kind so switching tabs restores the previous pick instead of
  // needing an effect to clear a selection that belongs to the other tab.
  const [selectedByKind, setSelectedByKind] = useState({ room: '', teacher: '' })
  const [week, setWeek] = useState({ status: 'idle' })
  const [query, setQuery] = useState('')
  const selected = selectedByKind[kind]
  const setSelected = useCallback(
    (name) => setSelectedByKind((current) => ({ ...current, [kind]: name })),
    [kind],
  )

  useEffect(() => {
    let cancelled = false
    loadMeta().then((response) => {
      if (cancelled) return
      if (response.status === 'ok') {
        setMeta(response.data)
        setTime((current) => current || nearestSlot(response.data.slots, currentTime()))
      } else {
        setTime((current) => current || nearestSlot(null, currentTime()))
      }
    })
    return () => {
      cancelled = true
    }
  }, [])

  // Changing day or time fires a new lookup before the previous one lands.
  // A reply is only accepted while the lookup that asked for it is still the
  // one running, otherwise the slower answer wins and the page reports
  // availability for a time nobody is asking about.
  const runAvailability = useCallback(() => {
    if (!day || !time) return
    const key = `${kind}|${day}|${time}`
    setResult({ status: 'loading', key })
    loadAvailability(kind, { day, at: time }).then((response) => {
      setResult((current) =>
        current.status === 'loading' && current.key === key ? { ...response, key } : current,
      )
    })
  }, [kind, day, time])

  useEffect(() => {
    runAvailability()
  }, [runAvailability])

  useEffect(() => {
    let cancelled = false
    setDirectory({ status: 'loading' })
    loadResources(kind).then((response) => {
      if (!cancelled) setDirectory(response)
    })
    return () => {
      cancelled = true
    }
  }, [kind])

  useEffect(() => {
    // Nothing picked: the week section is not rendered, so there is no stale
    // state to clear here.
    if (!selected) return undefined
    let cancelled = false
    setWeek({ status: 'loading' })
    loadResourceWeek(kind, selected).then((response) => {
      if (!cancelled) setWeek(response)
    })
    return () => {
      cancelled = true
    }
  }, [kind, selected])

  const options = useMemo(() => {
    const items = directory.status === 'ok' ? directory.data.items : []
    return items.map((item) => ({
      value: item.name,
      label: item.name,
      hint: `${item.class_count} ${item.class_count === 1 ? 'class' : 'classes'}`,
    }))
  }, [directory])

  const filteredFree = useMemo(() => {
    const list = result.status === 'ok' ? result.data.free : []
    const needle = query.trim().toUpperCase()
    if (!needle) return list
    return list.filter((item) => item.name.toUpperCase().includes(needle))
  }, [result, query])
  const filteredBusy = useMemo(() => {
    const list = result.status === 'ok' ? result.data.busy : []
    const needle = query.trim().toUpperCase()
    if (!needle) return list
    return list.filter((item) => item.name.toUpperCase().includes(needle))
  }, [result, query])

  const noun = KINDS.find((item) => item.id === kind)?.noun ?? 'room'
  const restricted = result.status === 'restricted' || directory.status === 'restricted'

  return (
    <div className="av-page">
      <header className="av-header">
        <div className="av-header-left">
          <Link to="/" className="av-back" aria-label="Back to home">←</Link>
          <div>
            <h1>Availability</h1>
            <p className="av-sub">
              What is running in a {noun}, and what is free right now
              {meta?.semester ? ` · ${meta.semester}` : ''}
            </p>
          </div>
        </div>
        <button type="button" className="av-theme" onClick={toggleTheme} aria-label="Toggle theme">
          {theme === 'dark' ? '☀' : '☾'}
        </button>
      </header>

      <div className="av-kinds" role="tablist" aria-label="Resource type">
        {KINDS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={kind === item.id}
            className={`av-kind ${kind === item.id ? 'is-active' : ''}`}
            onClick={() => setKind(item.id)}
          >
            {item.label}
            {item.id === 'room' && meta?.room_count ? <span className="av-count">{meta.room_count}</span> : null}
            {item.id === 'teacher' && meta?.teacher_count ? <span className="av-count">{meta.teacher_count}</span> : null}
          </button>
        ))}
      </div>

      {restricted ? (
        <div className="av-notice">
          <strong>Teacher schedules are restricted.</strong>
          <p>
            Teacher codes are hidden per batch on this site, so the teacher directory needs an
            admin sign-in. Ask an admin to set <code>TEACHER_SCHEDULE_ACCESS=public</code> to open
            it to everyone.
          </p>
        </div>
      ) : null}

      <section className="av-panel">
        <h2>Free right now</h2>
        <div className="av-controls">
          <label className="av-field">
            <span>Day</span>
            <select value={day} onChange={(event) => setDay(event.target.value)}>
              {(meta?.days?.length ? meta.days : DAYS).map((value) => (
                <option key={value} value={value}>{value}</option>
              ))}
            </select>
          </label>
          <label className="av-field">
            <span>Time</span>
            <select value={time} onChange={(event) => setTime(event.target.value)}>
              {slotOptions(meta?.slots).map((value) => (
                <option key={value} value={value}>{value}</option>
              ))}
            </select>
          </label>
          <label className="av-field av-field-grow">
            <span>Filter</span>
            <input
              type="search"
              value={query}
              placeholder={`Filter ${noun}s…`}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <button type="button" className="av-now" onClick={() => {
            setDay(currentDayName())
            setTime(nearestSlot(meta?.slots, currentTime()))
          }}>
            Now
          </button>
        </div>

        {result.status === 'loading' ? <p className="av-muted">Checking…</p> : null}
        {result.status === 'error' || result.status === 'no_backend' ? (
          <p className="av-error">{result.message}</p>
        ) : null}

        {result.status === 'ok' ? (
          <div className="av-split">
            <div className="av-col">
              <h3>
                Free <span className="av-badge av-badge-free">{filteredFree.length}</span>
              </h3>
              <ul className="av-chiplist">
                {filteredFree.map((item) => (
                  <li key={item.name}>
                    <button
                      type="button"
                      className="av-chip"
                      onClick={() => setSelected(item.name)}
                      title={
                        item.next_class
                          ? `Next: ${item.next_class.start_time} ${item.next_class.code || ''}`
                          : 'Free for the rest of the day'
                      }
                    >
                      {item.name}
                      {item.next_class ? (
                        <span className="av-until">till {item.next_class.start_time}</span>
                      ) : (
                        <span className="av-until av-until-all">all day</span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
              {filteredFree.length === 0 ? <p className="av-muted">Nothing free.</p> : null}
            </div>

            <div className="av-col">
              <h3>
                Busy <span className="av-badge av-badge-busy">{filteredBusy.length}</span>
              </h3>
              <ul className="av-busylist">
                {filteredBusy.map((item) => (
                  <li key={item.name}>
                    <button type="button" className="av-busy-name" onClick={() => setSelected(item.name)}>
                      {item.name}
                    </button>
                    <ul className="av-classlist">
                      {item.classes.map((entry, index) => (
                        <ClassLine key={`${entry.code}-${index}`} item={entry} />
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
              {filteredBusy.length === 0 ? <p className="av-muted">Nothing busy.</p> : null}
            </div>
          </div>
        ) : null}
      </section>

      <section className="av-panel">
        <h2>Browse a {noun}</h2>
        <Combobox
          value={selected}
          onChange={setSelected}
          options={options}
          placeholder={directory.status === 'loading' ? 'Loading…' : `Search ${noun}s…`}
          disabled={directory.status !== 'ok'}
          ariaLabel={`Select a ${noun}`}
          className="av-picker"
        />

        {week.status === 'loading' ? <p className="av-muted">Loading…</p> : null}
        {week.status === 'error' || week.status === 'not_found' ? (
          <p className="av-error">{week.message}</p>
        ) : null}

        {week.status === 'ok' ? (
          <div className="av-week">
            <p className="av-weekhead">
              <strong>{week.data.name}</strong>
              <span className="av-muted">
                {week.data.class_count} {week.data.class_count === 1 ? 'class' : 'classes'} a week
              </span>
            </p>
            {week.data.days.map((entry) => (
              <div key={entry.day} className="av-day">
                <h4>{entry.day}</h4>
                {entry.classes.length ? (
                  <ul className="av-classlist">
                    {entry.classes.map((item, index) => (
                      <ClassLine key={`${item.code}-${index}`} item={item} />
                    ))}
                  </ul>
                ) : (
                  <p className="av-muted av-free-day">Free all day</p>
                )}
              </div>
            ))}
          </div>
        ) : null}
      </section>
    </div>
  )
}
