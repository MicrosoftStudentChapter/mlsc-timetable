import { useEffect, useMemo, useState } from 'react'
import { getTeacherVisibility, updateTeacherVisibility } from '../../lib/admin'
import './admin.css'

function setEquals(left, right) {
  if (left.size !== right.size) return false
  for (const value of left) if (!right.has(value)) return false
  return true
}

export default function TeacherVisibilityPage() {
  const [items, setItems] = useState([])
  const [selected, setSelected] = useState(new Set())
  const [saved, setSaved] = useState(new Set())
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState('')

  useEffect(() => {
    let alive = true
    getTeacherVisibility()
      .then((data) => {
        if (!alive) return
        const rows = Array.isArray(data?.items) ? data.items : []
        const enabled = new Set(rows.filter((row) => row.enabled).map((row) => row.batch))
        setItems(rows)
        setSelected(enabled)
        setSaved(new Set(enabled))
      })
      .catch((err) => { if (alive) setError(err) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [])

  const filtered = useMemo(() => {
    const needle = query.trim().toUpperCase()
    return needle ? items.filter((row) => row.batch.includes(needle)) : items
  }, [items, query])

  const groups = useMemo(() => {
    const byYear = new Map()
    for (const row of filtered) {
      const year = row.year || Number.parseInt(row.batch?.[0], 10) || 0
      if (!byYear.has(year)) byYear.set(year, [])
      byYear.get(year).push(row)
    }
    return [...byYear.entries()].sort(([a], [b]) => a - b)
  }, [filtered])

  const dirty = !setEquals(selected, saved)

  function toggle(batch) {
    setNotice('')
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(batch)) next.delete(batch)
      else next.add(batch)
      return next
    })
  }

  function setVisibleRows(enabled) {
    setNotice('')
    setSelected((current) => {
      const next = new Set(current)
      for (const row of filtered) {
        if (enabled) next.add(row.batch)
        else next.delete(row.batch)
      }
      return next
    })
  }

  async function save() {
    setSaving(true)
    setError(null)
    setNotice('')
    try {
      const batches = [...selected].sort()
      const result = await updateTeacherVisibility(batches)
      const enabled = new Set(result?.enabled_batches || batches)
      setSelected(enabled)
      setSaved(new Set(enabled))
      setNotice(`Saved. Teacher codes are visible for ${enabled.size} batch${enabled.size === 1 ? '' : 'es'}.`)
    } catch (err) {
      setError(err)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="admin-page teacher-visibility-page">
      <div className="admin-page-header teacher-visibility-header">
        <div>
          <h1 className="admin-page-title">Teacher code visibility</h1>
          <p className="admin-page-sub">
            Teacher codes are stored for every parsed class, but are only sent to students for the batches enabled here.
          </p>
        </div>
        <div className="teacher-visibility-summary" aria-live="polite">
          <strong>{selected.size}</strong>
          <span>of {items.length} enabled</span>
        </div>
      </div>

      <section className="admin-card teacher-visibility-controls">
        <label className="teacher-visibility-search">
          <span>Find a batch</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="e.g. 3C65"
            aria-label="Search batch codes"
          />
        </label>
        <div className="teacher-visibility-actions">
          <button type="button" onClick={() => setVisibleRows(true)} disabled={!filtered.length || loading || saving}>
            Enable shown
          </button>
          <button type="button" onClick={() => setVisibleRows(false)} disabled={!filtered.length || loading || saving}>
            Disable shown
          </button>
          <button className="teacher-visibility-save" type="button" onClick={save} disabled={!dirty || loading || saving}>
            {saving ? 'Saving…' : dirty ? 'Save visibility' : 'Saved'}
          </button>
        </div>
      </section>

      {error && <div className="fix-error" role="alert">{String(error.message || error)}</div>}
      {notice && <div className="teacher-visibility-notice" role="status">{notice}</div>}
      {loading && <div className="admin-card">Loading batches…</div>}
      {!loading && !filtered.length && <div className="admin-card teacher-visibility-empty">No matching batches.</div>}

      {!loading && groups.map(([year, rows]) => (
        <section className="admin-card teacher-visibility-group" key={year}>
          <div className="teacher-visibility-group-heading">
            <div>
              <h2>{year ? `Year ${year}` : 'Other batches'}</h2>
              <p>{rows.filter((row) => selected.has(row.batch)).length} of {rows.length} enabled</p>
            </div>
          </div>
          <div className="teacher-visibility-grid">
            {rows.map((row) => {
              const enabled = selected.has(row.batch)
              return (
                <label className={`teacher-batch-toggle${enabled ? ' is-enabled' : ''}`} key={row.batch}>
                  <input type="checkbox" checked={enabled} onChange={() => toggle(row.batch)} />
                  <span className="teacher-batch-code">{row.batch}</span>
                  <span className="teacher-batch-state">{enabled ? 'Visible' : 'Hidden'}</span>
                  <span className="teacher-batch-switch" aria-hidden="true"><i /></span>
                </label>
              )
            })}
          </div>
        </section>
      ))}
    </div>
  )
}
