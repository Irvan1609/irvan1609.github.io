import assert from 'node:assert/strict';
import {renderAnova,renderReport,contrastDisplayRows} from '../src/scientific-report.js';
import {analyzeParameter} from '../src/statistics-engine.js';
import {plannedContrastsFlexible} from '../src/planned-contrasts.js';
import {tableLayout} from '../src/table-layout.js';
const rows=[[...Array.from({length:5},()=>({rowSpan:2})),{colSpan:2},{rowSpan:2}],[{},{}],Array.from({length:8},()=>({}))];
const layout=tableLayout(rows);assert.equal(layout.width,8);assert.equal(layout.height,3);assert.deepEqual(layout.cells.filter(c=>c.row===1).map(c=>c.col),[5,6]);assert.deepEqual(layout.cells.filter(c=>c.row===2).map(c=>c.col),[0,1,2,3,4,5,6,7]);
const report={design:'ral',cv:9.263,terms:[{label:'Perlakuan',df:2,ss:10,ms:5,f:3,f05:2,f01:4},{label:'Galat',df:9,ss:15,ms:15/9,f:null,f05:null,f01:null}]};
for(const [f,mark] of [[1,'tn'],[3,'*'],[5,'**']]){report.terms[0].f=f;assert(renderAnova(report).includes(`<sup>${mark}</sup>`));}
const before=JSON.stringify(report),html=renderAnova(report);assert.equal(JSON.stringify(report),before);assert(html.includes('colspan="2">F. Tabel'));assert(html.includes('rowspan="2">Ket.'));assert(!html.includes('undefined'));
console.log('ANOVA grouped header alignment, significance marks, input immutability passed.');

// User-supplied RAK benchmark: six treatments and three complete blocks.
const data=[[15.89,18.92,19.90],[20.97,18.25,19.90],[19.89,20.25,20.00],[18.95,23.25,21.25],[22.33,22.71,20.90],[25.65,22.90,24.89]];
const definitions=[
  {name:'M0 vs M1+M2+M3+M4+M5',coefficients:[5,-1,-1,-1,-1,-1]},
  {name:'M1+M2 vs M3',coefficients:[0,1,1,-2,0,0]},
  {name:'M1 vs M2',coefficients:[0,1,-1,0,0,0]},
  {name:'M4 vs M5',coefficients:[0,0,0,0,1,-1]},
  {name:'M1+M2+M3 vs M4+M5',coefficients:[0,2,2,2,-3,-3]}
];
const trial=analyzeParameter(data.flatMap((values,i)=>values.map((y,j)=>({a:`M${i}`,b:'',rep:String(j+1),values:[y]}))),{design:'rak',alpha:.05,posthoc:'none',contrastMode:'none'},0,'Tinggi Tanaman (cm)');
const error=trial.terms.find(t=>t.label==='Galat');
trial.contrasts=plannedContrastsFlexible(trial.cells,definitions,error.ms,error.df).contrasts;
const display=contrastDisplayRows(trial);
const near=(a,b,tol=1e-5)=>assert.ok(Math.abs(a-b)<tol,`${a} != ${b}`);
[-48.54,-7.64,-1.02,-7.50,-52.72].forEach((q,i)=>near(display[i].q,q));
[26.17924,3.2427555556,.1734,9.375,30.8822044444].forEach((ss,i)=>near(display[i].ss,ss));
['*','tn','tn','tn','**'].forEach((mark,i)=>assert.equal(display[i].mark,mark));
near(display.reduce((s,c)=>s+c.ss,0),trial.terms.find(t=>t.label==='Perlakuan').ss);
near(display[0].leftMean,54.71/3);near(display[0].rightMean,322.09/15);
near(display[4].leftMean,182.71/9);near(display[4].rightMean,139.38/6);
const snapshot=JSON.stringify(trial),output=renderReport(trial);
assert.equal(JSON.stringify(trial),snapshot);
assert.ok(output.includes('contrast-calculation-table'));assert.ok(output.includes('contrast-summary-table'));
for(const [f,mark] of [['9.79','*'],['1.21','tn'],['0.06','tn'],['3.51','tn'],['11.55','**']])assert.ok(output.includes(`${f}</span><sup>${mark}</sup>`));
const reverse={...trial,contrasts:plannedContrastsFlexible(trial.cells,definitions.map(c=>({...c,coefficients:c.coefficients.map(x=>-x)})),error.ms,error.df).contrasts};
contrastDisplayRows(reverse).forEach((c,i)=>{near(c.leftMean,display[i].leftMean);near(c.rightMean,display[i].rightMean);near(c.f,display[i].f);});
assert.ok(renderAnova(trial).indexOf(definitions[0].name)<renderAnova(trial).indexOf('<td>Galat</td>'));
console.log('RAK contrast report matches user benchmark: Q, SS, F marks, weighted group means and ANOVA placement; sign reversal and immutability verified.');
