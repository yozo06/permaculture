// Links that carry their payload after the `#`, which a browser never sends to a server: `#farm=1.<payload>`.
// `1` is the format; the payload is base64url of UTF-8 JSON. Format 1 links must stay readable for good.
// A link comes from someone else: reading one never throws.

export type LinkKind = 'farm' | 'gift'

/** The most characters of payload a link may carry. Checked before anything is decoded. */
export const LINK_MAX = 16 * 1024
const FORMAT = '1'

function toBase64Url(text: string): string {
  let binary = ''
  for (const byte of new TextEncoder().encode(text)) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(payload: string): string {
  const binary = atob(payload.replace(/-/g, '+').replace(/_/g, '/'))
  const bytes = Uint8Array.from(binary, (ch) => ch.charCodeAt(0))
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
}

/** The part of a link after the `#` (without it). */
export const linkHash = (kind: LinkKind, payload: unknown): string => kind + '=' + FORMAT + '.' + toBase64Url(JSON.stringify(payload))

export type ReadLink =
  | { kind: LinkKind; payload: unknown }
  /** A link in a format this game does not know: it was made by a newer version. */
  | { kind: LinkKind; newer: true }

/** Find a link in a hash, a whole address or pasted text. Null if there is none, or it cannot be decoded. */
export function readLink(text: string): ReadLink | null {
  const m = /(?:^|#)(farm|gift)=(\d+)\.([A-Za-z0-9_-]*)\s*$/.exec(text.trim())
  if (!m) return null
  const kind = m[1] === 'gift' ? 'gift' : 'farm'
  if (m[2] !== FORMAT) return { kind, newer: true }
  const payload = m[3] ?? ''
  if (payload.length === 0 || payload.length > LINK_MAX) return null
  try {
    return { kind, payload: JSON.parse(fromBase64Url(payload)) as unknown }
  } catch {
    return null
  }
}
