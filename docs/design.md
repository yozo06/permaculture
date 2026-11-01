# Permaculture — design

A farm game where the crops are the things you are learning. Forgetting is wilting. Mastery is a tree.

This document is the source of truth for the rules. The in-game Almanac must agree with it; when they differ, fix one.

## 1. Why a farm

Learning for a long goal (a job switch, a language, a craft) fails in two ways: you forget what you learned, and you cannot see what you know. A farm makes both visible. Every topic is a crop that needs tending on a schedule, and the whole map is a picture of your retention. The name is not decoration: permaculture's design principles are the mechanics.

The game must be useful with ugly tiles. Art is an unlock, never a prerequisite.

## 2. Principles → mechanics

| Principle | In the game |
|---|---|
| **Zones** (tend what is near, often) | Z1 daily · Z2 every few days · Z3 weekly · Z4 seasonal · Z5 wilderness. Spaced repetition is crops migrating outward as reviews succeed; forgetting is drifting back inward. |
| **Annuals vs perennials** | Facts and vocab are annuals: cheap, need replanting. A harvested crop becomes a **perennial tree**: rooted, checked once every ten days. "Skilled enough" means mostly perennials. |
| **Layers** (forest garden) | Every field has seven: canopy (architecture), understory (patterns), shrub (data structures / storage), herb (idioms, techniques), ground cover (fundamentals), root (internals, runtime), vine (cross-cutting: concurrency, observability, security, SRE). A field cannot run two layers ahead of a hollow one. |
| **Guilds** (companion planting) | Named sets of seeds that go together. A complete guild gives a yield bonus; a wilting member drags the rest. |
| **Catch and store energy** | A daily energy budget shared by all fields. Unused energy fills the **rain barrel**; a stored day is spent automatically to stop a crop from wilting. A pack can cap its share (the Workshop uses at most 30%). No streaks. |
| **Produce no waste** | Wrong answers go to the **compost heap** and come back as reviews. A failed harvest drops the crop back a stage and generates the next seeds. |
| **Small and slow** | Hard cap on new seeds per day (two). |
| **Obtain a yield** | Every planting and every harvest leaves an artifact: notes, a solve, a write-up, a decision. No yield, no credit. |
| **Observe and interact** | The Sunday walk: the game shows the map and asks three questions. No tasks. Zone 5 is for foraging **wild finds**, facts next to what is growing, which add nothing to readiness and can be **domesticated** into volunteer seeds. |
| **Use edges** | Seeds on the boundary of two fields (farm economics, Kannada tech vocabulary) yield double. |
| **The problem is the solution** | A failed mock is not a loss; it is the next season's planting list. |

## 3. The loop

