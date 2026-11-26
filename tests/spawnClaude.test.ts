import { describe, it, expect, vi, beforeEach } from 'vitest'
import { EventEmitter } from 'node:events'

const spawnMock = vi.fn()
vi.mock('node:child_process', () => ({ spawn: (...a: unknown[]) => spawnMock(...a) }))

// imported after mock is registered
const { spawnClaude } = await import('../src/claude/spawnClaude.js')

function fakeChild() {
  const child = new EventEmitter() as EventEmitter & { stdout: EventEmitter; stderr: EventEmitter }
  child.stdout = new EventEmitter()
  child.stderr = new EventEmitter()
  return child
}

beforeEach(() => spawnMock.mockReset())

describe('spawnClaude', () => {
  it('spawns claude with ignored stdin and resolves on spawn event', async () => {
    const child = fakeChild()
    spawnMock.mockReturnValueOnce(child)
    const p = spawnClaude(['-p', 'hi'])
    child.emit('spawn')
    await expect(p).resolves.toBe(child)
    const [bin, args, opts] = spawnMock.mock.calls[0]
    expect(bin).toBe('claude')
    expect(args).toEqual(['-p', 'hi'])
    expect(opts.stdio).toEqual(['ignore', 'pipe', 'pipe'])
    expect(opts.shell).toBe(false)
  })

  it('retries once with shell:true on ENOENT', async () => {
    const failing = fakeChild()
    const ok = fakeChild()
    spawnMock.mockReturnValueOnce(failing).mockReturnValueOnce(ok)
    const p = spawnClaude(['-p', 'hi'])
    const err = Object.assign(new Error('not found'), { code: 'ENOENT' })
    failing.emit('error', err)
    ok.emit('spawn')
    await expect(p).resolves.toBe(ok)
    expect(spawnMock).toHaveBeenCalledTimes(2)
    expect(spawnMock.mock.calls[1][2].shell).toBe(true)
  })

  it('rejects on non-ENOENT errors', async () => {
    const child = fakeChild()
    spawnMock.mockReturnValueOnce(child)
    const p = spawnClaude(['-p', 'hi'])
    child.emit('error', Object.assign(new Error('boom'), { code: 'EACCES' }))
    await expect(p).rejects.toThrow('boom')
    expect(spawnMock).toHaveBeenCalledTimes(1)
  })
})
