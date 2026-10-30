// One-off: pull the TOPICS array out of the Phase 0 prototype and emit YAML packs.
// Kept in the repo as a record of where the first packs came from; Phase 1 makes the game read the packs instead.
import { readFileSync, writeFileSync } from 'node:fs';
import yaml from 'js-yaml';

const html = readFileSync(new URL('../game/index.html', import.meta.url), 'utf8');
const src = html.slice(html.indexOf('const TOPICS=['), html.indexOf('const T=Object.fromEntries'));
const TOPICS = new Function(src + ' return TOPICS;')();

const FIELDS = {
  hs:  { pack: 'haskell-backend', title: 'Backend · Haskell', color: '#6DB24F', branches: ['Runtime & performance', 'Types & effects'],
         description: 'Running Haskell services in production: the runtime under your feet, the types above your head, and the idioms in between.' },
  sd:  { pack: 'system-design', title: 'System design', color: '#E0A93E', branches: ['Distributed data', 'Traffic & resilience'],
         description: 'How large systems are shaped, where state lives, and what happens when a region loses its store.' },
  inf: { pack: 'infra', title: 'Infra', color: '#5FA8C9', branches: ['Network & platform', 'Data & reliability'],
         description: 'The platform a backend runs on: network, Kubernetes, the database engine, the message log, and the SRE bargain.' },
  kn:  { pack: 'kannada', title: 'Kannada', color: '#B089D6', branches: ['Words', 'Grammar & script'],
         description: 'Everyday Kannada for Bengaluru and Coorg: words first, then the script and the small grammar that holds sentences together.' },
};
const LAYER = { 'Canopy': 'canopy', 'Understory': 'understory', 'Shrub': 'shrub', 'Herb': 'herb', 'Ground cover': 'ground-cover', 'Root': 'root', 'Vine': 'vine' };
const slug = s => s.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
const q = x => ({ q: x.q, answer: x.a[0], distractors: x.a.slice(1), why: x.why });

for (const [f, meta] of Object.entries(FIELDS)) {
  const seeds = TOPICS.filter(t => t.f === f).map(t => {
    const s = { id: t.id, name: t.name, layer: LAYER[t.layer], branch: slug(meta.branches[t.b]), tier: t.tier };
    if (t.needs) s.needs = t.needs;
    if (t.wild) s.wild = true;
    s.harvest = 'recall';
    s.questions = { water: t.q.map(q) };
    if (t.h) s.questions.harvest = t.h.map(q);
    return s;
  });
  const pack = {
    pack: meta.pack, version: 0, title: meta.title, color: meta.color, description: meta.description,
    branches: meta.branches.map(b => ({ id: slug(b), title: b })),
    sources: [],
    seeds,
  };
  const out = '# ' + meta.title + ' — Permaculture pack (v0, extracted from the Phase 0 prototype)\n' +
    '# Format: docs/pack-format.md · Licence: CC-BY-SA 4.0 (packs/LICENSE.md)\n' +
    yaml.dump(pack, { lineWidth: 110, noRefs: true, quotingType: '"' });
  writeFileSync(new URL('../packs/' + meta.pack + '.yaml', import.meta.url), out);
  console.log(meta.pack, seeds.length, 'seeds');
}
