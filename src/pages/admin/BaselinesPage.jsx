// Baselines — admin-curated expected per-type class counts per stream group
// (e.g. `E1A` = even-semester year 1 group A). The post-ingest doctor uses
// these to flag drifted batches.

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import {
  listBaselines,
  setBaseline,
  deleteBaseline,
  checkBaseline,
  syncBaselineCounts,
  getCurrent,
  previewScheme,
  applyScheme,
  applySchemePlan,
  addSubject,
  bulkSubjects,
  AdminAuthError,
} from '../../lib/admin'
import BaselineCheckDialog from '../../components/BaselineCheckDialog'
import BaselineEditDialog from '../../components/BaselineEditDialog'
import { loadBatches } from '../../lib/batches'
import Combobox from '../../components/Combobox'
import SchemePreviewDialog from '../../components/SchemePreviewDialog'
import batchesFallback from '../../data/batches.json'
import './admin.css'

const DEFAULT_TYPES = ['Lecture', 'Tutorial', 'Practical']
const KEY_RE = /^([EO])(\d+)([A-Z]+)$/

// Course rows in the baseline carry per-week contact hours (L / T / P).
// When the admin hasn't set explicit per-type counts on the baseline yet
// (e.g. a fresh scheme upload only wrote courses), derive Lecture /
// Tutorial / Practical totals from the course list so the table isn't
// full of dashes. Values are treated as numbers; blanks/non-numeric fall
// through as 0.
function numeric(value) {
  if (value == null) return 0
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  const s = String(value).trim()
  if (!s) return 0
  const n = parseFloat(s)
  return Number.isFinite(n) ? n : 0
}

function countsFromCourses(courses) {
  const out = { Lecture: 0, Tutorial: 0, Practical: 0 }
  if (!Array.isArray(courses)) return out
  for (const c of courses) {
    out.Lecture += numeric(c?.L)
    out.Tutorial += numeric(c?.T)
    out.Practical += numeric(c?.P)
  }
  return out
}

function errMessage(err) {
  if (err instanceof AdminAuthError) return err.detail?.error || err.message
  return err?.message || 'Unknown error'
}

function decomposeKey(key) {
  const m = KEY_RE.exec(String(key || '').toUpperCase())
  if (!m) return null
  return { prefix: m[1], year: Number(m[2]), stream: m[3] }
}

function paginationItems(page, pageCount) {
  if (pageCount <= 7) return Array.from({ length: pageCount }, (_, index) => index + 1)
  const items = [1]
  if (page > 4) items.push('ellipsis-left')
  const start = Math.max(2, page - 1)
  const end = Math.min(pageCount - 1, page + 1)
  for (let value = start; value <= end; value += 1) items.push(value)
  if (page < pageCount - 3) items.push('ellipsis-right')
  items.push(pageCount)
  return items
}


