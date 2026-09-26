import assert from 'node:assert/strict';
import {inspectDatasetForResearch,inferAnalysisSuggestions,computeProjectCompleteness,computeProjectQuality} from '../src/research-workspace.js';

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
const quality=computeProjectQuality(project,audit,{snapshotCount:1});
assert.ok(quality.overall>=70&&quality.consistency===100&&quality.reproducibility>=90);
const mixed=inspectDatasetForResearch({headers:['A','Y'],rows:[['x','1'],['y','oops'],['z','3']]});
assert.ok(mixed.findings.some(item=>/campuran/i.test(item.message)));
const dirty=inspectDatasetForResearch({headers:['Plot ID','Perlakuan','Hasil'],rows:[['A1','P0','1,2'],['A1','P0','1.3'],['A3','P0','99'],['A4','P1','2']]});
assert.ok(dirty.findings.some(item=>item.code==='duplicate-unit-id'));
assert.ok(dirty.findings.some(item=>item.code==='mixed-decimal'));
assert.ok(dirty.findings.some(item=>item.code==='iqr-outlier'));
console.log('Research workspace verified: enhanced inspector, deterministic guidance, multidimensional quality score, project recipe contract.');
