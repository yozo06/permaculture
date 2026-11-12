# A tour of the code

One page for someone opening this repo for the first time: what the parts are, how a tap becomes a saved farm, and where to make a change. The rules of the game itself are in `design.md`.

## Three parts

| Part | What it is | The rule it keeps |
|---|---|---|
| `packs/` | Data. One YAML file per goal: its seeds, questions, sources and wild finds. | A released id is never renamed or removed. Saved farms refer to seeds by id. |
| `src/engine/` | The rules. Plain TypeScript. | Pure: no DOM, no clock, no randomness. The same log always gives the same farm. |
| `src/game/` | The screen: the canvas, the sheets, saving. | Nothing from a player or a pack reaches the page unescaped, and bad saved data never crashes the game. |

The engine does not know what any seed means. Adding a goal never touches engine code.

## How a pack reaches the game

1. `scripts/packs-lib.mjs` loads every `packs/*.yaml`, checks it against `packs/schema/pack.schema.json`, then checks what a schema cannot: references between seeds, prerequisite cycles, ids that are unique across all packs. `npm run validate` runs it from the command line.
2. `vite.config.ts` runs the same code at build time and serves the result as the module `virtual:packs`. A broken pack fails the build with the validator's messages. In `npm run dev`, saving a pack reloads the page.
3. `src/engine/catalog.ts` turns the packs into a `Catalog`: seeds, finds and packs looked up by id, with every optional list filled in.

## A farm is a log

The player's farm is not saved as a picture of the farm. It is saved as the list of everything they did, and the farm is what you get by replaying that list.

- `types.ts` has `FarmEvent`, every kind of thing that can happen (planted, watered, harvested, slept, fenced…), and `FarmState`, what a farm is after them.
- `fold.ts` is the heart. `check(state, event)` says whether a player may do something now and, if not, gives a reason they can read. `apply(state, event)` returns the next state, or the very same state if a log may not hold the event there. `fold(events)` replays a whole log from nothing. `parseEvent` reads an event that could be anything, because a log comes from storage or from a file.
- `fold.ts` keeps two questions apart. `allowed` is what a log may hold, and it is all that replay asks. `check` asks that and a little more of what is done today: that a seed has been earned, and that it does not run two layers ahead of a hollow one. A rule that only holds back what a player starts belongs in the second, where it cannot change a saved farm.
- `readiness.ts` works out how ready a field is (its number, its hollow layers, its bar), what a seed is earned by, and which layer holds a seed back under layer balance. None of it is saved: it is worked out from the crops each time.
- `rules.ts` has `RULES`, every number the game plays by, and the small questions asked of a crop: `thirsty`, `ripe`, `available`.
- `ladder.ts` decides which kind of work a crop asks for at each stage: a recall card, an explanation, or a harvest.
- `land.ts` is the geometry: where fields sit, what kind of ground a tile is.
- `finds.ts` picks the wild find a tile gives on a day.
- `log.ts` is the export file. `v2.ts` reads saves from the Phase 0 prototype.
- `picture.ts` is what one farmer shows another: making a picture of a farm, reading one that could be anything, and laying it out as a farm the canvas can draw. It also works out a farm's code.

Because the farm is replayed with the packs and rules of today, changing a seed's id or a number in `RULES` changes every saved farm. That is why ids are permanent, and why a change to `RULES` should say so in its pull request.

Two tests stand guard over that. `scripts/lock.test.ts` compares the packs with `packs/lock.json` and fails on a change that would hurt a saved farm (an id gone, a seed whose needs changed); `npm run lock` records new ids. `src/engine/played-farm.test.ts` replays two farms that were played on purpose and committed as logs, and fails if today's rules refuse any of either or one ends somewhere else: a forty-day farm with every kind of event, and a small one that stands exactly on each limit (notes of exactly 40 characters, a night ending on exactly 30 energy). When a farm in a browser does stop fitting, the store counts the skipped entries and the game says so.

## From a tap to a saved farm

1. `game/game.ts` hears the tap, works out what was tapped (`pick`), and opens the right sheet: a card for a recall watering, a writing box for an explanation.
2. The answer becomes an event, and `act(event)` hands it to the store.
3. `game/store.ts` asks the engine to `check` it. If it is refused, the reason comes back and is shown as a toast. If it is allowed, the store applies it, adds it to the log with an id and a time, and saves the whole log in the browser under `permaculture-log`.
4. The canvas draws the new state on its next frame.

