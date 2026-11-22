import { describe, expect, it } from 'vitest'
import { CHATS, chatLink } from './chats'

describe('links to an AI chat', () => {
  const request = 'I am learning: Coffee\n\nWrite me a study list = with | bars & a question?'

  it('carries the request whole to a chat that takes it from its link', () => {
    for (const id of ['chatgpt', 'grok'] as const) {
      const link = chatLink(id, request)
      expect(link.carried).toBe(true)
      expect(decodeURIComponent(link.href.slice(link.href.indexOf('?q=') + 3))).toBe(request)
    }
  })

  it('opens an empty chat when the request is longer than the link carries, counted as written into the link', () => {
    expect(chatLink('chatgpt', 'a'.repeat(9000))).toEqual({ href: 'https://chatgpt.com/', carried: false })
    // Grok's limit is lower, and a letter of another script takes up to nine characters in a link.
    expect(chatLink('grok', 'a'.repeat(3000)).carried).toBe(true)
    expect(chatLink('grok', 'अ'.repeat(600)).carried).toBe(false)
    expect(chatLink('chatgpt', 'अ'.repeat(600)).carried).toBe(true)
  })

  it('never puts the request in the link of a chat that loses it, and every link is to a secure address', () => {
    for (const id of ['claude', 'gemini', 'copilot'] as const) expect(chatLink(id, request)).toEqual({ href: CHATS.find((c) => c.id === id)?.open, carried: false })
    for (const c of CHATS) expect(chatLink(c.id, request).href).toMatch(/^https:\/\//)
  })
})
