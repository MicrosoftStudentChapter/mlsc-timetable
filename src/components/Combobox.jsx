import { useEffect, useId, useRef, useState } from 'react'
import './Combobox.css'

/**
 * Lightweight searchable combobox.
 * - Single click opens the list and focuses the input simultaneously
 * - Typing filters options by label/value/hint
 * - Popup is positioned within the wrapper (never wider than the field)
 * - Set direction="up" to render the popup above the input (e.g. bottom-anchored navbars)
 *
 * options: [{ value: string, label?: string, hint?: string }]
 */
export default function Combobox({
  value,
  onChange,
  options = [],
  placeholder,
  disabled = false,
  ariaLabel,
  className = '',
  popupClassName = '',
  direction = 'down',
  filter,
  multiline = false,
}) {
  const [open, setOpen] = useState(false)
  const [searching, setSearching] = useState(false)
  const [highlight, setHighlight] = useState(0)
  const wrapRef = useRef(null)
  const inputRef = useRef(null)
  const listRef = useRef(null)
  const listId = useId()

  const defaultFilter = (opt, q) => {
    const needle = q.toLowerCase()
    return (
      String(opt.value ?? '').toLowerCase().includes(needle) ||
      String(opt.label ?? '').toLowerCase().includes(needle) ||
      String(opt.hint ?? '').toLowerCase().includes(needle)
    )
  }
  const filterFn = filter ?? defaultFilter
  const q = String(value ?? '')
  // A selected value is not a search query. Only filter after the user starts
  // editing the input; opening a populated combobox should show every option.
  const filtered = searching && q ? options.filter((o) => filterFn(o, q)) : options

  useEffect(() => {
    if (!open) return
    const onDoc = (e) => {
      if (!wrapRef.current?.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  useEffect(() => {
    setHighlight(0)
  }, [q, open])

  useEffect(() => {
    if (!open || !listRef.current) return
    const el = listRef.current.querySelector('.combobox-option.is-active')
    el?.scrollIntoView({ block: 'nearest' })
  }, [highlight, open])

  const select = (opt) => {
    onChange(opt.value)
    setOpen(false)
    setSearching(false)
    inputRef.current?.blur()
  }

  const openForBrowsing = () => {
    if (disabled) return
    setOpen(true)
    setSearching(false)
    // Let the browser focus the input before selecting its current value so
    // the next keyboard character starts a fresh search.
    requestAnimationFrame(() => inputRef.current?.select())
  }

  const handleKey = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (!open) setOpen(true)
      setHighlight((h) => Math.min(filtered.length - 1, h + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (!open) setOpen(true)
      setHighlight((h) => Math.max(0, h - 1))
    } else if (e.key === 'Enter') {
      if (open && filtered[highlight]) {
        e.preventDefault()
        select(filtered[highlight])
      }
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  return (
    <div
      ref={wrapRef}
      className={`combobox ${direction === 'up' ? 'is-up' : ''} ${disabled ? 'is-disabled' : ''}`}
    >
      {multiline ? (
        <textarea
          ref={inputRef}
          className={`combobox-input ${className}`}
          value={value ?? ''}
          onChange={(e) => {
            setSearching(true)
            onChange(e.target.value)
            setOpen(true)
          }}
          onFocus={openForBrowsing}
          onClick={openForBrowsing}
          onKeyDown={handleKey}
          placeholder={placeholder}
          aria-label={ariaLabel}
          disabled={disabled}
          autoComplete="off"
          spellCheck="false"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          rows={3}
        />
      ) : (
      <input
        ref={inputRef}
        type="text"
        className={`combobox-input ${className}`}
        value={value ?? ''}
        onChange={(e) => {
          setSearching(true)
          onChange(e.target.value)
          setOpen(true)
        }}
        onFocus={openForBrowsing}
        onClick={openForBrowsing}
        onKeyDown={handleKey}
        placeholder={placeholder}
        aria-label={ariaLabel}
        disabled={disabled}
        autoComplete="off"
        spellCheck="false"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
      />
      )}
      {open && filtered.length > 0 && (
        <ul
          ref={listRef}
          id={listId}
          className={`combobox-list ${popupClassName}`}
          role="listbox"
        >
          {filtered.map((opt, i) => (
            <li
              key={opt.value}
              role="option"
              aria-selected={i === highlight}
              className={`combobox-option ${i === highlight ? 'is-active' : ''}`}
              onMouseDown={(e) => {
                e.preventDefault()
                select(opt)
              }}
              onMouseEnter={() => setHighlight(i)}
            >
              <span className="combobox-option-label">{opt.label ?? opt.value}</span>
              {opt.hint && <span className="combobox-option-hint">{opt.hint}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
