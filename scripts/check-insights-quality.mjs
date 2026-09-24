import assert from 'node:assert/strict';
import {analyzeParameter,validateData} from '../src/statistics-engine.js';
import {analysisSummaryRows,interpretReport,renderAnalysisSummary} from '../src/report-insights.js';
import {inspectDataQuality,renderDataQuality} from '../src/data-quality.js';
import {finalizeAgronomyFactorial} from '../src/agronomy-factorial.js';

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
// BAB IV style benchmark from the uploaded factorial example.
const volume={headers:['Dosis kompos buah aren (A)','Konsentrasi POC kulit bawang merah (P)','Kelompok','Volume akar (ml)'],rows:[]};
const volumeValues={A0:{P0:[2,3,2],P1:[4,4,3],P2:[5,4,3],P3:[2,3,3]},A1:{P0:[3,4,4],P1:[4,4,5],P2:[6,5,5],P3:[4,4,3]},A2:{P0:[3,2,3],P1:[4,4,3],P2:[3,3,2],P3:[4,3,4]}};
for(const [a,ps] of Object.entries(volumeValues))for(const [p,ys] of Object.entries(ps))ys.forEach((y,i)=>volume.rows.push([a,p,i+1,y]));
const factorialOptions={design:'frak',a:0,b:1,rep:2,parameters:[3],alpha:.05,posthoc:'bnj',assumptions:false,contrastMode:'none',contrasts:[],levels:[]};
const factorialCheck=validateData(volume,factorialOptions,Number);
assert.deepEqual(factorialCheck.issues,[]);
const factorialReport=analyzeParameter(factorialCheck.observations,factorialOptions,0,volume.headers[3]);
factorialReport.factorLabels={a:volume.headers[0],b:volume.headers[1]};
finalizeAgronomyFactorial(factorialReport);
const sourceStyle=interpretReport(factorialReport).join(' ');
assert.match(sourceStyle,/Sidik ragam menunjukkan bahwa pengaruh interaksi antara Dosis kompos buah aren \(A\) dan Konsentrasi POC kulit bawang merah \(P\) berpengaruh nyata terhadap Volume akar \(ml\)/);
assert.match(sourceStyle,/Berdasarkan hasil uji lanjut BNJ 5%/);
assert.match(sourceStyle,/A1P2/);
assert.match(sourceStyle,/5[,.]33 ml/);
assert.match(sourceStyle,/A0P0/);
assert.match(sourceStyle,/2[,.]33 ml/);
assert.ok(!/\(F\s*=|p\s*[=<]/.test(sourceStyle));
console.log('BAB IV interpretation, all-parameter summary, and pre-analysis data-quality checker verified.');
