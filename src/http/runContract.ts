export interface ExecutionOptions {
  model?: string
  fallbackModel?: string
  tools?: string[]
  strictMcp?: boolean
  cwd?: string | null
  timeoutSeconds?: number
}

export interface RunRequest {
  agentId: string
  namespace: string
  promptTemplate: string
  data: Record<string, unknown>
  systemPrompt?: string
  execution: ExecutionOptions
}

export type ParseResult =
  | { ok: true; value: RunRequest }
  | { ok: false; error: string }

// Dependency-free validation of the POST /run body. promptTemplate is the only
// hard requirement; everything else gets sensible defaults.
export function parseRunRequest(body: unknown): ParseResult {
  if (typeof body !== 'object' || body === null) {
    return { ok: false, error: 'body must be a JSON object' }
  }
  const b = body as Record<string, unknown>

  if (typeof b.promptTemplate !== 'string' || b.promptTemplate.length === 0) {
    return { ok: false, error: 'promptTemplate is required and must be a non-empty string' }
  }
  if (b.systemPrompt !== undefined && typeof b.systemPrompt !== 'string') {
    return { ok: false, error: 'systemPrompt must be a string when present' }
  }
  if (b.data !== undefined && (typeof b.data !== 'object' || b.data === null)) {
    return { ok: false, error: 'data must be an object when present' }
  }
  if (b.execution !== undefined && (typeof b.execution !== 'object' || b.execution === null)) {
    return { ok: false, error: 'execution must be an object when present' }
  }

  const exec = (b.execution ?? {}) as Record<string, unknown>
  return {
    ok: true,
    value: {
      agentId: typeof b.agentId === 'string' ? b.agentId : 'unknown',
      namespace: typeof b.namespace === 'string' ? b.namespace : 'unknown',
      promptTemplate: b.promptTemplate,
      data: (b.data as Record<string, unknown> | undefined) ?? {},
      systemPrompt: b.systemPrompt as string | undefined,
      execution: {
        model: typeof exec.model === 'string' ? exec.model : undefined,
        fallbackModel: typeof exec.fallbackModel === 'string' ? exec.fallbackModel : undefined,
        tools: Array.isArray(exec.tools)
          ? exec.tools.filter((t): t is string => typeof t === 'string')
          : undefined,
        strictMcp: typeof exec.strictMcp === 'boolean' ? exec.strictMcp : undefined,
        cwd: typeof exec.cwd === 'string' ? exec.cwd : null,
        timeoutSeconds: typeof exec.timeoutSeconds === 'number' ? exec.timeoutSeconds : undefined,
      },
    },
  }
}
