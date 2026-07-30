import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import Combobox from '../../components/Combobox'
import { adminConfirm } from '../../lib/adminConfirm'
import { loadBatches } from '../../lib/batches'
import {
  AdminAuthError,
  addSubject,
  applyLibraryScheme,
  bulkLibraryEntries,
  deleteLibraryEntry,
  getLibraryEntry,
  listLibraryEntries,
  listSubjects,
  publishLibraryEntry,
  previewLibraryScheme,
  saveLibraryEntry,
} from '../../lib/admin'
import './admin.css'

const SECTION_META = {
  core: { label: 'Core Subjects', description: 'Permanent section for compulsory subjects.' },
  elective_1: { label: 'Elective 1', description: 'Courses offered in the first elective slot.' },
  elective_2: { label: 'Elective 2', description: 'Courses offered in the second elective slot.' },
  elective_3: { label: 'Elective 3', description: 'Courses offered in the third elective slot.' },
  elective_4: { label: 'Elective 4', description: 'Courses offered in the fourth elective slot.' },
  general_elective: { label: 'General Elective', description: 'Institute or open elective choices.' },
}

const SECTION_ORDER = Object.keys(SECTION_META)
const ALL_SEMESTER_BRANCHES = new Set(['G', 'J', 'R', 'X'])
const POOL_BRANCHES = new Set(['POOL-A', 'POOL-B', 'POOL-C', 'POOL-D'])
const emptySections = () => [{ kind: 'core', subject_codes: [] }]
const emptyPublication = () => ({
  status: 'draft',
  published: false,
  hasUnpublishedChanges: false,
  publishedRevision: 0,
  publishedSubjectCount: 0,
  publishedAt: null,
})

function messageOf(error) {
  if (error instanceof AdminAuthError) return error.detail?.error || error.message
  return error?.message || 'Something went wrong'
}

function normalizeSections(sections) {
  const byKind = new Map((sections || []).map((section) => [section.kind, {
    kind: section.kind,
    subject_codes: [...(section.subject_codes || [])],
  }]))
  if (!byKind.has('core')) byKind.set('core', { kind: 'core', subject_codes: [] })
  return SECTION_ORDER.filter((kind) => byKind.has(kind)).map((kind) => byKind.get(kind))
}

function uniqueBranches(years) {
  const byCode = new Map()
  for (const year of years || []) {
    for (const stream of year.streams || []) {
      // COE 2+2 always resolves to COE and has no editable Library record.
      if (stream.code === 'CE-2+2') continue
      if (year.year === 1 && stream.code === 'A') {
        byCode.set('POOL-A', 'Pool A')
        continue
      }
      if (year.year === 1 && stream.code === 'B') {
        byCode.set('POOL-B', 'Pool B')
        continue
      }
      if (year.year === 1 && stream.code === 'C') {
        byCode.set('POOL-C', 'Pool C')
        continue
      }
      if (year.year === 1 && stream.code === 'D') {
        byCode.set('POOL-D', 'Pool D')
        continue
      }
      // Prefer a branch's year 2+ name when a code occurs in multiple years.
      if (!byCode.has(stream.code) || year.year > 1) byCode.set(stream.code, stream.name)
    }
  }
  const poolRank = (code) => {
    const index = ['POOL-A', 'POOL-B', 'POOL-C', 'POOL-D'].indexOf(code)
    return index === -1 ? 4 : index
  }
  return [...byCode]
    .sort(([a], [b]) => poolRank(a) - poolRank(b) || a.localeCompare(b))
    .map(([code, name]) => ({ code, name }))
}

function semestersForBranch(branch) {
  if (POOL_BRANCHES.has(branch)) return [1, 2]
  if (ALL_SEMESTER_BRANCHES.has(branch)) return Array.from({ length: 8 }, (_, index) => index + 1)
  return Array.from({ length: 6 }, (_, index) => index + 3)
}

function semesterRuleForBranch(branch) {
  if (POOL_BRANCHES.has(branch)) return 'Year-one pool · Semesters 1–2'
  if (ALL_SEMESTER_BRANCHES.has(branch)) return 'Independent branch · Semesters 1–8'
  return 'Pool-following branch · Semesters 3–8'
}

function importSemestersForBranch(branch) {
  if (branch === 'POOL') return [1, 2]
  return semestersForBranch(branch)
}

function importTargets(branch, semester) {
  const value = Number(semester)
  if (!value) return []
  if (branch === 'POOL') {
    return [
      { branch: 'POOL-A', semester: value },
      { branch: 'POOL-B', semester: 3 - value },
    ]
  }
  return [{ branch, semester: value }]
}

function subjectCountOfSections(sections) {
  return (sections || []).reduce((sum, section) => sum + (section.subject_codes || []).length, 0)
}

