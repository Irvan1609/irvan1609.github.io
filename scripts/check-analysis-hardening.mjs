import assert from 'node:assert/strict';
import {getDataTemplate} from '../src/template-catalog.js';
import {validateData,analyzeParameter} from '../src/statistics-engine.js';
import {auditCoreReport} from '../src/analysis-integrity.js';
import {augmentedRcbAnova} from '../src/augmented-design-engine.js';

const cases=[
  {template:'ral',design:'ral',a:0,b:null,rep:1,parameter:2},
  {template:'rak',design:'rak',a:0,b:null,rep:1,parameter:2},
  {template:'fral',design:'fral',a:0,b:1,rep:2,parameter:3},
  {template:'frak',design:'frak',a:0,b:1,rep:2,parameter:3},
  {template:'split',design:'split',a:0,b:1,rep:2,parameter:3}
];

for(const item of cases){
  const template=getDataTemplate(item.template);
  const dataset={headers:template.headers,rows:template.rows};
  const options={design:item.design,a:item.a,b:item.b,rep:item.rep,parameters:[item.parameter],alpha:.05,posthoc:'bnj',assumptions:false,contrastMode:'none',contrasts:[],levels:[]};
  const checked=validateData(dataset,options,value=>Number(String(value).replace(',','.')));
  assert.deepEqual(checked.issues,[],item.design+' template must validate');
  const report=analyzeParameter(checked.observations,options,0,template.headers[item.parameter]);
  const audit=auditCoreReport(report);
  assert.equal(audit.ok,true,item.design+': '+audit.issues.join(' '));
  assert.equal(report.terms.at(-1).label,'Total');
  assert.equal(report.terms.at(-1).df,report.N-1);
  assert.ok(report.residuals.every(Number.isFinite));
  assert.ok(report.fitted.every(Number.isFinite));
}

const bad=getDataTemplate('rak');
const badOptions={design:'rak',a:0,b:null,rep:1,parameters:[],alpha:.05,posthoc:'none',assumptions:false,contrastMode:'none',contrasts:[],levels:[]};
const badCheck=validateData({headers:bad.headers,rows:bad.rows},badOptions,value=>Number(value));
assert.ok(badCheck.issues.some(issue=>/minimal satu parameter/i.test(issue.message)));

const duplicateOptions={...badOptions,parameters:[2]};
const duplicateCheck=validateData({headers:bad.headers,rows:[...bad.rows,bad.rows[0]]},duplicateOptions,value=>Number(value));
assert.ok(duplicateCheck.issues.length>0);

const augmentedRows=[
  ['B1','C1',10.1],['B1','C2',11.0],['B1','T1',12.3],
  ['B2','C1',10.4],['B2','C2',11.4],['B2','T2',12.0],
  ['B3','C1',9.9], ['B3','C2',10.9],['B3','T3',12.7]
];
const augmented=augmentedRcbAnova(augmentedRows,{checks:['C1','C2'],alpha:.05});
assert.ok(augmented.treatmentAdjusted?.length>0);
assert.ok(augmented.means?.length===5);
assert.ok(Number.isFinite(augmented.mse)&&augmented.mse>=0);

console.log('Analysis hardening verified: RAL, RAK, factorial RAL/RAK, split-plot, validation failures, report integrity, and augmented-design smoke test.');
