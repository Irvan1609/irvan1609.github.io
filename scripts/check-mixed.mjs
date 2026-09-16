import assert from 'node:assert/strict';
import {mixedCombinedReml} from '../src/mixed-model-engine.js';
const near=(a,b,t=1e-7)=>assert.ok(Math.abs(a-b)<=t*Math.max(1,Math.abs(b)),`${a} != ${b}`);
const rows=[];
const blockEffect={L1:{1:-.7,2:.2,3:.8},L2:{1:-.4,2:.1,3:.6}};
for(const l of ['L1','L2'])for(const g of ['G1','G2','G3'])for(const b of ['1','2','3']){
  if((l==='L1'&&g==='G2'&&b==='3')||(l==='L2'&&g==='G1'&&b==='2'))continue;
  const base=12+(l==='L2'?2:0)+(g==='G2'?1.5:g==='G3'?3:0)+(l==='L2'&&g==='G3'?.9:0),noise=((g.charCodeAt(1)+Number(b))%3-1)*.08;
  rows.push([l,g,b,base+blockEffect[l][b]+noise]);
}
const fit=mixedCombinedReml(rows);assert.equal(fit.locations.length,2);assert.equal(fit.genotypes.length,3);assert.equal(fit.fixedTests.length,3);assert.ok(fit.variance.block>=0&&fit.variance.residual>0);assert.ok(fit.variance.icc>=0&&fit.variance.icc<=1);assert.equal(fit.blockBlups.length,6);assert.equal(fit.lsmeans.length,3);assert.ok(fit.fixedTests.every(t=>Number.isFinite(t.f)&&t.df>0&&t.dfDen===fit.dfError&&t.approximate));assert.deepEqual(fit.groupCounts,{L1:3,L2:3});assert.ok(fit.warnings.some(x=>/Wald F/i.test(x)));
for(const x of fit.lsmeans){assert.ok(Number.isFinite(x.mean)&&x.se>=0);assert.ok(x.lower<=x.mean&&x.upper>=x.mean);}
const reversed=mixedCombinedReml([...rows].reverse());near(fit.variance.block,reversed.variance.block,1e-5);near(fit.variance.residual,reversed.variance.residual,1e-5);for(let i=0;i<fit.lsmeans.length;i++){const other=reversed.lsmeans.find(x=>x.label===fit.lsmeans[i].label);near(fit.lsmeans[i].mean,other.mean,1e-6);near(fit.lsmeans[i].se,other.se,1e-6);}
assert.throws(()=>mixedCombinedReml(rows.filter(([l,g])=>!(l==='L1'&&g==='G3'))),/Sel Lokasi × Genotipe kosong/);
console.log('REML mixed model verified: unequal observations, random Kelompok(Lokasi), approximate Wald tests, LS-means with SE/95% CI, variance-component diagnostics and block BLUPs.');
