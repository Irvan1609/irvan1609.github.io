import assert from 'node:assert/strict';
import fs from 'node:fs';
import {decodeYoloOutput,nmsBoxes,summarizeConfidence} from '../public/hitung-cabai/ml-detector.js';
import {cloudContributionReady} from '../public/hitung-cabai/cloud-config.js';
import {matchBoxes,incrementSampleCode,reviewFlags,datasetMetrics,imageQuality} from '../public/hitung-cabai/review-metrics.js';

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

const matched=matchBoxes(
  [{box:[.1,.1,.2,.2],score:.9},{box:[.7,.7,.1,.1],score:.4}],
  [[.1,.1,.2,.2],[.4,.4,.1,.1]],.5
);
assert.equal(matched.tp,1);assert.equal(matched.fp,1);assert.equal(matched.fn,1);
assert.equal(incrementSampleCode('P009'),'P010');
assert.equal(incrementSampleCode('Plot-A'),'Plot-A-002');
const flags=reviewFlags([{box:[.1,.1,.1,.1],score:.35},{box:[.5,.5,.1,.1],score:.9}]);
assert.equal(flags[0].needsReview,true);
const qData=new Uint8ClampedArray(40*40*4);
for(let y=0;y<40;y++)for(let x=0;x<40;x++){const i=4*(y*40+x),v=(x+y)%2?60:210;qData.set([v,v,v,255],i);}
const q=imageQuality({data:qData,width:40,height:40});assert.ok(q.score>=0&&q.score<=100);
const metrics=datasetMetrics([{boxes:[[.1,.1,.2,.2]],predictedDetections:[{box:[.1,.1,.2,.2],score:.9}],condition:'normal'}]);
assert.equal(metrics.n,1);assert.equal(metrics.mae,0);assert.ok(metrics.f1>.99);

const cloud=fs.readFileSync('public/hitung-cabai/cloud-sync.js','utf8');
const app=fs.readFileSync('public/hitung-cabai/app.js','utf8');
const worker=fs.readFileSync('cloudflare/hitung-cabai-worker/src/index.js','utf8');
const html=fs.readFileSync('public/hitung-cabai/index.html','utf8');
const develop=fs.readFileSync('public/develop/app.js','utf8');
for(const marker of ["method:'PATCH'","X-Contribution-Edit","operationId","contributionId","editToken"])assert.ok(cloud.includes(marker),'cloud sync missing '+marker);
for(const marker of ['thumbnailDataURL','imageBlob','cloudContributionId','cloudEditToken','contributionOperationId','record-thumb','reviewIndices','pinchStart','duplicateBanner','warmOfflineModel'])assert.ok(app.includes(marker),'chili app missing '+marker);
for(const marker of ['batchQueue','batchNext','confidenceInspector','confidenceStats','maybeAutoBatch','activeLearningPriority','datasetMetrics'])assert.ok(app.includes(marker),'chili batch/confidence missing '+marker);
for(const marker of ['multiple','confidenceInspector','batchState','qualityGate','reviewLow','deleteSelected','autoNext','autoIncrement','batchAuto','conditionMetrics','saveDesktop'])assert.ok(html.includes(marker),'chili html missing '+marker);
assert.ok(!html.includes('<style>'),'Hitung Cabai CSS should be externalized');
assert.ok(fs.existsSync('public/hitung-cabai/style.css'),'Hitung Cabai stylesheet missing');
for(const marker of ['aiReviewPriority','modelEvaluation','aiModelBody'])assert.ok(develop.includes(marker),'develop AI review missing '+marker);
for(const marker of ['handleContributionPatch','edit_token_hash','idempotent_operations',"request.method==='PATCH'&&contributionMatch"])assert.ok(worker.includes(marker),'worker missing '+marker);

console.log('Hitung Cabai learning helpers and image-once annotation patch workflow verified.');
