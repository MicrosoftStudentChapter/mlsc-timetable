// Baselines — admin-curated expected per-type class counts per stream group
// (e.g. `E1A` = even-semester year 1 group A). The post-ingest doctor uses
// these to flag drifted batches.

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  listBaselines,
  setBaseline,
  deleteBaseline,
  AdminAuthError,
} from '../../lib/admin'
import { loadBatches } from '../../lib/batches'
import Combobox from '../../components/Combobox'
import './admin.css'

const DEFAULT_TYPES = ['Lecture', 'Tutorial', 'Practical']
const KEY_RE = /^([EO])(\d+)([A-Z]+)$/

function errMessage(err) {
  if (err instanceof AdminAuthError) return err.detail?.error || err.message
  return err?.message || 'Unknown error'
}

function decomposeKey(key) {
  const m = KEY_RE.exec(String(key || '').toUpperCase())
  if (!m) return null
  return { prefix: m[1], year: Number(m[2]), stream: m[3] }
}

export default function BaselinesPage() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [removing, setRemoving] = useState(null)

  const [years, setYears] = useState([])
  const [prefix, setPrefix] = useState('E')
  const [yearInput, setYearInput] = useState('')
  const [streamInput, setStreamInput] = useState('')

  const [counts, setCounts] = useState({ Lecture: '', Tutorial: '', Practical: '' })
  const [extraType, setExtraType] = useState('')

  const [filterParity, setFilterParity] = useState('all')
  const [filterYear, setFilterYear] = useState('all')
  const [filterStream, setFilterStream] = useState('all')
  const [filterQuery, setFilterQuery] = useState('')

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await listBaselines()
      setItems(Array.isArray(data) ? data : data?.items || [])
    } catch (err) {
      setError(err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { refresh() }, [refresh])

  useEffect(() => {
    let alive = true
    loadBatches()
      .then((y) => { if (alive) setYears(Array.isArray(y) ? y : []) })
      .catch(() => { if (alive) setYears([]) })
    return () => { alive = false }
  }, [])

  const selectedYearEntry = useMemo(
    () => years.find((y) => y.label === yearInput) || null,
    [years, yearInput],
  )

  const streams = selectedYearEntry?.streams ?? []

  const selectedStreamEntry = useMemo(
    () => streams.find((s) => s.name === streamInput) || null,
    [streams, streamInput],
  )

  const derivedKey = (prefix && selectedYearEntry && selectedStreamEntry)
    ? `${prefix}${selectedYearEntry.year}${selectedStreamEntry.code}`
    : ''

  useEffect(() => {
    if (!streamInput) return
    if (!streams.some((s) => s.name === streamInput)) setStreamInput('')
  }, [streams, streamInput])

  const yearOptions = useMemo(
    () => years.map((y) => ({ value: y.label })),
    [years],
  )

  const streamOptions = useMemo(
    () => streams.map((s) => ({ value: s.name, hint: s.code })),
    [streams],
  )

  const typeColumns = useMemo(() => {
    const set = new Set(DEFAULT_TYPES)
    items.forEach((row) => Object.keys(row.counts || {}).forEach((t) => set.add(t)))
    return Array.from(set)
  }, [items])

  const itemFacets = useMemo(() => {
    const ys = new Set()
    const ss = new Set()
    for (const row of items) {
      const p = decomposeKey(row.key)
      if (!p) continue
      ys.add(String(p.year))
      ss.add(p.stream)
    }
    return {
      years: Array.from(ys).sort((a, b) => Number(a) - Number(b)),
      streams: Array.from(ss).sort(),
    }
  }, [items])

  const filteredItems = useMemo(() => {
    const q = filterQuery.trim().toUpperCase()
    return items.filter((row) => {
      const p = decomposeKey(row.key)
      if (filterParity !== 'all') {
        if (!p || p.prefix !== filterParity) return false
      }
      if (filterYear !== 'all') {
        if (!p || String(p.year) !== filterYear) return false
      }
      if (filterStream !== 'all') {
        if (!p || p.stream !== filterStream) return false
      }
      if (q && !String(row.key).toUpperCase().includes(q)) return false
      return true
    })
  }, [items, filterParity, filterYear, filterStream, filterQuery])

  const hasActiveFilters =
    filterParity !== 'all' || filterYear !== 'all' || filterStream !== 'all' || filterQuery.trim() !== ''

  function clearFilters() {
    setFilterParity('all')
    setFilterYear('all')
    setFilterStream('all')
    setFilterQuery('')
  }

  function addCountField() {
    const name = extraType.trim()
    if (!name || counts[name] !== undefined) return
    setCounts((prev) => ({ ...prev, [name]: '' }))
    setExtraType('')
  }

  function loadIntoForm(row) {
    const parts = decomposeKey(row.key)
    if (parts) {
      setPrefix(parts.prefix)
      const ye = years.find((y) => Number(y.year) === parts.year)
      setYearInput(ye?.label || '')
      const se = ye?.streams.find((s) => s.code === parts.stream)
      setStreamInput(se?.name || '')
    }
    const next = { Lecture: '', Tutorial: '', Practical: '' }
    Object.entries(row.counts || {}).forEach(([k, v]) => {
      next[k] = String(v)
    })
    setCounts(next)
    setError(null)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function onSubmit(evt) {
    evt.preventDefault()
    if (!derivedKey || submitting) return
    const cleaned = {}
    for (const [k, v] of Object.entries(counts)) {
      if (v === '' || v == null) continue
      const n = Number(v)
      if (!Number.isInteger(n) || n < 0) {
        setError(new Error(`'${k}' must be a non-negative integer`))
        return
      }
      cleaned[k] = n
    }
    if (Object.keys(cleaned).length === 0) {
      setError(new Error('Provide at least one type count.'))
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      await setBaseline(derivedKey, cleaned)
      setStreamInput('')
      setCounts({ Lecture: '', Tutorial: '', Practical: '' })
      await refresh()
    } catch (err) {
      setError(err)
    } finally {
      setSubmitting(false)
    }
  }

  async function onRemove(key) {
    if (!window.confirm(`Delete baseline ${key}?`)) return
    setRemoving(key)
    try {
      await deleteBaseline(key)
      await refresh()
    } catch (err) {
      setError(err)
    } finally {
      setRemoving(null)
    }
  }

  return (
    <>
      <div className="admin-card" style={{ marginBottom: 16 }}>
        <h2 className="admin-card-title" style={{ textAlign: 'left' }}>Upsert baseline</h2>
        <form className="upload-form" onSubmit={onSubmit} style={{ marginTop: 12 }}>
          <div className="baseline-semester-row">
            <label>Semester</label>
            <div className="seg-switch" role="group" aria-label="Semester parity">
              <button
                type="button"
                className={`seg-switch-opt${prefix === 'E' ? ' active' : ''}`}
                onClick={() => setPrefix('E')}
                aria-pressed={prefix === 'E'}
              >
                Even
              </button>
              <button
                type="button"
                className={`seg-switch-opt${prefix === 'O' ? ' active' : ''}`}
                onClick={() => setPrefix('O')}
                aria-pressed={prefix === 'O'}
              >
                Odd
              </button>
            </div>
          </div>

          <div className="baseline-field">
            <label htmlFor="baseline-year">Year</label>
            <Combobox
              className="upload-input"
              value={yearInput}
              onChange={setYearInput}
              options={yearOptions}
              placeholder="Select year…"
              ariaLabel="Year"
            />
          </div>

          <div className="baseline-field">
            <label htmlFor="baseline-stream">Stream</label>
            <Combobox
              className="upload-input"
              value={streamInput}
              onChange={setStreamInput}
              options={streamOptions}
              placeholder={selectedYearEntry ? 'Select stream…' : 'Pick a year first'}
              ariaLabel="Stream"
              disabled={!selectedYearEntry || streams.length === 0}
            />
          </div>

          <div className="baseline-key-preview">
            <span>Derived key</span>
            <code>{derivedKey || '—'}</code>
          </div>

          <div className="baseline-counts-row">
            {Object.entries(counts).map(([type, val]) => (
              <div key={type} className="baseline-count-field">
                <label htmlFor={`baseline-${type}`}>{type}</label>
                <input
                  id={`baseline-${type}`}
                  type="number"
                  min="0"
                  step="1"
                  className="upload-input"
                  placeholder="0"
                  value={val}
                  onChange={(e) => setCounts((prev) => ({ ...prev, [type]: e.target.value }))}
                />
              </div>
            ))}
          </div>
          <div>
            <label htmlFor="baseline-extra">Add another type</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                id="baseline-extra"
                type="text"
                className="upload-input"
                placeholder="e.g. Project"
                value={extraType}
                onChange={(e) => setExtraType(e.target.value)}
                style={{ flex: 1 }}
              />
              <button
                type="button"
                className="admin-card-action"
                onClick={addCountField}
                disabled={!extraType.trim()}
              >
                Add field
              </button>
            </div>
          </div>
          <button type="submit" className="upload-btn" disabled={submitting || !derivedKey}>
            {submitting ? 'Saving…' : derivedKey ? `Save baseline ${derivedKey}` : 'Save baseline'}
          </button>
        </form>
      </div>

      <div className="admin-card">
        <div className="admin-card-header" style={{ alignItems: 'center' }}>
          <h2 className="admin-card-title" style={{ textAlign: 'left' }}>Baselines</h2>
          <button
            type="button"
            className="admin-card-action"
            onClick={refresh}
            disabled={loading}
          >
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>

        {error && (
          <div className="upload-result failed" style={{ marginBottom: 12 }}>
            {errMessage(error)}
          </div>
        )}

        {loading && <div className="admin-loading">Loading…</div>}
        {!loading && items.length === 0 && (
          <div className="error-log-empty">No baselines configured yet.</div>
        )}
        {!loading && items.length > 0 && (
          <>
            <div className="baseline-filter-bar">
              <div className="seg-switch" role="group" aria-label="Filter by parity">
                {[
                  { v: 'all', label: 'All' },
                  { v: 'E', label: 'Even' },
                  { v: 'O', label: 'Odd' },
                ].map((o) => (
                  <button
                    key={o.v}
                    type="button"
                    className={`seg-switch-opt${filterParity === o.v ? ' active' : ''}`}
                    onClick={() => setFilterParity(o.v)}
                    aria-pressed={filterParity === o.v}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
              <select
                className="upload-input baseline-filter-select"
                value={filterYear}
                onChange={(e) => setFilterYear(e.target.value)}
                aria-label="Filter by year"
              >
                <option value="all">All years</option>
                {itemFacets.years.map((y) => (
                  <option key={y} value={y}>Year {y}</option>
                ))}
              </select>
              <select
                className="upload-input baseline-filter-select"
                value={filterStream}
                onChange={(e) => setFilterStream(e.target.value)}
                aria-label="Filter by stream"
              >
                <option value="all">All streams</option>
                {itemFacets.streams.map((s) => (
                  <option key={s} value={s}>Stream {s}</option>
                ))}
              </select>
              <input
                type="search"
                className="upload-input baseline-filter-search"
                placeholder="Search key…"
                value={filterQuery}
                onChange={(e) => setFilterQuery(e.target.value)}
                aria-label="Search baselines"
              />
              {hasActiveFilters && (
                <button type="button" className="admin-card-action" onClick={clearFilters}>
                  Clear
                </button>
              )}
            </div>
            {filteredItems.length === 0 ? (
              <div className="error-log-empty">No baselines match the current filters.</div>
            ) : (
              <table className="uploads-table">
                <thead>
                  <tr>
                    <th>Key</th>
                    {typeColumns.map((t) => <th key={t}>{t}</th>)}
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredItems.map((row) => (
                    <tr key={row.key}>
                      <td style={{ fontFamily: 'var(--mono, monospace)' }}>{row.key}</td>
                      {typeColumns.map((t) => (
                        <td key={t}>{row.counts?.[t] ?? '—'}</td>
                      ))}
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <button
                          type="button"
                          className="admin-card-action"
                          onClick={() => loadIntoForm(row)}
                          style={{ marginRight: 8 }}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="admin-card-action"
                          onClick={() => onRemove(row.key)}
                          disabled={removing === row.key}
                          style={{ color: '#f87171' }}
                        >
                          {removing === row.key ? 'Removing…' : 'Remove'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        )}
      </div>
    </>
  )
}
