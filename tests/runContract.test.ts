// tests/runContract.test.ts
import { describe, it, expect } from 'vitest'
import { parseRunRequest } from '../src/http/runContract.js'

describe('parseRunRequest', () => {
  it('rejects a non-object body', () => {
    expect(parseRunRequest(null)).toEqual({ ok: false, error: expect.stringContaining('JSON object') })
  })
  it('rejects a missing promptTemplate', () => {
    const r = parseRunRequest({ data: {} })
    expect(r.ok).toBe(false)
  })
  it('rejects an empty promptTemplate', () => {
    expect(parseRunRequest({ promptTemplate: '' }).ok).toBe(false)
  })
  it('accepts a minimal request and fills defaults', () => {
    const r = parseRunRequest({ promptTemplate: 'Hi {{n}}' })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.value.promptTemplate).toBe('Hi {{n}}')
      expect(r.value.agentId).toBe('unknown')
      expect(r.value.namespace).toBe('unknown')
      expect(r.value.data).toEqual({})
      expect(r.value.systemPrompt).toBeUndefined()
      expect(r.value.execution).toEqual({
        model: undefined, fallbackModel: undefined, tools: undefined,
        strictMcp: undefined, cwd: null, timeoutSeconds: undefined,
      })
    }
  })
  it('parses execution options and labels', () => {
    const r = parseRunRequest({
      agentId: 'demo-x', namespace: 'demo', promptTemplate: 'p',
      data: { a: 1 }, systemPrompt: 'bv',
      execution: { model: 'opus', fallbackModel: 'sonnet', tools: ['Read', 2], strictMcp: true, cwd: '/tmp', timeoutSeconds: 90 },
    })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.value.agentId).toBe('demo-x')
      expect(r.value.systemPrompt).toBe('bv')
      expect(r.value.execution.model).toBe('opus')
      expect(r.value.execution.fallbackModel).toBe('sonnet')
      expect(r.value.execution.tools).toEqual(['Read']) // non-string filtered out
      expect(r.value.execution.strictMcp).toBe(true)
      expect(r.value.execution.cwd).toBe('/tmp')
      expect(r.value.execution.timeoutSeconds).toBe(90)
    }
  })
  it('rejects a non-string systemPrompt', () => {
    expect(parseRunRequest({ promptTemplate: 'p', systemPrompt: 5 }).ok).toBe(false)
  })
})
