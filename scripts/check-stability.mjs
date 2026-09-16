import assert from 'node:assert/strict';
import {combinedAnovaFlexible,combinedAnovaGlm,stabilityAnalysis} from '../src/stability-engine.js';
const near=(a,b,t=1e-7)=>assert.ok(Math.abs(a-b)<=t*Math.max(1,Math.abs(b)),`${a} != ${b}`);

const balanced=[];
for(const l of ['L1','L2'])for(const g of ['G1','G2','G3'])for(const b of ['1','2','3']){
  const y=10+(l==='L2'?2:0)+(g==='G2'?1:g==='G3'?3:0)+({1:-.3,2:.1,3:.4}[b])+(l==='L2'&&g==='G3'?.8:0);
  balanced.push([l,g,b,y]);
}
const classic=combinedAnovaFlexible(balanced);assert.equal(classic.method,'classical-balanced');assert.equal(classic.balanced,true);
const unbalanced=balanced.filter(([l,g,b])=>!(l==='L1'&&g==='G2'&&b==='3')&&!(l==='L2'&&g==='G3'&&b==='2'));
const glm=combinedAnovaFlexible(unbalanced);assert.equal(glm.method,'glm-type3');assert.equal(glm.balanced,false);assert.ok(glm.terms.some(t=>t.label==='Lokasi × Perlakuan'));assert.ok(glm.terms.find(t=>t.label==='Galat').df>0);assert.ok(glm.terms.filter(t=>t.f!==null).every(t=>Number.isFinite(t.f)&&t.ss>=0));
assert.equal(glm.meanMethod,'equal-location-cell-means');assert.ok(glm.warnings.length>0);assert.ok(glm.means.every(x=>Number.isFinite(x.mean)&&Number.isFinite(x.rawMean)));
const g2=glm.means.find(x=>x.label==='G2'),g2LocMeans=['L1','L2'].map(l=>{const ys=unbalanced.filter(([ll,g])=>ll===l&&g==='G2').map(r=>r[3]);return ys.reduce((s,v)=>s+v,0)/ys.length;});near(g2.mean,(g2LocMeans[0]+g2LocMeans[1])/2);
assert.throws(()=>combinedAnovaGlm(unbalanced.filter(([l,g])=>!(l==='L1'&&g==='G3'))),/Sel Lokasi × Genotipe kosong/);

const stabilityRows=[];
const matrix={E1:{G1:5,G2:7,G3:6,G4:8},E2:{G1:8,G2:7,G3:10,G4:9},E3:{G1:6,G2:9,G3:8,G4:11}};
for(const [e,gs] of Object.entries(matrix))for(const [g,m] of Object.entries(gs))for(const d of [-.2,.2])stabilityRows.push([e,g,m+d]);
const st=stabilityAnalysis(stabilityRows);assert.equal(st.environments.length,3);assert.equal(st.genotypes.length,4);assert.equal(st.n,24);assert.equal(st.replication.balanced,true);assert.equal(st.warnings.length,0);
near(st.ammi.components.reduce((s,c)=>s+c.ss,0),st.ammi.interactionSS,1e-6);near(st.gge.components.reduce((s,c)=>s+c.ss,0),st.gge.totalSS,1e-6);
assert.ok(st.ammi.components[0].percent>0);assert.ok(st.gge.components[0].percent>0);assert.equal(st.ammi.genotypes.length,4);assert.equal(st.gge.environments.length,3);assert.match(st.ammi.scaling,/alpha=0.5/);assert.match(st.gge.centering,/environment-centered/);
const unequal=stabilityAnalysis(stabilityRows.filter((row,i)=>!(row[0]==='E1'&&row[1]==='G1'&&i%2===0)));assert.equal(unequal.replication.balanced,false);assert.ok(unequal.warnings.some(x=>/Jumlah ulangan per sel tidak sama/i.test(x)));
assert.throws(()=>stabilityAnalysis(stabilityRows.filter(([e,g])=>!(e==='E3'&&g==='G4'))),/tidak memiliki pengamatan/);
console.log('Flexible combined ANOVA reports equal-location means for unequal replication; AMMI/GGE preserves decomposition and explicitly diagnoses unequal cell replication.');
