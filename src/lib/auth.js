// Central place to detect whether Clerk auth is configured.
// Login is OPTIONAL — the site renders fine without it. When AUTH_ENABLED is
// false, every Clerk touchpoint becomes a no-op so the app still works.

import { useUser as useClerkUser, useAuth as useClerkAuth } from '@clerk/clerk-react'

const rawKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY

function isUsableKey(key) {
  if (!key || typeof key !== 'string') return false
  if (!key.startsWith('pk_')) return false
  // Placeholders from .env.example
  if (key.includes('replace_me') || key.endsWith('_here')) return false
  return key.length > 20
}

export const AUTH_ENABLED = isUsableKey(rawKey)
export const CLERK_PUBLISHABLE_KEY = AUTH_ENABLED ? rawKey : null

if (!AUTH_ENABLED && rawKey) {
  // eslint-disable-next-line no-console
  console.warn('[auth] VITE_CLERK_PUBLISHABLE_KEY looks invalid — running without auth.')
} else if (!AUTH_ENABLED) {
  // eslint-disable-next-line no-console
  console.info('[auth] No VITE_CLERK_PUBLISHABLE_KEY set — running without auth.')
}

// Hook resolved once at module load so React's hook rules stay happy.
// When auth is disabled, we return a stable stub instead of calling Clerk.
export const useAuthUser = AUTH_ENABLED
  ? function useAuthUserClerk() {
      const { isLoaded, isSignedIn, user } = useClerkUser()
      return { isLoaded, isSignedIn: !!isSignedIn, user: user ?? null }
    }
  : function useAuthUserStub() {
      return { isLoaded: true, isSignedIn: false, user: null }
    }

// Exposes getToken for calendar sync. Stub returns null when auth is off.
export const useCalendarAuth = AUTH_ENABLED
  ? function useCalendarAuthClerk() {
      const { getToken } = useClerkAuth()
      return { getToken }
    }
  : function useCalendarAuthStub() {
      return { getToken: async () => null }
    }
