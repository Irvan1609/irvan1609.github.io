import fs from 'node:fs';
import assert from 'node:assert/strict';

const required=[
  'src/core/core.js',
  'src/core/ids.js',
  'src/core/schema.js',
  'src/core/events.js',
  'src/core/errors.js',
  'src/core/module-registry.js',
  'src/core/settings.js',
  'src/core/overlay-manager.js'
];
for(const file of required)assert.ok(fs.existsSync(file),'Missing '+file);

const main=fs.readFileSync('src/main.js','utf8');
const scientific=fs.readFileSync('src/scientific-workflow.js','utf8');
assert.match(main,/\.\/core\/core\.js/);
assert.match(main,/createUid\('dataset'\)/);
assert.match(main,/dataset_uid:ensureDatasetUid/);
assert.match(main,/modules\.register/);
assert.match(scientific,/analysis_uid/);
assert.match(scientific,/dataset_uid:data\.dataset_uid/);

console.log('Core contract check OK');

const store=fs.readFileSync('src/local-dataset-store.js','utf8');
assert.match(store,/IDENTITY_INDEX/);
assert.match(store,/getLocalDatasetRecordByUid/);

assert.match(store,/HISTORY_STORE/);
assert.match(store,/ANALYSIS_STORE/);
assert.match(store,/SYNC_STORE/);
assert.match(store,/TRASH_STORE/);
assert.match(store,/migrateLegacyResearchStores/);

const overlay=fs.readFileSync('src/core/overlay-manager.js','utf8');
assert.match(overlay,/bindOverlayManager/);
