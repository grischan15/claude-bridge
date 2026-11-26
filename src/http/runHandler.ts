import type { Request, Response } from 'express'
import { randomUUID } from 'node:crypto'
import { spawnClaude } from '../claude/spawnClaude.js'
import { buildRunArgs } from '../claude/buildArgs.js'
import { createNdjsonTransform } from '../claude/streamParser.js'
import { renderTemplate } from '../render/template.js'
import { writeSystemPromptFile, type SystemPromptFile } from '../render/systemPromptFile.js'
import { parseRunRequest } from './runContract.js'
import { initSse, sendSse } from './sse.js'
import { Semaphore } from '../concurrency.js'
import { MAX_CONCURRENT_RUNS } from '../config.js'

// Prozess-weiter Concurrency-Limiter: deckelt parallele claude-Spawns (FIFO-Queue
// fuer ueberzaehlige Runs). Verhindert, dass ein Burst ein Claude-Rate-Limit ausloest.
const semaphore = new Semaphore(MAX_CONCURRENT_RUNS)

export async function runHandler(req: Request, res: Response): Promise<void> {
  const parsed = parseRunRequest(req.body)
  if (!parsed.ok) {
    res.status(400).json({ error: parsed.error })
    return
  }
  const run = parsed.value
  const runId = randomUUID()

  let prompt: string
  try {
    prompt = renderTemplate(run.promptTemplate, run.data)
  } catch (err) {
    res.status(400).json({ error: `template render failed: ${(err as Error).message}` })
    return
  }

  // Brand voice -> temp file for --append-system-prompt-file (avoids arg length limit).
  let sysFile: SystemPromptFile | undefined
  if (run.systemPrompt) {
    sysFile = await writeSystemPromptFile(run.systemPrompt)
  }
  const cleanup = async () => {
    releaseSlot?.() // Concurrency-Slot freigeben (idempotent; no-op falls nie belegt)
    releaseSlot = undefined
    if (sysFile) {
      const f = sysFile
      sysFile = undefined
      await f.cleanup()
    }
  }

  const args = buildRunArgs({ execution: run.execution, systemPromptFile: sysFile?.path })

  // Terminal-path latch: declared before any SSE write so the invariant holds for
  // every path (spawn failure, disconnect-during-spawn, streaming, normal close).
  let ended = false
  let timer: NodeJS.Timeout | undefined
  let child: Awaited<ReturnType<typeof spawnClaude>> | undefined
  // Concurrency-Slot: erst nach initSse belegt, auf JEDEM Terminal-Pfad via cleanup frei.
  let releaseSlot: (() => void) | undefined

  // Register disconnect handling BEFORE the spawn await: the spawn overhead is ~10s,
  // so a client abort during that window must still clean up the temp file and (once
  // it exists) kill the child. child may still be undefined here -> optional kill.
  //
  // Listen on the RESPONSE 'close', not the request's. On Node 18+ the IncomingMessage
  // ('req') 'close' fires as soon as the request body has been fully read — which for a
  // POST with a JSON body happens immediately, long before the client disconnects. Using
  // req 'close' here made every run self-abort right after spawn: ended=true, the child
  // got killed, and the `if (ended)` guard below returned WITHOUT res.end(), leaving the
  // SSE response hanging open forever. res 'close' only fires when the connection is
  // actually torn down (or after our own res.end()), which is the real disconnect signal.
  res.on('close', () => {
    if (ended) return
    ended = true
    if (timer) clearTimeout(timer)
    void cleanup().catch((e) => console.error('[bridge] cleanup error on disconnect:', e))
    child?.kill()
  })

  initSse(res)
  sendSse(res, 'run_start', { runId, agentId: run.agentId, namespace: run.namespace })

  // Concurrency-Gate: ist kein Slot frei, in die FIFO-Queue einreihen und den Client
  // ueber 'queued' informieren (statt einen weiteren Prozess parallel zu spawnen).
  if (!semaphore.available()) {
    sendSse(res, 'queued', { inUse: semaphore.inUse, waiting: semaphore.waiting })
  }
  releaseSlot = await semaphore.acquire()
  // Client hat waehrend des Wartens aufgelegt -> Slot sofort wieder freigeben, abbrechen.
  if (ended) {
    releaseSlot()
    releaseSlot = undefined
    return
  }

  try {
    child = await spawnClaude(args, { cwd: run.execution.cwd ?? undefined, input: prompt })
  } catch (err) {
    if (!ended) {
      ended = true
      sendSse(res, 'error', { message: (err as Error).message })
      await cleanup()
      res.end()
    }
    return
  }

  // Client disconnected while the spawn was pending: cleanup already ran in the
  // close handler; just kill the now-resolved child and stop.
  if (ended) {
    child.kill()
    return
  }

  const finish = async (payload: Record<string, unknown>) => {
    if (ended) return
    ended = true
    if (timer) clearTimeout(timer)
    await cleanup()
    sendSse(res, 'run_end', payload)
    res.end()
  }

  if (run.execution.timeoutSeconds) {
    timer = setTimeout(() => { if (!ended) child!.kill() }, run.execution.timeoutSeconds * 1000)
  }

  // Gate streaming writes on the latch: a stdout chunk buffered before kill()/end()
  // can still arrive after disconnect or completion -> never write to a dead socket.
  const transform = createNdjsonTransform((ev) => { if (!ended) sendSse(res, ev.type, ev) })
  child.stdout?.setEncoding('utf8')
  child.stdout?.on('data', (chunk: string) => transform(chunk))

  let stderr = ''
  child.stderr?.setEncoding('utf8')
  child.stderr?.on('data', (chunk: string) => { stderr += chunk })

  child.on('close', (code) => {
    void finish({ runId, exitCode: code, stderr: stderr.slice(0, 2000) })
  })
}
