import assert from 'node:assert/strict';
import {nextColumnName,isUniqueColumnName,validateColumnNames,prepareImportedColumnNames} from '../src/dataset-columns.js';
import {parseNumber,formatNumber,getDecimalSeparator} from '../src/number-format.js';
assert.equal(nextColumnName([]),'Variable1');
assert.equal(nextColumnName(['Variable1','Variable2']),'Variable3');
assert.equal(nextColumnName(['Variable1','Variable3']),'Variable4');
assert.equal(nextColumnName(['Variable1',' variable3 ','VARIABLE4']),'Variable5');
const headers=['Perlakuan','Y'],before=[...headers];
assert.equal(nextColumnName(headers),'Variable3');assert.deepEqual(headers,before);
assert.equal(isUniqueColumnName(['Produksi','Tinggi'],'Bobot'),true);
assert.equal(isUniqueColumnName(['Produksi','Tinggi'],' produksi '),false);
assert.equal(isUniqueColumnName(['Produksi','Tinggi'],'PRODUKSI'),false);
assert.equal(isUniqueColumnName(['Produksi','Tinggi'],' produksi ',0),true);
assert.equal(isUniqueColumnName(['Produksi','Tinggi'],'   '),false);
assert.equal(isUniqueColumnName(['Produksi','Tinggi'],'Ｐｒｏｄｕｋｓｉ'),false);
assert.equal(isUniqueColumnName(['Café','Tinggi'],'Cafe\u0301'),false);
assert.equal(nextColumnName(['Variable1','Ｖａｒｉａｂｌｅ３']),'Variable4');
assert.deepEqual(validateColumnNames([' Perlakuan ','Produksi']),['Perlakuan','Produksi']);
assert.throws(()=>validateColumnNames(['Perlakuan','perlakuan']),/harus unik/);
assert.throws(()=>validateColumnNames(['Perlakuan','']),/harus terisi/);
assert.throws(()=>validateColumnNames(['Café','Cafe\u0301']),/harus unik/);
const importedHeaders=[' Perlakuan ','Produksi'];
validateColumnNames(importedHeaders);assert.deepEqual(importedHeaders,[' Perlakuan ','Produksi']);

// Imported Excel/CSV headers should be repaired, not cause complete data rejection.
// The strict validator must remain unchanged for manual column editing.
const incoming=[' Produksi ','produksi','Produksi (2)','','Variable4','Ｙ','y','  '];
const originalIncoming=[...incoming];
const repaired=prepareImportedColumnNames(incoming);
assert.deepEqual(incoming,originalIncoming,'must not mutate source names');
assert.deepEqual(repaired.headers,['Produksi','produksi (3)','Produksi (2)','Variable5','Variable4','Ｙ','y (2)','Variable8']);
assert.equal(repaired.renamed.length,4);
assert.deepEqual(validateColumnNames(repaired.headers),repaired.headers);
assert.deepEqual(prepareImportedColumnNames(['Perlakuan','Y']).headers,['Perlakuan','Y']);
assert.deepEqual(prepareImportedColumnNames(['Café','Café']).headers,['Café','Café (2)']);
assert.deepEqual(prepareImportedColumnNames(['','']).headers,['Variable1','Variable2']);
assert.throws(()=>prepareImportedColumnNames([]),/tidak memiliki kolom/);
const sampleRows=[['Parameter','parameter'],['P1',12,34],['P2',14,36]];
const sampleWidth=sampleRows.reduce((width,row)=>Math.max(width,row.length),0);
const repairedHeaders=prepareImportedColumnNames(Array.from({length:sampleWidth},(_,i)=>sampleRows[0][i]??''));
assert.deepEqual(repairedHeaders.headers,['Parameter','parameter (2)','Variable3']);
assert.deepEqual(sampleRows.slice(1).map(row=>repairedHeaders.headers.map((_,i)=>row[i]??'')),[['P1',12,34],['P2',14,36]]);

// Numeric parsing is a statistical input boundary: accept only the configured
// decimal convention and reject grouping/ambiguous text before analysis.
const sep=getDecimalSeparator();
const decimal=sep===','?'13,50':'13.50';
const wrongDecimal=sep===','?'13.50':'13,50';
assert.equal(parseNumber(decimal),13.5);
assert.equal(parseNumber(' -2 '),-2);
assert.equal(parseNumber(sep===','?',25':'.25'),0.25);
assert.equal(parseNumber('1e2'),100);
assert.ok(Number.isNaN(parseNumber(wrongDecimal)));
assert.ok(Number.isNaN(parseNumber('1 000')));
assert.ok(Number.isNaN(parseNumber('')));
assert.ok(Number.isNaN(parseNumber(Infinity)));

// Formatting must never leak a negative zero into ANOVA/correlation/path output.
assert.equal(formatNumber(-0,3),sep===','?'0,000':'0.000');
assert.equal(formatNumber(-0.0004,3),sep===','?'0,000':'0.000');
assert.equal(formatNumber(-0.0006,3),sep===','?'-0,001':'-0.001');
assert.equal(formatNumber(Infinity,3),'∞');
assert.equal(formatNumber(NaN,3),'—');
assert.equal(formatNumber(1.25,-1),sep===','?'1,250':'1.250');
console.log('Dataset column naming and numeric input/output boundaries verified.');
