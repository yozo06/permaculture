# A field of your own

The seven ready-made fields are one person's subjects. A field of your own is for yours: type what you want to learn, paste whatever you already have, and the game turns it into topics you can plant.

Nothing here uses AI, an account or a server. The reading is done by rules, in your browser, and your topics are kept in your farm's own log.

## What you can paste

Anything with one topic to a line works. The reader also understands the shapes below, and it tells you what it made of them before you add anything.

| What you have | What the game makes of it |
|---|---|
| A plain list, one topic to a line | One topic for each line. Bullets, numbers and tick boxes are taken off the front. |
| One line of commas, or "algebra and geometry and trigonometry" | One topic for each thing. |
| A syllabus or a contents page: units, chapters, numbered sections, indented lines | The lines with nothing under them are the topics. What stands over them is their group, and one heading over everything is the title. Page numbers, dot leaders, "(8 hrs)" and the list of text books are left out. |
| Notes in Markdown: headings with text under them | A heading with running text under it (a sentence or more) is a topic, and the text is its line on what to read. Short lines under a heading are read as topics of their own, with the heading as their group. Code blocks are skipped. |
| "Recursion - a function that calls itself" | A topic, with the second part as the line on what to read. |
| Short pairs: "Hund - dog", "Brot = bread" | Question cards, up to eight to a topic. |
| A file of flashcards from Anki or Quizlet, a spreadsheet saved as CSV, a Markdown table | Question cards. The first two columns are the question and the answer. |
| "Q: ..." with "A: ..." under it, or "What is the capital of France? Paris" | Question cards. |
| What an AI chat wrote for you | The same as any of the above. The usual opening and closing lines ("Here is...", "Let me know...") are dropped. The add sheet has a prompt you can copy into any AI chat to get a list in a shape that reads well. The game itself never talks to one. |

Lines in two parts can be read two ways, as cards or as topics with a note. The reader decides heading by heading. The pairs under one heading are cards when there are three or more of them, nearly all are short (a few words after the mark), and they are most of the lines there. Pairs written with a tab, in a table, or as a question and its answer are always cards. The add sheet lets you overrule it either way.

What the reader leaves out, and the names it shortens, it says under "Check these". The rules are in `src/engine/reader.ts`, and `src/engine/reader.test.ts` has the pastes they came from.

## How a topic is played

A topic of your own is planted, watered and harvested like any other. The reader guesses what kind of thing it is from the words in its name, and you can change that from the learning tree. The kind decides the rest:

| Kind | Drawn as | Watered by | Harvested by |
|---|---|---|---|
| An idea to understand | a bush | explaining it in writing | a write-up |
| Facts to remember | ground cover | explaining it in writing | a write-up |
| A skill to practise | a herb | saying what you did today | proof that you did it: a link, or a few words |
| A rule or a pattern | a small tree | explaining it in writing | a write-up |
| The big picture | a tall tree | explaining it in writing | a write-up |

**Cards.** A topic of any kind that has cards is watered by answering them, with one explanation in writing before the harvest, and harvested by them too. At the harvest a card is asked the other way round, from its answer, when its question is a short name; a card that is itself a question is asked as it is. A card needs wrong answers to choose between. They are borrowed from the other cards of the same topic, and then of the same field. A card with fewer than two to borrow is not asked, and its topic is explained in writing instead.

**No end.** A field of your own has no readiness, no bar and no layer that waits for another. You decide how much is enough. Its topics have no prerequisites, guilds, edges, wild finds or saplings.

**Land.** Fencing in a tile for a field of your own costs 15 coins wherever it is, less than for a ready-made field, because it has no guilds or edges to help pay for its land.

**What it does not count for.** A tree in a field of your own does not help earn a Workshop seed, and a field of your own is not shown in a farm link.

## Limits

A farm has room for 9 fields in all, and a field of your own for 150 topics, each with up to 10 cards. A saved farm may hold more than that (up to 20 fields of your own and 300 topics in each), so these numbers can be raised later and never have to be lowered under anyone's farm.

A topic takes about ten days to grow from seed to tree, and you can plant two new ones a day. A long list is months of work. Cards are quicker to water than a topic you explain in writing.

## Where it is kept

In the farm's log, beside everything else you did:

| Event | What it does |
|---|---|
| `own-field-set` | Makes a field on a plot of land, or renames it where it stands. |
| `own-seeds-set` | Adds topics to a field, a batch at a time. A topic that is there already is changed in its place. |
| `own-seed-removed` | Takes away a topic that was never planted. |
| `own-field-removed` | Takes away a field with nothing planted in it, and its land. |

So an exported farm carries its own topics, and a farm is replayed against its own fields as they stood at each moment. The log holds only what you gave: a name, a kind, a line, a group and cards. The layer, the rubric, the harvest and the wrong answers are worked out from those every time (`src/engine/own.ts`), so a farm file cannot carry a rule of its own making. Text with characters that cannot be seen (control characters, zero-width spaces, the marks that turn text round) is refused, and a colour that is not a plain hex colour is not a field's colour.

## Not here yet

- Prerequisites between your own topics, and guilds.
- A whole pack of your own, loaded as a file.
- Your own fields in a farm link.
