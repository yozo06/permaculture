import packDefs from 'virtual:packs'
import { buildCatalog, LAYER_NAMES, type Seed } from '../engine/catalog'
import { findCandidates, pickFind } from '../engine/finds'
import { check, fieldsToOpen, refusedCount } from '../engine/fold'
import {
  BARN, COMPOST, GATE, MARKET, SIGN, WELL, fenceCost, fieldOf as landFieldOf, flagTile, hash, homestead, inHomestead, isBuildingTile,
  neighbourFields, terrain as landTerrain, tileKey, wildKind, worldSize, type Terrain,
} from '../engine/land'
import { farmFileName, farmFileText, parseFarmFile } from '../engine/log'
import { buyersFor, standing } from '../engine/market'
import { farmAtEndOf } from '../engine/past'
import { WALK_QUESTIONS, isWalkDay, walkedToday } from '../engine/walk'
import { farmCode, layOut, momentOf, readPicture, type Picture } from '../engine/picture'
import { explainChecklist, explainPasses, harvestWork, pickPrompt, recallBank, waterWork, writePasses } from '../engine/ladder'
import { RULES, cropOf, revivable as isRevivable, ripe as isRipe, thirsty as isThirsty, zone } from '../engine/rules'
import type { Crop, FarmEvent, FarmState, LoggedEvent, Mcq, Night } from '../engine/types'
import { almanacHtml } from './almanac'
import sampleFarm from './sample-farm.json'
import { readLink } from './links'
import { MOMENT_MS, momentDots, type DotTone, type MomentKind } from './moments'
import { BOOK_KEY, ageText, bookText, readBook, receive, remove, tooOld, type Arrival, type Book } from './neighbours'
import { NEUTRAL_COLOR, cropHeight, cropSprite, holds, paintKeys, sprite as spriteAt } from './art/sprites'
import { drop, frontmost, idle, lift, move, press, wheelStep, type Hand, type Point, type Said, type Wheel } from './hand'
import { createStore, defaultId, LOG_KEY, type StorageLike } from './store'
import { esc, shuffle } from './util'
import { REF, cameraAfter, defaultZoom, fitView, pinchZoom, shift, zoomRange, type View } from './view'
import {
  arrivalSheetHtml, chipHtml, countText, cropSheetHtml, earnedSectionHtml, footHtml, heldSectionHtml, nameSheetHtml, neighbourCropSheetHtml, neighboursSheetHtml, noteHtml, NO_NOTES,
  pickerHtml, plantSheetHtml, readinessSheetHtml, shareSheetHtml, tickList, writingBox,
} from './sheets'
import { arrivalText, neighbourCropView, neighbourRows, shareView, type ShareView } from './visit'
import { marketSheetHtml, marketView, rivalSheetHtml, rivalView, saleSheetHtml, thenAndNow, walkSheetHtml, walkView } from './standing'
import { afterJump, bagView, cropView, driftText, edgeLine, guildNews, guildStatus, harvestPay, needsText, saplingNews, timesOver, packColor, pickerView, readinessView, sourceLinks, splitName, tending, treeView, type TreeView } from './views'

/* ---------- types ---------- */
type Mode = 'water' | 'harvest' | 'testout'
type StaticKind = 'forest' | 'barn' | 'well' | 'compost' | 'sign' | 'gate' | 'market' | 'flag'

interface Drawable {
  s: number
  d: (t: number) => void
  kind?: StaticKind
  /** The field a flag stands for. */
  pack?: string
  hit?: (ix: number, iy: number) => boolean
}

type Pick =
  | { kind: 'crop'; crop: Crop }
  | { kind: 'tile'; x: number; y: number }
  | { kind: 'barn' }
  | { kind: 'well' }
  | { kind: 'compost' }
  | { kind: 'sign' }
  | { kind: 'gate' }
  | { kind: 'market' }
  | { kind: 'flag'; pack: string }

/* ---------- page ---------- */
/* ---------- the view: how much of the farm the canvas shows, and how big ---------- */
/** Until the page has been measured, the view the farm was first drawn for. `layout` sets the real one. */
let view: View = { zoom: 2, pw: REF.w * 2, ph: REF.h * 2, w: REF.w, h: REF.h }
/** The canvas in pixels of art: everything is drawn in these, and the canvas scales them up by the zoom. */
let W = view.w
let H = view.h
/** How far this view moves everything from where the reference view had it. The camera is kept as if the view were that size. */
let SHIFT = shift(view)
const TH = 16

function byId(id: string): HTMLElement {
  const node = document.getElementById(id)
  if (!node) throw new Error('Missing element #' + id + ' in index.html')
  return node
}
function byIdAs<T extends HTMLElement>(id: string, kind: new () => T): T {
  const node = byId(id)
  if (!(node instanceof kind)) throw new Error('Element #' + id + ' is not a ' + kind.name)
  return node
}

function context2d(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const c = canvas.getContext('2d')
  if (!c) throw new Error('This browser cannot draw the farm (no 2D canvas).')
  return c
}

const cv = byIdAs('c', HTMLCanvasElement)
const ctx = context2d(cv)
const $ = byId

/* ---------- packs ---------- */
const catalog = buildCatalog(packDefs)
const nameOf = (id: string): string => catalog.seed(id)?.name ?? id
const packTitle = (id: string): string => catalog.pack(id)?.title ?? id
const colorOf = (id: string): string => {
  const p = catalog.pack(id)
  return p ? packColor(p) : '#6DB24F'
}

/* ---------- the farm ---------- */
function browserStorage(): StorageLike | null {
  try { return window.localStorage } catch { return null }
}
const storage = browserStorage()
const store = createStore({ catalog, storage, sample: sampleFarm, newId: defaultId, now: () => new Date().toISOString() })
/** The folded farm. Only `act` and `adopt` replace it. */
let S: FarmState = store.state()

/* ---------- neighbours ---------- */
/** This farm's code, worked out from its first event: the same for the life of the farm, and new after a reset. */
const ownCode = (): string => farmCode(store.events()[0]?.id ?? '')
/** The neighbours this browser knows. Not part of the farm: kept under its own key, and kept through a reset. */
let book: Book = readBook(readStored(BOOK_KEY), catalog, Date.now())
function readStored(key: string): string | null {
  try { return storage ? storage.getItem(key) : null } catch { return null }
}
function saveBook(): void {
  try { storage?.setItem(BOOK_KEY, bookText(book)) } catch { /* the list is a convenience; the farm is what matters */ }
}
/**
 * The book as storage holds it now. Another tab may have added a neighbour since this one loaded (a farm link often
 * opens in a new tab), so the book is read again before it is shown or changed, never written back from memory alone.
 */
function latestBook(): Book {
  const stored = readStored(BOOK_KEY)
  if (stored !== null) book = readBook(stored, catalog, Date.now())
  return book
}
function changeBook(change: (b: Book) => Book): void {
  book = change(latestBook())
  saveBook()
}
/** Where people post farm links to find neighbours. */
const VILLAGE_GREEN = 'https://github.com/yozo06/permaculture/discussions'

/** Looking at another farm, read-only. While this is set, nothing the player taps can reach their own farm. */
interface Visit {
  state: FarmState
  /** What the banner says. */
  label: string
  /** Whose farm it is, for the crop sheets. */
  who: string
  cam: { x: number; y: number }
  /** The fields the picture shows, to tick for someone who goes on to start a farm of their own. */
  packs: string[]
  /** The farm is your own, on an earlier day: a tap on a crop says how it stood then and how it stands now. */
  past: boolean
}
let visiting: Visit | null = null
/** The farm on screen: the neighbour's while visiting, else your own. Everything that draws or picks reads this. */
const D = (): FarmState => (visiting ? visiting.state : S)

/* ---------- camera ---------- */
/** World size in tiles, set from the fields by `buildStatics`. 20 for up to four fields, 27 for up to nine. */
let N = worldSize(S.fields)
const camHome = (): { x: number; y: number } => ({ x: REF.w / 2, y: REF.h / 2 - 8 * N - 8 })
/** The camera, centred on the homestead until the player moves it. A visit has a camera of its own, so yours is as you left it. */
function camera(): { x: number; y: number } {
  if (visiting) return visiting.cam
  const ui = store.ui
  if (!ui.cam) ui.cam = camHome()
  return ui.cam
}

/* ---------- rules the screen asks about ---------- */
const thirsty = (c: Crop): boolean => isThirsty(c, S.day)
const ripe = (c: Crop): boolean => isRipe(c, S.day)
const fieldOf = (x: number, y: number): string | null => landFieldOf(x, y, D().fields, D().cleared)
const terrain = (x: number, y: number): Terrain => landTerrain(x, y, D().fields, D().cleared)
const inHome = (x: number, y: number): boolean => inHomestead(x, y, D().fields)

/** Land and fields change the shape of the world, so the ground has to be redrawn. */
const LAND_EVENTS = new Set<FarmEvent['type']>(['fenced', 'field-opened', 'snapshot-imported', 'farm-started'])
let warnedAboutSaving = false
/** Send an event to the farm. If the rules refuse it, the reason is shown and this returns false. */
function act(e: FarmEvent): boolean {
  // A visit is read-only. Taps are routed away before they get here; this is the lock behind the door.
  if (visiting) return false
  const why = store.dispatch(e)
  if (why !== null) { toast(why); return false }
  S = store.state()
  if (LAND_EVENTS.has(e.type)) buildStatics()
  hud()
  if (store.saveFailed() && !warnedAboutSaving) {
    warnedAboutSaving = true
    toast('Your farm could not be saved in this browser. Export it to keep it.')
  }
  return true
}
/** True (after a toast) if the rules would refuse this event. For gating a sheet before the player does the work. */
function refused(e: FarmEvent): boolean {
  const why = check(S, e, catalog)
  if (why !== null) toast(why)
  return why !== null
}
/** Pick up a farm the store has just replaced (new farm, import). */
function adopt(): void {
  S = store.state()
  moments = []
  buildStatics()
  clampCam()
  hud()
}

/* ---------- the sprite sheet ---------- */
/** The sheet is a picture in the page itself (index.html), so the page loads it with its other files and the code fetches nothing. */
const sheetImage = byIdAs('sheetArt', HTMLImageElement)
let sheetReady = false
/** The sheet with its key colours painted in one colour, made the first time that colour is asked for. */
const painted = new Map<string, HTMLCanvasElement>()
function paintedSheet(color: string): HTMLCanvasElement | null {
  if (!sheetReady) return null
  const had = painted.get(color)
  if (had) return had
  const c = document.createElement('canvas')
  c.width = sheetImage.naturalWidth
  c.height = sheetImage.naturalHeight
  const x = context2d(c)
  x.drawImage(sheetImage, 0, 0)
  const data = x.getImageData(0, 0, c.width, c.height)
  paintKeys(data.data, color)
  x.putImageData(data, 0, 0)
  painted.set(color, c)
  return c
}
/** Once the sheet has arrived: draw the ground again with it, and hand the sheets of text their copy. */
function sheetLoaded(): void {
  sheetReady = true
  dirtyGround = true
  // The sheets of text show sprites too: they take them from this copy, with fruit in a colour that is no field's.
  const neutral = paintedSheet(NEUTRAL_COLOR)
  if (neutral) document.documentElement.style.setProperty('--sheet', 'url(' + neutral.toDataURL() + ')')
}

/* ---------- drawing ---------- */
const iso = (x: number, y: number): { sx: number; sy: number } => { const cam = camera(); return { sx: (x - y) * 16 + cam.x + SHIFT.x, sy: (x + y) * 8 + cam.y + SHIFT.y } }
let g: CanvasRenderingContext2D = ctx
function px(x: number, y: number, w: number, h: number, c: string): void {g.fillStyle=c;g.fillRect(Math.round(x),Math.round(y),w,h);}
type Pt = [number, number]
/** Draw a sprite with the top corner of its tile at (sx, sy). `color` paints its key colours: a field's own, or none. */
function spr(name: string, sx: number, sy: number, color: string = NEUTRAL_COLOR): void {
  const s = spriteAt(name)
  const sheet = paintedSheet(color)
  if (!s || !sheet) return
  g.drawImage(sheet, s.x, s.y, s.w, s.h, Math.round(sx) - s.ax, Math.round(sy) - s.ay, s.w, s.h)
}

