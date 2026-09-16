import assert from 'node:assert/strict';
import fs from 'node:fs';
import {correlation,correlationCritical,pathAnalysis,numericRows} from '../src/association-engine.js';
import {renderAssociation} from '../src/association-workflow.js';
const a=JSON.parse(fs.readFileSync(new URL('./association-reference.json',import.meta.url)));
const near=(a,b,t=1e-7)=>assert(Math.abs(a-b)<t*Math.max(1,Math.abs(b)),`${a} != ${b}`);
for(const method of ['pearson','spearman']){
 const c=correlation(a.rows,method);c.pairs.forEach((p,i)=>{near(p.r,a[method][i][0]);near(p.p,a[method][i][1]);assert(p.holm>=p.p&&p.holm<=1);});
}
const p=pathAnalysis(a.rows);near(p.r2,a.r2);p.effects.forEach((e,i)=>{near(e.direct,a.beta[i]);near(e.se,a.se[i]);near(e.p,a.p[i]);near(e.vif,a.vif[i]);near(e.direct+e.indirect.reduce((s,v)=>s+v,0),e.total);});
near(correlationCritical(27,.05),.3809,.00005);near(correlationCritical(27,.01),.4869,.00005);
assert.throws(()=>correlation([[1,2],[1,3],[1,4]]));assert.throws(()=>correlation([]));
assert.throws(()=>pathAnalysis(a.rows.map(r=>[r[0],r[1],2*r[1]])));
assert.throws(()=>numericRows({headers:['X'],rows:[[1]]},[0,0],Number));
assert.throws(()=>numericRows({headers:['X'],rows:[['bad']]},[0],Number));
near(correlation([[1,4],[1,4],[2,2],[3,1]],'spearman').matrix[0][1],-1);
const html=renderAssociation(correlation(a.rows),['Y','X1','X2','X3'],'correlation',.05);
assert.equal((html.match(/<sup>/g)||[]).length,6);assert(html.includes('segitiga atas'));assert(html.includes('p Holm'));
console.log('Pearson/Spearman and standardized path coefficients/SE/p/VIF match independent SciPy/NumPy; r critical N=27, ties and invalid data checks passed.');
