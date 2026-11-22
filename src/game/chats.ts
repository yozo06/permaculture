/**
 * The AI chats a learner may ask for a list. The game never talks to one: it opens the chat in a new tab, and the
 * learner brings the answer back. Some chats take the request from their link; for the rest it is copied first.
 *
 * None of them documents these links, so each was tried by hand (2026-11-22, a desktop browser, signed out, the link
 * pressed on another site). ChatGPT sent the request at once and answered it, with a link of 8,565 characters. Grok
 * filled its box and asked before sending, at 4,272 characters, and showed a blank page at 8,562. Claude asked a
 * signed-out visitor to sign in and lost the request; Gemini ignored it; Copilot is reported to have stopped taking
 * it in 2025. If one changes, only this file does.
 */
export const CHATS = [
  { id: 'chatgpt', name: 'ChatGPT', open: 'https://chatgpt.com/', carry: { at: 'https://chatgpt.com/?q=', most: 8500 } },
  { id: 'grok', name: 'Grok', open: 'https://grok.com/', carry: { at: 'https://grok.com/?q=', most: 4200 } },
  { id: 'claude', name: 'Claude', open: 'https://claude.ai/new' },
  { id: 'gemini', name: 'Gemini', open: 'https://gemini.google.com/app' },
  { id: 'copilot', name: 'Copilot', open: 'https://copilot.microsoft.com/' },
] as const

export type ChatId = (typeof CHATS)[number]['id']

/**
 * Where to send a learner to ask `id` for `request`: with the request in the link when that chat takes it and the
 * link is no longer than the longest that worked (counted as written into the link, where a space takes three
 * characters and a letter of some scripts nine), and otherwise to an empty chat, to paste it into.
 */
export function chatLink(id: ChatId, request: string): { href: string; carried: boolean } {
  const chat = CHATS.find((c) => c.id === id) ?? CHATS[0]
  if ('carry' in chat) {
    const href = chat.carry.at + encodeURIComponent(request)
    if (href.length <= chat.carry.most) return { href, carried: true }
  }
  return { href: chat.open, carried: false }
}
