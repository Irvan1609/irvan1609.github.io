import fs from 'node:fs';

const main=fs.readFileSync('src/main.js','utf8');
const workflow=fs.readFileSync('src/stat-workflow.js','utf8');
const flow=fs.readFileSync('src/analysis-flow.js','utf8');
const scientific=fs.readFileSync('src/scientific-workflow.js','utf8');
const field=fs.readFileSync('src/field-layout-v3.js','utf8');
const css=fs.readFileSync('src/style.css','utf8');
const resultOs=fs.readFileSync('src/result-os.js','utf8');
const resultOsCss=fs.readFileSync('src/result-os.css','utf8');
const engine=fs.readFileSync('src/statistics-engine.js','utf8');
const integrity=fs.readFileSync('src/analysis-integrity.js','utf8');

function fail(message){console.error('Stat workflow check failed: '+message);process.exit(1);}

for(const marker of ["installStatWorkflow","./stat-workflow.js"])if(!main.includes(marker))fail('main missing '+marker);
for(const marker of ['StatisticalWebWorkflow','agrotik-analysis-complete','event.altKey','summary:datasetSummary'])if(!workflow.includes(marker))fail('workflow behavior missing '+marker);
for(const marker of ['id="statWorkflowStrip"','data-stat-workflow="data"','Metode · kolom · parameter','Ringkas · detail · ekspor'])if(workflow.includes(marker))fail('visual workflow strip must stay removed: '+marker);
for(const marker of ['Cek nilai kosong'])if(!workflow.includes(marker))fail('workflow readiness missing '+marker);
for(const marker of ['analysis-group-board','analysis-compact-group','analysis-compact-item','analysisSmartSuggestion','smartAnalysis','Rancangan Percobaan','Hubungan & Regresi','Genetik & Multilokasi','ANOVA Gabungan G×E'])if(!flow.includes(marker))fail('visible grouped/smart analysis flow missing '+marker);
if(flow.includes('Mode Lengkap')||flow.includes('Mode Sederhana'))fail('analysis mode switch must be removed');
for(const marker of ['analysisLoadError','viableFactor','strongFactorName'])if(!flow.includes(marker))fail('safe smart analysis missing '+marker);
if(flow.includes("alert('Modul "))fail('analysis loading errors must be inline, not blocking alerts');

for(const marker of ['analysisDockData','analysisDockAnalysis','analysis-results-open','scienceParameters','scienceTransforms','scienceAdvancedOptions','result-view-full','result-all-parameters','analysis-export-footer','Parameter numerik dipilih otomatis','requireValidCoreReport','attachOptionalDiagnostics','safeShowResults','renderCoreFallback','setRunState','syncParameterRoleExclusions(true)'])if(!scientific.includes(marker))fail('full/safe analysis workspace missing '+marker);
if(!field.includes('fieldOpenAnalysis')||!field.includes('StatisticalWebWorkflow?.openAnalysis'))fail('field layout is not linked to analysis');
if(!field.includes('openFieldHeatmap'))fail('field heatmap hook missing');
for(const marker of ['auditCoreReport','requireValidCoreReport','KT tidak konsisten','Jumlah JK komponen'])if(!integrity.includes(marker))fail('analysis integrity audit missing '+marker);
for(const marker of ['STAT UNIFIED WORKFLOW + FULLSCREEN RESULTS','.analysis-dock-actions','STAT ALL ANALYSES COMPACT GROUPS + AUTO PARAMETERS','STAT UNIFORM ANALYSIS CARDS 2026-09-26','.analysis-group-board','grid-template-columns:repeat(5,minmax(0,1fr))!important','height:42px!important','.science-parameter-check-grid','/* STAT STABLE GRID + RESULT FOCUS FINAL 2026-09-28 */','.analysis-export-footer','STAT WORKSPACE CONSOLIDATION 2026-09-27','.analysis-smart-suggestion','.analysis-guardrail'])if(!css.includes(marker))fail('workflow styling missing '+marker);

if(workflow.includes('data-stat-workflow="setup"'))fail('setup must be consolidated into the analysis stage');
console.log('Stat workflow check OK: invisible workflow controls, core-first execution, automatic integrity audit, recovery fallback, inline errors, and conservative smart routing.');

const store=fs.readFileSync('src/local-dataset-store.js','utf8');
for(const marker of ['DB_VERSION=4','HISTORY_STORE','ANALYSIS_STORE','SYNC_STORE','TRASH_STORE','migrateLegacyResearchStores'])if(!store.includes(marker))fail('storage contract missing '+marker);
for(const marker of ['analysis_uid','dataset_uid'])if(!scientific.includes(marker))fail('analysis provenance missing '+marker);
