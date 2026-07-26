import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { loadBatches } from '../../lib/batches'
import './admin.css'

export default function TimetablesPage() {
  const [years, setYears] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let alive = true
    loadBatches()
      .then((value) => { if (alive) setYears(value) })
      .catch((err) => { if (alive) setError(err) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [])

  return (
    <div className="admin-page timetable-browser">
      <div className="admin-page-header">
        <div>
          <h1 className="admin-page-title">Timetables</h1>
          <p className="admin-page-sub">Browse any published batch and edit its timetable directly.</p>
        </div>
      </div>
      {error && <div className="fix-error" role="alert">{String(error.message || error)}</div>}
      {loading && <div className="admin-card">Loading batches…</div>}
      {!loading && !error && years.map((year) => (
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
