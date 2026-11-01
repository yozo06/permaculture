// Validates every packs/*.yaml (or every pack in the folder given as the first argument).
// Shape comes from packs/schema/pack.schema.json; references, cycles, tiers and cross-pack ids
// are checked in packs-lib.mjs, which the build uses too.
import path from 'node:path';
import { loadPacks, defaultPacksDir } from './packs-lib.mjs';

const dir = process.argv[2] ? path.resolve(process.argv[2]) : defaultPacksDir;
const results = loadPacks(dir);
if (!results.length) { console.error('no packs found in ' + dir); process.exit(1); }

let failed = 0;
for (const { file, pack, errors } of results) {
  if (errors.length) { failed++; console.log(`✗ ${file}`); for (const e of errors) console.log('    ' + e); continue; }
  const finds = (pack.finds || []).length;
  console.log(`✓ ${file}  ${pack.seeds.length} seeds · ${pack.branches.length} branches` + (finds ? ` · ${finds} finds` : ''));
}
process.exit(failed ? 1 : 0);