/* ---------- what stands on the land ---------- */
/** A forest tree: one of two broadleaves or a pine, by `v`, a number from 0 to 1 that belongs to its tile. */
const drawTree = (sx: number, sy: number, v: number): void => spr('wild/tree/' + (v > 0.72 ? 2 : v > 0.36 ? 1 : 0), sx, sy)
const drawBush = (sx: number, sy: number): void => spr('wild/bush', sx, sy)
const drawRock = (sx: number, sy: number): void => spr('wild/rock', sx, sy)
const drawTuft = (sx: number, sy: number, x: number, y: number): void => spr('wild/tuft/' + Math.floor(hash(x, y, 30) * 3), sx, sy)
function drawCrop(c: Crop, sx: number, sy: number): void {
  const seed = catalog.seed(c.seed)
  if (seed) spr(cropSprite(seed.layer, c.stage, c.perennial, c.wilted), sx, sy, colorOf(seed.pack))
}
function drawMarker(c: Crop, sx: number, sy: number, t: number): void {
  // Thirst, wilting and ripeness are the owner's business: a neighbour's farm shows none of them.
  if (visiting) return
  const layer = catalog.seed(c.seed)?.layer
  // The marker floats over the crop, bobbing: a tall crop lifts it.
  const y = sy - Math.max(0, (layer ? cropHeight(cropSprite(layer, c.stage, c.perennial)) : 0) - 16) + Math.round(Math.sin(t / 260) * 1.5)
  if (c.wilted) spr('mark/wilted', sx, y)
  else if (thirsty(c)) spr('mark/thirsty', sx, y)
  else if (ripe(c)) spr('mark/ripe/' + (Math.floor(t / 350) % 2), sx, y)
}
const drawFarmer = (sx: number, sy: number, walking: boolean, t: number): void => spr('farmer/' + (walking ? Math.floor(t / 120) % 2 : 0), sx, sy)
const drawBarn = (): void => { const p = iso(BARN.x, BARN.y); spr('barn', p.sx, p.sy) }
const drawWell = (): void => { const p = iso(WELL.x, WELL.y); spr('well', p.sx, p.sy) }
const drawCompost = (): void => { const p = iso(COMPOST.x, COMPOST.y); spr('compost', p.sx, p.sy) }
const drawSign = (): void => { const p = iso(SIGN.x, SIGN.y); spr('sign', p.sx, p.sy) }
/** The gate spans the main path where it leaves the homestead to the west: two posts, a beam, a lantern. */
const drawGate = (): void => { const p = iso(GATE.x, GATE.y); spr('gate', p.sx, p.sy) }
/** The market stall: a counter under a striped awning. A lantern is lit on its ridge while a buyer is buying. */
let marketLit = false
// The lantern tells of your own farm today, so it is dark on a neighbour's farm and on last month's.
const drawMarket = (): void => { const p = iso(MARKET.x, MARKET.y); spr(marketLit && !visiting ? 'stall/lit' : 'stall', p.sx, p.sy) }
/** A field's flag, in the field's colour, on a tall pole at a corner of the field: it shows over any crop, from across the map. */
const FLAG = { top: 27, w: 8, h: 5 }
const drawFlag = (sx: number, sy: number, color: string, t: number): void => spr('flag/' + (Math.floor(t / 320) % 2), sx, sy, color)

/* ---------- world objects (rebuilt when land changes) ---------- */
let statics: Drawable[] = []
let dirtyGround = true
const gcv = document.createElement('canvas')
const gctx = context2d(gcv)
/** Where the ground canvas puts tile (0, 0)'s top corner. */
let groundOx = 0
function buildStatics(): void {
  statics = []
  N = worldSize(D().fields)
  const home = homestead(D().fields)
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const tr = terrain(x, y)
    if (tr === 'wild') {
      const kind = wildKind(x, y)
      if (kind === 'tree') statics.push({ s: x + y, kind: 'forest', d: () => { const p = iso(x, y); drawTree(p.sx, p.sy, hash(x, y, 2)) } })
      else if (kind === 'bush') statics.push({ s: x + y, kind: 'forest', d: () => { const p = iso(x, y); drawBush(p.sx, p.sy) } })
      else if (kind === 'rock') statics.push({ s: x + y, d: () => { const p = iso(x, y); drawRock(p.sx, p.sy) } })
      else statics.push({ s: x + y, d: () => { const p = iso(x, y); drawTuft(p.sx, p.sy, x, y) } })
    } else if (tr === 'grass' && inHome(x, y) && (x === home.lo || x === home.hi || y === home.lo || y === home.hi) && !isBuildingTile(x, y) && hash(x, y, 1) > 0.55) {
      statics.push({ s: x + y, d: () => { const p = iso(x, y); drawBush(p.sx, p.sy) } })
    }
  }
  // A building takes the taps that land on what is drawn of it, and a finger's margin round that.
  const on = (name: string, at: { x: number; y: number }) => (ix: number, iy: number): boolean => { const p = iso(at.x, at.y); return holds(name, p.sx, p.sy, ix, iy, 3) }
  statics.push({ s: BARN.x + BARN.y + 1.5, d: drawBarn, kind: 'barn', hit: on('barn', BARN) })
  statics.push({ s: WELL.x + WELL.y, d: drawWell, kind: 'well', hit: on('well', WELL) })
  statics.push({ s: COMPOST.x + COMPOST.y, d: drawCompost, kind: 'compost', hit: on('compost', COMPOST) })
  statics.push({ s: GATE.x + GATE.y + 1.5, d: drawGate, kind: 'gate', hit: on('gate', GATE) })
  statics.push({ s: MARKET.x + MARKET.y, d: drawMarket, kind: 'market', hit: on('stall', MARKET) })
  statics.push({ s: SIGN.x + SIGN.y, d: drawSign, kind: 'sign', hit: on('sign', SIGN) })
  for (const [pack, slot] of Object.entries(D().fields)) {
    const at = flagTile(slot)
    statics.push({
      s: at.x + at.y - 0.6, kind: 'flag', pack,
      d: (t) => { const p = iso(at.x, at.y); drawFlag(p.sx, p.sy, colorOf(pack), t) },
      // The cloth and a finger's margin around it, but not the pole: what stands behind the pole keeps its own taps.
      hit: (ix, iy) => { const p = iso(at.x, at.y); return ix >= p.sx + 1 && ix <= p.sx + FLAG.w + 5 && iy >= p.sy - FLAG.top - 8 && iy <= p.sy - FLAG.top + FLAG.h + 4 },
    })
  }
  // fences: one segment per field edge that borders a different field or open land
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const f = fieldOf(x, y)
    if (!f) continue
    const edges: [number, number, string, number][] = [[x, y - 1, 'TR', -0.5], [x - 1, y, 'TL', -0.5], [x + 1, y, 'RB', 0.5], [x, y + 1, 'LB', 0.5]]
    for (const [nx, ny, e, ds] of edges) {
      if (fieldOf(nx, ny) === f) continue
      statics.push({ s: x + y + ds, d: () => {
        const p = iso(x, y)
        const V: Record<string, Pt> = { T: [p.sx, p.sy], R: [p.sx + 16, p.sy + 8], B: [p.sx, p.sy + 16], L: [p.sx - 16, p.sy + 8] }
        const a = V[e.charAt(0)]
        const b = V[e.charAt(1)]
        if (!a || !b) return
        // An edge runs down to the right or down to the left from where it starts, and the rails follow it.
        spr(b[0] > a[0] ? 'fence/right' : 'fence/left', a[0], a[1])
        // Each post is capped in its field's colour, so a field's outline says whose it is.
        for (const v of [a, b]) spr('fence/post', v[0], v[1], colorOf(f))
      } })
    }
  }
  dirtyGround = true
}
function buildGround(): void {
  g = gctx
  gcv.width = N * 32 + 32
  gcv.height = N * 16 + 40
  const ox = N * 16 + 16, oy = 8
  groundOx = ox
  const VARIANTS = { soil: 2, path: 3, wild: 3, grass: 3 }
  const NAMES = { soil: 'tile/soil/', path: 'tile/path/', wild: 'tile/wild/', grass: 'tile/meadow/' }
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const tr = terrain(x, y)
    // No two neighbours need match: each tile takes the variant its own place gives it.
    const n = tr === 'soil' ? (x + y) % VARIANTS.soil : Math.floor(hash(x, y, 3) * VARIANTS[tr])
    spr(NAMES[tr] + n, (x - y) * 16 + ox, (x + y) * 8 + oy)
  }
  // The island's two front edges show the earth under them.
  for (let x = 0; x < N; x++) spr('cliff/left/' + (x % 2), (x - (N - 1)) * 16 + ox, (x + N - 1) * 8 + oy)
  for (let y = 0; y < N; y++) spr('cliff/right/' + (y % 2), ((N - 1) - y) * 16 + ox, (N - 1 + y) * 8 + oy)
  g = ctx
  dirtyGround = false
}
buildStatics()
/** Without the sheet there is nothing to draw the farm with. Say so: the farm itself is safe, and its sheets still open. */
const sheetMissing = (): void => { $('hint').textContent = 'The farm\'s pictures did not load, so the land is blank. Your farm is safe. Reload the page to try again.' }
if (sheetImage.complete) { if (sheetImage.naturalWidth > 0) sheetLoaded(); else sheetMissing() }
else { sheetImage.addEventListener('load', sheetLoaded); sheetImage.addEventListener('error', sheetMissing) }

/* ---------- clouds ---------- */
const clouds = [{ x: 40, y: 18, n: 0, v: 0.035 }, { x: 260, y: 8, n: 1, v: 0.025 }, { x: 400, y: 30, n: 2, v: 0.03 }]

/* ---------- small moments ---------- */
/** Something that flies off a crop for a blink: a splash, a ring, a burst of sparks. It changes nothing on the farm. */
interface Moment {
  kind: MomentKind
  x: number
  y: number
  /** How far above the ground it begins. */
  lift: number
  field: string
  /** Milliseconds to wait once the farm is in view, so a splash can land before the crop is seen to grow. */
  wait: number
  /** When it began, by the clock of `frame`. Null until the farm is in view: a sheet may still be covering it. */
  at: number | null
}
let moments: Moment[] = []
const DOT_COLORS: Record<Exclude<DotTone, 'field'>, string> = { water: '#4FA3E8', spray: '#DFF2FF', leaf: '#8AD47A', gold: '#FFD95A' }
const stillLife = typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-reduced-motion: reduce)') : null
/** Play a moment on a crop. Nothing plays for someone who has asked their device for less motion. */
function celebrate(kind: MomentKind, c: Crop, wait = 0): void {
  const seed = catalog.seed(c.seed)
  if (!seed || stillLife?.matches) return
  const lift = kind === 'splash' ? 0 : cropHeight(cropSprite(seed.layer, c.stage, c.perennial))
  moments.push({ kind, x: c.x, y: c.y, lift, field: colorOf(seed.pack), wait, at: null })
}
/** The moments still playing at time `t`, ready to be drawn in their place among the crops. */
function momentDrawables(t: number): Drawable[] {
  const farmInView = veil.hidden
  for (const m of moments) if (m.at === null && farmInView) m.at = t + m.wait
  moments = moments.filter((m) => m.at === null || t - m.at < MOMENT_MS[m.kind])
  return moments.flatMap((m): Drawable[] => {
    const at = m.at
    if (at === null) return []
    return [{ s: m.x + m.y + 0.02, d: () => {
      const p = iso(m.x, m.y)
      for (const dot of momentDots(m.kind, t - at)) px(p.sx + dot.x, p.sy + 11 - m.lift + dot.y, 2, 2, dot.tone === 'field' ? m.field : DOT_COLORS[dot.tone])
    } }]
  })
}

