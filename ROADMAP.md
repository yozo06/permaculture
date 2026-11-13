# Permaculture — vision, mission and plan

One page on why this game exists, what it promises, what is built, what comes next, and where you can help. The rules of the game are in [`docs/design.md`](docs/design.md); this page is the map around them.

## Vision

Anyone working toward a long goal — a new job, a language, a craft — can see what they know as a living farm, keep it alive in a few minutes a day, and do it next to friends who are growing their own.

## Mission

Build a free and open game that turns learning into tending a farm:

- **honest about forgetting**: a topic you stop tending wilts, and the map shows it;
- **deep, not just wide**: a crop only becomes a tree when you can explain it and prove it, not when you have clicked the right answer four times;
- **yours**: the farm lives in your browser, with no account and nothing tracked;
- **open to any goal**: a goal is one text file, and anyone can write one.

## Promises

These hold in every phase. A change that breaks one is the wrong change.

| We will | We will not |
|---|---|
| Keep the game complete without AI, without an account and without paying anyone | Add leaderboards, or rank people in any way |
| Keep your farm on your own device, as a log you can export | Shame a missed day: there are no streaks |
| Show a neighbour only what you chose to show: never notes, wrong answers or a wilted crop | Track players or collect analytics |
| Keep every released seed working for farms that already grow it | Run a server before there are players who need one |
| Stay useful with plain graphics | Make art a requirement for playing |

## Where we are

| Phase | What | Status |
|---|---|---|
| 0 | A playable prototype, the design, the pack format, checks on every change | Done |
| 1 | The rules as their own tested engine; packs loaded from files; seven packs and 200+ seeds; the depth ladder (notes → recall → explain → harvest) | Done — version 0.1.0 |
| 2 | **Neighbours**: farms you can see and rain you can send, with no server | Seeing is built (version 0.2.0); rain is next |
| 3 | **Your own AI key** (optional): judged harvests, a pack forge, fresh wild finds | Next |
| 4 | **Art**: a farm you can read at a glance, then sprite sheets, a faster renderer, terraces, weather | First two steps built (versions 0.3.0 and 0.8.0): each layer has its own shape, and the farm is drawn from a sprite sheet, sharp and zoomable on phone and laptop |
| 5 | **The village server**: pictures that can be withdrawn, rain that arrives by itself | When players need it |
| any | **The rest of the rules**, which need no AI and no server: readiness, earned unlocks, then layer balance, guilds, edges, saplings, the market | Readiness and earned unlocks (version 0.4.0), layer balance (0.5.0), guilds, edges and saplings (0.6.0) and the market, the rival and the weekly walk (0.7.0) are built; a planner is next |

## The plan, phase by phase

### Phase 2 — Neighbours (now)

The full design is [`docs/neighbours.md`](docs/neighbours.md).

1. **Safe saves** *(done)*. Before anyone else has a farm, make sure a later edit to a pack or a rule cannot quietly damage it: a lock on every id a saved farm depends on, a played farm that must always replay, a warning when a farm's history no longer fits, and no farm lost to one number.
2. **See** *(done)*. Name your farm. Make a **farm link** that carries a picture of your farm inside the link itself, for the fields you choose. A friend taps it, lands on your farm, looks around, and starts their own next door, picking the fields they want. A gate on the map opens your list of neighbours.
3. *A first week of beta with a handful of people.*
4. **Do.** Visit a neighbour, answer one card about something they grow, and send them **rain**: a day in their rain barrel, and the crop remembers who came by. It never grows a crop for them.
5. **Trade.** Share a pack with a neighbour, the way you share a farm.

A link stays the only way to share until the village server: there is no store in between. So a sent link cannot be taken back, and a neighbour's game forgets a picture after 60 days.

### Phase 3 — Your own AI key (optional, never required)

