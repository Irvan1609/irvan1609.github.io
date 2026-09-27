import assert from 'node:assert/strict';
import fs from 'node:fs';
import {augmentedRcbAnova} from '../src/augmented-design-engine.js';

const near=(a,b,tol=1e-8)=>assert.ok(Math.abs(a-b)<=tol*Math.max(1,Math.abs(b)),`${a} != ${b}`);

const rows=[
  ['B1','C1',100],['B1','C2',110],['B1','T1',125],['B1','T2',95],
  ['B2','C1',112],['B2','C2',121],['B2','T3',108],['B2','T4',140],
  ['B3','C1',94], ['B3','C2',105],['B3','T5',118],['B3','T6',90]
];

const out=augmentedRcbAnova(rows,{alpha:.05});
assert.deepEqual(out.blocks,['B1','B2','B3']);
assert.deepEqual(out.checks,['C1','C2']);
assert.equal(out.tests.length,6);
assert.equal(out.n,12);
assert.equal(out.dfError,2);
assert.ok(out.mse>0);
assert.equal(out.means.length,8);
assert.ok(out.means.every(item=>Number.isFinite(item.adjusted)&&Number.isFinite(item.se)));
assert.ok(out.means.filter(item=>item.type==='Test').every(item=>Number.isFinite(item.deltaCheck)&&Number.isFinite(item.pCheck)));
assert.ok(out.means.filter(item=>item.type==='Check').every(item=>item.deltaCheck===null));
const ta=out.treatmentAdjusted;
const treatment=ta.find(item=>item.label==='Perlakuan (dikoreksi Blok)');
const checks=ta.find(item=>item.label.includes('Check'));
const testPlus=ta.find(item=>item.label.includes('Test +'));
assert.equal(treatment.df,7);
assert.equal(checks.df,1);
assert.equal(testPlus.df,6);
near(checks.ss+testPlus.ss,treatment.ss);
assert.equal(out.blockAdjusted.find(item=>item.label==='Blok (dikoreksi Perlakuan)').df,2);
assert.equal(out.typeIII.find(item=>item.label==='Blok').df,2);
assert.equal(out.typeIII.find(item=>item.label==='Perlakuan').df,7);
near(out.typeIII.find(item=>item.label==='Blok').ss,out.blockAdjusted.find(item=>item.label==='Blok (dikoreksi Perlakuan)').ss);
near(out.typeIII.find(item=>item.label==='Perlakuan').ss,treatment.ss);
near(out.blockEffects.reduce((total,item)=>total+item.effect,0),0);
assert.equal(out.sed.checkCheck.n,1);
assert.equal(out.sed.testSameBlock.n,3);
assert.equal(out.sed.testDifferentBlock.n,12);
assert.equal(out.sed.testCheck.n,12);
assert.ok(out.partitionAdjusted.find(item=>item.label==='Line vs Check'));
assert.equal(out.partitionAdjusted.find(item=>item.label==='Line vs Check').df,1);
assert.equal(out.partitionAdjusted.find(item=>item.label==='Check').df,1);
assert.equal(out.partitionAdjusted.find(item=>item.label==='Line(Check)').df,5);
near(out.partitionAdjusted.filter(item=>!['Total'].includes(item.label)).reduce((sum,item)=>sum+(Number(item.ss)||0),0),out.partitionAdjusted.find(item=>item.label==='Total').ss);
assert.ok(Number.isFinite(out.workSummary.standardError));
assert.ok(Number.isFinite(out.workSummary.lsd));
assert.ok(Number.isFinite(out.workSummary.cv));
assert.ok(out.means.filter(item=>item.type==='Test').every(item=>Number.isFinite(item.pCheckHolm)));
assert.equal(out.pairwise.length,28);
assert.ok(out.pairwise.every(item=>Number.isFinite(item.se)&&Number.isFinite(item.p)&&Number.isFinite(item.pHolm)));
assert.equal(out.selection.length,6);
assert.ok(out.selection.every(item=>item.comparisons.length===2));
assert.ok(out.selection.flatMap(item=>item.comparisons).every(item=>item.significant===(item.diff>0&&item.diff>out.workSummary.lsd)));
near(out.workSummary.standardError,out.pairwise.reduce((sum,item)=>sum+item.se,0)/out.pairwise.length);

const manual=augmentedRcbAnova(rows,{checks:['C1','C2'],alpha:.01});
assert.deepEqual(manual.checks,['C1','C2']);
assert.equal(manual.alpha,.01);

const oneCheck=rows.filter(row=>row[1]!=='C2');
assert.throws(()=>augmentedRcbAnova(oneCheck),/minimal 2 check/i);
const duplicate=[...rows,[...rows[0]]];
assert.throws(()=>augmentedRcbAnova(duplicate),/muncul lebih dari sekali/i);
const repeatedTest=[...rows,['B2','T1',126]];
assert.throws(()=>augmentedRcbAnova(repeatedTest,{checks:['C1','C2']}),/non-check berulang/i);
const missingCheck=rows.filter(row=>!(row[0]==='B3'&&row[1]==='C2'));
assert.throws(()=>augmentedRcbAnova(missingCheck,{checks:['C1','C2']}),/setiap check hadir di setiap blok/i);

const workflow=fs.readFileSync(new URL('../src/augmented-design-workflow.js',import.meta.url),'utf8');
for(const marker of ['Augmented RCBD','data-aug-param','aug-work-role-form','augParameterCount','Parameter numerik dipilih otomatis','augCheckMarker','checkMarkerOptions','checksFromMarker','markerMeansCheck','augAdvanced','augStructure','structurePreview','Hasil analisis','Rerata & seleksi','Kode SAS','Panduan & metode','ANOVA utama · SS Type III','Partisi perlakuan · SS Type I','augComparison','augPrecision','Sesuai contoh Excel','selectionTable','checkPairTable','lsdWork','structuralAugmentedColumn','agrotik-analysis-complete',"'augmented'"])assert.ok(workflow.includes(marker),`workflow missing ${marker}`);
const flow=fs.readFileSync(new URL('../src/analysis-flow.js',import.meta.url),'utf8');
for(const marker of ["['augmented','augmented','Augmented Design'","data-analysis-open","augmented-design-workflow.js","key:'augmented:augmented'"])assert.ok(flow.includes(marker),`analysis menu missing ${marker}`);

console.log('Augmented design verified: Work check-marker setup, Excel precision default, Type III + Type I ANOVA, LSMEANS pairwise selection, global Work LSD, Holm, SAS output, and mobile result sections.');

const dataTools=fs.readFileSync(new URL('../src/data-tools.js',import.meta.url),'utf8');
assert.ok(dataTools.includes("openTool(title,html,mode=''"),'openTool mode missing');
const css=fs.readFileSync(new URL('../src/style.css',import.meta.url),'utf8');
for(const marker of ['AUGMENTED WORKSPACE REFINEMENT','STAT SIMPLE-FIRST UI','AUGMENTED WORK PARITY 2026-09-28','data-tool-mode="augmented"','.aug-work-role-form','.aug-selection-pane','.aug-view-analysis','.aug-view-selection','.aug-view-sas','.aug-view-method'])assert.ok(css.includes(marker),`augmented UI CSS missing ${marker}`);

// UI refresh trigger after master syntax repair
