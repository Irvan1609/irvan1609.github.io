import assert from 'node:assert/strict';
import {datasetExcelFilename} from '../src/export-filename.js';
assert.equal(datasetExcelFilename('Jagung Bone.txt'),'Jagung Bone.xlsx');
assert.equal(datasetExcelFilename('Data percobaan.xlsx'),'Data percobaan.xlsx');
assert.equal(datasetExcelFilename('Dosis N 2026'),'Dosis N 2026.xlsx');
assert.equal(datasetExcelFilename('Uji: A/B'),'Uji- A-B.xlsx');
assert.equal(datasetExcelFilename(''),'hasil-analisis.xlsx');
console.log('Dataset Excel filenames preserve names and remove old extensions.');
