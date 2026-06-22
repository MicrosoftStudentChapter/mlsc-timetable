import { useState } from 'react';
import './side_columns.css';

export function SidebarContent() {
  // Mini Calendar generation for June 2026
  // June 1, 2026 is a Monday. June 2026 has 30 days.
  const daysOfWeek = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  const calendarDays = [];
  
  // June 1 starts on Mon, which is index 0 in our M-S array.
  // No prepended empty days needed.
  for (let i = 1; i <= 30; i++) {
    calendarDays.push(i);
  }

  return (
    <div className="sidebar-inner">
      {/* 1. Logo Section */}
      <div className="sidebar-logo-container">
        <div className="logo-img-wrapper">
          <img src="/MLSC-logo.png" alt="MLSC Logo" className="sidebar-logo-img" />
        </div>
        <h2 className="sidebar-logo-text">MLSC TIMETABLE</h2>
      </div>

      {/* 2. Announcement Card */}
      <div className="dashboard-card announcement-card">
        <h3 className="card-title">Announcements</h3>
        <p className="card-placeholder-text">No announcements yet</p>
      </div>

      {/* 3. Exam Dates Card */}
      <div className="dashboard-card exam-card">
        <h3 className="card-title">Exam Dates</h3>
        <p className="card-placeholder-text">No dates scheduled</p>
      </div>

      {/* 4. Calendar Card */}
      <div className="dashboard-card calendar-card">
        <div className="calendar-header">
          <h3 className="card-title">Calendar</h3>
          <span className="calendar-month-year">June 2026</span>
        </div>
        <div className="mini-calendar">
          <div className="calendar-weekdays">
            {daysOfWeek.map((day, idx) => (
              <span key={idx} className="calendar-weekday">{day}</span>
            ))}
          </div>
          <div className="calendar-grid">
            {calendarDays.map((day) => (
              <span 
                key={day} 
                className={`calendar-day ${day === 15 ? 'today' : ''}`}
              >
                {day}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* 5. Profile Card */}
      <div className="dashboard-card profile-card">
        <div className="profile-avatar">S</div>
        <div className="profile-info">
          <span className="profile-name">Student</span>
          <span className="profile-subtitle">Profile placeholder</span>
        </div>
      </div>
    </div>
  );
}

export function DashboardLayout({ children }) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  const toggleDrawer = () => {
    setDrawerOpen(!drawerOpen);
  };

  return (
    <div className="dashboard-layout">
      {/* Desktop & Tablet Sidebar (fixed/static) */}
      <aside className="dashboard-sidebar">
        <SidebarContent />
      </aside>

      {/* Mobile Drawer */}
      <div className={`mobile-drawer-overlay ${drawerOpen ? 'open' : ''}`} onClick={() => setDrawerOpen(false)}>
        <div className="mobile-drawer" onClick={(e) => e.stopPropagation()}>
          <button className="close-drawer-btn" onClick={() => setDrawerOpen(false)} aria-label="Close menu">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
          <SidebarContent />
        </div>
      </div>

      {/* Main Content Area */}
      <div className="dashboard-main">
        {/* Header Section */}
        <header className="dashboard-header">
          <div className="header-left">
            {/* Hamburger Button for mobile */}
            <button className="hamburger-btn" onClick={toggleDrawer} aria-label="Open menu">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="3" y1="12" x2="21" y2="12"></line>
                <line x1="3" y1="6" x2="21" y2="6"></line>
                <line x1="3" y1="18" x2="21" y2="18"></line>
              </svg>
            </button>
            <h1 className="welcome-heading">Welcome, Student</h1>
          </div>
        </header>

        {/* Existing Timetable Page Content */}
        <div className="dashboard-content">
          {children}
        </div>
      </div>
    </div>
  );
}
