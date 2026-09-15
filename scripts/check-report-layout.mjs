import assert from 'node:assert/strict';
import {renderAnova} from '../src/scientific-report.js';
import {tableLayout} from '../src/table-layout.js';
const rows=[[...Array.from({length:5},()=>({rowSpan:2})),{colSpan:2},{rowSpan:2}],[{},{}],Array.from({length:8},()=>({}))];
const layout=tableLayout(rows);assert.equal(layout.width,8);assert.equal(layout.height,3);assert.deepEqual(layout.cells.filter(c=>c.row===1).map(c=>c.col),[5,6]);assert.deepEqual(layout.cells.filter(c=>c.row===2).map(c=>c.col),[0,1,2,3,4,5,6,7]);
const report={design:'ral',cv:9.263,terms:[{label:'Perlakuan',df:2,ss:10,ms:5,f:3,f05:2,f01:4},{label:'Galat',df:9,ss:15,ms:15/9,f:null,f05:null,f01:null}]};
for(const [f,mark] of [[1,'tn'],[3,'*'],[5,'**']]){report.terms[0].f=f;assert(renderAnova(report).includes(`<sup>${mark}</sup>`));}
const before=JSON.stringify(report),html=renderAnova(report);assert.equal(JSON.stringify(report),before);assert(html.includes('colspan="2">F. Tabel'));assert(html.includes('rowspan="2">Ket.'));assert(!html.includes('undefined'));
console.log('ANOVA grouped header alignment, significance marks, input immutability passed.');
