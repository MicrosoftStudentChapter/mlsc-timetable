import { useState, useRef, useMemo, useEffect, useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'
import './TimetableGrid.css'

// ─── Initial timetable data (IDs injected for stable React keys) ──────────────
const RAW_DATA = [
  // Monday
  { day: 'Monday',    startTime: '09:40', endTime: '10:30', subject: 'PHYSICS',                                  room: 'G310 LAB-2', code: 'UPH013P', type: 'Practical' },
  { day: 'Monday',    startTime: '10:30', endTime: '11:20', subject: 'PHYSICS',                                  room: 'G310 LAB-2', code: 'UPH013P', type: 'Practical' },
  { day: 'Monday',    startTime: '11:20', endTime: '12:10', subject: 'MANUFACTURING PROCESSES',                  room: 'W/SHOP LAB', code: 'UES102P', type: 'Practical' },
  { day: 'Monday',    startTime: '12:10', endTime: '13:00', subject: 'MANUFACTURING PROCESSES',                  room: 'W/SHOP LAB', code: 'UES102P', type: 'Practical' },
  { day: 'Monday',  startTime: '13:50', endTime: '14:40', subject: 'ENGINEERING DRAWING',                      room: 'LP101',      code: 'UES101L', type: 'Lecture'   },
  { day: 'Monday',    startTime: '14:40', endTime: '15:30', subject: 'PROFESSIONAL COMMUNICATION',               room: 'LP101',      code: 'UHU003L', type: 'Lecture'   },
  { day: 'Monday',    startTime: '15:30', endTime: '16:20', subject: 'MANUFACTURING PROCESSES',                  room: 'LP101',      code: 'UES102L', type: 'Lecture'   },
  { day: 'Monday',    startTime: '16:20', endTime: '17:10', subject: 'PHYSICS',                                  room: 'LP101',      code: 'UPH013L', type: 'Lecture'   },
  // Tuesday
  { day: 'Tuesday',   startTime: '09:40', endTime: '10:30', subject: 'PROFESSIONAL COMMUNICATION',               room: 'C309 LAB',   code: 'UHU003P', type: 'Practical' },
  { day: 'Tuesday',   startTime: '10:30', endTime: '11:20', subject: 'PROFESSIONAL COMMUNICATION',               room: 'C309 LAB',   code: 'UHU003P', type: 'Practical' },
  // Wednesday
  { day: 'Wednesday', startTime: '09:40', endTime: '10:30', subject: 'DIFFERENTIAL EQUATION AND LINEAR ALGEBRA', room: 'LP101',      code: 'UMA023L', type: 'Lecture'   },
  { day: 'Wednesday', startTime: '10:30', endTime: '11:20', subject: 'PHYSICS',                                  room: 'LP101',      code: 'UPH013L', type: 'Lecture'   },
  { day: 'Wednesday', startTime: '11:20', endTime: '12:10', subject: 'ENGINEERING DRAWING',                      room: 'LP101',      code: 'UES101L', type: 'Lecture'   },
  { day: 'Wednesday', startTime: '12:10', endTime: '13:00', subject: 'PROFESSIONAL COMMUNICATION',               room: 'LP101',      code: 'UPH013L', type: 'Lecture'   },
  { day: 'Wednesday', startTime: '13:00', endTime: '13:50', subject: 'PHYSICS', room: 'LP101',      code: 'UMA023L', type: 'Lecture'   },
  // Thursday
  { day: 'Thursday',  startTime: '08:00', endTime: '08:50', subject: 'DIFFERENTIAL EQUATION AND LINEAR ALGEBRA', room: 'F308',       code: 'UMA023T', type: 'Tutorial'  },
  { day: 'Thursday',  startTime: '08:50', endTime: '09:40', subject: 'PHYSICS',                                  room: 'F308',       code: 'UPH013T', type: 'Tutorial'  },
  { day: 'Thursday',  startTime: '10:30', endTime: '11:20', subject: 'MANUFACTURING PROCESSES',                  room: 'LP101',      code: 'UES102L', type: 'Lecture'   },
  { day: 'Thursday',  startTime: '11:20', endTime: '12:10', subject: 'ENGINEERING DRAWING',                      room: 'LP101',      code: 'UES101L', type: 'Lecture'   },
  { day: 'Thursday',  startTime: '12:10', endTime: '13:00', subject: 'DIFFERENTIAL EQUATION AND LINEAR ALGEBRA', room: 'LP101',      code: 'UMA023L', type: 'Lecture'   },
  // Friday
  { day: 'Friday',    startTime: '08:00', endTime: '08:50', subject: 'ENGINEERING DRAWING',                      room: 'F310',       code: 'UES101T', type: 'Tutorial'  },
  { day: 'Friday',    startTime: '08:50', endTime: '09:40', subject: 'ENGINEERING DRAWING',                      room: 'F310',       code: 'UES101T', type: 'Tutorial'  },
  { day: 'Friday',    startTime: '09:40', endTime: '10:30', subject: 'PHYSICS',                                  room: 'LP101',      code: 'UPH013L', type: 'Lecture'   },
  { day: 'Friday',    startTime: '10:30', endTime: '11:20', subject: 'DIFFERENTIAL EQUATION AND LINEAR ALGEBRA', room: 'LP101',      code: 'UMA023L', type: 'Lecture'   },
  { day: 'Friday',    startTime: '11:20', endTime: '12:10', subject: 'ENGINEERING DRAWING',                      room: 'CAD-1 LAB',  code: 'UES101P', type: 'Practical' },
  { day: 'Friday',    startTime: '12:10', endTime: '13:00', subject: 'ENGINEERING DRAWING',                      room: 'CAD-1 LAB',  code: 'UES101P', type: 'Practical' },
  
]

// Assign stable entry IDs
const ID_DATA = RAW_DATA.map((e, i) => ({ ...e, id: `entry-${i}` }))

// ─── Assign pairIds to initial practical pairs (sequential grouping) ──────────
// For each day, walk slots in chronological order, collect matching consecutive
// practicals, and pair them (1,2), (3,4), (5,6) … with the same pairId.
let _pairCounter = 0
function genPairId() { return `pair-${++_pairCounter}` }

const INITIAL_DATA = (() => {
  // Build a mutable copy keyed by id so we can stamp pairId without mutation
  const byId = Object.fromEntries(ID_DATA.map(e => [e.id, { ...e }]))

  for (const day of ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']) {
    // Walk TIME_SLOTS in order; collect all practicals for this day in slot order
    const dayPracticals = ['08:00','08:50','09:40','10:30','11:20','12:10','13:00','13:50','14:40','15:30','16:20','17:10']
      .flatMap(slot => ID_DATA.filter(e => e.day === day && e.startTime === slot && e.type === 'Practical'))

    // Sequential grouping: scan runs of consecutive, matching practicals
    // and assign pairIds in pairs (1,2), (3,4) …
    let i = 0
    while (i < dayPracticals.length) {
      const cur  = dayPracticals[i]
      const next = dayPracticals[i + 1]

      // Check if cur and next are truly consecutive slots with matching fields
      const curSlotIdx  = ['08:00','08:50','09:40','10:30','11:20','12:10','13:00','13:50','14:40','15:30','16:20','17:10'].indexOf(cur.startTime)
      const nextIsConsecutive = next &&
        ['08:00','08:50','09:40','10:30','11:20','12:10','13:00','13:50','14:40','15:30','16:20','17:10'][curSlotIdx + 1] === next.startTime &&
        next.subject === cur.subject &&
        next.code    === cur.code    &&
        next.room    === cur.room

      if (nextIsConsecutive) {
        const pid = genPairId()
        byId[cur.id].pairId  = pid
        byId[next.id].pairId = pid
        i += 2  // consume both members of the pair
      } else {
        // unpaired practical — no pairId
        i += 1
      }
    }
  }

  return Object.values(byId)
})()

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']

// Time slots — hardcoded chronological list of the 12 time slots
const TIME_SLOTS = [
  '08:00',
  '08:50',
  '09:40',
  '10:30',
  '11:20',
  '12:10',
  '13:00',
  '13:50',
  '14:40',
  '15:30',
  '16:20',
  '17:10'
]

// Start times only (all 12 slots are start times of classes)
const START_TIMES = TIME_SLOTS

// ─── Type palette ─────────────────────────────────────────────────────────────
const LIGHT_TYPE_META = {
  Lecture: {
    color: '#195484cb',
    bg: 'rgba(76, 149, 222, 0.26)',
    badgeBg: 'rgba(75, 121, 166, 0.2)',
    label: 'Lecture',
  },
  Tutorial: {
    color: '#7B61FF',
    bg: 'rgba(160, 141, 253, 0.18)',
    badgeBg: 'rgba(123, 97, 255, 0.24)',
    badgeColor: '#6B46FF',
    borderLeft: '4px solid #8871faff',
    label: 'Tutorial',
  },
  Practical: {
    color: '#000f0fd9',
    bg: 'rgba(127, 142, 149, 0.32)',
    badgeBg: 'rgba(232, 240, 244, 0.59)',
    label: 'Practical',
  },
}

const DARK_TYPE_META = {
  Lecture: {
    color: '#3B82F6',
    bg: 'rgba(59, 131, 246, 0.47)',
    badgeBg: 'rgba(59, 131, 246, 0.52)',
    badgeColor: '#b3c9e5ff',
    borderLeft: '3px solid #3B82F6',
    editHoverBg: 'rgba(59, 130, 246, 0.3)',
    editHoverColor: '#60A5FA',
    label: 'Lecture',
  },
  Tutorial: {
    color: '#8B5CF6',
    bg: 'rgba(69, 53, 109, 0.93)',
    badgeBg: 'rgba(144, 131, 173, 1)',
    badgeColor: '#322a48ff',
    borderLeft: '3px solid #b6aad3ff',
    editHoverBg: 'rgba(139, 92, 246, 0.3)',
    editHoverColor: '#a78bfa',
    label: 'Tutorial',
  },
  Practical: {
    color: '#54849cff',
    bg: 'rgba(126, 148, 159, 0.96)',
    badgeBg: 'rgba(88, 99, 104, 0.97)',
    badgeColor: '#eaf3f5ff',
    borderLeft: '3px solid #6395a1ff',
    editHoverBg: 'rgba(6, 182, 212, 0.3)',
    editHoverColor: '#22D3EE',
    label: 'Practical',
  },
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatHour(time) {
  const [h, m] = time.split(':').map(Number)
  const period = h >= 12 ? 'PM' : 'AM'
  const hour   = h > 12 ? h - 12 : h === 0 ? 12 : h
  return `${hour}:${m.toString().padStart(2, '0')} ${period}`
}

function getEndTime(startTime) {
  const idx = TIME_SLOTS.indexOf(startTime)
  if (idx >= 0 && idx < TIME_SLOTS.length - 1) return TIME_SLOTS[idx + 1]
  const [h, m] = startTime.split(':').map(Number)
  const total  = h * 60 + m + 50
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

function genId() {
  return `entry-${Date.now()}-${Math.floor(Math.random() * 9999)}`
}

function genRuntimePairId() {
  return `pair-rt-${Date.now()}-${Math.floor(Math.random() * 9999)}`
}

// ─── Editor overlay positioning ───────────────────────────────────────────────
const EDITOR_W = 304
const EDITOR_H = 408

function computeEditorPos(rect) {
  const vw  = window.innerWidth
  const vh  = window.innerHeight
  const gap = 12

  // On small screens, centre horizontally and position near the trigger vertically
  if (vw < 640) {
    const w = Math.min(EDITOR_W, vw - gap * 2)
    let top = rect.bottom + gap
    if (top + EDITOR_H > vh - gap) top = Math.max(gap, rect.top - EDITOR_H - gap)
    top = Math.max(gap, Math.min(vh - EDITOR_H - gap, top))
    return { top, left: Math.max(gap, (vw - w) / 2), width: w }
  }

  // Desktop: prefer right side, fall back to left
  let left = rect.right + gap
  if (left + EDITOR_W > vw - gap) left = rect.left - EDITOR_W - gap
  left = Math.max(gap, Math.min(vw - EDITOR_W - gap, left))

  // Align to trigger top, clamp to viewport
  let top = rect.top
  if (top + EDITOR_H > vh - gap) top = Math.max(gap, vh - EDITOR_H - gap)
  top = Math.max(gap, top)

  return { top, left, width: EDITOR_W }
}

// ─── CardEditor — floating portal panel ──────────────────────────────────────
function CardEditor({ mode, entry, slot, rect, onSave, onDelete, onClose }) {
  const isEdit = mode === 'edit'

  const [form, setForm] = useState(() =>
    isEdit
      ? { subject: entry.subject, code: entry.code, room: entry.room, type: entry.type, day: entry.day, startTime: entry.startTime }
      : { subject: '', code: '', room: '', type: 'Lecture', day: slot.day, startTime: slot.startTime }
  )

  const panelRef  = useRef(null)
  const firstRef  = useRef(null)
  const pos       = useMemo(() => computeEditorPos(rect), [rect])

  // Auto-focus first input
  useEffect(() => {
    const id = setTimeout(() => firstRef.current?.focus(), 60)
    return () => clearTimeout(id)
  }, [])

  // Escape → close
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  // Click-outside → close (delayed so the open-click doesn't immediately close)
  useEffect(() => {
    const onDown = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) onClose()
    }
    const id = setTimeout(() => document.addEventListener('pointerdown', onDown), 80)
    return () => { clearTimeout(id); document.removeEventListener('pointerdown', onDown) }
  }, [onClose])

  const field = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }))
  const setType = (t) => setForm(f => ({ ...f, type: t }))

  const handleSave = () => {
    if (!form.subject.trim()) { onClose(); return }
    onSave({ ...form, endTime: getEndTime(form.startTime) })
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSave() }
  }

  return createPortal(
    <div
      ref={panelRef}
      className="tt-editor-overlay"
      style={{ top: pos.top, left: pos.left, width: pos.width }}
      role="dialog"
      aria-modal="true"
      aria-label={isEdit ? 'Edit class' : 'Add class'}
    >
      {/* ── Header ───────────────────────────────────────────── */}
      <div className="tt-editor-header">
        <span className="tt-editor-title">{isEdit ? 'Edit Class' : 'New Class'}</span>
        <button className="tt-editor-close-btn" onClick={onClose} aria-label="Close editor">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {/* ── Type selector ─────────────────────────────────────── */}
      <div className="tt-editor-type-tabs" role="group" aria-label="Class type">
        {['Lecture', 'Tutorial', 'Practical'].map(t => (
          <button
            key={t}
            type="button"
            className={`tt-editor-type-tab${form.type === t ? ' is-active' : ''}`}
            data-type={t}
            onClick={() => setType(t)}
            aria-pressed={form.type === t}
          >
            {t}
          </button>
        ))}
      </div>

      {/* ── Fields ────────────────────────────────────────────── */}
      <div className="tt-editor-fields" onKeyDown={handleKeyDown}>
        <label className="tt-editor-field tt-editor-field--full">
          <span className="tt-editor-label">Subject Name</span>
          <input
            ref={firstRef}
            className="tt-editor-input"
            value={form.subject}
            onChange={field('subject')}
            placeholder="e.g. PHYSICS"
          />
        </label>

        <div className="tt-editor-row">
          <label className="tt-editor-field">
            <span className="tt-editor-label">Code</span>
            <input
              className="tt-editor-input"
              value={form.code}
              onChange={field('code')}
              placeholder="UPH013L"
            />
          </label>
          <label className="tt-editor-field">
            <span className="tt-editor-label">Room</span>
            <input
              className="tt-editor-input"
              value={form.room}
              onChange={field('room')}
              placeholder="LP101"
            />
          </label>
        </div>

        {/* Day & time — only shown when editing (slot is implicit when adding) */}
        {isEdit && (
          <div className="tt-editor-row">
            <label className="tt-editor-field">
              <span className="tt-editor-label">Day</span>
              <select className="tt-editor-input" value={form.day} onChange={field('day')}>
                {DAYS.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </label>
            <label className="tt-editor-field">
              <span className="tt-editor-label">Time</span>
              <select className="tt-editor-input" value={form.startTime} onChange={field('startTime')}>
                {START_TIMES.map(s => (
                  <option key={s} value={s}>{formatHour(s)}</option>
                ))}
              </select>
            </label>
          </div>
        )}

        {/* For add mode, show the target slot as read-only context */}
        {!isEdit && (
          <p className="tt-editor-slot-hint">
            {slot.day} · {formatHour(slot.startTime)}
          </p>
        )}
      </div>

      {/* ── Actions ───────────────────────────────────────────── */}
      <div className="tt-editor-actions">
        <button className="tt-editor-save-btn" onClick={handleSave}>
          {isEdit ? 'Save Changes' : 'Add Class'}
        </button>
        <div className="tt-editor-actions-right">
          {isEdit && onDelete && (
            <button className="tt-editor-delete-btn" onClick={onDelete} aria-label="Delete class">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6l-1 14H6L5 6" />
                <path d="M10 11v6" /><path d="M14 11v6" />
                <path d="M9 6V4h6v2" />
              </svg>
            </button>
          )}
          <button className="tt-editor-cancel-btn" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>,
    document.body
  )
}

