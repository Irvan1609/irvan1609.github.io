import assert from 'node:assert/strict';
import fs from 'node:fs';
import {excelColumn,excelRef,observationFormulaPlan,oneWayAnovaFormulaPlan,factorialAnovaFormulaPlan,transformationExcelFormula,descriptiveFormulaPlan} from '../src/xlsx-formulas.js';

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

const factorialRaw={sheetName:'all data',startRow:2,endRow:28,aLevels:['B0','B1','B2'],bLevels:['M0','M1','M2'],reps:['1','2','3']};
const frak=factorialAnovaFormulaPlan('frak',{
  kelompok:25,perlakuan:26,'faktor a':27,'faktor b':28,'interaksi (a × b)':29,acak:30,total:31
},factorialRaw);
assert.ok(formula(frak,25,3).includes("SUMIFS('all data'!$G$2:$G$28,'all data'!$D$2:$D$28,\"1\")^2"));
assert.ok(formula(frak,26,3).includes("COUNTIFS('all data'!$B$2:$B$28,\"B0\",'all data'!$C$2:$C$28,\"M0\")"));
assert.ok(formula(frak,27,3).includes("SUMIFS('all data'!$G$2:$G$28,'all data'!$B$2:$B$28,\"B0\")^2"));
assert.equal(formula(frak,29,3),'C26-C27-C28');
assert.equal(formula(frak,30,3),'C31-C25-C26');
assert.ok(formula(frak,31,3).startsWith("SUMSQ('all data'!$G$2:$G$28)-"));

const fral=factorialAnovaFormulaPlan('fral',{
  perlakuan:20,'faktor a':21,'faktor b':22,'interaksi (a × b)':23,acak:24,total:25
},factorialRaw);
assert.equal(formula(fral,24,3),'C25-C20');
console.log('Factorial formula export references raw all data and reconstructs JK components.');


assert.equal(formula(frak,27,2),'3-1');
assert.equal(formula(frak,28,2),'3-1');
assert.equal(formula(frak,29,2),'(3-1)*(3-1)');
assert.equal(formula(frak,30,2),"COUNT('all data'!$G$2:$G$28)-3*3-(3-1)");

const split=factorialAnovaFormulaPlan('split',{
  kelompok:30,'faktor a':31,'galat (a)':32,'faktor b':33,'a × b':34,'galat (b)':35,total:36
},factorialRaw);
assert.equal(formula(split,30,2),'3-1');
assert.equal(formula(split,31,2),'3-1');
assert.equal(formula(split,32,2),'(3-1)*(3-1)');
assert.equal(formula(split,33,2),'3-1');
assert.equal(formula(split,34,2),'(3-1)*(3-1)');
assert.equal(formula(split,35,2),'3*(3-1)*(3-1)');
assert.ok(formula(split,32,3).includes("COUNTIFS('all data'!$D$2:$D$28"));
assert.equal(formula(split,35,3),'C36-C30-C31-C32-C33-C34');
console.log('Split-plot formula export reconstructs db, JK Galat (a), and JK Galat (b) from raw data.');


assert.equal(transformationExcelFormula('none','E2'),'=E2');
assert.equal(transformationExcelFormula('sqrt','E2'),'=IFERROR(SQRT(E2),"")');
assert.equal(transformationExcelFormula('sqrt05','E2'),'=IFERROR(SQRT(E2+0.5),"")');
assert.equal(transformationExcelFormula('log10','E2'),'=IFERROR(LOG10(E2),"")');
assert.equal(transformationExcelFormula('ln','E2'),'=IFERROR(LN(E2),"")');
assert.equal(transformationExcelFormula('asinprop','E2'),'=IFERROR(ASIN(SQRT(E2)),"")');
assert.equal(transformationExcelFormula('asinpercent','E2'),'=IFERROR(ASIN(SQRT(E2/100)),"")');
assert.match(transformationExcelFormula('boxcox','E2',.5),/E2\^0\.5/);
assert.equal(transformationExcelFormula('boxcox','E2',0),'=IFERROR(LN(E2),"")');

const descriptive=descriptiveFormulaPlan({row:2,startRow:2,endRow:28,valueCol:7,aCol:2,bCol:3,repCol:4,multi:true,sheetName:'all data'});
assert.equal(formula(descriptive,2,3),"COUNT('all data'!$G$2:$G$28)");
assert.equal(formula(descriptive,2,5),"AVERAGE('all data'!$G$2:$G$28)");
assert.equal(formula(descriptive,2,9),"IFERROR(STDEV.S('all data'!$G$2:$G$28),\"\")");
assert.equal(formula(descriptive,2,10),"IFERROR(STDEV.S('all data'!$G$2:$G$28)/ABS(AVERAGE('all data'!$G$2:$G$28))*100,\"\")");
assert.equal(formula(descriptive,2,11),"SUMSQ('all data'!$G$2:$G$28)");
assert.equal(formula(descriptive,2,12),"SUMPRODUCT(1/COUNTIF('all data'!$B$2:$B$28,'all data'!$B$2:$B$28))");
assert.equal(formula(descriptive,2,13),"SUMPRODUCT(1/COUNTIF('all data'!$C$2:$C$28,'all data'!$C$2:$C$28))");
assert.equal(formula(descriptive,2,14),"SUMPRODUCT(1/COUNTIF('all data'!$D$2:$D$28,'all data'!$D$2:$D$28))");

const xlsxExport=fs.readFileSync(new URL('../src/xlsx-export.js',import.meta.url),'utf8');
for(const marker of ['Formula Ringkas','Daftar Formula','addFormulaIndexWorksheet','Nilai Asli','Nilai Analisis','transformationExcelFormula','applyContrastCalculationFormulas','applyContrastDetailFormulas','T.INV.2T','F.DIST.RT','safeSheetNameFromParameter']){
  assert.ok(xlsxExport.includes(marker),`xlsx-export missing enriched formula marker: ${marker}`);
}
console.log('Formula export enriched with transform formulas, descriptive sheet, formula index, BNT critical formula, and planned-contrast formulas.');
