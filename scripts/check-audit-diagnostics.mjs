import assert from 'node:assert/strict';
import {shapiroWilk,leveneMean,bartlett,residualDiagnostics} from '../src/assumption-diagnostics.js';
import {analyzeParameter,validateData} from '../src/statistics-engine.js';
import {finalizeAgronomyFactorial} from '../src/agronomy-factorial.js';
import {auditReport,auditReports,renderAudit,renderDecisionSummary} from '../src/analysis-audit.js';
import {renderReport} from '../src/scientific-report.js';

const sw=shapiroWilk([-1.5,-1,-.7,-.2,0,.1,.5,.8,1.1,1.6]);
assert.ok(Number.isFinite(sw.stat)&&sw.stat>0&&sw.stat<=1);
assert.ok(Number.isFinite(sw.p)&&sw.p>=0&&sw.p<=1);
assert.match(sw.name,/Shapiro/);

const groupsEqual=[[1,2,3,4],[2,3,4,5],[3,4,5,6]];
const lev=leveneMean(groupsEqual),bart=bartlett(groupsEqual);
assert.ok(lev.stat===null||Number.isFinite(lev.stat));
assert.ok(lev.p===null||(lev.p>=0&&lev.p<=1));
assert.ok(bart.stat===null||Number.isFinite(bart.stat));
assert.ok(bart.p===null||(bart.p>=0&&bart.p<=1));

const observations=[];
for(const rep of ['1','2','3'])for(const [i,a] of ['P0','P1','P2'].entries())observations.push({a,b:'',rep,y:10+i*2+Number(rep)*.3+[.1,-.15,.05][i]});
const residuals=[.1,-.1,0,-.05,.08,-.03,.02,-.04,.02];
const diagnostics=residualDiagnostics(observations,residuals,.02,'rak');
assert.equal(diagnostics.items.length,observations.length);
assert.ok(diagnostics.items.every(item=>Number.isFinite(item.leverage)&&Number.isFinite(item.studentized)&&Number.isFinite(item.cook)));
assert.ok(diagnostics.cookThreshold>0);

const dataset={headers:['Perlakuan','Kelompok','Tinggi (cm)'],rows:[]};
const jitter=[[.12,-.08,-.04],[-.06,.10,-.04],[.02,-.07,.05],[-.08,.05,.03]];
for(const r of [1,2,3])for(const [i,p] of ['P0','P1','P2','P3'].entries())dataset.rows.push([p,r,18+i*2.3+r*.35+jitter[i][r-1]]);
const options={design:'rak',a:0,b:null,rep:1,parameters:[2],alpha:.05,posthoc:'bnj',assumptions:true,contrastMode:'none',contrasts:[],levels:[]};
const check=validateData(dataset,options,Number);
assert.deepEqual(check.issues,[]);
const report=analyzeParameter(check.observations,options,0,dataset.headers[2]);
report.factorLabels={a:'Perlakuan',b:null};
report.treatmentMeta={factorLabels:{a:'Perlakuan',b:''},levels:{a:{P0:'Kontrol',P1:'Dosis 1',P2:'Dosis 2',P3:'Dosis 3'},b:{}}};
finalizeAgronomyFactorial(report);
assert.ok(report.assumptions.some(item=>/Shapiro/.test(item.name)));
assert.ok(report.assumptions.some(item=>/Levene/.test(item.name)));
assert.ok(report.assumptions.some(item=>/Bartlett/.test(item.name)));
assert.ok(report.diagnostics?.items?.length===12);

const audit=auditReport(report);
assert.equal(audit.errors,0);
assert.ok(audit.decisions.length>=1);
assert.match(renderDecisionSummary(report),/Ringkasan uji lanjut/);
const full=auditReports([report]);
assert.equal(full.errors,0);
assert.match(renderAudit(full),/Periksa hasil/);

const bad=structuredClone(report);
const tested=bad.comparisons.find(item=>item.method!=='none');
if(tested&&tested.pairs?.length){
  const pair=tested.pairs.find(item=>item.significant);
  if(pair){
    tested.items[pair.i].letters=['a'];
    tested.items[pair.j].letters=['a'];
    assert.ok(auditReport(bad).errors>=1);
  }
}

const html=renderReport(report);
assert.match(html,/Ringkasan uji lanjut/);
assert.match(html,/Histogram residual/);
assert.match(html,/Cook's distance/);
assert.match(html,/Shapiro/);
console.log('Assumption diagnostics, influence diagnostics, decision summary, and thesis consistency audit verified.');
