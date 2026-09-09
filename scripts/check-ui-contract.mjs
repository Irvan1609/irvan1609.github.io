import fs from 'node:fs';

const html = fs.readFileSync('index.html', 'utf8');
const main = fs.readFileSync('src/main.js', 'utf8');
const ral = fs.readFileSync('src/ral.js', 'utf8');

function fail(message) {
  console.error(`UI contract failed: ${message}`);
  process.exit(1);
}

const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]);
const duplicates = ids.filter((id, i) => ids.indexOf(id) !== i);
if (duplicates.length) fail(`duplicate id(s): ${[...new Set(duplicates)].join(', ')}`);

const requiredIds = [
  'pasteBtn','importBtn','newTxt','addRow','addCol','clearData','file',
  'pasteModal','closeModal','cancelPaste','applyPaste','pasteArea',
  'openRak','rakModal','runRak','closeRak','closeRak2',
  'ralModal','runRal','closeRal','closeRal2','ralResponses','ralTreatment',
  'status','errorBox','gridWrap'
];
for (const id of requiredIds) {
  if (!ids.includes(id)) fail(`missing required element #${id}`);
}

const moduleScripts = [...html.matchAll(/<script\s+type="module"\s+src="([^"]+)"/g)].map(m => m[1]);
for (const src of ['/src/main.js','/src/rak-dnd.js','/src/ral.js']) {
  if (!moduleScripts.includes(src)) fail(`missing module script ${src}`);
}

if (html.includes('report-enhancements.js')) {
  fail('report-enhancements.js must not be loaded in production shell');
}

const mainBindings = [
  'pasteBtn','importBtn','newTxt','addRow','addCol','clearData',
  'closeModal','cancelPaste','applyPaste','pasteArea','openRak',
  'runRak','closeRak','closeRak2'
];
for (const id of mainBindings) {
  if (!main.includes(`#${id}`)) fail(`main.js does not reference #${id}`);
}

const ralBindings = ['runRal','closeRal','closeRal2'];
for (const id of ralBindings) {
  if (!ral.includes(`#${id}`)) fail(`ral.js does not reference #${id}`);
}

if (!main.includes('addEventListener')) fail('main.js contains no event listeners');
if (!ral.includes('addEventListener')) fail('ral.js contains no event listeners');

console.log(`UI contract OK: ${requiredIds.length} required elements, no duplicate IDs, core modules present.`);
