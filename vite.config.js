import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  return {
    define: {
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

            const repo = env.GITHUB_REPO
            if (!repo) {
              res.writeHead(500, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ error: 'GITHUB_REPO env var not set' }))
              return
            }

            try {
              const headers = { 'Accept': 'application/vnd.github+json' }
              if (env.GITHUB_TOKEN) headers['Authorization'] = `Bearer ${env.GITHUB_TOKEN}`

              const response = await fetch(
                `https://api.github.com/repos/${repo}/contributors?per_page=100`,
                { headers }
              )

              if (response.status === 204) {
                res.writeHead(200, { 'Content-Type': 'application/json' })
                res.end(JSON.stringify([]))
                return
              }

              if (!response.ok) {
                res.writeHead(response.status, { 'Content-Type': 'application/json' })
                res.end(JSON.stringify({ error: `GitHub API error: ${response.statusText}` }))
                return
              }

              const data = await response.json()
              const contributors = data.map(({ login, avatar_url, html_url, id }) => ({
                id,
                login,
                avatar_url,
                html_url,
              }))

              res.writeHead(200, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify(contributors))
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
