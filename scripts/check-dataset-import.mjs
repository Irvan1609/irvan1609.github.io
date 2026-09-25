import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {validateColumnNames} from '../src/dataset-columns.js';
import {recognizedAgronomicHeaders,saveUserParameterAlias,suggestAgronomicParameters} from '../src/agronomic-data-dictionary.js';
import {templateCatalog,getDataTemplate,rowsForEditor} from '../src/template-catalog.js';
import ExcelJS from 'exceljs';

// Execute the real editor event listener, not a duplicate of the import logic.
const source=fs.readFileSync('src/main.js','utf8').replace(/^import .*;\n/gm,'').replace(/^initNumberSettings\(\);.*$/m,'');
const target=new EventTarget(),elements=new Map(),storage=new Map();
let failKey=null;
const document={addEventListener:target.addEventListener.bind(target),querySelector(selector){
  if(!elements.has(selector))elements.set(selector,{addEventListener(){},classList:{},textContent:''});
  return elements.get(selector);
}};
const context=vm.createContext({document,validateColumnNames,recognizedAgronomicHeaders,saveUserParameterAlias,suggestAgronomicParameters,formatNumber:String,console:{error(){}},localStorage:{
  getItem:key=>storage.get(key)??null,
  setItem(key,value){if(key===failKey){failKey=null;throw Error('Kuota penyimpanan penuh.');}storage.set(key,value);},
  removeItem:key=>storage.delete(key)
}});
vm.runInContext(source+'\nrenderTree=()=>{};renderGrid=()=>{};installDataGrid();',context);
const snapshot=()=>vm.runInContext('JSON.stringify(state)',context);
function send(detail){const event=new Event('dataset-import');event.detail=detail;target.dispatchEvent(event);return detail.importResult;}
const old=snapshot();
assert.equal(send({name:'Invalid',headers:['X','x'],rows:[[1,2]]}).ok,false);
assert.equal(snapshot(),old);
for(const entry of templateCatalog){
  const template=getDataTemplate(entry.id),rows=rowsForEditor(template,'.');
  assert.equal(send({name:template.name,headers:template.headers,rows}).ok,true,entry.id);
  assert.equal(JSON.parse(snapshot()).rows.length,rows.length);
}
// Actual Excel encoding/decoding, followed by the same editor import event.
const book=new ExcelJS.Workbook(),sheet=book.addWorksheet('Data');
sheet.addRows([['Perlakuan','Y'],['M0',15.89],['M1',20.97]]);
const loaded=new ExcelJS.Workbook();await loaded.xlsx.load(await book.xlsx.writeBuffer());
const decoded=[];loaded.worksheets[0].eachRow(row=>decoded.push(row.values.slice(1).map(String)));
const [headers,...rows]=decoded;
assert.equal(send({name:'Excel',headers,rows}).name,'Excel.csv');
assert.equal(send({name:'excel',headers,rows}).name,'excel (2).csv');
const csvState=JSON.parse(snapshot()),csvText=csvState.files[csvState.active];
assert.ok(csvState.active.endsWith('.csv'));
assert.match(csvText,/^Perlakuan,Y\nM0,15\.89\nM1,20\.97$/);
assert.equal(csvText.includes('\t'),false);
assert.equal(send({name:'Meta',headers,rows,plant:'Jagung',treatment:'Dosis N'}).name,'Meta.csv');
const metaState=JSON.parse(snapshot());
assert.deepEqual(metaState.meta['Meta.csv'],{plant:'Jagung',treatment:'Dosis N'});
const valid=snapshot(),persisted=JSON.stringify([...storage]);
for(const detail of [
  {headers:['A'],rows:[]},{headers:['A'],rows:[[1,2]]},
  {headers:['A'],rows:[[Infinity]]},{headers:['A'],rows:[['line\nbreak']]},
  {headers:['A\tB'],rows:[[1]]}
]){assert.equal(send(detail).ok,false);assert.equal(snapshot(),valid);}
for(const key of ['statistical_web_csv_files_v1','statistical_web_active_csv_v1','statistical_web_dataset_meta_v1']){
  failKey=key;assert.equal(send({name:'Full',headers,rows}).ok,false);
  assert.equal(snapshot(),valid);assert.equal(JSON.stringify([...storage]),persisted);
}
assert.deepEqual(JSON.parse(snapshot()).rows,rows);
const tools=fs.readFileSync('src/data-tools.js','utf8');
assert.ok(tools.includes('if(!detail.importResult?.ok)throw Error'));
assert.ok(tools.includes('importDataset({name:template.name'));
assert.ok(tools.includes('importDataset({name:file.name'));
console.log('Dataset import: all templates, XLSX round-trip, unique names, validation and storage-failure preservation passed.');
