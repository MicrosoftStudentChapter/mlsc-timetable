import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Navbar from '../components/Navbar'
import Footer from '../components/Footer'
import ContributorsScroller from '../components/ContributorsScroller'
import BatchSelector from '../components/BatchSelector'
import { loadContributors } from '../lib/contributors'
import '../App.css'

export default function LandingPage() {
  const [contributors, setContributors] = useState([])
  const [semLabel, setSemLabel] = useState('ODD 26-27')

  useEffect(() => {
    let cancelled = false
    loadContributors()
      .then((list) => {
        if (!cancelled && Array.isArray(list)) setContributors(list)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    const baseUrl = import.meta.env.VITE_BACKEND_URL
    const fallbackUrl = `${import.meta.env.BASE_URL || '/'}fallback/current.json`

    const apply = (d) => {
      if (cancelled || !d) return
      if (typeof d.label === 'string' && d.label) setSemLabel(d.label)
      else if (d.season && d.year) setSemLabel(`${d.season} ${d.year}`)
    }
    const fetchJson = (url) =>
      fetch(url).then((r) => (r.ok ? r.json() : null)).catch(() => null)

    ;(async () => {
      if (baseUrl) {
        const live = await fetchJson(`${baseUrl.replace(/\/$/, '')}/current`)
        if (live) {
          apply(live)
          return
        }
      }
      apply(await fetchJson(fallbackUrl))
    })()

    return () => {
      cancelled = true
    }
  }, [])

  return (
    <>
      <main className="main">
        <header className="page-header">
          <img src="/MLSC-logo.png" alt="MLSC" className="page-header-logo" />
          <p className="page-tagline">MLSC TIMETABLE</p>
        </header>

        <div className="center-grid">
          {/* LEFT — logo only, no container */}
          <div className="left-panel">
            <img src="/MLSC-logo.png" alt="MLSC Logo" className="brand-logo" />
          </div>

          {/* RIGHT — titled card with selection inside */}
          <div className="right-panel">
            <div className="brand-card">
              <div className="brand-heading">
                <p className="brand-title">
                  MLSC TIMETABLE <span className="brand-sem">{semLabel}</span>
                </p>
                <p className="brand-affiliation">Thapar Institute of Engineering &amp; Tech.</p>
              </div>
              <div className="brand-logo-box">
                <BatchSelector />
              </div>
            </div>
          </div>
        </div>

        <section className="contributors-section">
          <p className="short-tagline">Built by the community</p>
          <ContributorsScroller contributors={contributors} />
          <a
            href={`https://github.com/${import.meta.env.VITE_GITHUB_REPO || 'MicrosoftStudentChapter/mlsc-timetable'}`}
            target="_blank"
            rel="noreferrer"
            className="repo-link"
          >
            Repo Link ↗
          </a>
          <div className="landing-legal-links">
            <Link to="/privacy">Privacy Policy</Link>
            <span className="landing-legal-sep">•</span>
            <Link to="/terms">Terms of Service</Link>
          </div>
        </section>
      </main>

      <Navbar />
      <Footer />
    </>
  )
}
