import { Link } from 'react-router-dom'
import './LegalPage.css'

export default function TermsPage() {
  return (
    <main className="legal-page">
      <div className="legal-shell">
        <nav className="legal-topbar" aria-label="Legal navigation">
          <Link className="legal-back" to="/">← Back to MLSC Timetable</Link>
          <Link className="legal-home" to="/privacy">Privacy Policy</Link>
        </nav>
        <article className="legal-card">
          <p className="legal-kicker">MLSC Timetable</p>
          <h1 className="legal-title">Terms of Service</h1>
          <p className="legal-updated">Effective date: July 20, 2026</p>

          <section>
            <h2>Acceptance</h2>
            <p>By using MLSC Timetable, you agree to these Terms of Service. If you do not agree, do not use the service.</p>
          </section>

          <section>
            <h2>Service Description</h2>
            <p>MLSC Timetable provides timetable information and related academic-calendar tools for students. Google Calendar synchronization is optional and is initiated only when you authorize it.</p>
          </section>

          <section>
            <h2>Acceptable Use</h2>
            <ul>
              <li>Use the service for lawful academic and personal purposes.</li>
              <li>Do not attempt to disrupt, abuse, reverse engineer, or gain unauthorized access to the service.</li>
              <li>Do not submit content or requests that infringe another person’s rights.</li>
              <li>Keep your account credentials and connected services secure.</li>
            </ul>
          </section>

          <section>
            <h2>Timetable Information</h2>
            <p>Timetable and academic-calendar information is provided for convenience and may change. You should confirm important schedule information with official institute communications. MLSC Timetable does not guarantee that all information is complete, current, or error-free.</p>
          </section>

          <section>
            <h2>Google Calendar Sync</h2>
            <p>When you connect Google Calendar, you authorize MLSC Timetable to perform the calendar actions needed to create, update, and remove timetable events requested through the service. You may disconnect the integration at any time.</p>
          </section>

          <section>
            <h2>Availability and Changes</h2>
            <p>The service is provided on an availability basis. We may modify, suspend, or discontinue features, including Calendar Sync, when necessary for maintenance, security, or operational reasons.</p>
          </section>

          <section>
            <h2>Disclaimer and Liability</h2>
            <p>To the extent permitted by law, MLSC Timetable is provided without warranties and the MLSC team is not responsible for losses arising from reliance on timetable data, service interruptions, or calendar synchronization errors. Nothing in these terms limits rights that cannot legally be limited.</p>
          </section>

          <section>
            <h2>Contact</h2>
            <p>Questions about these terms can be directed to the Microsoft Learn Student Chapter at Thapar Institute of Engineering and Technology through its official channels.</p>
          </section>
        </article>
      </div>
    </main>
  )
}
