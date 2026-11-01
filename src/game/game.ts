import packDefs from 'virtual:packs'
import { buildCatalog, LAYER_NAMES, type Seed } from '../engine/catalog'
import { findCandidates, pickFind } from '../engine/finds'
import {
  BARN, COMPOST, SIGN, WELL, fenceCost, fieldOf as landFieldOf, hash, homestead, inHomestead, isBuildingTile,
  neighbourFields, terrain as landTerrain, tileKey, wildKind, worldSize, type Terrain,
} from '../engine/land'
import { available, capLeft, rootedIds, visible } from '../engine/rules'
import type { Mcq } from '../engine/types'
import { looksLikeV2, upgradeV2, type V2Crop, type V2State } from '../engine/v2'
import sampleFarm from './sample-farm.json'
import { esc, shuffle } from './util'
import { bagView, needsText, packColor, splitName, treeView, type TreeView } from './views'

/* ---------- types ---------- */
type Mode = 'water' | 'harvest' | 'testout'
type StaticKind = 'forest' | 'barn' | 'well' | 'compost' | 'sign'

interface Drawable {
  s: number
  d: (t: number) => void
  kind?: StaticKind
  hit?: (ix: number, iy: number) => boolean
}

type Pick =
  | { kind: 'crop'; crop: V2Crop }
  | { kind: 'tile'; x: number; y: number }
  | { kind: 'barn' }
  | { kind: 'well' }
  | { kind: 'compost' }
  | { kind: 'sign' }

/* ---------- page ---------- */
const W = 480
const H = 300
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

/* ---------- camera ---------- */
/** World size in tiles, set from the fields by `buildStatics`. 20 for up to four fields, 27 for up to nine. */
let N = worldSize({})
const camHome = (): { x: number; y: number } => ({ x: W / 2, y: H / 2 - 8 * N - 8 })

/* ---------- state ---------- */
/** A fresh farm: the prototype's starting farm, with a field for every pack. */
function initialState(): V2State {
  const s = upgradeV2(sampleFarm, catalog)
  if (!s) throw new Error('src/game/sample-farm.json is not a v2 farm.')
  N = worldSize(s.fields)
  s.cam = camHome()
  return s
}

function load(): V2State {
  let raw: string | null = null
  try { raw = localStorage.getItem('permaculture-v2') } catch { raw = null }
  if (raw === null) return initialState()
  try {
    const s = upgradeV2(JSON.parse(raw), catalog)
    if (s) return s
  } catch { /* fall through to a fresh farm */ }
  loadFailed = true
  return initialState()
}
let loadFailed = false
let S: V2State = load()
function save(): void { try { localStorage.setItem('permaculture-v2', JSON.stringify(S)) } catch { /* storage may be blocked */ } }

/* ---------- rules ---------- */
const INTERVAL = [1, 2, 3, 4, 5]
const interval = (c: V2Crop): number => (c.per ? 10 : (INTERVAL[c.stage] ?? 5))
const due = (c: V2Crop): number => c.lw + interval(c)
const thirsty = (c: V2Crop): boolean => !c.wilted && S.day >= due(c)
const ripe = (c: V2Crop): boolean => !c.per && !c.wilted && c.stage === 4 && !thirsty(c)
const zone = (c: V2Crop): string => (c.per ? 'Z4' : 'Z' + Math.min(4, c.stage + 1))
const cropAt = (x: number, y: number): V2Crop | undefined => S.crops.find((c) => c.x === x && c.y === y)
const fieldOf = (x: number, y: number): string | null => landFieldOf(x, y, S.fields, S.cleared)
const terrain = (x: number, y: number): Terrain => landTerrain(x, y, S.fields, S.cleared)
const inHome = (x: number, y: number): boolean => inHomestead(x, y, S.fields)

/** Why a field cannot spend this much energy today, or null. Capped fields (the Workshop) have a daily limit. */
function capRefusal(seed: Seed, cost: number): string | null {
  const cap = catalog.capOf(seed.pack, S.energyMax)
  if (cost <= capLeft(seed.pack, catalog, S.energyMax, S.today.spent)) return null
  return 'The ' + packTitle(seed.pack) + ' uses at most ' + cap + ' energy a day.'
}
/** Take energy for work on a seed, and count it against its field's daily cap. */
function spend(seed: Seed, cost: number): void {
  S.energy -= cost
  S.today.spent[seed.pack] = (S.today.spent[seed.pack] ?? 0) + cost
}

/* ---------- pixel helpers ---------- */
const iso = (x: number, y: number): { sx: number; sy: number } => ({ sx: (x - y) * 16 + S.cam.x, sy: (x + y) * 8 + S.cam.y })
let g: CanvasRenderingContext2D = ctx
function px(x: number, y: number, w: number, h: number, c: string): void {g.fillStyle=c;g.fillRect(Math.round(x),Math.round(y),w,h);}
function diamond(sx: number, sy: number, c: string): void {g.fillStyle=c;for(let r=0;r<TH;r++){const hw=r<8?(r+1)*2:(TH-r)*2;g.fillRect(sx-hw,sy+r,hw*2,1);}}
function blob(cx: number, base: number, widths: number[], cols: string[]): void {for(let i=0;i<widths.length;i++){const w=widths[i]??0;px(cx-Math.floor(w/2),base-i,w,1,cols[Math.min(i,cols.length-1)]??'#000000');}}
function rail(x1: number, y1: number, x2: number, y2: number, c: string): void {const sx=Math.sign(x2-x1),sy=Math.sign(y2-y1);for(let t=0;t<8;t++)px(x1+sx*2*t+(sx<0?-2:0),y1+sy*t,2,1,c);}
type Pt = [number, number]
function face(pts: Pt[], c: string): void {g.fillStyle=c;g.beginPath();pts.forEach(([x,y],i)=>{if(i===0)g.moveTo(x,y);else g.lineTo(x,y);});g.closePath();g.fill();}

/* ---------- sprites ---------- */
function drawTree(sx: number, sy: number, v: number): void {const cx=sx,cy=sy+12;const big=v>0.5;const g1=v>0.75?'#2F7A2C':'#3C8F35',g2=v>0.75?'#4FA347':'#5DB654',g3=v>0.75?'#79C46C':'#8AD47A';
  px(cx-3,cy,6,1,'rgba(0,0,0,.18)');px(cx-1,cy-7,2,7,'#5E3F22');px(cx-2,cy-2,1,2,'#5E3F22');
  if(big)blob(cx,cy-7,[8,12,14,14,12,10,6],[g1,g1,g2,g2,g3,g3,g3]);else blob(cx,cy-6,[6,10,12,10,6],[g1,g2,g2,g3,g3]);
  if(v>0.6){px(cx+2,cy-10,1,1,'#F5E07A');px(cx-3,cy-9,1,1,'#F5E07A');}}
