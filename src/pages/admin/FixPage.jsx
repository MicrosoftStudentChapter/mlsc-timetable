// Admin Fix tab — lists parsing errors / doctor mismatches, lets admins
// triage them in bulk (resolve / ignore / reopen) and jump into the grid
// editor for a single offender.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  listErrors,
  getErrorsSummary,
  resolveError,
  ignoreError,
  reopenError,
  bulkErrors,
  getRollbackMeta,
  performRollback,
  addSubject,
  setBaseline,
  backfillBaselineErrors,
} from '../../lib/admin'

const STATUS_TABS = [
  { id: 'open', label: 'Open' },
  { id: 'resolved', label: 'Resolved' },
  { id: 'ignored', label: 'Ignored' },
]

const SORT_OPTIONS = [
  { id: 'severity', label: 'Risk (high → low)' },
  { id: 'newest', label: 'Newest first' },
  { id: 'oldest', label: 'Oldest first' },
  { id: 'type', label: 'Type (A → Z)' },
]

const SEVERITY_RANK = { error: 3, warn: 2, warning: 2, info: 1 }
function sevRank(row) { return SEVERITY_RANK[row?.severity] ?? 0 }
function rowTime(row) { return row?.created_at ? new Date(row.created_at).getTime() : 0 }

function fmtDateTime(iso) {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleString()
  } catch {
    return iso
  }
}

function fmtCountdown(iso) {
  if (!iso) return ''
  const ms = new Date(iso).getTime() - Date.now()
  if (ms <= 0) return 'expired'
  const h = Math.floor(ms / 3_600_000)
  const m = Math.floor((ms % 3_600_000) / 60_000)
  return `${h}h ${m}m`
}

function SeverityDot({ severity }) {
  return <span className={`fix-sev fix-sev-${severity || 'warn'}`} />
}

// Pulls "UAI201P" out of either the structured `code` field or the parser
// message ("UAI201P was detected but is absent from subjects.json.").
function extractMissingCode(row) {
  if (row?.code && typeof row.code === 'string') return row.code.toUpperCase()
  const msg = row?.message || ''
  const m = msg.match(/\b([UN][A-Z]{1,3}\d{2,4}[LTP]?)\b/)
  return m ? m[1].toUpperCase() : ''
}

