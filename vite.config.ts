import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'
import { VitePWA } from 'vite-plugin-pwa'
import { handleInsights } from './api/insights.ts'
import { handleParseExpenses } from './api/parse-expenses.ts'
import { computeAdminStats, AdminConfigError } from './dev/admin/stats.ts'

/**
 * Serves /api/insights during `npm run dev`, using the same handler as the
 * Vercel function. Secrets are read from .env here and never reach the bundle.
 */
function insightsDevApi(env: Record<string, string>): Plugin {
  return {
    name: 'famfinance-insights-dev-api',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/api/insights', async (req, res, next) => {
        if (req.method !== 'POST') return next()
        let raw = ''
        for await (const chunk of req) raw += chunk
        let body: unknown = {}
        try {
          body = raw ? JSON.parse(raw) : {}
        } catch {
          body = {}
        }
        const result = await handleInsights({
          method: req.method,
          authorization: req.headers.authorization,
          body,
          env: {
            SUPABASE_URL: env.VITE_SUPABASE_URL,
            SUPABASE_ANON_KEY: env.VITE_SUPABASE_ANON_KEY,
            GROQ_API_KEY: env.GROQ_API_KEY,
            GROQ_MODEL: env.GROQ_MODEL,
          },
        })
        res.statusCode = result.status
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify(result.body))
      })
    },
  }
}

/** Dev-only voice/text expense parsing, mirroring api/parse-expenses.ts. */
function parseExpensesDevApi(env: Record<string, string>): Plugin {
  return {
    name: 'famfinance-parse-expenses-dev-api',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/api/parse-expenses', async (req, res, next) => {
        if (req.method !== 'POST') return next()
        let raw = ''
        for await (const chunk of req) raw += chunk
        let body: unknown = {}
        try {
          body = raw ? JSON.parse(raw) : {}
        } catch {
          body = {}
        }
        const result = await handleParseExpenses({
          method: req.method,
          authorization: req.headers.authorization,
          body,
          env: {
            SUPABASE_URL: env.VITE_SUPABASE_URL,
            SUPABASE_ANON_KEY: env.VITE_SUPABASE_ANON_KEY,
            GROQ_API_KEY: env.GROQ_API_KEY,
            GROQ_MODEL: env.GROQ_MODEL,
          },
        })
        res.statusCode = result.status
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify(result.body))
      })
    },
  }
}

/**
 * Admin statistics, served ONLY by the local dev server and ONLY to requests that
 * come from this machine. Not present in the production build or on Vercel.
 */
function adminDevApi(env: Record<string, string>): Plugin {
  const LOCAL_ADDRESSES = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1'])
  return {
    name: 'famfinance-admin-dev-api',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/api/admin/stats', async (req, res, next) => {
        if (req.method !== 'GET') return next()
        const remote = req.socket.remoteAddress ?? ''
        const host = (req.headers.host ?? '').split(':')[0]
        if (!LOCAL_ADDRESSES.has(remote) || !['localhost', '127.0.0.1', '[::1]', '::1'].includes(host)) {
          res.statusCode = 403
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: 'Admin is only available from localhost' }))
          return
        }
        try {
          const stats = await computeAdminStats({
            SUPABASE_URL: env.VITE_SUPABASE_URL,
            SUPABASE_SERVICE_ROLE_KEY: env.SUPABASE_SERVICE_ROLE_KEY,
          })
          res.statusCode = 200
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify(stats))
        } catch (err) {
          res.statusCode = err instanceof AdminConfigError ? 503 : 500
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: err instanceof Error ? err.message : 'Stats failed' }))
        }
      })
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
  // IPv4 loopback: browsers that resolve localhost to 127.0.0.1 (the default on
  // many machines) could not reach the IPv6-only default binding.
  server: { host: '127.0.0.1', port: 5173 },
  plugins: [
    react(),
    tailwindcss(),
    insightsDevApi(env),
    parseExpensesDevApi(env),
    adminDevApi(env),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'robots.txt'],
      manifest: {
        name: 'FamFinance',
        short_name: 'FamFinance',
        description: 'Family finance management for households',
        theme_color: '#0F172A',
        background_color: '#FFFFFF',
        display: 'standalone',
        orientation: 'portrait-primary',
        scope: '/',
        start_url: '/',
        icons: [
          {
            src: '/icons/icon-72x72.png',
            sizes: '72x72',
            type: 'image/png',
            purpose: 'any maskable'
          },
          {
            src: '/icons/icon-96x96.png',
            sizes: '96x96',
            type: 'image/png',
            purpose: 'any maskable'
          },
          {
            src: '/icons/icon-128x128.png',
            sizes: '128x128',
            type: 'image/png',
            purpose: 'any maskable'
          },
          {
            src: '/icons/icon-144x144.png',
            sizes: '144x144',
            type: 'image/png',
            purpose: 'any maskable'
          },
          {
            src: '/icons/icon-152x152.png',
            sizes: '152x152',
            type: 'image/png',
            purpose: 'any maskable'
          },
          {
            src: '/icons/icon-192x192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any maskable'
          },
          {
            src: '/icons/icon-384x384.png',
            sizes: '384x384',
            type: 'image/png',
            purpose: 'any maskable'
          },
          {
            src: '/icons/icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/.*\.supabase\.co\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'supabase-api',
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 60 * 24
              },
              networkTimeoutSeconds: 10
            }
          }
        ]
      }
    })
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  }
})