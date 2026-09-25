import assert from 'node:assert/strict';
import fs from 'node:fs';
import {decodeYoloOutput,nmsBoxes,summarizeConfidence} from '../public/hitung-cabai/ml-detector.js';
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
const confidence=summarizeConfidence([.4,.6,.8]);
assert.equal(confidence.n,3);
assert.equal(confidence.low,1);
assert.ok(Math.abs(confidence.mean-.6)<1e-12);

const cloud=fs.readFileSync('public/hitung-cabai/cloud-sync.js','utf8');
const app=fs.readFileSync('public/hitung-cabai/app.js','utf8');
const worker=fs.readFileSync('cloudflare/hitung-cabai-worker/src/index.js','utf8');
const html=fs.readFileSync('public/hitung-cabai/index.html','utf8');
const develop=fs.readFileSync('public/develop/app.js','utf8');
for(const marker of ["method:'PATCH'","X-Contribution-Edit","operationId","contributionId","editToken"])assert.ok(cloud.includes(marker),'cloud sync missing '+marker);
for(const marker of ['thumbnailDataURL','cloudContributionId','cloudEditToken','contributionOperationId','record-thumb'])assert.ok(app.includes(marker),'chili app missing '+marker);
for(const marker of ['batchQueue','batchNext','confidenceInspector','confidenceStats'])assert.ok(app.includes(marker),'chili batch/confidence missing '+marker);
for(const marker of ['multiple','confidenceInspector','batchState'])assert.ok(html.includes(marker),'chili html missing '+marker);
for(const marker of ['aiReviewPriority','modelEvaluation','aiModelBody'])assert.ok(develop.includes(marker),'develop AI review missing '+marker);
for(const marker of ['handleContributionPatch','edit_token_hash','idempotent_operations',"request.method==='PATCH'&&contributionMatch"])assert.ok(worker.includes(marker),'worker missing '+marker);

console.log('Hitung Cabai learning helpers and image-once annotation patch workflow verified.');
