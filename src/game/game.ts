import { esc, hash, shuffle } from './util'

/* ---------- types ---------- */
type FieldKey = 'hs' | 'sd' | 'inf' | 'kn'

interface Field {
  name: string
  color: string
  x0: number
  y0: number
  branches: [string, string]
}

interface Question {
  q: string
  a: string[]
  why: string
}

interface Topic {
  id: string
  f: FieldKey
  b: 0 | 1
  tier: number
  name: string
  layer: string
  needs?: string[]
  wild?: boolean
  q: Question[]
  h?: Question[]
}

interface Find {
  id: string
  for: string[]
  text: string
  seed?: string
}

interface V2Crop {
  id: string
  x: number
  y: number
  stage: number
  lw: number
  wilted: boolean
  per: boolean
}

interface V2State {
  v: 2
  day: number
  energy: number
  energyMax: number
  coins: number
  barrel: number
  seedSel: string | null
  compost: string[]
  cleared: Record<string, FieldKey | 'grass'>
  unlocked: string[]
  volunteers: string[]
  foraged: string[]
  focus: Record<string, number | null>
  cam: { x: number; y: number }
  crops: V2Crop[]
  farmer: { x: number; y: number; tx: number; ty: number }
}

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
const N = 20
const HOME = { x0: 4, y0: 4, x1: 15, y1: 15 }
const CAM_HOME = { x: 240, y: -18 }

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

/* ---------- world ---------- */
const FIELD_KEYS: FieldKey[] = ['hs', 'sd', 'inf', 'kn']
const FIELDS: Record<FieldKey, Field> = {
  hs: { name: 'Haskell', color: '#6DB24F', x0: 5, y0: 5, branches: ['Runtime & performance', 'Types & effects'] },
  sd: { name: 'System design', color: '#E0A93E', x0: 12, y0: 5, branches: ['Distributed data', 'Traffic & resilience'] },
  inf: { name: 'Infra', color: '#5FA8C9', x0: 5, y0: 12, branches: ['Network & platform', 'Data & reliability'] },
  kn: { name: 'Kannada', color: '#B089D6', x0: 12, y0: 12, branches: ['Words', 'Grammar & script'] },
}
const BARN = { x: 9, y: 4 }
const WELL = { x: 15, y: 9 }
const COMPOST = { x: 15, y: 10 }
const SIGN = { x: 8, y: 8 }
const BLOCKED = new Set(['9,4', '10,4', '9,5', '10,5', '15,9', '15,10', '8,8'])

