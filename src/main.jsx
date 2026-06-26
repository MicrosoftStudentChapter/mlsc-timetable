import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import './index.css'
import './themes/index.css'
import App from './App.jsx'
import TimetablePage from './pages/TimetablePage.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<App />} />
        <Route path="/timetable/:batch" element={<TimetablePage />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)
