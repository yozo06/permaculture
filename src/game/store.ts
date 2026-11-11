// Where the farm lives: the event log, the folded state, and the bits of screen state that are not part of a farm.
// Every read from storage is untrusted; bad data becomes a fresh farm and a message, never a crash.
import type { Catalog } from '../engine/catalog'
import { isRecord } from '../engine/util'
import { apply, check, fold, refusedCount } from '../engine/fold'
import { farmFileText, parseFarmFile } from '../engine/log'
import { RULES } from '../engine/rules'
import type { FarmEvent, FarmState, LoggedEvent } from '../engine/types'
import { looksLikeV2 } from '../engine/v2'

export const LOG_KEY = 'permaculture-log'
export const UI_KEY = 'permaculture-ui'
/** The prototype's save. Read once to start a log; never written or removed. */
export const LEGACY_KEY = 'permaculture-v2'
/** Where an unreadable log is kept before a fresh farm replaces it. */
export const BROKEN_KEY = 'permaculture-log-unreadable'

export interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

/** What the screen remembers between visits. None of it is part of the farm. */
export interface UiState {
  /** The camera; null means centred on the homestead. */
  cam: { x: number; y: number } | null
  farmer: { x: number; y: number; tx: number; ty: number }
  seedSel: string | null
  treeTab: string | null
  /** How many skipped entries the player has already been told about, so the warning is not repeated on every load. */
  driftSeen: number
}

export const defaultFarmer = (): UiState['farmer'] => ({ x: 9, y: 8, tx: 9, ty: 8 })
const freshUi = (): UiState => ({ cam: null, farmer: defaultFarmer(), seedSel: null, treeTab: null, driftSeen: 0 })

export type NewFarm = 'fresh' | 'sample'

export interface StoreDeps {
  catalog: Catalog
  /** localStorage, or null when the browser will not give it to us. */
  storage: StorageLike | null
  /** A Phase 0 farm to start from when the player picks the sample farm. */
  sample: unknown
  newId(): string
  now(): string
}

export interface Store {
  readonly ui: UiState
  state(): FarmState
  events(): readonly LoggedEvent[]
  /** True when there was nothing saved at all. */
  readonly firstVisit: boolean
  /** Set when saved data could not be read and a fresh farm was started. */
  readonly loadProblem: string | null
  /** Entries of the saved farm that today's packs and rules no longer accept. A healthy farm has none. */
  readonly refused: number
  /** Check an event, and if it is allowed, apply it and save. Returns the reason it was refused, or null. */
  dispatch(event: FarmEvent): string | null
  /** Replace the log with a new farm. A fresh one has no fields until its farmer picks them. */
  newFarm(kind: NewFarm): void
  /** Replace the log with an imported one. Returns what is wrong with it, or null. */
  importLog(events: readonly LoggedEvent[]): string | null
  /** Replace the log with a Phase 0 farm. Returns what is wrong with it, or null. */
  importSnapshot(snapshot: unknown): string | null
  saveUi(): void
  /** True if the last attempt to save did not work (storage full or blocked). */
  saveFailed(): boolean
}

export function defaultId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  } catch { /* fall through */ }
  return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10)
}

const num = (v: unknown, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback)

function readUi(raw: string | null): UiState {
  const ui = freshUi()
  if (raw === null) return ui
  try {
    const v: unknown = JSON.parse(raw)
    if (!isRecord(v)) return ui
    if (isRecord(v.cam)) ui.cam = { x: num(v.cam.x, 0), y: num(v.cam.y, 0) }
    if (isRecord(v.farmer)) {
      const f = defaultFarmer()
      ui.farmer = { x: num(v.farmer.x, f.x), y: num(v.farmer.y, f.y), tx: num(v.farmer.tx, f.tx), ty: num(v.farmer.ty, f.ty) }
    }
    if (typeof v.seedSel === 'string') ui.seedSel = v.seedSel
    if (typeof v.treeTab === 'string') ui.treeTab = v.treeTab
    ui.driftSeen = Math.max(0, Math.round(num(v.driftSeen, 0)))
  } catch { /* a fresh screen state is fine */ }
  return ui
}

