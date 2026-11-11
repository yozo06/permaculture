import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { LINK_MAX, linkHash, readLink } from './links'

describe('a link', () => {
  const payload = { name: 'ಆಶಾ 🌱 Asha', fields: [{ pack: 'kannada', crops: [['num', 0, 0, 2, 0]] }] }

  it('carries its payload in the part after the #, in characters every chat app leaves alone', () => {
    const hash = linkHash('farm', payload)
    expect(hash).toMatch(/^farm=1\.[A-Za-z0-9_-]+$/)
    expect(readLink('#' + hash)).toEqual({ kind: 'farm', payload })
  })

  it('is found in a whole address, with or without the #, and with space around it', () => {
    const hash = linkHash('farm', payload)
    for (const text of [hash, '#' + hash, 'https://yozo06.github.io/permaculture/#' + hash, '  http://localhost:5173/permaculture/?x=1#' + hash + '\n']) {
      expect(readLink(text), text).toEqual({ kind: 'farm', payload })
    }
  })

  it('says so when it was made in a format this game does not know yet', () => {
    expect(readLink('#farm=2.abc')).toEqual({ kind: 'farm', newer: true })
  })

  it('is refused when it is too long, before it is decoded', () => {
    const big = linkHash('farm', { pad: 'x'.repeat(LINK_MAX) })
    expect(readLink('#' + big)).toBeNull()
  })

  it('is nothing when it is not a link, or does not decode to JSON', () => {
    for (const text of ['', '#', 'hello', '#farm=1.', '#farm=1.!!!', '#farm=1.' + 'A'.repeat(7), '#seed=1.abcd', '#farm=x.abcd']) expect(readLink(text), text).toBeNull()
  })

  it('never throws, whatever is pasted', () => {
    fc.assert(fc.property(fc.string(), (text) => {
      readLink(text)
      readLink('#farm=1.' + text)
    }))
  })

  it('round-trips any JSON', () => {
    fc.assert(fc.property(fc.jsonValue(), (value) => {
      const back = readLink(linkHash('gift', value))
      expect(back).toEqual({ kind: 'gift', payload: JSON.parse(JSON.stringify(value)) })
    }))
  })
})