/* Seeds. First answer in `a` is the correct one; options are shuffled on screen. b = branch index, tier = depth in the tree. */
const TOPICS: Topic[] = [
 {id:'laziness',f:'hs',b:1,tier:0,name:'Laziness model',layer:'Ground cover',
  q:[{q:'`let xs = [1..] in take 3 xs` works because…',a:['Lists are built lazily; only the demanded cons cells get evaluated','GHC detects infinite lists and truncates them','take forces the whole list first','[1..] is special finite syntax'],why:'Thunks are evaluated on demand; take only pattern-matches three cells.'}]},
 {id:'stm',f:'hs',b:1,tier:1,name:'STM retry',layer:'Shrub',
  q:[{q:'Inside an STM transaction, what does `retry` do?',a:['Blocks until a TVar it read changes, then re-runs the transaction','Re-runs the transaction immediately in a busy loop','Throws an exception to the caller','Commits the writes made so far'],why:'retry parks the thread and wakes it when any TVar read so far is written by another transaction.'}],
  h:[{q:'Why can you not run IO inside `atomically`?',a:['A transaction may run several times before committing, so effects would repeat','IO is too slow for the STM scheduler','The runtime has no way to time IO','STM runs only on the main thread'],why:'Transactions are optimistic and can be re-executed; IO effects cannot be rolled back.'}]},
 {id:'bracket',f:'hs',b:1,tier:1,name:'bracket & cleanup',layer:'Herb',
  q:[{q:'`bracket acquire release use` runs `release` when…',a:['`use` finishes, throws, or the thread gets an async exception','Only when `use` returns normally','Only on asynchronous exceptions','Only if `acquire` failed'],why:'bracket masks async exceptions during acquire/release and always runs release.'}],
  h:[{q:'What does `mask` change for the `acquire` step?',a:['Async exceptions are deferred until an interruptible op or unmask','Sync exceptions are swallowed','GC is paused for the duration','Nothing; mask only affects release'],why:'Without mask, a Ctrl-C between acquire and the handler install would leak the resource.'}]},
 {id:'gc',f:'hs',b:0,tier:1,name:'GC generations',layer:'Root',
  q:[{q:"GHC's default garbage collector is…",a:['A generational copying collector','Reference counting','Mark-and-sweep only','There is no GC; memory is arena-allocated'],why:'Young objects live in the nursery and get copied to the old generation if they survive.'}],
  h:[{q:'Raising -A (nursery size) usually means…',a:['Fewer minor GCs, more memory per capability','More minor GCs, less memory','No change to GC frequency','The old generation shrinks'],why:'A bigger nursery fills more slowly, so minor collections are rarer; cost is memory and cache locality.'}]},
 {id:'leaks',f:'hs',b:0,tier:1,name:'Space leaks',layer:'Root',
  q:[{q:'The classic `foldl` space leak happens because…',a:['The lazy accumulator builds a chain of thunks before anything is forced','The list is evaluated strictly up front','Too many capabilities run the fold','foldl allocates a new list per step'],why:"foldl' (or a bang on the accumulator) forces each step and keeps memory flat."}],
  h:[{q:'Which RTS flag gives you a heap profile broken down by cost centre?',a:['-hc','-s','-N','-A64m'],why:'-hc profiles by cost centre; -hy by type, -hd by closure description.'}]},
 {id:'rts',f:'hs',b:0,tier:2,name:'Threaded RTS',layer:'Root',needs:['gc'],
  q:[{q:'`-N4` with the threaded runtime gives you…',a:['4 capabilities: OS threads that run Haskell threads in parallel','4 green threads','4 separate heaps with no sharing','Nothing unless you also use forkOS'],why:'Capabilities are the parallel slots; green threads are multiplexed onto them.'}]},
 {id:'lockfree',f:'hs',b:1,tier:2,name:'Lock-free structures',layer:'Shrub',needs:['stm'],
  q:[{q:'A compare-and-swap loop can starve a thread because…',a:['Another thread keeps winning the CAS, so it never commits','CAS takes a global lock','The GC blocks CAS','CAS only works on 8-bit values'],why:'Lock-free guarantees system progress, not per-thread progress; that is wait-free.'}]},
 {id:'gadts',f:'hs',b:1,tier:2,name:'GADTs & type-level',layer:'Ground cover',needs:['laziness'],
  q:[{q:'A GADT lets a constructor…',a:['Refine the type parameter, so pattern matching learns type information','Have more than one name','Be used at the kind level only','Skip the type checker'],why:'`eval :: Expr Int -> Int` is safe because matching on `IntLit` refines `a ~ Int`.'}]},
 {id:'effects',f:'hs',b:1,tier:3,name:'Effect systems',layer:'Canopy',needs:['gadts','bracket'],
  q:[{q:'The ReaderT-over-IO pattern avoids…',a:['Deep transformer stacks and their lifting overhead','All use of IO','Exceptions entirely','The need for a configuration record'],why:'One ReaderT Env IO layer; capabilities live in the Env.'}]},
 {id:'nonmoving',f:'hs',b:0,tier:3,name:'Non-moving GC',layer:'Root',needs:['rts'],wild:true,
  q:[{q:"GHC's non-moving collector mainly reduces…",a:['Pause times for the old generation','Allocation cost','Thunk creation','Binary size'],why:'Enable with --nonmoving-gc; throughput can drop slightly.'}]},

 {id:'cap',f:'sd',b:0,tier:0,name:'CAP & consistency',layer:'Ground cover',
  q:[{q:'Under a network partition, a CP system…',a:['Refuses some requests rather than return stale or divergent data','Keeps serving every request from any node','Switches to eventual consistency automatically','Loses data'],why:'PACELC adds: even without a partition, you trade latency for consistency.'}]},
 {id:'con',f:'sd',b:0,tier:0,name:'Consistent hashing',layer:'Ground cover',
  q:[{q:'The main benefit of consistent hashing over `hash mod N`?',a:['Adding or removing a node remaps only about 1/N of the keys','Hashing becomes faster','Collisions become impossible','Keys come out sorted'],why:'Keys map to points on a ring; only the arc next to the new node moves.'}],
  h:[{q:'Why add virtual nodes to the ring?',a:['To even out load when nodes are few or unequal in size','To encrypt the keys','To cut memory use','To avoid hashing entirely'],why:'Each physical node gets many ring positions, smoothing the arcs it owns.'}]},
 {id:'replication',f:'sd',b:0,tier:1,name:'Replication',layer:'Shrub',needs:['cap'],
  q:[{q:'Leader-based replication with async followers risks…',a:['Acknowledged writes being lost if the leader fails before followers catch up','Double writes','Followers overwriting the leader','Nothing; it is equivalent to sync'],why:'Semi-sync (one follower acks) is the usual middle ground.'}]},
 {id:'raft',f:'sd',b:0,tier:1,name:'Raft',layer:'Root',needs:['con'],
  q:[{q:'In Raft, a log entry is committed when…',a:['It is replicated on a majority and the leader has applied an entry from its current term','The leader has written it locally','Any follower acknowledges it','The client receives an acknowledgement'],why:'Majority replication plus a current-term entry prevents an old entry from being committed by a stale leader.'}]},
 {id:'cell',f:'sd',b:0,tier:2,name:'Cell architecture',layer:'Canopy',needs:['replication','raft'],
  q:[{q:'Cell-based architecture limits blast radius by…',a:['Running many small, independent copies of the whole stack, each serving a slice of customers','Caching everything at the edge','Using one very large database','Moving all logic to the client'],why:'A bad deploy or a hot tenant takes down one cell, not the fleet.'}]},
 {id:'bp',f:'sd',b:1,tier:0,name:'Backpressure',layer:'Understory',
  q:[{q:'Backpressure is…',a:['A consumer signalling a producer to slow down','Retrying failed requests with jitter','Caching responses near the client','Spreading requests across replicas'],why:'Bounded queues, pull-based streams and TCP windows are all backpressure.'}],
  h:[{q:'A bounded queue before a slow worker fills up. Safest failure for a payments API?',a:['Reject new work fast with 503 and Retry-After','Grow the queue without bound','Drop the oldest requests silently','Block the accept loop until space frees'],why:'Fast rejection keeps latency bounded and lets callers back off; unbounded queues turn into memory and timeout failures.'}]},
 {id:'rl',f:'sd',b:1,tier:1,name:'Rate limiting',layer:'Herb',needs:['bp'],
  q:[{q:'A token bucket allows…',a:['Bursts up to the bucket size while enforcing an average rate','No bursts at all','Unlimited rate when the bucket is empty','Only fixed one-second windows'],why:'Tokens refill at the rate; a full bucket is the burst allowance.'}],
  h:[{q:'Fixed-window counters suffer from…',a:['Up to 2× the limit across a window boundary','Too much memory per client','Clock drift only','Nothing; they are exact'],why:'A burst at the end of one window plus one at the start of the next doubles the real rate.'}]},
 {id:'idem',f:'sd',b:1,tier:1,name:'Idempotency & outbox',layer:'Understory',needs:['bp'],
  q:[{q:'A transactional outbox solves…',a:['Writing to the DB and publishing an event atomically, so neither is lost','Slow queries','Duplicate consumers','Schema migrations'],why:'The event row commits with the business row; a relay publishes it afterwards, at-least-once.'}]},
 {id:'fpaxos',f:'sd',b:0,tier:2,name:'Flexible Paxos',layer:'Root',needs:['raft'],wild:true,
  q:[{q:'Flexible Paxos relaxes…',a:['The rule that election and replication quorums are both majorities; they only need to intersect','The need for a leader','Log ordering','Durability'],why:'Replicate to 2 of 5, elect with 4 of 5: faster steady state, slower failover.'}]},
 {id:'jump',f:'sd',b:0,tier:1,name:'Jump hash',layer:'Ground cover',needs:['con'],wild:true,
  q:[{q:'Compared with a hash ring, jump consistent hash gives up…',a:['Arbitrary node names and removal from the middle; buckets are numbered 0..n−1','Uniform key distribution','Speed','Determinism'],why:'Great for sharding where you only ever grow or shrink from the end.'}]},

 {id:'tcp',f:'inf',b:0,tier:0,name:'TCP backlog',layer:'Ground cover',
  q:[{q:'A SYN flood exhausts…',a:['The half-open connection queue','Disk space on the server','The DNS cache','TLS session tickets'],why:'SYN cookies let the kernel accept without holding state for half-open connections.'}]},
 {id:'k8s',f:'inf',b:0,tier:1,name:'k8s scheduling',layer:'Understory',needs:['tcp'],
  q:[{q:'A pod stays Pending most often because…',a:['No node satisfies its resource requests or affinity rules','The image is too large to pull','Its Service has not been created','Its ConfigMap is empty'],why:'`kubectl describe pod` shows the scheduler events; requests, taints and affinity are the usual culprits.'}]},
 {id:'tls',f:'inf',b:0,tier:1,name:'TLS & certs',layer:'Ground cover',needs:['tcp'],
  q:[{q:'The TLS 1.3 handshake is faster mainly because…',a:['Key exchange and cipher negotiation complete in one round trip','Certificates are no longer sent','It uses RSA key transport','Compression was added'],why:'1-RTT handshake, 0-RTT for resumption; legacy ciphers were removed.'}]},
 {id:'mesh',f:'inf',b:0,tier:2,name:'Service mesh',layer:'Canopy',needs:['k8s','tls'],
  q:[{q:'A sidecar mesh moves retries, mTLS and metrics…',a:['Out of application code into a per-pod proxy','Into the kernel','Into the load balancer only','Into the database'],why:'Cost: an extra hop per call and more moving parts to run.'}]},
 {id:'mvcc',f:'inf',b:1,tier:0,name:'Postgres MVCC',layer:'Shrub',
  q:[{q:'An UPDATE in Postgres…',a:['Writes a new row version; the old one stays until VACUUM','Overwrites the row in place','Takes a table-level lock','Deletes the page and rewrites it'],why:'Readers keep seeing the old version; dead tuples are reclaimed by VACUUM.'}],
  h:[{q:'A long-running transaction hurts mostly because…',a:['VACUUM cannot remove dead tuples that transaction might still see','It burns CPU constantly','It locks every index','It blocks all writers'],why:'Table bloat grows until the old snapshot is released.'}]},
 {id:'pgidx',f:'inf',b:1,tier:1,name:'Indexes & planner',layer:'Shrub',needs:['mvcc'],
  q:[{q:'`EXPLAIN` shows a Seq Scan on an indexed column because…',a:['The planner estimates the index would not be cheaper (small table or low selectivity)','Indexes only work with primary keys','The column type is unsupported','You forgot VACUUM'],why:'Check row estimates with EXPLAIN ANALYZE; stale statistics mislead the planner.'}]},
 {id:'kafka',f:'inf',b:1,tier:1,name:'Kafka internals',layer:'Shrub',needs:['mvcc'],
  q:[{q:'Ordering in Kafka is guaranteed…',a:['Within a partition only','Across the whole topic','Across all topics of a producer','Only with exactly-once enabled'],why:'Pick the partition key to be whatever you need ordered, e.g. an order id.'}]},
 {id:'slo',f:'inf',b:1,tier:2,name:'SLOs & error budgets',layer:'Vine',needs:['kafka','pgidx'],
  q:[{q:'An error budget is…',a:['The allowed unreliability (1 − SLO) you may spend on risk, like deploys','The on-call budget in rupees','The number of bugs allowed per sprint','A Grafana dashboard'],why:'Burn it too fast and you freeze feature work; that is the SRE bargain.'}]},

 {id:'food',f:'kn',b:0,tier:0,name:'Food words',layer:'Herb',
  q:[{q:'ಊಟ (oota) means…',a:['meal','water','house','road'],why:'ಊಟ ಆಯ್ತಾ? (oota aaytaa?) — did you eat?'}],
  h:[{q:"'ನನಗೆ ಹಸಿವಾಗಿದೆ' (nanage hasivaagide) means…",a:['I am hungry','I am tired','I am thirsty','I am late'],why:'ಹಸಿವು = hunger; ನನಗೆ = to me.'}]},
 {id:'water',f:'kn',b:0,tier:0,name:'Water & drink',layer:'Herb',
  q:[{q:'ನೀರು (neeru) means…',a:['water','milk','rice','fire'],why:'ನೀರು ಕೊಡಿ (neeru kodi) — please give water.'}]},
 {id:'num',f:'kn',b:0,tier:0,name:'Numbers 1–10',layer:'Ground cover',
  q:[{q:'ಮೂರು (mooru) is…',a:['three','two','five','ten'],why:'ಒಂದು, ಎರಡು, ಮೂರು — ondu, eradu, mooru.'}]},
 {id:'market',f:'kn',b:0,tier:1,name:'Market phrases',layer:'Understory',needs:['num'],
  q:[{q:"'ಇದು ಎಷ್ಟು?' (idu eshtu?) asks…",a:['How much is this?','Where is this?','What is this?','Who are you?'],why:'ಎಷ್ಟು = how much/many. Useful at every stall.'}]},
 {id:'dirs',f:'kn',b:0,tier:1,name:'Directions',layer:'Herb',needs:['water'],
  q:[{q:'ಎಡ (eda) / ಬಲ (bala) are…',a:['left / right','up / down','near / far','fast / slow'],why:'ಎಡಕ್ಕೆ ತಿರುಗಿ (edakke tirugi) — turn left.'}]},
 {id:'script',f:'kn',b:1,tier:0,name:'Script: vowels',layer:'Ground cover',
  q:[{q:'ಅ ಆ ಇ ಈ are…',a:['The first four vowels: a, aa, i, ii','Consonants','Numerals','Punctuation marks'],why:'Kannada has 13 vowels (ಸ್ವರಗಳು); long vowels double the sound.'}]},
 {id:'verbs',f:'kn',b:1,tier:1,name:'Verbs: ಇದೆ / ಬೇಕು',layer:'Understory',needs:['food'],
  q:[{q:"'ನನಗೆ ಕಾಫಿ ಬೇಕು' means…",a:['I want coffee','I have coffee','I made coffee','Coffee is hot'],why:'ಬೇಕು = want/need; ನನಗೆ (to me) + object + ಬೇಕು.'}]},
 {id:'talk',f:'kn',b:1,tier:2,name:'Small talk',layer:'Canopy',needs:['verbs','market'],
  q:[{q:"'ಹೇಗಿದ್ದೀರಾ?' (hegiddeera?) is…",a:['How are you? (polite)','What is your name?','Where are you going?','Good night'],why:'Reply: ಚೆನ್ನಾಗಿದ್ದೀನಿ (chennaagiddeeni) — I am fine.'}]}
];
const T: Record<string, Topic> = Object.fromEntries(TOPICS.map((t) => [t.id, t]))

