// The reader's front door. Everything outside this folder takes the reader from here, and from nowhere else in it.
export { HIDDEN, LIMITS, NOTE_CODES, read } from './read.ts'
export type { Card, Draft, DraftTopic, Kind, Limits, Note, ReadOptions } from './read.ts'
export { say } from './english.ts'
