import fs from 'node:fs';
import './check-dataset-import.mjs';

const portfolioHtml = fs.readFileSync('index.html', 'utf8');
const html = fs.readFileSync('stat/index.html', 'utf8');
const printHtml = fs.readFileSync('print-skripsi/index.html', 'utf8');
const mendeleyHtml = fs.readFileSync('mendeley/index.html', 'utf8');
const mendeleyApp = fs.readFileSync('mendeley/app.js', 'utf8');
const main = fs.readFileSync('src/main.js', 'utf8');
const navigation = fs.readFileSync('src/navigation.js', 'utf8');
const ral = fs.readFileSync('src/ral.js', 'utf8');
const flow = fs.readFileSync('src/analysis-flow.js', 'utf8');
const scientific = fs.readFileSync('src/scientific-workflow.js', 'utf8');
const scientificReport = fs.readFileSync('src/scientific-report.js', 'utf8');
const report = fs.readFileSync('src/report-utils.js', 'utf8');
const printApp = fs.readFileSync('print-skripsi/app.js', 'utf8');
const dataTools = fs.readFileSync('src/data-tools.js', 'utf8');

function fail(message) {
  console.error(`UI contract failed: ${message}`);
  process.exit(1);
}

for (const marker of ['Peneliti Agronomi','href="/stat/"','href="/print-skripsi/"','href="/mendeley/"','Statistical Web']) {
  if (!portfolioHtml.includes(marker)) fail(`portfolio root missing marker: ${marker}`);
}
if (portfolioHtml.includes('id="gridWrap"')) fail('portfolio root must not contain the statistical application shell');
if (main.includes('installReferenceManager') || navigation.includes("['referencesMenu','Referensi'")) fail('Mendeley helper must not be embedded in /stat');
for (const marker of ['Mendeley Helper','referenceQuery','referenceExportRis','referenceLibrary','/mendeley/app.js']) if (!mendeleyHtml.includes(marker)) fail(`/mendeley missing marker: ${marker}`);
for (const marker of ['api.crossref.org','toRis','toBibtex','statistical_web_reference_library_v1']) if (!mendeleyApp.includes(marker)) fail(`/mendeley app missing marker: ${marker}`);

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
for (const id of requiredIds) if (!ids.includes(id)) fail(`missing required element #${id}`);

const pasteAreaTag = html.match(/<textarea\b[^>]*\bid="pasteArea"[^>]*>/)?.[0] || '';
if (!/\baria-label="Data tabel dari Excel"/.test(pasteAreaTag)) {
  fail('paste area needs a persistent accessible name, independent of its placeholder');
}

const statusTag = html.match(/<div\b[^>]*\bid="status"[^>]*>/)?.[0] || '';
if (!/\brole="status"/.test(statusTag) || !/\baria-live="polite"/.test(statusTag) || !/\baria-atomic="true"/.test(statusTag)) {
  fail('main status needs a polite, atomic live region for screen-reader updates');
}
const errorTag = html.match(/<div\b[^>]*\bid="errorBox"[^>]*>/)?.[0] || '';
if (!/\brole="alert"/.test(errorTag)) fail('main error box needs alert semantics');

for (const [modalId,titleId] of [['pasteModal','pasteModalTitle'],['rakModal','rakModalTitle'],['ralModal','ralModalTitle']]) {
  const start=html.indexOf(`id="${modalId}"`), end=html.indexOf('</div></div>',start);
  const fragment=start>=0&&end>start?html.slice(start,end):'';
  if(!fragment.includes('role="dialog"')||!fragment.includes('aria-modal="true"')||!fragment.includes(`aria-labelledby="${titleId}"`)||!fragment.includes(`id="${titleId}"`))fail(`#${modalId} needs dialog semantics and an accessible title`);
}

for (const id of ['closeModal','closeDatasetName','closeRak','closeRal']) {
  if (!new RegExp(`<button[^>]*id="${id}"[^>]*aria-label="[^"]+"`).test(html)) fail(`#${id} needs an accessible name`);
}

const moduleScripts = [...html.matchAll(/<script\s+type="module"\s+src="([^"]+)"/g)].map(m => m[1]);
for (const src of ['/src/main.js','/src/ral.js']) if (!moduleScripts.includes(src)) fail(`missing module script ${src}`);
if (html.includes('report-enhancements.js')) fail('report-enhancements.js must not be loaded in production shell');

