import assert from 'node:assert/strict';
import {analyzeParameter,validateData} from '../src/statistics-engine.js';
import {analysisSummaryRows,interpretReport,renderAnalysisSummary} from '../src/report-insights.js';
import {inspectDataQuality,renderDataQuality} from '../src/data-quality.js';

const dataset={headers:['Perlakuan','Kelompok','Tinggi','Bobot'],rows:[]};
const residual=[[.2,-.1,-.1],[-.1,.2,-.1],[.05,-.15,.1],[-.15,.05,.1]];
for(const r of [1,2,3])for(const [i,p] of ['P0','P1','P2','P3'].entries()){
  dataset.rows.push([p,r,20+i*2+r*.4+residual[i][r-1],40+i*3+r*.3+residual[i][r-1]*1.5]);
}
const options={design:'rak',a:0,b:null,rep:1,parameters:[2,3],alpha:.05,posthoc:'bnj',assumptions:false,contrastMode:'none',contrasts:[],levels:[]};
const check=validateData(dataset,options,Number);
assert.deepEqual(check.issues,[]);
const reports=options.parameters.map((p,i)=>analyzeParameter(check.observations,options,i,dataset.headers[p]));
const paragraphs=interpretReport(reports[0]);
assert.ok(paragraphs.length>=2);
assert.ok(paragraphs.some(x=>/Perlakuan/i.test(x)));
const rows=analysisSummaryRows(reports);
assert.equal(rows.length,2);
assert.equal(rows[0].n,12);
assert.ok(Number.isFinite(rows[0].cv));
const summaryHtml=renderAnalysisSummary(reports);
assert.ok(summaryHtml.includes('Ringkasan semua parameter'));
assert.ok(summaryHtml.includes('Tinggi'));
const quality=inspectDataQuality(dataset,options,Number);
assert.equal(quality.errors,0);
assert.equal(quality.status==='Baik'||quality.status==='Perlu diperiksa',true);
assert.ok(renderDataQuality(quality).includes('Data-quality checker'));

const bad={headers:['Perlakuan','Kelompok','Y'],rows:[['P0',1,10],['P0',2,10],['P1',1,10],['P1',1,10]]};
const badOptions={design:'rak',a:0,b:null,rep:1,parameters:[2]};
const badQuality=inspectDataQuality(bad,badOptions,Number);
assert.ok(badQuality.errors>=1);
assert.ok(badQuality.findings.some(x=>/duplikasi|terduplikasi/i.test(x.message)));
assert.ok(badQuality.findings.some(x=>/semua nilai sama/i.test(x.message)));

const outlier={headers:['Perlakuan','Ulangan','Y'],rows:[['P0',1,1],['P0',2,1.1],['P0',3,1.2],['P0',4,20],['P1',1,2],['P1',2,2.1],['P1',3,2.2],['P1',4,2.3]]};
const outlierQuality=inspectDataQuality(outlier,{design:'ral',a:0,b:null,rep:1,parameters:[2]},Number);
assert.ok(outlierQuality.findings.some(x=>/IQR/i.test(x.message)));
console.log('BAB IV interpretation, all-parameter summary, and pre-analysis data-quality checker verified.');
