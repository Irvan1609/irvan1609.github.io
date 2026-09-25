import assert from 'node:assert/strict';
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
console.log('Hitung Cabai learning helpers verified.');
