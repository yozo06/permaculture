# Permaculture

A farm game where the crops are the things you are learning. Forgetting is wilting. Mastery is a tree.

**Play:** once GitHub Pages is enabled for this repo, the game is at `https://<owner>.github.io/permaculture/`. Until then, open `game/index.html` in a browser.

Topics are seeds. Plant one in its field, water it by answering a question, and it grows. Miss a watering and it wilts. Harvest a stage-5 crop with a harder question and it becomes a perennial tree: rooted, yours for good. The map is your retention, drawn as land.

Any goal is a **pack**: a YAML file of seeds with layers, prerequisites and questions. The first packs are a senior backend engineer's prep (Haskell, system design, infra) and everyday Kannada. The game's own roadmap is a pack too.

## Status

Phase 0: playable prototype, procedural pixel art, 36 seeds, drag-to-pan world, learning tree, wild finds, almanac. Everything runs in your browser; your farm is saved there. Export it from the seed bag before clearing site data.

## Repo

```
game/      the playable prototype (one HTML file, no build)
packs/     one YAML per goal · schema/ · validated in CI
docs/      design.md (the rules) · pack-format.md
scripts/   validate-packs.mjs · extract-packs.mjs
```

```sh
npm install
npm run validate      # every pack against the schema, plus cycle and prerequisite checks
```

## Contributing

Read `CONTRIBUTING.md`. The most useful contribution is a pack for a goal of your own. The roadmap is `packs/workshop.yaml`.

## Licence

Code MIT. Packs CC-BY-SA 4.0.
