import type { BridgeEvent } from './types.js'

// Maps one parsed NDJSON object from `claude --output-format stream-json`
// into a flat BridgeEvent, or null for events the client does not need.
export function mapClaudeEvent(obj: unknown): BridgeEvent | null {
  if (typeof obj !== 'object' || obj === null) return null
  const o = obj as Record<string, any>
  switch (o.type) {
    case 'stream_event': {
      const ev = o.event
      if (ev?.type === 'content_block_delta') {
        const d = ev.delta
        if (d?.type === 'text_delta') return { type: 'delta', blockType: 'text', text: String(d.text ?? '') }
        if (d?.type === 'thinking_delta') return { type: 'delta', blockType: 'thinking', text: String(d.thinking ?? '') }
      }
      return null
    }
    case 'rate_limit_event': {
      const rl = (o.rate_limit_info ?? {}) as Record<string, any>
      return {
        type: 'rate_limit',
        info: {
          status: String(rl.status ?? ''),
          resetsAt: Number(rl.resetsAt ?? 0),
          rateLimitType: String(rl.rateLimitType ?? ''),
          overageStatus: String(rl.overageStatus ?? ''),
          overageDisabledReason: rl.overageDisabledReason ?? null,
          isUsingOverage: Boolean(rl.isUsingOverage ?? false),
        },
      }
    }
    case 'result':
      return {
        type: 'result',
        text: String(o.result ?? ''),
        isError: Boolean(o.is_error),
        totalCostUsd: Number(o.total_cost_usd ?? 0),
        sessionId: String(o.session_id ?? ''),
        stopReason: String(o.stop_reason ?? ''),
      }
    default:
      return null
  }
}

// Returns a function that accepts raw stdout chunks, buffers across chunk
// boundaries, and invokes onEvent for every complete NDJSON line.
export function createNdjsonTransform(onEvent: (e: BridgeEvent) => void): (chunk: string) => void {
  let buffer = ''
  return (chunk: string) => {
    buffer += chunk
    let idx: number
    while ((idx = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, idx).trim()
      buffer = buffer.slice(idx + 1)
      if (!line) continue
      let parsed: unknown
      try {
        parsed = JSON.parse(line)
      } catch {
        continue
      }
      const ev = mapClaudeEvent(parsed)
      if (ev) onEvent(ev)
    }
  }
}
