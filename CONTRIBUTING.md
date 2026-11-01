# Contributing

Permaculture is a farm game where the crops are the things you are learning. You can contribute without writing any code: the most valuable thing in this repo is the packs.

## Play first

Open the live game (link in the README), play for a week, and tell us what felt like a game and what felt like a quiz wearing a hat. Open a Discussion for ideas and an Issue for bugs. Ideas that survive become seeds in `packs/workshop.yaml`, which is the roadmap.

## Add a pack (no code)

1. Read `docs/pack-format.md`.
2. Copy an existing pack in `packs/` and change everything.
3. Run `npm install` then `npm run validate`. Fix what it reports.
4. Open a pull request. Say in one line who the pack is for and what "rooted" means for it.

Questions must be your own words. Cite sources; never paste their text. Packs are CC-BY-SA 4.0.

## Improve a pack

Better distractors, better `why` lines, a missing layer, a guild that should exist: all welcome as small PRs. Keep one pack per PR.

## Code

- The game lives in `src/` and is built by Vite from TypeScript: `npm run dev` to play locally, `npm test` for the tests, `npm run build` for the site. It is split in two. `src/engine/` holds every rule as pure TypeScript with no DOM, and `src/game/` draws the farm and the sheets. The game reads `packs/*.yaml` at build time, so a new seed needs no code. See `docs/design.md` §9 for the phases.
- Keep the loop honest: a change should make plant → water → harvest truer, faster or clearer. Features that do not serve the loop wait.
- No leaderboards, no streak shaming, no accounts before the village needs them.
- The engine stays pure: `src/engine/` has no DOM, no clock and no randomness, and a farm is a fold over its event log. A new rule is a new event and a check in `src/engine/fold.ts`, with a property test. If a change makes that harder, it is probably wrong.
- Rules and numbers live in `RULES` (`src/engine/rules.ts`). The Almanac is written from it, and a test checks the tables in `docs/design.md` against it, so change all three together.
- Run `npm run validate`, `npm test` and `npm run build` before pushing. CI runs all three on every PR.

## Hosting and cost

The game is static and free to host. AI features (Phase 2) use each player's own API key, stored only in their browser. Nobody pays for anyone else's farm. Do not add a dependency on a paid service without a Discussion first.

## Licence

Code: MIT (`LICENSE`). Packs and other content under `packs/`: CC-BY-SA 4.0 (`packs/LICENSE.md`).
