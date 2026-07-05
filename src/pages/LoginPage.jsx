import { useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import {
  useSignIn,
  useSignUp,
  useUser,
  AuthenticateWithRedirectCallback,
} from '@clerk/clerk-react'
import { AUTH_ENABLED } from '../lib/auth'
import './LoginPage.css'

const SIGN_IN_REDIRECT = '/profile'

function GoogleIcon() {
  return (
    <svg className="login-icon" viewBox="0 0 24 24" width="18" height="18" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" fill="#EA4335"/>
    </svg>
  )
}

function firstError(err, fallback = 'Something went wrong. Try again.') {
  return err?.errors?.[0]?.longMessage || err?.errors?.[0]?.message || err?.message || fallback
}

function NotConfigured() {
  return (
    <main className="login-page">
      <div className="login-box">
        <div className="login-fallback">
          <h1 className="login-fallback-title">Sign-in coming soon</h1>
          <p className="login-fallback-text">
            Accounts aren&apos;t enabled in this build yet. You can keep using
            the timetable without signing in.
          </p>
          <Link to="/" className="login-fallback-btn">← Back home</Link>
        </div>
      </div>
    </main>
  )
}

function SignInForm({ onSwitch }) {
  const { isLoaded, signIn, setActive } = useSignIn()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!isLoaded || busy) return
    setBusy(true)
    setError('')
    try {
      const result = await signIn.create({ identifier: email, password })
      if (result.status === 'complete') {
        await setActive({ session: result.createdSessionId })
        navigate(SIGN_IN_REDIRECT, { replace: true })
      } else {
        setError('Additional verification required. Try the email link Clerk sent you.')
      }
    } catch (err) {
      setError(firstError(err, 'Could not sign in.'))
    } finally {
      setBusy(false)
    }
  }

  async function handleGoogle() {
    if (!isLoaded || busy) return
    setBusy(true)
    setError('')
    try {
      await signIn.authenticateWithRedirect({
        strategy: 'oauth_google',
        redirectUrl: window.location.origin + '/login/sso-callback',
        redirectUrlComplete: window.location.origin + SIGN_IN_REDIRECT,
      })
    } catch (err) {
      setError(firstError(err, 'Could not start Google sign-in.'))
      setBusy(false)
    }
  }

  return (
    <form className="login-form" onSubmit={handleSubmit}>
      <div className="login-logo-container">
        <img src="/MLSC-logo.png" alt="MLSC" className="login-logo-img" />
      </div>

      <span className="login-header">Welcome Back!</span>

      <input
        type="email"
        placeholder="Email"
        className="login-input"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        autoComplete="email"
        required
      />
      <input
        type="password"
        placeholder="Password"
        className="login-input"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        autoComplete="current-password"
        required
      />

      {error && <p className="login-error">{error}</p>}

      <button type="submit" className="login-button login-button--primary" disabled={busy}>
        {busy ? 'Signing in…' : 'Sign In'}
      </button>

      <button type="button" className="login-button login-button--google" onClick={handleGoogle} disabled={busy}>
        <GoogleIcon />
        Sign in with Google
      </button>

      <div className="login-footer">
        <p className="login-footer-prompt">
          Don&apos;t have an account?{' '}
          <button type="button" className="login-link login-linkbtn" onClick={onSwitch}>
            Sign up, it&apos;s free!
          </button>
        </p>
      </div>
    </form>
  )
}

function SignUpForm({ onSwitch, onVerifyNeeded }) {
  const { isLoaded, signUp, setActive } = useSignUp()
  const { signIn } = useSignIn()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!isLoaded || busy) return
    setBusy(true)
    setError('')
    try {
      const result = await signUp.create({ emailAddress: email, password })
      if (result.status === 'complete') {
        await setActive({ session: result.createdSessionId })
        navigate(SIGN_IN_REDIRECT, { replace: true })
      } else {
        await signUp.prepareEmailAddressVerification({ strategy: 'email_code' })
        onVerifyNeeded(email)
      }
    } catch (err) {
      setError(firstError(err, 'Could not create your account.'))
    } finally {
      setBusy(false)
    }
  }

  async function handleGoogle() {
    if (!signIn || busy) return
    setBusy(true)
    setError('')
    try {
      // Same OAuth flow handles both sign-up and sign-in via Clerk.
      await signIn.authenticateWithRedirect({
        strategy: 'oauth_google',
        redirectUrl: window.location.origin + '/login/sso-callback',
        redirectUrlComplete: window.location.origin + SIGN_IN_REDIRECT,
      })
    } catch (err) {
      setError(firstError(err, 'Could not start Google sign-up.'))
      setBusy(false)
    }
  }

  return (
    <form className="login-form" onSubmit={handleSubmit}>
      <div className="login-logo-container">
        <img src="/MLSC-logo.png" alt="MLSC" className="login-logo-img" />
      </div>

      <span className="login-header">Create your account</span>

      <input
        type="email"
        placeholder="Email"
        className="login-input"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        autoComplete="email"
        required
      />
      <input
        type="password"
        placeholder="Password (min 8 chars)"
        className="login-input"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        autoComplete="new-password"
        minLength={8}
        required
      />

      {error && <p className="login-error">{error}</p>}

      <button type="submit" className="login-button login-button--primary" disabled={busy}>
        {busy ? 'Creating account…' : 'Sign Up'}
      </button>

      <button type="button" className="login-button login-button--google" onClick={handleGoogle} disabled={busy}>
        <GoogleIcon />
        Sign up with Google
      </button>

      <div className="login-footer">
        <p className="login-footer-prompt">
          Already have an account?{' '}
          <button type="button" className="login-link login-linkbtn" onClick={onSwitch}>
            Sign in
          </button>
        </p>
      </div>
    </form>
  )
}

