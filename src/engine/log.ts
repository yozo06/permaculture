// The file a farm is exported to, and reading one back. A file from outside is untrusted: never throw.
import type { LoggedEvent } from './types'
import { looksLikeV2 } from './v2'

export const FILE_FORMAT = 'permaculture'
export const FILE_VERSION = 3

export interface FarmFile {
  format: typeof FILE_FORMAT
  v: typeof FILE_VERSION
  events: readonly LoggedEvent[]
}

export type ParsedFarmFile =
  | { kind: 'log'; events: LoggedEvent[] }
  | { kind: 'v2'; snapshot: unknown }
  | { kind: 'error'; message: string }

/** The text of an export file. */
export const farmFileText = (events: readonly LoggedEvent[]): string =>
  JSON.stringify({ format: FILE_FORMAT, v: FILE_VERSION, events } satisfies FarmFile)

export const farmFileName = (day: number): string => 'permaculture-farm-day' + day + '.json'

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

/** An entry is kept if it can be told apart from junk: a type, an id and a time. Whether the fold accepts it is another matter. */
const isLogged = (v: unknown): v is LoggedEvent =>
  isRecord(v) && typeof v.type === 'string' && typeof v.id === 'string' && typeof v.at === 'string'

/** Read the text of an export (a v3 log) or a Phase 0 save (v2). */
export function parseFarmFile(text: string): ParsedFarmFile {
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    return { kind: 'error', message: 'That is not valid farm data.' }
  }
  if (looksLikeV2(value)) return { kind: 'v2', snapshot: value }
  if (!isRecord(value) || value.format !== FILE_FORMAT) return { kind: 'error', message: 'That file is not a Permaculture farm.' }
  if (typeof value.v === 'number' && value.v > FILE_VERSION) {
    return { kind: 'error', message: 'That farm was saved by a newer version of the game.' }
  }
  if (value.v !== FILE_VERSION || !Array.isArray(value.events)) {
    return { kind: 'error', message: 'That file is not a Permaculture farm (format v' + FILE_VERSION + ').' }
  }
  if (!value.events.every(isLogged)) return { kind: 'error', message: 'That farm has entries the game cannot read.' }
  return { kind: 'log', events: value.events }
}
