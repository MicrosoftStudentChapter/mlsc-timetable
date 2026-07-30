import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import './ElectiveOnboarding.css'

function optionLabel(option) {
  const name = String(option?.subject_name || '').trim()
  const code = String(option?.subject_code || '').trim()
  if (name && code) return `${name} (${code})`
  return name || code || 'Unnamed course'
}

function IslandIcon({ status }) {
  if (status === 'saving') return <span className="tt-elective-island-spinner" aria-hidden="true" />
  if (status === 'success') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="m5 12 4 4L19 6" />
      </svg>
    )
  }
  if (status === 'error') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 8v5m0 3h.01M10.3 3.7 2.4 17.4A2 2 0 0 0 4.1 20h15.8a2 2 0 0 0 1.7-2.6L13.7 3.7a2 2 0 0 0-3.4 0Z" />
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3v3m0 12v3M3 12h3m12 0h3M5.6 5.6l2.1 2.1m8.6 8.6 2.1 2.1m0-12.8-2.1 2.1m-8.6 8.6-2.1 2.1" />
      <circle cx="12" cy="12" r="3.2" />
    </svg>
  )
}

export default function ElectiveOnboarding({
  batch,
  groups,
  isSignedIn,
  open,
  onOpenChange,
  onApply,
}) {
  const unresolved = useMemo(
    () => groups.filter((group) => !group.selectedBase && !group.dismissed),
    [groups],
  )
  const [formGroups, setFormGroups] = useState([])
  const [selections, setSelections] = useState({})
  const [status, setStatus] = useState('idle')
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (!open) return undefined
    const onKey = (event) => {
      if (event.key === 'Escape' && status !== 'saving') onOpenChange(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onOpenChange, status])

  useEffect(() => {
    if (status !== 'success') return undefined
    const timer = window.setTimeout(() => {
      setStatus('idle')
      setMessage('')
      setFormGroups([])
      setSelections({})
    }, 2400)
    return () => window.clearTimeout(timer)
  }, [status])

  const activeGroups = formGroups.length > 0 ? formGroups : unresolved
  const ready = activeGroups.length > 0 && activeGroups.every((group) => selections[group.key])
  const visible = unresolved.length > 0 || status !== 'idle'

  if (!visible) return null

  const openPicker = () => {
    if (status === 'saving' || status === 'success') return
    if (formGroups.length === 0 && unresolved.length > 0) {
      setFormGroups(unresolved)
      setSelections(Object.fromEntries(unresolved.map((group) => [group.key, group.selectedBase || ''])))
    }
    onOpenChange(true)
  }

  const submit = async () => {
    if (!ready || status === 'saving') return
    setStatus('saving')
    setMessage('')
    try {
      await onApply(selections, activeGroups)
      setStatus('success')
      setMessage(isSignedIn ? 'Saved to your timetable' : 'Saved on this device')
      onOpenChange(false)
    } catch (error) {
      setStatus('error')
      setMessage(error?.message || 'Saved on this device, but sync failed')
    }
  }

  const islandLabel = status === 'saving'
    ? 'Saving electives'
    : status === 'success'
      ? message
      : status === 'error'
        ? 'Saved here · sync failed'
        : `Choose ${unresolved.length} elective${unresolved.length === 1 ? '' : 's'}`

  return createPortal(
    <>
      <button
        type="button"
        className="tt-elective-island"
        data-status={status}
        onClick={openPicker}
        aria-haspopup="dialog"
        aria-expanded={open ? 'true' : 'false'}
      >
        <span className="tt-elective-island-icon"><IslandIcon status={status} /></span>
        <span className="tt-elective-island-copy">
          <strong>{islandLabel}</strong>
          {status === 'idle' && <small>{batch} · finish your timetable</small>}
          {status === 'error' && <small>Tap to retry</small>}
        </span>
        {status === 'idle' && <span className="tt-elective-island-arrow" aria-hidden="true">›</span>}
      </button>

      {open && activeGroups.length > 0 && (
        <div
          className="tt-elective-onboarding-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && status !== 'saving') onOpenChange(false)
          }}
        >
          <section
            className="tt-elective-onboarding"
            role="dialog"
            aria-modal="true"
            aria-labelledby="tt-elective-onboarding-title"
          >
            <header className="tt-elective-onboarding-head">
              <div>
                <span className="tt-elective-onboarding-kicker">Personalise {batch}</span>
                <h2 id="tt-elective-onboarding-title">Choose your electives</h2>
                <p>We will show only the courses you select across every matching class.</p>
              </div>
              <button
                type="button"
                className="tt-elective-onboarding-close"
                onClick={() => onOpenChange(false)}
                disabled={status === 'saving'}
                aria-label="Close elective selection"
              >
                ×
              </button>
            </header>

            <div className="tt-elective-onboarding-fields">
              {activeGroups.map((group, index) => (
                <label className="tt-elective-onboarding-field" key={group.key}>
                  <span className="tt-elective-onboarding-field-number">{String(index + 1).padStart(2, '0')}</span>
                  <span className="tt-elective-onboarding-field-copy">
                    <strong>{group.label}</strong>
                    <small>{group.options.length} course{group.options.length === 1 ? '' : 's'} available</small>
                  </span>
                  <select
                    value={selections[group.key] || ''}
                    onChange={(event) => {
                      if (formGroups.length === 0) setFormGroups(unresolved)
                      setSelections((current) => ({
                        ...current,
                        [group.key]: event.target.value,
                      }))
                    }}
                    disabled={status === 'saving'}
                    aria-label={group.label}
                  >
                    <option value="">Select a course</option>
                    {group.options.map((option) => (
                      <option key={option.baseCode} value={option.baseCode}>
                        {optionLabel(option)}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>

            {status === 'error' && (
              <p className="tt-elective-onboarding-error" role="alert">
                Your choice is cached on this device. {message}
              </p>
            )}

            <footer className="tt-elective-onboarding-actions">
              <span>{isSignedIn ? 'Synced with your account' : 'Stored for 90 days on this device'}</span>
              <div>
                <button type="button" className="tt-elective-onboarding-later" onClick={() => onOpenChange(false)} disabled={status === 'saving'}>
                  Later
                </button>
                <button type="button" className="tt-elective-onboarding-save" onClick={submit} disabled={!ready || status === 'saving'}>
                  {status === 'saving' ? 'Saving…' : status === 'error' ? 'Retry sync' : 'Apply choices'}
                </button>
              </div>
            </footer>
          </section>
        </div>
      )}
    </>,
    document.body,
  )
}
