import { describe, it, expect } from 'vitest'
import { initSse, sendSse } from '../src/http/sse.js'

function fakeRes() {
  const writes: string[] = []
  let head: { status: number; headers: Record<string, string> } | null = null
  return {
    res: {
      writeHead(status: number, headers: Record<string, string>) { head = { status, headers } },
      write(chunk: string) { writes.push(chunk) },
    } as any,
    writes,
    getHead: () => head,
  }
}

describe('sse', () => {
  it('initSse sets event-stream headers', () => {
    const { res, getHead } = fakeRes()
    initSse(res)
    const head = getHead()!
    expect(head.status).toBe(200)
    expect(head.headers['Content-Type']).toBe('text/event-stream')
    expect(head.headers['Cache-Control']).toBe('no-cache')
  })

  it('sendSse writes a named event frame with JSON data', () => {
    const { res, writes } = fakeRes()
    sendSse(res, 'delta', { blockType: 'text', text: 'hi' })
    expect(writes.join('')).toBe('event: delta\ndata: {"blockType":"text","text":"hi"}\n\n')
  })
})
