import assert from 'node:assert/strict';
import {transformValues,transformObservations,estimateBoxCoxLambda,transformationLabel} from '../src/data-transform.js';
import {describeLevel,metadataFactor} from '../src/treatment-metadata.js';
import {validateData,analyzeParameter} from '../src/statistics-engine.js';
import {finalizeAgronomyFactorial} from '../src/agronomy-factorial.js';
import {interpretReport} from '../src/report-insights.js';
import {renderBab4Table} from '../src/bab4-table.js';
import {renderReport} from '../src/scientific-report.js';

assert.deepEqual(transformValues([0,1,4],'sqrt').values,[0,1,2]);
assert.ok(Math.abs(transformValues([0,3.5],'sqrt05').values[0]-Math.sqrt(.5))<1e-12);
assert.deepEqual(transformValues([1,10,100],'log10').values,[0,1,2]);
assert.throws(()=>transformValues([0,1],'ln'),/> 0/);
assert.throws(()=>transformValues([1.2,.5],'asinprop'),/0–1/);
assert.ok(Math.abs(transformValues([25,100],'asinpercent').values[0]-Math.asin(.5))<1e-12);
const lambda=estimateBoxCoxLambda([1,2,3,4,5,8,13]);
assert.ok(Number.isFinite(lambda)&&lambda>=-2&&lambda<=2);
assert.equal(transformationLabel('boxcox'),'Box–Cox (λ otomatis)');

const metadata={
  factorLabels:{a:'Dosis kompos buah aren',b:'Konsentrasi POC kulit bawang merah'},
  levels:{a:{A0:'0 g/tanaman',A1:'50 g/tanaman',A2:'100 g/tanaman'},b:{P0:'0 mL/L',P1:'15 mL/L',P2:'30 mL/L',P3:'45 mL/L'}}
};
assert.equal(describeLevel({treatmentMeta:metadata},'a','A1'),'50 g/tanaman (A1)');
assert.equal(metadataFactor({treatmentMeta:metadata},'a','Faktor A'),'Dosis kompos buah aren');

const volume={headers:['Dosis kompos buah aren','Konsentrasi POC kulit bawang merah','Kelompok','Volume akar (ml)'],rows:[]};
const values={A0:{P0:[2,3,2],P1:[4,4,3],P2:[5,4,3],P3:[2,3,3]},A1:{P0:[3,4,4],P1:[4,4,5],P2:[6,5,5],P3:[4,4,3]},A2:{P0:[3,2,3],P1:[4,4,3],P2:[3,3,2],P3:[4,3,4]}};
for(const [a,ps] of Object.entries(values))for(const [p,ys] of Object.entries(ps))ys.forEach((y,i)=>volume.rows.push([a,p,i+1,y]));
const options={design:'frak',a:0,b:1,rep:2,parameters:[3],alpha:.05,posthoc:'bnj',assumptions:false,contrastMode:'none',contrasts:[],levels:[]};
const check=validateData(volume,options,Number);
assert.deepEqual(check.issues,[]);
const report=analyzeParameter(check.observations,options,0,volume.headers[3]);
report.factorLabels=metadata.factorLabels;report.treatmentMeta=metadata;report.datasetName='contoh';
finalizeAgronomyFactorial(report);
const interpretation=interpretReport(report).join(' ');
assert.match(interpretation,/50 g\/tanaman/);
assert.match(interpretation,/30 mL\/L/);
assert.match(interpretation,/\(A1P2\)/);
assert.match(interpretation,/A0P0/);
const table=renderBab4Table(report);
assert.match(table,/Tabel hasil BAB IV/);
assert.match(table,/bab4-table/);
assert.match(table,/A0/);
assert.match(table,/P0/);
assert.match(table,/Keterangan perlakuan/);

const transformed=transformObservations(check.observations,0,'sqrt');
const transformedReport=analyzeParameter(transformed.observations,options,0,volume.headers[3]);
transformedReport.factorLabels=metadata.factorLabels;transformedReport.treatmentMeta=metadata;transformedReport.datasetName='contoh';
transformedReport.transform=transformed.meta;
transformedReport.originalObservations=check.observations.map(obs=>({a:obs.a,b:obs.b,rep:obs.rep,y:obs.values[0]}));
const before=analyzeParameter(check.observations,{...options,posthoc:'none'},0,volume.headers[3]);
finalizeAgronomyFactorial(before);
transformedReport.beforeTransform={terms:before.terms,cv:before.cv,cvWhole:before.cvWhole,grand:before.grand};
finalizeAgronomyFactorial(transformedReport);
const rendered=renderReport(transformedReport);
assert.match(rendered,/Data sebelum transformasi/);
assert.match(rendered,/Data setelah transformasi √x/);
assert.match(rendered,/Sidik ragam sebelum transformasi/);
assert.match(rendered,/Tabel hasil BAB IV/);
assert.match(interpretReport(transformedReport).join(' '),/setelah transformasi volume akar/);

console.log('Treatment metadata, BAB IV tables, per-parameter transformations, and before/after analysis rendering verified.');
