# Permaculture

A farm game where the crops are the things you are learning. Forgetting is wilting. Mastery is a tree.

**Play:** [yozo06.github.io/permaculture](https://yozo06.github.io/permaculture/). To play on your own machine, run `npm run dev` and open the address it prints; it ends in `/permaculture/`, like the live site.

![The farm: fields around the barn, crops at different stages, the gate, the signpost and the market stall](docs/img/farm.jpg)

Topics are seeds. Plant one in its field with notes in your own words, water it by answering cards and then by explaining it, and it grows. Leave it thirsty for two days and it wilts, unless the rain barrel has a day to spend; a wrong answer wilts it at once. Harvest a stage-5 crop with a harder question, a write-up or proof, and it becomes a perennial tree: rooted, yours for good. The map is your retention, drawn as land.

Any goal is a **pack**: a YAML file of seeds with layers, prerequisites and questions. The game is built from `packs/`: add a seed to a YAML file and it is in the game. The packs so far are a senior backend engineer's prep (Haskell, system design, infra, DSA patterns, leadership) and everyday Kannada. The game's own roadmap is a pack too.

![The learning tree for System design: rooted seeds are solid, growing ones carry a bar, locked ones are dashed, and lines show what each seed needs](docs/img/learning-tree.jpg)

## Play with neighbours

Tap the gate on your farm, name it, and make a **farm link**. The link holds a picture of your farm inside itself, so nothing is uploaded and there are no accounts: send it in whatever chat you already use. A friend who opens it lands on your farm, looks around, and starts their own next door with the fields they choose. Open their link and they are on your list of neighbours.

A link shows only the fields you tick, with each crop at the furthest it has grown. It never shows your notes, a wrong answer, the compost heap or a wilted crop. It is a photograph: it does not update, and a sent link cannot be taken back. Nobody is ranked. Looking for neighbours? Post your link in [Discussions](https://github.com/yozo06/permaculture/discussions). Next comes rain: answer a card about a neighbour's crop and send them a day in their rain barrel. The design is `docs/neighbours.md`.

## Status

Phase 1 is done: the rules are an engine of their own (a farm is a fold over a log of what you did), the game is built from `packs/`, and a crop climbs a depth ladder — notes when you plant it, recall cards, explaining it in your own words, then a harder harvest. There are seven packs and 224 seeds: five full catalogues (Haskell backend, system design, infra, DSA patterns, leadership), everyday Kannada, and the Workshop, the game's own roadmap. The world pans and zooms, with a learning tree, wild finds and an almanac. Everything runs in your browser; your farm is saved there. Export it from the seed bag before clearing site data. Farms from the Phase 0 prototype still import.

Phase 2, **Neighbours**, is half built (version 0.2.0): saved farms are guarded against later edits to the packs and rules, new farmers choose their fields, and farms can be shared and visited by link. Rain comes after a first week of beta. After that comes optional AI with your own key, then art.

The first step of the art plan is in (version 0.3.0): each of the seven layers has a shape of its own, so the map shows what kind of knowledge sits where; each field flies a flag in its colour; and the game carries its own fonts, so the page asks no other site for anything.

Readiness is in too (version 0.4.0): each field shows how much of it stands as trees, which of its layers are hollow, and the bar you set for it. There are no dates. And a seed can ask to be earned: the Workshop's sprite sheets wait for your first real harvest, so the game's own backlog cannot outrun the studying.

Layer balance followed (version 0.5.0): a field is built from the ground up, and a seed waits while a layer two or more beneath its own is hollow and has something you could plant. The seed bag says where to begin.

Then three rules about what grows together (version 0.6.0). A **guild** is whole while every member stands as a tree, and a whole guild pays a few coins at each harvest and check-in of its members; one wilted member and it pays nothing until you revive it. A seed on the **edge** of two fields, such as Kannada words for technology, pays double at harvest once you have a tree in the other field. And harvesting some trees drops **saplings**: harvest Raft and three deeper seeds appear in the seed bag.

Then where it all leads (version 0.7.0). At the **market** a buyer is a named set of bars, such as "Haskell at 80, System design at 60", and is buying once your farm meets them; a sale is something real that came of it, recorded in your own words. Your only **rival** is your own farm thirty days ago, which you can walk round. And every seventh day is a **walk day**: no tasks, the week that was, and three questions.

And the farm has art of its own (version 0.8.0): one sprite sheet, made for this game, in place of shapes drawn by code. It is drawn at your screen's own resolution, so it is sharp on a phone and on a laptop, and you can zoom: pinch, or use the + and − buttons. How the art is made, and how to change it, is in [`art/README.md`](art/README.md).

Why this exists, what it promises and the whole plan are in [`ROADMAP.md`](ROADMAP.md).

## Repo

```
src/       the game: TypeScript, built with Vite
  engine/  the rules: pure TypeScript, a farm is a fold over an event log
  game/    the canvas, the sheets, saving
packs/     one YAML per goal · schema/ · validated in CI
docs/      design.md (the rules) · neighbours.md · pack-format.md · code-tour.md
ROADMAP.md the vision, the mission and the plan
scripts/   the pack validator (shared with the build) and its tests
```

New to the code? `docs/code-tour.md` is a one-page walk through it: the three parts, how a tap becomes a saved farm, and where to make a change.

```sh
npm install           # needs Node 22.12 or newer
npm run dev           # play locally at /permaculture/, with hot reload
npm run validate      # every pack against the schema, plus cycle and prerequisite checks
npm test              # unit and property tests
npm run build         # type-check, then build the site into dist/
```

## Contributing

Read `CONTRIBUTING.md`. The most useful contribution is a pack for a goal of your own. `ROADMAP.md` says where help is wanted; the backlog itself is a pack, `packs/workshop.yaml`.

## Licence

Code MIT. Packs CC-BY-SA 4.0. The two fonts the game carries, Pixelify Sans and DM Sans, are under the SIL Open Font License.