/* ---------- render ---------- */
let hover: { x: number; y: number } | null = null
function frame(t: number): void {
  // Asked for first, so that one frame that fails to draw does not stop every frame after it.
  requestAnimationFrame(frame)
  // The flags, the marks over a crop and the farmer's steps stand still for someone who has asked their device for less motion.
  const still = stillLife?.matches === true
  const beat = still ? 0 : t
  if (dirtyGround) buildGround()
  g = ctx
  // Everything below is drawn in pixels of art; the canvas scales each one up to a whole number of screen pixels.
  ctx.setTransform(view.zoom, 0, 0, view.zoom, 0, 0)
  ctx.imageSmoothingEnabled = false
  ctx.fillStyle = '#8FC8E8'; ctx.fillRect(0, 0, W, H); ctx.fillStyle = '#A4D6F0'; ctx.fillRect(0, Math.round(H * 0.57), W, H)
  spr('sky/sun', W - 40, 30)
  for (const c of clouds) { if (!still) c.x += c.v; if (c.x > W + 40) c.x = -40; spr('sky/cloud/' + c.n, c.x, c.y) }
  const cam = camera()
  ctx.drawImage(gcv, Math.round(cam.x + SHIFT.x - groundOx), Math.round(cam.y + SHIFT.y - 8))
  if (hover) {
    const p = iso(hover.x, hover.y)
    // On whole pixels of art, like everything else: between two, its rows would smear.
    const sx = Math.round(p.sx), sy = Math.round(p.sy)
    ctx.fillStyle = 'rgba(255,255,255,.28)'
    for (let r = 0; r < TH; r++) { const hw = r < 8 ? (r + 1) * 2 : (TH - r) * 2; ctx.fillRect(sx - hw, sy + r, hw * 2, 1) }
  }
  const f = store.ui.farmer
  const dx = f.tx - f.x, dy = f.ty - f.y
  const dist = Math.hypot(dx, dy)
  const walking = dist > 0.02
  // With less motion the farmer is simply there, not seen walking over.
  if (walking) { const sp = still ? dist : Math.min(0.07, dist); f.x += dx / dist * sp; f.y += dy / dist * sp }
  const list: Drawable[] = statics.slice()
  for (const c of D().crops) list.push({ s: c.x + c.y, d: () => { const p = iso(c.x, c.y); drawCrop(c, p.sx, p.sy); drawMarker(c, p.sx, p.sy, beat) } })
  // Your farmer stays at home while you look at someone else's farm.
  if (!visiting) list.push({ s: f.x + f.y + 0.01, d: () => { const p = iso(f.x, f.y); drawFarmer(p.sx, p.sy, walking && !still, beat) } })
  list.push(...momentDrawables(t))
  list.sort((a, b) => a.s - b.s)
  for (const o of list) o.d(beat)
}
requestAnimationFrame(frame)


/* ---------- HUD & sheets ---------- */
function hud(): void {
  $('hDay').textContent = String(S.day)
  $('hEnergyT').textContent = String(S.energy)
  $('hEnergy').style.width = (100 * S.energy / S.energyMax) + '%'
  $('hCoins').textContent = String(S.coins)
  $('hBarrel').textContent = String(S.barrel)
  $('hSave').hidden = !store.saveFailed()
  marketLit = buyersFor(S, catalog).some((b) => standing(b, S, catalog).buying)
  store.saveUi()
}
let toastT: number | undefined
function toast(m: string): void {
  const el = $('toast')
  el.textContent = m
  el.classList.add('on')
  clearTimeout(toastT)
  toastT = window.setTimeout(() => el.classList.remove('on'), 2800)
}
function hint(h: string): void { $('hint').innerHTML = h }
const veil = $('veil')
const sheet = $('sheet')
function open(html: string): void {
  sheet.innerHTML = html
  veil.hidden = false
  // A sheet that asks for writing starts in the box; the others start on their main button.
  const target = sheet.querySelector<HTMLElement>('textarea[data-min], input[type=text]') ?? sheet.querySelector<HTMLButtonElement>('button.pri') ?? sheet.querySelector<HTMLButtonElement>('button')
  // Focus moves into the sheet for the keyboard, but the sheet is read from its top.
  if (target) target.focus({ preventScroll: true })
  sheet.scrollTop = 0
}
/** A farm with no fields has not been set up: its farmer has yet to say what they want to grow. */
const needsSetup = (): boolean => Object.keys(S.fields).length === 0
function close(): void {
  veil.hidden = true
  // A farm link that arrived while the player was writing has waited for them to finish.
  const waiting = PENDING.shift()
  if (waiting !== undefined) return handleLink(waiting)
  // Until the farm has a field there is nothing to do on it, so the welcome comes back (unless they are looking at a friend's farm first).
  if (needsSetup() && !visiting) openWelcome(visitedPacks)
}
/** The sheet's primary button, if there is one. */
const primary = (): HTMLButtonElement | null => sheet.querySelector<HTMLButtonElement>('button.pri')
/**
 * True while the open sheet holds writing that has not been submitted: text in a writing box, or an explanation that
 * has been written and is being rated (its text is no longer in a box, but it is just as easy to lose).
 */
const hasDraft = (): boolean =>
  [...sheet.querySelectorAll<HTMLTextAreaElement>('textarea[data-min]')].some((t) => t.value.trim().length > 0) ||
  sheet.querySelector('[data-act="submitExplain"]') !== null
/** Dismiss by tapping away or Escape, but never while the player is mid-writing. The sheet's own buttons always close. */
function softClose(): void { if (!hasDraft()) close() }
// Close on a backdrop tap only when the press also began on the backdrop, so releasing a text selection outside the box does not close.
let downOnVeil = false
veil.addEventListener('pointerdown', (e) => { downOnVeil = e.target === veil })
veil.addEventListener('click', (e) => { if (e.target === veil && downOnVeil) softClose() })
document.addEventListener('keydown', (e) => {
  if (e.isComposing) return
  if (e.key === 'Escape' && !veil.hidden) return softClose()
  // Plus and minus zoom the farm, when no sheet is open and nobody is typing.
  const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement
  if (!veil.hidden || typing || e.ctrlKey || e.metaKey || e.altKey) return
  if (e.key === '+' || e.key === '=') zoomTo(view.zoom + 1)
  else if (e.key === '-' || e.key === '_') zoomTo(view.zoom - 1)
})
const foot = footHtml
const chip = (packId: string): string => chipHtml(packTitle(packId), colorOf(packId))
/** Keep the count under a writing box, and the button it gates, in step with what has been typed. */
sheet.addEventListener('input', (e) => {
  const box = e.target
  if (!(box instanceof HTMLTextAreaElement) || !box.dataset.min) return
  const n = box.value.trim().length
  const min = Number(box.dataset.min)
  const count = document.getElementById(box.id + 'Count')
  if (count) { count.textContent = countText(n, min); count.classList.toggle('ok', n >= min) }
  const gate = box.dataset.gate ? document.getElementById(box.dataset.gate) : null
  if (gate instanceof HTMLButtonElement) gate.disabled = n < min
})

/* ---------- the canvas on the page: its size, and the zoom ---------- */
const bZoomIn = byIdAs('bZoomIn', HTMLButtonElement)
const bZoomOut = byIdAs('bZoomOut', HTMLButtonElement)
/** Measure the canvas and set the view: the screen's own resolution, at the farmer's zoom or the one their screen starts at. */
function layout(): void {
  const r = cv.getBoundingClientRect()
  if (r.width < 1 || r.height < 1) return
  const dpr = window.devicePixelRatio || 1
  const next = fitView(r.width, r.height, dpr, store.ui.zoom ?? defaultZoom(Math.round(r.width * dpr), dpr))
  if (next.pw !== view.pw || next.ph !== view.ph || next.zoom !== view.zoom) {
    view = next
    W = view.w
    H = view.h
    SHIFT = shift(view)
    // Setting a canvas's size clears it, so only when it has changed.
    if (cv.width !== view.pw) cv.width = view.pw
    if (cv.height !== view.ph) cv.height = view.ph
  }
  const range = zoomRange(view.pw)
  // Dimmed at the end of the range, but not disabled: a disabled button drops the keyboard's place on the page.
  bZoomIn.setAttribute('aria-disabled', String(view.zoom >= range.max))
  bZoomOut.setAttribute('aria-disabled', String(view.zoom <= range.min))
}
/** Zoom to `zoom`, keeping the point of the farm under (fx, fy) where it is: fractions of the canvas, its middle by default. */
function zoomTo(zoom: number, fx = 0.5, fy = 0.5): void {
  const r = cv.getBoundingClientRect()
  const next = fitView(r.width, r.height, window.devicePixelRatio || 1, zoom)
  if (next.zoom === view.zoom) return
  const cam = camera()
  Object.assign(cam, cameraAfter(cam, view, next, fx, fy))
  store.ui.zoom = next.zoom
  layout()
  clampCam()
  store.saveUi()
}
bZoomIn.addEventListener('click', () => zoomTo(view.zoom + 1))
bZoomOut.addEventListener('click', () => zoomTo(view.zoom - 1))
if (typeof ResizeObserver === 'function') new ResizeObserver(layout).observe(cv)
window.addEventListener('resize', layout)
layout()

