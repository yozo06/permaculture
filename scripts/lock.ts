// What saved farms depend on in the packs, and which changes to it would hurt them. See lock.test.ts.
import type { HarvestType, PackDef } from '../src/engine/types'

export interface Lock {
  /** pack id -> its energy cap (percent, or null for none) and its branch ids */
  packs: Record<string, { cap: number | null; branches: string[] }>
  seeds: Record<string, { pack: string; needs: string[]; harvest: HarvestType; wild: boolean }>
  /** find id -> its pack and the wild seed it leads to, if any */
  finds: Record<string, { pack: string; seed: string | null }>
}

/** Everything in the packs that replaying a farm depends on. */
export function lockOf(packs: readonly PackDef[]): Lock {
  const lock: Lock = { packs: {}, seeds: {}, finds: {} }
  for (const p of packs) {
    lock.packs[p.pack] = { cap: p.energy_cap ?? null, branches: p.branches.map((b) => b.id) }
    for (const s of p.seeds) lock.seeds[s.id] = { pack: p.pack, needs: s.needs ?? [], harvest: s.harvest, wild: s.wild === true }
    for (const f of p.finds ?? []) lock.finds[f.id] = { pack: p.pack, seed: f.seed ?? null }
  }
  return lock
}

/** The lock as the committed file holds it: one line per id, so a pull request shows exactly what moved. */
export function lockText(lock: Lock): string {
  const section = (entries: Record<string, unknown>): string =>
    Object.keys(entries).map((id) => '    ' + JSON.stringify(id) + ': ' + JSON.stringify(entries[id])).join(',\n')
  return '{\n' + (['packs', 'seeds', 'finds'] as const).map((k) => '  ' + JSON.stringify(k) + ': {\n' + section(lock[k]) + '\n  }').join(',\n') + '\n}\n'
}

/**
 * Changes between two locks that would make a saved farm replay differently. Empty when there are none.
 * Growing and loosening are free: new ids, fewer needs, a seed that stops being wild, a cap raised or lifted.
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
    if (is.wild && !was.wild) problems.push('seed "' + id + '" became wild: farms that planted it never foraged for it')
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
  return problems
}