const nav=html.match(/<nav class="nav">([\s\S]*?)<\/nav>/)?.[1]||'';
if((nav.match(/<button\b/g)||[]).length!==1||!nav.includes('openAnalysis')||!/>Analyze<\/button>/.test(nav))fail('navigation must contain one Analyze button');
if(!/href="\/"[^>]*>← Portofolio<\/a>/.test(nav))fail('stat navigation must provide a return-to-portfolio link');
if(html.includes('src="/src/rak-dnd.js"'))fail('legacy drag interface must not be loaded');
for(const id of ['openAnalysis','analysisChoice'])if(!flow.includes('#'+id))fail('analysis flow missing '+id);
for(const required of ["data-association=\"correlation\"","data-association=\"path\"","textContent='Analyze'","openScientific(button.dataset.design)"])if(!flow.includes(required))fail('analysis flow missing '+required);

const mainBindings = ['pasteBtn','importBtn','newTxt','addRow','addCol','clearData','closeModal','cancelPaste','applyPaste','pasteArea','renameDataset','closeDatasetName','deleteDataset'];
for (const id of mainBindings) if (!main.includes(`#${id}`)) fail(`main.js does not reference #${id}`);
if ((main.match(/validateColumnNames\(a\[0\]\)/g) || []).length !== 2) fail('paste and CSV imports must both validate column names');
if (!dataTools.includes('validateColumnNames(headers)')) fail('Excel import must share the column-name validator');
for (const id of ['runRal','closeRal','closeRal2']) if (!ral.includes(`#${id}`)) fail(`ral.js does not reference #${id}`);

const toolsInit = main.indexOf('installDataTools();');
const navInit = main.indexOf('installNavigation();');
if (toolsInit < 0 || navInit < 0 || toolsInit > navInit) fail('Data tools must be installed before navigation so Data/Help commands exist when menus are assembled');
for (const marker of ["['dataMenu','Data'","['helpMenu','Help'",'validateDataset','dataTemplate','analysisHistory']) {
  if (!navigation.includes(marker)) fail(`navigation.js missing Data/Help menu contract: ${marker}`);
}

if (!main.includes('addEventListener') && !main.includes('.onclick=')) fail('main.js contains no event bindings');
if (!ral.includes('addEventListener')) fail('ral.js contains no event listeners');
if (!scientific.includes('analyzeParameter') || !scientific.includes('renderReport')) fail('scientific workflow is not connected to analysis/report engine');
const designMap = scientificReport.match(/export const designNames\s*=\s*\{([^}]*)\}/)?.[1] || '';
for (const design of ['ral','rak','fral','frak','split']) if (!new RegExp(`(?:^|[,\\s])${design}\\s*:`).test(designMap)) fail(`scientific report missing design ${design}`);
for (const required of ['F. Hitung','F. Tabel','table-caption']) if (!scientificReport.includes(required)) fail(`scientific-report.js missing reporting marker: ${required}`);
for (const required of ['centralF.inv','effectLevel','cvPercent','descriptiveMeanChart']) if (!report.includes(required)) fail(`report-utils.js missing ${required}`);

const printIds = [...printHtml.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]);
for (const id of ['pdfFile','cutoffPage','processPdf','downloadAll','detectionStatus','previewSection','previewCanvas','previewPage','prevPage','nextPage','usePreviewPage','status','summary','results']) {
  if (!printIds.includes(id)) fail(`print-skripsi missing required element #${id}`);
}
for (const id of ['prevPage','nextPage']) {
  if (!new RegExp(`<button[^>]*id="${id}"[^>]*aria-label="[^"]+"`).test(printHtml)) fail(`print-skripsi #${id} needs an accessible name`);
}
for (const marker of ['Print Skripsi','value="12"','pdf-lib@1.17.1','pdf.js/3.11.174','jszip/3.10.1','/print-skripsi/app.js','href="/"']) {
  if (!printHtml.includes(marker)) fail(`print-skripsi missing marker: ${marker}`);
}
for (const marker of ['detectChapterOne','renderPreview','downloadAllButton','new JSZip']) {
  if (!printApp.includes(marker)) fail(`print-skripsi app missing behavior marker: ${marker}`);
}

console.log(`UI contract OK: portfolio links to /stat/ and /print-skripsi/, /stat Data/Help menu initialization and analysis shell, /print-skripsi preview/BAB I detection/ZIP controls, scientific RAL/RAK/factorial/RPT workflow, correlation/path menu, and F-table reporting contract present.`);
