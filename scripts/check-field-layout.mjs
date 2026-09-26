import assert from 'node:assert/strict';
import fs from 'node:fs';
import {qrMatrix,qrSvg} from '../src/field-layout-qr.js';

const entry=fs.readFileSync('src/field-layout.js','utf8');
const field=fs.readFileSync('src/field-layout-v3.js','utf8');
const css=fs.readFileSync('src/field-layout-v3.css','utf8');
const media=fs.readFileSync('src/field-layout-media.js','utf8');
const resultOs=fs.readFileSync('src/result-os.js','utf8');
const measure=fs.readFileSync('public/pengukur/app.js','utf8');
const chili=fs.readFileSync('public/hitung-cabai/app.js','utf8');

assert.match(entry,/field-layout-v3\.js/);
for(const marker of [
  'plotUids','uidIdentity','undoStack','redoStack','fieldActiveParameter','Berikutnya kosong',
  'field-mode','activeSessionId','field-sample','data-score','data-quick-status','timestamps',
  'fieldMiniMap','fieldFit','fieldFlipX','spacers','mainPlot','heatmapMode','residual','zscore','percentile',
  'missingMode','printAllQr','capturePhoto','currentGps','openIntegration','harvests','deriveProductivity',
  'backupMeta','field_plot','AgrotikFieldLayout'
])assert.ok(field.includes(marker),'Field Workspace v3 missing '+marker);
for(const marker of ['savePlotPhoto','indexedDB','currentGps','openMeasure','openChili','printQrLabels'])assert.ok(media.includes(marker),'Field media bridge missing '+marker);
for(const marker of ['field-mode','field-mini-map','field-score-buttons','field-photo-timeline','is-filtered'])assert.ok(css.includes(marker),'Field CSS missing '+marker);
assert.match(resultOs,/data-os-field-plot/);
assert.match(measure,/agrotik-field-handoff/);
assert.match(chili,/agrotik-field-handoff/);

const matrix=qrMatrix('https://example.com/stat/?field_plot=plot-001');
assert.ok(Array.isArray(matrix)&&matrix.length>=21&&matrix.length===matrix[0].length);
assert.ok(matrix.flat().some(Boolean));
assert.match(qrSvg('plot-001'),/<svg[\s\S]*<rect/);

console.log('Field Workspace v3 checks passed: permanent UID, field mode, sessions, scientific map, media/QR bridges and Result OS deep links.');
