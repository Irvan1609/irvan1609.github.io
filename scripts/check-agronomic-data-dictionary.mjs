import assert from 'node:assert/strict';
import {
  getBuiltInAgronomicDictionary,
  normalizeAgronomicAlias,
  recognizedAgronomicHeaders,
  removeUserParameterAlias,
  resolveAgronomicParameter,
  saveUserParameterAlias,
  suggestAgronomicParameters
} from '../src/agronomic-data-dictionary.js';

assert.equal(normalizeAgronomicAlias(' Tinggi_Tanaman '),'tinggi tanaman');

const tt=suggestAgronomicParameters('tt');
assert.equal(tt.length,1);
assert.equal(tt[0].language,'id');
assert.equal(tt[0].code,'TT');
assert.equal(tt[0].name,'Tinggi Tanaman');
assert.equal(tt[0].unit,'cm');

const tinggi=suggestAgronomicParameters('tinggi tanaman');
assert.equal(tinggi.length,1);
assert.equal(tinggi[0].code,'TT');

const ph=suggestAgronomicParameters('ph');
assert.equal(ph.length,1);
assert.equal(ph[0].language,'en');
assert.equal(ph[0].code,'PH');
assert.equal(ph[0].name,'Plant Height');

const plantHeight=suggestAgronomicParameters('plant height');
assert.equal(plantHeight.length,1);
assert.equal(plantHeight[0].code,'PH');
assert.equal(suggestAgronomicParameters('plant height',{language:'id'}).length,0);
assert.equal(suggestAgronomicParameters('tinggi tanaman',{language:'en'}).length,0);

assert.equal(suggestAgronomicParameters('Tinggi Tanaman 42 HST')[0]?.code,'TT_42HST');
assert.equal(suggestAgronomicParameters('Tinggi Tanaman 42 HST')[0]?.name,'Tinggi Tanaman 42 HST');
assert.equal(suggestAgronomicParameters('PH 42 DAP')[0]?.code,'PH_42DAP');
assert.equal(suggestAgronomicParameters('diameter batang (mm)')[0]?.code,'DB');
assert.equal(suggestAgronomicParameters('Perlakuan').length,0);
assert.equal(suggestAgronomicParameters('Variable1').length,0);

const asi=suggestAgronomicParameters('ASI');
assert.equal(asi.length,2);
assert.deepEqual(new Set(asi.map(x=>x.language)),new Set(['id','en']));

assert.ok(getBuiltInAgronomicDictionary({language:'id'}).length>=20);
assert.ok(getBuiltInAgronomicDictionary({language:'en'}).length>=20);
assert.equal(recognizedAgronomicHeaders(['Perlakuan','tt','PH','unknown']).length,2);
assert.equal(resolveAgronomicParameter('tt')?.code,'TT');

const storage=new Map();
globalThis.localStorage={
  getItem:key=>storage.get(key)??null,
  setItem:(key,value)=>storage.set(key,value),
  removeItem:key=>storage.delete(key)
};
assert.equal(saveUserParameterAlias('tt',{code:'TTP',name:'Tinggi Tajuk Percobaan',unit:'m',language:'id'}),true);
assert.equal(suggestAgronomicParameters('tt')[0]?.source,'user');
assert.equal(suggestAgronomicParameters('tt')[0]?.code,'TTP');
assert.equal(removeUserParameterAlias('tt'),true);
assert.equal(suggestAgronomicParameters('tt')[0]?.code,'TT');
assert.equal(saveUserParameterAlias('Perlakuan',{code:'P',name:'Perlakuan',unit:'',language:'id'}),false);
delete globalThis.localStorage;

console.log('Agronomic dictionary suggestions are opt-in, bidirectional, language-separated, and user-overridable.');