function VerifyForm({ email, onBack }) {
  const { isLoaded, signUp, setActive } = useSignUp()
  const navigate = useNavigate()
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [resentAt, setResentAt] = useState(null)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!isLoaded || busy) return
    setBusy(true)
    setError('')
    try {
      const result = await signUp.attemptEmailAddressVerification({ code })
      if (result.status === 'complete') {
        await setActive({ session: result.createdSessionId })
        navigate(SIGN_IN_REDIRECT, { replace: true })
      } else {
        setError('Verification incomplete. Double-check the code and try again.')
      }
    } catch (err) {
      setError(firstError(err, 'Invalid or expired code.'))
    } finally {
      setBusy(false)
    }
  }

  async function handleResend() {
    if (!isLoaded || busy) return
    setBusy(true)
    setError('')
    try {
      await signUp.prepareEmailAddressVerification({ strategy: 'email_code' })
      setResentAt(Date.now())
    } catch (err) {
      setError(firstError(err, 'Could not resend code.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="login-form" onSubmit={handleSubmit}>
      <div className="login-logo-container">
        <img src="/MLSC-logo.png" alt="MLSC" className="login-logo-img" />
      </div>

      <span className="login-header">Check your email</span>
      <p className="login-subtle">We sent a 6-digit code to <strong>{email}</strong>.</p>

      <input
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        placeholder="Verification code"
        className="login-input"
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\s+/g, ''))}
        required
      />

      {error && <p className="login-error">{error}</p>}
      {resentAt && !error && <p className="login-subtle">New code sent.</p>}

      <button type="submit" className="login-button login-button--primary" disabled={busy}>
        {busy ? 'Verifying…' : 'Verify & continue'}
      </button>

      <button type="button" className="login-button login-button--ghost" onClick={handleResend} disabled={busy}>
        Resend code
      </button>

      <div className="login-footer">
        <button type="button" className="login-link login-linkbtn" onClick={onBack}>
          ← Use a different email
        </button>
      </div>
    </form>
  )
}

function ClerkLogin() {
  const navigate = useNavigate()
  const [mode, setMode] = useState('signIn') // 'signIn' | 'signUp' | 'verify'
  const [pendingEmail, setPendingEmail] = useState('')

  return (
    <main className="login-page">
      <div className="login-box">
        <button
          type="button"
          className="login-back-home-btn"
          onClick={() => navigate('/')}
          aria-label="Back to home"
        >
          ← Home
        </button>

        {mode === 'signIn' && (
          <SignInForm onSwitch={() => setMode('signUp')} />
        )}
        {mode === 'signUp' && (
          <SignUpForm
            onSwitch={() => setMode('signIn')}
            onVerifyNeeded={(email) => { setPendingEmail(email); setMode('verify') }}
          />
        )}
        {mode === 'verify' && (
          <VerifyForm email={pendingEmail} onBack={() => setMode('signUp')} />
        )}
      </div>
    </main>
  )
}

// Routes /login/sso-callback after a Google redirect so Clerk can finish
// the handshake and create the session.
function SsoCallback() {
  return (
    <main className="login-page">
      <div className="login-box">
        <p className="login-subtle" style={{ textAlign: 'center' }}>Finishing sign-in…</p>
        <AuthenticateWithRedirectCallback
          afterSignInUrl={SIGN_IN_REDIRECT}
          afterSignUpUrl={SIGN_IN_REDIRECT}
        />
      </div>
    </main>
  )
}

function ClerkRoot() {
  const location = useLocation()
  const { isSignedIn } = useUser()

  if (location.pathname.endsWith('/sso-callback')) return <SsoCallback />
  if (isSignedIn) return <Navigate to={SIGN_IN_REDIRECT} replace />
  return <ClerkLogin />
}

export default function LoginPage() {
  return AUTH_ENABLED ? <ClerkRoot /> : <NotConfigured />
}

// Guard wrapper for routes that need a signed-in user.
// Becomes a passthrough when auth is disabled so the site stays usable.
export function RequireAuth({ children }) {
  if (!AUTH_ENABLED) return children
  // We re-import here to keep the no-auth code path free of Clerk renders.
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const { isLoaded, isSignedIn } = useUser()
  if (!isLoaded) return null
  if (!isSignedIn) return <Navigate to="/login" replace />
  return children
}