function drawBush(sx: number, sy: number): void {blob(sx,sy+11,[6,8,8,6,3],['#3C8F35','#5DB654','#5DB654','#8AD47A','#8AD47A']);}
function drawRock(sx: number, sy: number): void {blob(sx,sy+11,[6,8,6,3],['#6E6E7C','#8A8A99','#A0A0AE','#B8B8C4']);}
function drawTuft(sx: number, sy: number, x: number, y: number): void {for(let i=0;i<3;i++){const ox=Math.floor(hash(x,y,i+30)*12)-6;px(sx+ox,sy+6+Math.floor(hash(x,y,i+40)*5),1,3,'#4E9A3A');}}
function drawFlowers(sx: number, sy: number, x: number, y: number): void {for(let i=0;i<3;i++){const r=3+Math.floor(hash(x,y,i)*9),hw=r<8?(r+1)*2:(TH-r)*2;const fx=sx-hw+2+Math.floor(hash(x,y,i+7)*(hw*2-4));const c=['#F7D54A','#F2F2EC','#F08BB0'][Math.floor(hash(x,y,i+11)*3)]??'#F7D54A';if(hash(x,y,i+20)<0.35)px(fx,sy+r,1,1,c);}}
function drawCrop(c: V2Crop, sx: number, sy: number, t: number): void {
  const cx=sx,cy=sy+12;const seed=catalog.seed(c.id);if(!seed)return;const F={color:colorOf(seed.pack)};
  const w=c.wilted;const gg=w?'#8E6E33':'#3F8F2E',g2=w?'#6E5426':'#2E6E22',g3=w?'#B3924A':'#5BB83A';
  const sway=w?0:Math.round(Math.sin(t/900+c.x*1.7+c.y)*0.6);
  px(cx-3,cy,6,1,'rgba(0,0,0,.15)');
  if(c.per){px(cx-1,cy-7,2,7,'#6B4A2B');blob(cx+sway,cy-7,[6,10,12,12,10,6],[g2,g2,gg,gg,g3,g3]);px(cx-3+sway,cy-9,2,2,F.color);px(cx+2+sway,cy-11,2,2,F.color);px(cx-1+sway,cy-13,2,1,F.color);return;}
  const st=c.stage,dy=w?2:0;
  if(st===0){px(cx,cy-3+dy,1,3,gg);px(cx-2,cy-3+dy,2,1,g3);px(cx+1,cy-4+dy,2,1,g3);}
  else if(st===1){px(cx,cy-6+dy,1,6,gg);px(cx-3+sway,cy-4+dy,3,1,g3);px(cx+1+sway,cy-5+dy,3,1,g3);px(cx-2,cy-2+dy,2,1,g2);px(cx+1,cy-3+dy,2,1,g2);}
  else if(st===2){blob(cx+sway,cy-1+dy,[7,9,9,7,5,3],[g2,g2,gg,gg,g3,g3]);}
  else{px(cx,cy-10+dy,1,10,g2);px(cx-4+sway,cy-3+dy,4,1,gg);px(cx+1+sway,cy-4+dy,4,1,gg);px(cx-4+sway,cy-6+dy,4,1,g3);px(cx+1+sway,cy-7+dy,4,1,g3);px(cx-3+sway,cy-9+dy,3,1,g3);px(cx+1+sway,cy-9+dy,3,1,g3);px(cx-1+sway,cy-12+dy,3,2,g3);
    if(st===4&&!w){px(cx-3+sway,cy-5,2,2,F.color);px(cx+2+sway,cy-8,2,2,F.color);px(cx-1+sway,cy-13,2,2,F.color);px(cx-3+sway,cy-5,1,1,'#FFFFFF');px(cx+2+sway,cy-8,1,1,'#FFFFFF');}}
  if(w){px(cx+3,cy-1,1,1,'#B3924A');px(cx-4,cy,1,1,'#B3924A');}
}
function drawMarker(c: V2Crop, sx: number, sy: number, t: number): void {
  const cx=sx;const bob=Math.round(Math.sin(t/260)*1.5);
  if(c.wilted){const y=sy-10+bob;px(cx,y,1,4,'#E0893A');px(cx,y+5,1,1,'#E0893A');return;}
  if(thirsty(c)){const y=sy-11+bob;px(cx,y-1,1,1,'#4FA3E8');px(cx-1,y,3,1,'#4FA3E8');px(cx-2,y+1,5,2,'#4FA3E8');px(cx-1,y+3,3,1,'#2F7FC4');px(cx-1,y+1,1,1,'#DFF2FF');return;}
  if(ripe(c)){const y=sy-12+bob;const k=Math.floor(t/350)%2;px(cx,y,1,5,'#FFD95A');px(cx-2,y+2,5,1,'#FFD95A');if(k){px(cx-3,y-1,1,1,'#FFF4B0');px(cx+3,y+5,1,1,'#FFF4B0');}else{px(cx+3,y-1,1,1,'#FFF4B0');px(cx-3,y+5,1,1,'#FFF4B0');}}
}
function drawFarmer(cx: number, cy: number, walking: boolean, t: number): void {
  const step=walking?(Math.floor(t/120)%2):0;
  px(cx-3,cy,6,1,'rgba(0,0,0,.25)');
  px(cx-2,cy-4,2,4-step,'#2B2B3A');px(cx+1,cy-4,2,4-(walking?1-step:0),'#2B2B3A');
  px(cx-3,cy-9,6,5,'#3E7CB1');px(cx-4,cy-9,1,4,'#E8B990');px(cx+3,cy-9,1,4,'#E8B990');
  px(cx-2,cy-12,4,3,'#E8B990');px(cx-1,cy-11,1,1,'#222');px(cx+1,cy-11,1,1,'#222');
  px(cx-4,cy-13,8,1,'#9A6A35');px(cx-2,cy-15,4,2,'#9A6A35');
}
function drawBarn(): void {const {sx,sy}=iso(BARN.x,BARN.y);const h=22;
  const Lx=sx-32,Ly=sy+16,Bx=sx,By=sy+32,Rx=sx+32,Ry=sy+16;
  face([[Lx,Ly],[Bx,By],[Bx,By-h],[Lx,Ly-h]],'#B5443A');
  face([[Bx,By],[Rx,Ry],[Rx,Ry-h],[Bx,By-h]],'#8E3229');
  face([[sx,sy-h],[Rx,Ry-h],[Bx,By-h],[Lx,Ly-h]],'#6E6E7C');
  face([[sx,sy-h-6],[sx+16,sy+8-h-6],[Rx,Ry-h],[Bx,By-h],[Lx,Ly-h],[sx-16,sy+8-h-6]],'#5B5B66');
  face([[sx-16,sy+8-h-6],[sx,sy-h-6],[sx+16,sy+8-h-6],[sx,sy+16-h-6]],'#7A7A88');
  px(Lx+2,Ly-h+1,28,1,'#F0E2C8');px(Bx+2,By-h-7,28,1,'#F0E2C8');
  face([[Bx-14,By-7],[Bx-4,By-2],[Bx-4,By-14],[Bx-14,By-19]],'#3C2316');
  face([[Bx-13,By-8],[Bx-5,By-4],[Bx-5,By-13],[Bx-13,By-17]],'#4A2A1C');
  px(Bx+10,By-22,8,5,'#F0E2C8');px(Bx+11,By-21,6,3,'#2A2A33');}
function drawWell(): void {const {sx,sy}=iso(WELL.x,WELL.y);const cx=sx,cy=sy+12;
  px(cx-5,cy,10,1,'rgba(0,0,0,.2)');blob(cx,cy-1,[10,12,12,12,10],['#6E6E7C','#8A8A99','#8A8A99','#A0A0AE','#A0A0AE']);
  px(cx-3,cy-4,6,2,'#2F7FC4');px(cx-2,cy-4,2,1,'#6CB8F0');
  px(cx-5,cy-14,2,10,'#6B4A2B');px(cx+3,cy-14,2,10,'#6B4A2B');
  blob(cx,cy-14,[14,10,6,2],['#7A4A2A','#8E5A34','#8E5A34','#A26A40']);px(cx,cy-9,1,4,'#444');px(cx-1,cy-6,3,2,'#8A8A99');}
