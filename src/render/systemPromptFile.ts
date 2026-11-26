import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export interface SystemPromptFile {
  path: string
  cleanup: () => Promise<void>
}

// Writes the system prompt (brand voice) to a temp file so it can be passed via
// --append-system-prompt-file, avoiding the Windows command-line length limit for
// long brand-voice text. Caller MUST call cleanup() after the run (also on error).
export async function writeSystemPromptFile(text: string): Promise<SystemPromptFile> {
  const dir = await mkdtemp(join(tmpdir(), 'cb-sys-'))
  const path = join(dir, 'system-prompt.txt')
  await writeFile(path, text, 'utf8')
  return {
    path,
    cleanup: async () => {
      await rm(dir, { recursive: true, force: true })
    },
  }
}
