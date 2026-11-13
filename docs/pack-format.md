# Pack format v0

A pack is one YAML file in `packs/`, named after its slug: `packs/<pack>.yaml`. It is validated by `npm run validate` and in CI against `packs/schema/pack.schema.json`.

The engine knows nothing about what a seed means. The pack carries all of it.

## Shape

```yaml
pack: system-design          # slug; also the file name
version: 0
title: System design
color: "#E0A93E"             # the field's colour on the map
description: One or two sentences on what this field grows.
readiness_bar: 80            # optional, 1–100: the bar this field is held to unless its farmer sets another
perennial: false             # true for goals with no end (a language). Hides readiness.
energy_cap: 30               # optional: most of each day's energy this field may use, in percent (1–100)

branches:                    # 1–4. The learning tree has one column per branch.
  - id: distributed-data
    title: Distributed data
  - id: traffic-and-resilience
    title: Traffic & resilience

sources:                     # where seeds come from; cite, never paste
  - id: ddia
    title: Designing Data-Intensive Applications
    url: https://dataintensive.net/
  - id: raft
    title: In Search of an Understandable Consensus Algorithm
    url: https://raft.github.io/raft.pdf

guilds:                      # optional companion sets; a whole guild pays at each harvest and check-in
  - id: consensus
    title: Consensus
    seeds: [cap, replication, raft]

finds:                       # optional wild finds, foraged in the forest next to what is growing
  - id: flexible-paxos
    near: [raft, con]        # seeds in this pack the find grows next to
    text: "Flexible Paxos (Howard, 2016): election and replication quorums only need to intersect."
    seed: fpaxos             # optional: a wild seed in this pack that this find can be domesticated into

seeds:
  - id: raft
    name: Raft
    layer: root              # canopy | understory | shrub | herb | ground-cover | root | vine
    branch: distributed-data
    tier: 1                  # depth in the tree; 0 needs nothing rooted first (layer balance may still make it wait)
    needs: [con]             # seed ids that must be rooted first (same pack)
    wild: false              # true: hidden until foraged and domesticated; needs a find that points at it
    edge: infra              # optional: a second field it also belongs to; its harvest pays double there. See "Edges"
    earned: { rooted: 1 }    # optional: learning that has to happen before it can be planted. See "Earned seeds"
    harvest: recall          # recall | solve | judged | artifact
    minutes: 30              # about how long planting takes: reading the source and writing notes
    sources: [raft]
    summary: "Read sections 5.1–5.4. Yield: the election and commit rules in your own words."
    questions:
      water:                 # asked when a crop is watered at stages 1–3 of 5, and at perennial check-ins
        - q: In Raft, a log entry is committed when…
          answer: It is replicated on a majority and the leader has applied an entry from its current term
          distractors:
            - The leader has written it locally
            - Any follower acknowledges it
            - The client receives an acknowledgement
          why: Majority replication plus a current-term entry prevents a stale leader committing an old entry.
          source: raft
      harvest:               # asked at the harvest of a recall seed, and at perennial check-ins; harder. Falls back to `water` if absent.
        - q: ...
    # the rubric drives the explain rung for every seed, and judged harvests; add prompts for judged / artifact / solve harvests:
    rubric:
      - Names two or more options and why this one
      - States where state lives and what consistency it really has
    prompts:
      - Design a distributed rate limiter for a payments API at 50k rps across three regions.
```

## The depth ladder and the pack

A crop climbs a ladder of different work (see `design.md`): notes when planted, multiple-choice cards at stages 1–3, an explanation in the player's own words at stage 4, and a harvest at stage 5.

- `rubric` drives the explain rung for every seed. The player rates their explanation against these lines and passes with more than half. A seed with no `rubric` uses a default one (what it is, why it matters, an example or a case where it does not apply), so a rubric is worth writing for any seed whose answer is more specific than that.
- Judged harvests need every rubric line. Artifact harvests use a fixed checklist (it exists outside the game; it does what the prompt asks) and show one of the seed's `prompts`.
- `questions.water` is for recall only. A seed with no cards (an artifact seed) explains at every stage instead.
- `minutes` and `summary` are shown when the player plants, next to the box for their notes.

## Energy caps

A pack with `energy_cap: 30` may use at most 30% of a day's energy across everything it does: planting, watering, harvesting and jumping the fence. The Workshop has one, so the farm never becomes the only crop. Foraging is not charged to any field.

## Earned seeds

A seed can ask for learning before it can be planted. The Workshop uses this so the game's own backlog cannot outrun the studying.

```yaml
earned: { rooted: 1 }                    # a seed rooted in any other field
earned: { pack: kannada, rooted: 4 }     # four seeds rooted in the Kannada field
earned: { pack: infra, readiness: 60 }   # the Infra field's readiness at 60 or over
```

