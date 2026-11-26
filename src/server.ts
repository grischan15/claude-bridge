import express, { type Express } from 'express'
import cors from 'cors'
import { bearerAuth } from './http/auth.js'
import { runHandler } from './http/runHandler.js'

export function createServer(token: string): Express {
  const app = express()
  // Local-only bridge: accept any localhost origin so the Vite Cockpit can
  // assign whatever port it likes (5180/5181/5182, ...) without breaking CORS.
  // /run is bearer-auth protected, so a wide CORS allowlist grants no access.
  app.use(cors({ origin: [/^http:\/\/localhost:\d+$/, /^http:\/\/127\.0\.0\.1:\d+$/] }))
  app.use(express.json({ limit: '2mb' })) // prompts + brand voice can be sizable

  // Health is public (no auth) so a client can probe the bridge.
  app.get('/health', (_req, res) => {
    res.json({ ok: true, version: '0.3.0' })
  })

  app.use(bearerAuth(token))
  app.post('/run', runHandler)

  return app
}
