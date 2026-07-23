import { Routes, Route } from 'react-router-dom'
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

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      {/* Clerk's <SignIn routing="path" /> needs the route to capture sub-paths
          like /login/factor-one, /login/sso-callback, etc. */}
      <Route path="/login/*" element={<LoginPage />} />
      <Route path="/profile" element={<ProfilePage />} />
      <Route path="/timetable/:batch" element={<TimetablePage />} />
      <Route path="/privacy" element={<PrivacyPage />} />
      <Route path="/terms" element={<TermsPage />} />
      <Route path="/admin" element={<AdminLayout />}>
        <Route index element={<Dashboard />} />
        <Route path="uploads" element={<UploadsPage />} />
        <Route path="uploads/:id" element={<UploadDetailPage />} />
        <Route path="change-requests" element={<ChangeRequestsPage />} />
        <Route path="catalog" element={<CatalogPage />} />
        <Route path="baselines" element={<BaselinesPage />} />
        <Route path="content" element={<ContentPage />} />
        <Route path="contributors" element={<ContributorsPage />} />
        <Route path="users" element={<AdminUsersPage />} />
        <Route path="fix" element={<FixPage />} />
        <Route path="fix/timetable/:batch" element={<FixTimetablePage />} />
      </Route>
    </Routes>
  )
}
