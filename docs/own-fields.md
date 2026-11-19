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
| "Which species has more caffeine? = Robusta \| Arabica \| Liberica \| Excelsa" | A question card with its own wrong answers: what follows the answer, each after an upright bar. Three are kept. |
| "Part: ...", "Topic: ...", and under a topic "Read: ..." and question lines | A topic for each "Topic:", grouped by its "Part:", with the "Read:" line as what to read and the questions as its cards. |
| A heading with a sentence under it and then cards | One topic, with the sentence as what to read and the cards as its questions. |
| What an AI chat wrote for you | The same as any of the above. The usual opening and closing lines ("Here is...", "Let me know...") are dropped, and a list handed over in a block of code is read as the list. The game itself never talks to one. |

### Questions from an AI chat

A topic with question cards is watered by multiple choice. A topic with none is watered by explaining it in writing, which is slower and asks more of you. If you would rather be asked, let an AI chat write the questions:

1. On the add sheet, write in the box what you want to learn, in your own words. This is optional.
2. Press **Copy a prompt for an AI chat** and paste the prompt into any chat. It asks for a list of parts and topics, and under every topic a line on what to read and four to six questions, each with its right answer and three wrong ones.
3. Paste the chat's answer into the box. The sheet shows what the game made of it, and says so if any topic came without questions.

A field that already has topics with nothing to ask can get them questions the same way: the add sheet then has a second button, **Copy a prompt for questions on your topics without any**. Paste the chat's answer, and each of those topics takes its questions and keeps everything else, whether it is planted or not.

The prompt asks for the list in words ("Part:", "Topic:", "Read:") and not in Markdown marks, because a chat's page turns "## heading" into a plain line before you copy it.

### Lines in two parts

Lines in two parts can be read two ways, as cards or as topics with a note. The reader decides heading by heading. The pairs under one heading are cards when there are three or more of them, nearly all are short (a few words after the mark), and they are most of the lines there. Pairs written with a tab, in a table, as a question and its answer, or with wrong answers after the answer are always cards. The add sheet lets you overrule it either way.

What the reader leaves out, and the names it shortens, it says under "Check these". The rules are in `src/reader/read.ts`, and `src/reader/read.test.ts` has the pastes they came from. The reader knows English words only for now ("Week 3", "Total: 45 hours"); a list in another language still reads by its shape. `src/reader/README.md` describes the reader by itself.

## How a topic is played

A topic of your own is planted, watered and harvested like any other. The reader guesses what kind of thing it is from the words in its name, or failing that from the line on what to do ("practise ..." is a skill), and you can change that from the learning tree. The kind decides the rest:

| Kind | Drawn as | Watered by | Harvested by |
|---|---|---|---|
| An idea to understand | a bush | explaining it in writing | a write-up |
| Facts to remember | ground cover | explaining it in writing | a write-up |
| A skill to practise | a herb | saying what you did today | proof that you did it: a link, or a few words |
| A rule or a pattern | a small tree | explaining it in writing | a write-up |
| The big picture | a tall tree | explaining it in writing | a write-up |

**Cards.** A topic of any kind that has cards is watered by answering them, with one explanation in writing before the harvest, and harvested by them too. At the harvest a card is asked the other way round, from its answer, when its question is a short name; a card that is itself a question is asked as it is. A card needs wrong answers to choose between. It is asked with the ones it came with, up to three. What it is short of is borrowed from the other cards of the same topic, and then of the same field. A card with fewer than two in all is not asked, and a topic with no card that can be asked is explained in writing instead. You can change a topic's cards, wrong answers and all, from the learning tree.

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
