import assert from 'node:assert/strict';
import {templateCatalog,getDataTemplate,rowsForEditor,templateHelp} from '../src/template-catalog.js';
import {analyzeParameter,validateData,designStructure} from '../src/statistics-engine.js';
import {nestedAnova,repeatedMeasuresAnova} from '../src/design-extensions-engine.js';
import {descriptiveStatistics,polynomialRegression,pca,combinedAnova,geneticParameters} from '../src/advanced-engine.js';
import {correlation,pathAnalysis} from '../src/association-engine.js';
import {friedman} from '../src/nonparametric-engine.js';
import {mixedCombinedReml} from '../src/mixed-model-engine.js';
import {stabilityAnalysis} from '../src/stability-engine.js';
import {stabilityIndices} from '../src/stability-indices-engine.js';

const expected=['ral','rak','fral','frak','split','nested','repeated','nonparametric','descriptive','correlation','path','regression','pca','combined','mixed','genetic','stability'];
assert.deepEqual(templateCatalog.map(x=>x.id),expected);
for(const id of expected){
  const t=getDataTemplate(id);
  assert.ok(t.headers.length>=3,`${id}: headers`);assert.ok(t.rows.length>=6,`${id}: rows`);
  assert.equal(new Set(t.headers).size,t.headers.length,`${id}: duplicate header`);
  assert.ok(t.rows.every(r=>r.length===t.headers.length),`${id}: inconsistent row length`);
  assert.ok(templateHelp(t).length>=4,`${id}: help`);
  const comma=rowsForEditor(t,',');
  assert.ok(comma.flat().every(v=>typeof v==='string'));
}
assert.ok(getDataTemplate('ral').headers.includes('Ulangan'));
assert.ok(!getDataTemplate('ral').headers.includes('Kelompok'));
assert.ok(getDataTemplate('rak').headers.includes('Kelompok'));
assert.deepEqual(getDataTemplate('frak').headers.slice(0,3),['Faktor A','Faktor B','Kelompok']);
assert.deepEqual(getDataTemplate('split').headers.slice(0,3),['Faktor A','Faktor B','Kelompok']);
assert.deepEqual(getDataTemplate('nested').headers,['Faktor A','B dalam A','Ulangan','Respons']);
assert.deepEqual(getDataTemplate('repeated').headers,['Perlakuan','Subjek','Waktu','Tinggi Tanaman']);
assert.deepEqual(getDataTemplate('nonparametric').headers,['Perlakuan','Kelompok','Skor']);
assert.deepEqual(getDataTemplate('regression').headers,['Dosis','Ulangan','Respons']);
assert.ok(getDataTemplate('path').headers.includes('Produksi'));
assert.deepEqual(getDataTemplate('combined').headers.slice(0,3),['Lokasi','Genotipe','Kelompok']);
const mixed=getDataTemplate('mixed'),balanced=getDataTemplate('combined');
assert.ok(mixed.rows.length<balanced.rows.length,'mixed example should be unbalanced');
const mixedCells=new Set(mixed.rows.map(r=>`${r[0]}|${r[1]}`));
for(const l of ['L1','L2'])for(const g of ['G1','G2','G3'])assert.ok(mixedCells.has(`${l}|${g}`),`missing mixed cell ${l} ${g}`);
const st=getDataTemplate('stability'),cells=new Set(st.rows.map(r=>`${r[0]}|${r[1]}`));
for(const e of ['E1','E2','E3'])for(const g of ['G1','G2','G3','G4'])assert.ok(cells.has(`${e}|${g}`),`missing stability cell ${e} ${g}`);
const repeated=getDataTemplate('repeated'),subjects=[...new Set(repeated.rows.map(r=>`${r[0]}|${r[1]}`))],times=[...new Set(repeated.rows.map(r=>r[2]))];
for(const s of subjects)assert.equal(repeated.rows.filter(r=>`${r[0]}|${r[1]}`===s).length,times.length,'repeated subject missing time');
const np=getDataTemplate('nonparametric'),npGroups=[...new Set(np.rows.map(r=>r[0]))],npBlocks=[...new Set(np.rows.map(r=>r[1]))];for(const g of npGroups)assert.equal(np.rows.filter(r=>r[0]===g).length,npBlocks.length,'nonparametric Friedman template incomplete');
const decimal=rowsForEditor(getDataTemplate('regression'),',').find(r=>r[2].includes(','));assert.ok(decimal,'comma decimal conversion missing');

function verifyAnovaTemplate(id,options){
  const t=getDataTemplate(id),check=validateData({headers:t.headers,rows:t.rows},options,Number);
  assert.deepEqual(check.issues,[],id+': template must validate');
  for(let i=0;i<options.parameters.length;i++){
    const report=analyzeParameter(check.observations,options,i,t.headers[options.parameters[i]]);
    const errors=report.terms.filter(term=>/^Galat/.test(term.label));
    assert.ok(errors.length,id+': error term missing');
    for(const error of errors)assert.ok(Number.isFinite(error.ms)&&error.ms>0,id+': '+error.label+' must have positive variance');
  }
}
verifyAnovaTemplate('rak',{design:'rak',a:0,b:null,rep:1,parameters:[2,3],alpha:.05,posthoc:'none',assumptions:false,contrastMode:'none',contrasts:[],levels:[]});
verifyAnovaTemplate('frak',{design:'frak',a:0,b:1,rep:2,parameters:[3,4],alpha:.05,posthoc:'none',assumptions:false,contrastMode:'none',contrasts:[],levels:[]});
verifyAnovaTemplate('split',{design:'split',a:0,b:1,rep:2,parameters:[3,4],alpha:.05,posthoc:'none',assumptions:false,contrastMode:'none',contrasts:[],levels:[]});


