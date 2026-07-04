// Baselines — admin-curated expected per-type class counts per stream group
// (e.g. `E1A` = even-semester year 1 group A). The post-ingest doctor uses
// these to flag drifted batches.

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import {
  listBaselines,
  setBaseline,
  deleteBaseline,
  previewScheme,
  applyScheme,
  AdminAuthError,
} from '../../lib/admin'
import { loadBatches } from '../../lib/batches'
import Combobox from '../../components/Combobox'
import batchesFallback from '../../data/batches.json'
import './admin.css'

const DEFAULT_TYPES = ['Lecture', 'Tutorial', 'Practical']
const KEY_RE = /^([EO])(\d+)([A-Z]+)$/
// Branches whose year-1 curriculum does NOT follow the pool A/B rotation.
const POOL_EXEMPT_BRANCHES = new Set(['X', 'G', 'J', 'R'])

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

  // ── Course scheme (PDF) uploader ─────────────────────────────────────
  const [schemeFile, setSchemeFile] = useState(null)
  const [schemeBranch, setSchemeBranch] = useState('')
  const [schemePoolSwap, setSchemePoolSwap] = useState(false)
  const [schemeMerge, setSchemeMerge] = useState(false)
  const [schemeBusy, setSchemeBusy] = useState(false)
  const [schemeDragging, setSchemeDragging] = useState(false)
  const [schemePreview, setSchemePreview] = useState(null)
  const [schemeError, setSchemeError] = useState(null)
  const [schemeResult, setSchemeResult] = useState(null)

  // Branch dropdown = the canonical (year 2+) stream list from batches.json.
  // Pool A/B is a first-year rotation label, not a branch, so it does NOT
  // appear here; the "Pool B rotation" checkbox below handles that case.
  const branchOptions = useMemo(() => {
    const names = batchesFallback?.streamNames?.default || {}
    return Object.entries(names)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([code, name]) => ({ code, name }))
  }, [])

  const showPoolSwap = schemeBranch && !POOL_EXEMPT_BRANCHES.has(schemeBranch)

  function resetSchemeState() {
    setSchemeFile(null)
    setSchemeBranch('')
    setSchemePoolSwap(false)
    setSchemeMerge(false)
    setSchemePreview(null)
    setSchemeError(null)
    setSchemeResult(null)
  }

  async function onSchemePreview(evt) {
    evt.preventDefault()
    if (!schemeFile || !schemeBranch || schemeBusy) return
    setSchemeBusy(true)
    setSchemeError(null)
    setSchemeResult(null)
    try {
      const data = await previewScheme({
        file: schemeFile,
        branch: schemeBranch,
        poolSwapYear1: schemePoolSwap,
      })
      setSchemePreview(data)
    } catch (err) {
      setSchemeError(err)
    } finally {
      setSchemeBusy(false)
    }
  }

  async function onSchemeApply() {
    if (!schemeFile || !schemeBranch || schemeBusy) return
    if (!window.confirm(
      `Write ${schemePreview?.plan?.length ?? 0} baseline roster(s) for branch ${schemeBranch}?`
    )) return
    setSchemeBusy(true)
    setSchemeError(null)
    try {
      const data = await applyScheme({
        file: schemeFile,
        branch: schemeBranch,
        poolSwapYear1: schemePoolSwap,
        merge: schemeMerge,
      })
      setSchemeResult(data)
      setSchemePreview(null)
      await refresh()
    } catch (err) {
      setSchemeError(err)
    } finally {
      setSchemeBusy(false)
    }
  }

  // ── Baselines table state ────────────────────────────────────────────
  const [expandedKey, setExpandedKey] = useState(null)

  function toggleExpanded(key) {
    setExpandedKey((k) => (k === key ? null : key))
  }

  return (
    <>
      <div className="admin-card" style={{ marginBottom: 16 }}>
        <div className="admin-card-header" style={{ alignItems: 'center' }}>
          <h2 className="admin-card-title" style={{ textAlign: 'left' }}>Course scheme (PDF)</h2>
          {(schemePreview || schemeResult) && (
            <button type="button" className="admin-card-action" onClick={resetSchemeState}>
              Start over
            </button>
          )}
        </div>
        <p style={{ margin: '4px 0 12px', color: 'var(--muted, #9aa3af)', fontSize: 13 }}>
          Upload a SUGC/SPGC course-scheme PDF to attach the expected course roster
          (per subject code) to every baseline for the chosen branch. Existing per-type
          counts on those baselines are preserved.
        </p>
        <form className="upload-form" onSubmit={onSchemePreview} style={{ marginTop: 4 }}>
          <label
            className={`dropzone${schemeDragging ? ' is-active' : ''}`}
            onDragOver={(e) => { e.preventDefault(); setSchemeDragging(true) }}
            onDragLeave={() => setSchemeDragging(false)}
            onDrop={(e) => {
              e.preventDefault()
              setSchemeDragging(false)
              const f = e.dataTransfer?.files?.[0]
              if (f && f.name.toLowerCase().endsWith('.pdf')) {
                setSchemeFile(f)
                setSchemePreview(null)
                setSchemeResult(null)
              }
            }}
          >
            <input
              type="file"
              accept="application/pdf,.pdf"
              style={{ display: 'none' }}
              onChange={(e) => {
                setSchemeFile(e.target.files?.[0] || null)
                setSchemePreview(null)
                setSchemeResult(null)
              }}
            />
            {schemeFile ? (
              <span className="dropzone-filename">{schemeFile.name}</span>
            ) : (
              <>
                Drop the course-scheme <code>.pdf</code> here,
                <br />or click to browse
              </>
            )}
          </label>

          <div className="baseline-field">
            <label htmlFor="scheme-branch">Branch</label>
            <select
              id="scheme-branch"
              className="upload-input"
              value={schemeBranch}
              onChange={(e) => {
                setSchemeBranch(e.target.value)
                setSchemePreview(null)
                setSchemeResult(null)
              }}
            >
              <option value="">Select branch…</option>
              {branchOptions.map((b) => (
                <option key={b.code} value={b.code}>
                  {b.code} — {b.name}
                </option>
              ))}
            </select>
          </div>
          {showPoolSwap && (
            <label
              style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}
              title="Tick when this scheme belongs to a Pool B stream — flips the parity of year-1 semesters (Sem 1 → E1, Sem 2 → O1)."
            >
              <input
                type="checkbox"
                checked={schemePoolSwap}
                onChange={(e) => {
                  setSchemePoolSwap(e.target.checked)
                  setSchemePreview(null)
                  setSchemeResult(null)
                }}
              />
              Pool B rotation (swap year-1 parity)
            </label>
          )}
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
            <input
              type="checkbox"
              checked={schemeMerge}
              onChange={(e) => setSchemeMerge(e.target.checked)}
            />
            Merge with existing courses (keep any codes already on the baseline)
          </label>
          <button
            type="submit"
            className="upload-btn"
            disabled={!schemeFile || !schemeBranch || schemeBusy}
          >
            {schemeBusy ? 'Working…' : 'Preview'}
          </button>
        </form>

        {schemeError && (
          <div className="upload-result failed" style={{ marginTop: 12 }}>
            {errMessage(schemeError)}
          </div>
        )}

        {schemePreview && (
          <div style={{ marginTop: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <div style={{ fontSize: 13, color: 'var(--muted, #9aa3af)' }}>
                Detected <strong>{schemePreview.semester_count}</strong> semester(s)
                from <code>{schemePreview.source}</code>. Review the plan below, then
                confirm to write the rosters.
              </div>
              <button
                type="button"
                className="upload-btn"
                onClick={onSchemeApply}
                disabled={schemeBusy}
              >
                {schemeBusy ? 'Applying…' : `Apply to ${schemePreview.plan.length} baseline(s)`}
              </button>
            </div>
            <table className="uploads-table" style={{ marginTop: 12 }}>
              <thead>
                <tr>
                  <th>Sem</th>
                  <th>Keyline → Baseline</th>
                  <th>Courses</th>
                  <th>Existing</th>
                  <th>Preview</th>
                </tr>
              </thead>
              <tbody>
                {schemePreview.plan.map((row) => (
                  <tr key={row.baseline_key}>
                    <td>{row.semester}</td>
                    <td style={{ fontFamily: 'var(--mono, monospace)' }}>
                      {row.keyline} → {row.baseline_key}
                    </td>
                    <td>{row.course_count}</td>
                    <td>
                      {row.would_create ? (
                        <span style={{ color: '#4ade80' }}>new</span>
                      ) : (
                        <span title="Existing baseline; roster will be replaced (or merged)">
                          {row.existing_course_count} → {row.course_count}
                        </span>
                      )}
                    </td>
                    <td style={{ maxWidth: 320 }}>
                      <span style={{ fontSize: 12, color: 'var(--muted, #9aa3af)' }}>
                        {row.courses.slice(0, 4).map((c) => c.code || c.title || '?').join(', ')}
                        {row.courses.length > 4 ? `, +${row.courses.length - 4} more` : ''}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {schemeResult && (
          <div className="upload-result" style={{ marginTop: 12 }}>
            Applied to {schemeResult.written.length} baseline(s)
            {schemeResult.errors.length > 0 ? ` — ${schemeResult.errors.length} error(s)` : ''}.
            {schemeResult.written.length > 0 && (
              <div style={{ marginTop: 6, fontSize: 12, color: 'var(--muted, #9aa3af)' }}>
                {schemeResult.written.map((w) => (
                  <span key={w.baseline_key} style={{ marginRight: 12 }}>
                    <code>{w.baseline_key}</code> ({w.course_count} courses{w.created ? ', created' : ''})
                  </span>
                ))}
              </div>
            )}
            {schemeResult.errors.length > 0 && (
              <div style={{ marginTop: 6, fontSize: 12, color: '#f87171' }}>
                {schemeResult.errors.map((e, i) => (
                  <div key={i}><code>{e.baseline_key}</code>: {e.error}</div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

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
                    <th title="Number of expected course codes attached to this baseline">Courses</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredItems.map((row) => {
                    const courses = Array.isArray(row.courses) ? row.courses : []
                    const isExpanded = expandedKey === row.key
                    const courseColSpan = 2 + typeColumns.length + 2
                    return (
                      <Fragment key={row.key}>
                        <tr>
                          <td style={{ fontFamily: 'var(--mono, monospace)' }}>{row.key}</td>
                          {typeColumns.map((t) => (
                            <td key={t}>{row.counts?.[t] ?? '—'}</td>
                          ))}
                          <td>
                            {courses.length > 0 ? (
                              <button
                                type="button"
                                className="admin-card-action"
                                onClick={() => toggleExpanded(row.key)}
                                title={row.scheme_source ? `From ${row.scheme_source}` : ''}
                              >
                                {courses.length} {isExpanded ? '▾' : '▸'}
                              </button>
                            ) : (
                              <span style={{ color: 'var(--muted, #9aa3af)' }}>—</span>
                            )}
                          </td>
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
                        {isExpanded && (
                          <tr key={`${row.key}-courses`}>
                            <td colSpan={courseColSpan} style={{ background: 'rgba(255,255,255,0.02)' }}>
                              <div style={{ fontSize: 12, color: 'var(--muted, #9aa3af)', marginBottom: 6 }}>
                                {row.scheme_source ? `Source: ${row.scheme_source}` : 'Manual roster'}
                              </div>
                              <table className="uploads-table" style={{ margin: 0 }}>
                                <thead>
                                  <tr>
                                    <th>Code</th>
                                    <th>Title</th>
                                    <th>Cat</th>
                                    <th>L</th>
                                    <th>T</th>
                                    <th>P</th>
                                    <th>Cr</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {courses.map((c, i) => (
                                    <tr key={`${c.code || 'x'}-${i}`}>
                                      <td style={{ fontFamily: 'var(--mono, monospace)' }}>{c.code || '—'}</td>
                                      <td>{c.title || ''}</td>
                                      <td>{c.category || ''}</td>
                                      <td>{c.L ?? ''}</td>
                                      <td>{c.T ?? ''}</td>
                                      <td>{c.P ?? ''}</td>
                                      <td>{c.Cr ?? ''}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    )
                  })}
                </tbody>
              </table>
            )}
          </>
        )}
      </div>
    </>
  )
}
