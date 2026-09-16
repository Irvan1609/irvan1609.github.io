import assert from 'node:assert/strict';
import {templateCatalog,getDataTemplate,rowsForEditor,templateHelp} from '../src/template-catalog.js';

const expected=['ral','rak','fral','frak','split','nested','repeated','descriptive','correlation','path','regression','pca','combined','mixed','genetic','stability'];
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
const decimal=rowsForEditor(getDataTemplate('regression'),',').find(r=>r[2].includes(','));assert.ok(decimal,'comma decimal conversion missing');
assert.throws(()=>getDataTemplate('does-not-exist'));
console.log(`Templates verified: ${expected.length} analysis/rancangan templates, direct editor rows, decimal conversion, repeated-measures completeness, and multilocation cell coverage.`);
