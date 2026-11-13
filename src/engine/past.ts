// A farm is its log, so the farm of any earlier morning can be had by replaying less of it.
import type { Catalog } from './catalog'
import { apply, initialState } from './fold'
import type { FarmState } from './types'

/**
 * The farm as it stood on the morning of `day`: the log replayed up to the sleep that began that day (or, for the
 * farm's first day, up to its start). Null if the log holds no such morning: the day has not come, or the farm began
 * later than that (a farm brought over from the first prototype begins on the day it was saved).
 */
export function farmOn(events: readonly unknown[], day: number, catalog: Catalog): FarmState | null {
  let s = initialState()
  let found: FarmState | null = null
  for (const e of events) {
    const next = apply(s, e, catalog)
    if (next.day !== s.day) {
      if (next.day === day) found = next
      // The days ran backwards: a farm was started over. The mornings before that belong to a farm that is gone.
      else if (next.day < s.day) found = null
    }
    s = next
  }
  return found
}
