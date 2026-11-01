# Permaculture

A farm game where the crops are the things you are learning. Forgetting is wilting. Mastery is a tree.

**Play:** [yozo06.github.io/permaculture](https://yozo06.github.io/permaculture/). To play on your own machine, run `npm run dev`.

Topics are seeds. Plant one in its field with notes in your own words, water it by answering cards and then by explaining it, and it grows. Miss a watering and it wilts. Harvest a stage-5 crop with a harder question, a write-up or proof, and it becomes a perennial tree: rooted, yours for good. The map is your retention, drawn as land.

Any goal is a **pack**: a YAML file of seeds with layers, prerequisites and questions. The game is built from `packs/`: add a seed to a YAML file and it is in the game. The first packs are a senior backend engineer's prep (Haskell, system design, infra) and everyday Kannada. The game's own roadmap is a pack too.

## Status

Phase 0: playable prototype, procedural pixel art, 36 seeds, drag-to-pan world, learning tree, wild finds, almanac. Everything runs in your browser; your farm is saved there as a log of what you did. Export it from the seed bag before clearing site data.

## Repo

```
src/       the game: TypeScript, built with Vite
  engine/  the rules: pure TypeScript, a farm is a fold over an event log
  game/    the canvas, the sheets, saving
packs/     one YAML per goal · schema/ · validated in CI
docs/      design.md (the rules) · pack-format.md
scripts/   validate-packs.mjs
```

```sh
npm install
npm run dev           # play locally, with hot reload
npm run validate      # every pack against the schema, plus cycle and prerequisite checks
npm test              # unit and property tests
npm run build         # type-check, then build the site into dist/
```

## Contributing

Read `CONTRIBUTING.md`. The most useful contribution is a pack for a goal of your own. The roadmap is `packs/workshop.yaml`.

## Licence

Code MIT. Packs CC-BY-SA 4.0.
