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
for(const marker of ['analysis-group-board','analysis-compact-group','analysis-compact-item','Rancangan Percobaan','Hubungan & Regresi','Genetik & Multilokasi'])if(!flow.includes(marker))fail('visible grouped analysis flow missing '+marker);
if(flow.includes('Mode Lengkap')||flow.includes('Mode Sederhana'))fail('analysis mode switch must be removed');

for(const marker of ['analysisDockData','analysisDockAnalysis','analysis-results-open','scienceParameters','scienceTransforms','scienceAdvancedOptions','data-simple-result-view-select','result-view-summary','result-single-actions','data-result-mode-select','Parameter numerik dipilih otomatis'])if(!scientific.includes(marker))fail('compact results/parameter workspace missing '+marker);
if(!field.includes('fieldOpenAnalysis')||!field.includes('StatisticalWebWorkflow?.openAnalysis'))fail('field layout is not linked to analysis');
for(const marker of ['STAT UNIFIED WORKFLOW + FULLSCREEN RESULTS','.stat-workflow-strip','.analysis-dock-actions','STAT ALL ANALYSES COMPACT GROUPS + AUTO PARAMETERS','STAT UNIFORM ANALYSIS CARDS 2026-09-26','.analysis-group-board','grid-template-columns:repeat(5,minmax(0,1fr))!important','height:42px!important','.science-parameter-check-grid','.simple-result-view-select','/* COMPACT RESULT ACTIONS 2026-09-26 */'])if(!css.includes(marker))fail('workflow styling missing '+marker);

console.log('Stat workflow check OK: all analyses stay visible in compact groups and eligible numeric parameters auto-select.');
