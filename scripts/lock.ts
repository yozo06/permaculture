// What saved farms depend on in the packs, and which changes to it would hurt them. See lock.test.ts.
import type { HarvestType, PackDef } from '../src/engine/types'

export interface Lock {
  /** pack id -> its energy cap (percent, or null for none) and its branch ids */
  packs: Record<string, { cap: number | null; branches: string[] }>
  /** `edge` is there only for a seed that has one, so a seed without keeps the line it always had. */
  seeds: Record<string, { pack: string; needs: string[]; harvest: HarvestType; wild: boolean; edge?: string }>
  /** find id -> its pack and the wild seed it leads to, if any */
  finds: Record<string, { pack: string; seed: string | null }>
  /** "pack/guild" -> its members. A guild pays while it is whole, and those coins are part of the farm. */
  guilds: Record<string, { seeds: string[] }>
}

const SECTIONS = ['packs', 'seeds', 'finds', 'guilds'] as const

/** Everything in the packs that replaying a farm depends on. */
export function lockOf(packs: readonly PackDef[]): Lock {
  const lock: Lock = { packs: {}, seeds: {}, finds: {}, guilds: {} }
  for (const p of packs) {
    lock.packs[p.pack] = { cap: p.energy_cap ?? null, branches: p.branches.map((b) => b.id) }
    for (const s of p.seeds) lock.seeds[s.id] = { pack: p.pack, needs: s.needs ?? [], harvest: s.harvest, wild: s.wild === true, ...(s.edge === undefined ? {} : { edge: s.edge }) }
    for (const f of p.finds ?? []) lock.finds[f.id] = { pack: p.pack, seed: f.seed ?? null }
    for (const g of p.guilds ?? []) lock.guilds[p.pack + '/' + g.id] = { seeds: g.seeds }
  }
  return lock
}

/** The lock as the committed file holds it: one line per id, so a pull request shows exactly what moved. */
export function lockText(lock: Lock): string {
  const section = (entries: Record<string, unknown>): string =>
    Object.keys(entries).map((id) => '    ' + JSON.stringify(id) + ': ' + JSON.stringify(entries[id])).join(',\n')
  return '{\n' + SECTIONS.map((k) => '  ' + JSON.stringify(k) + ': {\n' + section(lock[k]) + '\n  }').join(',\n') + '\n}\n'
}

/** Read the committed lock. Throws if the text is not one: a damaged lock must be mended by hand, not replaced. */
export function readLock(text: string): Lock {
  const fail = (): never => { throw new Error('packs/lock.json cannot be read as a lock. Mend it by hand (a merge conflict?); do not delete it.') }
  let raw: unknown
  try { raw = JSON.parse(text) } catch { return fail() }
  const table = (v: unknown): boolean => typeof v === 'object' && v !== null && !Array.isArray(v)
  if (!table(raw)) return fail()
  const lock = raw as Record<string, unknown>
  // A lock written before guilds paid anything has no guilds in it. It guards none: there was nothing to guard.
  if (lock.guilds === undefined) lock.guilds = {}
  return SECTIONS.every((k) => table(lock[k])) ? (raw as Lock) : fail()
}

/**
 * Changes between two locks that would make a saved farm replay differently. Empty when there are none.
 * Growing is free: new ids, a find that gains a seed, a write-up that becomes a proof, a cap raised or lifted.
 * An edge pays double, so a seed may gain one but never lose or move it.
 * A guild pays while it is whole, so it may not go, and may lose members but not gain them: with one more to root it
 * is whole later, the farm is paid less, and something it bought with those coins may no longer replay.
 * What a seed needs and whether it is wild may not change in either direction: a farm that jumped the fence to a
 * seed, or domesticated it, has an event in its log that is refused once the seed no longer needed that.
 */
export function lockProblems(old: Lock, now: Lock): string[] {
  const problems: string[] = []
  for (const [id, was] of Object.entries(old.packs)) {
    const is = now.packs[id]
    if (!is) { problems.push('pack "' + id + '" is gone: farms have a field for it'); continue }
    for (const b of was.branches) if (!is.branches.includes(b)) problems.push('branch "' + b + '" of ' + id + ' is gone: a farm may have it as its focus')
    if (is.cap !== null && (was.cap === null || is.cap < was.cap)) {
      problems.push(id + "'s energy cap went from " + (was.cap ?? 'none') + ' to ' + is.cap + ': a day that fitted under the old cap may not replay')
    }
  }
  for (const [id, was] of Object.entries(old.seeds)) {
    const is = now.seeds[id]
    if (!is) { problems.push('seed "' + id + '" is gone: farms that grow it would lose the crop'); continue }
    if (is.pack !== was.pack) problems.push('seed "' + id + '" moved from ' + was.pack + ' to ' + is.pack + ': its crops stand in the old field')
    for (const need of is.needs) if (!was.needs.includes(need)) problems.push('seed "' + id + '" now needs "' + need + '": a farm that planted it without would lose the crop')
    for (const need of was.needs) if (!is.needs.includes(need)) problems.push('seed "' + id + '" no longer needs "' + need + '": a farm that jumped the fence to it would have that jump refused, and its energy that day would replay differently')
    if (is.wild && !was.wild) problems.push('seed "' + id + '" became wild: farms that planted it never foraged for it')
    if (was.wild && !is.wild) problems.push('seed "' + id + '" is no longer wild: a farm that domesticated it has an event that would be refused')
    if (was.edge !== undefined && is.edge !== was.edge) problems.push('seed "' + id + '" no longer sits on the edge of ' + was.edge + ': its harvest paid double there, so farms would replay with fewer coins than they spent')
    if (was.harvest === 'artifact' && is.harvest !== 'artifact') {
      problems.push('seed "' + id + '" went from artifact to ' + is.harvest + ': a short proof already harvested would be too short for a write-up')
    }
  }
  for (const [id, was] of Object.entries(old.finds)) {
    const is = now.finds[id]
    if (!is) { problems.push('find "' + id + '" is gone: farms have foraged it'); continue }
    if (is.pack !== was.pack) problems.push('find "' + id + '" moved from ' + was.pack + ' to ' + is.pack)
    if (was.seed !== null && is.seed !== was.seed) problems.push('find "' + id + '" no longer leads to "' + was.seed + '": farms that domesticated it would lose the seed')
  }
  for (const [id, was] of Object.entries(old.guilds)) {
    const is = now.guilds[id]
    if (!is) { problems.push('guild "' + id + '" is gone: it paid while it was whole, so farms would replay with fewer coins than they spent'); continue }
    for (const seed of is.seeds) if (!was.seeds.includes(seed)) problems.push('guild "' + id + '" gained "' + seed + '": a farm on which it was whole would be paid less, and may have spent those coins')
  }
  return problems
}
