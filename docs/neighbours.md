# Neighbours — design

**Status: approved on 2026-11-11.** Step 0 (safe saves) and step 1 (see) are built, in version 0.2.0. Step 2 (rain) is built after a first week of beta, so it can be shaped by what testers did.
Before approval the design was read once by a builder and attacked once from four sides (privacy, hostile links, first run and saves, engine rules); what survived those checks is folded in.
The rules of the game itself are in `design.md`; the wider plan is in `../ROADMAP.md`.

## 1. The first week

You publish the game and post one message where your friends already talk: a link to your farm.

Asha taps it on her phone. The game opens on *your* farm: the fields, the trees you have rooted, the crops still growing, and one line, "Yozo's farm, day 34". She looks around, then starts her own farm next door. It asks what she wants to grow and she ticks Kannada, not Haskell. By Sunday there are four farms. Nobody is ranked.

On Tuesday you have a long day and water nothing. Overnight nothing wilts: the rain barrel had a day to spend, because that afternoon Asha answered a Backpressure card on your farm and sent you rain. On your Backpressure's sheet it says "Asha watered this on day 36". You open her farm, see she has planted Consistent hashing, and plant it too.

That is the whole feature: **farms you can see, and rain you can send**. No server, no accounts, nobody ranked.

## 2. Decisions taken

Four things in this design change a promise or need the owner's account. They were decided when it was approved:

