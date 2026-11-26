import { describe, it, expect, vi } from 'vitest'
import { mapClaudeEvent, createNdjsonTransform } from '../src/claude/streamParser.js'
import type { BridgeEvent } from '../src/claude/types.js'

describe('mapClaudeEvent', () => {
  it('maps a text_delta stream_event to a text delta', () => {
    const obj = {
      type: 'stream_event',
      event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Hallo' } },
    }
    expect(mapClaudeEvent(obj)).toEqual({ type: 'delta', blockType: 'text', text: 'Hallo' })
  })

  it('maps a thinking_delta stream_event to a thinking delta', () => {
    const obj = {
      type: 'stream_event',
      event: { type: 'content_block_delta', delta: { type: 'thinking_delta', thinking: 'hmm' } },
    }
    expect(mapClaudeEvent(obj)).toEqual({ type: 'delta', blockType: 'thinking', text: 'hmm' })
  })

  it('ignores signature_delta and non-content events', () => {
    expect(mapClaudeEvent({ type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'signature_delta', signature: 'x' } } })).toBeNull()
    expect(mapClaudeEvent({ type: 'system', subtype: 'init' })).toBeNull()
    expect(mapClaudeEvent({ type: 'assistant' })).toBeNull()
  })

  it('maps a rate_limit_event', () => {
    const obj = {
      type: 'rate_limit_event',
      rate_limit_info: {
        status: 'allowed', resetsAt: 1779259200, rateLimitType: 'five_hour',
        overageStatus: 'rejected', overageDisabledReason: 'out_of_credits', isUsingOverage: false,
      },
    }
    expect(mapClaudeEvent(obj)).toEqual({
      type: 'rate_limit',
      info: {
        status: 'allowed',
        resetsAt: 1779259200,
        rateLimitType: 'five_hour',
        overageStatus: 'rejected',
        overageDisabledReason: 'out_of_credits',
        isUsingOverage: false,
      },
    })
  })

  it('maps a result event', () => {
    const obj = {
      type: 'result', subtype: 'success', is_error: false, result: '1\n2\n3',
      total_cost_usd: 0.12, session_id: 'abc', stop_reason: 'end_turn',
    }
    expect(mapClaudeEvent(obj)).toEqual({
      type: 'result', text: '1\n2\n3', isError: false, totalCostUsd: 0.12, sessionId: 'abc', stopReason: 'end_turn',
    })
  })
})

describe('createNdjsonTransform', () => {
  it('emits one event per complete line and buffers partial lines', () => {
    const events: BridgeEvent[] = []
    const push = createNdjsonTransform((e) => events.push(e))
    const line = (text: string) =>
      JSON.stringify({ type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text } } })
    // first chunk: one full line + start of a second
    push(line('A') + '\n' + line('B').slice(0, 10))
    // second chunk: rest of second line + newline
    push(line('B').slice(10) + '\n')
    expect(events).toEqual([
      { type: 'delta', blockType: 'text', text: 'A' },
      { type: 'delta', blockType: 'text', text: 'B' },
    ])
  })

  it('skips empty and non-JSON lines', () => {
    const onEvent = vi.fn()
    const push = createNdjsonTransform(onEvent)
    push('\n   \nnot-json\n')
    expect(onEvent).not.toHaveBeenCalled()
  })
})
