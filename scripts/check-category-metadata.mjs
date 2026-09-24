import assert from 'node:assert/strict';

const storage=new Map();
globalThis.localStorage={
  getItem:key=>storage.has(key)?storage.get(key):null,
  setItem:(key,value)=>storage.set(key,String(value)),
  removeItem:key=>storage.delete(key)
};
const mod=await import('../src/category-metadata.js');

assert.deepEqual(mod.readCategoryMetadata('Data 1','Perlakuan'),{levels:{}});
assert.equal(mod.saveCategoryLevel('Data 1','Perlakuan','P0',{value:'0',unit:'g/tanaman'}),true);
assert.equal(mod.saveCategoryLevel('Data 1','Perlakuan','P1',{value:'50',unit:'g/tanaman'}),true);
let meta=mod.readCategoryMetadata('Data 1','Perlakuan');
assert.deepEqual(meta.levels.P0,{value:'0',unit:'g/tanaman'});
assert.equal(mod.categoryLevelDescription(meta.levels.P0),'0 g/tanaman');
assert.equal(mod.categoryLevelDescription({value:'15',unit:'mL/L'}),'15 mL/L');

assert.equal(mod.moveCategoryColumn('Data 1','Perlakuan','P | Perlakuan'),true);
assert.deepEqual(mod.readCategoryMetadata('Data 1','Perlakuan'),{levels:{}});
assert.equal(mod.readCategoryMetadata('Data 1','P | Perlakuan').levels.P1.value,'50');

assert.equal(mod.moveCategoryDataset('Data 1','Jagung'),true);
assert.deepEqual(mod.readCategoryMetadata('Data 1','P | Perlakuan'),{levels:{}});
assert.equal(mod.readCategoryMetadata('Jagung','P | Perlakuan').levels.P0.unit,'g/tanaman');

assert.equal(mod.saveCategoryLevel('Jagung','P | Perlakuan','P0',{value:'',unit:''}),true);
meta=mod.readCategoryMetadata('Jagung','P | Perlakuan');
assert.equal(meta.levels.P0,undefined);
assert.equal(meta.levels.P1.value,'50');

assert.equal(mod.removeCategoryColumn('Jagung','P | Perlakuan'),true);
assert.deepEqual(mod.readCategoryMetadata('Jagung','P | Perlakuan'),{levels:{}});
assert.equal(mod.saveCategoryLevel('Jagung','Varietas','V1',{value:'1',unit:'kode'}),true);
assert.equal(mod.removeCategoryDataset('Jagung'),true);
assert.deepEqual(mod.readCategoryMetadata('Jagung','Varietas'),{levels:{}});

console.log('String-category value/unit metadata persistence, rename, and cleanup verified.');
