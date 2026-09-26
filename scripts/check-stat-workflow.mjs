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

function fail(message){console.error('Stat workflow check failed: '+message);process.exit(1);}

for(const marker of ["installStatWorkflow","./stat-workflow.js"])if(!main.includes(marker))fail('main missing '+marker);
for(const marker of [
  'id="statWorkflowStrip"',
  'data-stat-workflow="data"',
  'data-stat-workflow="analysis"',
  'data-stat-workflow="results"',
  'StatisticalWebWorkflow',
  'agrotik-analysis-complete'
])if(!workflow.includes(marker))fail('workflow missing '+marker);
for(const marker of ['Cek nilai kosong','event.altKey','summary:datasetSummary'])if(!workflow.includes(marker))fail('workflow readiness missing '+marker);
for(const marker of ['analysis-group-board','analysis-compact-group','analysis-compact-item','analysisSmartSuggestion','smartAnalysis','Rancangan Percobaan','Hubungan & Regresi','Genetik & Multilokasi','ANOVA Gabungan G×E'])if(!flow.includes(marker))fail('visible grouped/smart analysis flow missing '+marker);
if(flow.includes('Mode Lengkap')||flow.includes('Mode Sederhana'))fail('analysis mode switch must be removed');

for(const marker of ['analysisDockData','analysisDockAnalysis','analysis-results-open','scienceParameters','scienceTransforms','scienceAdvancedOptions','data-simple-result-view-select','result-view-summary','result-single-actions','data-result-mode-select','Parameter numerik dipilih otomatis','modelFormula','preflightGuardrails','reproducibility','agro-variety-rak','agro-dose-rak','agro-factorial-rak','agro-split'])if(!scientific.includes(marker))fail('compact results/parameter workspace missing '+marker);
if(!field.includes('fieldOpenAnalysis')||!field.includes('StatisticalWebWorkflow?.openAnalysis'))fail('field layout is not linked to analysis');
for(const marker of ['externalHeatmap','Residual model ANOVA','openFieldHeatmap(parameter,mode=\'raw\',values=null)'])if(!field.includes(marker))fail('exact residual field mapping missing '+marker);
for(const marker of ['exactResidualMap','field-residual','installStatHelp','STAT_HELP'])if(!resultOs.includes(marker))fail('result OS integration missing '+marker);
if(!resultOsCss.includes('STAT INLINE EXPLANATIONS 2026-09-27'))fail('stat explanation styles missing');
if(!engine.includes('row:o.row'))fail('ANOVA engine must preserve source-row identity for residual mapping');
for(const marker of ['STAT UNIFIED WORKFLOW + FULLSCREEN RESULTS','.stat-workflow-strip','.analysis-dock-actions','STAT ALL ANALYSES COMPACT GROUPS + AUTO PARAMETERS','STAT UNIFORM ANALYSIS CARDS 2026-09-26','.analysis-group-board','grid-template-columns:repeat(5,minmax(0,1fr))!important','height:42px!important','.science-parameter-check-grid','.simple-result-view-select','/* COMPACT RESULT ACTIONS 2026-09-26 */','STAT WORKSPACE CONSOLIDATION 2026-09-27','.analysis-smart-suggestion','.analysis-guardrail'])if(!css.includes(marker))fail('workflow styling missing '+marker);

if(workflow.includes('data-stat-workflow="setup"'))fail('setup must be consolidated into the analysis stage');
console.log('Stat workflow check OK: consolidated UX, smart/multilocation routing, agronomy presets, exact residual mapping, and inline statistical help.');
