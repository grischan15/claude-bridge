// Async-Semaphore: deckelt die Anzahl gleichzeitig laufender claude-Subprozesse.
// Ohne dieses Limit spawnt jeder POST /run sofort einen Prozess (alle parallel) ->
// bei einem Burst (z.B. zwei Apps gleichzeitig) provoziert das ein Claude-
// Rate-Limit. Der Limiter serialisiert ueberzaehlige Runs in eine FIFO-Warteschlange.
export class Semaphore {
  private active = 0
  private readonly queue: Array<() => void> = []

  constructor(private readonly max: number) {
    if (max < 1) throw new Error('Semaphore max must be >= 1')
  }

  // Frei = es laeuft gerade ein Slot weniger als das Maximum.
  available(): boolean {
    return this.active < this.max
  }

  get inUse(): number {
    return this.active
  }

  get waiting(): number {
    return this.queue.length
  }

  // Belegt einen Slot; falls keiner frei ist, wartet die Promise in der FIFO-Queue.
  // Rueckgabe: eine idempotente release()-Funktion (auf JEDEM Terminal-Pfad aufrufen).
  async acquire(): Promise<() => void> {
    if (this.active < this.max) {
      this.active++
    } else {
      await new Promise<void>(resolve => this.queue.push(resolve))
      // Slot wurde direkt uebergeben (siehe release): active bleibt unveraendert.
    }
    return this.makeRelease()
  }

  private makeRelease(): () => void {
    let released = false
    return () => {
      if (released) return
      released = true
      const next = this.queue.shift()
      if (next) {
        next() // Slot direkt an den naechsten Wartenden weiterreichen (active bleibt gleich)
      } else {
        this.active--
      }
    }
  }
}
