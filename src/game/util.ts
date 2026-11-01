/** Deterministic pseudo-random number in [0, 1] from a tile and a salt. */
export function hash(x: number, y: number, k = 0): number {
  let h = (x * 374761393 + y * 668265263 + k * 982451653) | 0
  h = (h ^ (h >>> 13)) * 1274126177
  h = h ^ (h >>> 16)
  return (h >>> 0) / 4294967295
}

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
