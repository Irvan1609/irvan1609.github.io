import assert from 'node:assert/strict';

const storage=new Map();
globalThis.localStorage={
  getItem:key=>storage.has(key)?storage.get(key):null,
  setItem:(key,value)=>storage.set(key,String(value)),
  removeItem:key=>storage.delete(key)
};
const mod=await import('../src/treatment-metadata.js');

const source=mod.treatmentMetadataKey('Data 1','Perlakuan','');
assert.equal(mod.saveTreatmentMetadata(source,{factorLabels:{a:'Dosis'},levels:{a:{P0:'0 g/tanaman',P1:'50 g/tanaman'},b:{}}}),true);
assert.equal(mod.copyTreatmentMetadataDataset('Data 1','Data 1 salinan'),true);
const copied=mod.readTreatmentMetadata(mod.treatmentMetadataKey('Data 1 salinan','Perlakuan',''));
assert.equal(copied.levels.a.P1,'50 g/tanaman');
copied.levels.a.P1='75 g/tanaman';
mod.saveTreatmentMetadata(mod.treatmentMetadataKey('Data 1 salinan','Perlakuan',''),copied);
assert.equal(mod.readTreatmentMetadata(source).levels.a.P1,'50 g/tanaman');

assert.equal(mod.moveTreatmentMetadataDataset('Data 1 salinan','Data 2'),true);
assert.equal(mod.readTreatmentMetadata(mod.treatmentMetadataKey('Data 1 salinan','Perlakuan','')),null);
assert.equal(mod.readTreatmentMetadata(mod.treatmentMetadataKey('Data 2','Perlakuan','')).levels.a.P1,'75 g/tanaman');

assert.equal(mod.removeTreatmentMetadataDataset('Data 2'),true);
assert.equal(mod.readTreatmentMetadata(mod.treatmentMetadataKey('Data 2','Perlakuan','')),null);

console.log('Treatment metadata copy, rename, and cleanup verified.');
