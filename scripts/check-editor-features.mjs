import assert from 'node:assert/strict';
import {detectColumnType,normalizeCellRange,rangeMatrix,matrixTsv,columnTooltip,contextualAnalysisTitle,safeSheetNameFromParameter} from '../src/editor-features.js';

assert.equal(detectColumnType(['1','2.5','3']).type,'numeric');
assert.equal(detectColumnType(['P0','P1','P0','P2']).type,'category');
assert.equal(detectColumnType(['2026-09-01','2026-09-02']).type,'date');
assert.equal(detectColumnType(['catatan panjang a','catatan panjang b','catatan panjang c','catatan panjang d']).type,'text');
assert.deepEqual(normalizeCellRange({r:3,c:4},{r:1,c:2}),{r1:1,r2:3,c1:2,c2:4});
assert.deepEqual(rangeMatrix([['a','b'],['c','d']],{r1:0,r2:1,c1:0,c2:1}),[['a','b'],['c','d']]);
assert.equal(matrixTsv([['a','b'],['c','d']]),'a\tb\nc\td');
assert.match(columnTooltip('TT | Tinggi Tanaman (cm)',{label:'Numerik'},{levels:{}}),/Tinggi Tanaman \(cm\)/);
assert.match(columnTooltip('P | Perlakuan',{label:'Kategori'},{unit:'g\/tanaman',levels:{P0:{value:'0'},P1:{value:'50'}}}),/P0 = 0 g\/tanaman/);
assert.equal(contextualAnalysisTitle('TT | Tinggi Tanaman (cm)',{plant:'Cabai rawit',treatment:'Mulsa'}),'Analisis Tinggi Tanaman (cm) — Cabai rawit — Mulsa');
assert.equal(safeSheetNameFromParameter('TT | Tinggi Tanaman (cm)'), 'TT');
assert.equal(safeSheetNameFromParameter('PROD | Produktivitas (t ha⁻¹)'), 'PROD');
console.log('Editor feature helpers verified.');
