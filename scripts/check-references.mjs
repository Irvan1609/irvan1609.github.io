import assert from 'node:assert/strict';
import {extractDoi,formatApa,formatHarvard,mergeUniqueReferences,normalizeDoi,referenceFromCrossref,toBibtex,toRis} from '../src/reference-core.js';

assert.equal(normalizeDoi('https://doi.org/10.1000/ABC.1'),'10.1000/abc.1');
assert.equal(normalizeDoi('DOI: 10.5555/XYZ'),'10.5555/xyz');
assert.equal(extractDoi('Artikel tersedia di https://doi.org/10.1111/abcd.12345.'),'10.1111/abcd.12345');
assert.equal(normalizeDoi('bukan doi'),'');
const ref=referenceFromCrossref({
  DOI:'10.1000/TEST',
  title:['Nitrogen response in maize'],
  author:[{given:'Ayu',family:'Sari'},{given:'Budi',family:'Putra'}],
  published:{'date-parts':[[2025,3,1]]},
  'container-title':['Agronomy Journal'],
  volume:'7',issue:'2',page:'10-20',publisher:'Example Press',type:'journal-article',ISSN:['1234-5678']
});
assert.equal(ref.year,2025);
assert.equal(ref.doi,'10.1000/test');
assert.match(formatApa(ref),/Sari, A\./);
assert.match(formatHarvard(ref),/Agronomy Journal/);
const ris=toRis([ref]);
assert.match(ris,/TY  - JOUR/);
assert.match(ris,/DO  - 10\.1000\/test/);
assert.match(ris,/AU  - Sari, Ayu/);
const bib=toBibtex([ref]);
assert.match(bib,/@article\{/);
assert.match(bib,/doi = \{10\.1000\/test\}/);
const merged=mergeUniqueReferences([ref],[{...ref,title:'Duplikat'}]);
assert.equal(merged.references.length,1);
assert.equal(merged.duplicates.length,1);
console.log('Reference manager core verified: DOI normalization/extraction, Crossref mapping, dedupe, RIS/BibTeX and citation formatting.');