/* ---------- input: drag to pan, tap to act, pinch to zoom ---------- */
/** What the pointers on the canvas are doing. The rules are in hand.ts; this is where they meet the farm. */
let hand: Hand = idle()
/** The camera when the hold under way began, and how many pixels of art a point of the page was then. */
let held: { cx: number; cy: number; k: number } | null = null
/** The zoom the pinch under way began at. */
let pinchedFrom = 1
let dragging = false
/** A point of the page as a point of the canvas, in pixels of art. `k` is pixels of art to a point of the page. */
function toInternal(e: { clientX: number; clientY: number }): { ix: number; iy: number; k: number } {
  const r = cv.getBoundingClientRect()
  return { ix: (e.clientX - r.left) * W / r.width, iy: (e.clientY - r.top) * H / r.height, k: W / r.width }
}
function tileAt(ix: number, iy: number): { x: number; y: number } | null {
  const cam = camera()
  const dx = ix - cam.x - SHIFT.x, dy = iy - cam.y - SHIFT.y
  const x = Math.floor((dx / 16 + dy / 8) / 2), y = Math.floor((dy / 8 - dx / 16) / 2)
  return (x >= 0 && y >= 0 && x < N && y < N) ? { x, y } : null
}
function pick(ix: number, iy: number): Pick | null {
  // A flag is drawn over whatever stands behind it, so it takes the tap first: what you see is what you tap.
  for (const o of statics) if (o.kind === 'flag' && o.pack !== undefined && o.hit?.(ix, iy)) return { kind: 'flag', pack: o.pack }
  const crop = frontmost(D().crops.map((c) => {
    const seed = catalog.seed(c.seed)
    return { what: c, ...iso(c.x, c.y), sprite: seed ? cropSprite(seed.layer, c.stage, c.perennial, c.wilted) : '', s: c.x + c.y }
  }), ix, iy)
  if (crop) return { kind: 'crop', crop }
  for (const o of statics) {
    if (!o.hit || !o.kind || o.kind === 'forest' || o.kind === 'flag' || !o.hit(ix, iy)) continue
    return { kind: o.kind }
  }
  const t = tileAt(ix, iy)
  if (!t) return null
  // A sprout is a few pixels wide and a finger is not: a tap on the tile a crop stands on is a tap on the crop.
  const here = D().crops.find((c) => c.x === t.x && c.y === t.y)
  return here ? { kind: 'crop', crop: here } : { kind: 'tile', x: t.x, y: t.y }
}
/** Keep some of the world on screen: half its width either way, and its top edge above the bottom of the view. */
function clampCam(): void {
  const cam = camera()
  // The camera is kept as if the view were the reference size, so these limits hold at any zoom.
  cam.x = Math.max(REF.w / 2 - 16 * N, Math.min(REF.w / 2 + 16 * N, cam.x))
  cam.y = Math.max(100 - 16 * N, Math.min(REF.h - 40, cam.y))
}
/** Do what the hand says. */
function heard(said: Said): void {
  if (!said) return
  if (said.kind === 'hold') {
    const cam = camera()
    held = { cx: cam.x, cy: cam.y, k: W / cv.getBoundingClientRect().width }
  } else if (said.kind === 'pan') {
    if (!held) return
    dragging = true
    cv.classList.add('drag')
    const cam = camera()
    cam.x = held.cx + said.dx * held.k
    cam.y = held.cy + said.dy * held.k
    clampCam()
  } else if (said.kind === 'dropped') {
    endDrag()
    store.saveUi()
  } else if (said.kind === 'pinch-began') {
    endDrag()
    pinchedFrom = view.zoom
  } else if (said.kind === 'pinch') {
    const r = cv.getBoundingClientRect()
    // The farm stays put under the point between the fingers.
    zoomTo(pinchZoom(pinchedFrom, 1, said.by, view.pw), (said.at.x - r.left) / r.width, (said.at.y - r.top) / r.height)
  } else tap(said.at)
}
function endDrag(): void { dragging = false; cv.classList.remove('drag') }
/** Forget a pointer the page cancelled or lost (or all of them): nothing is tapped, and a drag keeps what it had moved. */
function letGo(id?: number): void {
  if (dragging) store.saveUi()
  hand = drop(hand, id)
  endDrag()
}
function tap(at: Point): void {
  const { ix, iy } = toInternal({ clientX: at.x, clientY: at.y })
  const p = pick(ix, iy)
  if (!p) return
  // On a neighbour's farm a tap can only look.
  if (visiting) {
    if (p.kind === 'crop') { if (visiting.past) toast(thenAndNow(p.crop, S, catalog) ?? ''); else openNeighbourCrop(p.crop) }
    else if (p.kind === 'flag') toast('The ' + packTitle(p.pack) + ' field.')
    return
  }
  if (p.kind === 'crop') { walkTo(p.crop.x, p.crop.y); onCrop(p.crop) }
  else if (p.kind === 'barn') { walkTo(9, 6); openBag() }
  else if (p.kind === 'well') { walkTo(14, 9); openWell() }
  else if (p.kind === 'compost') { walkTo(14, 10); openCompost() }
  else if (p.kind === 'sign') { walkTo(9, 8); openAlmanac() }
  else if (p.kind === 'gate') { walkTo(5, 9); openNeighbours() }
  else if (p.kind === 'market') { walkTo(MARKET.x, MARKET.y - 1); openMarket() }
  else if (p.kind === 'flag') openTree(p.pack)
  else onTile(p.x, p.y)
}
const pointOf = (e: PointerEvent): Point => ({ x: e.clientX, y: e.clientY })
cv.addEventListener('pointerdown', (e) => {
  // Only the main button: a right click is the browser's, for its own menu.
  if (e.button !== 0) return
  e.preventDefault()
  // Holding the pointer keeps a drag alive when it leaves the canvas. A pointer that cannot be held is still a pointer.
  try { cv.setPointerCapture(e.pointerId) } catch { /* nothing to hold */ }
  const [next, said] = press(hand, e.pointerId, pointOf(e), e.isPrimary)
  hand = next
  heard(said)
})
cv.addEventListener('pointermove', (e) => {
  const [next, said] = move(hand, e.pointerId, pointOf(e))
  hand = next
  heard(said)
  const p = toInternal(e)
  hover = (e.pointerType === 'mouse' && !dragging && !hand.pinch) ? tileAt(p.ix, p.iy) : null
})
cv.addEventListener('pointerup', (e) => {
  const [next, said] = lift(hand, e.pointerId, pointOf(e))
  hand = next
  heard(said)
})
// A pointer can leave without lifting: the page cancels it, or it is let go of outside the window. Left listed, it
// would make the next tap the second finger of a pinch.
cv.addEventListener('pointercancel', (e) => letGo(e.pointerId))
// (After an ordinary lift this finds nothing to forget: the lift came first.)
cv.addEventListener('lostpointercapture', (e) => { if (hand.fingers.has(e.pointerId)) letGo(e.pointerId) })
window.addEventListener('blur', () => letGo())
/** A pinch on a trackpad arrives as a wheel with Ctrl held. A plain wheel is left alone: it scrolls the page. */
let wheel: Wheel = { sum: 0, at: 0 }
cv.addEventListener('wheel', (e) => {
  if (!e.ctrlKey && !e.metaKey) return
  e.preventDefault()
  const turned = wheelStep(wheel, e.deltaY, e.deltaMode, e.timeStamp)
  wheel = turned.wheel
  if (turned.step === 0) return
  const r = cv.getBoundingClientRect()
  zoomTo(view.zoom + turned.step, (e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height)
}, { passive: false })
// Safari on a Mac tells of a trackpad pinch in events of its own, and zooms the whole page unless they are refused.
// On an iPhone the same events come beside the fingers' own, which have already done the zooming.
let gestureFrom = 1
const gestureScale = (e: Event): number | null => ('scale' in e && typeof e.scale === 'number' && e.scale > 0 ? e.scale : null)
cv.addEventListener('gesturestart', (e) => { e.preventDefault(); gestureFrom = view.zoom })
cv.addEventListener('gesturechange', (e) => {
  e.preventDefault()
  const scale = gestureScale(e)
  if (scale === null || hand.fingers.size > 0) return
  const r = cv.getBoundingClientRect()
  const at = 'clientX' in e && typeof e.clientX === 'number' && 'clientY' in e && typeof e.clientY === 'number' ? { x: e.clientX, y: e.clientY } : { x: r.left + r.width / 2, y: r.top + r.height / 2 }
  zoomTo(pinchZoom(gestureFrom, 1, scale, view.pw), (at.x - r.left) / r.width, (at.y - r.top) / r.height)
})
cv.addEventListener('gestureend', (e) => e.preventDefault())
cv.addEventListener('pointerleave', () => { hover = null })
function walkTo(x: number, y: number): void { const f = store.ui.farmer; f.tx = x; f.ty = y }
$('bHome').addEventListener('click', () => {
  if (visiting) { visiting.cam = camHome(); return }
  store.ui.cam = camHome()
  store.saveUi()
})

/* ---------- actions ---------- */
/** An event the farm would accept if the player did the work well enough. Used to refuse early, before they write anything. */
function probe(seed: Seed, mode: Mode): FarmEvent {
  const filler = (n: number): string => 'x'.repeat(n)
  const crop = cropOf(S, seed.id)
  if (mode === 'testout') return { type: 'unlocked', seed: seed.id, ok: true }
  if (mode === 'water') {
    return crop && waterWork(crop, seed) === 'recall'
      ? { type: 'watered', seed: seed.id, ok: true, work: 'recall' }
      : { type: 'watered', seed: seed.id, ok: true, work: 'explain', text: filler(RULES.explainMin), ticked: 1, of: 1 }
  }
  const work = harvestWork(seed)
  return work.kind === 'recall' ? { type: 'harvested', seed: seed.id, ok: true } : { type: 'harvested', seed: seed.id, ok: true, text: filler(work.minChars), ticked: 1, of: 1 }
}

function onCrop(c: Crop): void {
  const seed = catalog.seed(c.seed)
  if (!seed) return
  if (thirsty(c) || isRevivable(c, S.day)) { if (refused(probe(seed, 'water'))) return; return startWork(seed, 'water') }
  if (ripe(c)) { if (refused(probe(seed, 'harvest'))) return; return startWork(seed, 'harvest') }
  openCrop(seed.id)
}

/** Nothing to do for this crop: show where it stands, the notes written at planting and the journal. */
function openCrop(seedId: string): void {
  const crop = cropOf(S, seedId)
  const v = crop ? cropView(crop, S, catalog) : null
  if (!v) return toast('That is not planted.')
  open(cropSheetHtml(chip(v.pack), v))
}

function onTile(x: number, y: number): void {
  const tr = terrain(x, y)
  const k = tileKey(x, y)
  if (tr === 'soil') {
    if (S.crops.some((c) => c.x === x && c.y === y)) return
    walkTo(x, y)
    const sel = store.ui.seedSel
    if (!sel) return toast('Empty soil. Pick a seed from the barn (or Seed bag) first.')
    const seed = catalog.seed(sel)
    if (!seed) { store.ui.seedSel = null; return }
    if (refused({ type: 'planted', seed: seed.id, x, y, notes: 'x'.repeat(RULES.notesMin) })) return
    return openPlant(seed, x, y)
  }
  if (tr === 'path' || isBuildingTile(x, y)) return
  const near = neighbourFields(x, y, S.fields, S.cleared)
  const first = near[0]
  if (first !== undefined) {
    walkTo(x, y)
    const cost = fenceCost(tr)
    const others = near.slice(1).map((p) => '<button type="button" data-act="expand" data-arg="' + k + '|' + p + '">Add to ' + esc(packTitle(p)) + ' · ' + cost + ' coins</button>').join('')
    open(chip(first) + '<h2>' + (tr === 'wild' ? 'Clear and fence' : 'Fence it in') + '</h2><p>' + (tr === 'wild' ? 'Clear the wild ground and add' : 'Add') + ' this tile to the ' + esc(packTitle(first)) + ' field. Fields grow one tile at a time, in any shape.</p><p class="sub">Costs ' + cost + ' coins. You have ' + S.coins + '.</p>' +
      (others ? '<div class="branches">' + others + '</div>' : '') +
      foot('Add to ' + packTitle(first) + ' · ' + cost + ' coins', '<button type="button" data-act="close">Not now</button>'))
    const b = primary()
    if (b) { b.dataset.act = 'expand'; b.dataset.arg = k + '|' + first }
    return
  }
  if (tr === 'wild') {
    const kind = wildKind(x, y)
    if (kind === 'tree' || kind === 'bush') return openForage(x, y)
    return toast('Wilderness. Forage in the trees, or fence in land next to a field.')
  }
  toast('Open ground. Land next to a field can be fenced in.')
}

const COST: Record<Mode, number> = { water: RULES.water.energy, harvest: RULES.harvest.energy, testout: RULES.testOut.energy }

/** What the player did for a piece of work, as the farm records it. */
type Detail =
  | { work: 'recall' }
  | { work: 'explain' | 'write'; text: string; ticked: number; of: number }

/* Planting: read, then write your own notes. */
let PLANT: { seed: Seed; x: number; y: number } | null = null
function openPlant(seed: Seed, x: number, y: number): void {
  PLANT = { seed, x, y }
  const edge = edgeLine(seed, S, catalog)
  open(plantSheetHtml({
    chip: chip(seed.pack), name: seed.name, layer: LAYER_NAMES[seed.layer], harvest: seed.harvest, summary: seed.summary, minutes: seed.minutes,
    sources: sourceLinks(seed, catalog), notesMin: RULES.notesMin, textMax: RULES.textMax, energy: RULES.plant.energy, coins: RULES.plant.coins,
    ...(edge ? { edge } : {}),
  }))
}
function plant(): void {
  const p = PLANT
  if (!p) return
  const notes = byIdAs('notes', HTMLTextAreaElement).value
  if (!act({ type: 'planted', seed: p.seed.id, x: p.x, y: p.y, notes })) return
  PLANT = null
  store.ui.seedSel = null
  const sprout = cropOf(S, p.seed.id)
  if (sprout) celebrate('grow', sprout)
  close()
  hint('Planted <b>' + esc(p.seed.name) + '</b>. It will be thirsty tomorrow. Tap it then and answer to make it grow. Tap it any time it is idle to read your notes.')
  toast('Planted ' + p.seed.name + '.')
}

/** What a piece of work looks like on screen: a card for recall, a writing sheet for explaining and write-ups. */
function startWork(seed: Seed, mode: Mode): void {
  if (mode === 'water') {
    const c = cropOf(S, seed.id)
    if (!c) return
    return waterWork(c, seed) === 'recall' ? ask(seed, mode, recallBank(c, seed)) : openExplain(seed)
  }
  const work = harvestWork(seed)
  if (work.kind === 'recall') return ask(seed, mode, work.bank)
  openWrite(seed, mode)
}

interface Asking { seed: Seed; mode: Mode; opts: { txt: string; ok: boolean }[]; Q: Mcq }
let QC: Asking | null = null
function ask(seed: Seed, mode: Mode, bank: Mcq[]): void {
  const Q = bank[Math.floor(Math.random() * bank.length)]
  if (!Q) return
  const opts = shuffle([{ txt: Q.answer, ok: true }, ...Q.distractors.map((txt) => ({ txt, ok: false }))])
  QC = { seed, mode, opts, Q }
  open(chip(seed.pack) + '<h2>' + workTitle(seed, mode) + ' · ' + esc(seed.name) + '</h2><p class="sub">' + workSub(seed, mode) + '</p><p class="q">' + esc(Q.q) + '</p><div class="opts" id="opts">' + opts.map((o, i) => '<button type="button" data-act="opt" data-arg="' + i + '">' + esc(o.txt) + '</button>').join('') + '</div>')
}
const workTitle = (seed: Seed, mode: Mode): string => (mode === 'harvest' ? 'Harvest' : mode === 'testout' ? 'Jump the fence' : (cropOf(S, seed.id)?.wilted ? 'Revive' : 'Water'))
function workSub(seed: Seed, mode: Mode): string {
  if (mode === 'testout') return 'Prove you already know it. A clean answer unlocks the seed without its prerequisites.'
  const c = cropOf(S, seed.id)
  return esc(LAYER_NAMES[seed.layer]) + ' layer · ' + (c ? zone(c) : '') + ' · ' + COST[mode] + ' energy' + (mode === 'harvest' ? ' · premium grade makes it perennial' : '')
}

/* Explain: write it down first, with the notes hidden, then rate it against the rubric. */
let EXPLAIN: { seed: Seed; text: string } | null = null
function openExplain(seed: Seed, text = ''): void {
  EXPLAIN = { seed, text }
  open(chip(seed.pack) + '<h2>' + workTitle(seed, 'water') + ' · ' + esc(seed.name) + '</h2><p class="sub">' + workSub(seed, 'water') + '</p>' +
    '<p>Explain <b>' + esc(seed.name) + '</b> in your own words. Write first; your notes are hidden until you submit.</p>' +
    writingBox({ id: 'explain', label: 'Your explanation', min: RULES.explainMin, max: RULES.textMax, gate: 'rateGo', value: text, rows: 7 }) +
    '<div class="foot"><button type="button" data-act="close">Not now</button><button type="button" class="pri" id="rateGo" data-act="rate"' + (text.trim().length >= RULES.explainMin ? '' : ' disabled') + '>Rate it</button></div>')
}
function rate(): void {
  const e = EXPLAIN
  if (!e) return
  const text = byIdAs('explain', HTMLTextAreaElement).value.trim()
  if (text.length < RULES.explainMin) return
  EXPLAIN = { seed: e.seed, text }
  open(chip(e.seed.pack) + '<h2>Rate it · ' + esc(e.seed.name) + '</h2><h3>What you wrote</h3>' + noteHtml(text) +
    '<p class="sub">Be honest: you are the only judge. More than half the lines is a pass.</p>' +
    tickList('Your explanation…', explainChecklist(e.seed)) +
    '<div class="foot"><button type="button" data-act="editExplain">Edit</button><button type="button" class="pri" data-act="submitExplain">Submit</button></div>')
}
/** How many of the rubric lines on screen are ticked, and how many there are. */
function ticks(): { ticked: number; of: number } {
  const boxes = [...sheet.querySelectorAll<HTMLInputElement>('input[data-line]')]
  return { ticked: boxes.filter((b) => b.checked).length, of: boxes.length }
}
function submitExplain(): void {
  const e = EXPLAIN
  if (!e) return
  const { ticked, of } = ticks()
  const msg = settle(e.seed, 'water', explainPasses(ticked, of), { work: 'explain', text: e.text, ticked, of })
  if (msg === null) return close()
  EXPLAIN = null
  const notes = cropOf(S, e.seed.id)?.notes ?? ''
  open(chip(e.seed.pack) + '<h2>' + (explainPasses(ticked, of) ? 'Passed' : 'Not yet') + ' · ' + esc(e.seed.name) + '</h2><div class="res">' + msg + '<br><span class="sub">You rated ' + ticked + ' of ' + of + ' lines. It is kept in the crop\'s journal.</span></div>' +
    '<h3>Your planting notes</h3>' + (notes ? noteHtml(notes) : '<p class="sub">' + NO_NOTES + '</p>') +
    '<p class="sub">Compare: did your explanation say what your notes say, and more?</p>' + foot('Back to the farm'))
}

/* Harvest, and jumping the fence, for seeds whose proof is writing: a prompt, an answer, and every line of the checklist. */
let WRITE: { seed: Seed; mode: Mode } | null = null
function openWrite(seed: Seed, mode: Mode): void {
  const work = harvestWork(seed)
  if (work.kind !== 'write') return
  WRITE = { seed, mode }
  const prompt = pickPrompt(seed, S.day) ?? 'Show that you can do this: ' + seed.name + '.'
  const go = mode === 'harvest' ? 'Harvest · ' + RULES.harvest.energy + ' energy' : 'Jump the fence · ' + RULES.testOut.energy + ' energy'
  open(chip(seed.pack) + '<h2>' + workTitle(seed, mode) + ' · ' + esc(seed.name) + '</h2><p class="sub">' + workSub(seed, mode) + '</p><p class="q">' + esc(prompt) + '</p>' +
    writingBox({ id: 'write', label: work.proof ? 'Link or description' : 'Your answer', min: work.minChars, max: RULES.textMax, gate: 'writeGo', rows: work.proof ? 3 : 7 }) +
    tickList('Tick each line your answer meets', work.checklist) +
    '<p class="sub">Premium only if every line is ticked.' + (mode === 'testout' ? ' Your answer is saved to the farm log; a jump has no crop to keep a journal.' : '') + '</p>' +
    '<div class="foot"><button type="button" data-act="close">Not yet</button><button type="button" class="pri" id="writeGo" data-act="submitWrite" disabled>' + go + '</button></div>')
}
function submitWrite(): void {
  const w = WRITE
  if (!w) return
  const text = byIdAs('write', HTMLTextAreaElement).value.trim()
  const { ticked, of } = ticks()
  const ok = writePasses(ticked, of)
  const msg = settle(w.seed, w.mode, ok, { work: 'write', text, ticked, of })
  if (msg === null) return close()
  WRITE = null
  open(chip(w.seed.pack) + '<h2>' + workTitle(w.seed, w.mode) + ' · ' + esc(w.seed.name) + '</h2><div class="res">' + msg + '<br><span class="sub">You ticked ' + ticked + ' of ' + of + ' lines.' + (w.mode === 'harvest' ? ' Your write-up is kept in the crop\'s journal.' : '') + '</span></div>' + foot('Back to the farm'))
}

/** The event for a finished piece of work. */
function workEvent(seed: Seed, mode: Mode, ok: boolean, d: Detail): FarmEvent {
  if (mode === 'testout') return d.work === 'write' ? { type: 'unlocked', seed: seed.id, ok, text: d.text, ticked: d.ticked, of: d.of } : { type: 'unlocked', seed: seed.id, ok }
  if (mode === 'water') return d.work === 'explain' ? { type: 'watered', seed: seed.id, ok, work: 'explain', text: d.text, ticked: d.ticked, of: d.of } : { type: 'watered', seed: seed.id, ok, work: 'recall' }
  return d.work === 'write' ? { type: 'harvested', seed: seed.id, ok, text: d.text, ticked: d.ticked, of: d.of } : { type: 'harvested', seed: seed.id, ok }
}

/** Send the outcome of a piece of work to the farm and describe it. Null if the farm refused it (the reason is already on screen). */
function settle(seed: Seed, mode: Mode, ok: boolean, detail: Detail): string | null {
  const before = cropOf(S, seed.id)?.stage
  if (!act(workEvent(seed, mode, ok, detail))) return null
  const name = esc(seed.name)
  const c = cropOf(S, seed.id)
  if (c && ok && mode === 'harvest') celebrate('harvest', c)
  if (c && ok && mode === 'water') {
    celebrate('splash', c)
    if (before !== undefined && c.stage > before) celebrate('grow', c, MOMENT_MS.splash / 2)
  }
  if (mode === 'testout') {
    return ok ? '<b>Over the fence.</b> ' + name + ' is unlocked. ' + esc(afterJump(seed, S, catalog)) : '<b>Not yet.</b> ' + name + ' stays locked. Root its prerequisites, or try again tomorrow.'
  }
  if (!c) return ''
  // What the seed's guilds paid, or which of them the tree now drags.
  const guilds = guildNews(seed, S, catalog, ok).lines.map((l) => ' ' + esc(l)).join('')
  if (mode === 'harvest') {
    const pay = harvestPay(seed, S, catalog)
    const drops = saplingNews(seed, catalog)
    return ok
      ? '<b>Premium grade.</b> +' + pay.coins + ' coins' + (pay.edge ? ' (' + timesOver(RULES.edge.times) + ': it sits on the edge of the ' + esc(pay.edge) + ' field)' : '') + '. ' + name + ' is now a perennial: rooted, it only needs a check-in every ' + RULES.perennialInterval + ' days. Seeds that needed it are now unlocked.' + guilds + (drops ? ' ' + esc(drops) : '')
      : '<b>Seconds.</b> Composted. ' + name + ' drops back to stage ' + (c.stage + 1) + ' and goes in the review heap.'
  }
  if (ok) {
    return c.perennial
      ? '<b>Checked in.</b> ' + name + ' stays rooted. Next check-in on day ' + c.due + '.' + guilds
      : '<b>Watered.</b> ' + name + ' grows to stage ' + (c.stage + 1) + '/5. Next watering on day ' + c.due + ' (' + zone(c) + ').'
  }
  return '<b>Wilted.</b> ' + name + (c.perennial ? '' : ' drops a stage and') + ' goes in the compost heap. Revive it tomorrow.' + guilds
}

function answer(i: number): void {
  if (!QC) return
  const { seed, mode, opts, Q } = QC
  const chosen = opts[i]
  if (!chosen) return
  QC = null
  const msg = settle(seed, mode, chosen.ok, { work: 'recall' })
  if (msg === null) return close()
  const optsEl = $('opts')
  ;[...optsEl.children].forEach((el, j) => {
    if (!(el instanceof HTMLButtonElement)) return
    el.disabled = true
    if (opts[j]?.ok) el.classList.add('ok')
    else if (j === i) el.classList.add('bad')
  })
  const r = document.createElement('div')
  r.className = 'res'
  r.innerHTML = msg + '<br><span class="sub">' + esc(Q.why) + '</span>'
  optsEl.after(r)
  const f = document.createElement('div')
  f.innerHTML = foot('Back to the farm')
  if (f.firstElementChild) r.after(f.firstElementChild)
  primary()?.focus()
}

function expand(arg: string): void {
  const [k, pack] = arg.split('|')
  const m = k ? /^(\d+),(\d+)$/.exec(k) : null
  if (!m || !pack) return
  if (!act({ type: 'fenced', x: Number(m[1]), y: Number(m[2]), pack })) return
  close()
  toast('Fenced in. The ' + packTitle(pack) + ' field grew.')
}

function openBag(): void {
  let html = '<h2>Seed bag</h2><p class="sub">Each seed is a topic. Plant it in its own field with notes in your own words, water it by answering or explaining, harvest it to make it perennial. ' + RULES.plant.energy + ' energy + ' + RULES.plant.coins + ' coins to plant, and ' + RULES.newSeedsPerDay + ' new seeds a day.</p>'
  for (const sec of bagView(S, catalog, store.ui.seedSel)) {
    const labels = [
      sec.perennial ? 'perennial' : '',
      sec.capPercent !== null ? "uses at most " + sec.capPercent + "% of the day's energy (" + catalog.capOf(sec.pack, S.energyMax) + ')' : '',
      sec.focusTitle ? 'focus: ' + esc(sec.focusTitle) : '',
    ].filter(Boolean)
    html += '<div class="fh"><i style="background:' + sec.color + '"></i>' + esc(sec.title) + '</div>' + (labels.length ? '<div class="sub">' + labels.join(' · ') + '</div>' : '') + '<div>'
    for (const sd of sec.seeds) {
      const tag = '<span class="tag">' + esc(sd.harvest) + '</span>'
      const edge = (sd.sapling ? ' · sapling of ' + esc(sd.sapling) : '') + (sd.edge ? ' · edge of ' + esc(sd.edge) : '')
      if (sd.status === 'held') html += '<div class="row"><div class="n">' + esc(sd.name) + '<small>' + esc(sd.layer) + ' ' + tag + edge + ' · plant in the ' + esc(sd.below ?? '') + ' layer first</small></div><span class="sub">waiting</span></div>'
      else if (sd.status !== 'ready') html += '<div class="row slim"><div class="n">' + esc(sd.name) + '<small>' + esc(sd.layer) + ' · in the ground ' + tag + ' ' + sd.status + edge + '</small></div><button type="button" data-act="cropSheet" data-arg="' + esc(sd.id) + '">Notes</button></div>'
      else html += '<div class="row"><div class="n">' + esc(sd.name) + '<small>' + esc(sd.layer) + ' ' + tag + edge + (sd.focus ? ' · focus' : '') + '</small></div><button type="button" data-act="seed" data-arg="' + sd.id + '"' + (sd.selected ? ' class="pri"' : '') + '>' + (sd.selected ? 'Selected' : 'Select') + '</button></div>'
    }
    if (sec.lockedCount) html += '<div class="row locked slim"><div class="n">' + sec.lockedCount + ' locked<small>see the learning tree</small></div></div>'
    html += '</div>'
  }
  html += '<h3>Your farm</h3><p class="sub">Saved in this browser only, as a log of everything you did. Export it before clearing site data or moving machines.</p><div class="branches"><button type="button" data-act="export">Export farm</button><button type="button" data-act="import">Import farm</button></div>'
  html += foot('Close', '<button type="button" class="link" data-act="reset">Reset farm</button>')
  open(html)
}
function exportFarm(): void {
  const data = farmFileText(store.events())
  const name = farmFileName(S.day)
  try {
    const blob = new Blob([data], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = name
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(a.href), 2000)
  } catch { /* the textarea below is the fallback */ }
  open('<h2>Export farm</h2><p class="sub">A file named <b>' + esc(name) + '</b> should have downloaded. If not, copy this and keep it somewhere safe.</p><label for="exp" class="sub">Farm data</label><textarea id="exp" readonly>' + esc(data) + '</textarea>' + foot('Close', '<button type="button" data-act="copyExp">Copy</button>'))
}
function importFarm(): void {
  open('<h2>Import farm</h2><p class="sub">Choose an exported file, or paste its contents. This replaces the farm in this browser. Farms saved by the first prototype work too.</p><input type="file" id="impFile" accept="application/json,.json"><label for="imp" class="sub">Or paste here</label><textarea id="imp"></textarea>' + foot('Import', '<button type="button" data-act="close">Cancel</button>'))
  const b = primary()
  if (b) b.dataset.act = 'doImport'
  byIdAs('impFile', HTMLInputElement).addEventListener('change', (e) => {
    const input = e.target
    const f = input instanceof HTMLInputElement ? input.files?.[0] : undefined
    if (!f) return
    f.text().then((t) => { byIdAs('imp', HTMLTextAreaElement).value = t }, () => toast('Could not read that file.'))
  })
}
/** A log the player chose to import that would lose entries, waiting for them to say "import anyway". */
let IMPORT: LoggedEvent[] | null = null
function doImport(): void {
  const parsed = parseFarmFile(byIdAs('imp', HTMLTextAreaElement).value)
  if (parsed.kind === 'error') return toast(parsed.message)
  if (parsed.kind === 'v2') return finishImport(store.importSnapshot(parsed.snapshot))
  // Say what would be lost before the farm in this browser is replaced, not after.
  const refused = refusedCount(parsed.events, catalog)
  if (refused === 0) return finishImport(store.importLog(parsed.events))
  IMPORT = parsed.events
  open('<h2>This farm does not fully fit</h2><p>' + esc(driftText(refused)) + '</p><p class="sub">It was probably saved by a different version of the game (this one is ' + esc(__APP_VERSION__) + '). You can import it as it is, or keep the farm you have and report this.</p>' +
    foot('Keep my farm', '<button type="button" data-act="importAnyway">Import anyway</button>'))
}
/** `toldAbout` is how many skipped entries the player has just agreed to, so the next load does not warn again. */
function finishImport(problem: string | null, toldAbout = 0): void {
  IMPORT = null
  if (problem) return toast(problem)
  store.ui.driftSeen = toldAbout
  adopt()
  close()
  toast('Farm imported. Day ' + S.day + '.')
}

/** Reset and the welcome both end here. A fresh farm goes on to the welcome, where its farmer picks their fields. */
function startNewFarm(kind: 'fresh' | 'sample'): void {
  visitedPacks = []
  store.newFarm(kind)
  adopt()
  close()
  if (kind === 'sample') toast('Sample farm loaded. Day ' + S.day + '.')
}
/** Open a field for each pack ticked in the picker on screen. */
function openTickedFields(): void {
  const ticked = [...sheet.querySelectorAll<HTMLInputElement>('input[data-pack]')].filter((b) => b.checked).map((b) => b.dataset.pack ?? '')
  const first = needsSetup()
  for (const e of fieldsToOpen(S, catalog, ticked)) if (!act(e)) return
  if (needsSetup()) return
  visitedPacks = []
  // The world may have grown with the fields; centre on it, and save that, or a reload shows the farm off-centre.
  store.ui.cam = camHome()
  store.saveUi()
  close()
  if (first) hint('Open the <b>Seed bag</b>, pick a seed, then tap soil in its field to plant it with notes in your own words.')
  toast(first ? 'Your farm is ready. Day ' + S.day + '.' : 'Field opened.')
}
function openReset(): void {
  open('<h2>Start a new farm?</h2><p>This replaces the farm in this browser. Export it first if you want to keep it.</p><p class="sub"><b>Start fresh</b>: day 1, ' + RULES.start.coins + ' coins, and you choose what to grow. <b>Sample farm</b>: the prototype farm on day 12, with crops already growing.</p><div class="branches"><button type="button" data-act="newFarm" data-arg="fresh">Start fresh</button><button type="button" data-act="newFarm" data-arg="sample">Sample farm</button></div>' + foot('Cancel'))
}
/** The first thing a new farm shows: what the game is, and which fields to start with. `ticked` are packs to tick for the farmer. */
function openWelcome(ticked: readonly string[] = []): void {
  const picker = pickerView(catalog, S, ticked)
  open('<h2>Welcome to Permaculture</h2><p>A farm where the crops are the things you are learning. Plant a seed with notes in your own words, water it by answering and explaining, and it grows. Leave a crop two days past thirsty and it wilts, unless the rain barrel has a day to spend.</p>' +
    pickerHtml(picker) +
    '<p class="sub">Each one becomes a field on your farm. Pick at least one; you can open the others later from the learning tree. You can plant ' + RULES.newSeedsPerDay + ' new seeds a day, and everything is saved in this browser.</p>' +
    '<div class="foot"><button type="button" data-act="newFarm" data-arg="sample">Try the sample farm</button><button type="button" class="pri" id="fieldsGo" data-act="openFields"' + (picker.some((p) => p.ticked) ? '' : ' disabled') + '>Start my farm</button></div>')
}
// The picker's button waits for at least one tick.
sheet.addEventListener('change', (e) => {
  const go = document.getElementById('fieldsGo')
  if (go instanceof HTMLButtonElement) go.disabled = !sheet.querySelector('input[data-pack]:checked')
  // On the Share sheet, ticking a field remakes the link, so what is on screen is always what would be sent.
  if (e.target instanceof HTMLInputElement && e.target.dataset.show !== undefined) {
    openShare([...sheet.querySelectorAll<HTMLInputElement>('input[data-show]')].filter((b) => b.checked).map((b) => b.dataset.show ?? ''))
  }
})
sheet.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.isComposing && e.target instanceof HTMLInputElement && e.target.id === 'farmName') { e.preventDefault(); saveName() }
})
function openWell(): void { open('<h2>Rain barrel</h2><p>' + S.barrel + ' of ' + RULES.barrel.max + ' days stored.</p><p class="sub">Catch and store energy. End a day with ' + RULES.barrel.fillAt + '+ energy left and the barrel fills by one. When a crop is about to wilt, the barrel spends a day to keep it alive. It never grows a crop; only you do.</p>' + foot()) }
function openCompost(): void {
  const items = S.compost.map((id) => catalog.seed(id)).filter((s): s is Seed => s !== undefined)
  open('<h2>Compost heap</h2><p class="sub">Produce no waste. A failed answer is not lost; it is the next thing to review.</p><div>' + (items.length ? items.map((s) => '<div class="row"><div class="n">' + esc(s.name) + '<small>' + esc(packTitle(s.pack)) + ' · tap the crop to revive it</small></div></div>').join('') : '<p>Empty. Nothing failed recently.</p>') + '</div>' + foot())
}

