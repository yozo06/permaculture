# Contributing

Permaculture is a farm game where the crops are the things you are learning. You can contribute without writing any code: the most valuable thing in this repo is the packs.

## Play first

Open the live game (link in the README), play for a week, and tell us what felt like a game and what felt like a quiz wearing a hat. Open a Discussion for ideas and an Issue for bugs. Ideas that survive become seeds in `packs/workshop.yaml`, which is the roadmap.

## Add a pack (no code)

1. Read `docs/pack-format.md`.
2. Copy an existing pack in `packs/` and change everything.
3. Run `npm install` then `npm run validate`. Fix what it reports. Then run `npm run lock`, which records your new ids in `packs/lock.json`, and commit that file too.
4. Open a pull request. Say in one line who the pack is for and what "rooted" means for it.

Questions must be your own words. Cite sources; never paste their text. Packs are CC-BY-SA 4.0.

## Improve a pack

Better distractors, better `why` lines, a missing layer, a guild that should exist: all welcome as small PRs. Keep one pack per PR. Never rename or remove a seed id or tighten `needs` (see "Ids are forever" in `docs/pack-format.md`): saved farms refer to them, and `npm test` fails if you do. After adding a seed, run `npm run lock`. The five full catalogues (Haskell backend, system design, infra, DSA patterns, leadership) must keep 30 to 40 seeds, all seven layers, and on every seed a rubric of at least three lines, at least two recall cards and a source, every card citing a declared source. `npm test` checks this, so a half-finished seed fails the build.

## Code

- The game lives in `src/` and is built by Vite from TypeScript: `npm run dev` to play locally, `npm test` for the tests, `npm run build` for the site. It is split in two. `src/engine/` holds every rule as pure TypeScript with no DOM, and `src/game/` draws the farm and the sheets. The game reads `packs/*.yaml` at build time, so a new seed needs no code. `docs/code-tour.md` walks through the code in one page; see `docs/design.md` §9 for the phases.
- Keep the loop honest: a change should make plant → water → harvest truer, faster or clearer. Features that do not serve the loop wait.
- No leaderboards, no streak shaming, no accounts before the village needs them.
- The engine stays pure: `src/engine/` has no DOM, no clock and no randomness, and a farm is a fold over its event log. A new rule is a new event and a check in `src/engine/fold.ts`, with a property test. If a change makes that harder, it is probably wrong.
- Rules and numbers live in `RULES` (`src/engine/rules.ts`). The Almanac is built from it, and a test checks the two tables and the ladder in `docs/design.md` against it, so change all three together. A farm is replayed against the current rules, so changing a number in `RULES` changes every saved farm; say so in the PR.
- Run `npm run validate`, `npm test` and `npm run build` before pushing. CI runs all three on every PR.

## Hosting and cost

The game is static and free to host. AI features (a later phase) use each player's own API key, stored only in their browser. Nobody pays for anyone else's farm. Do not add a dependency on a paid service without a Discussion first.

## Licence

Code: MIT (`LICENSE`). Packs and other content under `packs/`: CC-BY-SA 4.0 (`packs/LICENSE.md`).