export default function BaselinesPage() {
  const [items, setItems] = useState([])
  const [totalItems, setTotalItems] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const pageCount = Math.max(1, Math.ceil(totalItems / 25))
  const firstResult = totalItems === 0 ? 0 : (page - 1) * 25 + 1
  const lastResult = Math.min(page * 25, totalItems)
  const [error, setError] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [removing, setRemoving] = useState(null)
  const [checkingKey, setCheckingKey] = useState(null) // key currently being checked
  const [checkResult, setCheckResult] = useState(null)  // full response for the dialog
  const [editingRow, setEditingRow] = useState(null)    // baseline row open in the edit dialog
  const [editBusy, setEditBusy] = useState(false)
  const [syncBusy, setSyncBusy] = useState(false)
  const [syncResult, setSyncResult] = useState(null)    // { updated, skipped } | null
  const [currentPrefix, setCurrentPrefix] = useState(null) // 'E' | 'O' | null

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
      const data = await listBaselines({
        q: filterQuery.trim() || undefined,
        parity: filterParity !== 'all' ? filterParity : undefined,
        year: filterYear !== 'all' ? filterYear : undefined,
        stream: filterStream !== 'all' ? filterStream : undefined,
        limit: 25,
        offset: (page - 1) * 25,
      })
      setItems(data?.items || [])
      setTotalItems(data?.count || 0)
    } catch (err) {
      setError(err)
    } finally {
      setLoading(false)
    }
  }, [filterQuery, filterParity, filterYear, filterStream, page])

  useEffect(() => { setPage(1) }, [filterQuery, filterParity, filterYear, filterStream])

  useEffect(() => {
    const timer = setTimeout(refresh, 180)
    return () => clearTimeout(timer)
  }, [refresh])

  useEffect(() => {
    let alive = true
    loadBatches()
      .then((y) => { if (alive) setYears(Array.isArray(y) ? y : []) })
      .catch(() => { if (alive) setYears([]) })
    getCurrent()
      .then((d) => {
        if (!alive) return
        const label = (d?.label || '').trim().toUpperCase()
        if (label.startsWith('E')) setCurrentPrefix('E')
        else if (label.startsWith('O')) setCurrentPrefix('O')
      })
      .catch(() => {})
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
    years.forEach((y) => {
      ys.add(String(y.year))
      y.streams.forEach((s) => {
        ss.add(s.code)
      })
    })
    // Fallback if years config isn't fully loaded yet
    if (ys.size === 0) {
      ys.add('1'); ys.add('2'); ys.add('3'); ys.add('4')
    }
    if (ss.size === 0) {
      ['CS', 'ME', 'EE', 'ECE', 'A', 'B'].forEach((s) => ss.add(s))
    }
    return {
      years: Array.from(ys).sort((a, b) => Number(a) - Number(b)),
      streams: Array.from(ss).sort(),
    }
  }, [years])

  const filteredItems = useMemo(() => {
    // Sort by branch/pool letter first, then by student-facing semester
    // (odd → sem 1, even → sem 2 within a year). Pool A / Pool B thus
    // render as O1A / E1A then O1B / E1B — matching the scheme review
    // dialog's tab order.
    return [...items].sort((a, b) => {
      const pa = decomposeKey(a.key)
      const pb = decomposeKey(b.key)
      if (!pa || !pb) return String(a.key).localeCompare(String(b.key))
      if (pa.stream !== pb.stream) return pa.stream.localeCompare(pb.stream)
      const semA = 2 * pa.year - (pa.prefix === 'O' ? 1 : 0)
      const semB = 2 * pb.year - (pb.prefix === 'O' ? 1 : 0)
      return semA - semB
    })
  }, [items])

  const hasActiveFilters =
    filterParity !== 'all' || filterYear !== 'all' || filterStream !== 'all' || filterQuery.trim() !== ''

  function clearFilters() {
    setFilterParity('all')
    setFilterYear('all')
    setFilterStream('all')
    setFilterQuery('')
    setPage(1)
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

  async function onSyncCounts() {
    setSyncBusy(true)
    setSyncResult(null)
    try {
      const res = await syncBaselineCounts()
      setSyncResult({ updated: res.updated, skipped: res.skipped })
      if (res.updated > 0) await refresh()
    } catch (err) {
      setError(err)
    } finally {
      setSyncBusy(false)
    }
  }

  async function onEditSave(key, counts, courses) {
    setEditBusy(true)
    try {
      await setBaseline(key, counts, { courses })
      setEditingRow(null)
      setStreamInput('')  // reset the upsert form after create
      await refresh()
    } catch (err) {
      throw err // let the dialog surface it
    } finally {
      setEditBusy(false)
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

  async function onCheck(key) {
    setCheckingKey(key)
    try {
      const res = await checkBaseline(key)
      setCheckResult(res)
    } catch (err) {
      setCheckResult({ status: 'error', baseline_key: key, group: key, batches: 0, written: 0, deleted: 0, _error: errMessage(err) })
    } finally {
      setCheckingKey(null)
    }
  }

  // ── Course scheme (PDF) uploader ─────────────────────────────────────
  const [schemeFile, setSchemeFile] = useState(null)
  const [schemeBranch, setSchemeBranch] = useState('')
  const [schemeBusy, setSchemeBusy] = useState(false)
  const [schemeDragging, setSchemeDragging] = useState(false)
  const [schemePreview, setSchemePreview] = useState(null)
  const [schemeError, setSchemeError] = useState(null)
  const [schemeResult, setSchemeResult] = useState(null)
  // Dialog opens automatically after a successful preview so the admin can
  // review + edit rosters inline before hitting apply.
  const [schemeDialogOpen, setSchemeDialogOpen] = useState(false)

  // Branch dropdown lists every real branch from the canonical stream map
  // plus a single pool selector at the top. The pool selector uploads the
  // *year-1* rotation curriculum for BOTH Pool A and Pool B in one shot
  // (they share the same course roster, Pool B just sees the semester
  // parity swapped). A real branch upload only fills in that branch's
  // year 2+ rosters — pool-following branches skip year 1 entirely on the
  // backend since it's already covered by the pool upload. Independent
  // branches (X/G/J/R) get their own year 1 straight from their PDF.
  const branchComboOptions = useMemo(() => {
    const names = batchesFallback?.streamNames?.default || {}
    const branches = Object.entries(names)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([code, name]) => ({
        value: code,
        label: `${code} — ${name}`,
      }))
    return [
      { value: 'POOL', label: 'Pool A/B — Year 1 rotation (both streams)' },
      ...branches,
    ]
  }, [])

  // Human-readable label of the selected branch, used in preview/apply
  // confirmations and error copy.
  const selectedBranchLabel = useMemo(() => {
    const found = branchComboOptions.find((o) => o.value === schemeBranch)
    return found?.label || schemeBranch
  }, [branchComboOptions, schemeBranch])

  function resetSchemeState() {
    setSchemeFile(null)
    setSchemeBranch('')
    setSchemePreview(null)
    setSchemeError(null)
    setSchemeResult(null)
    setSchemeDialogOpen(false)
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
      })
      setSchemePreview(data)
      setSchemeDialogOpen(true)
    } catch (err) {
      setSchemeError(err)
    } finally {
      setSchemeBusy(false)
    }
  }

  async function onSchemeApplyEdited(editedPlan, { merge, source }) {
    if (schemeBusy) return
    // The review dialog IS the confirmation step — no extra window.confirm
    // popup on top; the admin has already inspected + edited every row.
    setSchemeBusy(true)
    setSchemeError(null)
    try {
      const data = await applySchemePlan({
        plan: editedPlan,
        source: source || schemeFile?.name || null,
        merge: !!merge,
      })
      setSchemeResult(data)
      setSchemePreview(null)
      setSchemeDialogOpen(false)
      await refresh()
    } catch (err) {
      setSchemeError(err)
      throw err
    } finally {
      setSchemeBusy(false)
    }
  }

  async function addMissingSubjects(codes, plan, source) {
    const mappings = Array.isArray(codes) && codes.every((item) => typeof item === 'object')
      ? codes
      : [...new Set(codes || plan.flatMap((entry) => entry.missing_subject_codes || []))].map((code) => ({ code }))
    const courseRows = plan.flatMap((entry) => entry.courses || [])
    const items = mappings.map((mapping) => {
      const code = String(mapping.code || '').trim().toUpperCase()
      const course = courseRows.find((item) => String(item.code || '').toUpperCase() === code)
      return {
        code,
        name: mapping.name || course?.title || code,
        note: `Added from ${source || 'course scheme'}`,
      }
    })
    if (items.length > 0) await bulkSubjects(items)
  }

  // Merge checkbox lives in the dialog now, so the standalone state is
  // gone. The `applyScheme` PDF re-parse endpoint is still available for
  // scripted callers but the UI no longer uses it directly — everything
  // flows through `applySchemePlan` after human review in the modal.
  void applyScheme

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
            <Combobox
              className="upload-input"
              value={schemeBranch}
              onChange={(v) => {
                setSchemeBranch(v)
                setSchemePreview(null)
                setSchemeResult(null)
              }}
              options={branchComboOptions}
              placeholder="Select branch…"
              ariaLabel="Course scheme branch"
            />
          </div>
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
          <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ fontSize: 13, color: 'var(--muted, #9aa3af)', flex: '1 1 260px', minWidth: 0 }}>
              Detected <strong>{schemePreview.semester_count}</strong> semester(s) from
              {' '}<code>{schemePreview.source}</code>. Review each roster and edit
              inline before writing.
            </div>
            <button
              type="button"
              className="upload-btn"
              onClick={() => setSchemeDialogOpen(true)}
              disabled={schemeBusy}
              style={{ flex: '0 0 auto', width: 'auto' }}
            >
              Review &amp; edit {schemePreview.plan.length} baseline{schemePreview.plan.length === 1 ? '' : 's'}
            </button>
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
        <form
          className="upload-form"
          onSubmit={(e) => {
            e.preventDefault()
            if (!derivedKey) return
            setEditingRow({
              key: derivedKey,
              group: derivedKey.slice(1),
              semester_prefix: prefix,
              counts: {},
              courses: [],
              scheme_source: null,
            })
          }}
          style={{ marginTop: 12 }}
        >
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

          <button type="submit" className="upload-btn" disabled={!derivedKey}>
            {derivedKey ? `Configure baseline ${derivedKey}…` : 'Configure baseline'}
          </button>
        </form>
      </div>

      <div className="admin-card">
        <div className="admin-card-header" style={{ alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <h2 className="admin-card-title" style={{ textAlign: 'left', margin: 0 }}>Baselines</h2>
            <span className="status-pill ok">{totalItems.toLocaleString()}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {syncResult && (
              <span style={{ fontSize: 12, color: syncResult.updated > 0 ? '#34d399' : 'var(--text-muted,rgba(255,255,255,0.5))' }}>
                {syncResult.updated > 0
                  ? `Synced ${syncResult.updated} baseline${syncResult.updated !== 1 ? 's' : ''}`
                  : 'All counts already set'}
              </span>
            )}
            <button
              type="button"
              className="admin-card-action"
              onClick={onSyncCounts}
              disabled={syncBusy || loading}
              title="Derive and back-fill per-type counts from course L/T/P columns for any baseline that has an empty counts field"
            >
              {syncBusy ? 'Syncing…' : 'Sync counts'}
            </button>
            <button
              type="button"
              className="admin-card-action"
              onClick={refresh}
              disabled={loading}
            >
              {loading ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>
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
              <table className="uploads-table" style={{ tableLayout: 'fixed', width: '100%' }}>
                <colgroup>
                  {/* First 5 data columns share the width equally; the
                      trailing Actions column sizes to its content. */}
                  <col style={{ width: '16%' }} />
                  {typeColumns.map((t) => (
                    <col key={t} style={{ width: '16%' }} />
                  ))}
                  <col style={{ width: '16%' }} />
                  <col />
                </colgroup>
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
                    // Parent columns: Key + typeColumns + Courses + Actions
                    const courseColSpan = 1 + typeColumns.length + 1 + 1
                    // If the baseline row has no explicit per-type counts
                    // (e.g. a fresh scheme upload only populated `courses`),
                    // derive the L/T/P totals from the course list so the
                    // table shows real numbers instead of `—`.
                    const hasCounts = row.counts && Object.keys(row.counts).length > 0
                    const derived = hasCounts ? null : countsFromCourses(courses)
                    return (
                      <Fragment key={row.key}>
                        <tr>
                          <td style={{ fontFamily: 'var(--mono, monospace)' }}>{row.key}</td>
                          {typeColumns.map((t) => {
                            const explicit = row.counts?.[t]
                            if (explicit != null) return <td key={t}>{explicit}</td>
                            const fallback = derived?.[t]
                            if (fallback != null && fallback !== 0) {
                              return (
                                <td
                                  key={t}
                                  title="Derived from the course list — no explicit count set on this baseline yet."
                                  style={{ color: 'var(--muted, #9aa3af)' }}
                                >
                                  {Number.isInteger(fallback) ? fallback : fallback.toFixed(1)}
                                </td>
                              )
                            }
                            return <td key={t}>—</td>
                          })}
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
                          <td style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>
                            {currentPrefix && decomposeKey(row.key)?.prefix === currentPrefix && (
                              <button
                                type="button"
                                className="admin-card-action baseline-check-btn"
                                onClick={() => onCheck(row.key)}
                                disabled={checkingKey === row.key}
                                title="Run the doctor against live timetables for this group and log any mismatches"
                                style={{ marginRight: 8 }}
                              >
                                {checkingKey === row.key ? 'Checking…' : 'Check'}
                              </button>
                            )}
                            <button
                              type="button"
                              className="admin-card-action"
                              onClick={() => setEditingRow(row)}
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
            {totalItems > 25 && (
              <nav className="admin-pagination" aria-label="Baselines pages">
                <span className="admin-pagination-summary">Showing {firstResult}–{lastResult} of {totalItems.toLocaleString()}</span>
                <div className="admin-pagination-controls">
                  <button type="button" className="admin-page-button admin-page-button--arrow" onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={page === 1 || loading} aria-label="Previous page">‹</button>
                  {paginationItems(page, pageCount).map((item) => typeof item === 'string' && item.startsWith('ellipsis') ? (
                    <span className="admin-page-ellipsis" key={item}>…</span>
                  ) : (
                    <button
                      type="button"
                      className={`admin-page-button${item === page ? ' is-active' : ''}`}
                      key={item}
                      onClick={() => setPage(item)}
                      disabled={loading}
                      aria-current={item === page ? 'page' : undefined}
                    >
                      {item}
                    </button>
                  ))}
                  <button type="button" className="admin-page-button admin-page-button--arrow" onClick={() => setPage((value) => Math.min(pageCount, value + 1))} disabled={page >= pageCount || loading} aria-label="Next page">›</button>
                </div>
              </nav>
            )}
          </>
        )}
      </div>

        <SchemePreviewDialog
        open={schemeDialogOpen}
        preview={schemePreview}
        branchLabel={selectedBranchLabel}
        busy={schemeBusy}
          onApply={onSchemeApplyEdited}
          onAddMissing={(codes, plan) => addMissingSubjects(codes, plan, schemeFile?.name)}
        onClose={() => setSchemeDialogOpen(false)}
      />

      <BaselineCheckDialog
        result={checkResult}
        onClose={() => setCheckResult(null)}
      />

      <BaselineEditDialog
        row={editingRow}
        busy={editBusy}
        onSave={onEditSave}
        onClose={() => setEditingRow(null)}
      />
    </>
  )
}
