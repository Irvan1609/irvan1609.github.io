import assert from 'node:assert/strict';
import fs from 'node:fs';
import {nestedAnova,nestedPosthoc,repeatedMeasuresAnova} from '../src/design-extensions-engine.js';
const near=(a,b,t=1e-9)=>assert.ok(Math.abs(a-b)<=t*Math.max(1,Math.abs(b)),`${a} != ${b}`);
const share=(a,b)=>a.some(letter=>b.includes(letter));

const nested=[];
const nestedValues={A1:{B1:[1,2],B2:[3,4]},A2:{B1:[6,7],B2:[8,9]}};
for(const [a,bs] of Object.entries(nestedValues))for(const [b,ys] of Object.entries(bs))ys.forEach((y,i)=>nested.push([a,b,String(i+1),y]));
const n=nestedAnova(nested);
near(n.grand,5);near(n.terms[0].ss,50);near(n.terms[1].ss,8);near(n.terms[2].ss,2);near(n.terms[3].ss,60);
assert.deepEqual(n.terms.map(x=>x.df),[1,2,4,7]);near(n.terms[0].f,12.5);near(n.terms[1].f,8);
assert.throws(()=>nestedAnova(nested.slice(1)),/tidak lengkap|seimbang/i);
const post=nestedPosthoc(n,'bnt',.05);
assert.equal(post.factorA.method,'none');
assert.equal(post.factorA.error,'B(A)');
assert.equal(post.nested.length,2);
for(const group of post.nested){
  assert.equal(group.method,'bnt');assert.equal(group.error,'Galat');assert.equal(group.items.length,2);
  assert.equal(share(group.items[0].letters,group.items[1].letters),false);
  near(group.mse,.5);assert.equal(group.df,4);
}
const strict=nestedPosthoc(n,'bnj',.01);assert.ok(strict.nested.every(group=>group.method==='none'));
assert.throws(()=>nestedPosthoc(n,'invalid',.05),/tidak valid/i);

const strong=[];
const strongValues={A1:{B1:[1,1.1,.9],B2:[2,2.1,1.9]},A2:{B1:[11,11.1,10.9],B2:[12,12.1,11.9]}};
for(const [a,bs] of Object.entries(strongValues))for(const [b,ys] of Object.entries(bs))ys.forEach((y,i)=>strong.push([a,b,String(i+1),y]));
const strongOut=nestedAnova(strong),strongPost=nestedPosthoc(strongOut,'bnj',.05);
assert.equal(strongPost.factorA.method,'bnj');
assert.equal(share(strongPost.factorA.items[0].letters,strongPost.factorA.items[1].letters),false);
near(strongPost.factorA.mse,strongOut.terms.find(x=>x.label==='B(A)').ms);assert.equal(strongPost.factorA.df,strongOut.terms.find(x=>x.label==='B(A)').df);

const repeated=[];
for(const [pi,p] of ['P0','P1'].entries())for(const s of [1,2,3])for(const [ti,t] of ['T1','T2','T3'].entries()){
  const y=10+pi*3+ti*2+pi*ti*.8+(s-2)*.5+(s-2)*ti*.2;
  repeated.push([p,`${p}-S${s}`,t,y]);
}
const r=repeatedMeasuresAnova(repeated);
assert.equal(r.treatments.length,2);assert.equal(r.times.length,3);assert.equal(r.subjectsPerTreatment,3);
const parts=r.terms.slice(0,-1).reduce((s,x)=>s+x.ss,0);near(parts,r.terms.at(-1).ss,1e-8);
assert.ok(r.terms.find(x=>x.label==='Perlakuan').f>0);
assert.ok(r.terms.find(x=>x.label==='Waktu').f>0);
assert.ok(r.epsilon>=.5&&r.epsilon<=1);
for(const label of ['Waktu','Perlakuan × Waktu']){const term=r.terms.find(x=>x.label===label);assert.ok(term.gg);assert.ok(term.gg.df1>0&&term.gg.df2>0);}
assert.throws(()=>repeatedMeasuresAnova(repeated.slice(1)),/harus mempunyai|tidak lengkap|seimbang/i);

const workflow=fs.readFileSync(new URL('../src/design-extensions-workflow.js',import.meta.url),'utf8');
for(const marker of ["parameterField(data,'nest')","parameterField(data,'repeat')",'data-${prefix}-param','nestPosthoc','nestAlpha','resultActions','backupRawDataset'])assert.ok(workflow.includes(marker),`workflow missing ${marker}`);
assert.ok(workflow.includes('Semua kolom numerik dicentang otomatis'));
console.log('Design extensions verified: balanced nested ANOVA, nested BNT/BNJ/DMRT gating and error strata, multi-parameter UI contract, repeated-measures error strata, Greenhouse–Geisser epsilon, and incomplete-data rejection.');