function openForage(x: number, y: number): void {
  const fd = pickFind(findCandidates(S, catalog), x, y, S.day)
  if (!fd) return toast('The forest is quiet today. Plant something new and come back.')
  const link = fd.near.map(nameOf).join(', ')
  open('<div><span class="chip" style="--c:#4F8F3C">Zone 5 · wilderness</span></div><h2>Wild find</h2><p class="sub">Observe and interact. Nothing here counts toward readiness; it widens the edge of what you are growing. Related to: ' + esc(link) + '.</p><div class="find">' + esc(fd.text) + '</div>' +
    foot('Forage · ' + RULES.forage.energy + ' energy', '<button type="button" data-act="close">Leave it</button>'))
  const b = primary()
  if (b) { b.dataset.act = 'forage'; b.dataset.arg = fd.id + '|' + x + '|' + y }
}
function forage(arg: string): void {
  const [id, xs, ys] = arg.split('|')
  const fd = id ? catalog.find(id) : undefined
  if (!fd || !act({ type: 'foraged', x: Number(xs), y: Number(ys), find: fd.id })) return
  let html = '<h2>Foraged</h2><p>+' + RULES.forage.coins + ' coins. Noted in your field journal.</p>'
  const wild = fd.seed && !S.volunteers.includes(fd.seed) ? catalog.seed(fd.seed) : undefined
  if (wild) {
    html += '<p>This one could be domesticated: <b>' + esc(wild.name) + '</b> would become a volunteer seed in the ' + esc(packTitle(wild.pack)) + ' field (needs ' + esc(needsText(wild, catalog)) + ').</p>' + foot('Domesticate ' + wild.name, '<button type="button" data-act="close">Leave it wild</button>')
    open(html)
    const b = primary()
    if (b) { b.dataset.act = 'domesticate'; b.dataset.arg = wild.id }
  } else {
    open(html + foot('Back to the farm'))
  }
}
function domesticate(id: string): void {
  const seed = catalog.seed(id)
  if (!seed || !act({ type: 'domesticated', seed: id })) return
  close()
  toast(seed.name + ' added to your seed bag as a volunteer.')
}

