import { useState, useEffect } from 'react'
import { Routes, Route, Outlet } from 'react-router-dom'
import LandingPage from './pages/LandingPage'
import LoginPage from './pages/LoginPage'
import ProfilePage from './pages/ProfilePage'
import TimetablePage from './pages/TimetablePage'
import PrivacyPage from './pages/PrivacyPage'
import TermsPage from './pages/TermsPage'
import AdminLayout from './pages/admin/AdminLayout'
import Dashboard from './pages/admin/Dashboard'
import UploadsPage from './pages/admin/UploadsPage'
import UploadDetailPage from './pages/admin/UploadDetailPage'
import AdminUsersPage from './pages/admin/AdminUsersPage'
import BaselinesPage from './pages/admin/BaselinesPage'
import ContentPage from './pages/admin/ContentPage'
import ContributorsPage from './pages/admin/ContributorsPage'
import ChangeRequestsPage from './pages/admin/ChangeRequestsPage'
import FixPage from './pages/admin/FixPage'
import FixTimetablePage from './pages/admin/FixTimetablePage'
import CatalogPage from './pages/admin/CatalogPage'
import AnalyticsPage from './pages/admin/AnalyticsPage'
import TimetablesPage from './pages/admin/TimetablesPage'
import TeacherVisibilityPage from './pages/admin/TeacherVisibilityPage'
import LibraryPage from './pages/admin/LibraryPage'
import SiteMaintenancePage from './components/SiteMaintenancePage'
import { getSiteStatusSync, fetchSiteStatus, subscribeSiteStatus } from './lib/siteStatus'

// How often an open tab re-checks the takedown state, so a visitor who already
// has the page loaded still gets pulled onto the maintenance screen.
const SITE_STATUS_POLL_MS = 60_000

function PublicLayout() {
  const [siteStatus, setSiteStatusState] = useState(() => getSiteStatusSync())
  // Until the server answers once we only have a possibly-stale cache, so hold
  // the render back rather than flashing the live site during a takedown.
  const [resolved, setResolved] = useState(false)

  useEffect(() => {
    let cancelled = false

    const refresh = () => {
      fetchSiteStatus()
        .then((status) => {
          if (!cancelled) setSiteStatusState(status)
        })
        .catch(() => {
          // Fail open: a backend blip should not black out the whole site.
          // The cached value seeded into state stays in effect.
        })
        .finally(() => {
          if (!cancelled) setResolved(true)
        })
    }

    refresh()
    const unsubscribe = subscribeSiteStatus(setSiteStatusState)
    const timer = setInterval(refresh, SITE_STATUS_POLL_MS)
    const onFocus = () => {
      if (document.visibilityState === 'visible') refresh()
    }
    document.addEventListener('visibilitychange', onFocus)

    return () => {
      cancelled = true
      unsubscribe()
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onFocus)
    }
  }, [])

  if (siteStatus.maintenance) {
    return <SiteMaintenancePage message={siteStatus.message} />
  }

  if (!resolved) return null

  return <Outlet />
}

export default function App() {
  return (
    <Routes>
      {/* Public routes wrapped in site maintenance guard */}
      <Route element={<PublicLayout />}>
        <Route path="/" element={<LandingPage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/timetable/:batch" element={<TimetablePage />} />
        <Route path="/privacy" element={<PrivacyPage />} />
        <Route path="/terms" element={<TermsPage />} />
      </Route>

      {/* Clerk's <SignIn routing="path" /> needs the route to capture sub-paths
          like /login/factor-one, /login/sso-callback, etc. */}
      <Route path="/login/*" element={<LoginPage />} />

      {/* Admin routes remain accessible during maintenance */}
      <Route path="/admin" element={<AdminLayout />}>
        <Route index element={<Dashboard />} />
        <Route path="analytics" element={<AnalyticsPage />} />
        <Route path="uploads" element={<UploadsPage />} />
        <Route path="uploads/:id" element={<UploadDetailPage />} />
        <Route path="change-requests" element={<ChangeRequestsPage />} />
        <Route path="catalog" element={<CatalogPage />} />
        <Route path="library" element={<LibraryPage />} />
        <Route path="baselines" element={<BaselinesPage />} />
        <Route path="content" element={<ContentPage />} />
        <Route path="contributors" element={<ContributorsPage />} />
        <Route path="users" element={<AdminUsersPage />} />
        <Route path="fix" element={<FixPage />} />
        <Route path="fix/timetable/:batch" element={<FixTimetablePage />} />
        <Route path="timetables" element={<TimetablesPage />} />
        <Route path="timetables/:batch" element={<FixTimetablePage standalone />} />
        <Route path="teacher-codes" element={<TeacherVisibilityPage />} />
      </Route>
    </Routes>
  )
}

