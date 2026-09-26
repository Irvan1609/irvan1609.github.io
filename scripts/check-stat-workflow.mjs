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
  'data-stat-workflow="setup"',
  'data-stat-workflow="analysis"',
  'data-stat-workflow="results"',
  'StatisticalWebWorkflow',
  'agrotik-analysis-complete'
])if(!workflow.includes(marker))fail('workflow missing '+marker);
for(const marker of ['Cek nilai kosong','event.altKey','summary:datasetSummary'])if(!workflow.includes(marker))fail('workflow readiness missing '+marker);
for(const marker of ['data-analysis-unified-view','data-analysis-more','data-analysis-search',"simpleCard('factorial'","simpleCard('more'"])if(!flow.includes(marker))fail('unified analysis flow missing '+marker);
 for(const obsolete of ['data-analysis-mode-toggle','Mode Lengkap','Mode Sederhana'])if(flow.includes(obsolete))fail('obsolete analysis mode remains '+obsolete);

for(const marker of ['analysisDockData','analysisDockAnalysis','analysis-results-open','scienceSimpleParameter','scienceAdvancedOptions','data-simple-result-view-select','result-view-summary','result-primary-actions'])if(!scientific.includes(marker))fail('simple results workspace missing '+marker);
if(!field.includes('fieldOpenAnalysis')||!field.includes('StatisticalWebWorkflow?.openAnalysis'))fail('field layout is not linked to analysis');
for(const marker of ['STAT UNIFIED WORKFLOW + FULLSCREEN RESULTS','.stat-workflow-strip','.analysis-dock-actions','STAT SIMPLE-FIRST UI','.analysis-simple-grid','.science-simple-parameter','.simple-result-view-select','/* COMPACT RESULT ACTIONS 2026-09-26 */'])if(!css.includes(marker))fail('workflow styling missing '+marker);

console.log('Stat workflow check OK: Data → Analisis → Atur → Hasil uses one compact interface with progressive settings and compact result views.');
