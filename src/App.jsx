import { useEffect, useState } from 'react'
import Navbar from './components/Navbar'
import Footer from './components/Footer'
import ContributorsScroller from './components/ContributorsScroller'
import BatchSelector from './components/BatchSelector'
import { useNavbarPadding } from './hooks/useNavbarPadding'
import './App.css'

function App() {
  const [contributors, setContributors] = useState([])
  useNavbarPadding()

  useEffect(() => {
    fetch('/api/contributors')
      .then((r) => r.json())
      .then((d) => Array.isArray(d) && setContributors(d))
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
              <p className="brand-title">MLSC TIMETABLE ODD-SEM</p>
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