/* Wild finds: foraged in the forest. Picked by what is growing right now. */
const FINDS: Find[] = [
 {id:'f1',for:['raft','con','cap'],text:'Flexible Paxos (Howard, 2016): leader-election and replication quorums need not both be majorities; they only need to intersect. Replicate to 2 of 5, elect with 4 of 5.',seed:'fpaxos'},
 {id:'f2',for:['con'],text:'Jump consistent hash (Lamping & Veach): no ring, no memory, O(log n). Used inside Google for sharding. The price: you can only add or remove buckets at the end.',seed:'jump'},
 {id:'f3',for:['gc','leaks','rts'],text:"GHC's non-moving garbage collector (--nonmoving-gc) marks the old generation concurrently, trading a little throughput for much shorter pauses.",seed:'nonmoving'},
 {id:'f4',for:['bp','rl'],text:'TCP flow control is backpressure you already run in production: the receive window tells the sender exactly how much it may send before the receiver drains.'},
 {id:'f5',for:['mvcc','pgidx'],text:'Postgres hint bits: the first reader after a commit writes visibility flags into the page. That is why a read-only workload can produce write I/O.'},
 {id:'f6',for:['k8s','mesh'],text:'Topology spread constraints balance pods across zones and nodes without anti-affinity rules. Reach for them before affinity.'},
 {id:'f7',for:['food','market','talk'],text:'A kitchen word from your own district: ಪಂದಿ ಕರಿ (pandi curry), Kodava pork with kachampuli, the dark Coorg vinegar.'},
 {id:'f8',for:['stm','lockfree'],text:'GHC STM validates at commit with per-TVar locks, so long transactions on hot TVars retry often. Keep transactions short and TVars fine-grained.'},
 {id:'f9',for:['tls','tcp'],text:'QUIC runs over UDP and folds TLS 1.3 into its own handshake, so connection setup and encryption finish together in one round trip.'},
 {id:'f10',for:['slo','kafka'],text:'Google SRE: an SLO stricter than what users notice costs money for nothing. Pick the loosest target users will still be happy with.'},
 {id:'f11',for:['num','script','dirs'],text:'Kannada numerals have their own glyphs: ೧ ೨ ೩ (1 2 3). Older road signs in Mysuru show both sets.'},
 {id:'f12',for:['laziness','gadts','effects'],text:'Bang patterns and `seq` only force to weak head normal form. `deepseq` (NFData) is what forces a whole structure.'}
];
const FM: Record<string, Find> = Object.fromEntries(FINDS.map((f) => [f.id, f]))

