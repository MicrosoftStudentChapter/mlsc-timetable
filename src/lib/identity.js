// Per-user opaque identity stored locally; sent as `X-User-Id` to the backend.
//
// We don't have real auth yet — the backend just upserts a `UserDoc` from this
// header so we can hang per-user state (default batch, overrides) off it.

const STORAGE_KEY = 'mlsc.user_id'

function mintId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  // Tiny fallback: 24 alphanumerics. Server requires 4..64 of [A-Za-z0-9_-].
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  let out = ''
  for (let i = 0; i < 24; i += 1) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)]
  }
  return out
}

function isUsableStorage() {
  try {
    return typeof window !== 'undefined' && !!window.localStorage
  } catch {
    return false
  }
}

let cached = null

export function getUserId() {
  if (cached) return cached
  if (isUsableStorage()) {
    const existing = window.localStorage.getItem(STORAGE_KEY)
    if (existing && /^[A-Za-z0-9_-]{4,64}$/.test(existing)) {
      cached = existing
      return cached
    }
    const minted = mintId()
    try {
      window.localStorage.setItem(STORAGE_KEY, minted)
    } catch {
      // Storage might be full / disabled; we still return the minted id
      // for this session.
    }
    cached = minted
    return cached
  }
  cached = mintId()
  return cached
}

export function resetUserId() {
  cached = null
  if (isUsableStorage()) {
    try {
      window.localStorage.removeItem(STORAGE_KEY)
    } catch {
      // ignore
    }
  }
}

export function authHeaders(extra = {}) {
  return { 'X-User-Id': getUserId(), ...extra }
}