**Plant** a seed (10 energy, 10 coins; later: the seed's declared minutes). The yield of planting is a page of notes in your own words and three recall cards you write yourself.

**Water** a thirsty crop by answering. Right: it grows one stage and moves one zone out. Wrong: it wilts, drops a stage, goes in the compost.

**Harvest** a stage-5 crop with a harder question or a judged write-up. Premium: coins, and the crop becomes a perennial. Seconds: composted.

**Sleep** ends the day. Energy refills, thirst advances, the barrel saves what it can, the morning report lists what needs tending.

### Thirst and zones

| Stage | Zone | Thirsty again after |
|---|---|---|
| 1 | Z1 | 1 day |
| 2 | Z2 | 2 days |
| 3 | Z2 | 3 days |
| 4 | Z3 | 4 days |
| 5 | Z3 | 5 days |
| perennial | Z4 | 10 days |

Two days past thirsty without water, a crop wilts overnight unless the barrel has a day to spend. The barrel fills before it is spent, so a crop never wilts overnight while the barrel holds a day. Perennials do not wilt from neglect; a wrong check-in wilts them until the next day.

### Numbers

| Rule | Value |
|---|---|
| Energy per day | 90 |
| Plant | 10 energy, 10 coins |
| New seeds per day | 2 |
| Water | 6 energy |
| Harvest | 15 energy; premium pays 30 coins |
| Jump the fence | 10 energy |
| Forage | 5 energy; pays 3 coins |
| Fence a tile | 25 coins on open ground, 40 in forest |
| Rain barrel | +1 day when a day ends with 30 or more energy; holds 5 |
| Compost | everything in the heap is due again the next day |

### The depth ladder

Stages change the kind of work, not just the interval:

0. **Sprout**: read the source, write notes (observe).
1. **Recall**: cards.
2. **Explain**: in your own words, judged against a rubric.
3. **Apply**: a problem, a design, a debugging session.
4. **Harvest**: an open question with no hint, or teach it to someone.

Trees spawn saplings: harvesting Raft drops log compaction, membership change and read-index as new seeds. Depth is a tree that keeps seeding its own understory.

### Harvest types

Declared per seed in the pack. **recall** (auto-graded cards) · **solve** (timed problem, tests run) · **judged** (written answer graded against the seed's rubric; the player can dispute each line) · **artifact** (a memo, a recording, a real decision). Self-rating is the fallback for judged when no AI is configured.

## 4. The learning tree

Every seed in a pack, locked or not, is on the tree. Two branches per field. A seed unlocks when the seeds it **needs** are rooted (harvested to perennial), never by points. The player picks a focus branch; the seed bag puts it first and the other branch stays open. **Jump the fence**: any locked seed can be tested out of with a harvest-grade question. A tree that makes a senior engineer replant basics is a tree nobody uses.

## 5. Readiness, not deadlines

A field's readiness is the share of its catalogue that is perennial and in Z3 or beyond, with all seven layers present. The player sets the bar (default 80). The market opens when every field is at its bar; "buyers" are named bars, nothing more. The **rival** is last-month-you. There are no leaderboards: the only person you can cheat is yourself.

A pack can be **perennial** (a language, a habit): no readiness, it just lives on the farm.

## 6. Land

The homestead has one field per pack, laid out on a grid around the barn; the world grows to fit them (20×20 for four fields, 27×27 for up to nine). Everything beyond the fence is wilderness. Land next to a field can be fenced in with coins (open ground is cheaper than forest). Fields grow one tile at a time in any shape. Later: the seven layers drawn as terraces up a hillside, and chunked worlds per big goal.

## 7. Packs

A pack is one YAML file: a goal, its branches, sources, guilds and seeds. The engine never knows what a seed means; the pack does. See `pack-format.md`. Adding a goal never touches engine code.

Pack #0 is the **Workshop**: the game's own backlog as seeds, capped at 30% of daily energy, with features unlocking from learning milestones. The game gamifies its own development.

## 8. Architecture

- **Local-first.** A farm is an append-only event log in the player's browser. Farm state is a pure fold over the log. Export is the log. Multi-device merge is a later, easy step because events have ids and the fold is deterministic.
- **Static hosting.** The game is files on GitHub Pages. No server until the village.
- **Engine / game / packs.** `src/engine/`: pure rules with property tests. `src/game/`: renderer and UI. `packs/`: data, validated in CI.
- **AI is optional and bring-your-own-key.** Authoring (catalogues, questions, the pack forge) is offline work committed as data. Runtime AI (judged harvests, wild finds, gap audits) uses the player's own key, stored only in their browser, with calls made browser-to-provider. A local model works. The no-AI game is complete.
- **Village (Phase 3).** A player may publish a read-only snapshot: the map and the trees, never the compost heap or failed answers. Opt-in, revocable. Visiting means watering one crop by answering a question from the neighbour's pack; the gift lands in their log. Farms have codes; identity comes later if ever. Grades are not comparable across models or players.
- **Haskell backend** is the village server, when there is a village. Not before.

## 9. Phases

Each phase ends with something a friend can play.

0. Repo, licence, prototype on Pages, save export/import, this document, the pack format, CI validation. *(first commit)*
1. Engine split, pack loader, full catalogues, depth ladder.
2. BYOK AI: judged harvests, pack forge, wild finds.
3. Village-lite: snapshots, visits, then the server.
4. Art: sprite sheets, PixiJS, terraces, weather.

## 10. What we will say no to

Leaderboards. Streak shaming. Any feature that does not serve plant → water → harvest. A server before there are players. Art before the loop is honest.
