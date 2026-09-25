import fs from 'node:fs';

function fail(message){
  console.error('Account dataset sync check failed:',message);
  process.exit(1);
}

const sync=fs.readFileSync('src/account-dataset-sync.js','utf8');
const worker=fs.readFileSync('cloudflare/hitung-cabai-worker/src/index.js','utf8');
const schema=fs.readFileSync('cloudflare/hitung-cabai-worker/schema.sql','utf8');
const main=fs.readFileSync('src/main.js','utf8');
const style=fs.readFileSync('src/style.css','utf8');

for(const marker of [
  'installAccountDatasetSync','/v1/datasets?include_deleted=1','putCloud','deleteCloud',
  'error.status===409','stat-dataset-changed','stat-cloud-sync-applied','conflicts',
  'statistical_web_category_metadata_v1','statistical_web_treatment_metadata_v1'
]){
  if(!sync.includes(marker))fail('sync module missing '+marker);
}
for(const marker of [
  "request.method==='GET'&&url.pathname==='/v1/datasets'",
  "request.method==='PUT'&&datasetMatch",
  "request.method==='DELETE'&&datasetMatch",
  'user_datasets','expectedRevision','MAX_DATASET_BYTES',
  "'Access-Control-Allow-Methods':'GET,POST,PUT,DELETE,OPTIONS'"
]){
  if(!worker.includes(marker))fail('Worker missing '+marker);
}
if(!schema.includes('CREATE TABLE IF NOT EXISTS user_datasets'))fail('D1 schema missing user_datasets');
if(!main.includes("installAccountDatasetSync()"))fail('Statistical Web does not install account dataset sync');
if(!main.includes("'stat-cloud-sync-applied'")||!main.includes("'stat-dataset-changed'"))fail('Statistical Web editor sync events missing');
if(!style.includes('.dataset-sync-bar'))fail('dataset sync status styling missing');

console.log('Account dataset sync contract OK.');