function drawCompost(): void {const {sx,sy}=iso(COMPOST.x,COMPOST.y);const cx=sx,cy=sy+12;
  blob(cx,cy-1,[12,14,14,12,8,4],['#4A3420','#5A4028','#6B4D30','#6B4D30','#7E5C3A','#7E5C3A']);
  px(cx-3,cy-3,1,1,'#8AD47A');px(cx+2,cy-4,1,1,'#F7D54A');px(cx,cy-5,1,1,'#B3924A');px(cx+4,cy-2,1,1,'#8AD47A');}
function drawSign(): void {const {sx,sy}=iso(SIGN.x,SIGN.y);const cx=sx,cy=sy+12;
  px(cx-2,cy,4,1,'rgba(0,0,0,.2)');px(cx-1,cy-14,2,14,'#6B4A2B');px(cx-7,cy-15,14,6,'#A26A40');px(cx-7,cy-15,14,1,'#C98A52');px(cx-5,cy-13,10,1,'#3C2316');px(cx-5,cy-11,7,1,'#3C2316');}


/* ---------- world objects (rebuilt when land changes) ---------- */
let statics: Drawable[] = []
let dirtyGround = true
const gcv = document.createElement('canvas')
const gctx = context2d(gcv)
/** Where the ground canvas puts tile (0, 0)'s top corner. */
let groundOx = 0
function buildStatics(): void {
  statics = []
  N = worldSize(S.fields)
  const home = homestead(S.fields)
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
  statics.push({ s: BARN.x + BARN.y + 1.5, d: drawBarn, kind: 'barn', hit: (ix, iy) => { const p = iso(BARN.x, BARN.y); return ix >= p.sx - 32 && ix <= p.sx + 32 && iy >= p.sy - 30 && iy <= p.sy + 32 } })
  statics.push({ s: WELL.x + WELL.y, d: drawWell, kind: 'well', hit: (ix, iy) => { const p = iso(WELL.x, WELL.y); return Math.abs(ix - p.sx) <= 8 && iy >= p.sy - 4 && iy <= p.sy + 14 } })
  statics.push({ s: COMPOST.x + COMPOST.y, d: drawCompost, kind: 'compost', hit: (ix, iy) => { const p = iso(COMPOST.x, COMPOST.y); return Math.abs(ix - p.sx) <= 8 && iy >= p.sy + 2 && iy <= p.sy + 14 } })
  statics.push({ s: SIGN.x + SIGN.y, d: drawSign, kind: 'sign', hit: (ix, iy) => { const p = iso(SIGN.x, SIGN.y); return Math.abs(ix - p.sx) <= 8 && iy >= p.sy - 4 && iy <= p.sy + 14 } })
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
        rail(a[0], a[1] - 5, b[0], b[1] - 5, '#A26A40')
        rail(a[0], a[1] - 2, b[0], b[1] - 2, '#A26A40')
        for (const v of [a, b]) { px(v[0] - 1, v[1] - 6, 2, 7, '#8E5A34'); px(v[0] - 1, v[1] - 6, 2, 1, '#B8804A') }
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
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const sx = (x - y) * 16 + ox, sy = (x + y) * 8 + oy
    const tr = terrain(x, y)
    if (tr === 'soil') {
      diamond(sx, sy, '#7A5230')
      for (const r of [3, 6, 9, 12]) { const hw = r < 8 ? (r + 1) * 2 : (TH - r) * 2; for (let k = -hw + 3; k < hw - 2; k += 3) px(sx + k, sy + r, 1, 1, '#5E3C22') }
    } else if (tr === 'path') {
      diamond(sx, sy, '#C9A86A')
      for (let i = 0; i < 3; i++) { const r = 3 + Math.floor(hash(x, y, i) * 9), hw = r < 8 ? (r + 1) * 2 : (TH - r) * 2; px(sx - hw + 2 + Math.floor(hash(x, y, i + 3) * (hw * 2 - 4)), sy + r, 1, 1, '#A98850') }
    } else if (tr === 'wild') {
      diamond(sx, sy, '#4F8F3C')
      for (let i = 0; i < 4; i++) { const r = 2 + Math.floor(hash(x, y, i) * 11), hw = r < 8 ? (r + 1) * 2 : (TH - r) * 2; px(sx - hw + 1 + Math.floor(hash(x, y, i + 5) * (hw * 2 - 2)), sy + r, 1, 1, hash(x, y, i + 9) > 0.5 ? '#3F7A30' : '#62A84A') }
    } else {
      diamond(sx, sy, '#6DB24F')
      for (let i = 0; i < 4; i++) { const r = 2 + Math.floor(hash(x, y, i) * 11), hw = r < 8 ? (r + 1) * 2 : (TH - r) * 2; px(sx - hw + 1 + Math.floor(hash(x, y, i + 5) * (hw * 2 - 2)), sy + r, 1, 1, hash(x, y, i + 9) > 0.5 ? '#5A9A3E' : '#83C464') }
      drawFlowers(sx, sy, x, y)
    }
  }
  for (let x = 0; x < N; x++) { const sx = (x - (N - 1)) * 16 + ox, sy = (x + N - 1) * 8 + oy; for (let t2 = 0; t2 < 16; t2++) { px(sx - 16 + t2, sy + 8 + Math.floor(t2 / 2) + 1, 1, 10, '#6A4A2C'); px(sx - 16 + t2, sy + 8 + Math.floor(t2 / 2) + 9, 1, 3, '#4E361F') } }
  for (let y = 0; y < N; y++) { const sx = ((N - 1) - y) * 16 + ox, sy = (N - 1 + y) * 8 + oy; for (let t2 = 0; t2 < 16; t2++) { px(sx + t2, sy + 16 - Math.ceil(t2 / 2) + 1, 1, 10, '#5C3F24'); px(sx + t2, sy + 16 - Math.ceil(t2 / 2) + 9, 1, 3, '#43301C') } }
  g = ctx
  dirtyGround = false
}
buildStatics()

/* ---------- clouds ---------- */
const clouds = [{ x: 40, y: 22, w: [10, 18, 24, 22, 14], v: 0.035 }, { x: 260, y: 12, w: [8, 14, 20, 18, 10], v: 0.025 }, { x: 400, y: 34, w: [12, 20, 26, 22, 12], v: 0.03 }]

