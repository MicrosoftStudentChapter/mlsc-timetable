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

function PublicLayout() {
  const [siteStatus, setSiteStatusState] = useState(() => getSiteStatusSync())

  useEffect(() => {
    fetchSiteStatus().then(setSiteStatusState).catch(() => {})
    const unsubscribe = subscribeSiteStatus(setSiteStatusState)
    return () => unsubscribe()
  }, [])

  if (siteStatus.maintenance) {
    return <SiteMaintenancePage message={siteStatus.message} />
  }

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