- It is asked on top of `needs`, and jumping the fence does not get round it: a jump tests you out of a seed's prerequisites, not out of the learning it asks for.
- `rooted` counts trees, and a tree stays counted if a wrong check-in wilts it. Wild seeds do not count.
- `readiness` is today's number, so it can be lost again until the seed is in the ground.
- It is asked only of a planting done today. A saved farm replays without it, so a farm that planted the seed earlier keeps the crop, and `earned` can be added, changed or removed on a released seed. It is the one thing about a seed that is not in `packs/lock.json`.

## Edges

Some seeds belong to two fields at once: Kannada words for technology, the economics of a farm. Give such a seed `edge`, the pack id of the second field:

```yaml
  - id: tech-words
    edge: infra              # also belongs to the Infra field
```

The seed still lives in its own pack and is planted in its own field. Its harvest pays double once the farm has a tree rooted in the field it borders. On a farm without that field it is an ordinary seed.

Those coins are part of a saved farm, so `edge` may be added to a released seed but never removed or pointed at another pack.

## Guilds

A guild is a named set of seeds from this pack that a practitioner would study together. It is **whole** while every member stands as a tree, and a whole guild pays a few coins each time one of its members is harvested or checked in on. A wilted member stops the pay until it is revived. A seed may be in more than one guild, and is paid by each that is whole. A guild may hold a wild seed: it is then whole only once the farmer has found and rooted it.

Those coins are part of a saved farm, so a released guild is a promise: it may not be removed, and it may lose members but never gain one. To group more seeds, add a new guild.

## Finds

A find is a short fact the player forages in the wilderness. It is picked by what is growing, so `near` lists the seeds of this pack it grows next to. A find with a `seed` can be domesticated: that wild seed then joins the seed bag as a volunteer. A wild seed needs a find that points at it, or it could never be found.

## Ids are forever

Seed ids, find ids and pack ids are unique across all packs, and branch ids within a pack. Farms refer to all of them and are replayed against the current packs, so never rename or remove a released one. Never change a released seed's `needs` or whether it is `wild`, in either direction, and never lower a pack's `energy_cap`: on replay the game skips any event that is no longer allowed, and the farm quietly changes. To hold a released seed back, give it `earned` instead. Whether a pack is `perennial` may change too: a bar a farmer set before a pack lost its end stays in their log and is simply not used.

`packs/lock.json` holds these promises, one line per id, and `npm test` fails when a change would break one: an id that is gone or has moved, a seed whose `needs` or `wild` changed, an artifact seed that now asks for a write-up, a find that leads somewhere else, a cap that was lowered or added, a guild that is gone or has gained a member, a seed whose `edge` is gone or names another pack. Even needing *less* counts: a farm that jumped the fence to that seed holds a jump the game would now refuse. Adding seeds, finds, branches, guilds and packs is always fine: run `npm run lock` and commit the file with your change. It will not write over a breaking change, and it will not replace a lock file it cannot read.

## Rules the validator enforces

- Every `branch` on a seed is a declared branch id.
- Every id in `needs` is a seed in the same pack; no cycles; a seed's `tier` is above all of its prerequisites.
- Every `sources` reference on a seed is a declared source.
- `recall` seeds have at least one `questions.water` entry.
- `judged` seeds have a `rubric` and `prompts`; `artifact` and `solve` seeds have `prompts`. (`rubric` also drives the explain rung of any seed; a default is used when it is missing.)
- No distractor equals the answer, and no two distractors are the same.
- Seed ids and find ids are unique across all packs.
- A find's `near` ids and `seed` are seeds in its pack, and its `seed` is wild.
- Every wild seed has a find that points at it.
- Every guild member is a seed in the same pack, listed once. Guild ids are unique within a pack.
- A seed's `edge` names a pack that exists and is not its own.
- A seed's `earned` asks for one thing, `rooted` or `readiness`. A `readiness` names its pack. The pack exists, is not the seed's own, and for `readiness` has an end. It never asks for more seeds than there are to root.

## Writing good seeds

- **A seed is a thing you can root**, not a chapter. "Raft" is a seed; "Chapter 9" is not.
- **Layer by what it is**, not how hard it is. GC internals are `root` even if they are easy for you. The layer also sets the order a field is planted in: under layer balance a seed waits while a layer two or more beneath its own (from the ground up: root, ground cover, herb, shrub, understory, canopy) is hollow and has a seed that could be planted. So give a field's low layers some seeds that need nothing, or its first days will be spent high up.
- **Questions teach.** `why` is shown after every answer. Write it so a wrong answer still ends with understanding.
- **Distractors are plausible.** The wrong options should be things people actually believe.
- **Cite, never paste.** Questions are original. `source` points at where to read more.
- **Prefer judged over recall** once a seed is past tier 1. Multiple choice is for recall only.
- **Quote colons.** A value with a colon and a space in it (`Yield: ...`) needs double quotes, or YAML reads it as a mapping and the validator rejects the pack.

## Making a pack for a new goal

By hand, from this file. Or with the **pack forge** (the AI phase): paste a syllabus or three job descriptions into the prompt template with your own key, get a draft that passes the validator, prune it, open a PR.

## Licence

Packs are content and are licensed CC-BY-SA 4.0 (`packs/LICENSE.md`). By contributing a pack you agree to that.