When the page loads, the store reads the log and folds it. If the log cannot be read, it is set aside under another key and a fresh farm starts with a message; nothing throws.

## The screen

- `game/game.ts`: drawing (the pixel helpers and sprites, `buildStatics`, `buildGround`, `frame`), input, and one click handler for every button in every sheet, keyed by `data-act`. It runs when imported and needs a browser, so it has no tests. Keep decisions out of it.
- `game/views.ts`: what to show, worked out from the farm and the packs with no DOM: the seed bag, the learning tree's layout, a crop's sheet, the morning's to-do, the readiness of each field. Tested.
- `game/sheets.ts`: HTML for the sheets, as strings in and strings out. Tested, including with hostile text.
- `game/almanac.ts`: the rules page, written from `RULES` so its numbers cannot drift.
- `game/links.ts`, `game/neighbours.ts`, `game/visit.ts`: farm links (the picture rides in the address after the `#`), the list of neighbours kept in the browser beside the farm, and what the neighbours sheets show. All three are pure and tested; `game.ts` only wires them up. While you visit a neighbour, `game.ts` draws their farm through `D()` and routes every tap away from your own. `docs/neighbours.md` is the design.
- `game/shapes.ts`, `game/moments.ts`: what a crop looks like (a short list of rectangles for each layer and stage) and the small moments that play on it (a splash, a ring, sparks). Pure and tested; `game.ts` only colours them and puts them on a tile. The Almanac's pictures are drawn from the same shapes.
- `game/util.ts`: `esc`, which every piece of player or pack text passes through, and `shuffle`.

## Tests

`npm test` runs all of them.

- `src/engine/*.test.ts`: each event's allowed path and each refusal. `fold.property.test.ts` plays long random games (80 to 300 moves each) and checks after every move that replaying the log gives the same farm and that energy and coins never go negative. It also feeds the engine events of any shape and checks that nothing throws.
- `src/engine/design-doc.test.ts`: the two tables in `docs/design.md` match `RULES` exactly.
- `scripts/catalogues.test.ts`: what the catalogues promise, such as every seed id from the Phase 0 farm still existing.
- `scripts/lock.test.ts` and `src/engine/played-farm.test.ts`: saved farms keep replaying (see above).
- `scripts/packs-lib.test.ts`: the validator catches what it should.
- `scripts/page.test.ts`: the page loads nothing from another site (the game carries its own fonts).
- `src/game/*.test.ts`: the views, the sheets, the store, the Almanac, the crop shapes and the moments.

## Where to change what

| To… | Change |
|---|---|
| add a seed, a question or a whole goal | a file in `packs/`. No code. See `pack-format.md`. |
| change a number | `RULES` in `src/engine/rules.ts`, and the same row in `docs/design.md`. A test fails until they agree. The Almanac follows by itself. |
| add a rule | a new event in `types.ts`; its shape in `parseEvent`, its check and its effect in `fold.ts`; tests in `fold.test.ts`; and teach `fold.property.test.ts` to play it. |
| hold back something a player may start, without touching saved farms | `whyToday` in `fold.ts`, which only `check` asks. Replay never does. |
| add something to the farm's state | `FarmState` in `types.ts`, then `initialState` and `copy` in `fold.ts`, and `fromV2` in `v2.ts`. |
| change what a sheet says | `game/sheets.ts` if it is built there, else `game/game.ts`. Put text from a player or a pack through `esc`. |
| show something worked out from the farm | a pure function in `game/views.ts`, with a test. |
| change how a crop looks | the list for its layer in `game/shapes.ts`. Its tests say what must stay true: a crop never looks smaller when it grows, and no two layers look alike. |
| change what a farm link holds | `engine/picture.ts`. Format 1 links must stay readable for good, so add a format rather than change one, and read `docs/neighbours.md` §6 first. |

## Checks

`npm run validate`, `npm test` and `npm run build` must all pass. CI runs the three on every pull request (`.github/workflows/validate.yml`), and again before each deploy of `main` to GitHub Pages (`pages.yml`).
