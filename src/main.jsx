import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { ClerkProvider } from '@clerk/clerk-react'
import './index.css'
import './themes/index.css'
import App from './App.jsx'
import { AUTH_ENABLED, CLERK_PUBLISHABLE_KEY } from './lib/auth'

const tree = (
  <BrowserRouter>
    {AUTH_ENABLED ? (
      <ClerkProvider publishableKey={CLERK_PUBLISHABLE_KEY} afterSignOutUrl="/">
        <App />
      </ClerkProvider>
    ) : (
      <App />
    )}
  </BrowserRouter>
)

createRoot(document.getElementById('root')).render(
  <StrictMode>{tree}</StrictMode>,
)
