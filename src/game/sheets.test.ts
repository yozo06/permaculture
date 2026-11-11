import { describe, expect, it } from 'vitest'
import { RULES } from '../engine/rules'
import { cropSheetHtml, countText, footHtml, NO_NOTES, plantSheetHtml, tickList, writingBox, pickerHtml, arrivalSheetHtml, neighbourCropSheetHtml, neighboursSheetHtml, shareSheetHtml } from './sheets'
import type { CropView } from './views'

const view = (patch: Partial<CropView> = {}): CropView => ({
  seed: 'raft', name: 'Raft', pack: 'system-design', layer: 'Root', stageLine: 'Stage 2 of 5 · Z2 · Recall', statusLine: 'Growing.', nextWork: null,
  notes: '', journal: [], sources: [], ...patch,
})

describe('countText', () => {
  it('counts towards the minimum, then just counts', () => {
    expect(countText(0, 40)).toBe('0 of 40 characters')
    expect(countText(39, 40)).toBe('39 of 40 characters')
    expect(countText(40, 40)).toBe('40 characters')
    expect(countText(95, 40)).toBe('95 characters')
  })
})

describe('writingBox', () => {
  it('gates its button until there is enough, and says how much is written', () => {
    const html = writingBox({ id: 'notes', label: 'Notes', min: 40, max: 5000, gate: 'go' })
    expect(html).toContain('data-min="40"')
    expect(html).toContain('data-gate="go"')
    expect(html).toContain('maxlength="5000"')
    expect(html).toContain('0 of 40 characters')
  })

  it('shows text that is already there, escaped, and counts it trimmed', () => {
    const html = writingBox({ id: 'e', label: 'E', min: 5, max: 50, gate: 'g', value: '  <b>hi</b>  ' })
    expect(html).toContain('&lt;b&gt;hi&lt;/b&gt;')
    expect(html).not.toContain('<b>hi</b>')
    expect(html).toContain('count ok')
    expect(html).toContain('9 characters')
  })
})

describe('tickList', () => {
  it('has one checkbox per line, under a legend, with the lines escaped', () => {
    const html = tickList('Your explanation…', ['Says <what> it is', 'Gives an example'])
    expect(html.match(/type="checkbox"/g)).toHaveLength(2)
    expect(html).toContain('<legend>Your explanation…</legend>')
    expect(html).toContain('Says &lt;what&gt; it is')
  })
})

describe('footHtml', () => {
  it('escapes its label, so a pack title or seed name cannot inject markup', () => {
    const html = footHtml('Add to <img src=x onerror=alert(1)> field')
    expect(html).not.toContain('<img')
    expect(html).toContain('&lt;img')
  })
})

describe('plantSheetHtml', () => {
  const sheet = plantSheetHtml({
    chip: '<div>chip</div>', name: 'Raft', layer: 'Root', harvest: 'recall', summary: 'Read 5.1 to 5.4.', minutes: 30,
    sources: [{ title: 'The Raft paper', url: 'https://raft.github.io/raft.pdf' }, { title: 'A book', url: null }],
    notesMin: RULES.notesMin, textMax: RULES.textMax, energy: RULES.plant.energy, coins: RULES.plant.coins,
  })

  it('shows what to read, how long it takes, and the sources as links', () => {
    expect(sheet).toContain('Read 5.1 to 5.4.')
    expect(sheet).toContain('About 30 minutes of reading.')
    expect(sheet).toContain('<a href="https://raft.github.io/raft.pdf" target="_blank" rel="noopener noreferrer">The Raft paper</a>')
    expect(sheet).toContain('<li>A book</li>')
  })

  it('asks for notes in the player\'s own words, with the plant button disabled until they are long enough', () => {
    expect(sheet).toContain('Your notes, in your own words')
    expect(sheet).toContain('data-min="40"')
    expect(sheet).toMatch(/<button[^>]*id="plantGo"[^>]*disabled>Plant · 10 energy · 10 coins<\/button>/)
  })

  it('leaves out the reading time and sources when the seed has none', () => {
    const bare = plantSheetHtml({ chip: '', name: 'X', layer: 'Herb', harvest: 'artifact', sources: [], notesMin: 40, textMax: 5000, energy: 10, coins: 10 })
    expect(bare).not.toContain('minutes of reading')
    expect(bare).not.toContain('Sources')
  })
})

describe('cropSheetHtml', () => {
  it('says so when a crop was planted before notes existed', () => {
    const html = cropSheetHtml('', view())
    expect(html).toContain(NO_NOTES)
    expect(html).toContain('Stage 2 of 5 · Z2 · Recall')
  })

  it('shows the notes and the journal, escaped, newest entry first as given', () => {
    const html = cropSheetHtml('', view({
      notes: 'a <script>x</script> note',
      journal: [{ day: 9, label: 'Explained', text: 'later', ok: true }, { day: 4, label: 'Explained', text: 'earlier', ok: false }],
    }))
    expect(html).not.toContain('<script>')
    expect(html).toContain('a &lt;script&gt;x&lt;/script&gt; note')
    expect(html.indexOf('later')).toBeLessThan(html.indexOf('earlier'))
    expect(html).toContain('Day 9 · Explained · passed')
    expect(html).toContain('Day 4 · Explained · not yet')
  })

  it('says what is waiting, when something is', () => {
    expect(cropSheetHtml('', view({ statusLine: 'Thirsty now.', nextWork: 'Water: a recall card.' }))).toContain('Thirsty now. Water: a recall card.')
  })
})

