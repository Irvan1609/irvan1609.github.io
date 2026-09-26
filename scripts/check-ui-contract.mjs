import fs from 'node:fs';
import './check-dataset-import.mjs';

const portfolioHtml = fs.readFileSync('index.html', 'utf8');
const html = fs.readFileSync('stat/index.html', 'utf8');
const printHtml = fs.readFileSync('print-skripsi/index.html', 'utf8');
const mendeleyHtml = fs.readFileSync('mendeley/index.html', 'utf8');
const mendeleyApp = fs.readFileSync('mendeley/app.js', 'utf8');
const main = fs.readFileSync('src/main.js', 'utf8');
const navigation = fs.readFileSync('src/navigation.js', 'utf8');
const flow = fs.readFileSync('src/analysis-flow.js', 'utf8');
const scientific = fs.readFileSync('src/scientific-workflow.js', 'utf8');
const scientificReport = fs.readFileSync('src/scientific-report.js', 'utf8');
const bab4 = fs.readFileSync('src/bab4-table.js', 'utf8');
const resultExport = fs.readFileSync('src/result-export.js', 'utf8');
const resultOs = fs.readFileSync('src/result-os.js', 'utf8');
const resultOsStyle = fs.readFileSync('src/result-os.css', 'utf8');
const report = fs.readFileSync('src/report-utils.js', 'utf8');
const printApp = fs.readFileSync('print-skripsi/app.js', 'utf8');
const dataTools = fs.readFileSync('src/data-tools.js', 'utf8');
const statStyle = fs.readFileSync('src/style.css', 'utf8');
const displaySettings = fs.readFileSync('src/display-settings.js', 'utf8');
const sharedHeader = fs.readFileSync('public/subweb-header.css', 'utf8');
const chiliHtml = fs.readFileSync('public/hitung-cabai/index.html', 'utf8');
const chiliApp = fs.readFileSync('public/hitung-cabai/app.js', 'utf8');
const chiliDetector = fs.readFileSync('public/hitung-cabai/detector.js', 'utf8');

function fail(message) {
  console.error(`UI contract failed: ${message}`);
  process.exit(1);
}

for (const marker of ['Mahasiswa Agronomi','href="/stat/"','href="/print-skripsi/"','href="/mendeley/"','Statistical Web']) {
  if (!portfolioHtml.includes(marker)) fail(`portfolio root missing marker: ${marker}`);
}
if (portfolioHtml.includes('id="gridWrap"')) fail('portfolio root must not contain the statistical application shell');
if (main.includes('installReferenceManager') || navigation.includes("['referencesMenu','Referensi'")) fail('Mendeley helper must not be embedded in /stat');
for (const marker of ['Referensi Mendeley','referenceQuery','referenceExportRis','referenceLibrary','/mendeley/app.js']) if (!mendeleyHtml.includes(marker)) fail(`/mendeley missing marker: ${marker}`);
for (const marker of ['api.crossref.org','toRis','toBibtex','statistical_web_reference_library_v1']) if (!mendeleyApp.includes(marker)) fail(`/mendeley app missing marker: ${marker}`);

const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]);
const duplicates = ids.filter((id, i) => ids.indexOf(id) !== i);
if (duplicates.length) fail(`duplicate id(s): ${[...new Set(duplicates)].join(', ')}`);

for(const marker of ['body>.subweb-header','body>#app','body>.modal-backdrop','body>.analysis-result-dock','body>#columnContextMenu'])if(!displaySettings.includes(marker))fail('display size must scale all Statistical Web UI surfaces: '+marker);
if(displaySettings.includes('#app{zoom:var(--ui-scale)}'))fail('display size must not scale only #app');

