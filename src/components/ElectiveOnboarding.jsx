import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import './ElectiveOnboarding.css'

function optionName(option) {
  const name = String(option?.subject_name || '').trim()
  const code = String(option?.subject_code || '').trim()
  return name || code || 'Unnamed course'
}

function optionCode(option) {
  return String(option?.subject_code || option?.baseCode || '').trim()
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
  const [activeStep, setActiveStep] = useState(0)
  const [query, setQuery] = useState('')

  useEffect(() => {
    if (!open) return undefined
    const onKey = (event) => {
      if (event.key === 'Escape' && status !== 'saving') {
        setActiveStep(0)
        setQuery('')
        onOpenChange(false)
      }
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
  const currentStep = Math.min(activeStep, Math.max(0, activeGroups.length - 1))
  const currentGroup = activeGroups[currentStep]
  const currentSelection = currentGroup ? selections[currentGroup.key] : ''
  const filteredOptions = useMemo(() => {
    if (!currentGroup) return []
    const needle = query.trim().toLocaleLowerCase()
    if (!needle) return currentGroup.options
    return currentGroup.options.filter((option) => (
      `${optionName(option)} ${optionCode(option)}`.toLocaleLowerCase().includes(needle)
    ))
  }, [currentGroup, query])

  if (!visible) return null

  const openPicker = () => {
    if (status === 'saving' || status === 'success') return
    if (formGroups.length === 0 && unresolved.length > 0) {
      setFormGroups(unresolved)
      setSelections(Object.fromEntries(unresolved.map((group) => [group.key, group.selectedBase || ''])))
    }
    setActiveStep(0)
    setQuery('')
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
      setActiveStep(0)
      setQuery('')
      onOpenChange(false)
    } catch (error) {
      setStatus('error')
      setMessage(error?.message || 'Saved on this device, but sync failed')
    }
  }

  const continueSelection = () => {
    if (!currentSelection || status === 'saving') return
    if (currentStep < activeGroups.length - 1) {
      setActiveStep(currentStep + 1)
      setQuery('')
      return
    }
    submit()
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
            if (event.target === event.currentTarget && status !== 'saving') {
              setActiveStep(0)
              setQuery('')
              onOpenChange(false)
            }
          }}
        >
          <section
            className="tt-elective-onboarding"
            role="dialog"
            aria-modal="true"
            aria-labelledby="tt-elective-onboarding-title"
          >
            <header className="tt-elective-onboarding-head">
              <div className="tt-elective-onboarding-head-copy">
                <span className="tt-elective-onboarding-mark" aria-hidden="true">
                  <svg viewBox="0 0 24 24">
                    <path d="M5 5.5A2.5 2.5 0 0 1 7.5 3H20v16H7.5A2.5 2.5 0 0 0 5 21.5v-16Z" />
                    <path d="M5 5.5v16M9 7h7M9 11h5" />
                  </svg>
                </span>
                <span className="tt-elective-onboarding-kicker">{batch} curriculum</span>
                <h2 id="tt-elective-onboarding-title">Choose your electives</h2>
                <p>Pick one course from each group. Your timetable updates everywhere automatically.</p>
              </div>
              <button
                type="button"
                className="tt-elective-onboarding-close"
                onClick={() => {
                  setActiveStep(0)
                  setQuery('')
                  onOpenChange(false)
                }}
                disabled={status === 'saving'}
                aria-label="Close elective selection"
              >
                ×
              </button>
            </header>

            <div className="tt-elective-onboarding-progress" aria-label={`Step ${currentStep + 1} of ${activeGroups.length}`}>
              {activeGroups.map((group, index) => (
                <span
                  key={group.key}
                  className={`${index === currentStep ? 'is-current' : ''}${selections[group.key] ? ' is-complete' : ''}`}
                />
              ))}
            </div>

            {currentGroup && (
              <div className="tt-elective-onboarding-step" key={currentGroup.key}>
                <div className="tt-elective-onboarding-step-head">
                  <div>
                    <span>Step {currentStep + 1} of {activeGroups.length}</span>
                    <h3>{currentGroup.label}</h3>
                  </div>
                  <span className="tt-elective-onboarding-count">
                    {currentGroup.options.length} course{currentGroup.options.length === 1 ? '' : 's'}
                  </span>
                </div>

                {currentGroup.options.length > 5 && (
                  <label className="tt-elective-onboarding-search">
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <circle cx="11" cy="11" r="7" />
                      <path d="m20 20-3.5-3.5" />
                    </svg>
                    <input
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      placeholder="Search by course or code"
                      aria-label={`Search ${currentGroup.label} courses`}
                    />
                    {query && (
                      <button type="button" onClick={() => setQuery('')} aria-label="Clear course search">×</button>
                    )}
                  </label>
                )}

                <div className="tt-elective-onboarding-options" role="radiogroup" aria-label={currentGroup.label}>
                  {filteredOptions.map((option) => {
                    const selected = currentSelection === option.baseCode
                    return (
                      <button
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        className={`tt-elective-onboarding-option${selected ? ' is-selected' : ''}`}
                        key={option.baseCode}
                        onClick={() => {
                          if (formGroups.length === 0) setFormGroups(unresolved)
                          setSelections((current) => ({ ...current, [currentGroup.key]: option.baseCode }))
                        }}
                        disabled={status === 'saving'}
                      >
                        <span className="tt-elective-onboarding-option-radio" aria-hidden="true">
                          {selected && (
                            <svg viewBox="0 0 24 24"><path d="m6 12 4 4 8-9" /></svg>
                          )}
                        </span>
                        <span className="tt-elective-onboarding-option-copy">
                          <strong>{optionName(option)}</strong>
                          <small>{optionCode(option)}</small>
                        </span>
                      </button>
                    )
                  })}
                  {filteredOptions.length === 0 && (
                    <div className="tt-elective-onboarding-empty">No matching courses</div>
                  )}
                </div>
              </div>
            )}

            {status === 'error' && (
              <p className="tt-elective-onboarding-error" role="alert">
                Your choice is cached on this device. {message}
              </p>
            )}

            <footer className="tt-elective-onboarding-actions">
              <span className="tt-elective-onboarding-storage">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 10V8a5 5 0 0 1 10 0v2M6 10h12v10H6z" /></svg>
                {isSignedIn ? 'Saved to your account' : 'Stored on this device'}
              </span>
              <div className="tt-elective-onboarding-action-buttons">
                <button
                  type="button"
                  className="tt-elective-onboarding-later"
                  onClick={() => {
                    if (currentStep > 0) {
                      setActiveStep(currentStep - 1)
                      setQuery('')
                    } else {
                      setQuery('')
                      onOpenChange(false)
                    }
                  }}
                  disabled={status === 'saving'}
                >
                  {currentStep > 0 ? 'Back' : 'Not now'}
                </button>
                <button
                  type="button"
                  className="tt-elective-onboarding-save"
                  onClick={continueSelection}
                  disabled={!currentSelection || (currentStep === activeGroups.length - 1 && !ready) || status === 'saving'}
                >
                  {status === 'saving'
                    ? 'Saving…'
                    : status === 'error'
                      ? 'Retry sync'
                      : currentStep < activeGroups.length - 1
                        ? 'Continue'
                        : `Apply ${activeGroups.length === 1 ? 'choice' : 'choices'}`}
                  {status !== 'saving' && status !== 'error' && currentStep < activeGroups.length - 1 && <span aria-hidden="true">→</span>}
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
