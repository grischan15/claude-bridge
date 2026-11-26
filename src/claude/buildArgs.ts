import type { ExecutionOptions } from '../http/runContract.js'

const STREAM_FLAGS = ['--output-format', 'stream-json', '--verbose', '--include-partial-messages']

export interface BuildRunArgsInput {
  execution?: ExecutionOptions
  systemPromptFile?: string
}

// MCP server tools are DEFERRED: they never appear in the CLI's tool list and are
// reachable only through ToolSearch. `--tools ""` therefore did not just disable the
// built-ins as intended -- it also removed the only door to every MCP connector, so a
// sandboxed agent silently lost e.g. the claude.ai Indeed tools and answered as if it
// had called them. Keeping ToolSearch in the list preserves the documented meaning of
// `tools` (which BUILT-INS are allowed) while leaving MCP access intact. Measured at
// the CLI init event: `--tools ToolSearch` yields 1 tool, no Bash/Write/Edit, MCP
// servers still inherited.
const MCP_ACCESS_TOOL = 'ToolSearch'

// Builds the claude CLI args. Restriction via --tools (Amendment #1), full MCP
// sandbox via --strict-mcp-config (Amendment #2). Brand voice via temp file.
// The prompt is NOT passed as an arg: `-p` without a value makes the CLI read the
// prompt from stdin. This avoids the Windows CreateProcess command-line limit
// (~32k chars) that broke large grounded prompts with `spawn ENAMETOOLONG`.
export function buildRunArgs({ execution = {}, systemPromptFile }: BuildRunArgsInput): string[] {
  const tools = execution.tools ?? []
  const toolList = tools.includes(MCP_ACCESS_TOOL) ? tools : [...tools, MCP_ACCESS_TOOL]
  return [
    '-p',
    ...STREAM_FLAGS,
    '--tools', toolList.join(','),
    ...(execution.strictMcp ? ['--strict-mcp-config'] : []),
    ...(execution.model ? ['--model', execution.model] : []),
    ...(execution.fallbackModel ? ['--fallback-model', execution.fallbackModel] : []),
    ...(systemPromptFile ? ['--append-system-prompt-file', systemPromptFile] : []),
  ]
}
