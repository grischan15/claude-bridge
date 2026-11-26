// tests/systemPromptFile.test.ts
import { describe, it, expect } from 'vitest'
import { readFile, access } from 'node:fs/promises'
import { writeSystemPromptFile } from '../src/render/systemPromptFile.js'

describe('writeSystemPromptFile', () => {
  it('writes the text to a readable path', async () => {
    const f = await writeSystemPromptFile('brand voice content')
    expect(await readFile(f.path, 'utf8')).toBe('brand voice content')
    await f.cleanup()
  })
  it('cleanup removes the file', async () => {
    const f = await writeSystemPromptFile('x')
    await f.cleanup()
    await expect(access(f.path)).rejects.toThrow()
  })
  it('cleanup is idempotent (force) and does not throw on second call', async () => {
    const f = await writeSystemPromptFile('x')
    await f.cleanup()
    await expect(f.cleanup()).resolves.toBeUndefined()
  })
})
