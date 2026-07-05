// Gate the /admin/* routes on the backend's whoami response.
// Status values:
//   'loading'        — initial request / Clerk loading
//   'authorized'     — admin (kind + email available)
//   'not_signed_in'  — Clerk loaded, no active session
//   'denied'         — backend reachable, signed-in email is not on allowlist
//   'no_backend'     — VITE_BACKEND_URL not set
//   'error'          — network / 5xx
//
// Callers can read `principal` (kind, email) when status === 'authorized'.

import { useEffect, useState } from 'react'
import { getWhoami, isAdminEnabled } from '../lib/admin'
import { AUTH_ENABLED, useAuthUser } from '../lib/auth'

export function useAdminSession() {
  const { isLoaded, isSignedIn } = useAuthUser()
  const [status, setStatus] = useState('loading')
  const [principal, setPrincipal] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!isAdminEnabled()) {
      setStatus('no_backend')
      return
    }
    if (!AUTH_ENABLED) {
      // Clerk isn't configured on the frontend — can't sign in to get a JWT.
      setStatus('not_signed_in')
      return
    }
    if (!isLoaded) {
      setStatus('loading')
      return
    }
    if (!isSignedIn) {
      setStatus('not_signed_in')
      setPrincipal(null)
      return
    }

    let cancelled = false
    setStatus('loading')
    setError(null)
    getWhoami()
      .then((data) => {
        if (cancelled) return
        if (data?.is_admin) {
          setPrincipal({ kind: data.kind, email: data.email })
          setStatus('authorized')
        } else {
          setStatus('denied')
        }
      })
      .catch((err) => {
        if (cancelled) return
        setError(err)
        if (err?.code === 'not_signed_in') {
          setStatus('not_signed_in')
        } else if (err?.status === 401 || err?.status === 403) {
          setStatus('denied')
        } else {
          setStatus('error')
        }
      })
    return () => {
      cancelled = true
    }
  }, [isLoaded, isSignedIn])

  return { status, principal, error }
}
