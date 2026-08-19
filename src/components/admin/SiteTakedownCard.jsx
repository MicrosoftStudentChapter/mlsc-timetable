import { useCallback, useEffect, useState } from 'react'
import { getSiteStatus, setSiteStatus } from '../../lib/admin'
import { DEFAULT_MAINTENANCE_MESSAGE, subscribeSiteStatus } from '../../lib/siteStatus'
import { adminConfirm } from '../../lib/adminConfirm'
import SiteMaintenancePage from '../SiteMaintenancePage'

export default function SiteTakedownCard({ onStatusChange }) {
  const [status, setStatus] = useState({
    maintenance: false,
    message: DEFAULT_MAINTENANCE_MESSAGE,
    updatedAt: '',
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [messageInput, setMessageInput] = useState(DEFAULT_MAINTENANCE_MESSAGE)
  const [result, setResult] = useState(null)
  const [showPreview, setShowPreview] = useState(false)

  const loadStatus = useCallback(async () => {
    setLoading(true)
    try {
      const data = await getSiteStatus()
      if (data) {
        setStatus(data)
        setMessageInput(data.message || DEFAULT_MAINTENANCE_MESSAGE)
      }
      setResult(null)
    } catch (err) {
      // Surface it — a silent failure here used to make the card show a
      // confident "LIVE"/"TAKEN DOWN" pill that no other visitor agreed with.
      setResult({
        kind: 'failed',
        message: `Could not read the live site status, so the state below may be wrong. ${err?.message || ''}`.trim(),
      })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadStatus()
    const unsubscribe = subscribeSiteStatus((newStatus) => {
      setStatus(newStatus)
      if (newStatus.message) {
        setMessageInput(newStatus.message)
      }
      if (onStatusChange) onStatusChange(newStatus)
    })
    return () => unsubscribe()
  }, [loadStatus, onStatusChange])

  async function handleToggleMaintenance() {
    const nextMaintenance = !status.maintenance

    if (nextMaintenance) {
      const confirmed = await adminConfirm({
        title: 'Take down main site?',
        message: 'This will replace the main timetable frontend with a maintenance message for all public users.',
        detail: 'Admin routes (/admin) will remain accessible so you can restore the site anytime.',
        confirmLabel: 'Take Down Site Now',
        tone: 'danger',
      })
      if (!confirmed) return
    }

    setSaving(true)
    setResult(null)
    try {
      const updated = await setSiteStatus({
        maintenance: nextMaintenance,
        message: messageInput.trim() || DEFAULT_MAINTENANCE_MESSAGE,
      })
      setStatus(updated)
      setResult({
        kind: 'ok',
        message: nextMaintenance
          ? 'Site taken down! Maintenance screen is now visible to public users.'
          : 'Site restored! Main site is live.',
      })
      if (onStatusChange) onStatusChange(updated)
    } catch (err) {
      setResult({
        kind: 'failed',
        message: err?.message || 'Failed to update site status.',
      })
    } finally {
      setSaving(false)
    }
  }

  async function handleSaveMessage(e) {
    e.preventDefault()
    if (saving) return

    setSaving(true)
    setResult(null)
    try {
      const updated = await setSiteStatus({
        maintenance: status.maintenance,
        message: messageInput.trim() || DEFAULT_MAINTENANCE_MESSAGE,
      })
      setStatus(updated)
      setResult({ kind: 'ok', message: 'Maintenance message saved.' })
    } catch (err) {
      setResult({ kind: 'failed', message: err?.message || 'Failed to save message.' })
    } finally {
      setSaving(false)
    }
  }

  function handleResetMessage() {
    setMessageInput(DEFAULT_MAINTENANCE_MESSAGE)
  }

  const isDirty = messageInput.trim() !== (status.message || DEFAULT_MAINTENANCE_MESSAGE).trim()

  return (
    <div className={`admin-card ${status.maintenance ? 'takedown-active-card' : ''}`}>
      <div className="admin-card-header" style={{ alignItems: 'center' }}>
        <h2 className="admin-card-title" style={{ textAlign: 'left', display: 'flex', alignItems: 'center', gap: '10px' }}>
          Site Takedown & Maintenance
          <span className={`status-pill ${status.maintenance ? 'status-pill--down' : 'status-pill--live'}`}>
            {status.maintenance ? '🔴 TAKEN DOWN' : '🟢 LIVE'}
          </span>
        </h2>
        <button
          type="button"
          className="admin-card-action"
          onClick={loadStatus}
          disabled={loading || saving}
        >
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      <p className="admin-card-sub" style={{ textAlign: 'left', marginBottom: 16 }}>
        Temporarily replace the main timetable frontend with a site maintenance notice screen.
      </p>

      {/* Main Toggle Switch Control */}
      <div className="takedown-control-banner" style={{
        padding: '16px',
        borderRadius: '10px',
        background: status.maintenance ? 'rgba(239, 68, 68, 0.12)' : 'rgba(16, 185, 129, 0.08)',
        border: `1px solid ${status.maintenance ? 'rgba(239, 68, 68, 0.3)' : 'rgba(16, 185, 129, 0.2)'}`,
        marginBottom: '20px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '12px',
      }}>
        <div>
          <strong style={{ display: 'block', fontSize: '0.95rem', color: status.maintenance ? '#ef4444' : '#10b981' }}>
            {status.maintenance ? 'Site is currently Taken Down' : 'Site is currently Operating Normally'}
          </strong>
          <span style={{ fontSize: '0.8rem', opacity: 0.75 }}>
            {status.maintenance
              ? 'Public visitors see the maintenance screen below.'
              : 'Public visitors have full access to timetable features.'}
          </span>
        </div>

        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <button
            type="button"
            className={`upload-btn ${status.maintenance ? 'takedown-btn-restore' : 'takedown-btn-takedown'}`}
            style={{
              padding: '8px 18px',
              fontSize: '0.88rem',
              fontWeight: '600',
              background: status.maintenance ? '#10b981' : '#ef4444',
              color: '#ffffff',
              border: 'none',
              borderRadius: '8px',
              cursor: saving ? 'wait' : 'pointer',
            }}
            onClick={handleToggleMaintenance}
            disabled={saving || loading}
          >
            {saving
              ? 'Updating…'
              : status.maintenance
              ? '✓ Restore Site Live'
              : '⚠ Take Down Entire Site'}
          </button>

          <button
            type="button"
            className="admin-card-action"
            style={{ padding: '8px 12px', fontSize: '0.82rem' }}
            onClick={() => setShowPreview(true)}
          >
            👁 Preview Screen
          </button>
        </div>
      </div>

      {/* Message Configuration Form */}
      <form onSubmit={handleSaveMessage} className="upload-form">
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
            <label htmlFor="takedown-message-input" style={{ fontWeight: '600', fontSize: '0.88rem' }}>
              Maintenance Notice Text
            </label>
            {messageInput !== DEFAULT_MAINTENANCE_MESSAGE && (
              <button
                type="button"
                className="admin-card-action"
                style={{ fontSize: '0.78rem', padding: '2px 6px' }}
                onClick={handleResetMessage}
              >
                Reset to default
              </button>
            )}
          </div>
          <textarea
            id="takedown-message-input"
            className="upload-input"
            rows={3}
            value={messageInput}
            onChange={(e) => setMessageInput(e.target.value)}
            placeholder={DEFAULT_MAINTENANCE_MESSAGE}
            disabled={saving}
            style={{ width: '100%', fontFamily: 'inherit', resize: 'vertical' }}
          />
          <span style={{ fontSize: '0.78rem', opacity: 0.6, display: 'block', marginTop: '4px' }}>
            This text is displayed prominently on the site maintenance screen.
          </span>
        </div>

        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginTop: '10px' }}>
          <button
            type="submit"
            className="upload-btn"
            disabled={saving || loading || !isDirty}
            style={{ width: 'auto', padding: '8px 16px', fontSize: '0.85rem' }}
          >
            {saving ? 'Saving message…' : 'Save Notice Text'}
          </button>
        </div>
      </form>

      {result && (
        <div className={`upload-result ${result.kind === 'ok' ? 'ok' : 'failed'}`} style={{ marginTop: '12px' }}>
          {result.message}
        </div>
      )}

      {/* Maintenance Screen Live Preview Modal */}
      {showPreview && (
        <div
          className="fix-modal-backdrop"
          onClick={() => setShowPreview(false)}
          style={{ zIndex: 99999 }}
        >
          <div
            style={{
              position: 'relative',
              width: '90vw',
              maxWidth: '900px',
              height: '85vh',
              background: '#090a0f',
              borderRadius: '16px',
              overflow: 'hidden',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)',
              display: 'flex',
              flexDirection: 'column',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{
              padding: '12px 20px',
              background: '#1e293b',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              borderBottom: '1px solid rgba(255,255,255,0.1)',
            }}>
              <span style={{ fontSize: '0.88rem', fontWeight: '600', color: '#f1f5f9' }}>
                👁 Site Takedown Screen Preview
              </span>
              <button
                type="button"
                className="fix-modal-x"
                onClick={() => setShowPreview(false)}
                aria-label="Close preview"
              >
                ×
              </button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto' }}>
              <SiteMaintenancePage message={messageInput} />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
