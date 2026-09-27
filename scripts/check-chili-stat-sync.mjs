import assert from 'node:assert/strict';
import {upsertChiliCountToStatistics,chiliStatisticsHeaders} from '../public/hitung-cabai/stat-sync.js';

const map=new Map();
const storage={
  getItem:key=>map.has(key)?map.get(key):null,
  setItem:(key,value)=>map.set(key,String(value))
};

const expectedHeaders=[
  'Sampel','JB | Jumlah Cabai (buah)','Status Validasi','Model AI','Subset','Quality Gate','Confidence Mean',
  'FP','FN','Area Rata-rata (mm²)','Lebar Rata-rata (mm)','Tinggi Rata-rata (mm)','Feret Rata-rata (mm)'
];
assert.deepEqual(chiliStatisticsHeaders(),expectedHeaders);

let result=upsertChiliCountToStatistics(storage,{sample:'P0-1',count:12});
assert.equal(result.dataset,'Hitung Cabai');
assert.equal(result.updated,false);
assert.equal(result.rowCount,1);
assert.deepEqual(result.headers,expectedHeaders);

let files=JSON.parse(storage.getItem('statistical_web_csv_files_v1'));
let lines=files['Hitung Cabai.csv'].split('\n');
assert.equal(lines[0],expectedHeaders.join(','));
assert.equal(lines[1].split(',')[0],'P0-1');
assert.equal(lines[1].split(',')[1],'12');
assert.equal(storage.getItem('statistical_web_active_csv_v1'),'Hitung Cabai.csv');
let meta=JSON.parse(storage.getItem('statistical_web_dataset_meta_v1'));
assert.equal(meta['Hitung Cabai.csv'].plant,'Cabai');

result=upsertChiliCountToStatistics(storage,{sample:'P0-1',count:15,status:'valid',modelVersion:'v2',datasetSplit:'test',quality:0.9,confidence:0.87,correction:{fp:1,fn:2},phenotype:{meanAreaMm2:12.3,meanWidthMm:4.2,meanHeightMm:6.7,meanFeretMm:7.1}});
assert.equal(result.updated,true);
assert.equal(result.rowCount,1);
files=JSON.parse(storage.getItem('statistical_web_csv_files_v1'));
lines=files['Hitung Cabai.csv'].split('\n');
assert.match(lines[1],/^P0-1,15,valid,v2,test,0\.9,0\.87,1,2,12\.3,4\.2,6\.7,7\.1$/);

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