/* ---------- neighbours: the gate, sharing, arriving by link, visiting ---------- */
/** Farm links that arrived while the player was writing. They wait, in order, and open one at a time as sheets close. */
const PENDING: string[] = []
/** The fields of the farm last visited, ticked for someone who goes on to start a farm of their own. */
let visitedPacks: string[] = []
/** A picture that has just arrived, waiting for the player to say what to do with it. */
let ARRIVAL: { picture: Picture; state: FarmState } | null = null
/** The hint line as it was before a visit replaced it. */
let homeHint = ''
const BAR_BUTTONS = ['bBag', 'bTree', 'bReady', 'bSleep']
const visitLabel = (p: Picture): string => p.name + "'s farm"
const visitDetail = (p: Picture): string => 'day ' + p.day + ', picture ' + ageText(p.at, Date.now())
const packsOf = (p: Picture): string[] => p.fields.map((f) => f.pack)

/** Show another farm on the canvas, read-only, with a camera of its own. */
function enterVisit(state: FarmState, who: string, label: string, detail: string, packs: string[], past = false): void {
  if (!visiting) homeHint = $('hint').innerHTML
  visiting = { state, who, label, cam: { x: 0, y: 0 }, packs, past }
  // A moment belongs to your own farm: it does not follow you through the gate.
  moments = []
  buildStatics()
  visiting.cam = camHome()
  hover = null
  // Whose farm, its day, and how old the picture is: always on screen while you are there.
  $('visitName').textContent = label.charAt(0).toUpperCase() + label.slice(1)
  $('visitDetail').textContent = detail
  $('bBack').textContent = past ? 'Back to today' : needsSetup() ? 'Start my own farm' : 'Back to my farm'
  $('visit').hidden = false
  for (const id of BAR_BUTTONS) byIdAs(id, HTMLButtonElement).disabled = true
  hint(past
    ? 'You are looking at <b>' + esc(label) + '</b> (' + esc(detail) + '). Drag to look around, and tap a crop to see how it stood then and how it stands today. Nothing here can be changed: it has already happened.'
    : 'You are looking at <b>' + esc(label) + '</b>' + (detail ? ' (' + esc(detail) + ')' : '') + '. Drag to look around, and tap a crop to see what it is. Nothing you do here changes either farm.')
}
/** Back to your own farm, with your camera where you left it. `quiet` is for when another sheet is about to open. */
function leaveVisit(quiet = false): void {
  if (!visiting) return
  // Only someone with no farm yet has their picker ticked from what they just saw.
  visitedPacks = needsSetup() ? visiting.packs : []
  visiting = null
  buildStatics()
  clampCam()
  $('visit').hidden = true
  for (const id of BAR_BUTTONS) byIdAs(id, HTMLButtonElement).disabled = false
  $('hint').innerHTML = homeHint
  if (!quiet && needsSetup()) openWelcome(visitedPacks)
}
function openNeighbourCrop(crop: Crop): void {
  const v = neighbourCropView(crop, S, catalog)
  if (v && visiting) open(neighbourCropSheetHtml(chip(v.pack), v, visiting.who))
}

function openNeighbours(): void {
  const now = Date.now()
  latestBook()
  open(neighboursSheetHtml({ name: S.name, shared: book.shared ? ageText(book.shared, now) : null, rows: neighbourRows(book, now), green: VILLAGE_GREEN }))
}
function visitNeighbour(code: string): void {
  const n = book.neighbours.find((x) => x.picture.code === code)
  if (!n || tooOld(n.picture.at, Date.now())) return toast('No recent picture. Ask for a new link.')
  enterVisit(layOut(n.picture, catalog).state, n.picture.name, visitLabel(n.picture), visitDetail(n.picture), packsOf(n.picture))
  close()
}

/* A farm needs a name before it can be shared. */
let AFTER_NAME: 'share' | 'neighbours' = 'neighbours'
function openName(then: 'share' | 'neighbours'): void {
  AFTER_NAME = then
  open(nameSheetHtml(S.name, RULES.farmName.max))
}
function saveName(): void {
  if (!act({ type: 'farm-named', name: byIdAs('farmName', HTMLInputElement).value })) return
  if (AFTER_NAME === 'share') openShare()
  else openNeighbours()
}

