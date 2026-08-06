import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ADMIN_CONFIRM_EVENT } from '../lib/adminConfirm'
import './AdminConfirmDialog.css'

export function AdminConfirmHost() {
  const [queue, setQueue] = useState([])
  const cancelRef = useRef(null)
  const current = queue[0] || null

  useEffect(() => {
    function receive(event) {
      setQueue((items) => [...items, event.detail])
    }
    window.addEventListener(ADMIN_CONFIRM_EVENT, receive)
    return () => window.removeEventListener(ADMIN_CONFIRM_EVENT, receive)
  }, [])

  useEffect(() => {
    if (!current) return undefined
    cancelRef.current?.focus()
    function onKeyDown(event) {
      if (event.key === 'Escape') {
        event.preventDefault()
        current.resolve(false)
        setQueue((items) => items.slice(1))
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [current])

  if (!current) return null

  const {
    title = 'Confirm action',
    message,
    detail,
    confirmLabel = 'Confirm',
    cancelLabel = 'Cancel',
    tone = 'primary',
  } = current.options

  function resolve(value) {
    current.resolve(value)
    setQueue((items) => items.slice(1))
  }

  return createPortal(
    <div className="admin-confirm-backdrop" role="presentation" onMouseDown={() => resolve(false)}>
      <section
        className="admin-confirm-dialog"
        data-tone={tone}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="admin-confirm-title"
        aria-describedby="admin-confirm-message"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="admin-confirm-icon" aria-hidden="true">
          {tone === 'danger' ? '!' : tone === 'warning' ? '!' : '✓'}
        </div>
        <div className="admin-confirm-copy">
          <span>{tone === 'danger' ? 'Destructive action' : tone === 'warning' ? 'Review required' : 'Confirmation'}</span>
          <h2 id="admin-confirm-title">{title}</h2>
          <p id="admin-confirm-message">{message}</p>
          {detail && <small>{detail}</small>}
        </div>
        <div className="admin-confirm-actions">
          <button type="button" ref={cancelRef} onClick={() => resolve(false)}>{cancelLabel}</button>
          <button type="button" className="admin-confirm-submit" onClick={() => resolve(true)}>{confirmLabel}</button>
        </div>
      </section>
    </div>,
    document.body,
  )
}
