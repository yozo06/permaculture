// The reader's front door. Everything outside this folder takes the reader from here, and from nowhere else in it.
export { HIDDEN, TEXT, read } from './read.ts'
export type { Card, Draft, DraftTopic, Kind, ReadOptions } from './read.ts'
