import './SiteMaintenancePage.css'

export default function SiteMaintenancePage({ message }) {
  const displayMessage = message || 'Please use excel provided by the university at thapar.edu'

  return (
    <div className="maintenance-container">
      {/* Background ambient lighting glow */}
      <div className="maintenance-ambient-glow" />

      <div className="maintenance-card">
        {/* Header Branding */}
        <div className="maintenance-header">
          <img src="/MLSC-logo.png" alt="MLSC Logo" className="maintenance-logo" />
          <span className="maintenance-badge">SYSTEM NOTICE</span>
        </div>

        {/* Title & Icon */}
        <div className="maintenance-body">
          <div className="maintenance-icon-wrap">
            <svg
              className="maintenance-icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
          </div>

          <h1 className="maintenance-title">Site Temporarily Offline</h1>
          <p className="maintenance-subtitle">
            The timetable site is currently undergoing updates or maintenance.
          </p>

          {/* Primary Notice Box */}
          <div className="maintenance-notice-box">
            <p className="maintenance-notice-text">{displayMessage}</p>
          </div>

          {/* Action Link to Thapar University */}
          <div className="maintenance-actions">
            <a
              href="https://thapar.edu"
              target="_blank"
              rel="noreferrer"
              className="maintenance-primary-btn"
            >
              Visit Thapar.edu Portal ↗
            </a>
          </div>
        </div>

        {/* Footer info */}
        <div className="maintenance-footer">
          <p className="maintenance-footer-text">
            Microsoft Student Chapter (MLSC) Timetable
          </p>
        </div>
      </div>
    </div>
  )
}