export default function FixPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const uploadFilter = searchParams.get('upload') || null
  const [status, setStatus] = useState('open')
  const [activeType, setActiveType] = useState(() => searchParams.get('type') || null)
  const [items, setItems] = useState([])
  const [summary, setSummary] = useState({ by_type: [], totals: {}, grand_total: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [selected, setSelected] = useState(() => new Set())
  const [busy, setBusy] = useState(false)
  const [rollback, setRollback] = useState(null)
  const [catalogModal, setCatalogModal] = useState(null) // { code, message } | null
  const [baselineModal, setBaselineModal] = useState(null) // { key, group, batchCount, errorId } | null
  const [toast, setToast] = useState(null) // { kind, text } | null
  const [expandedGroups, setExpandedGroups] = useState(() => new Set())
  const [sortBy, setSortBy] = useState('severity')
  const [doctorRunning, setDoctorRunning] = useState(false)
  const [doctorResult, setDoctorResult] = useState(null) // { ok, written, deleted } | null

  const clearUrlFilters = useCallback(() => {
    const next = new URLSearchParams(searchParams)
    next.delete('upload')
    next.delete('type')
    setSearchParams(next, { replace: true })
    setActiveType(null)
  }, [searchParams, setSearchParams])

  const reload = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [list, sum, rb] = await Promise.all([
        listErrors({
          status,
          errorType: activeType || undefined,
          uploadId: uploadFilter || undefined,
          limit: 1000,
        }),
        getErrorsSummary({ uploadId: uploadFilter || undefined }),
        getRollbackMeta().catch(() => ({ available: false })),
      ])
      setItems(list.items || [])
      setSummary(sum || { by_type: [], totals: {}, grand_total: 0 })
      setRollback(rb)
      setSelected(new Set())
    } catch (err) {
      setError(err)
    } finally {
      setLoading(false)
    }
  }, [status, activeType, uploadFilter])

  useEffect(() => {
    reload()
  }, [reload])

  const visibleIds = useMemo(() => items.map((it) => it.id), [items])
  const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selected.has(id))

  const sortedItems = useMemo(() => {
    const arr = items.slice()
    if (sortBy === 'severity') {
      arr.sort((a, b) => sevRank(b) - sevRank(a) || rowTime(b) - rowTime(a))
    } else if (sortBy === 'newest') {
      arr.sort((a, b) => rowTime(b) - rowTime(a))
    } else if (sortBy === 'oldest') {
      arr.sort((a, b) => rowTime(a) - rowTime(b))
    } else if (sortBy === 'type') {
      arr.sort((a, b) => (a.error_type || '').localeCompare(b.error_type || '') || sevRank(b) - sevRank(a))
    }
    return arr
  }, [items, sortBy])

  // Cluster SUBJECT_NOT_IN_CATALOG rows by extracted subject code so the same
  // missing subject doesn't spam 200 identical rows. One group row → one fix.
  // Other error types render as standalone rows in original order.
  const renderUnits = useMemo(() => {
    const groups = new Map() // code -> { code, rows: [], maxSev, latest }
    const units = []
    for (const it of sortedItems) {
      if (it.error_type === 'SUBJECT_NOT_IN_CATALOG') {
        const code = extractMissingCode(it) || '(unknown)'
        let g = groups.get(code)
        if (!g) {
          g = { kind: 'group', code, rows: [], maxSev: sevRank(it), latest: rowTime(it) }
          groups.set(code, g)
          units.push(g)
        } else {
          g.maxSev = Math.max(g.maxSev, sevRank(it))
          g.latest = Math.max(g.latest, rowTime(it))
        }
        g.rows.push(it)
      } else {
        units.push({ kind: 'row', row: it, sev: sevRank(it), latest: rowTime(it) })
      }
    }
    // Re-sort the top-level units so groups intermix with standalone rows by
    // the same key the user picked. Groups use their highest child severity.
    if (sortBy === 'severity') {
      units.sort((a, b) => {
        const sa = a.kind === 'group' ? a.maxSev : a.sev
        const sb = b.kind === 'group' ? b.maxSev : b.sev
        if (sa !== sb) return sb - sa
        const la = a.kind === 'group' ? a.latest : a.latest
        const lb = b.kind === 'group' ? b.latest : b.latest
        return lb - la
      })
    }
    return units
  }, [sortedItems, sortBy])

  function toggleGroup(code) {
    setExpandedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(code)) next.delete(code)
      else next.add(code)
      return next
    })
  }

  function toggleAll() {
    if (allSelected) {
      setSelected(new Set())
    } else {
      setSelected(new Set(visibleIds))
    }
  }

  function toggleOne(id) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function runBulk(action) {
    if (selected.size === 0) return
    setBusy(true)
    try {
      await bulkErrors({ ids: [...selected], action })
      await reload()
    } catch (err) {
      setError(err)
    } finally {
      setBusy(false)
    }
  }

  async function singleAction(id, action) {
    setBusy(true)
    try {
      if (action === 'resolve') await resolveError(id)
      else if (action === 'ignore') await ignoreError(id)
      else if (action === 'reopen') await reopenError(id)
      await reload()
    } catch (err) {
      setError(err)
    } finally {
      setBusy(false)
    }
  }

  async function runGroupAction(ids, action) {
    if (!ids || ids.length === 0) return
    setBusy(true)
    try {
      await bulkErrors({ ids, action })
      await reload()
    } catch (err) {
      setError(err)
    } finally {
      setBusy(false)
    }
  }

  async function runDoctor() {
    setDoctorRunning(true)
    setDoctorResult(null)
    try {
      const res = await backfillBaselineErrors()
      setDoctorResult({ ok: true, written: res.written ?? 0, deleted: res.deleted ?? 0 })
      await reload()
    } catch (err) {
      setDoctorResult({ ok: false, error: err?.message || String(err) })
    } finally {
      setDoctorRunning(false)
    }
  }

  async function runRollback() {
    if (!confirm('Roll back the most recent ingest? This will replace the live batches + timetables with the snapshot taken before the last ingest. Single-use — the snapshot will be deleted after.')) {
      return
    }
    setBusy(true)
    try {
      const res = await performRollback()
      alert(`Rolled back. Restored ${res.batches} batch(es) and ${res.timetables} timetable(s).`)
      await reload()
    } catch (err) {
      setError(err)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fix-page">
      <div className="fix-header">
        <div className="fix-header-left">
          <h1 className="fix-title">Fix issues</h1>
          <p className="fix-sub">
            {summary.totals.open || 0} open · {summary.totals.resolved || 0} resolved · {summary.totals.ignored || 0} ignored
          </p>
        </div>
        <div className="fix-header-right">
          <div className="fix-header-actions">
            <button
              type="button"
              className="fix-doctor-btn"
              onClick={runDoctor}
              disabled={doctorRunning || busy}
              title="Re-run the doctor against current timetables + baselines. Clears all open baseline errors and rewrites them from scratch."
            >
              {doctorRunning ? 'Running…' : 'Re-run doctor'}
            </button>
            {doctorResult && (
              <span className={`fix-doctor-result${doctorResult.ok ? '' : ' is-error'}`}>
                {doctorResult.ok
                  ? doctorResult.written === 0
                    ? 'Done — no baseline issues found'
                    : `Done — ${doctorResult.written} baseline issue${doctorResult.written === 1 ? '' : 's'} (refreshed)`
                  : `Failed: ${doctorResult.error}`}
              </span>
            )}
          </div>
          {rollback?.available && (
            <div className="fix-rollback-card">
              <div className="fix-rollback-info">
                <span className="fix-rollback-title">Rollback available</span>
                <span className="fix-rollback-meta">
                  Snapshot from {fmtDateTime(rollback.created_at)} · expires in {fmtCountdown(rollback.expires_at)} · {rollback.batches} batches, {rollback.timetables} timetables
                </span>
              </div>
              <button
                type="button"
                className="fix-rollback-btn"
                onClick={runRollback}
                disabled={busy}
              >
                Roll back last ingest
              </button>
            </div>
          )}
        </div>
      </div>

      {(uploadFilter || activeType) && (
        <div className="fix-filter-banner">
          <span className="fix-filter-banner-label">Filtered by:</span>
          {uploadFilter && (
            <span className="fix-filter-chip">
              upload <code>{uploadFilter.slice(-8)}</code>
            </span>
          )}
          {activeType && (
            <span className="fix-filter-chip">
              type <code>{activeType}</code>
            </span>
          )}
          <button type="button" className="fix-filter-clear" onClick={clearUrlFilters}>
            Clear
          </button>
        </div>
      )}

      {/* Error-type pills */}
      <div className="fix-pills">
        <button
          type="button"
          className={`fix-pill${activeType == null ? ' is-active' : ''}`}
          onClick={() => setActiveType(null)}
        >
          All types <span className="fix-pill-count">{summary.grand_total}</span>
        </button>
        {(summary.by_type || []).map((row) => (
          <button
            key={row.error_type}
            type="button"
            className={`fix-pill${activeType === row.error_type ? ' is-active' : ''}`}
            onClick={() => setActiveType(row.error_type)}
            title={`open ${row.open} · resolved ${row.resolved} · ignored ${row.ignored}`}
          >
            {row.error_type}
            <span className="fix-pill-count">{row.open}</span>
          </button>
        ))}
      </div>

      {/* Status tabs */}
      <div className="fix-tabs-row">
        <div className="fix-tabs">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={`fix-tab${status === tab.id ? ' is-active' : ''}`}
              onClick={() => setStatus(tab.id)}
            >
              {tab.label}
              <span className="fix-tab-count">{summary.totals[tab.id] || 0}</span>
            </button>
          ))}
        </div>
        <label className="fix-sort">
          <span className="fix-sort-label">Sort</span>
          <select
            className="fix-sort-select"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.id} value={o.id}>{o.label}</option>
            ))}
          </select>
        </label>
      </div>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="fix-bulk-bar">
          <span className="fix-bulk-count">{selected.size} selected</span>
          {status !== 'resolved' && (
            <button type="button" onClick={() => runBulk('resolve')} disabled={busy} className="fix-bulk-btn fix-bulk-resolve">
              Resolve all
            </button>
          )}
          {status !== 'ignored' && (
            <button type="button" onClick={() => runBulk('ignore')} disabled={busy} className="fix-bulk-btn fix-bulk-ignore">
              Ignore all
            </button>
          )}
          {status !== 'open' && (
            <button type="button" onClick={() => runBulk('reopen')} disabled={busy} className="fix-bulk-btn fix-bulk-reopen">
              Reopen
            </button>
          )}
          <button type="button" onClick={() => setSelected(new Set())} className="fix-bulk-btn fix-bulk-cancel">
            Cancel
          </button>
        </div>
      )}

      {error && (
        <div className="fix-error" role="alert">
          {String(error.message || error)}
        </div>
      )}

      {/* Error rows */}
      <div className="fix-table">
        <div className="fix-row fix-row-head">
          <label className="fix-checkbox">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={toggleAll}
              disabled={visibleIds.length === 0}
            />
          </label>
          <span className="fix-col-sev">Sev</span>
          <span className="fix-col-type">Type</span>
          <span className="fix-col-batch">Batch</span>
          <span className="fix-col-where">Where</span>
          <span className="fix-col-msg">Message</span>
          <span className="fix-col-actions">Actions</span>
        </div>

        {loading && <div className="fix-empty">Loading…</div>}
        {!loading && items.length === 0 && (
          <div className="fix-empty">No {status} errors{activeType ? ` of type ${activeType}` : ''}.</div>
        )}
        {!loading && renderUnits.map((unit) => {
          if (unit.kind === 'group') {
            const { code, rows } = unit
            const expanded = expandedGroups.has(code)
            const ids = rows.map((r) => r.id)
            const allChecked = ids.every((id) => selected.has(id))
            const someChecked = !allChecked && ids.some((id) => selected.has(id))
            const first = rows[0]
            const batchSample = [...new Set(rows.map((r) => r.batch_code).filter(Boolean))].slice(0, 4)
            const moreBatches = Math.max(0, new Set(rows.map((r) => r.batch_code).filter(Boolean)).size - batchSample.length)
            return (
              <div key={`grp:${code}`} className="fix-group">
                <div className="fix-row fix-row-group">
                  <label className="fix-checkbox">
                    <input
                      type="checkbox"
                      checked={allChecked}
                      ref={(el) => { if (el) el.indeterminate = someChecked }}
                      onChange={() => {
                        setSelected((prev) => {
                          const next = new Set(prev)
                          if (allChecked) ids.forEach((id) => next.delete(id))
                          else ids.forEach((id) => next.add(id))
                          return next
                        })
                      }}
                    />
                  </label>
                  <span className="fix-col-sev"><SeverityDot severity={first.severity} /></span>
                  <span className="fix-col-type">
                    <button
                      type="button"
                      className="fix-group-toggle"
                      onClick={() => toggleGroup(code)}
                      aria-expanded={expanded}
                    >
                      <span className={`fix-caret${expanded ? ' is-open' : ''}`}>▸</span>
                      <code>{code}</code>
                      <span className="fix-group-count">×{rows.length}</span>
                    </button>
                  </span>
                  <span className="fix-col-batch fix-dim">
                    {batchSample.map((b) => <code key={b} className="fix-group-batch">{b}</code>)}
                    {moreBatches > 0 && <span className="fix-group-more">+{moreBatches}</span>}
                  </span>
                  <span className="fix-col-where fix-dim">—</span>
                  <span className="fix-col-msg fix-dim" title={first.message}>
                    {rows.length} slot{rows.length === 1 ? '' : 's'} missing <code>{code}</code> in subjects catalog
                  </span>
                  <span className="fix-col-actions">
                    {status === 'open' && (
                      <>
                        <button
                          type="button"
                          className="fix-action fix-action-catalog"
                          onClick={() => setCatalogModal({ code, message: first.message })}
                          disabled={busy}
                          title={`Add ${code} to the catalog — auto-resolves all ${rows.length} rows`}
                        >
                          + Catalog · fixes {rows.length}
                        </button>
                        <button
                          type="button"
                          className="fix-action fix-action-resolve"
                          onClick={() => runGroupAction(ids, 'resolve')}
                          disabled={busy}
                        >
                          Resolve all
                        </button>
                        <button
                          type="button"
                          className="fix-action fix-action-ignore"
                          onClick={() => runGroupAction(ids, 'ignore')}
                          disabled={busy}
                        >
                          Ignore all
                        </button>
                      </>
                    )}
                    {status !== 'open' && (
                      <button
                        type="button"
                        className="fix-action fix-action-reopen"
                        onClick={() => runGroupAction(ids, 'reopen')}
                        disabled={busy}
                      >
                        Reopen all
                      </button>
                    )}
                  </span>
                </div>
                {expanded && rows.map((it) => (
                  <div key={it.id} className="fix-row fix-row-child">
                    <label className="fix-checkbox">
                      <input
                        type="checkbox"
                        checked={selected.has(it.id)}
                        onChange={() => toggleOne(it.id)}
                      />
                    </label>
                    <span className="fix-col-sev" />
                    <span className="fix-col-type fix-dim">↳</span>
                    <span className="fix-col-batch">
                      {it.batch_code ? <code>{it.batch_code}</code> : <span className="fix-dim">—</span>}
                    </span>
                    <span className="fix-col-where">
                      {it.day || ''}{it.start_time ? ` ${it.start_time}` : ''}
                    </span>
                    <span className="fix-col-msg" title={it.message}>{it.message}</span>
                    <span className="fix-col-actions">
                      {it.batch_code && (
                        <Link
                          to={`/admin/fix/timetable/${encodeURIComponent(it.batch_code)}?error=${encodeURIComponent(it.id)}`}
                          className="fix-action fix-action-open"
                        >
                          Open ↗
                        </Link>
                      )}
                    </span>
                  </div>
                ))}
              </div>
            )
          }
          const it = unit.row
          return (
            <div key={it.id} className="fix-row">
              <label className="fix-checkbox">
                <input
                  type="checkbox"
                  checked={selected.has(it.id)}
                  onChange={() => toggleOne(it.id)}
                />
              </label>
              <span className="fix-col-sev"><SeverityDot severity={it.severity} /></span>
              <span className="fix-col-type">
                <span className="fix-type-badge" title={it.error_type}>{it.error_type}</span>
              </span>
              <span className="fix-col-batch">
                {it.batch_code ? <code>{it.batch_code}</code> : <span className="fix-dim">—</span>}
              </span>
              <span className="fix-col-where">
                {it.day || ''}{it.start_time ? ` ${it.start_time}` : ''}
              </span>
              <span className="fix-col-msg" title={it.message}>{it.message}</span>
              <span className="fix-col-actions">
                {it.batch_code && (
                  <Link
                    to={`/admin/fix/timetable/${encodeURIComponent(it.batch_code)}?error=${encodeURIComponent(it.id)}`}
                    className="fix-action fix-action-open"
                  >
                    Open ↗
                  </Link>
                )}
                {status === 'open' && (
                  <>
                    <button type="button" className="fix-action fix-action-resolve" onClick={() => singleAction(it.id, 'resolve')} disabled={busy}>Resolve</button>
                    <button type="button" className="fix-action fix-action-ignore" onClick={() => singleAction(it.id, 'ignore')} disabled={busy}>Ignore</button>
                  </>
                )}
                {status !== 'open' && (
                  <button type="button" className="fix-action fix-action-reopen" onClick={() => singleAction(it.id, 'reopen')} disabled={busy}>Reopen</button>
                )}
              </span>
            </div>
          )
        })}
      </div>
      {toast && (
        <div className={`fix-toast fix-toast-${toast.kind}`} role="status">
          {toast.text}
          <button type="button" className="fix-toast-x" onClick={() => setToast(null)} aria-label="Dismiss">×</button>
        </div>
      )}
      {catalogModal && (
        <AddCatalogModal
          initialCode={catalogModal.code}
          message={catalogModal.message}
          onClose={() => setCatalogModal(null)}
          onSaved={async (result) => {
            setCatalogModal(null)
            const cleared = result?.errors_resolved ?? 0
            setToast({
              kind: 'ok',
              text: `Added ${result.subject?.code || ''} · auto-resolved ${cleared} matching error${cleared === 1 ? '' : 's'}.`,
            })
            await reload()
          }}
        />
      )}
    </div>
  )
}