/* ---------- render ---------- */
let hover: { x: number; y: number } | null = null
function frame(t: number): void {
  if (dirtyGround) buildGround()
  g = ctx
  ctx.fillStyle = '#8FC8E8'; ctx.fillRect(0, 0, W, H); ctx.fillStyle = '#A4D6F0'; ctx.fillRect(0, 170, W, 130)
  px(438, 24, 12, 12, '#FFE27A'); px(440, 22, 8, 16, '#FFE27A'); px(436, 26, 16, 8, '#FFE27A'); px(441, 25, 6, 6, '#FFF3B8')
  for (const c of clouds) { c.x += c.v; if (c.x > W + 40) c.x = -40; blob(Math.round(c.x), c.y, c.w, ['#E6F2FA', '#FFFFFF', '#FFFFFF', '#FFFFFF', '#FFFFFF']) }
  ctx.drawImage(gcv, Math.round(S.cam.x - groundOx), Math.round(S.cam.y - 8))
  if (hover) {
    const { sx, sy } = iso(hover.x, hover.y)
    ctx.fillStyle = 'rgba(255,255,255,.28)'
    for (let r = 0; r < TH; r++) { const hw = r < 8 ? (r + 1) * 2 : (TH - r) * 2; ctx.fillRect(sx - hw, sy + r, hw * 2, 1) }
  }
  const f = S.farmer
  const dx = f.tx - f.x, dy = f.ty - f.y
  const dist = Math.hypot(dx, dy)
  const walking = dist > 0.02
  if (walking) { const sp = Math.min(0.07, dist); f.x += dx / dist * sp; f.y += dy / dist * sp }
  const list: Drawable[] = statics.slice()
  for (const c of S.crops) list.push({ s: c.x + c.y, d: () => { const p = iso(c.x, c.y); drawCrop(c, p.sx, p.sy, t); drawMarker(c, p.sx, p.sy, t) } })
  list.push({ s: f.x + f.y + 0.01, d: () => { const p = iso(f.x, f.y); drawFarmer(Math.round(p.sx), Math.round(p.sy + 13), walking, t) } })
  list.sort((a, b) => a.s - b.s)
  for (const o of list) o.d(t)
  requestAnimationFrame(frame)
}
requestAnimationFrame(frame)


/* ---------- HUD & sheets ---------- */
function hud(): void {
  $('hDay').textContent = String(S.day)
  $('hEnergyT').textContent = String(S.energy)
  $('hEnergy').style.width = (100 * S.energy / S.energyMax) + '%'
  $('hCoins').textContent = String(S.coins)
  $('hBarrel').textContent = String(S.barrel)
  save()
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
  const b = sheet.querySelector<HTMLButtonElement>('button.pri') ?? sheet.querySelector<HTMLButtonElement>('button')
  if (b) b.focus()
}
function close(): void { veil.hidden = true }
/** The sheet's primary button, if there is one. */
const primary = (): HTMLButtonElement | null => sheet.querySelector<HTMLButtonElement>('button.pri')
veil.addEventListener('click', (e) => { if (e.target === veil) close() })
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !veil.hidden) close() })
const foot = (label?: string, extra?: string): string => '<div class="foot">' + (extra || '<span></span>') + '<button type="button" class="pri" data-act="close">' + (label || 'Close') + '</button></div>'
const chip = (packId: string): string => '<div><span class="chip" style="--c:' + colorOf(packId) + '">' + esc(packTitle(packId)) + '</span></div>'

/* ---------- input: drag to pan, tap to act ---------- */
let down: { x: number; y: number; cx: number; cy: number; k: number } | null = null
let dragging = false
function toInternal(e: PointerEvent): { ix: number; iy: number; k: number } {
  const r = cv.getBoundingClientRect()
  return { ix: (e.clientX - r.left) * W / r.width, iy: (e.clientY - r.top) * H / r.height, k: W / r.width }
}
function tileAt(ix: number, iy: number): { x: number; y: number } | null {
  const dx = ix - S.cam.x, dy = iy - S.cam.y
  const x = Math.floor((dx / 16 + dy / 8) / 2), y = Math.floor((dy / 8 - dx / 16) / 2)
  return (x >= 0 && y >= 0 && x < N && y < N) ? { x, y } : null
}
function pick(ix: number, iy: number): Pick | null {
  let best: { s: number; crop: V2Crop } | null = null
  for (const c of S.crops) {
    const { sx, sy } = iso(c.x, c.y)
    if (Math.abs(ix - sx) <= 7 && iy >= sy - 16 && iy <= sy + 14 && (!best || c.x + c.y > best.s)) best = { s: c.x + c.y, crop: c }
  }
  if (best) return { kind: 'crop', crop: best.crop }
  for (const o of statics) if (o.hit && o.kind && o.kind !== 'forest' && o.hit(ix, iy)) return { kind: o.kind }
  const t = tileAt(ix, iy)
  return t ? { kind: 'tile', x: t.x, y: t.y } : null
}
/** Keep some of the world on screen: half its width either way, and its top edge above the bottom of the view. */
function clampCam(): void {
  S.cam.x = Math.max(W / 2 - 16 * N, Math.min(W / 2 + 16 * N, S.cam.x))
  S.cam.y = Math.max(100 - 16 * N, Math.min(H - 40, S.cam.y))
}
cv.addEventListener('pointerdown', (e) => {
  e.preventDefault()
  cv.setPointerCapture(e.pointerId)
  const p = toInternal(e)
  down = { x: e.clientX, y: e.clientY, cx: S.cam.x, cy: S.cam.y, k: p.k }
  dragging = false
})
cv.addEventListener('pointermove', (e) => {
  const p = toInternal(e)
  if (down) {
    const dx = (e.clientX - down.x) * down.k, dy = (e.clientY - down.y) * down.k
    if (!dragging && Math.hypot(dx, dy) > 5) { dragging = true; cv.classList.add('drag') }
    if (dragging) { S.cam.x = down.cx + dx; S.cam.y = down.cy + dy; clampCam() }
  }
  hover = (e.pointerType === 'mouse' && !dragging) ? tileAt(p.ix, p.iy) : null
})
cv.addEventListener('pointerup', (e) => {
  if (!down) return
  const wasDrag = dragging
  down = null
  dragging = false
  cv.classList.remove('drag')
  if (wasDrag) { save(); return }
  const { ix, iy } = toInternal(e)
  const p = pick(ix, iy)
  if (!p) return
  if (p.kind === 'crop') { walkTo(p.crop.x, p.crop.y); onCrop(p.crop) }
  else if (p.kind === 'barn') { walkTo(9, 6); openBag() }
  else if (p.kind === 'well') { walkTo(14, 9); openWell() }
  else if (p.kind === 'compost') { walkTo(14, 10); openCompost() }
  else if (p.kind === 'sign') { walkTo(9, 8); openAlmanac() }
  else onTile(p.x, p.y)
})
cv.addEventListener('pointercancel', () => { down = null; dragging = false; cv.classList.remove('drag') })
cv.addEventListener('pointerleave', () => { hover = null })
function walkTo(x: number, y: number): void { S.farmer.tx = x; S.farmer.ty = y }
$('bHome').addEventListener('click', () => { S.cam = camHome(); save() })

/* ---------- actions ---------- */
/** True (after a toast) if the player cannot afford this much energy on this seed today. */
function tooTired(seed: Seed, cost: number, tired: string): boolean {
  if (S.energy < cost) { toast(tired); return true }
  const why = capRefusal(seed, cost)
  if (why) { toast(why); return true }
  return false
}

