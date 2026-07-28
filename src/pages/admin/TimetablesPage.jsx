import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { loadBatches } from '../../lib/batches'
import './admin.css'

export default function TimetablesPage() {
  const [years, setYears] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [query, setQuery] = useState('')
  const [yearFilter, setYearFilter] = useState('all')
  const [streamFilter, setStreamFilter] = useState('all')

  useEffect(() => {
    let alive = true
    loadBatches()
      .then((value) => { if (alive) setYears(value) })
      .catch((err) => { if (alive) setError(err) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [])

  const streamOptions = useMemo(() => (
    [...new Set(years.flatMap((year) => year.streams.map((stream) => stream.name)))].sort()
  ), [years])

  const filteredYears = useMemo(() => {
    const needle = query.trim().toUpperCase()
    return years
      .filter((year) => yearFilter === 'all' || String(year.year) === yearFilter)
      .map((year) => ({
        ...year,
        streams: year.streams
          .filter((stream) => streamFilter === 'all' || stream.name === streamFilter)
          .map((stream) => ({
            ...stream,
            batches: stream.batches.filter((batch) => (
              !needle
              || batch.toUpperCase().includes(needle)
              || stream.name.toUpperCase().includes(needle)
            )),
          }))
          .filter((stream) => stream.batches.length > 0),
      }))
      .filter((year) => year.streams.length > 0)
  }, [years, query, yearFilter, streamFilter])

  const shownCount = useMemo(() => (
    filteredYears.reduce((total, year) => total + year.streams.reduce((count, stream) => count + stream.batches.length, 0), 0)
  ), [filteredYears])

  return (
    <div className="admin-page timetable-browser">
      <div className="admin-page-header">
        <div>
          <h1 className="admin-page-title">Timetables</h1>
          <p className="admin-page-sub">Browse any published batch and edit its timetable directly.</p>
        </div>
      </div>
      <section className="admin-card batch-browser-controls">
        <label className="batch-browser-search">
          <span>Find a batch</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search batch or stream, e.g. 3C65"
          />
        </label>
        <label className="batch-browser-filter">
          <span>Year</span>
          <select value={yearFilter} onChange={(event) => setYearFilter(event.target.value)}>
            <option value="all">All years</option>
            {years.map((year) => <option key={year.year} value={String(year.year)}>{year.label}</option>)}
          </select>
        </label>
        <label className="batch-browser-filter">
          <span>Stream</span>
          <select value={streamFilter} onChange={(event) => setStreamFilter(event.target.value)}>
            <option value="all">All streams</option>
            {streamOptions.map((stream) => <option key={stream} value={stream}>{stream}</option>)}
          </select>
        </label>
        <button
          className="batch-browser-clear"
          type="button"
          disabled={!query && yearFilter === 'all' && streamFilter === 'all'}
          onClick={() => { setQuery(''); setYearFilter('all'); setStreamFilter('all') }}
        >
          Clear filters
        </button>
        <span className="batch-browser-count" aria-live="polite">{shownCount} shown</span>
      </section>
      {error && <div className="fix-error" role="alert">{String(error.message || error)}</div>}
      {loading && <div className="admin-card">Loading batches…</div>}
      {!loading && !error && !filteredYears.length && <div className="admin-card timetable-browser-empty">No batches match these filters.</div>}
      {!loading && !error && filteredYears.map((year) => (
        <section className="admin-card timetable-year" key={year.year}>
          <div className="admin-card-header">
            <div>
              <h2 className="admin-card-title">{year.label}</h2>
              <p className="admin-card-sub">{year.streams.reduce((n, stream) => n + stream.batches.length, 0)} batches</p>
            </div>
          </div>
          <div className="timetable-browser-grid">
            {year.streams.flatMap((stream) => stream.batches.map((batch) => (
              <Link
                key={batch}
                to={`/admin/timetables/${encodeURIComponent(batch)}`}
                className="timetable-browser-item"
              >
                <code>{batch}</code>
                <span>{stream.name}</span>
                <strong>Edit →</strong>
              </Link>
            )))}
          </div>
        </section>
      ))}
    </div>
  )
}
