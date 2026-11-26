import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { Server } from 'node:http'
import { createServer } from '../src/server.js'

let server: Server
let base: string

beforeAll(async () => {
  const app = createServer('secret-token')
  await new Promise<void>((resolve) => {
    server = app.listen(0, '127.0.0.1', () => resolve())
  })
  const addr = server.address()
  const port = typeof addr === 'object' && addr ? addr.port : 0
  base = `http://127.0.0.1:${port}`
})

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())))

describe('createServer', () => {
  it('serves /health without auth', async () => {
    const r = await fetch(`${base}/health`)
    expect(r.status).toBe(200)
    const body = await r.json()
    expect(body.ok).toBe(true)
  })

  it('rejects POST /run without token', async () => {
    const r = await fetch(`${base}/run`, { method: 'POST' })
    expect(r.status).toBe(401)
  })

  // The Vite Cockpit assigns fixed ports to local apps (5180/5181/5182, ...).
  // The bridge must accept any localhost origin, not just the Vite defaults —
  // otherwise the browser blocks the response and the app reports the bridge
  // as "unreachable" even though it is running.
  it('allows any localhost origin (CORS)', async () => {
    for (const origin of ['http://localhost:5181', 'http://localhost:5180', 'http://127.0.0.1:5182']) {
      const r = await fetch(`${base}/health`, { headers: { Origin: origin } })
      expect(r.headers.get('access-control-allow-origin')).toBe(origin)
    }
  })

  it('does not allow non-localhost origins (CORS)', async () => {
    const r = await fetch(`${base}/health`, { headers: { Origin: 'http://evil.example.com' } })
    expect(r.headers.get('access-control-allow-origin')).toBeNull()
  })
})
