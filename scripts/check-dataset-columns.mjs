import assert from 'node:assert/strict';
import {nextColumnName} from '../src/dataset-columns.js';
assert.equal(nextColumnName([]),'Variable1');
assert.equal(nextColumnName(['Variable1','Variable2']),'Variable3');
assert.equal(nextColumnName(['Variable1','Variable3']),'Variable4');
assert.equal(nextColumnName(['Variable1',' variable3 ','VARIABLE4']),'Variable5');
const headers=['Perlakuan','Y'],before=[...headers];
assert.equal(nextColumnName(headers),'Variable3');assert.deepEqual(headers,before);
console.log('Unique automatic column names: empty, sequential, deleted columns, whitespace/case, and immutable inputs passed.');
