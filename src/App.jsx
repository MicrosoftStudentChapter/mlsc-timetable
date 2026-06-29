import { Routes, Route } from 'react-router-dom'
import LandingPage from './pages/LandingPage'
import LoginPage from './pages/LoginPage'
import ProfilePage from './pages/ProfilePage'
import TimetablePage from './pages/TimetablePage'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      {/* Clerk's <SignIn routing="path" /> needs the route to capture sub-paths
          like /login/factor-one, /login/sso-callback, etc. */}
      <Route path="/login/*" element={<LoginPage />} />
      <Route path="/profile" element={<ProfilePage />} />
      <Route path="/timetable/:batch" element={<TimetablePage />} />
    </Routes>
  )
}
