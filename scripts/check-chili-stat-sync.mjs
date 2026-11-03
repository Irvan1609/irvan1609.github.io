import assert from 'node:assert/strict';
import {upsertChiliCountToStatistics,chiliStatisticsHeaders} from '../public/hitung-cabai/stat-sync.js';

const map=new Map();
const storage={getItem:key=>map.has(key)?map.get(key):null,setItem:(key,value)=>map.set(key,String(value))};
const headers=chiliStatisticsHeaders();
assert.deepEqual(headers.slice(0,2),['Sampel','JB | Jumlah Cabai (buah)']);
for(const marker of ['Status Validasi','Model AI','Subset','Area Rata-rata (mm²)','Feret Rata-rata (mm)'])assert.ok(headers.includes(marker));

let result=upsertChiliCountToStatistics(storage,{sample:'P0-1',count:12,status:'Tervalidasi',modelVersion:'v1',datasetSplit:'test',quality:88,confidence:.82,correction:{fp:1,fn:2},phenotype:{meanAreaMm2:30.2,meanWidthMm:8.4,meanHeightMm:22.1,meanFeretMm:24.5}});
assert.equal(result.dataset,'Hitung Cabai');assert.equal(result.updated,false);assert.equal(result.rowCount,1);
let files=JSON.parse(storage.getItem('statistical_web_csv_files_v1')),csv=files['Hitung Cabai.csv'];
assert.match(csv,/Sampel,JB \| Jumlah Cabai \(buah\),Status Validasi/);
assert.match(csv,/P0-1,12,Tervalidasi,v1,test,88,0\.82,1,2,30\.2,8\.4,22\.1,24\.5/);
assert.equal(storage.getItem('statistical_web_active_csv_v1'),'Hitung Cabai.csv');
let meta=JSON.parse(storage.getItem('statistical_web_dataset_meta_v1'));assert.equal(meta['Hitung Cabai.csv'].plant,'Cabai');

result=upsertChiliCountToStatistics(storage,{sample:'P0-1',count:15});assert.equal(result.updated,true);assert.equal(result.rowCount,1);
files=JSON.parse(storage.getItem('statistical_web_csv_files_v1'));assert.match(files['Hitung Cabai.csv'],/P0-1,15/);

result=upsertChiliCountToStatistics(storage,{sample:'P1,2',count:7});files=JSON.parse(storage.getItem('statistical_web_csv_files_v1'));assert.match(files['Hitung Cabai.csv'],/"P1,2",7/);assert.equal(result.rowCount,2);

// Legacy two-column dataset must be upgraded in place, not duplicated.
const legacyMap=new Map([['statistical_web_csv_files_v1',JSON.stringify({'Hitung Cabai.csv':'Sampel,JB | Jumlah Cabai (buah)\nL1,4'})]]);
const legacy={getItem:key=>legacyMap.get(key)??null,setItem:(key,value)=>legacyMap.set(key,String(value))};
result=upsertChiliCountToStatistics(legacy,{sample:'L2',count:5,status:'Tervalidasi'});
assert.equal(result.dataset,'Hitung Cabai');const upgraded=JSON.parse(legacy.getItem('statistical_web_csv_files_v1'))['Hitung Cabai.csv'];assert.match(upgraded,/L1,4/);assert.match(upgraded,/L2,5,Tervalidasi/);

const map2=new Map([['statistical_web_csv_files_v1',JSON.stringify({'Hitung Cabai.csv':'A,B\nx,y'})]]);
const storage2={getItem:key=>map2.get(key)??null,setItem:(key,value)=>map2.set(key,String(value))};
result=upsertChiliCountToStatistics(storage2,{sample:'S1',count:3});assert.equal(result.dataset,'Hitung Cabai (2)');
assert.ok(JSON.parse(storage2.getItem('statistical_web_csv_files_v1'))['Hitung Cabai (2).csv']);

assert.throws(()=>upsertChiliCountToStatistics(storage,{sample:'',count:1}),/Kode sampel/);
assert.throws(()=>upsertChiliCountToStatistics(storage,{sample:'A',count:1.5}),/Jumlah cabai/);
console.log('Hitung Cabai direct sync to Statistical Web verified with backward-compatible research metadata.');
