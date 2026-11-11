// Small shared guards for the pure engine. No DOM, no clock, no randomness.

/** True for a plain object (not null, not an array): a record whose keys can be read. */
export const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
