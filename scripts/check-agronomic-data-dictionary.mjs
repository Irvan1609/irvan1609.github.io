import assert from 'node:assert/strict';
import {
  getBuiltInAgronomicDictionary,
  normalizeAgronomicAlias,
  recognizedAgronomicHeaders,
  removeUserParameterAlias,
  resolveAgronomicParameter,
  saveUserParameterAlias
} from '../src/agronomic-data-dictionary.js';

assert.equal(normalizeAgronomicAlias(' Tinggi_Tanaman '),'tinggi tanaman');
assert.deepEqual(resolveAgronomicParameter('tt'),{
  code:'TT',name:'Tinggi Tanaman',unit:'cm',category:'Pertumbuhan vegetatif',
  source:'builtin',matchedAlias:'tt',observationTime:''
});
assert.equal(resolveAgronomicParameter('TINGGI TANAMAN')?.code,'TT');
assert.equal(resolveAgronomicParameter('Tinggi Tanaman 42 HST')?.code,'TT_42HST');
assert.equal(resolveAgronomicParameter('Tinggi Tanaman 42 HST')?.name,'Tinggi Tanaman 42 HST');
assert.equal(resolveAgronomicParameter('diameter batang (mm)'),null);
assert.equal(resolveAgronomicParameter('Perlakuan'),null);
assert.equal(resolveAgronomicParameter('Variable1'),null);
assert.ok(getBuiltInAgronomicDictionary().length>=20);
assert.equal(recognizedAgronomicHeaders(['Perlakuan','tt','DB','unknown']).length,2);

const storage=new Map();
globalThis.localStorage={
  getItem:key=>storage.get(key)??null,
  setItem:(key,value)=>storage.set(key,value),
  removeItem:key=>storage.delete(key)
};
assert.equal(saveUserParameterAlias('tt',{code:'TTP',name:'Tinggi Tajuk Percobaan',unit:'m'}),true);
assert.equal(resolveAgronomicParameter('tt')?.source,'user');
assert.equal(resolveAgronomicParameter('tt')?.code,'TTP');
assert.equal(removeUserParameterAlias('tt'),true);
assert.equal(resolveAgronomicParameter('tt')?.code,'TT');
assert.equal(saveUserParameterAlias('Perlakuan',{code:'P',name:'Perlakuan',unit:''}),false);
delete globalThis.localStorage;

console.log('Agronomic data dictionary recognition, observation-time parsing, safe aliases, and user override verified.');
