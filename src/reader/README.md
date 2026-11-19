# The reader

It takes whatever a learner already has and reads it into topics and question cards: a list of topics, a syllabus, a contents page, notes with headings, a word list, a file of flashcards, or what an AI chat wrote for them. It works by rule. There is no AI in it and it asks nothing of the network.

It was written for Permaculture, where each topic becomes a crop. Nothing in this folder knows about the game, and the game takes it only from `index.ts`. It is not published as a package yet. It needs nothing installed. It runs in a browser once built, and as it is in Node 22.18 or later, which runs TypeScript files directly.

## An example

This text:

```text
Learning German

## Week 1: First words
Hund - dog
Katze - cat
Brot - bread

## Week 2: Grammar
- The dative case: read chapter 4
- Practise ordering a coffee
Total: 6 hours
```

read like this:

```ts
import { read, say } from './index.ts'

const draft = read(text)
draft.notes.map(say)
```

comes back as this:

```json
{
  "title": "Learning German",
  "topics": [
    {
      "name": "Week 1: First words",
      "summary": "3 cards: Hund, Katze, Brot",
      "kind": "facts",
      "group": "",
      "cards": [{ "q": "Hund", "a": "dog" }, { "q": "Katze", "a": "cat" }, { "q": "Brot", "a": "bread" }]
    },
    { "name": "The dative case", "summary": "read chapter 4", "kind": "idea", "group": "Week 2: Grammar", "cards": [] },
    { "name": "Practise ordering a coffee", "summary": "", "kind": "skill", "group": "Week 2: Grammar", "cards": [] }
  ],
  "notes": [
    { "code": "course-left-out", "items": [{ "text": "Total", "under": 0 }], "more": 0 },
    { "code": "title-taken", "text": "Learning German" }
  ],
  "pairs": 4,
  "pairsAs": "cards"
}
```

and the two notes, said in English, are "Left out, as not something to learn: Total" and "Read as the title of the whole list, not as a topic: Learning German".

## What comes back

`read` takes a text and, if you like, settings: `read(text, options)`. It returns a draft. It never changes what it is given and never throws.

| Part | What it is |
|---|---|
| `title` | The one heading that stood over everything, or `''`. |
| `topics` | Every line that had nothing under it, in order. |
| `topics[].name` | What the topic is called. No two topics have the same name. |
| `topics[].summary` | What to read or do: the second part of "Recursion - a function that calls itself", the text under the line, a page number taken off its end. May be `''`. |
| `topics[].kind` | A guess from the words in the name: `idea`, `facts`, `skill`, `rule` or `whole`. A set of cards is `facts`. |
| `topics[].group` | The heading it stood under, or `''`. |
| `topics[].cards` | Question cards, each a `q` and an `a`. Short pairs, a table, or a question with its answer. |
| `notes` | What was shortened or left out. See below. |
| `pairs` | How many lines came in two parts. Where there are some, they can be read two ways. |
| `pairsAs` | How most of them were read: `cards` or `topics`. |

## Settings

All three are optional.

**`pairs`** is `'cards'` or `'topics'`. A line in two parts ("Hund - dog", "Recursion - a function that calls itself") is either a card or a topic with a line about it, and no rule can always tell which. Left alone, the reader decides heading by heading. Set, it reads every such line the one way. Show a person the draft and let them choose.

**`limits`** is how much each part may hold. Give only the ones you want changed; `LIMITS` holds the reader's own.

| Limit | Its own | Can be set from | What it limits |
|---|---|---|---|
| `title` | 60 | 12 to 400 | Characters in the title. |
| `name` | 48 | 12 to 400 | Characters in a topic's name. A longer one is cut at a word, and the whole line is kept in the summary. |
| `summary` | 300 | 12 to 10000 | Characters in the line on what to read. |
| `group` | 60 | 12 to 400 | Characters in a group's name. |
| `q` | 160 | 1 to 400 | Characters in a card's question. A pair with a longer side is a topic, not a card. |
| `a` | 120 | 1 to 400 | Characters in a card's answer. |
| `cards` | 8 | 1 to 1000 | Cards in one topic. Sixty words are eight topics, not sixty. |
| `lines` | 2000 | 1 to 20000 | Lines read. |
| `line` | 400 | 20 to 400 | Characters read of each line. |
| `notes` | 12 | 0 to 1000 | Notes handed back. The rest are counted in one more. |

A limit that is not a number is ignored. One outside its range is brought to the nearest end of it. No more of a line is read than 400 characters, because the rules were timed on lines up to that length.

**`words`** is the words of the language the text is in. See "Another language".

