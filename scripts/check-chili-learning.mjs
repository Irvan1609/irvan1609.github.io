import assert from 'node:assert/strict';
import fs from 'node:fs';
import {decodeYoloOutput,nmsBoxes} from '../public/hitung-cabai/ml-detector.js';
import {cloudContributionReady} from '../public/hitung-cabai/cloud-config.js';

assert.equal(cloudContributionReady(),true);

const candidates=nmsBoxes([
  {score:.9,box:[.1,.1,.2,.2]},
  {score:.8,box:[.11,.11,.2,.2]},
  {score:.7,box:[.7,.7,.1,.1]}
],.45);
assert.equal(candidates.length,2);

const data=new Float32Array([
  320,100,
  320,100,
  128,40,
  128,40,
  .95,.1
]);
const decoded=decodeYoloOutput(data,[1,5,2],{inputSize:640,confidence:.25,iouThreshold:.45});
assert.equal(decoded.length,1);
assert.ok(decoded[0].score>.9);

const cloud=fs.readFileSync('public/hitung-cabai/cloud-sync.js','utf8');
const app=fs.readFileSync('public/hitung-cabai/app.js','utf8');
const worker=fs.readFileSync('cloudflare/hitung-cabai-worker/src/index.js','utf8');
for(const marker of ["method:'PATCH'","X-Contribution-Edit","operationId","contributionId","editToken"])assert.ok(cloud.includes(marker),'cloud sync missing '+marker);
for(const marker of ['thumbnailDataURL','cloudContributionId','cloudEditToken','contributionOperationId','record-thumb'])assert.ok(app.includes(marker),'chili app missing '+marker);
for(const marker of ['handleContributionPatch','edit_token_hash','idempotent_operations',"request.method==='PATCH'&&contributionMatch"])assert.ok(worker.includes(marker),'worker missing '+marker);

console.log('Hitung Cabai learning helpers and image-once annotation patch workflow verified.');