function onCrop(c: V2Crop): void {
  const seed = catalog.seed(c.id)
  if (!seed) return
  if (c.wilted || thirsty(c)) { if (tooTired(seed, 6, 'Out of energy. Sleep to start a new day.')) return; return startWork(seed, c, 'water') }
  if (ripe(c)) { if (tooTired(seed, 15, 'Harvest takes 15 energy. Sleep first.')) return; return startWork(seed, c, 'harvest') }
  if (c.per) return toast(seed.name + ' is rooted (perennial). Next check-in on day ' + due(c) + '.')
  toast(seed.name + ' · stage ' + (c.stage + 1) + '/5 · ' + zone(c) + ' · thirsty again on day ' + due(c) + '.')
}
function onTile(x: number, y: number): void {
  const tr = terrain(x, y)
  const k = tileKey(x, y)
  if (tr === 'soil') {
    if (cropAt(x, y)) return
    walkTo(x, y)
    const sel = S.seedSel
    if (!sel) return toast('Empty soil. Pick a seed from the barn (or Seed bag) first.')
    const seed = catalog.seed(sel)
    if (!seed) { S.seedSel = null; return }
    if (seed.pack !== fieldOf(x, y)) return toast(seed.name + ' belongs in the ' + packTitle(seed.pack) + ' field.')
    if (S.energy < 10 || S.coins < 10) return toast('Planting needs 10 energy and 10 coins.')
    const why = capRefusal(seed, 10)
    if (why) return toast(why)
    spend(seed, 10); S.coins -= 10
    S.crops.push({ id: seed.id, x, y, stage: 0, lw: S.day, wilted: false, per: false })
    S.seedSel = null
    hint('Planted <b>' + esc(seed.name) + '</b>. It will be thirsty tomorrow. Tap it then and answer to make it grow.')
    hud()
    toast('Planted ' + seed.name + '.')
    return
  }
  if (tr === 'path' || isBuildingTile(x, y)) return
  const near = neighbourFields(x, y, S.fields, S.cleared)
  const first = near[0]
  if (first !== undefined) {
    walkTo(x, y)
    const cost = fenceCost(tr)
    const others = near.slice(1).map((p) => '<button type="button" data-act="expand" data-arg="' + k + '|' + p + '|' + cost + '">Add to ' + esc(packTitle(p)) + ' · ' + cost + ' coins</button>').join('')
    open(chip(first) + '<h2>' + (tr === 'wild' ? 'Clear and fence' : 'Fence it in') + '</h2><p>' + (tr === 'wild' ? 'Fell the trees and ' : '') + 'Add this tile to the ' + esc(packTitle(first)) + ' field. Fields grow one tile at a time, in any shape.</p><p class="sub">Costs ' + cost + ' coins. You have ' + S.coins + '.</p>' +
      (others ? '<div class="branches">' + others + '</div>' : '') +
      foot('Add to ' + packTitle(first) + ' · ' + cost + ' coins', '<button type="button" data-act="close">Not now</button>'))
    const b = primary()
    if (b) { b.dataset.act = 'expand'; b.dataset.arg = k + '|' + first + '|' + cost }
    return
  }
  if (tr === 'wild') {
    const kind = wildKind(x, y)
    if (kind === 'tree' || kind === 'bush') return openForage(x, y)
    return toast('Wilderness. Forage in the trees, or fence in land next to a field.')
  }
  toast('Open ground. Land next to a field can be fenced in.')
}

const COST: Record<Mode, number> = { water: 6, harvest: 15, testout: 10 }

/** What a piece of work looks like on screen: a multiple-choice card, or (for seeds with none) a plain sheet. */
function startWork(seed: Seed, c: V2Crop | null, mode: Mode): void {
  const cards = mode === 'water' || seed.harvest !== 'recall' ? seed.questions.water : (seed.questions.harvest.length ? seed.questions.harvest : seed.questions.water)
  if (mode === 'water' ? cards.length : seed.harvest === 'recall' && cards.length) return ask(seed, c, mode, cards)
  if (mode === 'water') return openLog(seed, c)
  openProof(seed, c, mode)
}

interface Asking { seed: Seed; c: V2Crop | null; mode: Mode; opts: { txt: string; ok: boolean }[]; Q: Mcq }
let QC: Asking | null = null
function ask(seed: Seed, c: V2Crop | null, mode: Mode, bank: Mcq[]): void {
  const Q = bank[Math.floor(Math.random() * bank.length)]
  if (!Q) return
  const opts = shuffle([{ txt: Q.answer, ok: true }, ...Q.distractors.map((txt) => ({ txt, ok: false }))])
  QC = { seed, c, mode, opts, Q }
  open(chip(seed.pack) + '<h2>' + workTitle(c, mode) + ' · ' + esc(seed.name) + '</h2><p class="sub">' + workSub(seed, c, mode) + '</p><p class="q">' + esc(Q.q) + '</p><div class="opts" id="opts">' + opts.map((o, i) => '<button type="button" data-act="opt" data-arg="' + i + '">' + esc(o.txt) + '</button>').join('') + '</div>')
}
const workTitle = (c: V2Crop | null, mode: Mode): string => (mode === 'harvest' ? 'Harvest' : mode === 'testout' ? 'Jump the fence' : (c && c.wilted ? 'Revive' : 'Water'))
function workSub(seed: Seed, c: V2Crop | null, mode: Mode): string {
  if (mode === 'testout') return 'Prove you already know it. A clean answer unlocks the seed without its prerequisites.'
  return esc(LAYER_NAMES[seed.layer]) + ' layer · ' + (c ? zone(c) : '') + ' · ' + COST[mode] + ' energy' + (mode === 'harvest' ? ' · premium grade makes it perennial' : '')
}

/** Watering a seed that has no cards (the Workshop's): log a day of work. */
let LOG: { seed: Seed; c: V2Crop } | null = null
function openLog(seed: Seed, c: V2Crop | null): void {
  if (!c) return
  LOG = { seed, c }
  open(chip(seed.pack) + '<h2>Log a day of work</h2><p class="sub">' + esc(seed.name) + ' · ' + esc(LAYER_NAMES[seed.layer]) + ' layer · ' + zone(c) + ' · 6 energy</p><p>Did you move <b>' + esc(seed.name) + '</b> forward today?</p><label for="work" class="sub">What you did (optional, only for you: the game does not keep it yet)</label><textarea id="work"></textarea>' +
    '<div class="foot"><button type="button" data-act="close">Not today</button><button type="button" class="pri" data-act="logDone">I moved it forward</button></div>')
}

/** Harvesting or jumping the fence for a seed whose proof is not a multiple-choice card: show what it must meet. */
let PROOF: { seed: Seed; c: V2Crop | null; mode: Mode } | null = null
function openProof(seed: Seed, c: V2Crop | null, mode: Mode): void {
  PROOF = { seed, c, mode }
  const prompt = seed.prompts.length ? seed.prompts[Math.floor(hash(c?.x ?? 0, c?.y ?? 0, S.day) * seed.prompts.length) % seed.prompts.length] : undefined
  const rubric = seed.rubric.length ? '<p class="sub">A good answer:</p><ul>' + seed.rubric.map((r) => '<li>' + esc(r) + '</li>').join('') + '</ul>' : ''
  open(chip(seed.pack) + '<h2>' + workTitle(c, mode) + ' · ' + esc(seed.name) + '</h2><p class="sub">' + workSub(seed, c, mode) + '</p><p class="q">' + esc(prompt ?? 'Show that you can do this: ' + seed.name + '.') + '</p>' + rubric +
    '<div class="foot"><button type="button" data-act="close">Not yet</button><button type="button" class="pri" data-act="proofDone">Done: it meets this</button></div>')
}

