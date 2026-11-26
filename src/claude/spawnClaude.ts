import { spawn, type ChildProcess } from 'node:child_process'

export interface SpawnClaudeOpts {
  cwd?: string
  // Prompt fed to the CLI via stdin (paired with a bare `-p` arg). Passing the
  // prompt here instead of as an argument avoids the Windows command-line length
  // limit. When omitted, stdin is ignored to avoid the CLI's "no stdin received
  // in 3s" delay (Amendment #8).
  input?: string
}

// Central claude-CLI spawner. With opts.input the prompt is written to stdin and
// stdin is closed immediately (no 3s delay since data arrives at once); otherwise
// stdin is ignored. On ENOENT (e.g. .cmd shim installs where Node's spawn cannot
// resolve the binary) it retries once with shell:true (Research Test 7).
export function spawnClaude(args: string[], opts: SpawnClaudeOpts = {}): Promise<ChildProcess> {
  const hasInput = typeof opts.input === 'string'
  return new Promise((resolve, reject) => {
    const attempt = (useShell: boolean) => {
      const child = spawn('claude', args, {
        stdio: [hasInput ? 'pipe' : 'ignore', 'pipe', 'pipe'],
        cwd: opts.cwd,
        shell: useShell,
      })
      let settled = false
      child.once('spawn', () => {
        settled = true
        if (hasInput && child.stdin) {
          // Swallow EPIPE: the child may exit before consuming all stdin.
          child.stdin.on('error', () => {})
          child.stdin.end(opts.input)
        }
        resolve(child)
      })
      child.once('error', (err: NodeJS.ErrnoException) => {
        if (settled) return
        if (err.code === 'ENOENT' && !useShell) {
          attempt(true)
          return
        }
        reject(err)
      })
    }
    attempt(false)
  })
}