const requiredIds = [
  'pasteBtn','importBtn','newTxt','addRow','addCol','clearData','file',
  'pasteModal','closeModal','cancelPaste','applyPaste','pasteArea',
  'openAnalysis','globalSearchButton','globalSearchModal','closeGlobalSearch','globalSearch','globalSearchResults','renameDataset','deleteDataset','datasetNameForm',
  'status','errorBox','gridWrap','plantName','treatmentName','plantNameSummary','treatmentNameSummary','datasetMetaEditor',
  'columnNameModal','columnNameForm','columnCode','columnFullName','columnUnit','parameterSuggestion','columnStringSection','columnStringUnit','columnStringLevels',
  'datasetSearch','duplicateDataset','viewRawDataset','viewDatasetMeta','datasetHistory','datasetViewModal','datasetViewBody','closeDatasetView','compactEditor','saveIndicator'
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

for (const [modalId,titleId] of [['globalSearchModal','globalSearchTitle'],['pasteModal','pasteModalTitle'],['datasetNameModal','datasetNameTitle'],['datasetViewModal','datasetViewTitle'],['columnNameModal','columnNameTitle']]) {
  if(!html.includes(`id="${modalId}"`)||!html.includes(`aria-labelledby="${titleId}"`)||!html.includes(`id="${titleId}"`))fail(`#${modalId} needs an accessible title`);
}
if((html.match(/role="dialog"/g)||[]).length<5||(html.match(/aria-modal="true"/g)||[]).length<5)fail('core Statistical Web modals need dialog semantics');

for (const id of ['closeGlobalSearch','closeModal','closeDatasetName','closeDatasetView','closeColumnName']) {
  if (!new RegExp(`<button[^>]*id="${id}"[^>]*aria-label="[^"]+"`).test(html)) fail(`#${id} needs an accessible name`);
}

const moduleScripts = [...html.matchAll(/<script\s+type="module"\s+src="([^"]+)"/g)].map(m => m[1]);
for (const src of ['/src/main.js']) if (!moduleScripts.includes(src)) fail(`missing module script ${src}`);
if(moduleScripts.includes('/src/ral.js'))fail('legacy RAL module must not be loaded in production shell');
if (html.includes('report-enhancements.js')) fail('report-enhancements.js must not be loaded in production shell');

const nav=html.match(/<nav class="nav"[^>]*>([\s\S]*?)<\/nav>/)?.[1]||'';
if((nav.match(/<button\b/g)||[]).length!==3||!nav.includes('openAnalysis')||!nav.includes('globalSearchButton')||!nav.includes('projectToggle')||nav.includes('focusData')||!/>Analisis<\/button>/.test(nav))fail('top navigation must stay minimal: Analisis, Cari, and Dataset');
for(const [name,page] of [['stat',html],['mendeley',mendeleyHtml],['print',printHtml],['hitung-cabai',chiliHtml]]){
  for(const href of ['href="/"','href="/stat/"','href="/hitung-cabai/"','href="/print-skripsi/"','href="/mendeley/"'])if(!page.includes(href))fail(`${name} shared header missing ${href}`);
  if(!page.includes('/subweb-header.css')||!page.includes('class="subweb-header"')||!page.includes('class="subweb-nav"'))fail(`${name} must use shared sub-web header`);
}
if(!html.includes('class="subweb-brand" href="/"')||!html.includes('Statistical Web'))fail('stat header must use Statistical Web brand link back to portfolio');
if(!sharedHeader.includes('.subweb-header')||!sharedHeader.includes('.subweb-nav'))fail('shared sub-web header stylesheet missing core classes');
for(const id of ['openCamera','cameraFile','photo','cameraPanel','cameraVideo','snapPhoto','flipCamera','torchCamera','closeCamera','sample','count','autoDetect','detectColor','detectSensitivity','detectOnLoad','mode','zoom','undo','sendToStat','save','viewport','canvas','status','mobileSave','mobileUndo','records','export','import']){
  if(!chiliHtml.includes(`id="${id}"`))fail(`hitung-cabai missing #${id}`);
}
for(const marker of ['capture="environment"','playsinline','mobile-actionbar','Pas layar'])if(!chiliHtml.includes(marker))fail(`hitung-cabai mobile UI missing ${marker}`);
if(!chiliHtml.includes('#viewport{width:100%;overflow:hidden'))fail('hitung-cabai viewport must fit width without internal scrolling');
for(const marker of ['getUserMedia','facingMode','applyConstraints','torch','pointerdown','pointermove','pointerup','optimizePhoto','indexedDB','beforeunload','autoDetectChilies','detectChiliBoxesFromImageData','upsertChiliCountToStatistics','sendCurrentToStatistics'])if(!chiliApp.includes(marker))fail(`hitung-cabai app missing ${marker}`);
for(const marker of ['detectChiliBoxesFromImageData','rgbToHsv','components','mergeFragments'])if(!chiliDetector.includes(marker))fail(`hitung-cabai detector missing ${marker}`);
if(!portfolioHtml.includes('href="/hitung-cabai/"'))fail('portfolio must link to hitung-cabai');

if(html.includes('src="/src/rak-dnd.js"'))fail('legacy drag interface must not be loaded');
for(const id of ['openAnalysis','analysisMenu'])if(!flow.includes(id))fail('analysis flow missing '+id);
for(const marker of ['analysisGroups','analysis-group-board','analysis-compact-group','analysis-compact-item','data-analysis-open'])if(!flow.includes(marker))fail('compact grouped analysis selection missing '+marker);
if(flow.includes('analysis-menu-head')||flow.includes('Pilih analisis'))fail('analysis chooser must open directly without an instructional heading');
if(flow.includes('data-open-other'))fail('Lainnya must open directly from the selector without a redundant Buka button');
if(flow.includes('Mode Lengkap')||flow.includes('Mode Sederhana')||flow.includes('data-analysis-mode-toggle'))fail('analysis selection must use one compact interface without mode switches');
if(!statStyle.includes('STAT COMPACT CONTROLS 2026-09-26')||!statStyle.includes('.analysis-other-picker'))fail('compact analysis picker styles missing');
for(const marker of ['/* DESKTOP WIDE ANALYSIS PANEL 2026-09-26 */','/* DESKTOP ANALYSIS ALL COLUMNS 2026-09-26 */','@media(min-width:901px)','grid-template-columns:repeat(5,minmax(0,1fr))!important','.analysis-group-items[hidden]','grid-template-columns:1fr!important'])if(!statStyle.includes(marker))fail('desktop all-column analysis panel missing '+marker);
if(flow.includes('analysisOtherSelect')||flow.includes('data-analysis-more')||flow.includes('data-analysis-factorial'))fail('all analyses must stay visible instead of being hidden behind compact pickers');
if(flow.includes('analysisSearch'))fail('analysis-specific search must be replaced by the global search');
for(const required of ["Rancangan Percobaan","Hubungan & Regresi","Multivariat","Genetik & Multilokasi","Perencanaan","'association','correlation'","'association','path'"])if(!flow.includes(required))fail('analysis flow missing visible grouped analysis requirement: '+required);
if(!flow.includes("openScientificLazy(value)")&&!flow.includes("openScientific(button.dataset.design)"))fail('analysis flow must open the selected scientific design, directly or lazily');
for(const marker of ["import('./scientific-workflow.js')","import('./association-workflow.js')","import('./advanced-workflow.js')","import('./nextgen-workflow.js')"])if(!flow.includes(marker))fail('analysis flow must lazy-load heavy analysis modules: '+marker);

const mainBindings = ['pasteBtn','importBtn','newTxt','addRow','addCol','clearData','closeModal','cancelPaste','applyPaste','pasteArea','renameDataset','closeDatasetName','deleteDataset','closeColumnName','columnNameForm','columnCode','columnFullName','columnUnit','columnStringSection','columnStringUnit','columnStringLevels','plantName','treatmentName','plantNameSummary','treatmentNameSummary'];
for (const id of mainBindings) if (!main.includes(`#${id}`)) fail(`main.js does not reference #${id}`);
if ((main.match(/validateColumnNames\(a\[0\]\)/g) || []).length !== 2) fail('paste and CSV imports must both validate column names');
if (!dataTools.includes('validateColumnNames(headers)')) fail('Excel import must share the column-name validator');
if(!main.includes("statistical_web_csv_files_v1")||!main.includes("statistical_web_active_csv_v1"))fail('dataset editor must use CSV-backed storage');
if(!main.includes('migrateLegacyStorage')||!main.includes('statistical_web_txt_files_v2'))fail('CSV storage must retain legacy TXT migration');
if(!main.includes('displayDatasetName')||!main.includes("name=base+'.csv'"))fail('dataset editor must hide CSV extension in UI while storing CSV datasets');
if(!main.includes('data-add-row')||!main.includes('data-add-col'))fail('data grid corner must expose + Baris / + Kolom controls');
if(!main.includes('columnHeaderMarkup')||!main.includes('columnFullName')||!main.includes('columnUnit')||!main.includes('buildParameterHeader'))fail('column editor must support separate kode, nama lengkap, and satuan inputs');
if(!main.includes('renderParameterSuggestions')||!main.includes('suggestAgronomicParameters')||!main.includes('Klik Simpan untuk mengubah header kolom'))fail('agronomic dictionary must remain an opt-in suggestion workflow');
if(main.includes('categoryMapMarkup')||main.includes('data-category-value')||main.includes('data-category-unit'))fail('string mapping controls must not be rendered above data columns');
if(!main.includes('renderStringColumnEditor')||!main.includes('data-column-string-level')||!main.includes('saveCategoryMetadata')||!main.includes('columnStringUnit'))fail('string columns must expose value mapping inside the column editor with one shared unit');
if(!main.includes('bindGridArrowNavigation')||!main.includes('bindColumnFormArrowNavigation'))fail('desktop arrow-key navigation must work for grid cells and column-editor inputs');
for(const marker of ['pushUndo','undoEditor','redoEditor','pasteIntoGrid','selectionRange','copySelectedCells','duplicateDataset','recordEditorHistory','showRawDataset','showDatasetMetadata','showDatasetHistory','toggleCompactEditor','installEditorShortcuts'])if(!main.includes(marker))fail(`editor feature missing ${marker}`);
if(!main.includes('detectColumnType')||!main.includes('columnTooltip'))fail('editor must detect column types and expose metadata tooltips');
if(!statStyle.includes('.cell-selected')||!statStyle.includes('.compact-data-editor')||!statStyle.includes('.save-indicator'))fail('editor CSS missing selection/compact/autosave styles');
if(!statStyle.includes('/* No frozen table rows/columns. */')||!statStyle.includes('position:static!important'))fail('data table must not freeze rows or columns');
if(!dataTools.includes("plant:$('#plantName')")||!dataTools.includes("treatment:$('#treatmentName')"))fail('analysis dataset must carry plant and treatment metadata');
if(!scientific.includes('data-print-results')||!scientific.includes('datasetMeta={plant:data.plant'))fail('scientific results must include print mode and dataset context');

if(!statStyle.includes('.data-grid thead th.string-column')||!statStyle.includes('.column-string-section')||!statStyle.includes('.string-column-cell'))fail('string columns must use responsive color and integrated editor mapping');
if(main.includes('string-column-badge')||main.includes('>STRING<')||statStyle.includes('.string-column-badge'))fail('string columns must not add text badges');
if(!main.includes('data-column-header')||!dataTools.includes('th[data-column-header]'))fail('analysis readers must ignore string-mapping controls and use canonical column headers');
if(html.includes('id="info"')||html.includes('id="storageStatus"')||html.includes('dataset.txt'))fail('stat sheet header must not show dimensions/file-count/TXT extension');
if(!statStyle.includes("content:'×'"))fail('row/column delete affordance must use × rather than a trash icon');
if(html.includes('🗑')||main.includes('🗑')||navigation.includes('🗑'))fail('Statistical Web delete controls must not use trash emoji');
if(portfolioHtml.includes('Peneliti Agronomi')||portfolioHtml.includes('Pertanyaan agronomi yang diuji secara mekanistik'))fail('portfolio tone must remain student-oriented');
for(const [name,page] of [['portfolio',portfolioHtml],['stat',html],['mendeley',mendeleyHtml],['print',printHtml]]){
  for(const phrase of ['Interpretasi otomatis siap BAB IV','Reference workflow','PDF utility','>Analyze<'])if(page.includes(phrase))fail(`${name} still contains overly generic/generated UI phrase: ${phrase}`);
}
if(!portfolioHtml.includes('Mahasiswa Agronomi')||portfolioHtml.includes('Statistik Irvan'))fail('portfolio and sub-web branding must stay modest and student-oriented');


const toolsInit = main.indexOf('installDataTools();');
const navInit = main.indexOf('installNavigation();');
if (toolsInit < 0 || navInit < 0 || toolsInit > navInit) fail('Data tools must be installed before navigation so app-menu commands exist when the menu is assembled');
for (const marker of ["['fileMenu','File'","['dataMenu','Data'","['helpMenu','Bantuan'",'validateDataset','dataTemplate','analysisHistory','globalSearchButton','globalSearchModal','globalSearch','globalSearchResults','buildGlobalIndex','data-column-header']) {
  if (!navigation.includes(marker)) fail(`navigation.js missing classic menu/global-search contract: ${marker}`);
}

if (!main.includes('addEventListener') && !main.includes('.onclick=')) fail('main.js contains no event bindings');
if (!scientific.includes('analyzeParameter') || !scientific.includes('renderReport') || !scientific.includes('designStructure') || !scientific.includes('scienceStructure')) fail('scientific workflow is not connected to analysis/report/structure engine');
if(scientific.includes('id="validateScience"'))fail('analysis setup must validate automatically without a redundant Periksa button');
if(!scientific.includes("event.key==='Enter'"))fail('analysis setup must keep a keyboard run shortcut');
for(const marker of ["phoneGuardMode()","runButton.disabled=!ready","runButton.textContent=ready?'Jalankan':'Lengkapi pilihan'","runButton.textContent='Jalankan analisis'"])if(!scientific.includes(marker))fail('phone-only safe analysis run state missing '+marker);
for (const marker of ['renderAnalysisSummary','inspectDataQuality','scienceQuality','transformationOptions','transformObservations','data-transform.js','treatment-metadata.js','category-metadata.js','readCategoryMetadata','categoryLevelDescription','auditReports','data-thesis-check']) if (!scientific.includes(marker)) fail(`scientific workflow missing ${marker}`);
if(scientific.includes('Definisi perlakuan untuk tabel & interpretasi BAB IV')||scientific.includes('scienceTreatmentFields'))fail('analysis dialog must use existing metadata instead of a duplicate treatment-definition editor');
for (const marker of ['Catatan interpretasi','copy-interpretation','renderBab4Table','Data sebelum transformasi','Sidik ragam sebelum transformasi','renderDecisionSummary','residualHistogram','renderInfluenceDiagnostics']) if (!scientificReport.includes(marker)) fail(`scientific report missing ${marker}`);
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

for(const marker of ['bindInlineDatasetMeta','data-meta-field','refreshColumnType','moveColumn','bindColumnDrag','data-column-index','data-drag-column'])if(!main.includes(marker))fail('direct metadata/live-type/drag feature missing '+marker);
if(html.includes('id="focusData"')||html.includes('id="toggleDatasetMeta"'))fail('obsolete focus/edit-information controls must be removed');
if(!html.includes('contenteditable="true" role="textbox" aria-label="Tanaman"')||!html.includes('contenteditable="true" role="textbox" aria-label="Perlakuan"'))fail('plant and treatment metadata must be directly editable');
if(!statStyle.includes('.analysis-command-panel')||!statStyle.includes('.column-drag-handle')||!statStyle.includes('.result-collapse-toggle'))fail('responsive analysis/column-drag/collapse styles are missing');
if(!scientific.includes('data-thesis-table-mode')||!scientific.includes('thesis-table-mode')||!scientific.includes('data-summary-parameter'))fail('compact analysis results must provide thesis-table mode and summary-to-parameter navigation');
for(const marker of ['data-simple-result-view-select','result-single-actions','data-result-mode-select','data-os-copy-word','export-bab4','scienceParameters','scienceTransforms','science-param-check','Parameter numerik dipilih otomatis'])if(!scientific.includes(marker))fail('compact result/parameter workflow missing '+marker);
for(const marker of ['result-card-actions','result-card-copy','result-card-export','result-card-more'])if(!resultExport.includes(marker))fail('per-result compact actions missing '+marker);
for(const marker of ['result-os-menu','result-os-menu-body'])if(!resultOs.includes(marker))fail('Result OS compact menu missing '+marker);
if(!statStyle.includes('/* COMPACT RESULT ACTIONS 2026-09-26 */')||!resultOsStyle.includes('/* COMPACT RESULT OS CONTROLS 2026-09-26 */'))fail('compact result action styles missing');
if(!statStyle.includes('/* STAT COMPACT POLISH 2026-09-26 */')||!resultOsStyle.includes('/* RESULT OS PASSIVE METRICS 2026-09-26 */'))fail('compact polish styles missing');
if(!statStyle.includes('/* STAT MOBILE SCALE SYSTEM 2026-09-26 */')||!resultOsStyle.includes('/* RESULT OS MOBILE SCALE SYSTEM 2026-09-26 */'))fail('mobile scale system missing');
for(const marker of ['data-result-filter','data-result-focus','data-compare-mode','data-publication-mode','data-result-prev','data-result-next','RESULT_ORDER','persistResultOrder','CONFIG','saveAnalysisConfig','restoreAnalysisConfig','sciencePreset','PRESETS'])if(!scientific.includes(marker))fail('analysis powerup missing '+marker);
for(const marker of ['detectScientificDesign','quickRunLastScientific','hasSavedScientificConfig','datasetFingerprint','snapshotActiveDataset','data-stale-banner','data-presentation-mode','data-rerun-stale','resultVersion','compareHistoryEntries','data-history-compare','data-focus-error-row'])if(!scientific.includes(marker)&&!main.includes(marker))fail('analysis productivity feature missing '+marker);
for(const marker of ['export-bab4','exportBab4Doc','application/msword','copy-publication'])if(!resultExport.includes(marker))fail('BAB IV/Word export workflow missing '+marker);
for(const marker of ['focusCell','snapshotActiveDataset',"key==='/'","simpan manual"])if(!main.includes(marker))fail('editor analysis integration missing '+marker);
if(!html.includes('class="header-icon-button"')||!html.includes('title="Cari (/)"'))fail('secondary header controls must stay compact and shortcut-aware');
for(const marker of ['data-overall-significance','overallSignificance','analysis-smart-warning','smartPosthocWarning'])if(!scientificReport.includes(marker))fail('result significance/warning behavior missing '+marker);
if(!scientificReport.includes("if(interaction&&Number.isFinite(interaction.p)&&interaction.p<.05)html+=interactionHtml"))fail('irrelevant interaction graphs must stay hidden');
if(!statStyle.includes('.analysis-result-toolbar')||!statStyle.includes('.publication-table-mode')||!statStyle.includes('.mobile-result-nav')||!statStyle.includes('.result-drag-handle'))fail('analysis filter/publication/mobile/drag styles are missing');
for(const marker of ['.analysis-quick-area','.analysis-favorite','.analysis-stale-banner','.presentation-results-mode','.analysis-version-compare','.validation-cell-link','.header-icon-button'])if(!statStyle.includes(marker))fail('analysis productivity styles missing '+marker);
if(!bab4.includes('copy-publication')||!resultExport.includes("action==='copy-publication'"))fail('publication table copy workflow is missing');
if(!scientificReport.includes('analysis-result-meta')||!scientificReport.includes('result-technical-details')||!scientificReport.includes('compactStatus'))fail('scientific report must expose compact status and collapsible technical details');
if(!statStyle.includes('.thesis-table-mode')||!statStyle.includes('.result-status-chip')||!statStyle.includes('.summary-parameter-link'))fail('compact result/thesis mode styles are missing');
if(!html.includes('placeholder="Cari fitur, analisis, dataset, kolom…"'))fail('global search must advertise its broad scope');
if(!statStyle.includes('.global-search-dialog')||!statStyle.includes('.global-search-item'))fail('global search dialog styles are missing');
for(const feature of ['bindColumnResize','autoSizeColumn','installFillHandle','openGridFind','openColumnContextMenu','installPanelResize','gridQualityModel','COLUMN_WIDTHS_KEY'])
  if(!main.includes(feature))fail('spreadsheet UX missing '+feature);
for(const feature of ['analysisResultDock','analysisDockResults','selectedColumnIndexes'])
  if(!scientific.includes(feature))fail('analysis dock/selected-column workflow missing '+feature);
for(const feature of ['.column-resizer','.fill-handle','.grid-find-bar','.analysis-result-dock','.cell-missing','.cell-type-warning','.duplicate-row'])
  if(!statStyle.includes(feature))fail('spreadsheet UX CSS missing '+feature);
if(!html.includes('id="activeFile" role="button" tabindex="0"'))fail('dataset name must be directly renameable from the sheet header');
for(const feature of ['local-dataset-store.js','virtual-grid.js','migrateLargeLocalDatasets','isLocalPointer','storeDatasetContent','renderGridRows','ensureGridRowVisible','VIRTUALIZE_AFTER_ROWS','gridQualityModel'])
  if(!main.includes(feature))fail('local-first/virtual grid feature missing '+feature);
if(!dataTools.includes('StatisticalWebData')||!dataTools.includes('tbody tr:not(.virtual-spacer)'))fail('analysis must read full state with virtual-grid fallback');
if(!statStyle.includes('.virtual-spacer'))fail('virtual grid spacer styling missing');
for(const marker of ['/* MOBILE-FIRST FINAL OVERRIDES 2026-09-26 */','.mobile-dataset-backdrop','#mobileMoreButton','.analysis-result-dock','.app-header .nav>button']){
  if(!statStyle.includes(marker))fail('final mobile Statistical Web styling missing '+marker);
}
for(const marker of ['ensureMobileDatasetBackdrop','mobileDatasetBackdrop',"button.textContent=opening?'✕':'☰'"]){
  if(!main.includes(marker))fail('mobile dataset drawer behavior missing '+marker);
}
for(const marker of ['mobileMoreButton','mobileMorePanel','data-open-command']){
  if(!navigation.includes(marker))fail('mobile command menu missing '+marker);
}
if(!sharedHeader.includes('/* MOBILE HEADER FINAL 2026-09-26 */')||!sharedHeader.includes('summary::before'))fail('shared phone header must use compact icon menu');
if(!chiliHtml.includes('/* MOBILE-FIRST FINAL 2026-09-26 */'))fail('Hitung Cabai phone workspace override missing');

console.log(`UI contract OK: simplified Statistical Web with direct metadata editing, live column typing, drag reorder, and no frozen table.`);

if (scientific.includes('export-appendix') || scientific.includes('Lampiran Skripsi/Tesis (.xlsx)')) fail('scientific workflow must not add a separate appendix export button');
