# Permaculture — design

A farm game where the crops are the things you are learning. Forgetting is wilting. Mastery is a tree.

This document is the source of truth for the rules. The in-game Almanac must agree with it; when they differ, fix one. Rules marked *(planned)* are not in the game yet; the Almanac lists them under "Not here yet".

## 1. Why a farm

Learning for a long goal (a job switch, a language, a craft) fails in two ways: you forget what you learned, and you cannot see what you know. A farm makes both visible. Every topic is a crop that needs tending on a schedule, and the whole map is a picture of your retention. The name is not decoration: permaculture's design principles are the mechanics.

The game must be useful with ugly tiles. Art is an unlock, never a prerequisite.

## 2. Principles → mechanics

| Principle | In the game |
|---|---|
| **Zones** (tend what is near, often) | Z1 daily · Z2 every two or three days · Z3 every four or five · Z4 every ten (perennials) · Z5 wilderness. Spaced repetition is crops migrating outward as reviews succeed; forgetting is drifting back inward. |
| **Annuals vs perennials** | Facts and vocab are annuals, cheap to plant. A harvested crop becomes a **perennial tree**: rooted, checked once every ten days. "Skilled enough" means mostly perennials. *(planned)* over time an annual needs replanting. |
| **Layers** (forest garden) | Every full catalogue has seven: canopy (architecture), understory (patterns), shrub (data structures / storage), herb (idioms, techniques), ground cover (fundamentals), root (internals, runtime), vine (cross-cutting: concurrency, observability, security, SRE). *(planned)* a field cannot run two layers ahead of a hollow one. |
| **Guilds** (companion planting) | Named sets of seeds that go together. *(planned)* a complete guild gives a yield bonus; a wilting member drags the rest. |
| **Catch and store energy** | A daily energy budget shared by all fields. Unused energy fills the **rain barrel**; a stored day is spent automatically to stop a crop from wilting. A pack can cap its share (the Workshop uses at most 30%). No streaks. |
| **Produce no waste** | Wrong answers go to the **compost heap** and come back as reviews. A failed harvest drops the crop back a stage; *(planned)* it also generates the next seeds. |
| **Small and slow** | Hard cap on new seeds per day (two). |
| **Obtain a yield** | Every planting leaves notes in your own words, and a judged or artifact harvest leaves a write-up or proof. No yield, no credit. |
| **Observe and interact** | The Sunday walk: the game shows the map and asks three questions. No tasks. Zone 5 is for foraging **wild finds**, facts next to what is growing, which add nothing to readiness and can be **domesticated** into volunteer seeds. |
| **Use edges** | *(planned)* Seeds on the boundary of two fields (farm economics, Kannada tech vocabulary) yield double. |
| **The problem is the solution** | A failed mock is not a loss; it is the next season's planting list. |

## 3. The loop