1. **A sent farm link cannot be taken back.** `design.md` used to promise a snapshot that is "opt-in, revocable". Without a server that is not possible: a link is a photograph, and whoever has it keeps it. This design softens it (you choose which fields each link shows; it never updates by itself; a neighbour's game forgets a picture after 60 days), and real take-backs arrive with the server.
2. **New farmers choose their fields.** A farm used to get a field for every pack, the Workshop included. A Kannada learner should not start with six fields of backend engineering. Farms that exist keep all their fields.
3. **Neighbours before the AI phase.** The first half of the village is pulled forward.
4. **The village green.** One pinned GitHub Discussion where people post their farm links to find neighbours. The owner sets it up and invites the first three to six people.

One smaller thing is still open: the Workshop seed `snapshot` says the picture is published "to a free KV store". This design needs no store. The seed's wording is the owner's call and has not been touched.

## 3. Why, and what for

The owner asked for "a version where others can play along or do beta testing together as neighboring farmers/learners", and for whatever is "better if I want more people to use it".

**Goals**

- A person you know can start a farm and be your neighbour within a minute of tapping a link, on a phone, with no account.
- You can see a neighbour's farm, and do one kind thing for it.
- Each player is a way in for the next one: a farm link is the front door to the game.
- The beta can be run: bugs come back with a version on them, and there is one place to meet.
- Nothing here has to be thrown away when a server arrives.

**Not in this design** (deliberately)

- A server, accounts, sign-in, or any hosted store.
- Live presence, chat, messages, feeds, notifications.
- Leaderboards, totals side by side, or any ordering of people.
- Trading seeds or coins, shared farms, neighbours using packs that are not in the game.
- Tracking or analytics. We learn from what testers tell us.

**What would make it a failure even if it worked**

- A neighbour seeing your notes, your wrong answers, your compost heap or a wilted crop.
- A link that shows more than the game told you it would.
- Anything that shames absence ("Asha has not watered in five days").
- Rain that grows a crop for you. Learning stays yours.
- Visiting turning into a daily chore you do to keep up.

## 4. What is fixed

From the project's standing rules: no leaderboards, no accounts, no server, no paid services, no AI calls. The game is static files on GitHub Pages. The Workshop pack only gains seeds. From `docs/design.md`: a farm is a log in the player's browser; the snapshot is "the map and the trees, never the compost heap or failed answers"; the rival is last-month-you.

## 5. How it works

### 5.1 A farm link

In the game you **name your farm** and make a **farm link**. The link holds a picture of the farm as it is today, for the fields you tick. Before you send it, the game shows you exactly what it holds. A farm needs a name before it can share or send rain; the game asks the first time, and the name can be changed later.

The picture is *in the link itself*, in the part after the `#`, which browsers never send to a server. Nothing is uploaded and the game makes no network request for it. You send the link yourself, in whatever chat you already use. That is the whole transport: people carry the links.

The Share sheet makes the picture, opens it the way a neighbour's game would, and shows you that: what you see is what they will get. If hiding fields means a fenced tile or a crop will not fit (section 6), it says how many before you send. It also says, in plain words: every link from this farm carries the same farm code, so anyone who holds two of your links can put them side by side, and a link posted in public stays public.

It follows that a link is a photograph. It shows the day it was made and never changes. To show neighbours your progress you send a new one; their game keeps whichever picture of your farm was made later.

### 5.2 The gate

A **gate** stands where the main path meets the west edge of the homestead (tile 4,9: a path tile, so no farm can have anything there). Tapping it opens **Neighbours**:

- your farm's name, and **Share my farm**;
- your neighbours, in the order you added them, each with its name, its day, and how old the picture is;
- for each: **Visit**, **Remove**, and, if you earned rain for them today and have not sent it, the rain link again;
- **Paste a link**, for when a link was opened in the wrong browser;
- a line pointing at the village green.

There is no sorting, no counts side by side, and at most 24 neighbours. A neighbour whose picture is more than 60 days old stays on the list by name, with "No recent picture. Ask for a new link.", and cannot be visited until one arrives.

### 5.3 Opening a farm link

- **You already have a farm.** A sheet says whose farm it is and offers *Add to my neighbours* or *Just look*.
- **You have never played.** The game opens on the sender's farm with one sentence about what you are looking at, and *Start my own farm*. Starting asks what you want to grow, with the fields from the picture already ticked. The sender becomes your first neighbour.
- **It is a picture of a neighbour you have.** It replaces the one you hold only if it was made later. If it was made earlier, or at the same moment, the game says "You already have a newer picture" and changes nothing. An old link tapped again in a chat can never roll a neighbour back, or bring back a field they have since hidden.
- **It was made more than 60 days ago.** It is not kept: "This picture is too old. Ask for a new link."
- **It is your own farm**, or it cannot be read: a plain message, nothing changes.

A link that arrives while you are in the middle of writing waits until you have finished. It never replaces a sheet that holds a draft.

### 5.4 Visiting

**Visit** shows the neighbour's farm on the canvas the way you see your own, read-only: same ground, same sprites, their layout. A banner says whose farm it is, its day, and how old the picture is, with *Back to my farm*. The seed bag, the tree and Sleep are out of reach while you are there.

Tapping a crop or a tree opens its sheet: the seed's name, its field, how far it has grown, and how it stands on your own farm ("You grow this too", "In your seed bag", or "Locked: needs Replication"). Seeing what a friend grows is how you find what to plant next.

### 5.5 Rain

On a neighbour's crop whose seed has cards, the sheet offers **Water it for Asha**. It costs what a watering costs. You answer one card from that seed, drawn from your own copy of the pack: its recall cards, or for a tree its harder harvest cards when it has them, the same rule a perennial check-in follows. A seed with no cards (the Workshop's) cannot be watered by a visitor.

- **Right:** the game makes a **rain link**. You send it to Asha.
- **Wrong:** you see why, as with any card. No rain.

Either way that is your one visit to that neighbour for the day.

When Asha opens the rain link, her barrel gains a day and the crop remembers: "Yozo watered this on day 36". If her barrel is already full the rain runs off, and the visit is remembered all the same. Opening the same rain link twice does nothing the second time. That is all rain does.

The two halves are separate on purpose. The rain goes into the barrel, which covers whichever crop next needs it, as it always has. The crop you answered about only keeps the memory of the visit. So a tree can be watered too: a tree never needs the barrel, but the rain still helps the rest of that farm, and on a farm that is mostly trees there would otherwise be nothing to water. It never grows a crop and never counts as a watering; it is a friend covering for you on a bad day, which is what the barrel already means.

Rain is on the honour system. Anyone who knows your farm code could make a rain link by hand. It gains them nothing, and the only person you can cheat is yourself.

There is no message on the rain. The chat you send it in is the message.

### 5.6 Choosing what you grow

