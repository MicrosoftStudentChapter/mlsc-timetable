import { useCallback, useEffect, useState } from 'react'
import {
  listSubjects,
  addSubject,
  listSubjectRequests,
  approveSubjectRequest,
  rejectSubjectRequest,
  patchSubject,
  deleteSubject,
  importSubjectMapping,
  AdminAuthError,
} from '../../lib/admin'
import './admin.css'

function errorText(error) {
  if (error instanceof AdminAuthError) return error.detail?.error || error.message
  return error?.message || 'Something went wrong'
}

function dateText(value) {
  if (!value) return '—'
  try { return new Date(value).toLocaleString() } catch { return value }
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

export default function CatalogPage() {
  const [subjects, setSubjects] = useState([])
  const [totalSubjects, setTotalSubjects] = useState(0)
  const [page, setPage] = useState(1)
  const [requests, setRequests] = useState([])
  const [query, setQuery] = useState('')
  const [source, setSource] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(null)
  const [error, setError] = useState(null)
  const [form, setForm] = useState({ code: '', name: '', note: '' })
  const [importReview, setImportReview] = useState(null)
  const pageCount = Math.max(1, Math.ceil(totalSubjects / 25))
  const firstResult = totalSubjects === 0 ? 0 : (page - 1) * 25 + 1
  const lastResult = Math.min(page * 25, totalSubjects)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [subjectData, requestData] = await Promise.all([
        listSubjects({ q: query.trim() || undefined, source: source || undefined, limit: 25, offset: (page - 1) * 25 }),
        listSubjectRequests({ status: 'pending', limit: 500 }),
      ])
      setSubjects(subjectData?.items || [])
      setTotalSubjects(subjectData?.count || 0)
      setRequests(requestData?.items || [])
    } catch (err) {
      setError(err)
    } finally {
      setLoading(false)
    }
  }, [query, source, page])

  useEffect(() => { setPage(1) }, [query, source])

  useEffect(() => {
    const timer = setTimeout(refresh, 180)
    return () => clearTimeout(timer)
  }, [refresh])

  async function saveSubject(event) {
    event.preventDefault()
    if (!form.code.trim() || !form.name.trim() || busy) return
    setBusy('form')
    setError(null)
    try {
      await addSubject({
        code: form.code.trim(),
        name: form.name.trim(),
        note: form.note.trim() || undefined,
      })
      setForm({ code: '', name: '', note: '' })
      await refresh()
    } catch (err) {
      setError(err)
    } finally {
      setBusy(null)
    }
  }

  async function decide(request, action) {
    setBusy(request.id)
    setError(null)
    try {
      if (action === 'approve') await approveSubjectRequest(request.id)
      else await rejectSubjectRequest(request.id)
      await refresh()
    } catch (err) {
      setError(err)
    } finally {
      setBusy(null)
    }
  }

  async function editSubject(subject) {
    const name = window.prompt('Course name', subject.name)
    if (name == null || !name.trim()) return
    setBusy(subject.code)
    try { await patchSubject(subject.code, { name: name.trim() }); await refresh() }
    catch (err) { setError(err) }
    finally { setBusy(null) }
  }

  async function removeSubject(subject) {
    if (!window.confirm(`Delete ${subject.code} from the catalog?`)) return
    setBusy(subject.code)
    try { await deleteSubject(subject.code, { force: true }); await refresh() }
    catch (err) { setError(err) }
    finally { setBusy(null) }
  }

  async function importJson(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setBusy('import')
    setError(null)
    try {
      const parsed = JSON.parse(await file.text())
      if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') throw new Error('JSON must be a flat {"CODE": "Course Name"} mapping')
      const invalid = Object.entries(parsed).some(([code, name]) => typeof code !== 'string' || typeof name !== 'string' || !code.trim() || !name.trim())
      if (invalid) throw new Error('Every JSON entry must map a course code to a non-empty name')
      const existingData = await listSubjects({ limit: 1000 })
      const existing = new Map((existingData?.items || []).map((item) => [item.code.toUpperCase(), item]))
      const rows = Object.entries(parsed).map(([code, name]) => ({
        code: code.toUpperCase(),
        name,
        existing: existing.get(code.toUpperCase()) || null,
        selected: !existing.has(code.toUpperCase()),
      }))
      setImportReview({ fileName: file.name, rows })
    } catch (err) {
      setError(err)
    } finally {
      setBusy(null)
    }
  }

  async function applyImport() {
    const selected = importReview?.rows.filter((row) => row.selected)
    if (!selected?.length || busy) return
    setBusy('import')
    setError(null)
    try {
      await importSubjectMapping(Object.fromEntries(selected.map((row) => [row.code, row.name])))
      setImportReview(null)
      await refresh()
    } catch (err) {
      setError(err)
    } finally {
      setBusy(null)
    }
  }

  return (
    <div>
      <div className="admin-card" style={{ marginBottom: 16 }}>
        <div className="admin-card-header" style={{ alignItems: 'center' }}>
          <div>
            <h2 className="admin-card-title" style={{ textAlign: 'left' }}>Subject catalog</h2>
            <p className="admin-card-sub" style={{ textAlign: 'left', margin: 0 }}>
              Course-code to course-name mappings used by timetables and Google Calendar.
            </p>
          </div>
          <button type="button" className="admin-card-action" onClick={refresh} disabled={loading}>
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
          <label className="admin-card-action" style={{ cursor: 'pointer' }}>
            {busy === 'import' ? 'Importing…' : 'Import JSON'}
            <input type="file" accept="application/json,.json" hidden onChange={importJson} disabled={busy !== null} />
          </label>
        </div>
        {error && <div className="upload-result failed" style={{ marginTop: 12 }}>{errorText(error)}</div>}
        <form className="manager-add" onSubmit={saveSubject} style={{ marginTop: 16 }}>
          <div className="manager-add-row">
            <input
              className="upload-input"
              placeholder="Course code, e.g. UCS320"
              value={form.code}
              onChange={(event) => setForm((current) => ({ ...current, code: event.target.value }))}
              required
            />
            <input
              className="upload-input"
              placeholder="Course name"
              value={form.name}
              onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
              required
            />
          </div>
          <input
            className="upload-input"
            placeholder="Note (optional)"
            value={form.note}
            onChange={(event) => setForm((current) => ({ ...current, note: event.target.value }))}
          />
          <button type="submit" className="upload-btn" disabled={busy === 'form' || !form.code.trim() || !form.name.trim()}>
            {busy === 'form' ? 'Adding…' : 'Add or update subject'}
          </button>
        </form>
      </div>

      {importReview && (
        <div className="admin-card" style={{ marginBottom: 16 }}>
          <div className="admin-card-header" style={{ alignItems: 'center' }}>
            <div>
              <h2 className="admin-card-title" style={{ textAlign: 'left' }}>Review JSON import</h2>
              <p className="admin-card-sub" style={{ textAlign: 'left', margin: 0 }}>
                {importReview.fileName}. Existing codes are unchecked by default; select them to override their names.
              </p>
            </div>
            <button type="button" className="admin-card-action" onClick={() => setImportReview(null)} disabled={busy === 'import'}>Cancel</button>
          </div>
          <div className="manager-list">
            {importReview.rows.map((row) => (
              <label className="manager-row" key={row.code} style={{ cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={row.selected}
                  onChange={() => setImportReview((current) => ({
                    ...current,
                    rows: current.rows.map((item) => item.code === row.code ? { ...item, selected: !item.selected } : item),
                  }))}
                />
                <div className="manager-row-body" style={{ marginLeft: 12 }}>
                  <div className="manager-row-title"><code>{row.code}</code> · {row.name}</div>
                  <div className="manager-row-sub">
                    {row.existing ? `Existing: ${row.existing.name} · select to override` : 'New mapping'}
                  </div>
                </div>
              </label>
            ))}
          </div>
          <button type="button" className="upload-btn" onClick={applyImport} disabled={busy === 'import' || !importReview.rows.some((row) => row.selected)}>
            {busy === 'import' ? 'Importing…' : `Import ${importReview.rows.filter((row) => row.selected).length} selected`}
          </button>
        </div>
      )}

      <div className="admin-card" style={{ marginBottom: 16 }}>
        <div className="admin-card-header" style={{ alignItems: 'center' }}>
          <h2 className="admin-card-title" style={{ textAlign: 'left' }}>Pending catalog requests</h2>
          <span className="status-pill partial">{requests.length}</span>
        </div>
        {requests.length === 0 ? (
          <div className="manager-empty">No pending subject requests.</div>
        ) : (
          <ul className="manager-list">
            {requests.map((request) => (
              <li className="manager-row" key={request.id}>
                <div className="manager-row-body">
                  <div className="manager-row-title">
                    <code>{request.code}</code> · {request.name}
                  </div>
                  <div className="manager-row-sub">
                    Batch {request.requester_batch} · {dateText(request.created_at)}
                  </div>
                </div>
                <button
                  type="button"
                  className="upload-btn"
                  onClick={() => decide(request, 'approve')}
                  disabled={busy === request.id}
                  style={{ background: '#16a34a', marginRight: 8 }}
                >
                  {busy === request.id ? 'Working…' : 'Approve'}
                </button>
                <button
                  type="button"
                  className="upload-btn"
                  onClick={() => decide(request, 'reject')}
                  disabled={busy === request.id}
                  style={{ background: '#dc2626' }}
                >
                  Reject
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="admin-card">
        <div className="admin-card-header" style={{ alignItems: 'center' }}>
          <h2 className="admin-card-title" style={{ textAlign: 'left' }}>Mapped subjects</h2>
          <span className="status-pill ok">{totalSubjects.toLocaleString()}</span>
        </div>
        <input
          className="upload-input"
          placeholder="Search by code or course name"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          style={{ marginBottom: 12 }}
        />
        <select className="upload-input" value={source} onChange={(event) => setSource(event.target.value)} style={{ marginBottom: 12 }}>
          <option value="">All sources</option>
          <option value="seed">Seed</option>
          <option value="admin">Admin</option>
          <option value="import">Import</option>
        </select>
        {subjects.length === 0 ? (
          <div className="manager-empty">No subjects found.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="admin-table catalog-table">
              <thead>
                <tr><th>Code</th><th>Course name</th><th>Source</th><th>Updated</th><th>Actions</th></tr>
              </thead>
              <tbody>
                {subjects.map((subject) => (
                  <tr key={subject.code}>
                    <td><code>{subject.code}</code></td>
                    <td>{subject.name}</td>
                    <td>{subject.source || '—'}</td>
                    <td>{dateText(subject.updated_at || subject.created_at)}</td>
                    <td>
                      <button type="button" className="admin-card-action" onClick={() => editSubject(subject)} disabled={busy === subject.code}>Edit</button>{' '}
                      <button type="button" className="admin-card-action" style={{ color: '#f87171' }} onClick={() => removeSubject(subject)} disabled={busy === subject.code}>Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {totalSubjects > 25 && (
          <nav className="admin-pagination" aria-label="Subject catalog pages">
            <span className="admin-pagination-summary">Showing {firstResult}–{lastResult} of {totalSubjects.toLocaleString()}</span>
            <div className="admin-pagination-controls">
              <button type="button" className="admin-page-button admin-page-button--arrow" onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={page === 1 || loading} aria-label="Previous page">‹</button>
              {paginationItems(page, pageCount).map((item) => item.startsWith?.('ellipsis') ? (
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
      </div>
    </div>
  )
}