function assignElectiveTableToPreview(current, tableId, rawTarget, existingEntries) {
  if (!current) return current
  const sourceTable = (current.elective_tables || []).find((table) => table.id === tableId)
  if (!sourceTable) return current
  const codes = (sourceTable.sections || []).flatMap((section) => section.subject_codes || [])
  const plan = (current.plan || []).map((item) => ({
    ...item,
    sections: (item.sections || []).map((section) => ({
      ...section,
      subject_codes: [...(section.subject_codes || [])],
    })),
    extracted_courses: [...(item.extracted_courses || [])],
    _elective_assignments: { ...(item._elective_assignments || {}) },
  }))

  // Remove the table's previous assignment and restore any course section it
  // displaced in that entry before applying its new target.
  for (let index = plan.length - 1; index >= 0; index -= 1) {
    const item = plan[index]
    const assignment = item._elective_assignments?.[tableId]
    if (!assignment) continue
    item.sections = item.sections.map((section) => ({
      ...section,
      subject_codes: section.subject_codes.filter((code) => !assignment.codes.includes(code)),
    }))
    for (const [code, previousKind] of Object.entries(assignment.previous_sections || {})) {
      if (!previousKind) continue
      let section = item.sections.find((candidate) => candidate.kind === previousKind)
      if (!section) {
        section = { kind: previousKind, subject_codes: [] }
        item.sections.push(section)
      }
      if (!section.subject_codes.includes(code)) section.subject_codes.push(code)
    }
    delete item._elective_assignments[tableId]
    item.sections.sort((left, right) => SECTION_ORDER.indexOf(left.kind) - SECTION_ORDER.indexOf(right.kind))
    if (item._generated_for_elective_assignment && subjectCountOfSections(item.sections) === 0) {
      plan.splice(index, 1)
    }
  }

  const nextTarget = rawTarget === 'skip' ? 'skip' : (rawTarget ? Number(rawTarget) : null)
  if (Number.isInteger(nextTarget)) {
    for (const target of importTargets(current.branch, nextTarget)) {
      const key = `${target.branch}:S${target.semester}`
      let item = plan.find((candidate) => candidate.key === key)
      if (!item) {
        const existing = existingEntries.find((candidate) => candidate.key === key)
        item = {
          key,
          branch: target.branch,
          semester: target.semester,
          sections: existing
            ? (existing.sections || []).map((section) => ({
                kind: section.kind,
                subject_codes: [...(section.subject_codes || [])],
              }))
            : [{ kind: 'core', subject_codes: [] }],
          source: current.source,
          extracted_courses: [],
          would_overwrite: Boolean(existing),
          existing_subject_count: existing?.subject_count || 0,
          _generated_for_elective_assignment: !existing,
          _elective_assignments: {},
          _selected: true,
        }
        plan.push(item)
      }
      const previousSections = Object.fromEntries(codes.map((code) => [
        code,
        item.sections.find((section) => section.subject_codes.includes(code))?.kind || null,
      ]))
      item.sections = item.sections.map((section) => ({
        ...section,
        subject_codes: section.subject_codes.filter((code) => !codes.includes(code)),
      }))
      let electiveSection = item.sections.find((section) => section.kind === sourceTable.section)
      if (!electiveSection) {
        electiveSection = { kind: sourceTable.section, subject_codes: [] }
        item.sections.push(electiveSection)
      }
      electiveSection.subject_codes = [...new Set([...electiveSection.subject_codes, ...codes])]
      item.extracted_courses = [
        ...item.extracted_courses.filter((course) => !codes.includes(course.code)),
        ...(sourceTable.extracted_courses || []),
      ]
      item._elective_assignments[tableId] = { codes, previous_sections: previousSections }
      item.sections.sort((left, right) => SECTION_ORDER.indexOf(left.kind) - SECTION_ORDER.indexOf(right.kind))
    }
    plan.sort((left, right) => left.branch.localeCompare(right.branch) || left.semester - right.semester)
  }

  return {
    ...current,
    plan,
    elective_tables: current.elective_tables.map((table) => (
      table.id === tableId ? { ...table, target_semester: nextTarget } : table
    )),
    entry_count: plan.length,
  }
}

function preparePdfPreview(preview, existingEntries) {
  let prepared = {
    ...preview,
    plan: (preview.plan || []).map((item) => ({ ...item, _selected: true })),
  }
  for (const table of prepared.elective_tables || []) {
    if (table.target_semester != null && table.target_semester !== '') {
      prepared = assignElectiveTableToPreview(
        prepared,
        table.id,
        table.target_semester,
        existingEntries,
      )
    }
  }
  return prepared
}

async function loadSubjectCatalog() {
  const items = []
  const pageSize = 1000
  let offset = 0
  let count
  do {
    const page = await listSubjects({ limit: pageSize, offset })
    const rows = page?.items || []
    items.push(...rows)
    count = Number(page?.count) || items.length
    offset += rows.length
    if (rows.length < pageSize) break
  } while (offset < count)
  return { items, count }
}

