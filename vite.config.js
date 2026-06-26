import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  // Comma-separated repo list; falls back to legacy single-repo var.
  const reposCsv = (env.GITHUB_REPOS || env.GITHUB_REPO || '').trim()

  return {
    define: {
      // Expose the (possibly comma-separated) repo list to the browser. The
      // singular var is kept for back-compat — frontend code reads either.
      'import.meta.env.VITE_GITHUB_REPOS': JSON.stringify(reposCsv),
      'import.meta.env.VITE_GITHUB_REPO': JSON.stringify(env.GITHUB_REPO || ''),
    },
    plugins: [
      react(),
      {
        name: 'contributors-api',
        configureServer(server) {
          server.middlewares.use('/api/contributors', async (req, res) => {
            if (req.method !== 'GET') {
              res.writeHead(405, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ error: 'Method not allowed' }))
              return
            }

            const repos = reposCsv
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean)

            if (repos.length === 0) {
              res.writeHead(500, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ error: 'GITHUB_REPOS / GITHUB_REPO env var not set' }))
              return
            }

            try {
              const headers = { Accept: 'application/vnd.github+json' }
              if (env.GITHUB_TOKEN) headers['Authorization'] = `Bearer ${env.GITHUB_TOKEN}`

              const fetchOne = async (repo) => {
                const response = await fetch(
                  `https://api.github.com/repos/${repo}/contributors?per_page=100`,
                  { headers },
                )
                if (response.status === 204) return []
                if (!response.ok) return []
                return response.json()
              }

              const lists = await Promise.all(repos.map(fetchOne))

              // Union by login; keep first-seen avatar/html_url.
              const merged = new Map()
              for (const list of lists) {
                for (const { id, login, avatar_url, html_url } of list || []) {
                  if (!login || merged.has(login)) continue
                  merged.set(login, { id, login, avatar_url, html_url })
                }
              }

              res.writeHead(200, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify([...merged.values()]))
            } catch (err) {
              res.writeHead(500, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ error: err.message }))
            }
          })
        },
      },
    ],
  }
})
