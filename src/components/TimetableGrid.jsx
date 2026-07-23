import { useState, useRef, useMemo, useEffect, useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'
import { submitChangeRequest, submitSubjectRequest, classPrefixOf } from '../lib/change_requests'
import {
  loadOverrides,
  saveOverrides,
  clearOverrides,
  applyOverrides,
  mergeOverride,
  reconcileOverrides,
} from '../lib/local_overrides'
import { setDefaultBatch, syncOverridesToBackend } from '../lib/me_overrides'
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
  '17:10',
  '18:00',
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

function isAlternateActive(entry, termStartDate) {
  if (!entry?.alternateWeekStart) return true
  const start = alternateWeekStartForDate(termStartDate)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const week = Math.max(1, Math.floor((today - start) / 604800000) + 1)
  return (week - entry.alternateWeekStart) % 2 === 0
}

function alternateWeekStartForDate(termStartDate) {
  if (!termStartDate) return new Date(new Date().getFullYear(), 0, 1)
  const start = new Date(`${termStartDate}T00:00:00`)
  return Number.isNaN(start.getTime()) ? new Date(new Date().getFullYear(), 0, 1) : start
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

function electiveGroupKey(entry) {
  const options = entry?.options
  if (!Array.isArray(options) || options.length < 2) return ''
  return options.map((option) => option.subject_code || '').sort().join('|')
}

function applyElectiveChoice(entry, option) {
  return {
    ...entry,
    subject: option.subject_name || option.subject_code || entry.subject,
    code: option.subject_code || entry.code,
    type: option.type || entry.type,
    room: option.place || entry.room,
    teacher: option.teacher || entry.teacher,
    electiveChoice: option.subject_code || null,
  }
}

function isPersonalElectiveOverride(override) {
  return override?.kind === 'elective_pick'
}

// ─── Editor overlay positioning ───────────────────────────────────────────────
const EDITOR_W = 304
const EDITOR_H = 470

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
function CardEditor({ mode, entry, slot, rect, triggerElement, onSave, onDelete, onClose }) {
  const isEdit = mode === 'edit'
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [isElectivesExpanded, setIsElectivesExpanded] = useState(true)

  const [form, setForm] = useState(() =>
    isEdit
       ? { subject: entry.subject, code: entry.code, room: entry.room, type: entry.type, day: entry.day, startTime: entry.startTime, alternateWeekStart: entry.alternateWeekStart ?? null, electiveChoice: entry.electiveChoice || entry.code }
       : { subject: '', code: '', room: '', type: 'Lecture', day: slot.day, startTime: slot.startTime, alternateWeekStart: null }
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
      if (panelRef.current && !panelRef.current.contains(e.target)) {
        if (triggerElement && triggerElement.contains(e.target)) return
        onClose()
      }
    }
    const id = setTimeout(() => document.addEventListener('pointerdown', onDown), 80)
    return () => { clearTimeout(id); document.removeEventListener('pointerdown', onDown) }
  }, [onClose, triggerElement])

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

        {Array.isArray(entry?.options) && entry.options.length > 1 && (
          <div className="tt-editor-electives">
            <button
              type="button"
              className="tt-editor-electives-toggle"
              onClick={() => setIsElectivesExpanded(prev => !prev)}
              aria-expanded={isElectivesExpanded}
            >
              <span className="tt-editor-label">Choose elective</span>
              <svg
                className={`tt-editor-toggle-icon${isElectivesExpanded ? ' is-expanded' : ''}`}
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>
            {isElectivesExpanded && (
              <>
                <div className="tt-editor-elective-options">
                  {entry.options.map((option) => (
                    <button
                      type="button"
                      key={option.subject_code}
                      className={`tt-editor-elective-option${form.electiveChoice === option.subject_code ? ' is-active' : ''}`}
                      onClick={() => setForm((current) => ({ ...current, ...applyElectiveChoice(current, option), electiveChoice: option.subject_code }))}
                    >
                      <strong>{option.subject_name || option.subject_code}</strong>
                      <small>{option.subject_code}{option.place ? ` · ${option.place}` : ''}{option.teacher ? ` · ${option.teacher}` : ''}</small>
                    </button>
                  ))}
                </div>
                <small className="tt-editor-elective-help">This choice is applied to every matching elective cell in this timetable.</small>
              </>
            )}
          </div>
        )}

        <label className="tt-editor-alternate">
          <input
            type="checkbox"
            checked={Boolean(form.alternateWeekStart)}
            onChange={(event) => setForm((current) => ({
              ...current,
              alternateWeekStart: event.target.checked ? (current.alternateWeekStart || 1) : null,
            }))}
          />
          <span>
            <strong>Alternate-week class</strong>
            <small>Week 1 means this class runs in the first week from the term start date; week 2 means the opposite week.</small>
          </span>
        </label>
        {form.alternateWeekStart && (
          <label className="tt-editor-field tt-editor-field--full">
            <span className="tt-editor-label">Runs from</span>
            <select className="tt-editor-input" value={form.alternateWeekStart} onChange={(event) => setForm((current) => ({ ...current, alternateWeekStart: Number(event.target.value) }))}>
              <option value="1">Week 1</option>
              <option value="2">Week 2</option>
            </select>
          </label>
        )}
      </div>

      {/* ── Actions ───────────────────────────────────────────── */}
      <div className="tt-editor-actions">
        {confirmDelete ? (
          <>
            <span className="tt-editor-confirm-text">Delete this class?</span>
            <div className="tt-editor-actions-right">
              <button
                type="button"
                className="tt-editor-cancel-btn"
                onClick={() => setConfirmDelete(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="tt-editor-delete-confirm-btn"
                onClick={() => { setConfirmDelete(false); onDelete?.() }}
              >
                Delete
              </button>
            </div>
          </>
        ) : (
          <>
            <button className="tt-editor-save-btn" onClick={handleSave}>
              {isEdit ? 'Save Changes' : 'Add Class'}
            </button>
            <div className="tt-editor-actions-right">
              {isEdit && onDelete && (
                <button
                  className="tt-editor-delete-btn"
                  onClick={() => setConfirmDelete(true)}
                  aria-label="Delete class"
                >
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
          </>
        )}
      </div>
    </div>,
    document.body
  )
}

function ElectivePicker({ entry, rect, triggerElement, onChoose, onClose }) {
  const pos = computeEditorPos(rect)
  const panelRef = useRef(null)
  useEffect(() => {
    const close = (event) => {
      if (panelRef.current && !panelRef.current.contains(event.target)) {
        if (triggerElement && triggerElement.contains(event.target)) return
        onClose()
      }
    }
    const id = setTimeout(() => document.addEventListener('pointerdown', close), 80)
    return () => { clearTimeout(id); document.removeEventListener('pointerdown', close) }
  }, [onClose, triggerElement])
  return createPortal(
    <div ref={panelRef} className="tt-elective-picker" style={{ top: pos.top, left: pos.left }} role="dialog" aria-label="Choose elective">
      <div className="tt-elective-picker-header">
        <strong>Choose elective</strong>
        <button type="button" onClick={onClose} aria-label="Close">×</button>
      </div>
      <p>Choose once and matching cells update automatically.</p>
      <div className="tt-elective-picker-list">
        {(entry.options || []).map((option) => (
          <button type="button" key={option.subject_code} onClick={() => onChoose(option)}>
            <strong>{option.subject_name || option.subject_code}</strong>
            <span>{option.subject_code}</span>
          </button>
        ))}
      </div>
    </div>,
    document.body,
  )
}

// ─── ClassCard ────────────────────────────────────────────────────────────────
function getCardSvgIndex(subject, code, room, type) {
  const str = `${subject || ''}-${code || ''}-${room || ''}-${type || ''}`
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash)
  }
  return Math.abs(hash) % 6
}

function ClassCard({ entry, onEdit, onChooseElective, onDragStart, isDarkMode, isDragging, termStartDate }) {
  const TYPE_META = isDarkMode ? DARK_TYPE_META : LIGHT_TYPE_META
  const meta      = TYPE_META[entry.type] || TYPE_META.Lecture
  const cardStyle = {
    '--card-bg': meta.bg,
    borderLeft: meta.borderLeft || `3px solid ${meta.color}`,
    '--edit-hover-bg': meta.editHoverBg,
    '--edit-hover-color': meta.editHoverColor
  }
  const badgeStyle = { color: meta.badgeColor || meta.color, background: meta.badgeBg }
  const isElectiveGroup = Array.isArray(entry.options) && entry.options.length > 1 && !entry.electiveChoice

  const handleEditClick = (e) => {
    e.stopPropagation()
    const cardEl = e.currentTarget.closest('.tt-class-card')
    const rect = cardEl.getBoundingClientRect()
    onEdit(rect, e.currentTarget)
  }

  const handleDragHandlePointerDown = (e) => {
    if (e.button != null && e.button !== 0) return
    e.stopPropagation()
    // Force-start a drag immediately (skip threshold so touch users don't have
    // to slide before the lift; threshold is for accidental card-body taps).
    onDragStart?.(entry, e, { immediate: true })
  }

  const handleCardClick = (e) => {
    if (isElectiveGroup) {
      e.stopPropagation()
      const rect = e.currentTarget.getBoundingClientRect()
      onChooseElective?.(entry, rect, e.currentTarget)
    }
  }

  return (
    <div
      className="tt-class-card"
      style={cardStyle}
      data-type={entry.type}
      data-dragging={isDragging || undefined}
      data-alternate-inactive={entry.alternateWeekStart && !isAlternateActive(entry, termStartDate) ? 'true' : undefined}
      data-spidey-index={getCardSvgIndex(entry.subject, entry.code, entry.room, entry.type)}
      data-elective-group={isElectiveGroup || undefined}
      onClick={handleCardClick}
    >
      <button
        className="tt-edit-btn"
        onClick={handleEditClick}
        onPointerDown={(e) => e.stopPropagation()}
        aria-label={`Edit ${isElectiveGroup ? 'elective group' : entry.subject}`}
        title="Edit class"
      >
        {/* Pencil icon */}
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
        </svg>
      </button>
      <button
        type="button"
        className="tt-drag-btn"
        onPointerDown={handleDragHandlePointerDown}
        onClick={(e) => e.stopPropagation()}
        aria-label={`Drag ${entry.subject} to move or swap`}
        title="Drag to move or swap"
      >
        <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <circle cx="9" cy="5" r="1.7" /><circle cx="15" cy="5" r="1.7" />
          <circle cx="9" cy="12" r="1.7" /><circle cx="15" cy="12" r="1.7" />
          <circle cx="9" cy="19" r="1.7" /><circle cx="15" cy="19" r="1.7" />
        </svg>
      </button>
      {!isElectiveGroup && <span className="tt-type-badge" style={badgeStyle}>{meta.label}</span>}
      <div className={`tt-card-text${isElectiveGroup ? ' tt-card-text--elective' : ''}`}>
        <p className="tt-card-subject">{isElectiveGroup ? 'Choose elective' : entry.subject}</p>
        {!isElectiveGroup && <p className="tt-card-code">{entry.code}</p>}
      </div>
      {isElectiveGroup && <span className="tt-elective-count">{entry.options.length} choices · click to choose</span>}
      {!isElectiveGroup && entry.alternateWeekStart && (
        <span className="tt-alternate-label">
          {isAlternateActive(entry, termStartDate) ? `Alternate · Week ${entry.alternateWeekStart}` : 'Not this week'}
        </span>
      )}
      {!isElectiveGroup && entry.room && String(entry.room).trim() && (
        <span className="tt-card-room">{entry.room}</span>
      )}
    </div>
  )
}

// ─── TimetableGrid ────────────────────────────────────────────────────────────
export default function TimetableGrid({
  currentDay,
  isDarkMode,
  classes,
  termStartDate,
  cardTheme = 'default',
  activeWeekdayIdx,
  batch,
  // Admin-mode props: when true the grid renders the entries verbatim
  // (no overrides, no localStorage, no change-request flow) and forwards
  // every mutation to `onAdminChange(nextEntries)` so the parent owns
  // the save lifecycle. `errorCellKey` ("Day|HH:MM") flashes one cell red.
  adminMode = false,
  onAdminChange,
  errorCellKey,
  isSignedIn = false,
  hasDefaultBatch = false,
  onReloadTimetable,
}) {
  const resolvedIsDark = isDarkMode ?? (typeof document !== 'undefined' && document.documentElement.getAttribute('data-theme') === 'dark')
  // The canonical schedule from the backend (or the bundled fallback). We
  // never mutate this — user changes live in `overrides` below.
  // Only admin/fallback mode may use the fixture. A user timetable must stay
  // empty until the personal API response arrives, otherwise stale sample
  // data flashes before `/me/timetable` completes.
  const baseClasses = classes ?? (adminMode ? INITIAL_DATA : [])
  // Per-slot user overrides (one entry per edited/added/deleted cell), loaded
  // from localStorage so they survive a reload. Submission to the backend is
  // a separate concern (see ChangeRequestPrompt).
  const [overrides, setOverrides] = useState(() =>
    adminMode ? [] : reconcileOverrides(baseClasses, loadOverrides(batch)).map((ov) => {
      const isElective = ov.entry?.electiveChoice || (Array.isArray(ov.entry?.options) && ov.entry.options.length > 1)
      return isElective && ov.kind === 'edit' ? { ...ov, kind: 'elective_pick' } : ov
    }),
  )
  const [editTarget, setEditTarget] = useState(null)   // { entry, rect }
  const [electiveTarget, setElectiveTarget] = useState(null)
  const [electiveConfirm, setElectiveConfirm] = useState(null)
  const [defaultBatchPrompt, setDefaultBatchPrompt] = useState(null)
  const [addTarget,  setAddTarget]  = useState(null)   // { day, startTime, rect }
  const [saveOpen, setSaveOpen] = useState(false)
  const [resetOpen, setResetOpen] = useState(false)
  const [drag, setDrag] = useState(null) // { entry, originX, originY, x, y, started, rect, dropTargetKey }
  const [peekBaseline, setPeekBaseline] = useState(false)
  // Flips true on user-initiated override changes so the persist effect knows
  // to write to storage; backend-driven reloads leave it false.
  const dirtyRef = useRef(false)

  // Derived view: canonical classes with the user's overrides folded in.
  // In adminMode the parent fully owns the entries, so we skip the overlay
  // and render `baseClasses` directly.
  const entries = useMemo(
    () => (adminMode ? baseClasses : applyOverrides(baseClasses, overrides)),
    [baseClasses, overrides, adminMode],
  )

  // Net diff vs canonical: round-trip edits (A→B→A) collapse to "no change"
  // so the Save FAB stays hidden when the view matches the baseline.
  const regularOverrides = useMemo(
    () => overrides.filter((ov) => !isPersonalElectiveOverride(ov)),
    [overrides],
  )
  const personalElectiveOverrides = useMemo(
    () => overrides.filter((ov) => isPersonalElectiveOverride(ov)),
    [overrides],
  )

  const hasNetChange = useMemo(() => {
    const sig = (arr) => arr
      .map(e => `${e.day}|${e.startTime}|${e.subject}|${e.code}|${e.type}|${e.room ?? ''}`)
      .sort()
      .join('\n')
    const regularEntries = adminMode ? baseClasses : applyOverrides(baseClasses, regularOverrides)
    const electiveEntries = adminMode ? baseClasses : applyOverrides(baseClasses, personalElectiveOverrides)
    return sig(baseClasses) !== sig(regularEntries)
  }, [baseClasses, regularOverrides, adminMode])

  // What the grid actually shows. While the user holds the peek button we
  // render the canonical baseline so they can compare against their edits.
  const visibleEntries = peekBaseline ? baseClasses : entries

  // Evening rows stay out of the normal view when there are no classes scheduled
  // during those slots. Admin mode keeps all slots available for adding/editing.
  const visibleTimeSlots = useMemo(() => {
    if (adminMode) return TIME_SLOTS

    // Find the latest start time of any class in the timetable
    let maxIdx = -1
    for (const entry of visibleEntries) {
      const idx = TIME_SLOTS.indexOf(entry.startTime)
      if (idx > maxIdx) maxIdx = idx
    }

    // Default: show at least up to the 16:20 slot (index 10)
    // so we don't end up with an empty morning-only grid if there are no classes.
    const defaultMaxIdx = 10 // 16:20 is index 10
    const limitIdx = Math.max(defaultMaxIdx, maxIdx)

    return TIME_SLOTS.slice(0, limitIdx + 1)
  }, [visibleEntries, adminMode])

  // When the caller swaps in new `classes` (e.g. batch switch), reload the
  // override list for that batch, prune any that conflict with the fresh
  // canonical (this is how an approved batch-wide change reaches the user),
  // and drop any open editors.
  useEffect(() => {
    if (classes === undefined) return
    dirtyRef.current = false
    if (adminMode) {
      setEditTarget(null)
      setAddTarget(null)
      return
    }
    const stored = loadOverrides(batch)
    const reconciled = reconcileOverrides(classes, stored)
    if (reconciled.length !== stored.length) {
      saveOverrides(batch, reconciled)
    }
    setOverrides(reconciled)
    setEditTarget(null)
    setAddTarget(null)
  }, [classes, batch, adminMode])

  // Persist user-initiated override changes. Skips backend-driven reloads.
  useEffect(() => {
    if (adminMode) return
    if (!batch) return
    if (!dirtyRef.current) return
    saveOverrides(batch, overrides)
    dirtyRef.current = false
  }, [overrides, batch, adminMode])

  // Append a new override (or several) with the merge/collapse rules.
  // In adminMode we instead apply each override directly to the entries
  // list and forward the new array up; the parent is responsible for the
  // eventual PATCH.
  const pushOverrides = (incoming) => {
    const arr = Array.isArray(incoming) ? incoming : [incoming]
    if (arr.length === 0) return
    if (adminMode) {
      const next = applyOverrides(entries, arr)
      onAdminChange?.(next)
      return
    }
    if (isSignedIn && !hasDefaultBatch && !defaultBatchPrompt) {
      setDefaultBatchPrompt({ incoming: arr })
      return
    }
    applyIncomingOverrides(arr)
  }

  const applyIncomingOverrides = (arr) => {
    dirtyRef.current = true
    const normalized = arr.map((ov) => (
      isPersonalElectiveOverride(ov) && ov.kind === 'edit'
        ? { ...ov, kind: 'elective_pick' }
        : ov
    ))
    setOverrides(prev => normalized.reduce((acc, ov) => mergeOverride(acc, ov), prev))
    // Regular edits stay local until the user explicitly submits the Save
    // dialog. Personal elective picks are synced immediately.
    if (normalized.some((ov) => isPersonalElectiveOverride(ov))) {
      syncOverridesToBackend(normalized.filter((ov) => isPersonalElectiveOverride(ov)), batch)
    }
  }

  // Resolve today's highlight day
  const highlightDay = useMemo(() => {
    // Sidebar's mini-calendar drives this when present (0..4 = Mon..Fri).
    if (activeWeekdayIdx != null && activeWeekdayIdx >= 0 && activeWeekdayIdx <= 4) {
      return DAYS[activeWeekdayIdx]
    }
    if (currentDay && DAYS.includes(currentDay)) return currentDay
    const names = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']
    const today = names[new Date().getDay()]
    // On Sat/Sun (or any non-weekday input) return null so NO column is
    // highlighted by default — previously this fell back to 'Monday' which
    // painted Monday blue on weekends.
    return DAYS.includes(today) ? today : null
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

  // Measure the active column's actual layout offset. Using bounding-rect
  // widths here is incorrect when the table has CSS zoom applied on narrow
  // screens: the rect is zoomed, while the transform is in layout pixels.
  const headerRowRef = useRef(null)
  const [pillOffset, setPillOffset] = useState(0)
  useLayoutEffect(() => {
    const row = headerRowRef.current
    if (!row) return
    const measure = () => {
      const dayCells = row.querySelectorAll('.tt-day-header-cell')
      if (dayCells.length > 1) {
        setPillOffset(dayCells[1].offsetLeft - dayCells[0].offsetLeft)
      }
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(row)
    return () => ro.disconnect()
  }, [])

  // ── Body-only zoom-to-fit ───────────────────────────────────────────────
  // Scale the grid down when the frame is narrower than the grid's target
  // width, so the whole timetable stays visible on small screens without
  // affecting the surrounding sidebar/header/navbar (they respond to the
  // real viewport width as usual). CSS `zoom` also shrinks the layout box
  // so the scroll wrapper doesn't think content overflows unless the zoomed
  // grid still exceeds its bounds.
  const frameRef = useRef(null)
  const tableRef = useRef(null)
  const [bodyZoom, setBodyZoom] = useState(1)
  useLayoutEffect(() => {
    const frame = frameRef.current
    const table = tableRef.current
    if (!frame || !table) return
    const measure = () => {
      const frameW = frame.clientWidth
      // Prefer the table's intrinsic min-width (respects breakpoint
      // overrides on `--col-width` / `--time-col-width`), but bump the
      // effective target by ~14% so zoom starts trimming a little before
      // the grid would otherwise start scrolling. This makes narrower
      // viewports feel roomier without triggering horizontal scroll.
      const cs = window.getComputedStyle(table)
      const intrinsic = parseFloat(cs.minWidth) || table.scrollWidth || frameW
      const designW = intrinsic * 1.14
      if (!designW) return
      const k = Math.min(1, frameW / designW)
      // Round to 3 decimals to avoid tiny reflows on every 1px resize.
      setBodyZoom((prev) => (Math.abs(prev - k) < 0.005 ? prev : Math.round(k * 1000) / 1000))
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(frame)
    return () => ro.disconnect()
  }, [])

  // Build day → slot → entries lookup from live state
  const dataMap = useMemo(() => {
    const map = {}
    for (const day of DAYS) {
      map[day] = {}
      for (const slot of TIME_SLOTS) map[day][slot] = []
    }
    for (const e of visibleEntries) {
      if (map[e.day]?.[e.startTime] !== undefined) {
        map[e.day][e.startTime].push(e)
      }
    }
    return map
  }, [visibleEntries])

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleEditSave = (form) => {
    const target = editTarget.entry
    const selectedOption = target.options?.find((option) => option.subject_code === form.electiveChoice)
    const chosen = selectedOption ? applyElectiveChoice(target, selectedOption) : { ...target, ...form }
    const matchingElectives = selectedOption
      ? entries.filter((entry) => electiveGroupKey(entry) === electiveGroupKey(target))
      : [target]
    const wasUnresolvedElective = Array.isArray(target.options) && target.options.length > 1
    const isElectivePick = Boolean(selectedOption && wasUnresolvedElective)
    const newOverrides = matchingElectives.map((entry) => ({
      kind: isElectivePick ? 'elective_pick' : 'edit',
      targetId: entry.id,
      day: entry.day === target.day && entry.id === target.id ? form.day : entry.day,
      startTime: entry.id === target.id ? form.startTime : entry.startTime,
      // Snapshot of the canonical entry we edited; reconcileOverrides uses
      // this to detect when the official timetable has moved on.
      baseEntry: { ...entry },
      entry: entry.id === target.id ? chosen : applyElectiveChoice(entry, selectedOption),
    }))
    // Practical pair: sync the partner row so both halves stay in lockstep.
    if (target.pairId && form.type === 'Practical') {
      const partner = entries.find(e => e.pairId === target.pairId && e.id !== target.id)
      if (partner) {
        newOverrides.push({
          kind: 'edit',
          targetId: partner.id,
          day: partner.day,
          startTime: partner.startTime,
          baseEntry: { ...partner },
          entry: {
            ...partner,
            subject: form.subject,
            code: form.code,
            room: form.room,
            type: form.type,
          },
        })
      }
    }
    pushOverrides(newOverrides)
    setEditTarget(null)
  }

  const handleElectiveChoice = (entry, option) => {
    const groupKey = electiveGroupKey(entry)
    const matching = entries.filter((candidate) => electiveGroupKey(candidate) === groupKey)
    setElectiveConfirm({ entry, option, matching })
  }

  const confirmElectiveChoice = () => {
    if (!electiveConfirm) return
    const { option, matching } = electiveConfirm
    pushOverrides(matching.map((candidate) => ({
      kind: 'elective_pick', targetId: candidate.id, day: candidate.day,
      startTime: candidate.startTime, baseEntry: { ...candidate },
      entry: applyElectiveChoice(candidate, option),
    })))
    setElectiveConfirm(null)
    setElectiveTarget(null)
  }

  const handleEditDelete = () => {
    const target = editTarget.entry
    const newOverrides = []
    if (target.pairId) {
      for (const e of entries) {
        if (e.pairId === target.pairId) {
          newOverrides.push({
            kind: 'delete',
            targetId: e.id,
            day: e.day,
            startTime: e.startTime,
            baseEntry: { ...e },
          })
        }
      }
    } else {
      newOverrides.push({
        kind: 'delete',
        targetId: target.id,
        day: target.day,
        startTime: target.startTime,
        baseEntry: { ...target },
      })
    }
    pushOverrides(newOverrides)
    setEditTarget(null)
  }

  const handleAddSave = (form) => {
    if (form.type === 'Practical') {
      const slotIdx  = TIME_SLOTS.indexOf(form.startTime)
      const nextSlot = TIME_SLOTS[slotIdx + 1]

      if (!nextSlot) {
        alert('Practicals require two consecutive slots.')
        return
      }
      const nextOccupied = entries.some(
        (e) => e.day === form.day && e.startTime === nextSlot,
      )
      if (nextOccupied) {
        alert('The next slot is occupied. Practicals require two consecutive empty slots.')
        return
      }

      const pid       = genRuntimePairId()
      const firstId   = genId()
      const secondId  = genId()
      const first  = { ...form, startTime: form.startTime, endTime: nextSlot,            id: firstId,  pairId: pid }
      const second = { ...form, startTime: nextSlot,        endTime: getEndTime(nextSlot), id: secondId, pairId: pid }
      pushOverrides([
        { kind: 'add', addId: firstId,  day: first.day,  startTime: first.startTime,  entry: first  },
        { kind: 'add', addId: secondId, day: second.day, startTime: second.startTime, entry: second },
      ])
    } else {
      const newId    = genId()
      const newEntry = { ...form, id: newId }
      pushOverrides({
        kind: 'add',
        addId: newId,
        day: form.day,
        startTime: form.startTime,
        entry: newEntry,
      })
    }
    setAddTarget(null)
  }

  // ── Drag-and-drop (move + swap) ──────────────────────────────────────────
  // Pointer-based drag. Threshold of 6px before activation so taps still pass
  // through to the card body. Paired practicals refuse drag for v1.
  const DRAG_THRESHOLD = 6
  const dragRef = useRef(null)
  useEffect(() => { dragRef.current = drag }, [drag])

  // Live snapshot of the rendered entries so applyDrop never reads a stale
  // closure value after rapid back-to-back drags. The effect that owns the
  // pointer listeners only re-runs when drag.pointerId changes, so without
  // this ref applyDrop could see entries from two drags ago.
  const entriesRef = useRef(entries)
  useEffect(() => { entriesRef.current = entries }, [entries])

  const handleCardDragStart = (entry, e, opts = {}) => {
    if (e.target.closest('.tt-edit-btn')) return
    const cardEl = e.currentTarget.closest?.('.tt-class-card') || e.currentTarget
    const rect = cardEl.getBoundingClientRect()
    try { cardEl.setPointerCapture?.(e.pointerId) } catch { /* ignore */ }
    setDrag({
      entry,
      pointerId: e.pointerId,
      originX: e.clientX,
      originY: e.clientY,
      x: e.clientX,
      y: e.clientY,
      started: !!opts.immediate,
      rect: { width: rect.width, height: rect.height, offsetX: e.clientX - rect.left, offsetY: e.clientY - rect.top },
      dropTargetKey: null,
    })
  }

  useEffect(() => {
    if (!drag) return

    const findSlotAt = (x, y) => {
      const el = document.elementFromPoint(x, y)
      if (!el) return null
      const slotEl = el.closest?.('.tt-slot-cell[data-day]')
      if (!slotEl) return null
      return { day: slotEl.dataset.day, startTime: slotEl.dataset.startTime, key: `${slotEl.dataset.day}|${slotEl.dataset.startTime}` }
    }

    const onMove = (e) => {
      setDrag((prev) => {
        if (!prev) return prev
        const dx = e.clientX - prev.originX
        const dy = e.clientY - prev.originY
        const started = prev.started || Math.hypot(dx, dy) > DRAG_THRESHOLD
        let dropTargetKey = prev.dropTargetKey
        if (started) {
          const hit = findSlotAt(e.clientX, e.clientY)
          dropTargetKey = hit?.key ?? null
        }
        return { ...prev, x: e.clientX, y: e.clientY, started, dropTargetKey }
      })
    }

    const onUp = (e) => {
      const cur = dragRef.current
      if (cur?.started) {
        const hit = findSlotAt(e.clientX, e.clientY)
        if (hit) {
          applyDrop(cur.entry, hit.day, hit.startTime)
        }
      }
      setDrag(null)
    }

    const onCancel = () => setDrag(null)

    window.addEventListener('pointermove', onMove, { passive: true })
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onCancel)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onCancel)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag?.pointerId])

  const applyDrop = (sourceEntry, day, startTime) => {
    // Always read the latest rendered entries via ref — `entries` from
    // closure can lag if the user fires a new drag before React has flushed
    // the previous drop's state update.
    const liveEntries = entriesRef.current
    const source = liveEntries.find(e => e.id === sourceEntry.id) ?? sourceEntry
    if (source.day === day && source.startTime === startTime) return

    // Anything else currently rendered in the target slot.
    const targets = liveEntries.filter(
      (e) => e.id !== source.id && e.day === day && e.startTime === startTime,
    )

    const moveOv = {
      kind: 'edit',
      targetId: source.id,
      day,
      startTime,
      baseEntry: { ...source },
      entry: { ...source, day, startTime, endTime: getEndTime(startTime) },
    }
    if (targets.length === 0) {
      pushOverrides([moveOv])
      return
    }
    const occupant = targets[0]
    // Defensive: if the occupant somehow is the source (id collision), bail.
    if (occupant.id === source.id) {
      pushOverrides([moveOv])
      return
    }
    const swapOv = {
      kind: 'edit',
      targetId: occupant.id,
      day: source.day,
      startTime: source.startTime,
      baseEntry: { ...occupant },
      entry: { ...occupant, day: source.day, startTime: source.startTime, endTime: getEndTime(source.startTime) },
    }
    pushOverrides([moveOv, swapOv])
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="tt-grid-frame" data-card-theme={cardTheme} ref={frameRef}>
      <div className="tt-grid-watermark" aria-hidden="true">
        <img
          src="/MLSC-logo.png"
          alt=""
          className="tt-watermark-logo"
          draggable="false"
        />
      </div>
      <div className="tt-grid-scroll-wrapper">
        <div className="tt-grid-table" ref={tableRef} style={bodyZoom < 1 ? { zoom: bodyZoom } : undefined}>

          {/* ── Header row ─────────────────────────────────────────────── */}
          <div className="tt-grid-header-row" ref={headerRowRef}>
            {/* Sliding highlight pill: rides behind the day cells, snaps to
                the active column via a transform animation. Hidden when
                pillIdx is null (Saturday with no mapping, Sunday, etc.). */}
            <div
              className={`tt-day-active-pill ${pillIdx == null ? 'tt-day-active-pill--hidden' : ''}`}
              style={{ transform: `translateX(${pillIdx == null ? 0 : pillIdx * pillOffset}px)` }}
              aria-hidden="true"
            />
            <div className="tt-time-header-cell">
              {batch && <span className="tt-batch-header-label">{batch}</span>}
            </div>
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
          {visibleTimeSlots.map((slot) => (
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
                const slotKey     = `${day}|${slot}`
                const isDropTarget = drag?.started && drag.dropTargetKey === slotKey && !(drag.entry.day === day && drag.entry.startTime === slot)
                const isErrorCell = adminMode && errorCellKey && errorCellKey === slotKey
                return (
                  <div
                    key={day}
                    className={`tt-slot-cell ${isActive ? 'tt-col-active' : ''}`}
                    data-day={day}
                    data-start-time={slot}
                    data-drop-target={isDropTarget || undefined}
                    data-error-cell={isErrorCell || undefined}
                  >
                    <div className="tt-slot-stack">
                      {/* Existing class cards */}
                      {slotEntries.map((entry) => (
                        <ClassCard
                          key={entry.id}
                          entry={entry}
                          isDarkMode={resolvedIsDark}
                          onEdit={(rect, element) => setEditTarget(prev => (prev && prev.entry.id === entry.id) ? null : { entry, rect, element })}
                          onChooseElective={(target, rect, element) => setElectiveTarget(prev => (prev && prev.entry.id === target.id) ? null : { entry: target, rect, element })}
                          onDragStart={handleCardDragStart}
                          isDragging={drag?.started && drag.entry.id === entry.id}
                          termStartDate={termStartDate}
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
          triggerElement={editTarget.element}
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
      {electiveTarget && (
        <ElectivePicker
          entry={electiveTarget.entry}
          rect={electiveTarget.rect}
          triggerElement={electiveTarget.element}
          onChoose={(option) => handleElectiveChoice(electiveTarget.entry, option)}
          onClose={() => setElectiveTarget(null)}
        />
      )}
      {electiveConfirm && createPortal(
        <div className="tt-elective-confirm-backdrop" role="dialog" aria-modal="true">
          <div className="tt-elective-confirm">
            <h3>Save elective choice?</h3>
            <p>
              Choose <strong>{electiveConfirm.option.subject_name || electiveConfirm.option.subject_code}</strong>?
              This will update all matching elective cells {isSignedIn
                ? <>and save it for your default batch (<strong>{batch}</strong>)</>
                : 'and keep it locally on this device'}.
            </p>
            <div className="tt-elective-confirm-actions">
              <button type="button" className="tt-editor-cancel-btn" onClick={() => setElectiveConfirm(null)}>Cancel</button>
              <button type="button" className="tt-editor-save-btn" onClick={confirmElectiveChoice}>Continue</button>
            </div>
          </div>
        </div>,
        document.body,
      )}
      {defaultBatchPrompt && createPortal(
        <div className="tt-elective-confirm-backdrop" role="dialog" aria-modal="true">
          <div className="tt-elective-confirm">
            <h3>Set {batch} as your default batch?</h3>
            <p>Your personal edits are stored against your default batch. Set <strong>{batch}</strong> as the default to save this edit and use it across devices.</p>
            <div className="tt-elective-confirm-actions">
              <button type="button" className="tt-editor-cancel-btn" onClick={() => setDefaultBatchPrompt(null)}>Cancel</button>
              <button type="button" className="tt-editor-save-btn" onClick={async () => { const result = await setDefaultBatch(batch); if (!result || result.default_batch !== batch.toUpperCase()) return; applyIncomingOverrides(defaultBatchPrompt.incoming); setDefaultBatchPrompt(null) }}>Set as default & save</button>
            </div>
          </div>
        </div>,
        document.body,
      )}

      {/* Floating save controls — visible only when current view differs from baseline */}
      {!adminMode && hasNetChange && (
        <div className="tt-save-fab-group">
          <button
            type="button"
            className="tt-peek-fab"
            onPointerDown={(e) => { e.preventDefault(); setPeekBaseline(true) }}
            onPointerUp={() => setPeekBaseline(false)}
            onPointerLeave={() => setPeekBaseline(false)}
            onPointerCancel={() => setPeekBaseline(false)}
            onContextMenu={(e) => e.preventDefault()}
            aria-label="Hold to preview the original timetable"
            title="Hold to see original"
            data-active={peekBaseline || undefined}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
            <span>{peekBaseline ? 'Original' : 'Hold to compare'}</span>
          </button>
          <button
            type="button"
            className="tt-reset-fab"
            onClick={() => setResetOpen(true)}
            disabled={peekBaseline}
            aria-label="Reset all changes"
            title="Discard local changes"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polyline points="1 4 1 10 7 10" />
              <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
            </svg>
            <span>Reset</span>
          </button>
          <button
            type="button"
            className="tt-save-fab"
            onClick={() => setSaveOpen(true)}
            disabled={peekBaseline}
            aria-label={`Save ${regularOverrides.length} change${regularOverrides.length === 1 ? '' : 's'}`}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
              <polyline points="17 21 17 13 7 13 7 21" />
              <polyline points="7 3 7 8 15 8" />
            </svg>
            <span>Save</span>
          </button>
        </div>
      )}

      {saveOpen && (
        <SaveChangesDialog
          overrides={regularOverrides}
          batch={batch}
          isSignedIn={isSignedIn}
          onClose={() => setSaveOpen(false)}
          onSavedJustForMe={() => {
            // Clear staged regular overrides locally — they're now persisted in
            // the backend override collection and will be baked into the next
            // /me/timetable response. Reload so baseClasses reflects the saves
            // and the user sees their edits without a manual refresh.
            setOverrides((current) => current.filter((ov) => isPersonalElectiveOverride(ov)))
            dirtyRef.current = true
            onReloadTimetable?.()
          }}
        />
      )}

      {resetOpen && createPortal(
        <div
          className="tt-cr-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="Reset local changes"
          onClick={(e) => { if (e.target === e.currentTarget) setResetOpen(false) }}
        >
          <div className="tt-cr-card tt-cr-card--compact">
            <h3 className="tt-cr-title">Reset changes?</h3>
            <p className="tt-cr-sub">
              This discards all your local edits for batch <strong>{batch}</strong> and
              restores the original timetable. This action can&apos;t be undone.
            </p>
            <div className="tt-cr-actions tt-cr-actions--end">
              <button
                type="button"
                className="tt-cr-btn tt-cr-btn--ghost"
                onClick={() => setResetOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="tt-cr-btn tt-cr-btn--danger"
                onClick={() => {
                  clearOverrides(batch)
                  dirtyRef.current = false
                  setOverrides([])
                  setPeekBaseline(false)
                  setResetOpen(false)
                }}
              >
                Discard changes
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}

      {/* Floating drag ghost — follows pointer while dragging */}
      {drag?.started && createPortal(
        <div
          className="tt-card-drag-ghost"
          style={{
            position: 'fixed',
            left: drag.x - drag.rect.offsetX,
            top: drag.y - drag.rect.offsetY,
            width: drag.rect.width,
            height: drag.rect.height,
            pointerEvents: 'none',
            zIndex: 9999,
          }}
        >
          <div className="tt-class-card tt-class-card--ghost" data-type={drag.entry.type}>
            <span className="tt-type-badge">{drag.entry.type}</span>
            <div className="tt-card-text">
              <p className="tt-card-subject">{drag.entry.subject}</p>
              <p className="tt-card-code">{drag.entry.code}</p>
            </div>
            {drag.entry.room && <span className="tt-card-room">{drag.entry.room}</span>}
          </div>
        </div>,
        document.body,
      )}
    </div>
  )
}


// ─── SaveChangesDialog ────────────────────────────────────────────────────────
// Deferred save UI. The grid stages every edit/add/delete/move into local
// overrides immediately. This dialog asks the user what to do with the
// accumulated changes: keep them just for themselves, or propose them to the
// batch / class as change requests for admin review. Each override is
// submitted as its own request — server-side rate limits and duplicate
// detection apply per change.
function SaveChangesDialog({ overrides, batch, isSignedIn, onClose, onSavedJustForMe }) {
  const [status, setStatus] = useState({ kind: 'idle' })
  // 'idle' | 'submitting' | 'done' | 'error'
  const classPrefix = classPrefixOf(batch)

  const hasLecture = useMemo(() => overrides.some(ov => {
    const t = ov.entry?.type ?? ov.baseEntry?.type
    return t === 'Lecture'
  }), [overrides])

  const submitAll = async (scope) => {
    if (!batch) return
    setStatus({ kind: 'submitting', scope, sent: 0, total: overrides.length, errors: [] })

    // Always persist to the personal override collection first so the user's
    // view is backed even before admin review. Change requests are submitted
    // on top; overrides are never flushed regardless of outcome.
    if (isSignedIn) {
      await syncOverridesToBackend(overrides, batch)
    }

    let sent = 0
    const errors = []
    for (const ov of overrides) {
      if (ov.kind === 'elective_pick') continue
      if (scope === 'class') {
        // Class scope only carries Lecture changes
        const t = ov.entry?.type ?? ov.baseEntry?.type
        if (t !== 'Lecture') continue
      }
      try {
        const entry = ov.kind === 'delete' ? null : ov.entry
        await submitChangeRequest({
          requesterBatch: batch,
          scope,
          kind: ov.kind,
          day: ov.day,
          startTime: ov.startTime,
          entry,
        })
        // The regular Save dialog is the point at which non-personal edits
        // become backend change requests; they are not synced during editing.
        if (entry?.code?.trim() && entry?.subject?.trim() && !/^U[A-Z]{2,4}\d{3,4}[LTP]?$/i.test(entry.subject.trim())) {
          try {
            await submitSubjectRequest({
              requesterBatch: batch,
              code: entry.code,
              name: entry.subject,
            })
          } catch (catalogErr) {
            if (catalogErr.code !== 'duplicate') throw catalogErr
          }
        }
        sent++
        setStatus(s => s.kind === 'submitting' ? { ...s, sent } : s)
      } catch (err) {
        errors.push({ ov, code: err.code, message: err.message })
      }
    }
    if (errors.length === 0) {
      setStatus({ kind: 'done', scope, sent })
      // Change requests submitted + overrides already synced to backend override
      // collection. Clear local staged state so the Save FAB disappears.
      setTimeout(() => { onSavedJustForMe?.(); onClose() }, 500)
    } else {
      setStatus({ kind: 'error', scope, sent, errors })
    }
  }

  const isSubmitting = status.kind === 'submitting'
  const lectureCount = overrides.filter(ov => (ov.entry?.type ?? ov.baseEntry?.type) === 'Lecture').length

  return createPortal(
    <div className="tt-cr-backdrop" role="dialog" aria-modal="true" aria-label="Save changes">
      <div className="tt-cr-card">
        <h3 className="tt-cr-title">Save {overrides.length} change{overrides.length === 1 ? '' : 's'}</h3>
        <p className="tt-cr-sub">
          Your edits are already saved locally for batch <strong>{batch}</strong>. Choose how to share them:
        </p>

        {status.kind === 'done' ? (
          <p className="tt-cr-success">Submitted {status.sent} change{status.sent === 1 ? '' : 's'} for review — thanks!</p>
        ) : (
          <>
            <div className="tt-cr-actions">
              <button
                type="button"
                className="tt-cr-btn tt-cr-btn--ghost"
                disabled={isSubmitting}
                onClick={async () => {
                  // Persist regular overrides to the personal override collection
                  // in the backend (if signed in), then clear them from staged state.
                  if (isSignedIn) {
                    await syncOverridesToBackend(overrides, batch)
                  }
                  onSavedJustForMe?.()
                  onClose()
                }}
              >
                Save just for me
              </button>
              <button
                type="button"
                className="tt-cr-btn tt-cr-btn--primary"
                disabled={isSubmitting || !batch}
                onClick={() => submitAll('batch')}
              >
                {isSubmitting && status.scope === 'batch'
                  ? `Submitting ${status.sent}/${status.total}…`
                  : `Save for batch ${batch}`}
              </button>
              {hasLecture && classPrefix && (
                <button
                  type="button"
                  className="tt-cr-btn tt-cr-btn--primary"
                  disabled={isSubmitting}
                  onClick={() => submitAll('class')}
                  title={`Applies to every batch starting with ${classPrefix} (Lecture changes only)`}
                >
                  {isSubmitting && status.scope === 'class'
                    ? `Submitting ${status.sent}/${lectureCount}…`
                    : `Save for class ${classPrefix}`}
                </button>
              )}
            </div>
            <p className="tt-cr-note">
              {hasLecture
                ? 'Batch sends every change. Class only sends Lecture changes — Practical/Tutorial stay personal.'
                : 'An admin will review batch submissions before they go live.'}
            </p>
            {status.kind === 'error' && (
              <p className="tt-cr-error">
                Submitted {status.sent}/{overrides.length}. {status.errors.length} failed
                {status.errors[0]?.code === 'rate_limited' && ' — rate limit hit, try again later.'}
                {status.errors[0]?.code === 'duplicate' && ' — some were duplicates of pending requests.'}
                {!['rate_limited', 'duplicate'].includes(status.errors[0]?.code) && '.'}
              </p>
            )}
          </>
        )}
      </div>
    </div>,
    document.body
  )
}