- **Your key**: a settings page for it, a choice of provider, and a local model if you would rather. The game warns you before you save a key on a shared machine.
- **Judged harvests**: a write-up graded line by line against the seed's rubric, and you can dispute any line.
- **Apply**: a new rung on the ladder — a problem, a design, a debugging session.
- **Timed solves**: a problem against the clock, with tests that run.
- **Pack forge**: paste a syllabus or three job descriptions and get a draft pack that passes the validator.
- **Fresh wild finds** each day, next to what you are growing in Zone 1.
- **A gap audit** each quarter: paste three job descriptions, compare them with your catalogue, and get new wild seeds for what is missing.
- **A recruiter visit**: now and then, a surprise timed mock.

The key is yours, kept only in your browser, and calls go straight from your browser to the provider. A local model works. Nobody pays for anyone else's farm, and the game never passes on anyone's key. Grades differ between models, so they are never compared between players.

### Phase 4 — Art

Every tile, crop and building was first drawn by code, as small rectangles on a 480×300 canvas, with no zoom. Steps 1 and 2 below have replaced that.

In order, each step shipping by itself:

1. **Readable at a glance** *(done, version 0.3.0; no new technology)*. Crops are drawn by their **layer**: a canopy seed grows into a tall tree, an understory seed into a small pointed one, a shrub is a round bush, a herb a stalk, ground cover a flat mat, a root a mound of earth, and a vine climbs a pole. The map now says what *kind* of knowledge sits where. Each field flies a flag in its colour. Small moments: a splash when you water, a ring when a crop grows, sparks from a harvest. The game carries its own fonts, so the page asks no other site for anything. Still to come here: rain falling when a neighbour sends it, which arrives with rain itself.
2. **Sprite sheets** *(done, version 0.8.0)*. One pixel-art sheet, made for this game, replaces the code-drawn shapes: one palette, one direction of light, every crop of every layer at every stage, and a wilted look for each. Art is now a file anyone can change, the way a pack is: open the sheet in a pixel editor, or change the scripts in `art/` that drew it. The farm is drawn at the screen's own resolution, so it is sharp on a phone and on a laptop, and it zooms: pinch, or use the + and − buttons. Still to come here: growth as animation, day and night, seasons.
3. **A faster renderer** (PixiJS or Phaser): a camera, zoom, smooth panning, particles, and worlds much larger than one screen at 60 frames a second on a phone.
4. **Layers as terraces.** A field's seven layers drawn up a hillside, so a hollow layer is visible from across the map.
5. **Weather, sound and tools.** Real weather from Coorg drives the sky. The farm has sound. Tools you have earned stand on the farm as things you can see.
6. **A field drawn from real land.** A research field can be a scale copy of real plots, so coffee research happens on the coffee terrace.

The look to aim for is a farm you want to keep looking at, the way FarmVille and Township are. Art never blocks the loop: every step here is optional for playing.

### Phase 5 — The village server

A small server that holds the same farm pictures and delivers the same rain, so a published picture can be withdrawn and rain arrives without sending a link. It is deliberately last: everything before it works without one.

- **The store**: a free tier first (Supabase or Cloudflare), then a small server written in Haskell, for about $5 a month. The server is itself a seed in the Workshop.
- **Who you are**: a farm code first. A login only when something needs one, and then a GitHub login. Writes are rate-limited.
- **Together**: a weekly village harvest, which is a challenge the whole village works on, and a market square where neighbours who both choose to can stand their readiness side by side. It is never a ranking.

### The rest of the rules (any time: no AI, no server)

These are in the design, marked *(planned)* until they are built. They serve plant → water → harvest directly, so they come before more art.

