import fs from 'node:fs';

const html = fs.readFileSync('index.html', 'utf8');
const main = fs.readFileSync('src/main.js', 'utf8');
const ral = fs.readFileSync('src/ral.js', 'utf8');
const flow = fs.readFileSync('src/analysis-flow.js', 'utf8');
const scientific = fs.readFileSync('src/scientific-workflow.js', 'utf8');
const scientificReport = fs.readFileSync('src/scientific-report.js', 'utf8');
const report = fs.readFileSync('src/report-utils.js', 'utf8');

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
  'openAnalysis','analysisChoice','renameDataset','deleteDataset','datasetNameForm','rakParameters','rakPosthoc','ralReplicate','rakModal','runRak','closeRak','closeRak2',
  'ralModal','runRal','closeRal','closeRal2','ralResponses','ralTreatment',
  'status','errorBox','gridWrap'
];
for (const id of requiredIds) {
  if (!ids.includes(id)) fail(`missing required element #${id}`);
}

const moduleScripts = [...html.matchAll(/<script\s+type="module"\s+src="([^"]+)"/g)].map(m => m[1]);
for (const src of ['/src/main.js','/src/ral.js']) {
  if (!moduleScripts.includes(src)) fail(`missing module script ${src}`);
}

if (html.includes('report-enhancements.js')) {
  fail('report-enhancements.js must not be loaded in production shell');
}

const nav=html.match(/<nav class="nav">([\s\S]*?)<\/nav>/)?.[1]||'';
if((nav.match(/<button\b/g)||[]).length!==1||!nav.includes('openAnalysis')||!/>Analyze<\/button>/.test(nav))fail('navigation must contain one Analyze button');
if(html.includes('src="/src/rak-dnd.js"'))fail('legacy drag interface must not be loaded');
for(const id of ['openAnalysis','analysisChoice'])if(!flow.includes('#'+id))fail('analysis flow missing '+id);
for(const required of ["data-association=\"correlation\"","data-association=\"path\"","textContent='Analyze'","openScientific(button.dataset.design)"])if(!flow.includes(required))fail('analysis flow missing '+required);

const mainBindings = [
  'pasteBtn','importBtn','newTxt','addRow','addCol','clearData',
  'closeModal','cancelPaste','applyPaste','pasteArea','renameDataset','deleteDataset'
];
for (const id of mainBindings) {
  if (!main.includes(`#${id}`)) fail(`main.js does not reference #${id}`);
}

const ralBindings = ['runRal','closeRal','closeRal2'];
for (const id of ralBindings) {
  if (!ral.includes(`#${id}`)) fail(`ral.js does not reference #${id}`);
}

if (!main.includes('addEventListener') && !main.includes('.onclick=')) fail('main.js contains no event bindings');
if (!ral.includes('addEventListener')) fail('ral.js contains no event listeners');
if (!scientific.includes('analyzeParameter') || !scientific.includes('renderReport')) fail('scientific workflow is not connected to analysis/report engine');
for (const design of ["'ral'","'rak'","'fral'","'frak'","'split'"]) {
  if (!scientificReport.includes(design)) fail(`scientific report missing design ${design}`);
}
for (const required of ['F. Hitung','F. Tabel','table-caption']) {
  if (!scientificReport.includes(required)) fail(`scientific-report.js missing reporting marker: ${required}`);
}
for (const required of ['centralF.inv','effectLevel','cvPercent','descriptiveMeanChart']) {
  if (!report.includes(required)) fail(`report-utils.js missing ${required}`);
}

console.log(`UI contract OK: data-grid bindings, Analyze navigation, scientific RAL/RAK/factorial/RPT workflow, correlation/path menu, ${requiredIds.length} required elements, and F-table reporting contract present.`);
