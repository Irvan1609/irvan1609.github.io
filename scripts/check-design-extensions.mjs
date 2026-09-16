import assert from 'node:assert/strict';
import {nestedAnova,repeatedMeasuresAnova} from '../src/design-extensions-engine.js';
const near=(a,b,t=1e-9)=>assert.ok(Math.abs(a-b)<=t*Math.max(1,Math.abs(b)),`${a} != ${b}`);

const nested=[];
const nestedValues={A1:{B1:[1,2],B2:[3,4]},A2:{B1:[6,7],B2:[8,9]}};
for(const [a,bs] of Object.entries(nestedValues))for(const [b,ys] of Object.entries(bs))ys.forEach((y,i)=>nested.push([a,b,String(i+1),y]));
const n=nestedAnova(nested);
near(n.grand,5);near(n.terms[0].ss,50);near(n.terms[1].ss,8);near(n.terms[2].ss,2);near(n.terms[3].ss,60);
assert.deepEqual(n.terms.map(x=>x.df),[1,2,4,7]);near(n.terms[0].f,12.5);near(n.terms[1].f,8);
assert.throws(()=>nestedAnova(nested.slice(1)),/tidak lengkap|seimbang/i);

const repeated=[];
for(const [pi,p] of ['P0','P1'].entries())for(const s of [1,2,3])for(const [ti,t] of ['T1','T2','T3'].entries()){
  const y=10+pi*3+ti*2+pi*ti*.8+(s-2)*.5;
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
console.log('Design extensions verified: balanced nested ANOVA, repeated-measures error strata, Greenhouse–Geisser epsilon, and incomplete-data rejection.');
