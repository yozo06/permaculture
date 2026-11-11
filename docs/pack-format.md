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
readiness_bar: 80            # optional, default target; the player can change it
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

guilds:                      # optional companion sets
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
    tier: 1                  # depth in the tree; 0 is plantable from the start
    needs: [con]             # seed ids that must be rooted first (same pack)
    wild: false              # true: hidden until foraged and domesticated; needs a find that points at it
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

## Finds

A find is a short fact the player forages in the wilderness. It is picked by what is growing, so `near` lists the seeds of this pack it grows next to. A find with a `seed` can be domesticated: that wild seed then joins the seed bag as a volunteer. A wild seed needs a find that points at it, or it could never be found.

## Ids are forever

Seed ids, find ids and pack ids are unique across all packs, and branch ids within a pack. Farms refer to all of them and are replayed against the current packs, so never rename or remove a released one. Never tighten a released seed's `needs`, never make it `wild`, and never lower a pack's `energy_cap`: on replay the game skips any event that is no longer allowed, and the farm quietly changes.

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
- Every guild member is a seed in the same pack.

## Writing good seeds

- **A seed is a thing you can root**, not a chapter. "Raft" is a seed; "Chapter 9" is not.
- **Layer by what it is**, not how hard it is. GC internals are `root` even if they are easy for you.
- **Questions teach.** `why` is shown after every answer. Write it so a wrong answer still ends with understanding.
- **Distractors are plausible.** The wrong options should be things people actually believe.
- **Cite, never paste.** Questions are original. `source` points at where to read more.
- **Prefer judged over recall** once a seed is past tier 1. Multiple choice is for recall only.
- **Quote colons.** A value with a colon and a space in it (`Yield: ...`) needs double quotes, or YAML reads it as a mapping and the validator rejects the pack.

## Making a pack for a new goal

By hand, from this file. Or with the **pack forge** (the AI phase): paste a syllabus or three job descriptions into the prompt template with your own key, get a draft that passes the validator, prune it, open a PR.

## Licence

Packs are content and are licensed CC-BY-SA 4.0 (`packs/LICENSE.md`). By contributing a pack you agree to that.
