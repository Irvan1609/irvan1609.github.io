import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {createHash} from 'node:crypto';
import ExcelJS from 'exceljs';
import {rawWorkbook,backupRawDataset,validEndpoint,MAX_BYTES,DEFAULT_ENDPOINT} from '../src/drive-backup.js';
const endpoint='https://script.google.com/macros/s/example/exec';
assert(validEndpoint(endpoint));
for(const url of ['http://script.google.com/macros/s/a/exec',endpoint+'/extra',endpoint+'?x=1','https://evil.test/exec'])assert(!validEndpoint(url));
const data={name:'Test',headers:['Perlakuan','Ulangan','Y'],rows:[['001','1','13,50'],['=1+1','2','14.20']]};
const bytes=await rawWorkbook(data),book=new ExcelJS.Workbook();await book.xlsx.load(bytes);
assert.equal(book.worksheets.length,1);
assert.equal(book.worksheets[0].getCell('A2').value,'001');
assert.equal(book.worksheets[0].getCell('C2').value,'13,50');
assert.equal(book.worksheets[0].getCell('A3').value,'=1+1');
await assert.rejects(rawWorkbook({headers:['x'],rows:[['x'.repeat(MAX_BYTES+1)]]}),/2 MiB/);
let setting={},sent=[],message='';
globalThis.localStorage={getItem:()=>JSON.stringify(setting)};
globalThis.document={getElementById:()=>({set textContent(x){message=x;}})};
globalThis.fetch=async(url,options)=>{sent.push({url,options});return {type:'opaque'};};
// Stored JSON can be valid but have the wrong shape, or storage can be unavailable.
// Every invalid configuration must fail closed without a rejected backup promise.
for(const stored of [null,[],true,42,'enabled',{enabled:true},{enabled:true,endpoint:''},{enabled:'false',endpoint},{enabled:'true',endpoint},{enabled:1,endpoint},{enabled:true,endpoint:[endpoint]},{enabled:true,endpoint:'https://invalid.example/exec'}]){
  setting=stored;
  await assert.doesNotReject(backupRawDataset(data));
  assert.equal(sent.length,0,'Invalid settings must not send data');
  assert.match(message,/belum aktif/);
}
for(const getItem of [()=>'{broken',()=>{throw Error('Storage disabled');}]){
  globalThis.localStorage={getItem};
  await assert.doesNotReject(backupRawDataset(data));assert.equal(sent.length,0);
}
assert.equal(validEndpoint([endpoint]),false);
assert.equal(validEndpoint(null),false);
// Fresh browsers use the verified receiver; existing explicit opt-out is respected.
assert(validEndpoint(DEFAULT_ENDPOINT));
globalThis.localStorage={getItem:()=>null};
await backupRawDataset(data);assert.equal(sent.length,1);assert.equal(sent[0].url,DEFAULT_ENDPOINT);
sent=[];
globalThis.localStorage={getItem:()=>JSON.stringify(setting)};
setting={enabled:false,endpoint:DEFAULT_ENDPOINT};
await backupRawDataset(data);assert.equal(sent.length,0);
setting={};
await backupRawDataset(data);assert.equal(sent.length,0);
setting={enabled:true,endpoint};await backupRawDataset(data);
assert.equal(sent.length,1);assert.equal(sent[0].options.mode,'no-cors');
assert.match(message,/belum terkonfirmasi/);
assert.deepEqual(Object.keys(JSON.parse(sent[0].options.body)).sort(),['data','name','version']);
globalThis.fetch=async()=>{throw Error('offline');};await backupRawDataset(data);assert.match(message,/Data lokal tetap tersedia/);
// Execute the actual Apps Script source using bounded mocks, not a real Drive.
const files=new Set(),props={};let created=0,folderUsed;
const context={console,Utilities:{base64Decode:x=>[...Buffer.from(x,'base64')],formatDate:()=> '2026-09-13',DigestAlgorithm:{SHA_256:'sha256'},computeDigest:(_,b)=>[...createHash('sha256').update(Buffer.from(b)).digest()],newBlob:(b,m,n)=>({b,m,n})},LockService:{getScriptLock:()=>({tryLock:()=>true,hasLock:()=>true,releaseLock(){}})},PropertiesService:{getScriptProperties:()=>({getProperty:k=>props[k],setProperty:(k,v)=>{props[k]=v;}})},DriveApp:{getFolderById:id=>{folderUsed=id;return {getFilesByName:n=>({hasNext:()=>files.has(n)}),createFile:blob=>{files.add(blob.n);created++;}};}},ContentService:{MimeType:{JSON:'json'},createTextOutput:text=>({setMimeType:()=>JSON.parse(text)})}};
vm.createContext(context);vm.runInContext(readFileSync(new URL('./drive-receiver.gs',import.meta.url),'utf8'),context);
const event={postData:{contents:JSON.stringify({version:1,data:Buffer.from(bytes).toString('base64')})}};
assert.equal(context.doPost(event).ok,true);assert.equal(created,1);
assert.equal(folderUsed,'1lP_zy-noo1EtMmpQRFL1Hy27-i5T74rN');
assert.equal(context.doPost(event).duplicate,true);assert.equal(created,1);
assert.equal(context.doPost({postData:{contents:'invalid'}}).ok,false);
props.backupDaily=JSON.stringify({day:'2026-09-13',count:50,bytes:0});assert.equal(context.doPost(event).ok,false);
props.backupDaily=JSON.stringify({day:'2026-09-13',count:0,bytes:10*1024*1024});assert.equal(context.doPost(event).ok,false);
assert.equal(context.doGet().download,false);
console.log('Drive backup checks passed: literal XLSX, endpoint, disabled/error/opaque states, receiver folder/dedup/quotas. Live deployment not tested.');
