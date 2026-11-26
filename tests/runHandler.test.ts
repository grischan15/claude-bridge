import { describe, it, expect, vi, beforeEach } from 'vitest'
import { EventEmitter } from 'node:events'
import { access } from 'node:fs/promises'

const spawnClaudeMock = vi.fn()
vi.mock('../src/claude/spawnClaude.js', () => ({ spawnClaude: (...a: unknown[]) => spawnClaudeMock(...a) }))

const { runHandler } = await import('../src/http/runHandler.js')

// Async temp-file cleanup runs fire-and-forget (void cleanup()); a fixed sleep races
// it under full-suite CPU load (pre-existing flake). Poll until the file is gone instead.
async function waitForGone(p: string, timeoutMs = 2000): Promise<void> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try { await access(p) } catch { return } // access rejects -> file gone
    await new Promise((r) => setTimeout(r, 5))
  }
  throw new Error(`temp file still exists after ${timeoutMs}ms: ${p}`)
}

function fakeChild() {
  const child = new EventEmitter() as any
  child.stdout = Object.assign(new EventEmitter(), { setEncoding: vi.fn() })
  child.stderr = Object.assign(new EventEmitter(), { setEncoding: vi.fn() })
  child.kill = vi.fn()
  return child
}
function fakeReq(body: unknown) {
  const handlers: Record<string, () => void> = {}
  return {
    body,
    on: (ev: string, cb: () => void) => { handlers[ev] = cb },
    _emit: (ev: string) => handlers[ev]?.(),
  } as any
}
function fakeRes() {
  const writes: string[] = []
  const handlers: Record<string, () => void> = {}
  return {
    statusCode: 200,
    writeHead: vi.fn(),
    write: (c: string) => { writes.push(c); return true },
    status(c: number) { this.statusCode = c; return this },
    json: vi.fn(),
    end: vi.fn(),
    on: (ev: string, cb: () => void) => { handlers[ev] = cb },
    _emit: (ev: string) => handlers[ev]?.(),
    writes,
  } as any
}

beforeEach(() => spawnClaudeMock.mockReset())