/** The link on the Share sheet, as it will be opened: made, read back and laid out the way a neighbour's game does it. */
let SHARE: ShareView | null = null
function openShare(show?: readonly string[]): void {
  if (!S.name) return openName('share')
  const mine = catalog.packs.filter((p) => Object.hasOwn(S.fields, p.pack))
  const ticked = show ?? mine.map((p) => p.pack)
  const now = Date.now()
  SHARE = shareView(S, ticked, { code: ownCode(), at: momentOf(now), game: __APP_VERSION__ }, catalog, now)
  // The link opens wherever this game is running, so forks and local copies work too.
  const url = SHARE ? location.origin + location.pathname + '#' + SHARE.hash : null
  open(shareSheetHtml({
    name: S.name, packs: mine.map((p) => ({ pack: p.pack, title: p.title, color: packColor(p), ticked: ticked.includes(p.pack) })),
    view: SHARE, url, canShare: typeof navigator.share === 'function',
  }))
}
/** Remember when a link was last made, for the Neighbours sheet. */
function markShared(): void {
  changeBook((b) => ({ ...b, shared: new Date().toISOString() }))
}
function copyFrom(id: string, then?: () => void): void {
  const t = byIdAs(id, HTMLTextAreaElement)
  const done = (): void => { toast('Copied.'); then?.() }
  const fail = (): void => { t.focus(); t.select(); toast('Select all and copy.') }
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t.value).then(done, fail)
  else fail()
}
function shareNative(): void {
  const url = byIdAs('shareLink', HTMLTextAreaElement).value
  navigator.share({ title: S.name + "'s farm · Permaculture", url }).then(markShared, () => { /* the player closed the share sheet */ })
}
function previewShare(): void {
  if (!SHARE) return
  enterVisit(layOut(SHARE.picture, catalog).state, S.name, 'your farm as a neighbour will see it', '', [])
  close()
}
function openPaste(): void {
  open('<h2>Paste a link</h2><p class="sub">For a farm link that opened in a different browser or inside another app: copy it there and paste it here.</p><label for="pasteBox" class="sub">Farm link</label><textarea id="pasteBox" class="short" rows="3"></textarea>' +
    '<div class="foot"><button type="button" data-act="neighbours">Back</button><button type="button" class="pri" data-act="openPasted">Open link</button></div>')
}

/**
 * A link has arrived, in the address or pasted. A link is written by someone else: whatever cannot be read is refused
 * with one plain sentence. It never replaces a sheet that holds a draft.
 */
function handleLink(text: string): void {
  if (!veil.hidden && hasDraft()) {
    // A handful is plenty; past that, someone is pasting links at us.
    if (PENDING.length < 5) PENDING.push(text)
    return toast('A farm link has arrived. It will open when you finish writing.')
  }
  const link = readLink(text)
  if (!link) return toast('That link cannot be read.')
  if ('newer' in link || link.kind !== 'farm') return toast('That link needs a newer version of the game.')
  const now = Date.now()
  const read = readPicture(link.payload, catalog, now)
  if (!read) return toast('That link cannot be read.')
  const p = read.picture
  if (p.code === ownCode()) return toast(arrivalText('own', p.name))
  if (tooOld(p.at, now)) return toast(arrivalText('too-old', p.name))
  const first = needsSetup()
  if (!first && latestBook().neighbours.some((n) => n.picture.code === p.code)) {
    // A neighbour you have: the later picture is kept, and an older link changes nothing.
    let result: Arrival = 'not-newer'
    changeBook((b) => { const r = receive(b, p, ownCode(), now); result = r.result; return r.book })
    return toast(arrivalText(result, p.name))
  }
  const laid = layOut(p, catalog)
  leaveVisit(true)
  ARRIVAL = { picture: p, state: laid.state }
  // Someone who has never played lands on the sender's farm: that is the front door to the game.
  if (first) enterVisit(laid.state, p.name, visitLabel(p), visitDetail(p), packsOf(p))
  open(arrivalSheetHtml({ name: p.name, day: p.day, age: ageText(p.at, now), fields: packsOf(p).map(packTitle), newer: read.newer, misfit: read.misfit + laid.misfit, firstTime: first }))
}
/** Keep the picture that has just arrived. Returns what to tell the player. */
function keepArrival(): string | null {
  const a = ARRIVAL
  if (!a) return null
  ARRIVAL = null
  let result: Arrival = 'not-newer'
  changeBook((b) => { const r = receive(b, a.picture, ownCode(), Date.now()); result = r.result; return r.book })
  return arrivalText(result, a.picture.name)
}
/** From a friend's farm to a farm of your own: the friend becomes your first neighbour, and their fields are ticked for you. */
function startFromVisit(): void {
  keepArrival()
  veil.hidden = true
  if (visiting) leaveVisit()
  else if (needsSetup()) openWelcome(visitedPacks)
}
const hasLink = (): boolean => /^#(farm|gift)=/.test(location.hash)
/** Take a link out of the address. It is cleared once taken, so a reload does not ask again. */
function takeHash(): void {
  if (!hasLink()) return
  const text = location.hash
  history.replaceState(null, '', location.pathname + location.search)
  handleLink(text)
}
window.addEventListener('hashchange', takeHash)
$('bBack').addEventListener('click', () => { if (needsSetup()) startFromVisit(); else leaveVisit() })

/* ---------- learning tree ---------- */
/** The tab the tree opens on: the field last looked at, else any field this farm has. Never a pack it does not grow. */
const treePack = (): string => {
  const saved = store.ui.treeTab
  if (saved && catalog.pack(saved) && Object.hasOwn(S.fields, saved)) return saved
  return (catalog.packs.find((p) => Object.hasOwn(S.fields, p.pack)) ?? catalog.packs[0])?.pack ?? ''
}
const SVG_FONT = 'font-family="DM Sans Variable,system-ui"'
function treeSvg(v: TreeView): string {
  const narrow = v.columnWidth < 200
  let s = '<svg class="tree" width="' + v.width + '" height="' + v.height + '" viewBox="0 0 ' + v.width + ' ' + v.height + '" style="aspect-ratio:' + v.width + '/' + v.height + ';flex:none" role="img" aria-label="Learning tree for ' + esc(v.title) + '">'
  for (const b of v.branches) {
    const lines = narrow ? splitName(b.title) : [b.title]
    lines.forEach((l, i) => {
      const y = narrow ? 14 + i * 11 : 22
      s += '<text x="' + b.x + '" y="' + y + '" text-anchor="middle" fill="#C6B48E" font-size="' + (narrow ? 11 : 12) + '" ' + SVG_FONT + '>' + esc(l) + (b.focus && i === lines.length - 1 ? ' · focus' : '') + '</text>'
    })
  }
  for (let i = 1; i < v.branches.length; i++) s += '<line x1="' + (i * v.columnWidth) + '" y1="8" x2="' + (i * v.columnWidth) + '" y2="' + (v.height - 8) + '" stroke="#3B3020" stroke-dasharray="3 4"/>'
  for (const e of v.edges) {
    s += '<path d="M' + e.from.x + ' ' + (e.from.y + 18) + ' C ' + e.from.x + ' ' + (e.from.y + 48) + ', ' + e.to.x + ' ' + (e.to.y - 48) + ', ' + e.to.x + ' ' + (e.to.y - 18) + '" fill="none" stroke="' + (e.rooted ? v.color : '#5C4A2E') + '" stroke-width="2"' + (e.rooted ? '' : ' stroke-dasharray="4 4"') + '/>'
  }
  for (const n of v.nodes) {
    const fill = n.status === 'rooted' ? v.color : '#3B3020'
    const stroke = n.status === 'rooted' || n.status === 'growing' ? v.color : n.status === 'ready' || n.status === 'held' ? '#F4EAD0' : '#5C4A2E'
    const tc = n.status === 'rooted' ? '#10200C' : n.status === 'locked' ? '#8F7F60' : '#F4EAD0'
    s += '<rect x="' + (n.x - n.width / 2) + '" y="' + (n.y - 18) + '" width="' + n.width + '" height="36" rx="6" fill="' + fill + '" stroke="' + stroke + '" stroke-width="2"' + (n.status === 'locked' ? ' stroke-dasharray="4 3"' : n.status === 'held' ? ' stroke-dasharray="8 4"' : '') + '/>'
    n.lines.forEach((l, i) => { s += '<text x="' + n.x + '" y="' + (n.y + (n.lines.length === 1 ? 4 : (i === 0 ? -1 : 11))) + '" text-anchor="middle" fill="' + tc + '" font-size="10.5" font-weight="600" ' + SVG_FONT + '>' + esc(l) + '</text>' })
    if (n.progress !== null) s += '<rect x="' + (n.x - n.width / 2) + '" y="' + (n.y + 14) + '" width="' + (n.width * n.progress) + '" height="4" rx="2" fill="' + v.color + '"/>'
    // An extra carries a dot: green for a wild find, pale for a sapling. The dark ring keeps it clear of a field's own colour.
    if (n.wild || n.sapling) s += '<circle cx="' + (n.x + n.width / 2 - 6) + '" cy="' + (n.y - 12) + '" r="4" fill="' + (n.wild ? '#4F8F3C' : '#F4EAD0') + '" stroke="#1B140A" stroke-width="1.5"/>'
  }
  return s + '</svg>'
}
function openTree(packId: string = treePack()): void {
  const v = treeView(packId, S, catalog)
  if (!v) return
  let html = '<h2>Learning tree</h2><p class="sub">What you could grow, including what you cannot reach yet. A wild seed joins it when you domesticate it, and a sapling when its tree drops it. A seed unlocks when the seeds it needs are <b>rooted</b> (harvested to perennial). Pick a branch to focus; the seed bag puts it first.</p>'
  html += '<div class="tabs">' + catalog.packs.map((p) => '<button type="button" data-act="treeTab" data-arg="' + esc(p.pack) + '"' + (p.pack === v.pack ? ' class="on"' : '') + '><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:' + packColor(p) + ';margin-right:6px;vertical-align:-1px"></span>' + esc(p.title) + '</button>').join('') + '</div>'
  if (!Object.hasOwn(S.fields, v.pack)) {
    // A pack this farm does not grow yet: say what it is and offer the field.
    const about = pickerView(catalog, S, []).find((p) => p.pack === v.pack)
    html += '<p>' + esc(about?.description ?? '') + '</p><p class="sub">' + (about?.seeds ?? 0) + ' seeds. You do not have this field. Opening it is free, and it takes the next plot of land on your farm.</p>' +
      foot('Close', '<button type="button" data-act="openField" data-arg="' + esc(v.pack) + '">Open this field</button>')
    return open(html)
  }
  if (v.readiness) html += '<p class="sub">Readiness <b>' + v.readiness.percent + '</b> · bar ' + v.readiness.bar + (v.readiness.atBar ? ' · at its bar' : '') + (v.readiness.hollow.length ? ' · hollow: ' + esc(v.readiness.hollow.join(', ')) : '') + '</p>'
  html += treeSvg(v)
  html += '<div class="branches">' + v.branches.map((b) => '<button type="button" data-act="focus" data-arg="' + esc(v.pack) + '|' + esc(b.id) + '"' + (b.focus ? ' class="pri"' : '') + '>' + (b.focus ? 'Focus: ' : 'Focus on ') + esc(b.title) + '</button>').join('') + '</div>'
  html += '<p class="sub">Solid box: rooted · outline: growing (bar = stage) · cream outline: ready to plant · cream dashes: waiting for a lower layer · dashed: locked · green dot: found in the wild · pale dot: a sapling a tree dropped.</p>'
  if (v.drops.length) html += '<p class="sub">To come: ' + v.drops.map((d) => esc(d.name) + ' drops ' + d.count + (d.count === 1 ? ' sapling' : ' saplings') + ' when it is harvested').join(' · ') + '.</p>'
  if (v.guilds.length) {
    html += '<h3>Guilds</h3><p class="sub">Seeds that grow well together. A guild is whole while every member stands as a tree, and a whole guild pays ' + RULES.guild.coins + ' coins each time you harvest or check in on one of its members. While any member is wilted it pays nothing.</p><div>' +
      v.guilds.map((g) => '<div class="row"><div class="n">' + esc(g.title) + '<small>' + g.members.map((m) => esc(m.name ?? (m.sapling ? 'a sapling' : 'a wild seed'))).join(', ') + '</small></div><span class="sub">' + esc(guildStatus(g, RULES.guild.coins)) + '</span></div>').join('') + '</div>'
  }
  if (v.borders.length || v.bordered.length) {
    html += '<h3>On an edge</h3><p class="sub">A seed on an edge grows in its own field and borders a second. Its harvest pays ' + timesOver(RULES.edge.times) + ' once you have a tree in the field it borders.</p><div>' +
      v.borders.map((b) => '<div class="row slim"><div class="n">' + esc(b.name) + '<small>borders the ' + esc(b.field) + ' field</small></div><span class="sub">' + esc(b.status) + '</span></div>').join('') +
      v.bordered.map((b) => '<div class="row slim"><div class="n">' + esc(b.name) + '<small>in the ' + esc(b.field) + ' field · borders this one</small></div><span class="sub">' + esc(b.status) + '</span></div>').join('') + '</div>'
  }
  if (v.locked.length) html += '<h3>Jump the fence</h3><p class="sub">Already know one of these? Prove it on a harvest-grade question (10 energy) and it unlocks without its prerequisites.</p><div>' + v.locked.map((t) => '<div class="row"><div class="n">' + esc(t.name) + '<small>needs ' + esc(t.needs) + (t.earned ? ' · a jump will not earn it: that takes ' + esc(t.earned) : '') + (t.held ? ' · after a jump it will still wait for the ' + esc(t.held) + ' layer' : '') + '</small></div><button type="button" data-act="testout" data-arg="' + esc(t.id) + '">Test out</button></div>').join('') + '</div>'
  html += heldSectionHtml(v.held, RULES.balance.below)
  html += earnedSectionHtml(v.earned, packTitle)
  html += foot('Close', '<button type="button" data-act="readiness">Readiness</button>')
  open(html)
}