/* ---------- state ---------- */
function initialState(): V2State {
  const d = 12
  const mk = (id: string, x: number, y: number, stage: number, lw: number, extra?: Partial<V2Crop>): V2Crop =>
    Object.assign({ id, x, y, stage, lw, wilted: false, per: false }, extra)
  return {
    v: 2, day: d, energy: 90, energyMax: 90, coins: 140, barrel: 2, seedSel: null,
    compost: ['rl', 'gc'], cleared: {}, unlocked: [], volunteers: [], foraged: [], focus: {},
    cam: { ...CAM_HOME },
    crops: [
      mk('stm', 5, 5, 2, d - 2), mk('bracket', 6, 5, 4, d - 1, { per: true }), mk('leaks', 5, 6, 4, d), mk('gc', 7, 7, 1, d - 4, { wilted: true }), mk('laziness', 7, 5, 4, d - 2, { per: true }),
      mk('con', 12, 5, 0, d - 1), mk('bp', 13, 6, 3, d - 4), mk('rl', 12, 7, 1, d - 5, { wilted: true }), mk('cap', 14, 5, 3, d - 5, { per: true }),
      mk('mvcc', 5, 12, 4, d - 3, { per: true }), mk('k8s', 6, 13, 2, d), mk('tcp', 7, 12, 4, d - 6, { per: true }),
      mk('food', 12, 12, 4, d), mk('water', 13, 13, 1, d - 2), mk('num', 14, 12, 4, d - 6, { per: true }),
    ],
    farmer: { x: 9, y: 8, tx: 9, ty: 8 },
  }
}

/* Saves and imported files are untrusted: keep what is usable, drop the rest, never throw. */
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const finite = (v: unknown, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback)
const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string') : [])
const knownSeeds = (v: unknown): string[] => strings(v).filter((id) => T[id])
const isFieldKey = (v: unknown): v is FieldKey => FIELD_KEYS.some((k) => k === v)

function readCrop(raw: unknown): V2Crop | null {
  if (!isRecord(raw) || typeof raw.id !== 'string' || !T[raw.id]) return null
  const stage = Math.round(finite(raw.stage, 0))
  return {
    id: raw.id, x: finite(raw.x, 0), y: finite(raw.y, 0), stage: Math.max(0, Math.min(4, stage)),
    lw: finite(raw.lw, 0), wilted: raw.wilted === true, per: raw.per === true,
  }
}

/** Turn parsed JSON into a farm, or null if it is not a Permaculture v2 farm. */
function readV2(value: unknown): V2State | null {
  if (!isRecord(value) || value.v !== 2 || !Array.isArray(value.crops) || !isRecord(value.farmer)) return null
  const base = initialState()
  const cleared: V2State['cleared'] = {}
  if (isRecord(value.cleared)) {
    for (const [k, f] of Object.entries(value.cleared)) if (/^\d+,\d+$/.test(k) && (f === 'grass' || isFieldKey(f))) cleared[k] = f
  }
  const focus: V2State['focus'] = {}
  if (isRecord(value.focus)) {
    for (const [k, b] of Object.entries(value.focus)) if (b === null || b === 0 || b === 1) focus[k] = b
  }
  const cam = isRecord(value.cam) ? { x: finite(value.cam.x, CAM_HOME.x), y: finite(value.cam.y, CAM_HOME.y) } : { ...CAM_HOME }
  const fm = value.farmer
  const energyMax = finite(value.energyMax, base.energyMax)
  const farmer = { x: finite(fm.x, 9), y: finite(fm.y, 8), tx: finite(fm.tx, 9), ty: finite(fm.ty, 8) }
  const crops: V2Crop[] = []
  for (const raw of value.crops) {
    const c = readCrop(raw)
    if (c) crops.push(c)
  }
  return {
    v: 2, day: finite(value.day, base.day), energy: finite(value.energy, energyMax), energyMax: energyMax > 0 ? energyMax : base.energyMax,
    coins: finite(value.coins, base.coins), barrel: finite(value.barrel, 0),
    seedSel: typeof value.seedSel === 'string' && T[value.seedSel] ? value.seedSel : null,
    compost: knownSeeds(value.compost), cleared, unlocked: knownSeeds(value.unlocked), volunteers: knownSeeds(value.volunteers),
    foraged: strings(value.foraged).filter((id) => FM[id]), focus, cam, crops, farmer,
  }
}