describe('pickerHtml', () => {
  const pack = { pack: 'p<1>', title: '<b>Bold</b>', color: '#fff', description: 'About <i>it</i>', seeds: 3, open: false, ticked: true }

  it('offers each pack the farm does not have as a ticked or unticked box, escaped', () => {
    const html = pickerHtml([pack, { ...pack, pack: 'q', ticked: false }])
    expect(html).toContain('data-pack="p&lt;1&gt;" checked')
    expect(html).toContain('data-pack="q">')
    expect(html).toContain('&lt;b&gt;Bold&lt;/b&gt;')
    expect(html).toContain('About &lt;i&gt;it&lt;/i&gt;')
    expect(html).toContain('3 seeds')
    expect(html).not.toContain('<b>Bold')
  })

  it('leaves out packs the farm already has', () => {
    expect(pickerHtml([{ ...pack, open: true }])).not.toContain('data-pack')
  })
})

describe('the neighbours sheets, with a hostile name', () => {
  const EVIL = '<img src=x onerror=a()>'
  const SAFE = '&lt;img src=x onerror=a()&gt;'
  const row = { code: '0000000000001', name: EVIL, day: 34, age: '3 days old', stale: false }

  it('escape it in the list, and offer a visit only while the picture is fresh', () => {
    const html = neighboursSheetHtml({ name: EVIL, shared: 'made today', rows: [row, { ...row, code: '0000000000002', stale: true }], green: 'https://example.org/green' })
    expect(html).not.toContain(EVIL)
    expect(html.split(SAFE).length - 1).toBe(3)
    expect(html).toContain('data-act="visit" data-arg="0000000000001"')
    expect(html).not.toContain('data-act="visit" data-arg="0000000000002"')
    expect(html).toContain('No recent picture. Ask for a new link.')
    expect(html).toContain('data-act="removeNeighbour" data-arg="0000000000002"')
  })

  it('say so when there are no neighbours and the farm has no name', () => {
    const html = neighboursSheetHtml({ name: '', shared: null, rows: [], green: 'https://example.org/green' })
    expect(html).toContain('No neighbours yet')
    expect(html).toContain('has no name yet')
  })

  it('escape it on a crop sheet and on the sheet a link opens', () => {
    const crop = neighbourCropSheetHtml('', { seed: 's', name: 'Raft', pack: 'p', packTitle: 'P', layer: 'Canopy', stageLine: 'A rooted tree', yours: 'You grow this too.' }, EVIL)
    const arrival = arrivalSheetHtml({ name: EVIL, day: 34, age: 'made today', fields: ['<b>F</b>'], newer: 3, misfit: 1, firstTime: false })
    for (const html of [crop, arrival]) { expect(html).not.toContain(EVIL); expect(html).toContain(SAFE) }
    expect(arrival).toContain('&lt;b&gt;F&lt;/b&gt;')
    expect(arrival).toContain('3 crops need a newer version of the game')
    expect(arrival).toContain('1 crop did not fit')
    expect(arrival).toContain('data-act="addNeighbour"')
  })

  it('greet someone who has never played with what they are looking at and a way to start', () => {
    const html = arrivalSheetHtml({ name: 'Asha', day: 34, age: 'made today', fields: ['Kannada'], newer: 0, misfit: 0, firstTime: true })
    expect(html).toContain('You are looking at Asha')
    expect(html).toContain('data-act="startFromVisit"')
    expect(html).not.toContain('need a newer version')
  })
})

describe('shareSheetHtml', () => {
  const packs = [{ pack: 'a<', title: 'A & B', color: '#fff', ticked: true }, { pack: 'c', title: 'C', color: '#000', ticked: false }]
  const view = { fields: 1, crops: 4, trees: 2, lostCrops: 0, lostLand: 0 }

  it('says what the link holds, what it never holds, and that it cannot be taken back', () => {
    const html = shareSheetHtml({ name: '<Asha>', packs, view, url: 'https://example.org/#farm=1.abc', canShare: false })
    expect(html).toContain('&lt;Asha&gt;')
    expect(html).toContain('data-show="a&lt;" checked')
    expect(html).toContain('A &amp; B')
    expect(html).toMatch(/1 field, 4 crops and 2 trees/)
    expect(html).toMatch(/never shows your notes/)
    expect(html).toMatch(/cannot be taken back/)
    expect(html).toMatch(/same farm code/)
    expect(html).toContain('https://example.org/#farm=1.abc')
    expect(html).not.toContain('data-act="shareNative"')
    expect(html).not.toMatch(/will not fit/)
  })

  it('says how much will not fit when hidden fields make the others close ranks', () => {
    const html = shareSheetHtml({ name: 'Asha', packs, view: { ...view, lostCrops: 2, lostLand: 1 }, url: 'u', canShare: true })
    expect(html).toMatch(/2 crops and 1 fenced tile will not fit/)
    expect(html).toContain('data-act="shareNative"')
  })

  it('asks for a field when none is ticked', () => {
    const html = shareSheetHtml({ name: 'Asha', packs, view: null, url: null, canShare: true })
    expect(html).toMatch(/Tick at least one field/)
    expect(html).not.toContain('shareLink')
  })
})