// ─── ClassCard ────────────────────────────────────────────────────────────────
function ClassCard({ entry, onEdit, isDarkMode }) {
  const TYPE_META = isDarkMode ? DARK_TYPE_META : LIGHT_TYPE_META
  const meta      = TYPE_META[entry.type] || TYPE_META.Lecture
  const cardStyle = {
    '--card-bg': meta.bg,
    borderLeft: meta.borderLeft || `3px solid ${meta.color}`,
    '--edit-hover-bg': meta.editHoverBg,
    '--edit-hover-color': meta.editHoverColor
  }
  const badgeStyle = { color: meta.badgeColor || meta.color, background: meta.badgeBg }

  const handleEditClick = (e) => {
    e.stopPropagation()
    const rect = e.currentTarget.closest('.tt-class-card').getBoundingClientRect()
    onEdit(rect)
  }

  return (
    <div className="tt-class-card" style={cardStyle} data-type={entry.type}>
      <button
        className="tt-edit-btn"
        onClick={handleEditClick}
        aria-label={`Edit ${entry.subject}`}
        title="Edit class"
      >
        {/* Pencil icon */}
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
        </svg>
      </button>
      <span className="tt-type-badge" style={badgeStyle}>{meta.label}</span>
      <div className="tt-card-text">
        <p className="tt-card-subject">{entry.subject}</p>
        <p className="tt-card-code">{entry.code}</p>
      </div>
      <span className="tt-card-room">{entry.room}</span>
    </div>
  )
}

