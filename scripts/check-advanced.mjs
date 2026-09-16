import assert from 'node:assert/strict';
import {descriptiveStatistics,polynomialRegression,pca,combinedAnova,geneticParameters} from '../src/advanced-engine.js';
const near=(a,b,t=1e-7)=>assert.ok(Math.abs(a-b)<=t*Math.max(1,Math.abs(b)),`${a} != ${b}`);

const desc=descriptiveStatistics([[1,2],[2,4],[3,6],[4,8]]);
near(desc[0].mean,2.5);near(desc[0].median,2.5);near(desc[0].sd,Math.sqrt(5/3));near(desc[0].se,Math.sqrt(5/3)/2);near(desc[1].cv,desc[0].cv);

const regRows=Array.from({length:9},(_,i)=>{const x=i;return [x,2+3*x-.5*x*x];});
const reg=polynomialRegression(regRows,3),quad=reg.models.find(m=>m.degree===2);
near(quad.coefficients[0].value,2,1e-6);near(quad.coefficients[1].value,3,1e-6);near(quad.coefficients[2].value,-.5,1e-6);near(quad.r2,1,1e-8);assert.equal(quad.stationary[0].type,'maksimum');near(quad.stationary[0].x,3,1e-6);

const pcaRows=[[1,2,5],[2,4,4],[3,6,3],[4,8,2],[5,10,1]];
const pc=pca(pcaRows);near(pc.eigenvalues.reduce((s,v)=>s+v,0),3,1e-8);near(pc.explained.reduce((s,v)=>s+v,0),1,1e-8);assert.ok(pc.eigenvalues[0]>2.9);assert.equal(pc.loadings.length,3);assert.equal(pc.scores.length,5);

const combined=[];
for(const [li,loc] of ['L1','L2'].entries())for(const [gi,g] of ['G1','G2','G3'].entries())for(const [ri,r] of ['1','2'].entries())combined.push([loc,g,r,10+li*2+gi*1.5+li*gi*.4+ri*.2+(gi===2&&ri===1?.1:0)]);
const ca=combinedAnova(combined);assert.deepEqual(ca.terms.map(t=>t.label),['Lokasi','Kelompok(Lokasi)','Perlakuan/Genotipe','Lokasi × Perlakuan','Galat','Total']);near(ca.terms.slice(0,5).reduce((s,t)=>s+t.ss,0),ca.terms.at(-1).ss,1e-8);assert.equal(ca.terms.at(-1).df,11);assert.equal(ca.locations.length,2);assert.equal(ca.treatments.length,3);

const genetic=[];
const vals={G1:[10,11,9],G2:[15,14,16],G3:[20,19,21]};for(const [g,ys] of Object.entries(vals))ys.forEach((y,i)=>genetic.push([g,String(i+1),y]));
const gp=geneticParameters(genetic);near(gp.terms.slice(0,3).reduce((s,t)=>s+t.ss,0),gp.terms.at(-1).ss,1e-8);assert.ok(gp.components.vg>0);assert.ok(gp.components.h2>.9&&gp.components.h2<=1);assert.equal(gp.components.hClass,'Tinggi');assert.equal(gp.genotypes.length,3);

assert.throws(()=>descriptiveStatistics([[1,2],[3,NaN]]));
assert.throws(()=>polynomialRegression([[1,2],[1,3],[1,4],[1,5]]));
assert.throws(()=>pca([[1,1],[2,1],[3,1]]));
assert.throws(()=>combinedAnova(combined.slice(1)));
assert.throws(()=>geneticParameters(genetic.slice(1)));
console.log('Advanced analyses verified: descriptive statistics, polynomial regression, PCA, balanced multi-location ANOVA, and broad-sense genetic parameters.');
