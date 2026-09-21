import assert from 'node:assert/strict';
import {excelColumn,excelRef,observationFormulaPlan,oneWayAnovaFormulaPlan} from '../src/xlsx-formulas.js';

assert.equal(excelColumn(1),'A');
assert.equal(excelColumn(26),'Z');
assert.equal(excelColumn(27),'AA');
assert.equal(excelRef(4,3),'$C$4');

const observation={dataStartRow:5,dataEndRow:7,repStartCol:2,repEndCol:4,totalCol:5,meanCol:6,footerRow:8};
const obsPlan=observationFormulaPlan(observation);
const formula=(plan,row,col)=>plan.find(item=>item.row===row&&item.col===col)?.formula;
assert.equal(formula(obsPlan,5,5),'SUM(B5:D5)');
assert.equal(formula(obsPlan,5,6),'AVERAGE(B5:D5)');
assert.equal(formula(obsPlan,8,2),'SUM(B5:B7)');
assert.equal(formula(obsPlan,8,5),'SUM(E5:E7)');
assert.equal(formula(obsPlan,8,6),'AVERAGE(B5:D7)');

const ral=oneWayAnovaFormulaPlan('ral',{perlakuan:12,galat:13,total:14},observation);
assert.equal(formula(ral,12,2),'ROWS($A$5:$A$7)-1');
assert.equal(formula(ral,12,3),'SUMPRODUCT($E$5:$E$7,$F$5:$F$7)-($E$8^2/COUNT($B$5:$D$7))');
assert.equal(formula(ral,13,3),'C14-C12');
assert.equal(formula(ral,12,5),'IFERROR(D12/$D$13,"")');
assert.equal(formula(ral,12,6),'IFERROR(F.INV.RT(0.05,B12,$B$13),"")');

const rak=oneWayAnovaFormulaPlan('rak',{kelompok:12,perlakuan:13,galat:14,total:15},observation);
assert.equal(formula(rak,12,2),'COLUMNS($B$5:$D$7)-1');
assert.equal(formula(rak,12,3),'SUMSQ($B$8:$D$8)/ROWS($A$5:$A$7)-($E$8^2/COUNT($B$5:$D$7))');
assert.equal(formula(rak,14,2),'B15-B13-B12');
assert.equal(formula(rak,13,7),'IFERROR(F.INV.RT(0.01,B13,$B$14),"")');

console.log('Excel formula export plan verified for observation tables and RAL/RAK ANOVA.');