function AddCatalogModal({ initialCode, message, onClose, onSaved }) {
  const [code, setCode] = useState(initialCode || '')
  const [name, setName] = useState('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState(null)

  async function submit(e) {
    e.preventDefault()
    const trimmedCode = code.trim().toUpperCase()
    const trimmedName = name.trim()
    if (!trimmedCode || !trimmedName) {
      setErr('Code and name are required.')
      return
    }
    setSaving(true)
    setErr(null)
    try {
      const res = await addSubject({
        code: trimmedCode,
        name: trimmedName,
        note: note.trim() || undefined,
      })
      onSaved(res)
    } catch (e2) {
      setErr(e2?.detail?.error || e2?.message || 'Failed to add subject.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fix-modal-backdrop" onClick={onClose}>
      <form className="fix-modal" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <header className="fix-modal-head">
          <h2>Add subject to catalog</h2>
          <button type="button" className="fix-modal-x" onClick={onClose} aria-label="Close">×</button>
        </header>
        {message && (
          <p className="fix-modal-context" title={message}>
            From error: <em>{message}</em>
          </p>
        )}
        <label className="fix-modal-field">
          <span>Code</span>
          <input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="e.g. UAI201"
            autoFocus={!initialCode}
            spellCheck={false}
          />
          <small className="fix-modal-hint">Trailing L/T/P is stripped automatically.</small>
        </label>
        <label className="fix-modal-field">
          <span>Subject name</span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Introduction to Artificial Intelligence"
            autoFocus={!!initialCode}
          />
        </label>
        <label className="fix-modal-field">
          <span>Note (optional)</span>
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Why was this added?"
          />
        </label>
        {err && <div className="fix-modal-err">{err}</div>}
        <footer className="fix-modal-foot">
          <button type="button" className="fix-action" onClick={onClose} disabled={saving}>Cancel</button>
          <button type="submit" className="fix-action fix-action-catalog" disabled={saving}>
            {saving ? 'Adding…' : 'Add to catalog'}
          </button>
        </footer>
      </form>
    </div>
  )
}
