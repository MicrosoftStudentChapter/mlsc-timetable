import './Footer.css'

export default function Footer() {
  return (
    <footer className="footer">
      <p className="footer-copy">©MLSC 2026</p>
      <div className="footer-socials">
        <a
          href="https://www.linkedin.com/company/microsoft-learn-student-chapter"
          target="_blank"
          rel="noreferrer"
          aria-label="LinkedIn"
          data-tip="LinkedIn"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"/>
            <rect x="2" y="9" width="4" height="12"/>
            <circle cx="4" cy="4" r="2"/>
          </svg>
          <span>LinkedIn</span>
        </a>
        <a
          href="https://www.instagram.com/mlsc_tiet"
          target="_blank"
          rel="noreferrer"
          aria-label="Instagram"
          data-tip="Instagram"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="2" width="20" height="20" rx="5" ry="5"/>
            <circle cx="12" cy="12" r="4"/>
            <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none"/>
          </svg>
          <span>Instagram</span>
        </a>
      </div>
    </footer>
  )
}