// Full template smoke test: every catalog entry must reach its intended analysis engine.
const coreConfigs={
  ral:{design:'ral',a:0,b:null,rep:1,parameters:[2,3]},
  rak:{design:'rak',a:0,b:null,rep:1,parameters:[2,3]},
  fral:{design:'fral',a:0,b:1,rep:2,parameters:[3,4]},
  frak:{design:'frak',a:0,b:1,rep:2,parameters:[3,4]},
  split:{design:'split',a:0,b:1,rep:2,parameters:[3,4]}
};
for(const [id,base] of Object.entries(coreConfigs)){
  const t=getDataTemplate(id),o={...base,alpha:.05,posthoc:'none',assumptions:false,contrastMode:'none',contrasts:[],levels:[]};
  const check=validateData({headers:t.headers,rows:t.rows},o,Number);
  assert.deepEqual(check.issues,[],id+': validation issues');
  const structure=designStructure(check.observations,o);
  assert.equal(structure.ready,true,id+': structure should be ready');
  for(let i=0;i<o.parameters.length;i++){
    const report=analyzeParameter(check.observations,o,i,t.headers[o.parameters[i]]);
    for(const error of report.terms.filter(term=>/^Galat/.test(term.label)))assert.ok(error.df>0&&error.ms>0,id+': '+error.label+' must have positive db and KT');
  }
}
{
  const t=getDataTemplate('nested');const out=nestedAnova(t.rows.map(r=>[r[0],r[1],String(r[2]),r[3]]));assert.ok(out.terms.find(x=>x.label==='Galat').ms>0);
}
{
  const t=getDataTemplate('repeated');const out=repeatedMeasuresAnova(t.rows.map(r=>[r[0],r[1],r[2],r[3]]));assert.ok(out.terms.length>3);
}
{
  const t=getDataTemplate('nonparametric');const out=friedman(t.rows.map(r=>[r[0],String(r[1]),r[2]]));assert.ok(Number.isFinite(out.Q));
}
{
  const t=getDataTemplate('descriptive');assert.equal(descriptiveStatistics(t.rows.map(r=>r.slice(1))).length,t.headers.length-1);
}
{
  const t=getDataTemplate('correlation');assert.equal(correlation(t.rows.map(r=>r.slice(1))).matrix.length,t.headers.length-1);
}
{
  const t=getDataTemplate('path');const out=pathAnalysis(t.rows.map(r=>[r[6],...r.slice(1,6)]));assert.ok(out.r2>=0&&out.r2<=1);
}
{
  const t=getDataTemplate('regression');const out=polynomialRegression(t.rows.map(r=>[r[0],r[2]]),3);assert.ok(out.models.length>=1);
}
{
  const t=getDataTemplate('pca');const out=pca(t.rows.map(r=>r.slice(1)));assert.equal(out.n,t.rows.length);
}
{
  const t=getDataTemplate('combined');for(const p of [3,4]){const out=combinedAnova(t.rows.map(r=>[r[0],r[1],String(r[2]),r[p]]));assert.ok(out.terms.find(x=>x.label==='Galat').ms>0);}
}
{
  const t=getDataTemplate('mixed');for(const p of [3,4]){const out=mixedCombinedReml(t.rows.map(r=>[r[0],r[1],String(r[2]),r[p]]));assert.ok(out.variance.residual>0);}
}
{
  const t=getDataTemplate('genetic');for(const p of [2,3]){const out=geneticParameters(t.rows.map(r=>[r[0],String(r[1]),r[p]]));assert.ok(out.terms.find(x=>x.label==='Galat').ms>0);}
}
{
  const t=getDataTemplate('stability'),rows=t.rows.map(r=>[r[0],r[1],r[3]]);assert.ok(stabilityAnalysis(rows).ammi.components.length>=1);assert.equal(stabilityIndices(rows).genotypes.length,4);
}

// The engine should explain zero error variance instead of returning a generic message.
{
  const t={headers:['Perlakuan','Kelompok','Y'],rows:[]};
  for(const r of [1,2,3])for(const [i,p] of ['P0','P1','P2','P3'].entries())t.rows.push([p,r,10+i*2+r*.5]);
  const o={design:'rak',a:0,b:null,rep:1,parameters:[2],alpha:.05,posthoc:'none',assumptions:false,contrastMode:'none',contrasts:[],levels:[]};
  const check=validateData(t,o,Number);
  assert.throws(()=>analyzeParameter(check.observations,o,0,'Y'),/db Galat = 6, tetapi JK Galat = 0 dan KT Galat = 0/i);
}

assert.throws(()=>getDataTemplate('does-not-exist'));
console.log(`Templates verified: ${expected.length} analysis/rancangan templates, direct editor rows, all template engines smoke-tested, positive model error variance, detailed zero-error diagnostics, decimal conversion, repeated/nonparametric completeness, and multilocation cell coverage.`);
