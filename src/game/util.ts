/** A shuffled copy. `rand` is injectable so tests can be deterministic. */
export function shuffle<T>(items: readonly T[], rand: () => number = Math.random): T[] {
  const out = items.slice()
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    const a = out[i] as T
    out[i] = out[j] as T
    out[j] = a
  }
  return out
}

const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }

/** Escape text for use inside HTML. */
export function esc(s: unknown): string {
  return String(s).replace(/[&<>"]/g, (ch) => ESCAPES[ch] ?? ch)
}
