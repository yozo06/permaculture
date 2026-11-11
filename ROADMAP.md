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
| 2 | **Neighbours**: farms you can see and rain you can send, with no server | In progress |
| 3 | **Your own AI key** (optional): judged harvests, a pack forge, fresh wild finds | Next |
| 4 | **Art**: sprite sheets, a faster renderer, terraces, weather | Later (small steps can land any time) |
| 5 | **The village server**: pictures that can be withdrawn, rain that arrives by itself | When players need it |

## The plan, phase by phase

### Phase 2 — Neighbours (now)

The full design is [`docs/neighbours.md`](docs/neighbours.md).

1. **Safe saves.** Before anyone else has a farm, make sure a later edit to a pack or a rule cannot quietly damage it: a lock on every id a saved farm depends on, a played farm that must always replay, a warning when a farm's history no longer fits, and no farm lost to one number.
2. **See.** Name your farm. Make a **farm link** that carries a picture of your farm inside the link itself, for the fields you choose. A friend taps it, lands on your farm, looks around, and starts their own next door, picking the fields they want. A gate on the map opens your list of neighbours.
3. *A first week of beta with a handful of people.*
4. **Do.** Visit a neighbour, answer one card about something they grow, and send them **rain**: a day in their rain barrel, and the crop remembers who came by. It never grows a crop for them.

### Phase 3 — Your own AI key (optional, never required)

- **Judged harvests**: a write-up graded line by line against the seed's rubric, and you can dispute any line.
- **Apply**: a new rung on the ladder — a problem, a design, a debugging session.
- **Pack forge**: paste a syllabus or three job descriptions and get a draft pack that passes the validator.
- **Fresh wild finds** next to what you are growing.

The key is yours, kept only in your browser, and calls go straight from your browser to the provider. A local model works. Nobody pays for anyone else's farm.

### Phase 4 — Art

Today every tile, crop and building is drawn by code, as small rectangles on a 480×300 canvas. That keeps the game tiny and fast, but every crop of a stage looks alike, there is no zoom, and one season.

In order, each step shipping by itself:

1. **Readable at a glance** (no new technology; can land any time). Crops drawn by their **layer**, so a canopy seed grows tall, a vine climbs a pole, a root shows as a mound and ground cover spreads low: the map then says what *kind* of knowledge sits where. A sign and a colour for each field. Small moments: a splash when you water, a pop when a crop grows, rain falling when a neighbour sends it. Fonts served by the game itself.
2. **Sprite sheets.** One consistent pixel-art tileset replaces the code-drawn shapes: growth animations, day and night, seasons. Art becomes a file anyone can contribute, the way a pack is.
3. **A faster renderer** (PixiJS): zoom, smooth panning, particles, and worlds much larger than one screen at 60 frames a second on a phone.
4. **Layers as terraces.** A field's seven layers drawn up a hillside, so a hollow layer is visible from across the map.
5. **Weather.** Real weather drives the sky.

### Phase 5 — The village server

A small server that holds the same farm pictures and delivers the same rain, so a published picture can be withdrawn and rain arrives without sending a link. It is deliberately last: everything before it works without one.

### Further out

In the design, marked *(planned)*, and not scheduled: readiness per field and the market that opens when every field is at its bar; the rival, who is last-month-you; the Sunday walk; guild bonuses; seeds on the edge of two fields; trees that drop saplings; loading your own pack in the browser; merging one farm across devices.

## Where you can help

| If you… | The most useful thing | Start at |
|---|---|---|
| want to learn something | Play for a week and tell us what felt like a game and what felt like a quiz wearing a hat | the README, then an Issue or a Discussion |
| know a subject well | Write a pack for a goal of your own, or sharpen the questions in one that exists. No code | [`docs/pack-format.md`](docs/pack-format.md) |
| can draw pixel art | Phase 4, step 1 and 2: crop shapes by layer, buildings, a tileset | open a Discussion with a sketch first |
| write TypeScript | A seed from the roadmap pack, a bug, or a *(planned)* mechanic from the design | [`docs/code-tour.md`](docs/code-tour.md), [`CONTRIBUTING.md`](CONTRIBUTING.md) |
| care about accessibility | The game has had no full accessibility pass yet: contrast, keyboard play, screen readers | an Issue |

## How things get decided

- **The design comes first.** A new mechanic is written down in `docs/` and agreed before it is built.
- **The roadmap is a pack.** [`packs/workshop.yaml`](packs/workshop.yaml) holds the backlog as seeds, with what each one needs; you can grow it in the game.
- **Small steps.** One concern per pull request, the game playable after every one, and three checks green: `npm run validate`, `npm test`, `npm run build`.
- **Saved farms are sacred.** A farm is replayed against today's packs and rules, so ids are permanent and a change to a rule says how saved farms will replay.

## Licence

Code is MIT. Packs and other content are CC-BY-SA 4.0.