/** Apply the outcome of a piece of work to the farm and describe it. */
function settle(seed: Seed, c: V2Crop | null, mode: Mode, ok: boolean): string {
  spend(seed, COST[mode])
  const name = esc(seed.name)
  let msg = ''
  if (mode === 'testout') {
    if (ok) { S.unlocked.push(seed.id); msg = '<b>Over the fence.</b> ' + name + ' is unlocked. Plant it from the seed bag.' }
    else msg = '<b>Not yet.</b> ' + name + ' stays locked. Root its prerequisites, or try again tomorrow.'
  } else if (!c) {
    msg = ''
  } else if (mode === 'harvest') {
    if (ok) { S.coins += 30; c.per = true; c.lw = S.day; msg = '<b>Premium grade.</b> +30 coins. ' + name + ' is now a perennial: rooted, it only needs a check-in every 10 days. Seeds that needed it are now unlocked.' }
    else { c.stage = 2; c.lw = S.day; if (!S.compost.includes(c.id)) S.compost.push(c.id); msg = '<b>Seconds.</b> Composted. ' + name + ' drops back to stage 3 and goes in the review heap.' }
  } else if (ok) {
    c.wilted = false; c.stage = Math.min(4, c.stage + 1); c.lw = S.day; S.compost = S.compost.filter((x) => x !== c.id)
    msg = '<b>Watered.</b> ' + name + ' grows to stage ' + (c.stage + 1) + '/5. Next watering on day ' + due(c) + ' (' + zone(c) + ').'
  } else {
    c.wilted = true; c.stage = Math.max(0, c.stage - 1); c.lw = S.day; if (!S.compost.includes(c.id)) S.compost.push(c.id)
    msg = '<b>Wilted.</b> ' + name + ' drops a stage and goes in the compost heap. Revive it tomorrow.'
  }
  hud()
  return msg
}

function answer(i: number): void {
  if (!QC) return
  const { seed, c, mode, opts, Q } = QC
  const chosen = opts[i]
  if (!chosen) return
  QC = null
  const optsEl = $('opts')
  ;[...optsEl.children].forEach((el, j) => {
    if (!(el instanceof HTMLButtonElement)) return
    el.disabled = true
    if (opts[j]?.ok) el.classList.add('ok')
    else if (j === i) el.classList.add('bad')
  })
  const msg = settle(seed, c, mode, chosen.ok)
  const r = document.createElement('div')
  r.className = 'res'
  r.innerHTML = msg + '<br><span class="sub">' + esc(Q.why) + '</span>'
  optsEl.after(r)
  const f = document.createElement('div')
  f.innerHTML = foot('Back to the farm')
  if (f.firstElementChild) r.after(f.firstElementChild)
  primary()?.focus()
}
/** The sheets without cards finish here: the player says it was done. */
function finishPlain(seed: Seed, c: V2Crop | null, mode: Mode): void {
  const body = chip(seed.pack) + '<h2>' + workTitle(c, mode) + ' · ' + esc(seed.name) + '</h2><div class="res">' + settle(seed, c, mode, true) + '</div>' + foot('Back to the farm')
  open(body)
}

function expand(arg: string): void {
  const [k, pack, cost] = arg.split('|')
  const c = Number(cost)
  const m = k ? /^(\d+),(\d+)$/.exec(k) : null
  if (!k || !m || !pack || !Object.hasOwn(S.fields, pack) || !Number.isFinite(c)) return
  const x = Number(m[1]), y = Number(m[2])
  const tr = terrain(x, y)
  if (x >= N || y >= N || tr === 'soil' || tr === 'path' || isBuildingTile(x, y) || !neighbourFields(x, y, S.fields, S.cleared).includes(pack)) return
  if (S.coins < c) return toast('Not enough coins. Harvest something first.')
  S.coins -= c
  S.cleared[k] = pack
  buildStatics()
  hud()
  close()
  toast('Fenced in. The ' + packTitle(pack) + ' field grew.')
}

function openBag(): void {
  let html = '<h2>Seed bag</h2><p class="sub">Each seed is a topic. Plant it in its own field, water it by answering, harvest it to make it perennial. 10 energy + 10 coins to plant.</p>'
  for (const sec of bagView(S, catalog)) {
    const labels = [
      sec.perennial ? 'perennial' : '',
      sec.capPercent !== null ? "uses at most " + sec.capPercent + "% of the day's energy (" + catalog.capOf(sec.pack, S.energyMax) + ')' : '',
      sec.focusTitle ? 'focus: ' + esc(sec.focusTitle) : '',
    ].filter(Boolean)
    html += '<div class="fh"><i style="background:' + sec.color + '"></i>' + esc(sec.title) + '</div>' + (labels.length ? '<div class="sub">' + labels.join(' · ') + '</div>' : '') + '<div>'
    for (const sd of sec.seeds) {
      const tag = '<span class="tag">' + esc(sd.harvest) + '</span>'
      if (sd.status !== 'ready') html += '<div class="row slim"><div class="n">' + esc(sd.name) + '<small>' + esc(sd.layer) + ' · in the ground</small></div><span class="sub">' + tag + ' ' + sd.status + '</span></div>'
      else html += '<div class="row"><div class="n">' + esc(sd.name) + '<small>' + esc(sd.layer) + ' ' + tag + (sd.focus ? ' · focus' : '') + '</small></div><button type="button" data-act="seed" data-arg="' + sd.id + '"' + (sd.selected ? ' class="pri"' : '') + '>' + (sd.selected ? 'Selected' : 'Select') + '</button></div>'
    }
    if (sec.lockedCount) html += '<div class="row locked slim"><div class="n">' + sec.lockedCount + ' locked<small>see the learning tree</small></div></div>'
    html += '</div>'
  }
  html += '<h3>Your farm</h3><p class="sub">Saved in this browser only. Export it before clearing site data or moving machines.</p><div class="branches"><button type="button" data-act="export">Export farm</button><button type="button" data-act="import">Import farm</button></div>'
  html += foot('Close', '<button type="button" class="link" data-act="reset">Reset farm</button>')
  open(html)
}
function exportFarm(): void {
  const data = JSON.stringify(S)
  const name = 'permaculture-farm-day' + S.day + '.json'
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
  open('<h2>Import farm</h2><p class="sub">Choose an exported file, or paste its contents. This replaces the farm in this browser.</p><input type="file" id="impFile" accept="application/json,.json"><label for="imp" class="sub">Or paste here</label><textarea id="imp"></textarea>' + foot('Import', '<button type="button" data-act="close">Cancel</button>'))
  const b = primary()
  if (b) b.dataset.act = 'doImport'
  byIdAs('impFile', HTMLInputElement).addEventListener('change', (e) => {
    const input = e.target
    const f = input instanceof HTMLInputElement ? input.files?.[0] : undefined
    if (!f) return
    f.text().then((t) => { byIdAs('imp', HTMLTextAreaElement).value = t }, () => toast('Could not read that file.'))
  })
}
function doImport(): void {
  let obj: unknown
  try { obj = JSON.parse(byIdAs('imp', HTMLTextAreaElement).value) } catch { return toast('That is not valid farm data.') }
  const next = looksLikeV2(obj) ? upgradeV2(obj, catalog) : null
  if (!next) return toast('That file is not a Permaculture farm (format v2).')
  S = next
  buildStatics()
  clampCam()
  hud()
  close()
  toast('Farm imported. Day ' + S.day + '.')
}
function openWell(): void { open('<h2>Rain barrel</h2><p>' + S.barrel + ' of 5 days stored.</p><p class="sub">Catch and store energy. End a day with 30+ energy left and the barrel fills by one. When a crop is about to wilt, the barrel spends a day to keep it alive. It never grows a crop; only you do.</p>' + foot()) }
function openCompost(): void {
  const items = S.compost.map((id) => catalog.seed(id)).filter((s): s is Seed => s !== undefined)
  open('<h2>Compost heap</h2><p class="sub">Produce no waste. A failed answer is not lost; it is the next thing to review.</p><div>' + (items.length ? items.map((s) => '<div class="row"><div class="n">' + esc(s.name) + '<small>' + esc(packTitle(s.pack)) + ' · tap the crop to revive it</small></div></div>').join('') : '<p>Empty. Nothing failed recently.</p>') + '</div>' + foot())
}

