import fs from 'node:fs';

const main=fs.readFileSync('src/main.js','utf8');
const workflow=fs.readFileSync('src/stat-workflow.js','utf8');
const flow=fs.readFileSync('src/analysis-flow.js','utf8');
const scientific=fs.readFileSync('src/scientific-workflow.js','utf8');
const field=fs.readFileSync('src/field-layout-v3.js','utf8');
const css=fs.readFileSync('src/style.css','utf8');

function fail(message){console.error('Stat workflow check failed: '+message);process.exit(1);}

for(const marker of ["installStatWorkflow","./stat-workflow.js"])if(!main.includes(marker))fail('main missing '+marker);
for(const marker of [
  'id="statWorkflowStrip"',
  'data-stat-workflow="data"',
  'data-stat-workflow="field"',
  'data-stat-workflow="analysis"',
  'data-stat-workflow="results"',
  'StatisticalWebWorkflow',
  'agrotik-analysis-complete'
])if(!workflow.includes(marker))fail('workflow missing '+marker);
for(const marker of ['Cek nilai kosong','event.altKey','summary:datasetSummary'])if(!workflow.includes(marker))fail('workflow readiness missing '+marker);
for(const marker of ['data-check-data','if(!compact)','if(!phoneGuardMode())return'])if(!flow.includes(marker))fail('analysis flow missing '+marker);

for(const marker of ['analysisDockData','analysisDockAnalysis','analysis-results-open'])if(!scientific.includes(marker))fail('results workspace missing '+marker);
if(!field.includes('fieldOpenAnalysis')||!field.includes('StatisticalWebWorkflow?.openAnalysis'))fail('field layout is not linked to analysis');
for(const marker of ['STAT UNIFIED WORKFLOW + FULLSCREEN RESULTS','.stat-workflow-strip','.analysis-dock-actions','inset:max(6px','STAT DESKTOP OPEN CATEGORIES + PREFLIGHT','.analysis-data-check'])if(!css.includes(marker))fail('workflow styling missing '+marker);

console.log('Stat workflow check OK: Data → Denah → Analisis → Hasil is linked and results use the full-screen workspace.');
