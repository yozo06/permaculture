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

seeds:
  - id: raft
    name: Raft
    layer: root              # canopy | understory | shrub | herb | ground-cover | root | vine
    branch: distributed-data
    tier: 1                  # depth in the tree; 0 is plantable from the start
    needs: [con]             # seed ids that must be rooted first (same pack)
    wild: false              # true: hidden until foraged and domesticated
    harvest: recall          # recall | solve | judged | artifact
    minutes: 30              # energy to plant (read the source, write notes)
    sources: [raft]
    summary: Read sections 5.1–5.4. Yield: the election and commit rules in your own words, plus three cards.
    questions:
      water:                 # asked at watering (stages 1–4)
        - q: In Raft, a log entry is committed when…
          answer: It is replicated on a majority and the leader has applied an entry from its current term
          distractors:
            - The leader has written it locally
            - Any follower acknowledges it
            - The client receives an acknowledgement
          why: Majority replication plus a current-term entry prevents a stale leader committing an old entry.
          source: raft
      harvest:               # asked at harvest; harder. Falls back to `water` if absent.
        - q: ...
    # for judged / artifact harvests instead of (or as well as) questions:
    rubric:
      - Names two or more options and why this one
      - States where state lives and what consistency it really has
    prompts:
      - Design a distributed rate limiter for a payments API at 50k rps across three regions.
```

## Rules the validator enforces

- Every `branch` on a seed is a declared branch id.
- Every id in `needs` is a seed in the same pack; no cycles; a seed's `tier` is above all of its prerequisites.
- Every `sources` reference on a seed is a declared source.
- `recall` seeds have at least one `questions.water` entry.
- `judged` seeds have a `rubric` and `prompts`; `artifact` seeds have `prompts`.
- No distractor equals the answer.

## Writing good seeds

- **A seed is a thing you can root**, not a chapter. "Raft" is a seed; "Chapter 9" is not.
- **Layer by what it is**, not how hard it is. GC internals are `root` even if they are easy for you.
- **Questions teach.** `why` is shown after every answer. Write it so a wrong answer still ends with understanding.
- **Distractors are plausible.** The wrong options should be things people actually believe.
- **Cite, never paste.** Questions are original. `source` points at where to read more.
- **Prefer judged over recall** once a seed is past tier 1. Multiple choice is for recall only.

## Making a pack for a new goal

By hand, from this file. Or with the **pack forge** (Phase 2): paste a syllabus or three job descriptions into the prompt template with your own key, get a draft that passes the validator, prune it, open a PR.

## Licence

Packs are content and are licensed CC-BY-SA 4.0 (`packs/LICENSE.md`). By contributing a pack you agree to that.