describe('runHandler', () => {
  it('400s on missing promptTemplate', async () => {
    const res = fakeRes()
    await runHandler(fakeReq({ data: {} }), res)
    expect(res.statusCode).toBe(400)
    expect(spawnClaudeMock).not.toHaveBeenCalled()
  })

  it('renders the template and passes the rendered prompt + flags to spawnClaude', async () => {
    const child = fakeChild()
    spawnClaudeMock.mockResolvedValueOnce(child)
    const res = fakeRes()
    await runHandler(fakeReq({
      agentId: 'a', namespace: 'demo',
      promptTemplate: 'Hi {{name}}', data: { name: 'Max' },
      execution: { model: 'haiku', tools: [], strictMcp: true },
    }), res)
    const args = spawnClaudeMock.mock.calls[0][0] as string[]
    const opts = spawnClaudeMock.mock.calls[0][1] as { input?: string }
    expect(args[0]).toBe('-p')
    expect(args).not.toContain('Hi Max')           // prompt no longer an arg
    expect(opts.input).toBe('Hi Max')              // template rendered -> stdin
    expect(args[args.indexOf('--tools') + 1]).toBe('ToolSearch')
    expect(args).toContain('--strict-mcp-config')
    expect(args[args.indexOf('--model') + 1]).toBe('haiku')
    // stream + result
    child.stdout.emit('data', JSON.stringify({ type: 'result', is_error: false, result: 'Hi Max', total_cost_usd: 0.01, session_id: 's', stop_reason: 'end_turn' }) + '\n')
    child.emit('close', 0)
    await new Promise((r) => setTimeout(r, 10)) // finish() is async (awaits cleanup) before run_end
    const out = res.writes.join('')
    expect(out).toContain('event: run_start')
    expect(out).toContain('event: result')
    expect(out).toContain('event: run_end')
  })

  it('writes a temp system-prompt file, passes --append-system-prompt-file, and cleans it up', async () => {
    const child = fakeChild()
    spawnClaudeMock.mockResolvedValueOnce(child)
    const res = fakeRes()
    await runHandler(fakeReq({ promptTemplate: 'p', systemPrompt: 'BRAND VOICE' }), res)
    const args = spawnClaudeMock.mock.calls[0][0] as string[]
    const fi = args.indexOf('--append-system-prompt-file')
    expect(fi).toBeGreaterThan(-1)
    const tmpPath = args[fi + 1]
    await expect(access(tmpPath)).resolves.toBeUndefined() // exists during run
    child.emit('close', 0)
    await waitForGone(tmpPath)                             // cleaned up after run
  })

  it('keeps streaming to completion when req emits close (a fully-read body is NOT a disconnect)', async () => {
    // Regression: Node 18+ fires the request's 'close' as soon as the POST body has been
    // read, long before the client disconnects. Listening there aborted every run right
    // after spawn. The handler must ignore req 'close' and only react to res 'close'.
    const child = fakeChild()
    spawnClaudeMock.mockResolvedValueOnce(child)
    const res = fakeRes()
    const req = fakeReq({ promptTemplate: 'p' })
    await runHandler(req, res)
    req._emit('close')                 // body fully read -> must NOT abort the run
    expect(child.kill).not.toHaveBeenCalled()
    child.stdout.emit('data', JSON.stringify({ type: 'result', is_error: false, result: 'done', total_cost_usd: 0.01, session_id: 's', stop_reason: 'end_turn' }) + '\n')
    child.emit('close', 0)
    await new Promise((r) => setTimeout(r, 10))
    const out = res.writes.join('')
    expect(out).toContain('event: result')
    expect(out).toContain('event: run_end')
  })

  it('does not write run_end after the client disconnects', async () => {
    const child = fakeChild()
    spawnClaudeMock.mockResolvedValueOnce(child)
    const res = fakeRes()
    const req = fakeReq({ promptTemplate: 'p' })
    await runHandler(req, res)
    res._emit('close')                 // client gone first (response connection torn down)
    expect(child.kill).toHaveBeenCalled()
    child.emit('close', 0)             // child close fires afterwards
    // finish() short-circuits synchronously when ended===true, so no tick needed here
    expect(res.writes.join('')).not.toContain('event: run_end')
  })

  it('does not write a late stdout delta after the client disconnects', async () => {
    const child = fakeChild()
    spawnClaudeMock.mockResolvedValueOnce(child)
    const res = fakeRes()
    const req = fakeReq({ promptTemplate: 'p' })
    await runHandler(req, res)
    res._emit('close')                 // client gone
    // a buffered stdout chunk arrives after disconnect: must not write or throw
    const lateChunk = JSON.stringify({ type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'late' } } }) + '\n'
    expect(() => child.stdout.emit('data', lateChunk)).not.toThrow()
    expect(res.writes.join('')).not.toContain('late')
  })

  it('cleans up the temp file and kills the child when the client disconnects during spawn', async () => {
    const child = fakeChild()
    let resolveSpawn!: (c: unknown) => void
    spawnClaudeMock.mockReturnValueOnce(new Promise((r) => { resolveSpawn = r }))
    const res = fakeRes()
    const req = fakeReq({ promptTemplate: 'p', systemPrompt: 'BRAND VOICE' })
    const p = runHandler(req, res)
    // wait until spawn is invoked (after async render + temp-file write)
    while (spawnClaudeMock.mock.calls.length === 0) await new Promise((r) => setTimeout(r, 5))
    const args = spawnClaudeMock.mock.calls[0][0] as string[]
    const tmpPath = args[args.indexOf('--append-system-prompt-file') + 1]
    await expect(access(tmpPath)).resolves.toBeUndefined() // exists during pending spawn
    res._emit('close')                 // client disconnects while spawn is pending
    resolveSpawn(child)                // spawn resolves afterwards
    await p
    expect(child.kill).toHaveBeenCalled()
    await waitForGone(tmpPath) // temp file cleaned up despite disconnect
  })
})
