import assert from 'node:assert/strict';
import {upsertChiliCountToStatistics,chiliStatisticsHeaders} from '../public/hitung-cabai/stat-sync.js';

const map=new Map();
const storage={
  getItem:key=>map.has(key)?map.get(key):null,
  setItem:(key,value)=>map.set(key,String(value))
};

assert.deepEqual(chiliStatisticsHeaders(),['Sampel','JB | Jumlah Cabai (buah)']);
let result=upsertChiliCountToStatistics(storage,{sample:'P0-1',count:12});
assert.equal(result.dataset,'Hitung Cabai');
assert.equal(result.updated,false);
assert.equal(result.rowCount,1);

let files=JSON.parse(storage.getItem('statistical_web_csv_files_v1'));
assert.equal(files['Hitung Cabai.csv'],'Sampel,JB | Jumlah Cabai (buah)\nP0-1,12');
assert.equal(storage.getItem('statistical_web_active_csv_v1'),'Hitung Cabai.csv');
let meta=JSON.parse(storage.getItem('statistical_web_dataset_meta_v1'));
assert.equal(meta['Hitung Cabai.csv'].plant,'Cabai');

result=upsertChiliCountToStatistics(storage,{sample:'P0-1',count:15});
assert.equal(result.updated,true);
assert.equal(result.rowCount,1);
files=JSON.parse(storage.getItem('statistical_web_csv_files_v1'));
assert.equal(files['Hitung Cabai.csv'],'Sampel,JB | Jumlah Cabai (buah)\nP0-1,15');

result=upsertChiliCountToStatistics(storage,{sample:'P1,2',count:7});
files=JSON.parse(storage.getItem('statistical_web_csv_files_v1'));
assert.match(files['Hitung Cabai.csv'],/"P1,2",7/);
assert.equal(result.rowCount,2);

const map2=new Map([['statistical_web_csv_files_v1',JSON.stringify({'Hitung Cabai.csv':'A,B\nx,y'})]]);
const storage2={getItem:key=>map2.get(key)??null,setItem:(key,value)=>map2.set(key,String(value))};
result=upsertChiliCountToStatistics(storage2,{sample:'S1',count:3});
assert.equal(result.dataset,'Hitung Cabai (2)');
assert.ok(JSON.parse(storage2.getItem('statistical_web_csv_files_v1'))['Hitung Cabai (2).csv']);

assert.throws(()=>upsertChiliCountToStatistics(storage,{sample:'',count:1}),/Kode sampel/);
assert.throws(()=>upsertChiliCountToStatistics(storage,{sample:'A',count:1.5}),/Jumlah cabai/);
console.log('Hitung Cabai direct sync to Statistical Web verified.');
