// Loads and checks every pack in a folder. Shared by the validator (CLI) and the Vite plugin (build).
// The schema catches shape errors; this file checks what a schema can't: references between seeds,
// branches, sources, guilds and finds; no prerequisite cycles; tiers above prerequisites; and ids
// that are unique across every pack, because farms refer to seeds and finds by bare id; and what a seed asks to be
// earned, which may name another pack.
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import yaml from 'js-yaml';
import Ajv from 'ajv/dist/2020.js';

const here = path.dirname(fileURLToPath(import.meta.url));
export const defaultPacksDir = path.resolve(here, '..', 'packs');

let compiled = null;
function schemaValidator() {
  if (!compiled) {
    const schema = JSON.parse(readFileSync(path.join(defaultPacksDir, 'schema', 'pack.schema.json'), 'utf8'));
    compiled = new Ajv({ allErrors: true, strict: false }).compile(schema);
  }
  return compiled;
}

export function packFiles(dir = defaultPacksDir) {
  return readdirSync(dir).filter(f => f.endsWith('.yaml') || f.endsWith('.yml')).sort();
}

// Returns one entry per file: { file, pack, errors }. `pack` is null when the YAML does not parse.
export function loadPacks(dir = defaultPacksDir) {
  const validate = schemaValidator();
  const results = packFiles(dir).map(file => {
    // CORE_SCHEMA: plain YAML 1.2 data only (no merge keys, no dates), so the parsed pack is plain JSON.
    try { return { file, pack: yaml.load(readFileSync(path.join(dir, file), 'utf8'), { schema: yaml.CORE_SCHEMA }), errors: [] }; }
    catch (e) { return { file, pack: null, errors: ['YAML does not parse: ' + e.message] }; }
  });
  for (const r of results) {
    if (!r.pack) continue;
    if (!validate(r.pack)) { r.errors.push(...validate.errors.map(e => (e.instancePath || '/') + ' ' + e.message)); r.shapeOk = false; continue; }
    r.shapeOk = true;
    checkPack(r);
  }
  // ids that must be unique across packs
  const seedOwner = new Map(), findOwner = new Map(), packOwner = new Map();
  for (const r of results) {
    if (!r.shapeOk) continue;
    if (packOwner.has(r.pack.pack)) r.errors.push(`pack id "${r.pack.pack}" is also used by ${packOwner.get(r.pack.pack)}`);
    else packOwner.set(r.pack.pack, r.file);
    for (const s of r.pack.seeds) {
      const other = seedOwner.get(s.id);
      if (other && other !== r.file) r.errors.push(`seed id "${s.id}" is also used in ${other}; seed ids are unique across packs`);
      else seedOwner.set(s.id, r.file);
    }
    for (const f of r.pack.finds || []) {
      const other = findOwner.get(f.id);
      if (other && other !== r.file) r.errors.push(`find id "${f.id}" is also used in ${other}; find ids are unique across packs`);
      else findOwner.set(f.id, r.file);
    }
  }
  checkEarned(results);
  return results;
}

// What a seed asks to be earned names other packs, so it is checked once every pack has been read.
// A pack whose own shape is wrong is still a pack that exists: another pack that names it is not told otherwise, and
// what depends on its contents is left unchecked until it is mended.
function checkEarned(all) {
  const countable = pack => pack.seeds.filter(s => s.wild !== true).length;
  const results = all.filter(r => r.shapeOk);
  const packs = new Map(results.map(r => [r.pack.pack, r.pack]));
  const broken = new Set(all.filter(r => r.pack && !r.shapeOk && typeof r.pack.pack === 'string').map(r => r.pack.pack));
  for (const r of results) for (const s of r.pack.seeds) {
    const e = s.earned;
    if (!e) continue;
    const say = text => r.errors.push(`seed ${s.id}: earned ${text}`);
    const rooted = e.rooted !== undefined, readiness = e.readiness !== undefined;
    if (rooted && readiness) { say('asks for rooted or readiness, not both'); continue; }
    if (!rooted && !readiness) { say('asks for nothing: give it rooted or readiness'); continue; }
    if (readiness && e.pack === undefined) { say('by readiness has to name the pack'); continue; }
    if (e.pack !== undefined) {
      const other = packs.get(e.pack);
      if (e.pack === r.pack.pack) { say('names its own pack'); continue; }
      if (broken.has(e.pack)) continue;
      if (!other) { say(`names an unknown pack "${e.pack}"`); continue; }
      if (readiness && other.perennial === true) say(`asks for the readiness of ${e.pack}, which has no end and so no readiness`);
      if (rooted && e.rooted > countable(other)) say(`asks for ${e.rooted} rooted seeds, and ${e.pack} has ${countable(other)}`);
    } else {
      const every = [...packs.values()].filter(p => p.pack !== r.pack.pack).reduce((n, p) => n + countable(p), 0);
      if (broken.size === 0 && e.rooted > every) say(`asks for ${e.rooted} rooted seeds, and the other packs have ${every}`);
    }
  }
}