**Plant** a seed (10 energy, 10 coins; later: the seed's declared minutes). The yield of planting is a page of notes in your own words, kept on the crop.

**Water** a thirsty crop by answering a card, or at stage 4 by explaining it in your own words. Right: it grows one stage and goes longer before it is thirsty again. Wrong: it wilts, drops a stage, goes in the compost.

**Harvest** a stage-5 crop with a harder question or a judged write-up. If it has gone thirsty, water it first. Premium: coins, and the crop becomes a perennial. Seconds: composted.

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
| Notes to plant | at least 40 characters |
| New seeds per day | 2 |
| Water | 6 energy |
| Explanation | at least 80 characters; passes with more than half the rubric lines |
| Harvest | 15 energy; premium pays 30 coins |
| Harvest write-up | at least 80 characters; proof of an artifact, at least 8 |
| Jump the fence | 10 energy |
| Forage | 5 energy; pays 3 coins |
| Fence a tile | 25 coins on open ground, 40 in forest |
| Rain barrel | +1 day when a day ends with 30 or more energy; holds 5 |
| New farm | day 1, 140 coins, nothing in the barrel |
| Longest text | 5000 characters |
| Compost | everything in the heap is due again the next day |

### The depth ladder

Stages change the kind of work, not just the interval. Stage numbers here count from 0; the game and the thirst table count from 1.

- **0 · Sprout**: read the source and write notes in your own words. Planting needs the notes; they stay on the crop. The sprout's first watering is a recall card.
- **1–2 · Recall**: multiple-choice cards. Multiple choice is for recall only.
- **3 · Explain**: write it in your own words, then rate it against the seed's rubric. More than half the lines is a pass. Self-rating is the fallback until judged harvests arrive.
- **4 · Harvest**: a harder question, a write-up that meets every rubric line, or proof of an artifact.

A seed with no cards explains at every stage. A perennial check-in is a card too, from the harder harvest cards when the seed has them.

The AI phase adds **Apply** (a problem, a design, a debugging session) and judged grading with the player's own key.

*(planned)* Trees spawn saplings: harvesting Raft drops log compaction, membership change and read-index as new seeds. Depth is a tree that keeps seeding its own understory.

### Harvest types

Declared per seed in the pack. **recall** (auto-graded cards) · **solve** (timed problem, tests run) · **judged** (written answer graded against the seed's rubric; the player can dispute each line) · **artifact** (a memo, a recording, a real decision). Self-rating is the fallback for judged when no AI is configured.

## 4. The learning tree

Every seed in a pack, locked or not, is on the tree. One to four branches per field (the shipped packs have two). A seed unlocks when the seeds it **needs** are rooted (harvested to perennial), never by points. The player picks a focus branch; the seed bag puts it first and the other branches stay open. **Jump the fence**: any locked seed can be tested out of with a harvest-grade question. A tree that makes a senior engineer replant basics is a tree nobody uses.

## 5. Readiness, not deadlines

*(planned)* A field's readiness is the share of its catalogue that is perennial and in Z3 or beyond, with all seven layers present. The player sets the bar (default 80). The market opens when every field is at its bar; "buyers" are named bars, nothing more. The **rival** is last-month-you. There are no leaderboards: the only person you can cheat is yourself.

A pack can be **perennial** (a language, a habit): no readiness, it just lives on the farm.

## 6. Land

The homestead has a field for each pack the farmer chose, laid out on a grid around the barn; the world grows to fit them (20×20 for four fields, 27×27 for up to nine). A new farmer picks their fields at the start and can open more later from the learning tree. Everything beyond the fence is wilderness. Land next to a field can be fenced in with coins (open ground is cheaper than forest). Fields grow one tile at a time in any shape. Later: the seven layers drawn as terraces up a hillside, and chunked worlds per big goal.

## 7. Packs

A pack is one YAML file: a goal, its branches, sources, guilds and seeds. The engine never knows what a seed means; the pack does. See `pack-format.md`. Adding a goal never touches engine code.

Pack #0 is the **Workshop**: the game's own backlog as seeds, capped at 30% of daily energy, with features unlocking from learning milestones. The game gamifies its own development.

## 8. Architecture

- **Local-first.** A farm is an append-only event log in the player's browser. Farm state is a pure fold over the log. Export is the log. Multi-device merge is a later, easy step because events have ids and the fold is deterministic.
- **Saved farms are protected.** A farm is replayed against today's packs and rules, so a careless edit could quietly drop part of someone's history. Ids are locked (`packs/lock.json`), a played farm must always replay, a farm's first event is never refused over one number, and the game says so when a farm's history no longer fits.
- **Static hosting.** The game is files on GitHub Pages. No server until the village needs one.
- **Engine / game / packs.** `src/engine/`: pure rules with property tests. `src/game/`: renderer and UI. `packs/`: data, validated in CI.
- **AI is optional and bring-your-own-key.** Authoring (catalogues, questions, the pack forge) is offline work committed as data. Runtime AI (judged harvests, wild finds, gap audits) uses the player's own key, stored only in their browser, with calls made browser-to-provider. A local model works. The no-AI game is complete.
- **Neighbours (Phase 2).** A player may share a **farm link**: a picture of the farm carried inside the link itself, with no server. It holds the map and the trees of the fields the player chose, never notes, the compost heap, failed answers or a wilted crop. A sent link cannot be taken back and never updates by itself; a neighbour's game forgets a picture after 60 days. *(planned)* Visiting means answering one card about a neighbour's crop and sending them **rain**: a day in their barrel and a visit the crop remembers. Farms have codes; identity comes later if ever. Nobody is ranked. The full design is `neighbours.md`.
- **Village (later).** A server that holds the same pictures and delivers the same rain, where a published picture can be withdrawn. Grades are not comparable across models or players.
- **Haskell backend** is the village server, when there are players who need one. Not before.

## 9. Phases

Each phase ends with something a friend can play.

0. Repo, licence, prototype on Pages, save export/import, this document, the pack format, CI validation. *(done)*
1. Engine split, pack loader, full catalogues, depth ladder. *(done)*
2. Neighbours: safe saves, farm links, visiting, choosing your fields; then rain. See `neighbours.md`.
3. BYOK AI: judged harvests, pack forge, wild finds.
4. Art: sprite sheets, PixiJS, terraces, weather.
5. The village server, when there are players who need it.

The plan in full, with what is done and how to help, is `../ROADMAP.md`.

## 10. What we will say no to

Leaderboards. Streak shaming. Any feature that does not serve plant → water → harvest. A server before there are players. Art before the loop is honest.
