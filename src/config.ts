import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

export const HOST = '127.0.0.1'
export const PORT = 7777

// Max. gleichzeitig laufende claude-Subprozesse. Ueberzaehlige Runs warten in einer
// FIFO-Queue (siehe Semaphore), statt parallel ein Claude-Rate-Limit zu provozieren.
// Override per Env BRIDGE_MAX_CONCURRENCY; Default 3 (gut fuer Solo-Use + ein paar Tools).
export const MAX_CONCURRENT_RUNS = (() => {
  const n = Number(process.env.BRIDGE_MAX_CONCURRENCY)
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 3
})()
export const BRIDGE_HOME = join(homedir(), '.claude-bridge')
export const AGENTS_DIR = join(BRIDGE_HOME, 'agents')
export const TOKEN_FILE = join(BRIDGE_HOME, 'token.txt')

export function ensureToken(dir: string = BRIDGE_HOME): string {
  mkdirSync(dir, { recursive: true })
  const file = join(dir, 'token.txt')
  if (existsSync(file)) {
    return readFileSync(file, 'utf8').trim()
  }
  const token = randomBytes(24).toString('hex') // 48 hex chars
  writeFileSync(file, token, 'utf8')
  return token
}
