import { Link } from 'react-router-dom'
import './LegalPage.css'

export default function PrivacyPage() {
  return (
    <main className="legal-page">
      <div className="legal-shell">
        <nav className="legal-topbar" aria-label="Legal navigation">
          <Link className="legal-back" to="/">← Back to MLSC Timetable</Link>
          <Link className="legal-home" to="/terms">Terms of Service</Link>
        </nav>
        <article className="legal-card">
          <p className="legal-kicker">MLSC Timetable</p>
          <h1 className="legal-title">Privacy Policy</h1>
          <p className="legal-updated">Effective date: July 20, 2026</p>

          <section>
            <h2>Overview</h2>
            <p>MLSC Timetable helps students view academic timetables and optionally synchronize timetable events with Google Calendar. This policy explains what information the service uses and how it is handled.</p>
          </section>

          <section>
            <h2>Information We Use</h2>
            <ul>
              <li>Account information provided through Clerk, such as your name, email address, and profile image.</li>
              <li>Your optional default batch preference, used to select and display your timetable across devices.</li>
              <li>Google account and Calendar information only when you choose to connect Google Calendar.</li>
              <li>Technical request and authentication information needed to operate and protect the service.</li>
            </ul>
          </section>

          <section>
            <h2>Google Calendar</h2>
            <p>If you enable Calendar Sync, the service uses Google OAuth to create and manage the timetable calendar and events requested by you. Calendar data is used only to provide synchronization, is not sold, and is not used for advertising. You can disconnect Google Calendar or clear the events created by MLSC Timetable from your profile.</p>
          </section>

          <section>
            <h2>How We Use Information</h2>
            <p>We use information to authenticate users, provide timetable features, save preferences, synchronize requested calendar events, maintain service security, and respond to support or administrative requests.</p>
          </section>

          <section>
            <h2>Sharing and Storage</h2>
            <p>We do not sell personal information. Account and application data may be processed by service providers required to operate the service, including Clerk for authentication, Railway for hosting, and MongoDB for application storage. Google data remains subject to Google’s policies and your Google account controls.</p>
          </section>

          <section>
            <h2>Choices and Deletion</h2>
            <p>You may disconnect Google Calendar, remove synchronized calendar events, update your profile, or request account-related deletion by contacting the MLSC team. You can also revoke the application’s Google access from your Google Account security settings.</p>
          </section>

          <section>
            <h2>Contact</h2>
            <p>For privacy questions or deletion requests, contact the Microsoft Learn Student Chapter at Thapar Institute of Engineering and Technology through its official channels.</p>
          </section>
        </article>
      </div>
    </main>
  )
}
