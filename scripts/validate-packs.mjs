// Validates every packs/*.yaml against the schema, then checks the things a schema can't:
// branch ids exist, `needs` point at real seeds in the same pack, no cycles, no duplicate ids,
// a recall seed has water questions, a judged seed has a rubric and prompts.
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import yaml from 'js-yaml';
import Ajv from 'ajv/dist/2020.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packsDir = path.join(root, 'packs');
const schema = JSON.parse(readFileSync(path.join(packsDir, 'schema', 'pack.schema.json'), 'utf8'));
const ajv = new Ajv({ allErrors: true, strict: false });
const validate = ajv.compile(schema);

let failed = 0;
const files = readdirSync(packsDir).filter(f => f.endsWith('.yaml') || f.endsWith('.yml'));
if (!files.length) { console.error('no packs found'); process.exit(1); }

for (const file of files) {
  const errors = [];
  let pack;
  try { pack = yaml.load(readFileSync(path.join(packsDir, file), 'utf8')); }
  catch (e) { report(file, ['YAML does not parse: ' + e.message]); continue; }

  if (!validate(pack)) errors.push(...validate.errors.map(e => (e.instancePath || '/') + ' ' + e.message));
  else {
    if (pack.pack + '.yaml' !== file && pack.pack + '.yml' !== file) errors.push(`file name should be ${pack.pack}.yaml`);
    const branches = new Set(pack.branches.map(b => b.id));
    const ids = new Set();
    const sources = new Set((pack.sources || []).map(s => s.id));
    for (const s of pack.seeds) {
      if (ids.has(s.id)) errors.push(`duplicate seed id ${s.id}`); ids.add(s.id);
      if (!branches.has(s.branch)) errors.push(`seed ${s.id}: branch "${s.branch}" is not in branches`);
      for (const src of s.sources || []) if (!sources.has(src)) errors.push(`seed ${s.id}: unknown source "${src}"`);
      if (s.harvest === 'recall' && !(s.questions && s.questions.water && s.questions.water.length)) errors.push(`seed ${s.id}: recall harvest needs questions.water`);
      if ((s.harvest === 'judged' || s.harvest === 'artifact') && !(s.prompts && s.prompts.length)) errors.push(`seed ${s.id}: ${s.harvest} harvest needs prompts`);
      if (s.harvest === 'judged' && !(s.rubric && s.rubric.length)) errors.push(`seed ${s.id}: judged harvest needs a rubric`);
      for (const mcq of [...(s.questions?.water || []), ...(s.questions?.harvest || [])]) {
        if (mcq.distractors.includes(mcq.answer)) errors.push(`seed ${s.id}: a distractor equals the answer`);
      }
    }
    for (const s of pack.seeds) for (const n of s.needs || []) {
      if (!ids.has(n)) errors.push(`seed ${s.id}: needs unknown seed "${n}"`);
      if (n === s.id) errors.push(`seed ${s.id}: needs itself`);
    }
    for (const g of pack.guilds || []) for (const n of g.seeds) if (!ids.has(n)) errors.push(`guild ${g.id}: unknown seed "${n}"`);
    // cycle check
    const needs = Object.fromEntries(pack.seeds.map(s => [s.id, s.needs || []]));
    const state = {};
    const visit = (id, trail) => {
      if (state[id] === 2) return; if (state[id] === 1) { errors.push('prerequisite cycle: ' + [...trail, id].join(' -> ')); return; }
      state[id] = 1; for (const n of needs[id] || []) if (needs[n]) visit(n, [...trail, id]); state[id] = 2;
    };
    for (const id of Object.keys(needs)) visit(id, []);
    // tier sanity: a seed's tier should be above every prerequisite's
    const tier = Object.fromEntries(pack.seeds.map(s => [s.id, s.tier]));
    for (const s of pack.seeds) for (const n of s.needs || []) if (tier[n] !== undefined && tier[n] >= s.tier) errors.push(`seed ${s.id}: tier ${s.tier} is not above prerequisite ${n} (tier ${tier[n]})`);
  }
  report(file, errors, pack);
}

function report(file, errors, pack) {
  if (errors.length) { failed++; console.log(`✗ ${file}`); for (const e of errors) console.log('    ' + e); }
  else console.log(`✓ ${file}  ${pack.seeds.length} seeds · ${pack.branches.length} branches`);
}
process.exit(failed ? 1 : 0);
