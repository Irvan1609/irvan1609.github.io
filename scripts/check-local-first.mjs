import assert from 'node:assert/strict';
import {virtualWindow,VIRTUALIZE_AFTER_ROWS} from '../src/virtual-grid.js';
import {datasetBytes,shouldOffloadDataset,localPointer,isLocalPointer,OFFLOAD_THRESHOLD_BYTES} from '../src/local-dataset-store.js';
import fs from 'node:fs';

assert.ok(VIRTUALIZE_AFTER_ROWS>=200);
const small=virtualWindow({rowCount:100,scrollTop:0,viewportHeight:400,rowHeight:40});
assert.equal(small.virtualized,false);
assert.deepEqual([small.start,small.end],[0,100]);

const large=virtualWindow({rowCount:10000,scrollTop:40000,viewportHeight:600,rowHeight:40,overscan:20});
assert.equal(large.virtualized,true);
assert.ok(large.start>900&&large.start<1100);
assert.ok(large.end-large.start<100);
assert.equal(large.top,large.start*40);
assert.equal(large.bottom,(10000-large.end)*40);

assert.equal(datasetBytes('abc'),3);
assert.equal(shouldOffloadDataset('small'),false);
assert.equal(shouldOffloadDataset('x'.repeat(OFFLOAD_THRESHOLD_BYTES)),true);
const pointer=localPointer('Panen 1.csv');
assert.ok(isLocalPointer(pointer));
assert.equal(isLocalPointer('a,b\n1,2'),false);

console.log('Local-first storage thresholds and virtual-grid windowing verified.');

const store=fs.readFileSync('src/local-dataset-store.js','utf8');
for(const marker of ['HISTORY_STORE','ANALYSIS_STORE','SYNC_STORE','TRASH_STORE','migrateLegacyResearchStores'])assert.ok(store.includes(marker),'Missing '+marker);
