// A farm is its log, so the farm of any earlier day can be had by replaying less of it.
import type { Catalog } from './catalog'
import { apply, initialState, parseEvent } from './fold'
import type { FarmState } from './types'

/** A farm begins with one of these. Whatever a log held before it was another farm. */
const beginsFarm = (e: unknown): boolean => {
  const type = parseEvent(e)?.type
  return type === 'farm-started' || type === 'snapshot-imported'
}

/**
 * The farm as it stood when `day` ended: everything done that day, and the night not yet come. For today it is the
 * farm as it stands. Null if the farm that is there now never had such a day: the day has not come, or the farm began
 * later than that (one brought over from the first prototype begins on the day it was saved, and a farm started over
 * forgets the days of the one before).
 */
export function farmAtEndOf(events: readonly unknown[], day: number, catalog: Catalog): FarmState | null {
  let s = initialState()
  let found: FarmState | null = null
  for (const e of events) {
    const next = apply(s, e, catalog)
    if (next === s) continue
    if (beginsFarm(e) || next.day < s.day) found = null
    s = next
    if (s.day === day && day >= 1) found = s
  }
  return found
}