function load(): V2State {
  let raw: string | null = null
  try { raw = localStorage.getItem('permaculture-v2') } catch { raw = null }
  if (raw === null) return initialState()
  try {
    const s = readV2(JSON.parse(raw))
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
const key = (x: number, y: number): string => x + ',' + y
const cropAt = (x: number, y: number): V2Crop | undefined => S.crops.find((c) => c.x === x && c.y === y)
const rootedIds = (): Set<string> => new Set(S.crops.filter((c) => c.per).map((c) => c.id))
function available(tp: Topic): boolean {
  if (tp.wild && !S.volunteers.includes(tp.id)) return false
  if (S.unlocked.includes(tp.id)) return true
  const r = rootedIds()
  return !(tp.needs || []).some((n) => !r.has(n))
}
function visible(tp: Topic): boolean { return !tp.wild || S.volunteers.includes(tp.id) }
function baseField(x: number, y: number): FieldKey | null {
  for (const k of FIELD_KEYS) {
    const f = FIELDS[k]
    if (x >= f.x0 && x <= f.x0 + 2 && y >= f.y0 && y <= f.y0 + 2) return k
  }
  return null
}
function fieldOf(x: number, y: number): FieldKey | null {
  const c = S.cleared[key(x, y)]
  if (c && c !== 'grass') return c
  return baseField(x, y)
}
const inHome = (x: number, y: number): boolean => x >= HOME.x0 && x <= HOME.x1 && y >= HOME.y0 && y <= HOME.y1
type Terrain = 'soil' | 'grass' | 'path' | 'wild'
function terrain(x: number, y: number): Terrain {
  if (fieldOf(x, y)) return 'soil'
  if (S.cleared[key(x, y)] === 'grass') return 'grass'
  if (inHome(x, y)) {
    if (x === 9 || x === 10 || y === 9 || y === 10) return 'path'
    return 'grass'
  }
  return 'wild'
}
function wildKind(x: number, y: number): 'tree' | 'bush' | 'rock' | 'grass' {
  const v = hash(x, y, 1)
  return v > 0.42 ? 'tree' : v > 0.27 ? 'bush' : v > 0.19 ? 'rock' : 'grass'
}
const nameOf = (id: string): string => T[id]?.name ?? id
const needsText = (tp: Topic): string => (tp.needs || []).map(nameOf).join(' + ')

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
  const cx=sx,cy=sy+12;const tp=T[c.id];if(!tp)return;const F=FIELDS[tp.f];
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
gcv.width = 672
gcv.height = 360
const gctx = context2d(gcv)
function buildStatics(): void {
  statics = []
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const k = key(x, y)
    const tr = terrain(x, y)
    if (tr === 'wild') {
      const kind = wildKind(x, y)
      if (kind === 'tree') statics.push({ s: x + y, kind: 'forest', d: () => { const p = iso(x, y); drawTree(p.sx, p.sy, hash(x, y, 2)) } })
      else if (kind === 'bush') statics.push({ s: x + y, kind: 'forest', d: () => { const p = iso(x, y); drawBush(p.sx, p.sy) } })
      else if (kind === 'rock') statics.push({ s: x + y, d: () => { const p = iso(x, y); drawRock(p.sx, p.sy) } })
      else statics.push({ s: x + y, d: () => { const p = iso(x, y); drawTuft(p.sx, p.sy, x, y) } })
    } else if (tr === 'grass' && inHome(x, y) && (x === HOME.x0 || x === HOME.x1 || y === HOME.y0 || y === HOME.y1) && !BLOCKED.has(k) && hash(x, y, 1) > 0.55) {
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
  g.clearRect(0, 0, gcv.width, gcv.height)
  const ox = 336, oy = 8
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
  ctx.drawImage(gcv, Math.round(S.cam.x - 336), Math.round(S.cam.y - 8))
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
function clampCam(): void { S.cam.x = Math.max(-80, Math.min(560, S.cam.x)); S.cam.y = Math.max(-220, Math.min(260, S.cam.y)) }
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
$('bHome').addEventListener('click', () => { S.cam = { ...CAM_HOME }; save() })

/* ---------- actions ---------- */
function onCrop(c: V2Crop): void {
  const tp = T[c.id]
  if (!tp) return
  if (c.wilted || thirsty(c)) { if (S.energy < 6) return toast('Out of energy. Sleep to start a new day.'); return ask(tp, c, 'water') }
  if (ripe(c)) { if (S.energy < 15) return toast('Harvest takes 15 energy. Sleep first.'); return ask(tp, c, 'harvest') }
  if (c.per) return toast(tp.name + ' is rooted (perennial). Next check-in on day ' + due(c) + '.')
  toast(tp.name + ' · stage ' + (c.stage + 1) + '/5 · ' + zone(c) + ' · thirsty again on day ' + due(c) + '.')
}
function neighbourField(x: number, y: number): FieldKey | null {
  for (const [nx, ny] of [[x, y - 1], [x - 1, y], [x + 1, y], [x, y + 1]] as const) {
    const f = fieldOf(nx, ny)
    if (f) return f
  }
  return null
}
function onTile(x: number, y: number): void {
  const tr = terrain(x, y)
  const k = key(x, y)
  if (tr === 'soil') {
    if (cropAt(x, y)) return
    walkTo(x, y)
    const sel = S.seedSel
    if (!sel) return toast('Empty soil. Pick a seed from the barn (or Seed bag) first.')
    const tp = T[sel]
    if (!tp) { S.seedSel = null; return }
    const fk = fieldOf(x, y)
    if (tp.f !== fk) return toast(tp.name + ' belongs in the ' + FIELDS[tp.f].name + ' field.')
    if (S.energy < 10 || S.coins < 10) return toast('Planting needs 10 energy and 10 coins.')
    S.energy -= 10; S.coins -= 10
    S.crops.push({ id: tp.id, x, y, stage: 0, lw: S.day, wilted: false, per: false })
    S.seedSel = null
    hint('Planted <b>' + esc(tp.name) + '</b>. It will be thirsty tomorrow. Tap it then and answer to make it grow.')
    hud()
    toast('Planted ' + tp.name + '.')
    return
  }
  if (tr === 'path' || BLOCKED.has(k)) return
  const nf = neighbourField(x, y)
  if (nf) {
    walkTo(x, y)
    const F = FIELDS[nf]
    const cost = tr === 'wild' ? 40 : 25
    open('<div><span class="chip" style="--c:' + F.color + '">' + esc(F.name) + '</span></div><h2>' + (tr === 'wild' ? 'Clear and fence' : 'Fence it in') + '</h2><p>' + (tr === 'wild' ? 'Fell the trees and ' : '') + 'Add this tile to the ' + esc(F.name) + ' field. Fields grow one tile at a time, in any shape.</p><p class="sub">Costs ' + cost + ' coins. You have ' + S.coins + '.</p>' +
      foot('Add to ' + F.name + ' · ' + cost + ' coins', '<button type="button" data-act="close">Not now</button>'))
    const b = primary()
    if (b) { b.dataset.act = 'expand'; b.dataset.arg = k + '|' + nf + '|' + cost }
    return
  }
  if (tr === 'wild') {
    const kind = wildKind(x, y)
    if (kind === 'tree' || kind === 'bush') return openForage(x, y)
    return toast('Wilderness. Forage in the trees, or fence in land next to a field.')
  }
  toast('Open ground. Land next to a field can be fenced in.')
}

interface Asking { tp: Topic; c: V2Crop | null; mode: Mode; opts: { txt: string; ok: boolean }[]; Q: Question; cost: number }
let QC: Asking | null = null
function ask(tp: Topic, c: V2Crop | null, mode: Mode): void {
  const F = FIELDS[tp.f]
  const bank = (mode !== 'water' && tp.h) ? tp.h : tp.q
  const Q = bank[Math.floor(Math.random() * bank.length)]
  if (!Q) return
  const opts = shuffle(Q.a.map((txt, i) => ({ txt, ok: i === 0 })))
  const title = mode === 'harvest' ? 'Harvest' : mode === 'testout' ? 'Jump the fence' : (c && c.wilted ? 'Revive' : 'Water')
  const cost = mode === 'harvest' ? 15 : mode === 'testout' ? 10 : 6
  QC = { tp, c, mode, opts, Q, cost }
  const sub = mode === 'testout' ? 'Prove you already know it. A clean answer unlocks the seed without its prerequisites.' : (esc(tp.layer) + ' layer · ' + (c ? zone(c) : '') + ' · ' + cost + ' energy' + (mode === 'harvest' ? ' · premium grade makes it perennial' : ''))
  open('<div><span class="chip" style="--c:' + F.color + '">' + esc(F.name) + '</span></div><h2>' + title + ' · ' + esc(tp.name) + '</h2><p class="sub">' + sub + '</p><p class="q">' + esc(Q.q) + '</p><div class="opts" id="opts">' + opts.map((o, i) => '<button type="button" data-act="opt" data-arg="' + i + '">' + esc(o.txt) + '</button>').join('') + '</div>')
}
function answer(i: number): void {
  if (!QC) return
  const { tp, c, mode, opts, Q, cost } = QC
  const chosen = opts[i]
  if (!chosen) return
  const ok = chosen.ok
  QC = null
  const optsEl = $('opts')
  ;[...optsEl.children].forEach((el, j) => {
    if (!(el instanceof HTMLButtonElement)) return
    el.disabled = true
    if (opts[j]?.ok) el.classList.add('ok')
    else if (j === i) el.classList.add('bad')
  })
  S.energy -= cost
  let msg: string
  if (mode === 'testout') {
    if (ok) { S.unlocked.push(tp.id); msg = '<b>Over the fence.</b> ' + esc(tp.name) + ' is unlocked. Plant it from the seed bag.' }
    else msg = '<b>Not yet.</b> ' + esc(tp.name) + ' stays locked. Root its prerequisites, or try again tomorrow.'
  } else if (!c) {
    msg = ''
  } else if (mode === 'harvest') {
    if (ok) { S.coins += 30; c.per = true; c.lw = S.day; msg = '<b>Premium grade.</b> +30 coins. ' + esc(tp.name) + ' is now a perennial: rooted, it only needs a check-in every 10 days. Seeds that needed it are now unlocked.' }
    else { c.stage = 2; c.lw = S.day; if (!S.compost.includes(c.id)) S.compost.push(c.id); msg = '<b>Seconds.</b> Composted. ' + esc(tp.name) + ' drops back to stage 3 and goes in the review heap.' }
  } else if (ok) {
    c.wilted = false; c.stage = Math.min(4, c.stage + 1); c.lw = S.day; S.compost = S.compost.filter((x) => x !== c.id)
    msg = '<b>Watered.</b> ' + esc(tp.name) + ' grows to stage ' + (c.stage + 1) + '/5. Next watering on day ' + due(c) + ' (' + zone(c) + ').'
  } else {
    c.wilted = true; c.stage = Math.max(0, c.stage - 1); c.lw = S.day; if (!S.compost.includes(c.id)) S.compost.push(c.id)
    msg = '<b>Wilted.</b> ' + esc(tp.name) + ' drops a stage and goes in the compost heap. Revive it tomorrow.'
  }
  hud()
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
  const [k, f, cost] = arg.split('|')
  const c = Number(cost)
  if (!k || !isFieldKey(f) || !Number.isFinite(c)) return
  if (S.coins < c) return toast('Not enough coins. Harvest something first.')
  S.coins -= c
  S.cleared[k] = f
  buildStatics()
  hud()
  close()
  toast('Fenced in. The ' + FIELDS[f].name + ' field grew.')
}

function openBag(): void {
  const planted = new Set(S.crops.map((c) => c.id))
  const rooted = rootedIds()
  let html = '<h2>Seed bag</h2><p class="sub">Each seed is a topic. Plant it in its own field, water it by answering, harvest it to make it perennial. 10 energy + 10 coins to plant.</p>'
  for (const k of FIELD_KEYS) {
    const F = FIELDS[k]
    const focus = S.focus[k]
    html += '<div class="fh"><i style="background:' + F.color + '"></i>' + esc(F.name) + (focus != null ? ' <span class="sub">· focus: ' + esc(F.branches[focus]) + '</span>' : '') + '</div><div>'
    const list = TOPICS.filter((t) => t.f === k && visible(t)).sort((a, b) => (Number(b.b === focus) - Number(a.b === focus)) || a.tier - b.tier)
    for (const tp of list) {
      const locked = !available(tp)
      if (planted.has(tp.id)) html += '<div class="row"><div class="n">' + esc(tp.name) + '<small>' + esc(tp.layer) + ' · in the ground</small></div><span class="sub">' + (rooted.has(tp.id) ? 'rooted' : 'growing') + '</span></div>'
      else if (locked) html += '<div class="row locked"><div class="n">' + esc(tp.name) + '<small>' + esc(tp.layer) + ' · locked</small></div><span class="sub">needs ' + esc(needsText(tp)) + '</span></div>'
      else html += '<div class="row"><div class="n">' + esc(tp.name) + '<small>' + esc(tp.layer) + (tp.b === focus ? ' · focus' : '') + '</small></div><button type="button" data-act="seed" data-arg="' + tp.id + '"' + (S.seedSel === tp.id ? ' class="pri"' : '') + '>' + (S.seedSel === tp.id ? 'Selected' : 'Select') + '</button></div>'
    }
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
  const next = readV2(obj)
  if (!next) return toast('That file is not a Permaculture farm (format v2).')
  S = next
  buildStatics()
  hud()
  close()
  toast('Farm imported. Day ' + S.day + '.')
}
function openWell(): void { open('<h2>Rain barrel</h2><p>' + S.barrel + ' of 5 days stored.</p><p class="sub">Catch and store energy. End a day with 30+ energy left and the barrel fills by one. When a crop is about to wilt, the barrel spends a day to keep it alive. It never grows a crop; only you do.</p>' + foot()) }
function openCompost(): void {
  const items = S.compost.map((id) => T[id]).filter((tp): tp is Topic => tp !== undefined)
  open('<h2>Compost heap</h2><p class="sub">Produce no waste. A failed answer is not lost; it is the next thing to review.</p><div>' + (items.length ? items.map((tp) => '<div class="row"><div class="n">' + esc(tp.name) + '<small>' + esc(FIELDS[tp.f].name) + ' · tap the crop to revive it</small></div></div>').join('') : '<p>Empty. Nothing failed recently.</p>') + '</div>' + foot())
}

function openForage(x: number, y: number): void {
  const growing = new Set(S.crops.filter((c) => !c.per).map((c) => c.id))
  const planted = new Set(S.crops.map((c) => c.id))
  let cands = FINDS.filter((f) => f.for.some((id) => growing.has(id)) && !S.foraged.includes(f.id))
  if (!cands.length) cands = FINDS.filter((f) => f.for.some((id) => planted.has(id)) && !S.foraged.includes(f.id))
  if (!cands.length) cands = FINDS.filter((f) => !S.foraged.includes(f.id))
  const fd = cands[Math.floor(hash(x, y, S.day) * cands.length)]
  if (!fd) return toast('The forest is quiet today. Plant something new and come back.')
  const link = fd.for.map(nameOf).join(', ')
  open('<div><span class="chip" style="--c:#4F8F3C">Zone 5 · wilderness</span></div><h2>Wild find</h2><p class="sub">Observe and interact. Nothing here counts toward readiness; it widens the edge of what you are growing. Related to: ' + esc(link) + '.</p><div class="find">' + esc(fd.text) + '</div>' +
    foot('Forage · 5 energy', '<button type="button" data-act="close">Leave it</button>'))
  const b = primary()
  if (b) { b.dataset.act = 'forage'; b.dataset.arg = fd.id }
}
function forage(id: string): void {
  const fd = FM[id]
  if (!fd) return
  if (S.energy < 5) return toast('Out of energy. Sleep first.')
  S.energy -= 5; S.coins += 3; S.foraged.push(id)
  hud()
  let html = '<h2>Foraged</h2><p>+3 coins. Noted in your field journal.</p>'
  const wild = fd.seed && !S.volunteers.includes(fd.seed) ? T[fd.seed] : undefined
  if (wild) {
    html += '<p>This one could be domesticated: <b>' + esc(wild.name) + '</b> would become a volunteer seed in the ' + esc(FIELDS[wild.f].name) + ' field (needs ' + esc(needsText(wild)) + ').</p>' + foot('Domesticate ' + wild.name, '<button type="button" data-act="close">Leave it wild</button>')
    open(html)
    const b = primary()
    if (b) { b.dataset.act = 'domesticate'; b.dataset.arg = wild.id }
  } else {
    open(html + foot('Back to the farm'))
  }
}
function domesticate(id: string): void {
  S.volunteers.push(id)
  save()
  close()
  toast(nameOf(id) + ' added to your seed bag as a volunteer.')
}

/* ---------- learning tree ---------- */
let treeField: FieldKey = 'hs'
function splitName(n: string): string[] {
  if (n.length <= 13) return [n]
  const i = n.lastIndexOf(' ', Math.ceil(n.length / 2) + 2)
  return i > 0 ? [n.slice(0, i), n.slice(i + 1)] : [n]
}
function treeSvg(k: FieldKey): string {
  const F = FIELDS[k]
  const rooted = rootedIds()
  const planted = new Set(S.crops.map((c) => c.id))
  const nodes = TOPICS.filter((t) => t.f === k && visible(t))
  const colW = 240, W2 = 480
  const tiers = Math.max(...nodes.map((n) => n.tier)) + 1
  const Hh = 46 + tiers * 72
  const pos: Record<string, { x: number; y: number }> = {}
  for (let b = 0; b < 2; b++) for (let t = 0; t < tiers; t++) {
    const row = nodes.filter((n) => n.b === b && n.tier === t)
    row.forEach((n, i) => { pos[n.id] = { x: b * colW + (i + 0.5) * colW / row.length, y: 46 + t * 72 } })
  }
  let s = '<svg class="tree" width="' + W2 + '" height="' + Hh + '" viewBox="0 0 ' + W2 + ' ' + Hh + '" style="aspect-ratio:' + W2 + '/' + Hh + ';flex:none" role="img" aria-label="Learning tree for ' + esc(F.name) + '">'
  s += '<text x="' + (colW / 2) + '" y="22" text-anchor="middle" fill="#C6B48E" font-size="12" font-family="DM Sans,system-ui">' + esc(F.branches[0]) + (S.focus[k] === 0 ? ' · focus' : '') + '</text><text x="' + (colW * 1.5) + '" y="22" text-anchor="middle" fill="#C6B48E" font-size="12" font-family="DM Sans,system-ui">' + esc(F.branches[1]) + (S.focus[k] === 1 ? ' · focus' : '') + '</text><line x1="' + colW + '" y1="8" x2="' + colW + '" y2="' + (Hh - 8) + '" stroke="#3B3020" stroke-dasharray="3 4"/>'
  for (const n of nodes) for (const need of (n.needs || [])) {
    const a = pos[need], b = pos[n.id]
    if (!a || !b) continue
    const ok = rooted.has(need)
    s += '<path d="M' + a.x + ' ' + (a.y + 18) + ' C ' + a.x + ' ' + (a.y + 48) + ', ' + b.x + ' ' + (b.y - 48) + ', ' + b.x + ' ' + (b.y - 18) + '" fill="none" stroke="' + (ok ? F.color : '#5C4A2E') + '" stroke-width="2"' + (ok ? '' : ' stroke-dasharray="4 4"') + '/>'
  }
  for (const n of nodes) {
    const p = pos[n.id]
    if (!p) continue
    const st = rooted.has(n.id) ? 'rooted' : planted.has(n.id) ? 'growing' : available(n) ? 'ready' : 'locked'
    const fill = st === 'rooted' ? F.color : '#3B3020'
    const stroke = st === 'rooted' ? F.color : st === 'growing' ? F.color : st === 'ready' ? '#F4EAD0' : '#5C4A2E'
    const tc = st === 'rooted' ? '#10200C' : st === 'locked' ? '#8F7F60' : '#F4EAD0'
    s += '<rect x="' + (p.x - 50) + '" y="' + (p.y - 18) + '" width="100" height="36" rx="6" fill="' + fill + '" stroke="' + stroke + '" stroke-width="2"' + (st === 'locked' ? ' stroke-dasharray="4 3"' : '') + '/>'
    const ls = splitName(n.name)
    ls.forEach((l, i) => { s += '<text x="' + p.x + '" y="' + (p.y + (ls.length === 1 ? 4 : (i === 0 ? -1 : 11))) + '" text-anchor="middle" fill="' + tc + '" font-size="10.5" font-weight="600" font-family="DM Sans,system-ui">' + esc(l) + '</text>' })
    if (st === 'growing') {
      const c = S.crops.find((cc) => cc.id === n.id)
      if (c) s += '<rect x="' + (p.x - 50) + '" y="' + (p.y + 14) + '" width="' + (100 * (c.stage + 1) / 5) + '" height="4" rx="2" fill="' + F.color + '"/>'
    }
    if (n.wild) s += '<circle cx="' + (p.x + 44) + '" cy="' + (p.y - 12) + '" r="4" fill="#4F8F3C"/>'
  }
  return s + '</svg>'
}
function openTree(): void {
  const k = treeField
  const F = FIELDS[k]
  const locked = TOPICS.filter((t) => t.f === k && visible(t) && !available(t) && !S.crops.some((c) => c.id === t.id))
  let html = '<h2>Learning tree</h2><p class="sub">Everything you could grow, including what you cannot reach yet. A seed unlocks when the seeds it needs are <b>rooted</b> (harvested to perennial). Pick a branch to focus; the seed bag puts it first.</p>'
  html += '<div class="tabs">' + FIELD_KEYS.map((f) => '<button type="button" data-act="treeTab" data-arg="' + f + '"' + (f === k ? ' class="on"' : '') + '><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:' + FIELDS[f].color + ';margin-right:6px;vertical-align:-1px"></span>' + esc(FIELDS[f].name) + '</button>').join('') + '</div>'
  html += treeSvg(k)
  html += '<div class="branches">' + F.branches.map((b, i) => '<button type="button" data-act="focus" data-arg="' + k + '|' + i + '"' + (S.focus[k] === i ? ' class="pri"' : '') + '>' + (S.focus[k] === i ? 'Focus: ' : 'Focus on ') + esc(b) + '</button>').join('') + '</div>'
  html += '<p class="sub">Solid box: rooted · outline: growing (bar = stage) · cream outline: ready to plant · dashed: locked · green dot: found in the wild.</p>'
  if (locked.length) html += '<h3>Jump the fence</h3><p class="sub">Already know one of these? Prove it on a harvest-grade question (10 energy) and it unlocks without its prerequisites.</p><div>' + locked.map((t) => '<div class="row"><div class="n">' + esc(t.name) + '<small>needs ' + esc(needsText(t)) + '</small></div><button type="button" data-act="testout" data-arg="' + t.id + '">Test out</button></div>').join('') + '</div>'
  html += foot()
  open(html)
}

/* ---------- almanac ---------- */
function openAlmanac(): void {
  open('<h2>Almanac</h2><p class="sub">The rules of this farm, as they stand today. Everything here is in the game right now.</p>' +
    '<h3>The loop</h3><ul><li><b>Seeds are topics.</b> Plant one in its field: 10 energy, 10 coins. It sprouts at stage 1 of 5.</li><li><b>Water = answer.</b> A thirsty crop shows a droplet. Tap it and answer one question (6 energy). Right: it grows a stage. Wrong: it wilts, drops a stage, and goes in the compost heap.</li><li><b>Harvest = prove it.</b> A stage-5 crop sparkles. Answer a harder question (15 energy). Premium: +30 coins and the crop becomes a <b>perennial tree</b>, rooted for good. Seconds: composted, back to stage 3.</li></ul>' +
    '<h3>Thirst and zones</h3><ul><li>After watering, a crop is thirsty again after 1, 2, 3, 4 or 5 days depending on its stage (Z1 daily, out to Z4). Perennials ask for a check-in every 10 days.</li><li>Two days past thirsty without water: it wilts overnight, unless the rain barrel saves it.</li><li>This is spaced repetition. The map is your retention: inner zones should be small, outer zones full.</li></ul>' +
    '<h3>Energy and the rain barrel</h3><ul><li>90 energy a day. Sleep restores it.</li><li>End a day with 30+ energy left and the barrel stores one day (max 5). It spends a day automatically to stop a crop from wilting.</li></ul>' +
    '<h3>Land</h3><ul><li>Drag to pan. The homestead has four fields; everything beyond is wilderness.</li><li>Tap land next to a field to fence it in: 25 coins for open ground, 40 to clear forest. Fields grow one tile at a time, any shape.</li></ul>' +
    '<h3>Wilderness (Zone 5)</h3><ul><li>Tap trees to forage a <b>wild find</b>: a fact next to what you are growing. 5 energy, +3 coins, no readiness credit.</li><li>Some finds can be <b>domesticated</b> into volunteer seeds that appear in your seed bag.</li></ul>' +
    '<h3>Learning tree</h3><ul><li>Every seed, including locked ones, is on the tree. A seed unlocks when what it needs is rooted.</li><li>Pick a branch to focus; the seed bag puts it first. Or jump the fence: pass a harvest-grade question to unlock a seed early.</li></ul>' +
    '<h3>Buildings</h3><ul><li><b>Barn</b>: seed bag. <b>Well</b>: rain barrel. <b>Compost heap</b>: what to review. <b>Signpost</b>: this almanac.</li></ul>' +
    '<h3>Not here yet</h3><p class="sub">Guilds, layers as terraces, real weather from Coorg, the rival farm, the Sunday walk, the market, the workshop, judged write-ups and timed solves, your own notes on each crop, pack import, the village.</p>' + foot())
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
  else if (act === 'seed') {
    const tp = T[arg]
    if (!tp) return
    S.seedSel = arg
    hint('Seed in hand: <b>' + esc(tp.name) + '</b>. Tap an empty soil tile in the <b>' + esc(FIELDS[tp.f].name) + '</b> field to plant it.')
    save()
    close()
  } else if (act === 'reset') { S = initialState(); buildStatics(); hud(); close(); toast('Farm reset to day 12.') }
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
  else if (act === 'treeTab') { if (isFieldKey(arg)) { treeField = arg; openTree() } }
  else if (act === 'focus') {
    const [k, i] = arg.split('|')
    if (!k) return
    const branch = Number(i)
    S.focus[k] = S.focus[k] === branch ? null : branch
    save()
    openTree()
  } else if (act === 'testout') {
    const tp = T[arg]
    if (!tp) return
    if (S.energy < 10) return toast('Needs 10 energy. Sleep first.')
    ask(tp, null, 'testout')
  }
})
byId('bBag').addEventListener('click', openBag)
byId('bTree').addEventListener('click', openTree)
byId('bAlm').addEventListener('click', openAlmanac)
byId('bSleep').addEventListener('click', sleep)
hud()
if (loadFailed) toast('Your saved farm could not be read. Starting a fresh one.')