function openForage(x: number, y: number): void {
  const fd = pickFind(findCandidates(S, catalog), x, y, S.day)
  if (!fd) return toast('The forest is quiet today. Plant something new and come back.')
  const link = fd.near.map(nameOf).join(', ')
  open('<div><span class="chip" style="--c:#4F8F3C">Zone 5 · wilderness</span></div><h2>Wild find</h2><p class="sub">Observe and interact. Nothing here counts toward readiness; it widens the edge of what you are growing. Related to: ' + esc(link) + '.</p><div class="find">' + esc(fd.text) + '</div>' +
    foot('Forage · 5 energy', '<button type="button" data-act="close">Leave it</button>'))
  const b = primary()
  if (b) { b.dataset.act = 'forage'; b.dataset.arg = fd.id }
}
function forage(id: string): void {
  const fd = catalog.find(id)
  if (!fd || S.foraged.includes(id)) return
  if (S.energy < 5) return toast('Out of energy. Sleep first.')
  S.energy -= 5; S.coins += 3; S.foraged.push(id)
  hud()
  let html = '<h2>Foraged</h2><p>+3 coins. Noted in your field journal.</p>'
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
  if (!seed || !seed.wild || S.volunteers.includes(id)) return
  S.volunteers.push(id)
  save()
  close()
  toast(seed.name + ' added to your seed bag as a volunteer.')
}

/* ---------- learning tree ---------- */
let treePack: string = catalog.packs[0]?.pack ?? ''
const SVG_FONT = 'font-family="DM Sans,system-ui"'
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
    const stroke = n.status === 'rooted' || n.status === 'growing' ? v.color : n.status === 'ready' ? '#F4EAD0' : '#5C4A2E'
    const tc = n.status === 'rooted' ? '#10200C' : n.status === 'locked' ? '#8F7F60' : '#F4EAD0'
    s += '<rect x="' + (n.x - n.width / 2) + '" y="' + (n.y - 18) + '" width="' + n.width + '" height="36" rx="6" fill="' + fill + '" stroke="' + stroke + '" stroke-width="2"' + (n.status === 'locked' ? ' stroke-dasharray="4 3"' : '') + '/>'
    n.lines.forEach((l, i) => { s += '<text x="' + n.x + '" y="' + (n.y + (n.lines.length === 1 ? 4 : (i === 0 ? -1 : 11))) + '" text-anchor="middle" fill="' + tc + '" font-size="10.5" font-weight="600" ' + SVG_FONT + '>' + esc(l) + '</text>' })
    if (n.progress !== null) s += '<rect x="' + (n.x - n.width / 2) + '" y="' + (n.y + 14) + '" width="' + (n.width * n.progress) + '" height="4" rx="2" fill="' + v.color + '"/>'
    if (n.wild) s += '<circle cx="' + (n.x + n.width / 2 - 6) + '" cy="' + (n.y - 12) + '" r="4" fill="#4F8F3C"/>'
  }
  return s + '</svg>'
}
function openTree(): void {
  const v = treeView(treePack, S, catalog)
  if (!v) return
  let html = '<h2>Learning tree</h2><p class="sub">Everything you could grow, including what you cannot reach yet. A seed unlocks when the seeds it needs are <b>rooted</b> (harvested to perennial). Pick a branch to focus; the seed bag puts it first.</p>'
  html += '<div class="tabs">' + catalog.packs.map((p) => '<button type="button" data-act="treeTab" data-arg="' + esc(p.pack) + '"' + (p.pack === v.pack ? ' class="on"' : '') + '><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:' + packColor(p) + ';margin-right:6px;vertical-align:-1px"></span>' + esc(p.title) + '</button>').join('') + '</div>'
  html += treeSvg(v)
  html += '<div class="branches">' + v.branches.map((b) => '<button type="button" data-act="focus" data-arg="' + esc(v.pack) + '|' + esc(b.id) + '"' + (b.focus ? ' class="pri"' : '') + '>' + (b.focus ? 'Focus: ' : 'Focus on ') + esc(b.title) + '</button>').join('') + '</div>'
  html += '<p class="sub">Solid box: rooted · outline: growing (bar = stage) · cream outline: ready to plant · dashed: locked · green dot: found in the wild.</p>'
  if (v.guilds.length) {
    html += '<h3>Guilds</h3><p class="sub">Seeds that grow well together. No bonus yet; the tree just shows how far each guild has come.</p><div>' +
      v.guilds.map((g) => '<div class="row"><div class="n">' + esc(g.title) + '<small>' + g.members.map((m) => esc(m.name ?? 'a wild seed')).join(', ') + '</small></div><span class="sub">' + g.rooted + ' of ' + g.total + ' rooted</span></div>').join('') + '</div>'
  }
  if (v.locked.length) html += '<h3>Jump the fence</h3><p class="sub">Already know one of these? Prove it on a harvest-grade question (10 energy) and it unlocks without its prerequisites.</p><div>' + v.locked.map((t) => '<div class="row"><div class="n">' + esc(t.name) + '<small>needs ' + esc(t.needs) + '</small></div><button type="button" data-act="testout" data-arg="' + esc(t.id) + '">Test out</button></div>').join('') + '</div>'
  html += foot()
  open(html)
}

