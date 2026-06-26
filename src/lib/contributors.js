/**
 * Load the contributor list according to VITE_CONTRIBUTORS_SOURCE:
 *   - "repo"  (default): GitHub repo(s) only — uses the dev /api/contributors
 *     middleware in development, or hits the GitHub REST API directly from
 *     the browser in production. Multiple repos are unioned by username.
 *   - "db":  backend collection only — GET ${VITE_BACKEND_URL}/contributors
 *   - "union": union of repo + db, deduplicated by username
 *
 * Resulting items: { id?, login, avatar_url, html_url }
 */

const SHAPE_KEYS = ['id', 'login', 'avatar_url', 'html_url']

function pickShape(obj) {
  const out = {}
  for (const k of SHAPE_KEYS) if (obj[k] != null) out[k] = obj[k]
  return out
}

function unionByLogin(...lists) {
  const merged = new Map()
  for (const list of lists) {
    for (const item of list || []) {
      if (!item?.login) continue
      if (merged.has(item.login)) continue
      merged.set(item.login, pickShape(item))
    }
  }
  return [...merged.values()]
}

function getRepos() {
  const csv = import.meta.env.VITE_GITHUB_REPOS || import.meta.env.VITE_GITHUB_REPO || ''
  return csv
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

function getBackendUrl() {
  return (import.meta.env.VITE_BACKEND_URL || '').replace(/\/$/, '')
}

async function fetchFromMiddleware() {
  // The dev server middleware already returns a unioned list.
  try {
    const r = await fetch('/api/contributors')
    if (!r.ok) return null
    const data = await r.json()
    return Array.isArray(data) ? data : null
  } catch {
    return null
  }
}

async function fetchFromGitHubDirect(repos) {
  const lists = await Promise.all(
    repos.map((repo) =>
      fetch(`https://api.github.com/repos/${repo}/contributors?per_page=100`)
        .then((r) => (r.ok ? r.json() : []))
        .catch(() => []),
    ),
  )
  return unionByLogin(...lists)
}

async function fetchFromRepos() {
  // Prefer the dev middleware so a configured GITHUB_TOKEN is used; fall back
  // to direct browser calls in production builds.
  const viaMiddleware = await fetchFromMiddleware()
  if (Array.isArray(viaMiddleware)) return viaMiddleware
  const repos = getRepos()
  if (repos.length === 0) return []
  return fetchFromGitHubDirect(repos)
}

async function fetchFromBackend() {
  const base = getBackendUrl()
  if (!base) return []
  try {
    const r = await fetch(`${base}/contributors`)
    if (!r.ok) return []
    const data = await r.json()
    return Array.isArray(data) ? data.map(pickShape) : []
  } catch {
    return []
  }
}

export async function loadContributors() {
  const source = (import.meta.env.VITE_CONTRIBUTORS_SOURCE || 'repo').toLowerCase()

  if (source === 'db') return fetchFromBackend()
  if (source === 'union') {
    const [a, b] = await Promise.all([fetchFromRepos(), fetchFromBackend()])
    return unionByLogin(a, b)
  }
  return fetchFromRepos()
}
