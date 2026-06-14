import { useEffect, useState } from 'react'
import Navbar from './components/Navbar'
import Footer from './components/Footer'
import ContributorsScroller from './components/ContributorsScroller'
import BatchSelector from './components/BatchSelector'
import './App.css'

function App() {
  const [contributors, setContributors] = useState([])
  const [semLabel, setSemLabel] = useState('ODD SEM 26-27')

  useEffect(() => {
    fetch('/api/contributors')
      .then((r) => r.json())
      .then((d) => Array.isArray(d) && setContributors(d))
      .catch(() => {})
  }, [])

  useEffect(() => {
    const baseUrl = import.meta.env.VITE_BACKEND_URL
    if (!baseUrl) return
    const url = `${baseUrl.replace(/\/$/, '')}/current`
    fetch(url)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d) return
        if (typeof d.label === 'string' && d.label) setSemLabel(d.label)
        else if (d.season && d.year) setSemLabel(`${d.season} SEM ${d.year}`)
      })
      .catch(() => {})
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
                <p className="brand-title">MLSC TIMETABLE</p>
                <p className="brand-subtitle">{semLabel}</p>
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
            href="https://github.com/MicrosoftStudentChapter/mlsc-timetable"
            target="_blank"
            rel="noreferrer"
            className="repo-link"
          >
            Repo Link ↗
          </a>
        </section>
      </main>

      <Navbar />
      <Footer />
    </>
  )
}

export default App
