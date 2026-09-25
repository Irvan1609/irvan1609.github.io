import assert from 'node:assert/strict';
import {inspectDatasetForResearch,inferAnalysisSuggestions,computeProjectCompleteness} from '../src/research-workspace.js';

const dataset={
  headers:['Perlakuan','Ulangan','Tinggi Tanaman','Bobot'],
  rows:[
    ['P0','1','10','20'],['P0','2','11','21'],
    ['P1','1','15','30'],['P1','2','16','31']
  ]
};
const audit=inspectDatasetForResearch(dataset);
assert.equal(audit.status,'Baik');
assert.equal(audit.rows,4);
assert.ok(audit.columnProfiles.some(column=>column.kind==='numeric'));
const suggestions=inferAnalysisSuggestions(dataset);
assert.ok(suggestions.some(item=>item.key==='rak'));
const project={name:'Tesis',datasets:['data.csv'],metadata:{crop:'Jagung',location:'Bone',design:'RAK',objective:'Uji respons'},recipes:[{id:'r'}],trace:[{type:'analysis'}]};
assert.ok(computeProjectCompleteness(project,audit,{snapshotCount:1})>=80);
const mixed=inspectDatasetForResearch({headers:['A','Y'],rows:[['x','1'],['y','oops'],['z','3']]});
assert.ok(mixed.findings.some(item=>/campuran/i.test(item.message)));
console.log('Research workspace verified: inspector, deterministic guidance, completeness score, project recipe contract.');
