import { describe, it, expect } from 'vitest'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ensureToken, PORT, HOST } from '../src/config.js'

describe('config', () => {
  it('exposes loopback host and bridge port', () => {
    expect(HOST).toBe('127.0.0.1')
    expect(PORT).toBe(7777)
  })

  it('generates and persists a token, then reuses it', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cb-'))
    try {
      const first = ensureToken(dir)
      expect(first).toMatch(/^[0-9a-f]{48}$/)
      const persisted = readFileSync(join(dir, 'token.txt'), 'utf8').trim()
      expect(persisted).toBe(first)
      const second = ensureToken(dir)
      expect(second).toBe(first)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