## Notes

A note is a code and what it counted or the name concerned. It carries no sentence, so a program can show it in its own words and its own language. `say` gives the English for one: `say(note)`.

| Code | Carries | When |
|---|---|---|
| `lines-cut` | `kept`, `of` | The text had more lines than are read. |
| `long-lines-cut` | `count`, `kept` | Some lines were longer than is read of a line. |
| `columns-left-out` | | Lines had more than two columns. The first two made a card. |
| `code-left-out` | `count` | Blocks of code between rows of backticks. |
| `wordless-left-out` | `count` | Lines with no letter or number in them. |
| `course-left-out` | `items`, `more` | Lines about the course and not in it: a total, a tip, a list of books. Each item has its `text` and how many lines stood `under` it. |
| `title-taken` | `text` | A plain first line was read as the title, so it is not a topic. |
| `wordless-name-left-out` | | A line in two parts whose first part has no letter or number. |
| `twice-left-out` | `text` | A topic or a card that was already there. |
| `name-shortened` | `text` | A name was cut. `text` is what it was cut to. |
| `summary-cut` | `text` | The line on what to read for the topic `text` was cut. |
| `text-left-out` | `count` | Headings had running text under them, which is not kept. |
| `more-notes` | `count` | There were this many notes more than were asked for. |

`NOTE_CODES` lists the codes.

## Another language

The rules are about shapes: a bullet, a heading, a line in two parts, a table. Those read the same in any script. A few rules need words as well: "Week 3" is a label, "Total: 45 hours" is not something to learn, "Practise ..." is something to do. Those words are kept apart from the rules, as plain lists, in `english.ts`.

English is the only language there is. To add one, copy the `ENGLISH` lists, write them in that language, and hand them over:

```ts
read(text, { words: SPANISH })
```

`words.ts` says what each list is for. In a list:

- a word is written as it is found, in small letters. Capitals in the text are found too (except for `kinds.versus`, which is found only in the letters written, so that "VS Code" is not "a vs b");
- a space stands for any run of spaces, and either apostrophe stands for both;
- nothing in a word is a pattern. `c++` is three characters;
- a word is found whole. `regla` is not found in "Reglamento".

A list may be empty. With no words at all the reader still reads every shape; it only stops knowing a label from a name and a total from a topic. The words the reader writes itself ("Page 12.", "3 cards: ...") are in the same lists, under `writes`.

A set of words is made ready the first time it is read with and kept, so do not change one afterwards. Make another.

## What it promises

- **The same text always reads the same way.** Nothing is guessed by chance.
- **It never throws**, whatever it is given to read and whatever it is given for settings.
- **It says what it leaves out.** A line that could have been a topic or a card and was not kept has a note. What goes without one is dress: ruled lines, tags, the lines a flashcard program writes at the top of its file, a row that names the columns, a counter such as "Card 3", the hours in brackets after a heading, and the chatter before and after a list ("Here is your plan", "Thanks!").
- **It cannot hold a page up.** It reads only so many lines and only so far along each, and the time it takes grows in step with the number of lines.
- **The characters in `HIDDEN` never come out of it**: zero-width spaces, soft hyphens, control characters and the ones that turn text round. The joiners that Indic scripts and emoji are written with are kept.
- **It leans on nothing.** No package, no browser, no clock.

## What it does not do well

Each of these is a paste that can honestly be read two ways. The draft shows the reading before anything is done with it.

- A deck whose fronts are numbers or letters ("1 - uno", "A. retinol") loses them, because the same shape is far more often a numbered list.
- A first line of one or two words over plain lines is read as a topic, not as the title.
- A plain block that begins with a heading nothing marks ("Advanced", then its lines) is read as topics throughout.
- "## 2.5 litres of water" loses "2.5", as "## 2.1 Language" should.
- A word list with long meanings is read as topics with a note. `pairs: 'cards'` turns it into cards.
- The kind guessed from a name is rough.

## Where things are

| File | What is in it |
|---|---|
| `index.ts` | The front door: everything a program outside this folder may use. |
| `read.ts` | The rules, and the shapes of what comes back. |
| `words.ts` | What lists a language has, and how a word in one is found. |
| `english.ts` | The English lists, and the notes in English. |
| `read.test.ts`, `words.test.ts`, `readme.test.ts` | A paste for every rule, and a check that this page is true. |

To teach it a new kind of paste, put the paste in `read.test.ts` first, with what a person would expect of it. A rule may not guess, and whatever it leaves out it says in a note. A new word goes in `english.ts`, not in a rule.