export function createStore(deps: StoreDeps): Store {
  const { catalog, storage } = deps
  let log: LoggedEvent[] = []
  let state: FarmState
  let failed = false
  let ui: UiState = freshUi()

  const read = (key: string): string | null => {
    try { return storage ? storage.getItem(key) : null } catch { return null }
  }
  const write = (key: string, value: string): boolean => {
    try {
      if (!storage) return false
      storage.setItem(key, value)
      return true
    } catch {
      return false
    }
  }
  const saveLog = (): void => { failed = !write(LOG_KEY, farmFileText(log)) }
  const saveUi = (): void => { write(UI_KEY, JSON.stringify(ui)) }

  const logged = (e: FarmEvent): LoggedEvent => ({ ...e, id: deps.newId(), at: deps.now() })

  /** Append an event that must be allowed (the store built it). */
  function append(e: FarmEvent): void {
    const next = apply(state, e, catalog)
    if (next === state) return
    state = next
    log.push(logged(e))
  }

  function begin(events: LoggedEvent[]): void {
    log = events
    state = fold(log, catalog)
    ui = freshUi()
    saveLog()
    saveUi()
  }

  function startFarm(kind: NewFarm): LoggedEvent[] {
    const e: FarmEvent =
      kind === 'sample'
        ? { type: 'snapshot-imported', snapshot: deps.sample }
        : { type: 'farm-started', day: RULES.start.day, energy: RULES.energyMax, coins: RULES.start.coins, barrel: RULES.start.barrel }
    return [logged(e)]
  }

  function load(): { firstVisit: boolean; problem: string | null; refused?: number } {
    const stored = read(LOG_KEY)
    if (stored !== null) {
      const parsed = parseFarmFile(stored)
      if (parsed.kind === 'log') {
        const folded = fold(parsed.events, catalog)
        if (folded.day >= 1) {
          log = parsed.events
          state = folded
          return { firstVisit: false, problem: null, refused: refusedCount(log, catalog) }
        }
      }
      write(BROKEN_KEY, stored)
      begin(startFarm('fresh'))
      return { firstVisit: false, problem: 'Your saved farm could not be read. Starting a fresh one.' }
    }
    // No log yet. A Phase 0 save becomes the first event of one; the old key is left alone.
    const old = read(LEGACY_KEY)
    if (old !== null) {
      let snapshot: unknown = null
      try { snapshot = JSON.parse(old) } catch { /* handled below */ }
      if (looksLikeV2(snapshot) && check(fold([], catalog), { type: 'snapshot-imported', snapshot }, catalog) === null) {
        begin([logged({ type: 'snapshot-imported', snapshot })])
        return { firstVisit: false, problem: null }
      }
      begin(startFarm('fresh'))
      return { firstVisit: false, problem: 'Your saved farm could not be read. Starting a fresh one.' }
    }
    begin(startFarm('fresh'))
    return { firstVisit: true, problem: null }
  }

  state = fold([], catalog)
  // The store never opens a field by itself: a farmer chooses their fields, and a pack added later is offered, not forced.
  const loaded = load()
  ui = readUi(loaded.firstVisit || loaded.problem ? null : read(UI_KEY))

  return {
    get ui() { return ui },
    state: () => state,
    events: () => log,
    firstVisit: loaded.firstVisit,
    loadProblem: loaded.problem,
    refused: loaded.refused ?? 0,
    dispatch(event) {
      const why = check(state, event, catalog)
      if (why !== null) return why
      append(event)
      saveLog()
      return null
    },
    newFarm(kind) { begin(startFarm(kind)) },
    importLog(events) {
      const folded = fold(events, catalog)
      if (folded.day < 1) return 'That farm has no beginning, so the game cannot replay it.'
      begin(events.slice())
      return null
    },
    importSnapshot(snapshot) {
      const why = check(fold([], catalog), { type: 'snapshot-imported', snapshot }, catalog)
      if (why !== null) return 'That file is not a Permaculture farm (format v2).'
      begin([logged({ type: 'snapshot-imported', snapshot })])
      return null
    },
    saveUi,
    saveFailed: () => failed,
  }
}