function checkPack(r) {
  const { pack, file, errors } = r;
  if (pack.pack + '.yaml' !== file && pack.pack + '.yml' !== file) errors.push(`file name should be ${pack.pack}.yaml`);
  const branches = new Set(pack.branches.map(b => b.id));
  const sources = new Set((pack.sources || []).map(s => s.id));
  const ids = new Set();
  const byId = new Map();
  for (const s of pack.seeds) {
    if (ids.has(s.id)) errors.push(`duplicate seed id ${s.id}`);
    ids.add(s.id); byId.set(s.id, s);
    if (!branches.has(s.branch)) errors.push(`seed ${s.id}: branch "${s.branch}" is not in branches`);
    for (const src of s.sources || []) if (!sources.has(src)) errors.push(`seed ${s.id}: unknown source "${src}"`);
    if (s.harvest === 'recall' && !(s.questions && s.questions.water && s.questions.water.length)) errors.push(`seed ${s.id}: recall harvest needs questions.water`);
    if ((s.harvest === 'judged' || s.harvest === 'artifact' || s.harvest === 'solve') && !(s.prompts && s.prompts.length)) errors.push(`seed ${s.id}: ${s.harvest} harvest needs prompts`);
    if (s.harvest === 'judged' && !(s.rubric && s.rubric.length)) errors.push(`seed ${s.id}: judged harvest needs a rubric`);
    for (const mcq of [...(s.questions?.water || []), ...(s.questions?.harvest || [])]) {
      if (mcq.distractors.includes(mcq.answer)) errors.push(`seed ${s.id}: a distractor equals the answer`);
      if (new Set(mcq.distractors).size !== mcq.distractors.length) errors.push(`seed ${s.id}: two distractors are the same`);
    }
  }
  for (const s of pack.seeds) for (const n of s.needs || []) {
    if (!ids.has(n)) errors.push(`seed ${s.id}: needs unknown seed "${n}"`);
    if (n === s.id) errors.push(`seed ${s.id}: needs itself`);
  }
  // A guild pays while it is whole, and the lock knows it by pack and id, so both its id and its members are checked.
  const guildIds = new Set();
  for (const g of pack.guilds || []) {
    if (guildIds.has(g.id)) errors.push(`duplicate guild id ${g.id}`);
    guildIds.add(g.id);
    for (const [i, n] of g.seeds.entries()) {
      if (!ids.has(n)) errors.push(`guild ${g.id}: unknown seed "${n}"`);
      else if (g.seeds.indexOf(n) !== i) errors.push(`guild ${g.id}: lists "${n}" twice`);
    }
  }
  const findIds = new Set();
  const domesticable = new Set();
  for (const f of pack.finds || []) {
    if (findIds.has(f.id)) errors.push(`duplicate find id ${f.id}`);
    findIds.add(f.id);
    for (const n of f.near) if (!ids.has(n)) errors.push(`find ${f.id}: near unknown seed "${n}"`);
    if (f.seed !== undefined) {
      const s = byId.get(f.seed);
      if (!s) errors.push(`find ${f.id}: seed "${f.seed}" is not in this pack`);
      else if (!s.wild) errors.push(`find ${f.id}: seed "${f.seed}" is not wild`);
      else domesticable.add(f.seed);
    }
  }
  for (const s of pack.seeds) if (s.wild && !domesticable.has(s.id)) errors.push(`seed ${s.id}: wild, but no find points at it, so it can never be domesticated`);
  // cycle check
  const needs = Object.fromEntries(pack.seeds.map(s => [s.id, s.needs || []]));
  const state = {};
  const visit = (id, trail) => {
    if (state[id] === 2) return; if (state[id] === 1) { errors.push('prerequisite cycle: ' + [...trail, id].join(' -> ')); return; }
    state[id] = 1; for (const n of needs[id] || []) if (needs[n]) visit(n, [...trail, id]); state[id] = 2;
  };
  for (const id of Object.keys(needs)) visit(id, []);
  // tier sanity: a seed's tier is above every prerequisite's
  const tier = Object.fromEntries(pack.seeds.map(s => [s.id, s.tier]));
  for (const s of pack.seeds) for (const n of s.needs || []) if (tier[n] !== undefined && tier[n] >= s.tier) errors.push(`seed ${s.id}: tier ${s.tier} is not above prerequisite ${n} (tier ${tier[n]})`);
}

// For the build: every pack, or one Error listing every problem.
export function collectPacks(dir = defaultPacksDir) {
  const results = loadPacks(dir);
  const bad = results.filter(r => r.errors.length);
  if (bad.length) throw new Error('Invalid packs:\n' + bad.map(r => `  ${r.file}\n` + r.errors.map(e => '    ' + e).join('\n')).join('\n'));
  if (!results.length) throw new Error('no packs found in ' + dir);
  return results.map(r => r.pack);
}