// ─── TimetableGrid ────────────────────────────────────────────────────────────
export default function TimetableGrid({ currentDay, isDarkMode, classes, cardTheme = 'default', activeWeekdayIdx }) {
  const resolvedIsDark = isDarkMode ?? (typeof document !== 'undefined' && document.documentElement.getAttribute('data-theme') === 'dark')
  const [entries,    setEntries]    = useState(() => classes ?? INITIAL_DATA)
  const [editTarget, setEditTarget] = useState(null)   // { entry, rect }
  const [addTarget,  setAddTarget]  = useState(null)   // { day, startTime, rect }

  // When the caller swaps in a new `classes` array (e.g. user switches batch),
  // reset the editable in-memory grid to match.
  useEffect(() => {
    if (classes !== undefined) {
      setEntries(classes)
      setEditTarget(null)
      setAddTarget(null)
    }
  }, [classes])

  // Resolve today's highlight day
  const highlightDay = useMemo(() => {
    // Sidebar's mini-calendar drives this when present (0..4 = Mon..Fri).
    if (activeWeekdayIdx != null && activeWeekdayIdx >= 0 && activeWeekdayIdx <= 4) {
      return DAYS[activeWeekdayIdx]
    }
    if (currentDay && DAYS.includes(currentDay)) return currentDay
    const names = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']
    const today = names[new Date().getDay()]
    return DAYS.includes(today) ? today : 'Monday'
  }, [currentDay, activeWeekdayIdx])

  // Sliding pill: index into DAYS (0..4) of the column to highlight, or null
  // to hide the pill entirely (e.g. Saturday with no mapping, or Sunday).
  const pillIdx = useMemo(() => {
    if (activeWeekdayIdx === null) return null
    if (activeWeekdayIdx != null && activeWeekdayIdx >= 0 && activeWeekdayIdx <= 4) {
      return activeWeekdayIdx
    }
    return DAYS.indexOf(highlightDay)
  }, [activeWeekdayIdx, highlightDay])

  // Measure the day-column width so the pill can be translated in pixels
  // (percentage-based transforms don't reliably interpolate across renders).
  const headerRowRef = useRef(null)
  const [colWidth, setColWidth] = useState(0)
  useLayoutEffect(() => {
    const row = headerRowRef.current
    if (!row) return
    const measure = () => {
      const dayCell = row.querySelector('.tt-day-header-cell')
      if (dayCell) setColWidth(dayCell.getBoundingClientRect().width)
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(row)
    return () => ro.disconnect()
  }, [])

  // Build day → slot → entries lookup from live state
  const dataMap = useMemo(() => {
    const map = {}
    for (const day of DAYS) {
      map[day] = {}
      for (const slot of TIME_SLOTS) map[day][slot] = []
    }
    for (const e of entries) {
      if (map[e.day]?.[e.startTime] !== undefined) {
        map[e.day][e.startTime].push(e)
      }
    }
    return map
  }, [entries])

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleEditSave = (form) => {
    setEntries(prev => {
      const target = editTarget.entry
      // Update the edited entry
      const updated = prev.map(e =>
        e.id === target.id ? { ...e, ...form } : e
      )
      // If it belongs to a pair, sync the partner (keep its slot times, update content)
      if (target.pairId && form.type === 'Practical') {
        return updated.map(e =>
          e.pairId === target.pairId && e.id !== target.id
            ? { ...e, subject: form.subject, code: form.code, room: form.room, type: form.type }
            : e
        )
      }
      return updated
    })
    setEditTarget(null)
  }

  const handleEditDelete = () => {
    setEntries(prev => {
      const target = editTarget.entry
      // Remove both members of the pair when a pairId exists, otherwise just the one entry
      if (target.pairId) {
        return prev.filter(e => e.pairId !== target.pairId)
      }
      return prev.filter(e => e.id !== target.id)
    })
    setEditTarget(null)
  }

  const handleAddSave = (form) => {
    if (form.type === 'Practical') {
      const slotIdx  = TIME_SLOTS.indexOf(form.startTime)
      const nextSlot = TIME_SLOTS[slotIdx + 1]

      // Validation: next slot must exist
      if (!nextSlot) {
        alert('Practicals require two consecutive slots.')
        return
      }

      // Validation: next slot must be empty for this day
      const nextOccupied = entries.some(
        (e) => e.day === form.day && e.startTime === nextSlot
      )
      if (nextOccupied) {
        alert('The next slot is occupied. Practicals require two consecutive empty slots.')
        return
      }

      // Stamp both new entries with the same pairId
      const pid    = genRuntimePairId()
      const first  = { ...form, startTime: form.startTime, endTime: nextSlot,        id: genId(), pairId: pid }
      const second = { ...form, startTime: nextSlot,        endTime: getEndTime(nextSlot), id: genId(), pairId: pid }
      setEntries(prev => [...prev, first, second])
    } else {
      const newEntry = { ...form, id: genId() }
      setEntries(prev => [...prev, newEntry])
    }
    setAddTarget(null)
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="tt-grid-frame" data-card-theme={cardTheme}>
      <div className="tt-grid-watermark" aria-hidden="true">
        <img
          src="/MLSC-logo.png"
          alt=""
          className="tt-watermark-logo"
          draggable="false"
        />
      </div>
      <div className="tt-grid-scroll-wrapper">
        <div className="tt-grid-table">

          {/* ── Header row ─────────────────────────────────────────────── */}
          <div className="tt-grid-header-row" ref={headerRowRef}>
            {/* Sliding highlight pill: rides behind the day cells, snaps to
                the active column via a transform animation. Hidden when
                pillIdx is null (Saturday with no mapping, Sunday, etc.). */}
            <div
              className={`tt-day-active-pill ${pillIdx == null ? 'tt-day-active-pill--hidden' : ''}`}
              style={{ transform: `translateX(${(pillIdx ?? 0) * colWidth}px)` }}
              aria-hidden="true"
            />
            <div className="tt-time-header-cell" />
            {DAYS.map((day, idx) => (
              <div
                key={day}
                className={`tt-day-header-cell ${idx === pillIdx ? 'tt-day-active' : ''}`}
              >
                <span className="tt-day-header-label">{day}</span>
              </div>
            ))}
          </div>

          {/* ── Body rows ──────────────────────────────────────────────── */}
          {TIME_SLOTS.map((slot) => (
            <div key={slot} className="tt-grid-body-row">
              {/* Time label */}
              <div className="tt-time-cell">
                <span className="tt-time-label">
                  {formatHour(slot).split(' ')[0]}
                  <span className="tt-time-period">{formatHour(slot).split(' ')[1]}</span>
                </span>
              </div>

              {/* Day slot cells */}
              {DAYS.map((day) => {
                const slotEntries = dataMap[day]?.[slot] || []
                const isActive    = day === highlightDay
                return (
                  <div
                    key={day}
                    className={`tt-slot-cell ${isActive ? 'tt-col-active' : ''}`}
                  >
                    <div className="tt-slot-stack">
                      {/* Existing class cards */}
                      {slotEntries.map((entry) => (
                        <ClassCard
                          key={entry.id}
                          entry={entry}
                          isDarkMode={resolvedIsDark}
                          onEdit={(rect) => setEditTarget({ entry, rect })}
                        />
                      ))}

                      {/* Add button — only in empty slots */}
                      {slotEntries.length === 0 && (
                        <button
                          className="tt-add-btn"
                          aria-label={`Add class for ${day} at ${formatHour(slot)}`}
                          onClick={(e) => {
                            e.stopPropagation()
                            setAddTarget({ day, startTime: slot, rect: e.currentTarget.getBoundingClientRect() })
                          }}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                          </svg>
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          ))}

        </div>
      </div>

      {/* ── Editor portals ────────────────────────────────────────────── */}
      {editTarget && (
        <CardEditor
          mode="edit"
          entry={editTarget.entry}
          rect={editTarget.rect}
          onSave={handleEditSave}
          onDelete={handleEditDelete}
          onClose={() => setEditTarget(null)}
        />
      )}
      {addTarget && (
        <CardEditor
          mode="add"
          slot={addTarget}
          rect={addTarget.rect}
          onSave={handleAddSave}
          onClose={() => setAddTarget(null)}
        />
      )}
    </div>
  )
}