/* ---------- readiness ---------- */
function openReadiness(): void { open(readinessSheetHtml(readinessView(S, catalog), RULES.readiness)) }
function setBar(pack: string): void {
  const box = document.getElementById('bar-' + pack)
  if (!(box instanceof HTMLInputElement)) return
  // An empty box reads as 0 and half a number as itself: the farm refuses both, and says what a bar may be.
  if (!act({ type: 'bar-set', pack, bar: Number(box.value) })) return
  // The sheet is drawn again with the new bar, where the farmer was reading.
  const at = sheet.scrollTop
  openReadiness()
  sheet.scrollTop = at
  document.getElementById('bar-' + pack)?.focus({ preventScroll: true })
  toast('The bar for ' + packTitle(pack) + ' is ' + S.bars[pack] + '.')
}

/* ---------- the market, last month's farm, the weekly walk ---------- */
function openMarket(): void { open(marketSheetHtml(marketView(S, catalog))) }
function openSale(buyerId: string): void {
  const buyer = catalog.buyer(buyerId)
  // Refuse before the farmer writes anything, with the reason the farm would give.
  if (!buyer || refused({ type: 'sold', buyer: buyer.id, text: 'x'.repeat(RULES.proofMin) })) return
  open(saleSheetHtml(buyer, RULES.proofMin, RULES.textMax))
}
function sell(buyerId: string): void {
  if (!act({ type: 'sold', buyer: buyerId, text: byIdAs('sale', HTMLTextAreaElement).value })) return
  toast('Sold. It is kept at the market.')
  openMarket()
}
/** The farm as the day `ago` days back ended, from the log, or null if the farm had no such day. */
const farmAgo = (ago: number): FarmState | null => farmAtEndOf(store.events(), S.day - ago, catalog)
function openRival(): void { open(rivalSheetHtml(rivalView(S, farmAgo(RULES.rival.days), catalog))) }
function visitPast(): void {
  const then = farmAgo(RULES.rival.days)
  if (!then) return
  close()
  enterVisit(then, 'you', 'your farm on day ' + then.day, RULES.rival.days + ' days ago', Object.keys(then.fields), true)
}
/** A walk looks back a walk's length, or on a farm younger than that, to its first day. */
function openWalk(): void { open(walkSheetHtml(walkView(S, farmAgo(Math.min(RULES.walk.every, S.day - 1)), catalog), RULES.textMax)) }
function walk(): void {
  const answers = WALK_QUESTIONS.map((_, i) => byIdAs('walk' + i, HTMLTextAreaElement).value)
  if (!act({ type: 'walked', asked: [...WALK_QUESTIONS], answers })) return
  toast('Kept. The next walk is in ' + RULES.walk.every + ' days.')
  openWalk()
}

/* ---------- almanac ---------- */
function openAlmanac(): void { open(almanacHtml(catalog, S.energyMax, __APP_VERSION__)) }

/* ---------- sleep ---------- */
function morningReport(night: Night): string {
  const names = (ids: string[]): string => esc(ids.map(nameOf).join(', '))
  const walkDue = isWalkDay(S.day) && !walkedToday(S)
  const t = tending(S)
  // Crops that wilted this very night get their own line below; don't list them twice.
  const revive = t.revive.filter((id) => !night.wilted.includes(id))
  const todo =
    (t.thirsty.length ? '<p><b>Thirsty:</b> ' + names(t.thirsty) + '.</p>' : '') +
    (revive.length ? '<p><b>To revive:</b> ' + names(revive) + '. Water one right and it comes back.</p>' : '') +
    (t.ripe.length ? '<p><b>Ready to harvest:</b> ' + names(t.ripe) + '.</p>' : '')
  return '<h2>Day ' + S.day + '</h2><p>Energy restored to ' + S.energyMax + '.' + (night.barrelFilled ? ' Rain barrel +1 (you ended the day with energy to spare).' : '') + '</p>' +
    (todo || '<p>Nothing needs tending. Plant something, or forage.</p>') +
    (night.saved.length ? '<p><b>Rain barrel saved:</b> ' + names(night.saved) + '.</p>' : '') +
    (night.wilted.length ? '<p><b>Wilted overnight:</b> ' + names(night.wilted) + '. Revive them today.</p>' : '') +
    (walkDue ? '<p><b>A walk day.</b> The walk itself asks for no work: look the farm over and answer what you like of three questions, any time today.</p>' : '') +
    '<p class="sub">New wild finds have grown in the forest.</p>' + foot('Start the day', walkDue ? '<button type="button" data-act="walk">Take the walk</button>' : undefined)
}
function sleep(): void {
  const night = $('night')
  const bSleep = byIdAs('bSleep', HTMLButtonElement)
  night.style.opacity = '1'
  // Cover the farm so a tap during the fade can't open a sheet under the morning report.
  night.style.pointerEvents = 'auto'
  bSleep.disabled = true
  setTimeout(() => {
    const slept = act({ type: 'slept' })
    setTimeout(() => {
      night.style.opacity = '0'
      night.style.pointerEvents = ''
      // A visit that began during the night keeps Sleep out of reach.
      bSleep.disabled = visiting !== null
      if (slept && S.night) open(morningReport(S.night))
    }, 700)
  }, 750)
}

/* ---------- one delegated handler for every sheet ---------- */
sheet.addEventListener('click', (e) => {
  const b = e.target instanceof Element ? e.target.closest('button') : null
  if (!b || b.disabled) return
  const what = b.dataset.act
  const arg = b.dataset.arg ?? ''
  if (what === 'close') close()
  else if (what === 'reload') location.reload()
  else if (what === 'opt') answer(Number(arg))
  else if (what === 'plantGo') plant()
  else if (what === 'rate') rate()
  else if (what === 'editExplain') { const e = EXPLAIN; if (e) openExplain(e.seed, e.text) }
  else if (what === 'submitExplain') submitExplain()
  else if (what === 'submitWrite') submitWrite()
  else if (what === 'cropSheet') openCrop(arg)
  else if (what === 'seed') {
    const seed = catalog.seed(arg)
    if (!seed) return
    store.ui.seedSel = arg
    hint('Seed in hand: <b>' + esc(seed.name) + '</b>. Tap an empty soil tile in the <b>' + esc(packTitle(seed.pack)) + '</b> field to plant it.')
    store.saveUi()
    close()
  } else if (what === 'reset') openReset()
  else if (what === 'newFarm') startNewFarm(arg === 'sample' ? 'sample' : 'fresh')
  else if (what === 'openFields') openTickedFields()
  else if (what === 'openField') {
    const e = fieldsToOpen(S, catalog, [arg])[0]
    if (e && act(e)) { toast('The ' + packTitle(arg) + ' field is open.'); store.ui.treeTab = arg; store.saveUi(); openTree(arg) }
  }
  else if (what === 'export') exportFarm()
  else if (what === 'import') importFarm()
  else if (what === 'doImport') doImport()
  else if (what === 'importAnyway') { if (IMPORT) finishImport(store.importLog(IMPORT), refusedCount(IMPORT, catalog)) }
  else if (what === 'copyExp') copyFrom('exp')
  else if (what === 'neighbours') openNeighbours()
  else if (what === 'rename') openName('neighbours')
  else if (what === 'saveName') saveName()
  else if (what === 'share') openShare()
  else if (what === 'copyShare') copyFrom('shareLink', markShared)
  else if (what === 'shareNative') shareNative()
  else if (what === 'previewShare') previewShare()
  else if (what === 'pasteLink') openPaste()
  else if (what === 'openPasted') { const text = byIdAs('pasteBox', HTMLTextAreaElement).value; veil.hidden = true; handleLink(text) }
  else if (what === 'visit') visitNeighbour(arg)
  else if (what === 'removeNeighbour') { changeBook((b) => remove(b, arg)); openNeighbours() }
  else if (what === 'addNeighbour') { const said = keepArrival(); if (said) toast(said); openNeighbours() }
  else if (what === 'justLook') { const a = ARRIVAL; if (a) { enterVisit(a.state, a.picture.name, visitLabel(a.picture), visitDetail(a.picture), packsOf(a.picture)); close() } }
  else if (what === 'startFromVisit') startFromVisit()
  else if (what === 'readiness') openReadiness()
  else if (what === 'market') openMarket()
  else if (what === 'sell') openSale(arg)
  else if (what === 'sellGo') sell(arg)
  else if (what === 'rival') openRival()
  else if (what === 'visitPast') visitPast()
  else if (what === 'walk') openWalk()
  else if (what === 'walkGo') walk()
  else if (what === 'setBar') setBar(arg)
  else if (what === 'expand') expand(arg)
  else if (what === 'forage') forage(arg)
  else if (what === 'domesticate') domesticate(arg)
  else if (what === 'treeTab') {
    if (!catalog.pack(arg)) return
    // Looking at a pack you do not grow is not remembered: next time the tree opens on a field of yours.
    if (Object.hasOwn(S.fields, arg)) { store.ui.treeTab = arg; store.saveUi() }
    openTree(arg)
  }
  else if (what === 'focus') {
    const [packId, branchId] = arg.split('|')
    const pack = packId ? catalog.pack(packId) : undefined
    if (!pack || !branchId) return
    if (act({ type: 'focus-set', pack: pack.pack, branch: S.focus[pack.pack] === branchId ? null : branchId })) openTree()
  } else if (what === 'testout') {
    const seed = catalog.seed(arg)
    if (!seed || refused({ type: 'unlocked', seed: seed.id, ok: true })) return
    startWork(seed, 'testout')
  }
})
// Enter in a bar's box sets that bar, as its button does.
sheet.addEventListener('keydown', (e) => {
  const box = e.target
  if (e.key !== 'Enter' || e.isComposing || !(box instanceof HTMLInputElement) || !box.id.startsWith('bar-')) return
  e.preventDefault()
  setBar(box.id.slice('bar-'.length))
})
// The same farm open in another tab writes the shared log; warn once rather than let the two silently overwrite each other.
let staleFarm = false
window.addEventListener('storage', (e) => {
  if (e.key !== LOG_KEY || e.newValue === null || staleFarm) return
  staleFarm = true
  if (veil.hidden) {
    open('<h2>This farm changed in another tab</h2><p>You have the same farm open elsewhere and it has moved on. Reload to catch up, or keep going here and risk overwriting the other tab.</p>' +
      foot('Reload', '<button type="button" data-act="close">Keep editing</button>'))
    const b = primary()
    if (b) b.dataset.act = 'reload'
  } else {
    // A sheet is open and may hold a draft; don't replace it. A visible toast is enough.
    toast('This farm changed in another tab. Reload to catch up.')
  }
})
byId('bBag').addEventListener('click', openBag)
byId('bTree').addEventListener('click', () => openTree())
byId('bReady').addEventListener('click', openReadiness)
byId('bAlm').addEventListener('click', openAlmanac)
byId('bSleep').addEventListener('click', sleep)
hud()
if (store.loadProblem) toast(store.loadProblem)
// A farm link in the address comes first: for someone new it is the way in.
takeHash()
if (!veil.hidden || visiting) { /* the link has the screen */ }
else if (needsSetup()) openWelcome()
else if (store.refused > store.ui.driftSeen) {
  // Told once per count: the warning comes back only if more of the farm stops fitting.
  open('<h2>Your farm has changed</h2><p>' + esc(driftText(store.refused)) + '</p><p class="sub">This should never happen. Export your farm from the seed bag and report it, with the version at the bottom of the Almanac (' + esc(__APP_VERSION__) + ').</p>' + foot('Carry on'))
  store.ui.driftSeen = store.refused
  store.saveUi()
}
