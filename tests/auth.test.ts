import { describe, it, expect } from 'vitest'
import { bearerAuth } from '../src/http/auth.js'

function run(token: string, header?: string) {
  const mw = bearerAuth(token)
  let status = 0
  let body: unknown = null
  let nextCalled = false
  const req = { header: (_n: string) => header } as any
  const res = { status(c: number) { status = c; return this }, json(b: unknown) { body = b; return this } } as any
  mw(req, res, () => { nextCalled = true })
  return { status, body, nextCalled }
}

describe('bearerAuth', () => {
  it('calls next on correct token', () => {
    const r = run('secret', 'Bearer secret')
    expect(r.nextCalled).toBe(true)
    expect(r.status).toBe(0)
  })
  it('rejects missing header', () => {
    const r = run('secret', undefined)
    expect(r.nextCalled).toBe(false)
    expect(r.status).toBe(401)
  })
  it('rejects wrong token', () => {
    const r = run('secret', 'Bearer nope')
    expect(r.nextCalled).toBe(false)
    expect(r.status).toBe(401)
  })
})
