import assert from 'node:assert/strict';

const storage=new Map();
globalThis.localStorage={
  getItem:key=>storage.has(key)?storage.get(key):null,
  setItem:(key,value)=>storage.set(key,String(value)),
  removeItem:key=>storage.delete(key)
};
const mod=await import('../src/category-metadata.js');

assert.deepEqual(mod.readCategoryMetadata('Data 1','Perlakuan'),{unit:'',levels:{}});
assert.equal(mod.saveCategoryMetadata('Data 1','Perlakuan',{
  unit:'g/tanaman',
  levels:{P0:{value:'0'},P1:{value:'50'},P2:{value:'100'}}
}),true);
let meta=mod.readCategoryMetadata('Data 1','Perlakuan');
assert.equal(meta.unit,'g/tanaman');
assert.deepEqual(meta.levels.P0,{value:'0'});
assert.equal(mod.categoryLevelDescription(meta.levels.P0,meta.unit),'0 g/tanaman');
assert.equal(mod.categoryLevelDescription({value:'15'},'mL/L'),'15 mL/L');

assert.equal(mod.saveCategoryLevel('Data 1','Perlakuan','P3',{value:'150'}),true);
meta=mod.readCategoryMetadata('Data 1','Perlakuan');
assert.equal(meta.levels.P3.value,'150');
assert.equal(meta.unit,'g/tanaman');

assert.equal(mod.moveCategoryColumn('Data 1','Perlakuan','P | Perlakuan'),true);
assert.deepEqual(mod.readCategoryMetadata('Data 1','Perlakuan'),{unit:'',levels:{}});
assert.equal(mod.readCategoryMetadata('Data 1','P | Perlakuan').levels.P1.value,'50');

assert.equal(mod.moveCategoryDataset('Data 1','Jagung'),true);
assert.deepEqual(mod.readCategoryMetadata('Data 1','P | Perlakuan'),{unit:'',levels:{}});
assert.equal(mod.readCategoryMetadata('Jagung','P | Perlakuan').unit,'g/tanaman');

assert.equal(mod.copyCategoryDataset('Jagung','Jagung salinan'),true);
assert.equal(mod.readCategoryMetadata('Jagung salinan','P | Perlakuan').unit,'g/tanaman');
assert.equal(mod.readCategoryMetadata('Jagung salinan','P | Perlakuan').levels.P3.value,'150');
assert.equal(mod.saveCategoryLevel('Jagung salinan','P | Perlakuan','P3',{value:'175'}),true);
assert.equal(mod.readCategoryMetadata('Jagung','P | Perlakuan').levels.P3.value,'150');

assert.equal(mod.removeCategoryColumn('Jagung','P | Perlakuan'),true);
assert.deepEqual(mod.readCategoryMetadata('Jagung','P | Perlakuan'),{unit:'',levels:{}});
assert.equal(mod.saveCategoryMetadata('Jagung','Varietas',{unit:'',levels:{V1:{value:'1'}}}),true);
assert.equal(mod.removeCategoryDataset('Jagung'),true);
assert.deepEqual(mod.readCategoryMetadata('Jagung','Varietas'),{unit:'',levels:{}});

// Backward compatibility: old records stored unit per level.
storage.set('statistical_web_category_metadata_v1',JSON.stringify({
  Lama:{Perlakuan:{levels:{P0:{value:'0',unit:'kg/ha'},P1:{value:'100',unit:'kg/ha'}}}}
}));
meta=mod.readCategoryMetadata('Lama','Perlakuan');
assert.equal(meta.unit,'kg/ha');
assert.deepEqual(meta.levels.P1,{value:'100'});

console.log('String-category metadata verified with one shared unit per column, legacy migration, rename, and cleanup.');