export default function LibraryPage() {
  const [searchParams] = useSearchParams()
  const initialBranch = (searchParams.get('branch') || '').trim().toUpperCase()
  const initialSemester = (searchParams.get('semester') || '').trim()
  const [branches, setBranches] = useState([])
  const [branch, setBranch] = useState(initialBranch)
  const [semester, setSemester] = useState(initialSemester)
  const [entries, setEntries] = useState([])
  const [catalog, setCatalog] = useState([])
  const [catalogCount, setCatalogCount] = useState(0)
  const [sections, setSections] = useState(emptySections)
  const [revision, setRevision] = useState(0)
  const [source, setSource] = useState(null)
  const [inheritedFrom, setInheritedFrom] = useState(null)
  const [publication, setPublication] = useState(emptyPublication)
  const [draftDirty, setDraftDirty] = useState(false)
  const [addInputs, setAddInputs] = useState({})
  const [loading, setLoading] = useState(true)
  const [entryLoading, setEntryLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState('')
  const [entryQuery, setEntryQuery] = useState('')
  const [selectedSavedKeys, setSelectedSavedKeys] = useState(() => new Set())
  const [bulkBusy, setBulkBusy] = useState(false)

  const [pdfFile, setPdfFile] = useState(null)
  const [pdfBranch, setPdfBranch] = useState('')
  const [pdfBusy, setPdfBusy] = useState(false)
  const [pdfPreview, setPdfPreview] = useState(null)
  const [previewEditorKey, setPreviewEditorKey] = useState(null)
  const [previewAdd, setPreviewAdd] = useState({ kind: 'core', code: '' })
  const [openSavedBranches, setOpenSavedBranches] = useState(() => new Set())
  const entryRequest = useRef(0)
  const queryEntryOpened = useRef(false)

  const refresh = useCallback(async () => {
    const data = await listLibraryEntries({ limit: 500 })
    setEntries(data?.items || [])
  }, [])

  function applyEntry(item) {
    setSections(normalizeSections(item.sections))
    setRevision(item.revision || 0)
    setSource(item.source || null)
    setInheritedFrom(item.inherited_from || null)
    setPublication({
      status: item.status || 'draft',
      published: item.published === true,
      hasUnpublishedChanges: item.has_unpublished_changes === true,
      publishedRevision: item.published_revision || 0,
      publishedSubjectCount: item.published_subject_count || 0,
      publishedAt: item.published_at || null,
    })
    setDraftDirty(false)
  }

  function resetEntry() {
    setSections(emptySections())
    setRevision(0)
    setSource(null)
    setInheritedFrom(null)
    setPublication(emptyPublication())
    setDraftDirty(false)
  }

  useEffect(() => {
    let alive = true
    Promise.all([
      loadBatches(),
      listLibraryEntries({ limit: 500 }),
      loadSubjectCatalog(),
    ]).then(([years, libraryData, subjectData]) => {
      if (!alive) return
      setBranches(uniqueBranches(years))
      setEntries(libraryData?.items || [])
      setCatalog(subjectData?.items || [])
      setCatalogCount(subjectData?.count || 0)
    }).catch((err) => { if (alive) setError(err) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [])

  async function openEntry(nextBranch, nextSemester) {
    if (!nextBranch || !nextSemester) return
    const request = ++entryRequest.current
    setEntryLoading(true)
    setError(null)
    setNotice('')
    try {
      const item = await getLibraryEntry(nextBranch, Number(nextSemester))
      if (request !== entryRequest.current) return
      applyEntry(item)
    } catch (err) {
      if (request !== entryRequest.current) return
      if (err instanceof AdminAuthError && err.status === 404) {
        resetEntry()
      } else setError(err)
    } finally {
      if (request === entryRequest.current) setEntryLoading(false)
    }
  }

  useEffect(() => {
    if (loading || queryEntryOpened.current || !initialBranch || !initialSemester) return
    queryEntryOpened.current = true
    openEntry(initialBranch, initialSemester)
  }, [loading, initialBranch, initialSemester])

  const subjectByCode = useMemo(
    () => new Map(catalog.map((subject) => [subject.code, subject])),
    [catalog],
  )
  const usedCodes = useMemo(
    () => new Set(sections.flatMap((section) => section.subject_codes)),
    [sections],
  )
  const availableSectionKinds = SECTION_ORDER.slice(1).filter(
    (kind) => !sections.some((section) => section.kind === kind),
  )
  const catalogOptions = useMemo(() => catalog.map((subject) => ({
    value: subject.code,
    label: subject.name,
    hint: subject.code,
  })), [catalog])
  const configuredKey = branch && semester ? `${branch}:S${semester}` : ''
  const semesterOptions = semestersForBranch(branch)
  const selectedBranch = branches.find((item) => item.code === branch)
  const selectedSubjectCount = usedCodes.size
  const publicationStatus = draftDirty && publication.published
    ? 'changes_pending'
    : publication.status
  const publicationLabel = publicationStatus === 'published'
    ? 'Published'
    : publicationStatus === 'changes_pending' ? 'Unpublished changes' : 'Draft only'
  const publishedEntryCount = entries.filter((item) => item.published).length
  const visibleEntries = useMemo(() => {
    const query = entryQuery.trim().toUpperCase()
    if (!query) return entries
    return entries.filter((item) => {
      const branchName = branches.find((option) => option.code === item.branch)?.name || ''
      return item.key.toUpperCase().includes(query) || branchName.toUpperCase().includes(query)
    })
  }, [branches, entries, entryQuery])
  const savedEntryGroups = useMemo(() => {
    const grouped = new Map()
    for (const item of visibleEntries) {
      if (!grouped.has(item.branch)) grouped.set(item.branch, [])
      grouped.get(item.branch).push(item)
    }
    return [...grouped].map(([code, items]) => ({
      code,
      name: branches.find((option) => option.code === code)?.name || code,
      items: items.slice().sort((a, b) => a.semester - b.semester),
      subjectCount: items.reduce((sum, item) => sum + item.subject_count, 0),
    }))
  }, [branches, visibleEntries])
  const selectedSavedEntries = useMemo(
    () => entries.filter((item) => selectedSavedKeys.has(item.key)),
    [entries, selectedSavedKeys],
  )
  const selectedPublishableEntries = useMemo(
    () => selectedSavedEntries.filter((item) => item.status !== 'published' && item.subject_count > 0),
    [selectedSavedEntries],
  )
  const selectedPublishedEntries = useMemo(
    () => selectedSavedEntries.filter((item) => item.published),
    [selectedSavedEntries],
  )
  const selectedPreviewPlan = useMemo(
    () => (pdfPreview?.plan || []).filter((item) => item._selected !== false),
    [pdfPreview],
  )
  const previewCodes = useMemo(() => new Set(
    selectedPreviewPlan.flatMap((item) => (
      item.sections || []
    ).flatMap((section) => section.subject_codes || [])),
  ), [selectedPreviewPlan])
  const previewMissingSubjects = useMemo(() => (
    pdfPreview?.missing_subjects || []
  ).filter((subject) => previewCodes.has(subject.code)), [pdfPreview, previewCodes])
  const activePreviewItem = useMemo(() => (
    pdfPreview?.plan?.find((item) => item.key === previewEditorKey) || null
  ), [pdfPreview, previewEditorKey])
  const previewElectiveTables = pdfPreview?.elective_tables || []
  const pendingElectiveAssignments = previewElectiveTables.filter(
    (table) => table.target_semester == null || table.target_semester === '',
  ).length
  const importSemesterOptions = importSemestersForBranch(pdfBranch)

  function addSection(kind) {
    if (!kind || sections.some((section) => section.kind === kind)) return
    setSections((current) => [...current, { kind, subject_codes: [] }]
      .sort((a, b) => SECTION_ORDER.indexOf(a.kind) - SECTION_ORDER.indexOf(b.kind)))
    setDraftDirty(true)
  }

  async function removeSection(kind) {
    if (kind === 'core') return
    const section = sections.find((item) => item.kind === kind)
    if (section?.subject_codes.length && !await adminConfirm({
      title: `Remove ${SECTION_META[kind].label}?`,
      message: `This removes the section and its ${section.subject_codes.length} course${section.subject_codes.length === 1 ? '' : 's'} from the current draft.`,
      detail: 'The saved Library entry is unchanged until you save this draft.',
      confirmLabel: 'Remove section',
      tone: 'danger',
    })) return
    setSections((current) => current.filter((item) => item.kind !== kind))
    setDraftDirty(true)
  }

  function addCourse(kind, code) {
    if (!code || usedCodes.has(code)) return
    setSections((current) => current.map((section) => (
      section.kind === kind
        ? { ...section, subject_codes: [...section.subject_codes, code] }
        : section
    )))
    setAddInputs((current) => ({ ...current, [kind]: '' }))
    setDraftDirty(true)
  }

  function removeCourse(kind, code) {
    setSections((current) => current.map((section) => (
      section.kind === kind
        ? { ...section, subject_codes: section.subject_codes.filter((item) => item !== code) }
        : section
    )))
    setDraftDirty(true)
  }

  function toggleSavedBranch(code) {
    setOpenSavedBranches((current) => {
      const next = new Set(current)
      if (next.has(code)) next.delete(code)
      else next.add(code)
      return next
    })
  }

  function setSavedEntrySelected(key, selected) {
    setSelectedSavedKeys((current) => {
      const next = new Set(current)
      if (selected) next.add(key)
      else next.delete(key)
      return next
    })
  }

  function setSavedEntriesSelected(items, selected) {
    setSelectedSavedKeys((current) => {
      const next = new Set(current)
      for (const item of items) {
        if (selected) next.add(item.key)
        else next.delete(item.key)
      }
      return next
    })
  }

  async function runBulkLibraryAction(action, items) {
    if (!items.length || bulkBusy) return
    const confirmations = {
      publish: {
        title: `Publish ${items.length} Library entr${items.length === 1 ? 'y' : 'ies'}?`,
        message: 'Student timetables will immediately use the selected Library rules.',
        detail: 'Only the currently saved revisions are published.',
        confirmLabel: `Publish ${items.length}`,
        tone: 'primary',
      },
      unpublish: {
        title: `Unpublish ${items.length} Library entr${items.length === 1 ? 'y' : 'ies'}?`,
        message: 'Students will stop using these Library rules. The editable drafts remain saved.',
        confirmLabel: `Unpublish ${items.length}`,
        tone: 'warning',
      },
      delete: {
        title: `Delete ${items.length} Library entr${items.length === 1 ? 'y' : 'ies'}?`,
        message: 'This permanently removes the selected drafts and their published snapshots.',
        detail: 'This action cannot be undone.',
        confirmLabel: `Delete ${items.length}`,
        tone: 'danger',
      },
    }
    if (!await adminConfirm(confirmations[action])) return
    setBulkBusy(true)
    setError(null)
    setNotice('')
    try {
      const result = await bulkLibraryEntries({
        action,
        entries: items.map((item) => ({
          branch: item.branch,
          semester: item.semester,
          revision: item.revision,
        })),
      })
      const completedKeys = new Set((result.completed || []).map((item) => item.key))
      const failedKeys = new Set((result.errors || []).map((item) => item.key))
      setSelectedSavedKeys(failedKeys)
      if (action === 'delete' && completedKeys.has(configuredKey)) resetEntry()
      await refresh()
      if (action !== 'delete' && completedKeys.has(configuredKey) && branch && semester) {
        await openEntry(branch, Number(semester))
      }
      const verb = action === 'delete' ? 'Deleted' : action === 'publish' ? 'Published' : 'Unpublished'
      setNotice(`${verb} ${completedKeys.size} Library entr${completedKeys.size === 1 ? 'y' : 'ies'}.`)
      if (result.errors?.length) {
        setError(new Error(result.errors.map((item) => `${item.key}: ${item.error}`).join('; ')))
      }
    } catch (err) {
      setError(err)
    } finally {
      setBulkBusy(false)
    }
  }

  function updatePreviewItem(key, transform) {
    setPdfPreview((current) => current ? {
      ...current,
      plan: current.plan.map((item) => item.key === key ? transform(item) : item),
    } : current)
  }

  function movePreviewCourse(key, code, nextKind) {
    updatePreviewItem(key, (item) => {
      const sections = (item.sections || []).map((section) => ({
        ...section,
        subject_codes: (section.subject_codes || []).filter((value) => value !== code),
      }))
      const target = sections.find((section) => section.kind === nextKind)
      if (target) target.subject_codes.push(code)
      else sections.push({ kind: nextKind, subject_codes: [code] })
      sections.sort((a, b) => SECTION_ORDER.indexOf(a.kind) - SECTION_ORDER.indexOf(b.kind))
      return { ...item, sections }
    })
  }

  function removePreviewCourse(key, code) {
    updatePreviewItem(key, (item) => ({
      ...item,
      sections: (item.sections || []).map((section) => ({
        ...section,
        subject_codes: (section.subject_codes || []).filter((value) => value !== code),
      })),
    }))
  }

  function addPreviewCourse() {
    if (!activePreviewItem || !previewAdd.code || !subjectByCode.has(previewAdd.code)) return
    const alreadyUsed = (activePreviewItem.sections || []).some(
      (section) => (section.subject_codes || []).includes(previewAdd.code),
    )
    if (alreadyUsed) return
    movePreviewCourse(activePreviewItem.key, previewAdd.code, previewAdd.kind)
    setPreviewAdd((current) => ({ ...current, code: '' }))
  }

  function assignElectiveTable(tableId, rawTarget) {
    setPdfPreview((current) => assignElectiveTableToPreview(current, tableId, rawTarget, entries))
  }

  function setPreviewEntrySelected(key, selected) {
    setPdfPreview((current) => current ? {
      ...current,
      plan: current.plan.map((item) => item.key === key ? { ...item, _selected: selected } : item),
    } : current)
  }

  function setAllPreviewEntriesSelected(selected) {
    setPdfPreview((current) => current ? {
      ...current,
      plan: current.plan.map((item) => ({ ...item, _selected: selected })),
    } : current)
  }

  async function save() {
    if (!branch || !semester || saving || inheritedFrom) return
    setSaving(true)
    setError(null)
    setNotice('')
    try {
      const result = await saveLibraryEntry(branch, Number(semester), {
        sections,
        revision,
      })
      const item = result.item
      applyEntry(item)
      setNotice(`Saved draft ${item.key} with ${item.subject_count} subject${item.subject_count === 1 ? '' : 's'}. Student timetables were not changed.`)
      await refresh()
    } catch (err) {
      setError(err)
    } finally {
      setSaving(false)
    }
  }

  async function publish() {
    if (!branch || !semester || !revision || saving || inheritedFrom || draftDirty || selectedSubjectCount === 0) return
    const action = publication.published ? 'update the live curriculum' : 'activate Library rules for student timetables'
    if (!await adminConfirm({
      title: `Publish ${configuredKey}?`,
      message: `This will ${action}.`,
      detail: `Revision ${revision} becomes the active student-facing snapshot.`,
      confirmLabel: publication.published ? 'Update published copy' : 'Publish curriculum',
    })) return
    setSaving(true)
    setError(null)
    setNotice('')
    try {
      const result = await publishLibraryEntry(branch, Number(semester), { revision })
      applyEntry(result.item)
      setNotice(`Published ${result.item.key}. Student timetables and Library Fix checks now use revision ${result.item.published_revision}.`)
      await refresh()
    } catch (err) {
      setError(err)
    } finally {
      setSaving(false)
    }
  }

  async function removeEntry() {
    if (!revision || !await adminConfirm({
      title: `Delete ${configuredKey}?`,
      message: 'This permanently removes its editable draft and published snapshot.',
      detail: 'This action cannot be undone.',
      confirmLabel: 'Delete entry',
      tone: 'danger',
    })) return
    setSaving(true)
    setError(null)
    try {
      await deleteLibraryEntry(branch, Number(semester))
      resetEntry()
      setNotice(`Deleted ${configuredKey}.`)
      await refresh()
    } catch (err) {
      setError(err)
    } finally {
      setSaving(false)
    }
  }

  async function previewPdf(event) {
    event.preventDefault()
    if (!pdfFile || !pdfBranch || pdfBusy) return
    setPdfBusy(true)
    setError(null)
    setPdfPreview(null)
    try {
      const preview = await previewLibraryScheme({ file: pdfFile, branch: pdfBranch })
      setPdfPreview(preparePdfPreview(preview, entries))
    } catch (err) {
      setError(err)
    } finally {
      setPdfBusy(false)
    }
  }

  async function addMissingSubjects() {
    const missing = previewMissingSubjects
    if (!missing.length || pdfBusy) return
    setPdfBusy(true)
    setError(null)
    try {
      for (const item of missing) {
        await addSubject({ code: item.code, name: item.title || item.code, note: `Added from ${pdfPreview.source}` })
      }
      const subjectData = await loadSubjectCatalog()
      setCatalog(subjectData?.items || [])
      setCatalogCount(subjectData?.count || 0)
      const addedCodes = new Set(missing.map((item) => item.code))
      setPdfPreview((current) => ({
        ...current,
        missing_subjects: (current.missing_subjects || []).filter((item) => !addedCodes.has(item.code)),
      }))
    } catch (err) {
      setError(err)
    } finally {
      setPdfBusy(false)
    }
  }

  async function applyPdf() {
    if (!selectedPreviewPlan.length || previewMissingSubjects.length || pendingElectiveAssignments || pdfBusy) return
    const overwriteCount = selectedPreviewPlan.filter((item) => item.would_overwrite).length
    if (overwriteCount > 0 && !await adminConfirm({
      title: `Replace ${overwriteCount} existing entr${overwriteCount === 1 ? 'y' : 'ies'}?`,
      message: 'The selected PDF semesters will replace those saved Library drafts.',
      detail: 'Published snapshots remain active until you explicitly publish the imported drafts.',
      confirmLabel: 'Replace drafts',
      tone: 'warning',
    })) return
    setPdfBusy(true)
    setError(null)
    try {
      const cleanPlan = selectedPreviewPlan.map((item) => ({
        key: item.key,
        branch: item.branch,
        semester: item.semester,
        sections: item.sections,
      }))
      const result = await applyLibraryScheme({ plan: cleanPlan, source: pdfPreview.source })
      if (result.errors?.length) throw new Error(result.errors.map((row) => `${row.key || row.index}: ${row.error}`).join('; '))
      setNotice(`Imported ${result.written.length} Library draft${result.written.length === 1 ? '' : 's'}. Review and publish each entry when ready.`)
      setPdfPreview(null)
      setPreviewEditorKey(null)
      setPdfFile(null)
      await refresh()
    } catch (err) {
      setError(err)
    } finally {
      setPdfBusy(false)
    }
  }

  return (
    <div className="admin-page library-page">
      <header className="library-hero">
        <div>
          <span className="library-eyebrow">Academic setup</span>
          <h1 className="admin-page-title">Curriculum Library</h1>
          <p className="admin-page-sub">Build and review the subject structure students follow.</p>
        </div>
        <div className="library-hero-stats" aria-label="Library summary">
          <div><strong>{entries.length}</strong><span>curricula</span></div>
          <div><strong>{publishedEntryCount}</strong><span>published</span></div>
          <div><strong>{catalogCount}</strong><span>catalog subjects</span></div>
        </div>
      </header>

      <nav className="library-jump-nav" aria-label="Library page sections">
        <a href="#library-editor">Curriculum editor</a>
        <a href="#library-import">PDF import</a>
        <a href="#library-saved">Saved entries</a>
      </nav>

      {error && <div className="fix-error" role="alert">{messageOf(error)}</div>}
      {notice && <div className="teacher-visibility-notice" role="status">{notice}</div>}

      <section className="admin-card library-picker-card" id="library-editor">
        <div className="library-picker-intro">
          <span className="library-step">01</span>
          <div>
            <h2>Choose a curriculum</h2>
            <p>Select a branch and its student-facing semester to start editing.</p>
          </div>
        </div>
        <div className="library-picker-fields">
          <label>
            <span>Branch</span>
            <select
              value={branch}
              onChange={(event) => {
                const value = event.target.value
                setBranch(value)
                const semesterInvalid = semester && !semestersForBranch(value).includes(Number(semester))
                if (!value) {
                  entryRequest.current += 1
                  setSemester('')
                  resetEntry()
                } else if (semesterInvalid) {
                  entryRequest.current += 1
                  setSemester('')
                  resetEntry()
                } else if (semester) openEntry(value, semester)
              }}
              disabled={loading}
            >
              <option value="">Select branch…</option>
              {branches.map((item) => <option key={item.code} value={item.code}>{item.code} — {item.name}</option>)}
            </select>
            <small>{branch ? semesterRuleForBranch(branch) : 'Pool choices are listed first'}</small>
          </label>
          <label>
            <span>Semester</span>
            <select
              value={semester}
              onChange={(event) => {
                const value = event.target.value
                setSemester(value)
                if (!value) {
                  entryRequest.current += 1
                  resetEntry()
                } else openEntry(branch, value)
              }}
              disabled={!branch}
            >
              <option value="">Select semester…</option>
              {semesterOptions.map((value) => (
                <option key={value} value={String(value)}>Semester {value}</option>
              ))}
            </select>
            <small>{branch ? `${semesterOptions.length} semester${semesterOptions.length === 1 ? '' : 's'} available` : 'Choose a branch first'}</small>
          </label>
          <div className="library-key-preview">
            <span>Active key</span>
            <code>{configuredKey || 'Not selected'}</code>
            <small>{selectedBranch?.name || 'Select a curriculum to continue'}</small>
          </div>
        </div>
      </section>

      {!configuredKey && (
        <section className="library-empty-editor" aria-label="No curriculum selected">
          <div className="library-empty-mark" aria-hidden="true">LIB</div>
          <div>
            <h2>Your curriculum workspace will appear here</h2>
            <p>Choose a branch and semester above, or open one of the saved entries below.</p>
          </div>
        </section>
      )}

      {configuredKey && (
        <section className="library-editor library-workspace">
          <div className="library-editor-heading">
            <div>
              <span className="library-workspace-label">Editing curriculum</span>
              <h2>{selectedBranch?.name || branch} <small>· Semester {semester}</small></h2>
              <p>
                {inheritedFrom
                  ? `Automatically inherited from ${inheritedFrom}`
                  : revision ? `Draft revision ${revision}${source ? ` · imported from ${source}` : ''}` : 'New Library draft'}
              </p>
              {!inheritedFrom && (
                <div className={`library-publication-status library-publication-status--${publicationStatus}`}>
                  <strong>{publicationLabel}</strong>
                  <span>
                    {publication.published
                      ? `Live revision ${publication.publishedRevision} · ${publication.publishedSubjectCount} subjects`
                      : 'Student timetables continue using the original parser output'}
                  </span>
                </div>
              )}
            </div>
            <div className="library-editor-summary" aria-label="Current curriculum summary">
              <span><strong>{selectedSubjectCount}</strong> subjects</span>
              <span><strong>{sections.length}</strong> sections</span>
              <code>{configuredKey}</code>
            </div>
            <div className="library-editor-actions">
              {!inheritedFrom && revision > 0 && <button type="button" className="library-danger" onClick={removeEntry} disabled={saving}>Delete</button>}
              {!inheritedFrom && (
                <button type="button" className="upload-btn" onClick={save} disabled={saving || entryLoading}>
                  {saving ? 'Saving…' : revision ? 'Save draft' : 'Create draft'}
                </button>
              )}
              {!inheritedFrom && revision > 0 && (
                <button
                  type="button"
                  className="library-publish"
                  onClick={publish}
                  disabled={saving || entryLoading || draftDirty || selectedSubjectCount === 0 || (publication.published && !publication.hasUnpublishedChanges)}
                  title={draftDirty ? 'Save the draft before publishing' : selectedSubjectCount === 0 ? 'Add at least one subject before publishing' : ''}
                >
                  {publication.published && !publication.hasUnpublishedChanges ? 'Published' : publication.published ? 'Publish update' : 'Publish'}
                </button>
              )}
              {inheritedFrom && <span className="library-inherited-badge">Inherited · read only</span>}
            </div>
          </div>

          <div className="library-section-grid">
            {entryLoading ? <div className="admin-card library-editor-loading">Loading curriculum…</div> : sections.map((section) => {
              const meta = SECTION_META[section.kind]
              const options = catalogOptions.filter((option) => !usedCodes.has(option.value))
              return (
                <article className={`admin-card library-section library-section--${section.kind}`} key={section.kind}>
                <header className="library-section-header">
                  <div>
                    <div className="library-section-title-row">
                      <h3>{meta.label}</h3>
                      {section.kind === 'core' && <span className="library-permanent">Permanent</span>}
                      <span className="library-section-count">{section.subject_codes.length}</span>
                    </div>
                    <p>{meta.description}</p>
                  </div>
                  {section.kind !== 'core' && !inheritedFrom && (
                    <button type="button" className="admin-card-action library-remove-section" onClick={() => removeSection(section.kind)}>Remove section</button>
                  )}
                </header>

                {!inheritedFrom && <div className="library-add-course">
                  <Combobox
                    value={addInputs[section.kind] || ''}
                    onChange={(value) => {
                      setAddInputs((current) => ({ ...current, [section.kind]: value }))
                      if (subjectByCode.has(value) && !usedCodes.has(value)) addCourse(section.kind, value)
                    }}
                    options={options}
                    placeholder="Search catalog by code or subject name…"
                    ariaLabel={`Add a subject to ${meta.label}`}
                  />
                </div>}

                {section.subject_codes.length === 0 ? (
                  <div className="library-empty-section">
                    {inheritedFrom ? 'No subjects configured in the inherited curriculum.' : 'No subjects yet. Use the catalog search above to add one.'}
                  </div>
                ) : (
                  <div className="library-course-list">
                    {section.subject_codes.map((code) => {
                      const subject = subjectByCode.get(code)
                      return (
                        <div className="library-course" key={code}>
                          <code>{code}</code>
                          <span>{subject?.name || 'Catalog subject unavailable'}</span>
                          {!inheritedFrom && <button type="button" onClick={() => removeCourse(section.kind, code)} aria-label={`Remove ${code}`}>×</button>}
                        </div>
                      )
                    })}
                  </div>
                )}
                </article>
              )
            })}
          </div>

          {!entryLoading && !inheritedFrom && availableSectionKinds.length > 0 && (
            <div className="library-add-sections">
              <span>Add an elective section</span>
              {availableSectionKinds.map((kind) => (
                <button type="button" key={kind} onClick={() => addSection(kind)}>+ {SECTION_META[kind].label}</button>
              ))}
            </div>
          )}
        </section>
      )}

      <div className="library-tools-grid">
        <section className="admin-card library-import-card" id="library-import">
        <div className="library-tool-heading">
          <span className="library-step library-step--muted">02</span>
          <div>
            <h2 className="admin-card-title">Import from PDF</h2>
            <p className="admin-card-sub">Preview a course scheme and save it as a draft. Imports never publish automatically.</p>
          </div>
        </div>
        <form className="library-import-form" onSubmit={previewPdf}>
          <select value={pdfBranch} onChange={(event) => setPdfBranch(event.target.value)}>
            <option value="">Target branch…</option>
            <option value="POOL">Pool A/B year-one rotation</option>
            {branches.filter((item) => /^[A-Z]$/.test(item.code)).map((item) => (
              <option key={item.code} value={item.code}>{item.code} — {item.name}</option>
            ))}
          </select>
          <input type="file" accept="application/pdf,.pdf" onChange={(event) => setPdfFile(event.target.files?.[0] || null)} />
          <button className="upload-btn" type="submit" disabled={!pdfFile || !pdfBranch || pdfBusy}>{pdfBusy ? 'Parsing…' : 'Preview import'}</button>
        </form>

        {pdfPreview && (
          <div className="library-import-preview">
            <div className="library-import-summary">
              <strong>{selectedPreviewPlan.length} of {pdfPreview.plan.length} semesters selected</strong>
              <span>{pdfPreview.source}</span>
              <span>{previewMissingSubjects.length} missing catalog subjects</span>
              {previewElectiveTables.length > 0 && (
                <span>{previewElectiveTables.length} standalone elective table{previewElectiveTables.length === 1 ? '' : 's'}</span>
              )}
            </div>
            {previewElectiveTables.length > 0 && (
              <div className="library-elective-table-assignments">
                <div className="library-elective-table-intro">
                  <div>
                    <strong>Assign standalone elective tables</strong>
                    <span>These PDF tables have an elective heading but no semester heading.</span>
                  </div>
                  <small>{pendingElectiveAssignments} awaiting assignment</small>
                </div>
                <div className="library-elective-table-grid">
                  {previewElectiveTables.map((table) => (
                    <article key={table.id} data-pending={table.target_semester == null || undefined}>
                      <div>
                        <span className="library-elective-table-section">{SECTION_META[table.section]?.label || table.label}</span>
                        <strong>{table.subject_count} courses</strong>
                        <small>Page {table.page || '—'} · {(table.extracted_courses || []).slice(0, 3).map((course) => course.code).join(', ')}{table.subject_count > 3 ? '…' : ''}</small>
                      </div>
                      <label>
                        <span>Add to</span>
                        <select
                          value={table.target_semester ?? ''}
                          onChange={(event) => assignElectiveTable(table.id, event.target.value)}
                          aria-label={`Choose semester for ${table.label}`}
                        >
                          <option value="">Choose semester…</option>
                          {importSemesterOptions.map((value) => (
                            <option value={value} key={value}>Semester {value}</option>
                          ))}
                          <option value="skip">Do not import this table</option>
                        </select>
                      </label>
                    </article>
                  ))}
                </div>
              </div>
            )}
            <div className="library-import-plan-head">
              <div>
                <strong>Choose semesters to import</strong>
                <span>Only checked semesters will be saved as drafts.</span>
              </div>
              <div>
                <button type="button" onClick={() => setAllPreviewEntriesSelected(true)}>Select all</button>
                <button type="button" onClick={() => setAllPreviewEntriesSelected(false)}>Clear</button>
              </div>
            </div>
            <div className="library-import-plan">
              {pdfPreview.plan.map((item) => {
                const selected = item._selected !== false
                return (
                  <article className="library-import-plan-item" data-selected={selected || undefined} key={item.key}>
                    <header>
                      <code>{item.key}</code>
                      <label className="library-import-plan-toggle">
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={(event) => setPreviewEntrySelected(item.key, event.target.checked)}
                        />
                        <span aria-hidden="true" />
                        <em>{selected ? 'Included' : 'Excluded'}</em>
                      </label>
                    </header>
                    <button
                      type="button"
                      onClick={() => {
                        setPreviewEditorKey(item.key)
                        setPreviewAdd({ kind: 'core', code: '' })
                      }}
                    >
                      <span>{item.sections.reduce((sum, section) => sum + section.subject_codes.length, 0)} subjects</span>
                      {item.would_overwrite && <small className="library-overwrite">Replaces existing entry with {item.existing_subject_count} subjects</small>}
                      <small>Review courses and edit sections →</small>
                    </button>
                  </article>
                )
              })}
            </div>
            {previewMissingSubjects.length > 0 && (
              <div className="library-missing">
                <strong>Missing from Catalog</strong>
                <p>{previewMissingSubjects.map((item) => item.code).join(', ')}</p>
                <button type="button" onClick={addMissingSubjects} disabled={pdfBusy}>Add missing subjects to Catalog</button>
              </div>
            )}
            <div className="library-import-actions">
              <button type="button" onClick={() => { setPdfPreview(null); setPreviewEditorKey(null) }} disabled={pdfBusy}>Cancel preview</button>
              <button className="upload-btn" type="button" onClick={applyPdf} disabled={pdfBusy || !selectedPreviewPlan.length || previewMissingSubjects.length > 0 || pendingElectiveAssignments > 0}>Save {selectedPreviewPlan.length || ''} as drafts</button>
            </div>
          </div>
        )}
        </section>

        <section className="admin-card library-configured-card" id="library-saved">
        <div className="admin-card-header library-saved-header">
          <div className="library-tool-heading">
            <span className="library-step library-step--muted">03</span>
            <div>
              <h2 className="admin-card-title">Saved entries</h2>
              <p className="admin-card-sub">Jump back into a configured curriculum.</p>
            </div>
          </div>
          <button type="button" className="admin-card-action" onClick={() => refresh().catch(setError)}>Refresh</button>
        </div>
        {entries.length > 0 && (
          <>
            <label className="library-entry-search">
              <svg className="library-search-icon" aria-hidden="true" viewBox="0 0 20 20" fill="none">
                <circle cx="8.5" cy="8.5" r="5.5" stroke="currentColor" strokeWidth="1.5" />
                <path d="m12.5 12.5 4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              <input
                type="search"
                value={entryQuery}
                onChange={(event) => setEntryQuery(event.target.value)}
                placeholder="Search key or branch…"
                aria-label="Search saved Library entries"
              />
              <small>{visibleEntries.length} of {entries.length}</small>
            </label>
            <div className="library-bulk-toolbar">
              <div>
                <strong>{selectedSavedEntries.length} selected</strong>
                <button type="button" onClick={() => setSavedEntriesSelected(visibleEntries, true)} disabled={bulkBusy || !visibleEntries.length}>Select shown</button>
                <button type="button" onClick={() => setSelectedSavedKeys(new Set())} disabled={bulkBusy || !selectedSavedEntries.length}>Clear</button>
              </div>
              <div>
                <button type="button" onClick={() => runBulkLibraryAction('publish', selectedPublishableEntries)} disabled={bulkBusy || !selectedPublishableEntries.length}>Publish {selectedPublishableEntries.length || ''}</button>
                <button type="button" onClick={() => runBulkLibraryAction('unpublish', selectedPublishedEntries)} disabled={bulkBusy || !selectedPublishedEntries.length}>Unpublish {selectedPublishedEntries.length || ''}</button>
                <button type="button" className="is-danger" onClick={() => runBulkLibraryAction('delete', selectedSavedEntries)} disabled={bulkBusy || !selectedSavedEntries.length}>Delete {selectedSavedEntries.length || ''}</button>
              </div>
            </div>
          </>
        )}
        {entries.length === 0 ? <div className="manager-empty">No Library entries configured yet.</div> : visibleEntries.length === 0 ? (
          <div className="manager-empty">No saved entries match “{entryQuery}”.</div>
        ) : (
          <div className="library-entry-stacks">
            {savedEntryGroups.map((group) => {
              const isOpen = Boolean(entryQuery.trim()) || openSavedBranches.has(group.code) || group.code === branch
              const selectedInGroup = group.items.filter((item) => selectedSavedKeys.has(item.key)).length
              const groupSelected = selectedInGroup === group.items.length
              return (
                <section className={`library-entry-stack${isOpen ? ' is-open' : ''}`} key={group.code}>
                  <header className="library-entry-stack-head">
                    <label className="library-saved-select" title={`Select all ${group.code} entries`}>
                      <input
                        type="checkbox"
                        checked={groupSelected}
                        onChange={(event) => setSavedEntriesSelected(group.items, event.target.checked)}
                      />
                      <span aria-hidden="true" />
                    </label>
                    <button
                      type="button"
                      onClick={() => toggleSavedBranch(group.code)}
                      aria-expanded={isOpen}
                    >
                      <span className="library-entry-stack-caret">›</span>
                      <span>
                        <strong>{group.code}</strong>
                        <small>{group.name}</small>
                      </span>
                      <span className="library-entry-stack-meta">
                        {selectedInGroup ? `${selectedInGroup} selected · ` : ''}{group.items.length} semester{group.items.length === 1 ? '' : 's'} · {group.subjectCount} subjects
                      </span>
                    </button>
                  </header>
                  {isOpen && (
                    <div className="library-entry-grid">
                      {group.items.map((item) => {
                        const isSelected = selectedSavedKeys.has(item.key)
                        return (
                          <article className={`library-entry-item${configuredKey === item.key ? ' is-active' : ''}`} data-selected={isSelected || undefined} key={item.key}>
                            <header>
                              <label className="library-saved-select">
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={(event) => setSavedEntrySelected(item.key, event.target.checked)}
                                />
                                <span aria-hidden="true" />
                                <code>Semester {item.semester}</code>
                              </label>
                              <em className={`library-entry-status library-entry-status--${item.status || 'draft'}`}>
                                {item.status === 'published' ? 'Published' : item.status === 'changes_pending' ? 'Unpublished changes' : 'Draft'}
                              </em>
                            </header>
                            <button
                              type="button"
                              onClick={() => { setBranch(item.branch); setSemester(String(item.semester)); openEntry(item.branch, item.semester); document.getElementById('library-editor')?.scrollIntoView({ behavior: 'smooth' }) }}
                            >
                              <span>{item.subject_count} subjects</span>
                              <small>{item.sections.length} sections · revision {item.revision}</small>
                              <small>Open curriculum →</small>
                            </button>
                          </article>
                        )
                      })}
                    </div>
                  )}
                </section>
              )
            })}
          </div>
        )}
        </section>
      </div>
      {activePreviewItem && (
        <PreviewEntryModal
          item={activePreviewItem}
          catalogOptions={catalogOptions}
          subjectByCode={subjectByCode}
          previewAdd={previewAdd}
          setPreviewAdd={setPreviewAdd}
          onAdd={addPreviewCourse}
          onMove={(code, kind) => movePreviewCourse(activePreviewItem.key, code, kind)}
          onRemove={(code) => removePreviewCourse(activePreviewItem.key, code)}
          onClose={() => setPreviewEditorKey(null)}
        />
      )}
    </div>
  )
}

function PreviewEntryModal({
  item,
  catalogOptions,
  subjectByCode,
  previewAdd,
  setPreviewAdd,
  onAdd,
  onMove,
  onRemove,
  onClose,
}) {
  const usedCodes = new Set(
    (item.sections || []).flatMap((section) => section.subject_codes || []),
  )
  const extractedByCode = new Map(
    (item.extracted_courses || [])
      .filter((course) => course.code)
      .map((course) => [course.code, course]),
  )
  const extractedLabels = (item.extracted_courses || []).filter((course) => !course.code)
  const addOptions = catalogOptions.filter((option) => !usedCodes.has(option.value))
  const previewSections = item.sections || []
  const hasElectiveSection = previewSections.some(
    (section) => section.kind !== 'core' && (section.subject_codes || []).length > 0,
  )
  const compactLayout = !hasElectiveSection

  return (
    <div className="library-preview-modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="library-preview-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="library-preview-title"
        data-layout={compactLayout ? 'compact' : 'expanded'}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="library-preview-modal-head">
          <div>
            <span>PDF extraction</span>
            <h2 id="library-preview-title">{item.key}</h2>
            <p>Review the extracted courses and correct their Library sections before applying.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close preview editor">×</button>
        </header>

        <div className="library-preview-modal-scroll">
          <div className="library-preview-modal-summary">
            <span><strong>{usedCodes.size}</strong> courses</span>
            <span><strong>{previewSections.length}</strong> sections</span>
            {item.would_overwrite && <span className="is-warning">Will replace {item.existing_subject_count} saved courses</span>}
          </div>

          <div className="library-preview-sections" data-layout={compactLayout ? 'single' : 'grid'}>
            {previewSections.map((section) => (
              <article key={section.kind}>
                <header>
                  <strong>{SECTION_META[section.kind]?.label || section.kind}</strong>
                  <span>{(section.subject_codes || []).length}</span>
                </header>
                {(section.subject_codes || []).length === 0 ? (
                  <p className="library-preview-empty">No extracted courses in this section.</p>
                ) : (
                  <div className="library-preview-course-list">
                    {section.subject_codes.map((code) => {
                      const extracted = extractedByCode.get(code)
                      const subject = subjectByCode.get(code)
                      return (
                        <div className="library-preview-course" key={code}>
                          <div>
                            <code>{code}</code>
                            <span>{subject?.name || extracted?.title || 'Not found in Subject Catalog'}</span>
                            {extracted?.category && <small>PDF category: {extracted.category}</small>}
                            {extracted?.credits && <small>Credits: {extracted.credits}</small>}
                          </div>
                          <select
                            value={section.kind}
                            onChange={(event) => onMove(code, event.target.value)}
                            aria-label={`Move ${code} to another section`}
                          >
                            {SECTION_ORDER.map((kind) => (
                              <option value={kind} key={kind}>{SECTION_META[kind].label}</option>
                            ))}
                          </select>
                          <button type="button" onClick={() => onRemove(code)} aria-label={`Remove ${code}`}>×</button>
                        </div>
                      )
                    })}
                  </div>
                )}
              </article>
            ))}
          </div>

          {extractedLabels.length > 0 && (
            <div className="library-preview-labels">
              <strong>Detected section labels</strong>
              {extractedLabels.map((course, index) => (
                <span key={`${course.title}:${index}`}>
                  {course.title} → {SECTION_META[course.section]?.label || course.section}
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="library-preview-add">
          <div>
            <strong>Add a catalog course</strong>
            <span>Use this if the PDF missed a row or extracted the wrong code.</span>
          </div>
          <select
            value={previewAdd.kind}
            onChange={(event) => setPreviewAdd((current) => ({ ...current, kind: event.target.value }))}
          >
            {SECTION_ORDER.map((kind) => <option value={kind} key={kind}>{SECTION_META[kind].label}</option>)}
          </select>
          <Combobox
            value={previewAdd.code}
            onChange={(value) => setPreviewAdd((current) => ({ ...current, code: value }))}
            options={addOptions}
            placeholder="Search Subject Catalog…"
            ariaLabel="Add a course to this preview"
            direction="up"
          />
          <button type="button" onClick={onAdd} disabled={!subjectByCode.has(previewAdd.code)}>Add course</button>
        </div>

        <footer className="library-preview-modal-foot">
          <span>Changes update this preview only until you apply the import.</span>
          <button type="button" className="upload-btn" onClick={onClose}>Done</button>
        </footer>
      </section>
    </div>
  )
}