1. **Readiness** *(done, version 0.4.0)*. Each field shows how much of it stands as trees, which of its layers are hollow, and the bar you set for it. There are no dates: a field is ready when it is at your bar with no layer hollow.
2. **Earned unlocks** *(done, version 0.4.0)*. A seed can ask for learning before it is planted. In the Workshop, a first real harvest earns sprite sheets, four seeds rooted in Kannada earn sharing a pack, and Infra at 60 earns live weather. The game's own backlog cannot outrun the studying. This is the guard against building the game instead of playing it. It is asked of what you do today and never of a saved farm, so no farm loses a crop to it.
3. **Layer balance** *(done, version 0.5.0)*. A field is built from the ground up and cannot run two layers ahead of a hollow one: a seed waits while a layer two or more beneath its own has no tree standing and has a seed you could plant today. The seed bag says where to begin. Like an earned seed, it is asked of what you do today and never of a saved farm.
4. **Guilds, edges and saplings** *(done, version 0.6.0)*. A guild is whole while every member stands as a tree, and a whole guild pays a few coins at each harvest and check-in of its members; a wilted member drags the rest, and the guild pays nothing until it is revived. A seed on the edge of two fields pays double at harvest once a tree is rooted in the field it borders. Harvesting a tree drops saplings, new seeds hidden until then, so depth keeps seeding itself; they are extras and never lower a field's readiness. What guilds and edges pay is part of a saved farm, so these rules only ever add: a farm played before them replays whole, with at least the coins it had.
5. **The market, the rival and the weekly walk** *(done, version 0.7.0)*. A buyer at the market is a named set of bars (a Haskell-first shop, fintech infrastructure, big-tech backend), and is buying while the farm meets every one. An offer is a sale: something real, recorded in your own words, that pays nothing. The rival is last-month-you: today beside the farm of thirty days ago, which you can walk round. Every seventh day is a walk day: the week that was and three questions, with no tasks. None of the three can change a saved farm.
6. **A planner.** It orders the day: reviews first, then prerequisites, layer balance, finishing guilds, each field's share of energy, and the two-seed cap last. If you do set a date, it scales how fast you plant, and says so when the date does not fit your energy.
7. **Tools.** Time-savers you earn: drip irrigation halves the cost of a review, a tractor speeds planting. They break after a week left idle.
8. **Fields for other kinds of goal.** Orchard crops for goals with no answer (reading, a habit): slow, paid for showing up, never quizzed. A research field harvested with real decisions and memos.
9. **Your farm in more places.** Loading your own pack in the browser; one farm merged across devices; installing the game like an app, with no app store; a backup you opt into.

## What slows us down, and the rules we keep

- **Content takes the hours, not code.** A seed is worth only as much as its questions. Questions are original, sources are cited and never pasted, and multiple choice is for recall only.
- **Browsers lose things.** A farm lives in one browser, and browsers get wiped. Export stays easy to find.
- **A farm shows what you do not know.** Sharing is something you choose, field by field, every time.
- **No paid dependency without talking about it first.**
- **Time is the scarcest thing.** Anything that does not serve plant → water → harvest waits.

## Where you can help

| If you… | The most useful thing | Start at |
|---|---|---|
| want to learn something | Play for a week and tell us what felt like a game and what felt like a quiz wearing a hat | the README, then an Issue or a Discussion |
| know a subject well | Write a pack for a goal of your own, or sharpen the questions in one that exists. No code | [`docs/pack-format.md`](docs/pack-format.md) |
| can draw pixel art | Improve a sprite: open `src/game/art/sheet.png` in a pixel editor, or change the script in `art/` that drew it (see `art/README.md`) | open a Discussion with a sketch first |
| write TypeScript | A seed from the roadmap pack, a bug, or one of the rest of the rules above | [`docs/code-tour.md`](docs/code-tour.md), [`CONTRIBUTING.md`](CONTRIBUTING.md) |
| care about accessibility | The game has had no full accessibility pass yet: contrast, keyboard play, screen readers | an Issue |

## How things get decided

- **The design comes first.** A new mechanic is written down in `docs/` and agreed before it is built.
- **The roadmap is a pack.** [`packs/workshop.yaml`](packs/workshop.yaml) holds the backlog as seeds, with what each one needs; you can grow it in the game.
- **Small steps.** One concern per pull request, the game playable after every one, and three checks green: `npm run validate`, `npm test`, `npm run build`.
- **Saved farms are sacred.** A farm is replayed against today's packs and rules, so ids are permanent and a change to a rule says how saved farms will replay.

## Licence

Code is MIT. Packs and other content are CC-BY-SA 4.0. The fonts the game carries are under the SIL Open Font License.
