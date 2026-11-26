import { describe, it, expect } from 'vitest'
import { Semaphore } from './concurrency.js'

const tick = () => new Promise<void>(r => setTimeout(r, 0))

describe('Semaphore', () => {
  it('runs up to max acquirers immediately, queues the rest', async () => {
    const sem = new Semaphore(2)
    expect(sem.available()).toBe(true)
    const r1 = await sem.acquire()
    const r2 = await sem.acquire()
    expect(sem.available()).toBe(false)
    expect(sem.inUse).toBe(2)

    let thirdAcquired = false
    const p3 = sem.acquire().then(rel => { thirdAcquired = true; return rel })
    await tick()
    expect(thirdAcquired).toBe(false) // blocked
    expect(sem.waiting).toBe(1)

    r1() // free one slot -> third proceeds
    const r3 = await p3
    expect(thirdAcquired).toBe(true)
    expect(sem.inUse).toBe(2) // still capped at max
    expect(sem.waiting).toBe(0)

    r2(); r3()
    expect(sem.inUse).toBe(0)
  })

  it('never exceeds max even under a burst', async () => {
    const sem = new Semaphore(3)
    let peak = 0
    let running = 0
    const work = async () => {
      const rel = await sem.acquire()
      running++
      peak = Math.max(peak, running)
      await tick()
      running--
      rel()
    }
    await Promise.all(Array.from({ length: 12 }, work))
    expect(peak).toBe(3)
    expect(sem.inUse).toBe(0)
  })

  it('release is idempotent (double-call does not free an extra slot)', async () => {
    const sem = new Semaphore(1)
    const rel = await sem.acquire()
    rel(); rel()
    expect(sem.inUse).toBe(0)
    const rel2 = await sem.acquire() // still only 1 slot
    expect(sem.inUse).toBe(1)
    rel2()
  })
})