/* ---------- almanac ---------- */
function openAlmanac(): void {
  const capped = catalog.packs.filter((p) => p.energy_cap !== undefined)
  const capNotes = capped.map((p) => '<li>The <b>' + esc(p.title) + '</b> field is capped: all its work together may use at most ' + p.energy_cap + '% of a day\'s energy (' + catalog.capOf(p.pack, S.energyMax) + ' of ' + S.energyMax + '), so it never becomes the only crop.</li>').join('')
  open('<h2>Almanac</h2><p class="sub">The rules of this farm, as they stand today. Everything here is in the game right now.</p>' +
    '<h3>The loop</h3><ul><li><b>Seeds are topics.</b> Plant one in its field: 10 energy, 10 coins. It sprouts at stage 1 of 5.</li><li><b>Water = answer.</b> A thirsty crop shows a droplet. Tap it and answer one question (6 energy). Right: it grows a stage. Wrong: it wilts, drops a stage, and goes in the compost heap.</li><li><b>Harvest = prove it.</b> A stage-5 crop sparkles. Answer a harder question (15 energy). Premium: +30 coins and the crop becomes a <b>perennial tree</b>, rooted for good. Seconds: composted, back to stage 3.</li></ul>' +
    '<h3>Thirst and zones</h3><ul><li>After watering, a crop is thirsty again after 1, 2, 3, 4 or 5 days depending on its stage (Z1 daily, out to Z4). Perennials ask for a check-in every 10 days.</li><li>Two days past thirsty without water: it wilts overnight, unless the rain barrel saves it.</li><li>This is spaced repetition. The map is your retention: inner zones should be small, outer zones full.</li></ul>' +
    '<h3>Energy and the rain barrel</h3><ul><li>90 energy a day. Sleep restores it.</li><li>End a day with 30+ energy left and the barrel stores one day (max 5). It spends a day automatically to stop a crop from wilting.</li>' + capNotes + '</ul>' +
    '<h3>Fields and land</h3><ul><li>Every pack is a field. They sit on a grid around the barn, and the world grows to fit them. Drag to pan; everything beyond the homestead is wilderness.</li><li>Tap land next to a field to fence it in: 25 coins for open ground, 40 to clear forest. Fields grow one tile at a time, any shape.</li><li>Some seeds are not questions. The Workshop\'s are days of work on the game itself: you log the day, and you harvest when it ships.</li></ul>' +
    '<h3>Wilderness (Zone 5)</h3><ul><li>Tap trees to forage a <b>wild find</b>: a fact next to what you are growing. 5 energy, +3 coins, no readiness credit.</li><li>Some finds can be <b>domesticated</b> into volunteer seeds that appear in your seed bag.</li></ul>' +
    '<h3>Learning tree</h3><ul><li>Every seed of every field, including locked ones, is on the tree. A seed unlocks when what it needs is rooted.</li><li>Pick a branch to focus; the seed bag puts it first. Or jump the fence: pass a harvest-grade question to unlock a seed early.</li><li>Guilds are sets of seeds that belong together. The tree shows how many of each are rooted; there is no bonus yet.</li></ul>' +
    '<h3>Buildings</h3><ul><li><b>Barn</b>: seed bag. <b>Well</b>: rain barrel. <b>Compost heap</b>: what to review. <b>Signpost</b>: this almanac.</li></ul>' +
    '<h3>Not here yet</h3><p class="sub">Guild bonuses, layers as terraces, real weather from Coorg, the rival farm, the Sunday walk, the market, judged write-ups and timed solves, your own notes on each crop, loading your own pack in the browser, the village.</p>' + foot())
}

/* ---------- sleep ---------- */
function sleep(): void {
  const night = $('night')
  const bSleep = byIdAs('bSleep', HTMLButtonElement)
  night.style.opacity = '1'
  bSleep.disabled = true
  setTimeout(() => {
    const before = S.energy
    S.day += 1
    const saved: string[] = [], wiltedNow: string[] = [], thirstyNow: string[] = []
    for (const c of S.crops) {
      if (c.wilted || c.per) continue
      if (S.day > due(c) + 1) {
        if (S.barrel > 0) { S.barrel--; c.lw = S.day - interval(c); saved.push(nameOf(c.id)) }
        else { c.wilted = true; if (!S.compost.includes(c.id)) S.compost.push(c.id); wiltedNow.push(nameOf(c.id)) }
      }
    }
    for (const c of S.crops) if (thirsty(c)) thirstyNow.push(nameOf(c.id))
    let barrelUp = false
    if (before >= 30 && S.barrel < 5) { S.barrel++; barrelUp = true }
    S.energy = S.energyMax
    S.today = { spent: {} }
    hud()
    setTimeout(() => {
      night.style.opacity = '0'
      bSleep.disabled = false
      open('<h2>Day ' + S.day + '</h2><p>Energy restored to ' + S.energyMax + '.' + (barrelUp ? ' Rain barrel +1 (you ended the day with energy to spare).' : '') + '</p>' +
        (thirstyNow.length ? '<p><b>Thirsty:</b> ' + esc(thirstyNow.join(', ')) + '.</p>' : '<p>Nothing is thirsty. Plant something, or forage.</p>') +
        (saved.length ? '<p><b>Rain barrel saved:</b> ' + esc(saved.join(', ')) + '.</p>' : '') +
        (wiltedNow.length ? '<p><b>Wilted overnight:</b> ' + esc(wiltedNow.join(', ')) + '. Revive them today.</p>' : '') +
        '<p class="sub">New wild finds have grown in the forest.</p>' + foot('Start the day'))
    }, 700)
  }, 750)
}

/* ---------- one delegated handler for every sheet ---------- */
sheet.addEventListener('click', (e) => {
  const b = e.target instanceof Element ? e.target.closest('button') : null
  if (!b || b.disabled) return
  const act = b.dataset.act
  const arg = b.dataset.arg ?? ''
  if (act === 'close') close()
  else if (act === 'opt') answer(Number(arg))
  else if (act === 'logDone') { const w = LOG; LOG = null; if (w && S.crops.includes(w.c)) finishPlain(w.seed, w.c, 'water') }
  else if (act === 'proofDone') { const w = PROOF; PROOF = null; if (w && (w.mode === 'testout' || (w.c && S.crops.includes(w.c)))) finishPlain(w.seed, w.c, w.mode) }
  else if (act === 'seed') {
    const seed = catalog.seed(arg)
    if (!seed) return
    S.seedSel = arg
    hint('Seed in hand: <b>' + esc(seed.name) + '</b>. Tap an empty soil tile in the <b>' + esc(packTitle(seed.pack)) + '</b> field to plant it.')
    save()
    close()
  } else if (act === 'reset') { S = initialState(); buildStatics(); hud(); close(); toast('Farm reset to day ' + S.day + '.') }
  else if (act === 'export') exportFarm()
  else if (act === 'import') importFarm()
  else if (act === 'doImport') doImport()
  else if (act === 'copyExp') {
    const t = byIdAs('exp', HTMLTextAreaElement)
    const done = () => toast('Copied.')
    const fail = () => { t.focus(); t.select(); toast('Select all and copy.') }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t.value).then(done, fail)
    else fail()
  } else if (act === 'expand') expand(arg)
  else if (act === 'forage') forage(arg)
  else if (act === 'domesticate') domesticate(arg)
  else if (act === 'treeTab') { if (catalog.pack(arg)) { treePack = arg; openTree() } }
  else if (act === 'focus') {
    const [packId, branchId] = arg.split('|')
    const pack = packId ? catalog.pack(packId) : undefined
    if (!pack || !branchId || !pack.branches.some((br) => br.id === branchId)) return
    if (S.focus[pack.pack] === branchId) delete S.focus[pack.pack]
    else S.focus[pack.pack] = branchId
    save()
    openTree()
  } else if (act === 'testout') {
    const seed = catalog.seed(arg)
    if (!seed || !visible(seed, S) || available(seed, S) || rootedIds(S).has(seed.id) || S.crops.some((c) => c.id === seed.id)) return
    if (tooTired(seed, 10, 'Needs 10 energy. Sleep first.')) return
    startWork(seed, null, 'testout')
  }
})
byId('bBag').addEventListener('click', openBag)
byId('bTree').addEventListener('click', openTree)
byId('bAlm').addEventListener('click', openAlmanac)
byId('bSleep').addEventListener('click', sleep)
hud()
if (loadFailed) toast('Your saved farm could not be read. Starting a fresh one.')