A new farm starts with the fields its farmer ticks, not with every pack. Each pack is shown with its one-line description; at least one must be ticked; nothing is ticked for you unless you arrived by a farm link. The Workshop is one of the choices, described as what it is: helping to build the game. An unopened pack can be opened later from its tab in the learning tree. Farms that already exist keep every field they have, the sample farm keeps the four fields it was made with, and a pack added to the game later is offered, not forced.

The engine already opens a field with an event of its own, so the main change is in the store, which today opens a field for every pack when a farm begins and again on every page load. The engine needs three small checks, because until now it could assume every pack had a field:

- Wild finds come only from packs whose field is open. (Kannada has two finds; a Kannada-only farm must not then be handed Haskell's.)
- A wild seed can be domesticated, and a locked seed tested out of, only in a pack whose field is open.
- In the learning tree, the tab of an unopened pack shows what the pack is and one action, *Open this field*. The tree opens on a pack you have.

No farm that exists is affected: every one of them has every field.

- **A farm with no fields is a farm that has not been set up.** A new farm still begins at once, as today, with its starting numbers and an empty homestead. Until it has a field, the game shows the welcome sheet with the field picker. Closing the tab half way through simply shows it again next time. There is no separate "no farm yet" state and no new marker in the log.
- **Arriving by a farm link with a farm that has no fields** is what "never played" means in section 5.3.
- **The game never opens a field by itself again**, on load or anywhere else. Farms that exist already have their fields in their logs, so nothing changes for them.
- **The sample farm and farms brought over from the Phase 0 prototype** keep the four fields they were made with. Today they are given the rest as well, so this is a change. The other packs are offered in the learning tree like any unopened pack.
- **Reset** offers the same two choices as now. "Start fresh" leads to the picker.
- The welcome sheet keeps "Try the sample farm" beside the picker.

### 5.7 The village green

One pinned Discussion in the repo. People post a farm link and a line about what they are growing. The README and the Neighbours sheet point at it. No code.

### 5.8 Links that look right in a chat

The page gets a title, a sentence and a picture for link previews. Every link shows the same preview, because the part after the `#` is never sent. The picture is the farm screenshot from the README.

## 6. What crosses the fence

| | In a farm link | In a rain link |
|---|---|---|
| Farm name and farm code | yes | yes (the sender's) |
| The farm's day, and when the link was made | yes | no |
| Which fields you chose to show, and the shape of their fenced land | yes | no |
| Each crop in those fields: seed, its place within its own field, the furthest it has ever grown, whether it is a tree | yes | the one seed |
| Where a field sits on your map, or its plot number | **never** | no |
| The version of the game that made it | yes | no |
| Notes, explanations, write-ups, the journal | **never** | **never** |
| Wrong answers, the compost heap, whether a crop is wilted, when it is due | **never** | **never** |
| Coins, energy, the barrel, focus, foraged finds | **never** | **never** |
| Fields you did not tick | **never** in that link (not even that they exist) | no |

A wilted crop is drawn like any other. The game says all of this in plain words on the Share sheet.

**A picture shows the furthest each crop has ever grown, not where it stands today.** A wrong answer drops a crop a stage, and so does a failed harvest. If a picture carried today's stage, two pictures a week apart would show the drop, and that is a wrong answer crossing the fence by the back door. So the farm keeps each crop's best stage, and that is what a picture holds. From one picture to the next a crop can only stay or grow. The best stage comes from the farm's own history, so it is the same in every browser and survives an export.

What one link cannot do is hide what an earlier link showed. Every link from a farm carries the same code, so someone holding an old link that showed a field and a new one that hides it knows the field is there. "Never" in this table means never in that link.

Plot numbers are left out for a reason. Fields are given their plots in a known order, so a gap where a hidden field sits would say which field it is. A picture therefore holds each shown field by itself, and the game that opens it lays them out side by side from the first plot. When you show every field, a neighbour sees your farm as it is. When you hide some, the ones you show close ranks.

## 7. Rules and numbers

| Rule | Value |
|---|---|
| Farm name | 1 to 24 characters |
| Visit a neighbour | 6 energy (a watering); once per neighbour each day |
| Rain from a neighbour | +1 day in the barrel, up to its 5; once per neighbour each day |
| Neighbours | at most 24 |
| A neighbour's picture | forgotten by your game 60 days after it was made |

"Day" is the farm's own day, the one Sleep advances; the engine has no clock. The 60 days are calendar days and are checked outside the engine.

## 8. For the builder

### 8.1 The links

`<the game's own address>#farm=1.<payload>` and `#gift=1.<payload>`. The address is wherever the game is running, so forks and `localhost` work. `1` is the format; the payload is base64url of UTF-8 JSON. No compression in format 1; a later format may add it, and format 1 links must stay readable for good.

Farm picture:

```json
{ "code": "0k7f3q9xw2m4a", "name": "Asha", "day": 34, "at": "2026-11-20T14:05:09Z", "game": "0.2.0",
  "fields": [
    { "pack": "system-design", "land": [[3, 0], [3, 1]], "crops": [["raft", 0, 1, 4, 1], ["cap", 3, 0, 2, 0]] },
    { "pack": "kannada", "land": [], "crops": [] }
  ] }
```

The values are for illustration; do not use them as a fixture.

- `fields` is a list, in the order of the farm's own plots, of the fields the farmer chose to show. It holds **no plot numbers and no map positions** (section 6 says why).
- `at` is the moment the link was made, in UTC to the second. It decides which of two pictures is the newer (section 5.3) and when the 60 days are up.
- Every position is counted from its own field's corner: `[0, 0]` to `[2, 2]` is the field's first nine tiles, and a fenced tile lies outside that square, so a number may be negative. `land` lists the fenced tiles; a crop is `[seed, east, south, best stage 0–4, 1 if a tree]`. The stage is the furthest the crop has ever grown (section 6), never today's.
- The game that opens a picture gives the listed fields plots 0, 1, 2… in order and puts each field's tiles and crops back relative to that plot's corner. A farm shown whole, whose fields sit on plots 0 to n−1, comes out exactly as it is.

Rain:

```json
{ "id": "g-4f9k2m8qx1", "to": "0k7f3q9xw2m4a", "from": "0p2c8v5n1ya7d", "name": "Yozo", "seed": "raft" }
```

**The farm code** is the 64-bit FNV-1a hash of the UTF-8 bytes of the id of the first event in the farm's log, written in base 36, lower case, padded on the left with zeros to 13 characters. This recipe is permanent. Hash the whole id, never a prefix of it: when the browser cannot make a UUID the id begins with the time.

- It needs no new storage, is the same for the life of the farm, and travels with an export. A farm imported into a second browser is the same farm and has the same code; a newer picture simply replaces an older one.
- **Reset makes a new farm**: a new code, and no name until it is given one. Neighbours meet it as a new farm when they are sent its link, and rain made for the old code is refused. The list of neighbours belongs to the browser, not to the farm, and is kept.

### 8.2 Links are untrusted

A link comes from someone else. Read it the way `fromV2` reads an old save: keep what is usable, drop the rest, never throw.

- Refuse a payload over 16 KB before decoding it, and a picture with more than 400 crops.
- A name is plain text of 1 to 24 characters after trimming. Escape it everywhere it is shown; it never reaches the page as markup.
- `code`, `from` and `to` are exactly 13 characters of `0-9a-z`. A rain's `id` is at most 40 characters of `0-9a-z` and `-`. `day` is a whole number, 1 or more. `at` is a real UTC date and time, no later than a day ahead of this browser's clock. A link that fails any of these cannot be read, and that is all the player is told.
- A field must be a pack this game knows, listed once. A position is a whole number from −40 to 45, which leaves room for a world a few packs larger than today's, and a field has at most 60 fenced tiles.
- Once the fields are laid out, a fenced tile is kept unless it is off the map, on a building, or already another field's; the earlier field in the list wins. A tile that lands on a path is kept and drawn as soil. Tiles are only ever lost this way when hidden fields have made the others close ranks, and the Share sheet has already told the sender (section 5.1).
- Say why a crop was dropped. "Did not fit" and "needs a newer version of the game" are different messages; do not send a tester looking for the wrong cause.
- A crop must be a seed this game knows, standing on a tile of its own pack's field in *that picture's* layout, one per seed and per tile. Drop the others and say how many ("3 crops need a newer version of the game").
- A rain link is accepted only if `to` is this farm's code. Otherwise: "This rain is for another farm. Open it in the browser where your farm lives."
- Neighbours read back from the browser's storage are checked the same way.

### 8.3 The engine

Three new events, each with a check, an effect, unit tests and a place in the property test, as `CONTRIBUTING.md` asks.

| Event | Allowed when | Effect |
|---|---|---|
| `farm-named { name }` | the name is 1 to 24 characters after trimming | the farm's state carries the name |
| `visited { farm, seed, ok, gift? }` | the seed is in the packs and has cards; 6 energy is there; that farm has not been visited today | spends 6 energy, charged to no field (as foraging is); notes the farm as visited today. `gift` is the rain's id when `ok`, so the link can be shown again from the log |
| `gift-received { gift, from, name, seed }` | that seed is planted here; this gift id is new; no rain from that farm yet today | barrel +1 up to its max; the crop gains a visit `{ day, name }` (keep the last 10); the id is remembered for good |

The engine cannot know this farm's code or who the neighbours are. Checking `to` and reading links belong to the game.

What arrives in a link is written by someone else and ends up in the log for good, so the engine's own checks bound it, as they bound a player's writing today: a `name` is 1 to 24 characters after trimming, `farm` and `from` are 13 characters of `0-9a-z`, and a `gift` id is at most 40. An event that fails is refused like any other.

**Each crop also remembers its best stage**: the furthest it has ever grown. It rises when the crop grows and never falls. It is what a picture holds (section 6). A crop from a Phase 0 save starts with its best stage equal to its stage.

Making a picture from a farm, reading one that could be anything, and turning one into a state the canvas can draw are pure functions with property tests: a picture survives a round trip, junk never throws, and what comes out is always a farm that makes sense. Base64 and the address bar stay in the game layer.

New numbers go in `RULES`. The Numbers table in `docs/design.md` is pinned row for row by a test, and the Almanac is built from `RULES`, so the three change together.

### 8.4 The game

- **Neighbours are not part of the farm.** They live under their own key in the browser, like the screen state, not in the log: they are an address book, and a picture in the log would be rewritten to storage on every action. They are not in the export. Your farm's name, your visits and the rain you received are events, so they are.
- **The store stops opening fields by itself** (section 5.6). That is two places today: when a farm begins, and on every load. A test pins the present behaviour ("a field for every pack") and changes with it. Opening a field from the picker or the learning tree is an ordinary `field-opened` event on the next free plot.
- **Visiting draws another farm with the same renderer.** `game.ts` draws from one module-level state today. How to show a second one is yours to decide; what matters is that every tap while visiting is routed by mode and can never reach the store, and that your own camera position is put back afterwards.
- **`game.ts` has no tests.** Put every decision in a pure module that has them (what the Share sheet will send, what a neighbour's crop sheet says, whether a link may be opened now) and keep `game.ts` to drawing and wiring.
- **Arriving by link.** Read the part after `#` on load and when it changes; clear it once handled so a reload does not ask again.
- **Sharing** uses the phone's share sheet where there is one, and copy-to-clipboard with a visible box otherwise.
- **Phones first.** Most links are opened on a phone. Check the whole arrival at 375 pixels wide.

### 8.5 Tests the design depends on

- **Privacy.** Build a farm with marker text in its notes, an explanation and a write-up, a wilted crop, something in the compost and a field left unticked. The link must contain none of the markers, no trace of the unticked field, and nothing that tells the wilted crop from a healthy one.
- **Privacy over time.** Make a picture; then get a card wrong on one crop and fail a harvest on another; make a second picture. No crop's stage is lower in the second than in the first.
- **Hiding fields.** A farm with fenced land on an outer field and an earlier field hidden: the Share sheet's count of what will not fit matches what the reader drops.
- **Hostile links.** A name made of markup comes out escaped in every neighbour sheet; an oversized link is refused; a crop off its field is dropped; a name, code or id that is too long is refused by the reader and, if it reaches the engine, by the engine.
- **Newer wins.** An older picture never replaces a newer one, and one made over 60 days ago is not kept.
- The three events: the allowed path and each refusal; replay stays deterministic with them in play.

## 9. Before anyone else has a farm

The Phase 1 review found that a saved farm is replayed against today's packs and rules, and that anything which no longer fits is dropped without a word. With one player that is a risk. With ten it is a certainty that someone's farm will be hurt by a well-meant edit. Four small guards, none of them a server:

1. **A lock on what saved farms depend on.** A committed list of every pack, branch, seed and find id, with, for each seed, its pack, what it needs, its harvest type and whether it is wild; for each find, the seed it leads to; for each pack, its energy cap. A test fails if anything on the list has gone or moved, and if a new id is not on it yet. It also fails on a change that makes an old event refusable: a seed whose needs or wildness changed in either direction (a seed that needs *less* turns a past jump over the fence into one the game refuses), a seed that goes from artifact to a longer write-up, a find that leads somewhere else, a cap that is lowered or added. Growing stays free. `docs/pack-format.md` already states these rules in words; this makes them a red build. Renaming a seed to fix a typo stops being a quietly emptied field.
2. **A played farm that must always replay.** A committed log of a farm played for the purpose (not anyone's real farm: a real log holds its owner's notes), which a test replays with nothing refused and checks a few facts at the end: the day, the coins, the number of crops. A change to a rule's number or to a pack that would drop something from a real farm's history turns the build red, and the fixture is only updated on purpose. A second, small farm stands exactly on each limit (notes of exactly 40 characters, a night that ends on exactly 30 energy), because a farm played normally clears every limit by a wide margin and would not notice one move. This is the guard for `RULES`, which the lock cannot see.
3. **A drift alarm.** On load and on import, count the entries in a farm's history that today's rules refuse. A healthy farm has none. If there are some, say so, and on import say so *before* the farm in the browser is replaced.
4. **No farm lost to one number.** A farm's first event is refused today if its barrel is above the barrel's maximum, which would empty the whole farm if that number were ever lowered. Clamp it instead, as energy already is.

Because neighbours exchange *pictures*, not logs, a neighbour's farm is never replayed on your machine. A seed your game does not know is skipped and counted. That is the main reason for sharing a picture rather than the log.

## 10. Order of building

Each step leaves the game playable and ends with something a friend can use.

| Step | What | A friend can then… |
|---|---|---|
| 0 | Safe saves: the four guards in section 9 | play without a later edit hurting their farm |
| 1 | See: farm names, farm links with their field choice, the gate and Neighbours, opening a link, visiting read-only, choosing fields at the start, link previews | open your link, look round your farm, start their own, and send theirs back |
| — | *The beta's first week can start here.* | |
| 2 | Do: visit-and-water, rain links, rain in the barrel, the visit remembered on the crop; the Almanac and `docs/design.md` updated | water one of your crops and send you rain |

Step 2 after a week of step 1 means the rain is shaped by what the first testers actually did. The Workshop seed `snapshot` is harvested at the end of step 1, `visit` at the end of step 2. One seed is added for step 0.

Plan steps 0 and 1 in full. Step 2 is described here so that step 1 leaves room for it (the farm code, the link format, the crop sheet on a neighbour's farm), and gets its own plan after the beta week. The village green and the wording of the Workshop seed are the owner's and sit outside any plan.

## 11. Calls made in this design

The owner asked for other people playing alongside as neighbouring farmers and learners, set the fixed constraints in section 4, and left the shape to the designer. These are the calls that were made, so that anyone can question one:

1. Links carried by people, with the picture inside the link, rather than a hosted store or the repo as a register.
2. Rain as the gift: a barrel day and a remembered visit. Not coins, not a real watering, not a note.
3. A visit costs a watering (6 energy) and pays the visitor nothing. No coins, so it never becomes a round to do each morning.
4. One visit to, and one rain from, each neighbour each day.
5. No message on rain. The chat carries it.
6. You choose which fields each link shows.
7. A neighbour's picture is forgotten after 60 days.
8. Rain is accepted from any farm, neighbour or not, so a first hello works.
9. Neighbours are kept outside the farm's log and its export.
10. The neighbour's farm is drawn with the real renderer, not a thumbnail. It costs more to build; it is what makes a link worth sending.
11. A gate on the map rather than a fifth button in the bar.
12. No compression in the first link format.
13. The 24, 60 and 16 KB limits.
14. The four guards of section 9 come first.
15. Stopping after step 1 to run a week of beta before building rain.
16. A picture holds no plot numbers or map positions, so hidden fields leave no gap. The price: with fields hidden, the shown ones are not where they are on your own map.
17. A farm with no fields is "not set up yet". No new state, no new marker.
18. The sample farm and Phase 0 farms keep their four fields instead of being given all seven.
19. The exact recipe for the farm code, and that the list of neighbours survives a reset while the name does not.
20. A tree can be watered by a visitor, though a tree itself never needs the barrel.
21. A picture shows the furthest each crop has ever grown, not where it stands today, so that no pair of pictures can show a wrong answer. A neighbour therefore sees your farm slightly at its best.
22. The link carries the moment it was made, to the second, so that a newer picture always wins and an old link can never undo a correction.
23. What a link holds is bounded and checked twice, by the reader and by the engine.
24. The lock covers everything a saved farm depends on, and a played farm must always replay.

## 12. What changes in the other docs

- `docs/design.md` §8: the Village paragraph splits in two. **Neighbours**: farm links, visits and rain as above, with the honest line that a sent link cannot be taken back and never updates by itself. **Village**: later, a server that holds the same pictures and delivers the same rain, where a published picture can be withdrawn. Not before there are players who need it.
- §6: "one field per pack" becomes "a field for each pack the farmer chose".
- §9: Neighbours becomes the next phase, the AI phase follows.
- §3 Numbers: the new rows from section 7.
- The Almanac: a Neighbours section, a line for the gate under Buildings, and "the village" in *Not here yet* becomes "the village server".
- README: a short "Play with neighbours" section and the village green link.
- Workshop pack: one added seed for safe saves. The `snapshot` wording is left as it is.

## 13. Other ways that were looked at

| Way | Why not now |
|---|---|
| A free hosted store (what the Workshop seed says) | It is a server: an account for the owner, quotas, an open door for anyone to write to, and other people's data to look after. The project's rules rule it out. |
| The repo as the village: pictures committed by pull request | Public by default, slow, needs a GitHub account and a review for every refresh, and pictures go stale faster than they can be merged. Could come later as an opt-in public square. |
| GitHub's API as a back end | A server by another name, with rate limits, and the game then depends on someone else's API staying the same. |
| Peer to peer | Needs a server to introduce the peers, and both people online at once. |
| A thumbnail instead of the real farm view | Cheaper, and the fallback if step 1 runs long. It loses the moment the design is built around: the game opening on a friend's living farm. |

## 14. Known rough edges

- **In-app browsers.** A link opened inside Instagram or Telegram runs in that app's own browser, which keeps a separate farm from Safari or Chrome. *Paste a link* and the "this rain is for another farm" message are the answer for now.
- **Stale pictures.** A neighbour sees your farm as of your last link. The Neighbours sheet says when you last made a link, and that a picture already sent stays as it is until someone opens a newer one. The game cannot know who has opened what, and nothing nags.
- **Long links.** A big farm makes a link of a few thousand characters. Browsers and the main chat apps carry that; the beta should try WhatsApp, Slack, Telegram and Messages.
- **The untested file.** Visiting touches `game.ts`, which has no tests. Section 8.4 is how that risk is kept small; a browser pass on a phone-sized screen is part of each step.
- **Packs are the ceiling.** People stay if there is a pack for their goal. That is outside this design. For the first week, the people invited should want the packs that exist.

## 15. How we will know it worked

After the first week, by asking, not by tracking:

- Three or more people besides the owner have kept a farm for a week.
- Each has at least one neighbour.
- Nobody's notes, wrong answers or wilted crops were ever visible to someone else.
- Bugs arrived as issues with a version on them.
- Someone planted something because a neighbour was growing it.

And after step 2: rain has been sent and received, and nobody describes visiting as a chore.
