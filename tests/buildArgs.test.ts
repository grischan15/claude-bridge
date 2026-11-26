import { describe, it, expect } from 'vitest'
import { buildRunArgs } from '../src/claude/buildArgs.js'

describe('buildRunArgs', () => {
  it('builds base args with empty tools and stream flags', () => {
    const args = buildRunArgs({})
    expect(args[0]).toBe('-p') // prompt comes via stdin, not as an arg
    expect(args).not.toContain('hello')
    expect(args).toContain('--verbose')
    expect(args).toContain('--include-partial-messages')
    const ti = args.indexOf('--tools')
    expect(ti).toBeGreaterThan(-1)
    // No built-ins, but ToolSearch stays: MCP server tools are deferred and
    // reachable ONLY through it, so `--tools ""` would silently cut off every
    // MCP connector as well -- not just Bash and friends.
    expect(args[ti + 1]).toBe('ToolSearch')
    expect(args).not.toContain('--allowedTools')
    expect(args).not.toContain('--strict-mcp-config')
  })
  it('joins explicit tools and keeps MCP access', () => {
    const args = buildRunArgs({ execution: { tools: ['Read', 'Grep'] } })
    expect(args[args.indexOf('--tools') + 1]).toBe('Read,Grep,ToolSearch')
  })
  it('does not duplicate ToolSearch when the caller already listed it', () => {
    const args = buildRunArgs({ execution: { tools: ['ToolSearch', 'Read'] } })
    expect(args[args.indexOf('--tools') + 1]).toBe('ToolSearch,Read')
  })
  it('adds --strict-mcp-config when strictMcp is true', () => {
    expect(buildRunArgs({ execution: { strictMcp: true } })).toContain('--strict-mcp-config')
  })
  it('adds --model and --fallback-model', () => {
    const args = buildRunArgs({ execution: { model: 'opus', fallbackModel: 'sonnet' } })
    expect(args[args.indexOf('--model') + 1]).toBe('opus')
    expect(args[args.indexOf('--fallback-model') + 1]).toBe('sonnet')
  })
  it('adds --append-system-prompt-file when a file is given', () => {
    const args = buildRunArgs({ systemPromptFile: '/tmp/x.txt' })
    expect(args[args.indexOf('--append-system-prompt-file') + 1]).toBe('/tmp/x.txt')
  })
  it('omits optional flags when not provided', () => {
    const args = buildRunArgs({})
    expect(args).not.toContain('--model')
    expect(args).not.toContain('--fallback-model')
    expect(args).not.toContain('--append-system-prompt-file')
  })
})
