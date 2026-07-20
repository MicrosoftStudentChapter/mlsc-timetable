export function getBackendUrl() {
  const raw = String(import.meta.env.VITE_BACKEND_URL || '').trim()
  if (!raw) return ''
  const value = /^[a-z][a-z\d+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`
  try {
    return new URL(value).origin
  } catch {
    return ''
  }
}
