import assert from 'node:assert/strict';
import {parseParameterHeader,buildParameterHeader,parameterLongName,parameterReportTitle,normalizeParameterUnit,detectParameterHeader} from '../src/parameter-metadata.js';
import {interpretReport} from '../src/report-insights.js';
import {renderBab4Table} from '../src/bab4-table.js';

assert.deepEqual(parseParameterHeader('TT | Tinggi Tanaman (cm)'),{
  raw:'TT | Tinggi Tanaman (cm)',code:'TT',name:'Tinggi Tanaman',unit:'cm'
});
assert.deepEqual(parseParameterHeader('Tinggi Tanaman (cm)'),{
  raw:'Tinggi Tanaman (cm)',code:'TT',name:'Tinggi Tanaman',unit:'cm'
});
assert.deepEqual(parseParameterHeader('tt'),{
  raw:'tt',code:'TT',name:'Tinggi Tanaman',unit:'cm'
});
assert.deepEqual(parseParameterHeader('tt_42HST'),{
  raw:'tt_42HST',code:'TT_42HST',name:'Tinggi Tanaman 42 HST',unit:'cm'
});
assert.equal(detectParameterHeader('tinggi tanaman')?.source,'builtin');
assert.deepEqual(parseParameterHeader('Perlakuan'),{
  raw:'Perlakuan',code:'Perlakuan',name:'',unit:''
});
assert.equal(buildParameterHeader({code:'TT',name:'Tinggi Tanaman',unit:'cm'}),'TT | Tinggi Tanaman (cm)');
assert.equal(buildParameterHeader({code:'PROD',name:'Produktivitas',unit:'t ha⁻¹'}),'PROD | Produktivitas (t ha⁻¹)');
assert.equal(buildParameterHeader({code:'DB',name:'Diameter Batang',unit:'(mm)'}),'DB | Diameter Batang (mm)');
assert.equal(buildParameterHeader({code:'Perlakuan'}),'Perlakuan');
assert.equal(normalizeParameterUnit('(cm)'),'cm');
assert.equal(parameterLongName('TT | Tinggi Tanaman (cm)'),'Tinggi Tanaman (cm)');
assert.equal(parameterReportTitle('TT | Tinggi Tanaman (cm)'),'TT — Tinggi Tanaman (cm)');

const report={
  name:'TT | Tinggi Tanaman (cm)',design:'ral',alpha:.05,posthoc:'none',N:6,grand:15,cv:5,
  factorLabels:{a:'Perlakuan',b:null},treatmentMeta:{factorLabels:{a:'Perlakuan',b:''},levels:{a:{},b:{}}},
  terms:[{label:'Perlakuan',p:.02,f:5,df:1,error:'Galat'}],
  comparisons:[{title:'Perlakuan',method:'none',items:[
    {label:'P0',mean:10,n:3,sd:1,se:.5,letters:[]},
    {label:'P1',mean:20,n:3,sd:1,se:.5,letters:[]}
  ]}],
  factorA:['P0','P1'],factorB:[''],cells:[
    {a:'P0',b:'',mean:10},{a:'P1',b:'',mean:20}
  ],notes:[],assumptions:[],residuals:[],fitted:[],wholeResiduals:[],replicates:['1','2','3'],contrasts:[]
};
const interpretation=interpretReport(report).join(' ');
assert.match(interpretation,/Tinggi Tanaman \(cm\)/);
assert.match(interpretation,/tinggi tanaman tertinggi yaitu 20[,.]00 cm/i);
assert.ok(!interpretation.includes('TT | Tinggi Tanaman'));
const bab4=renderBab4Table(report);
assert.match(bab4,/Rata-rata Tinggi Tanaman \(cm\)/);
assert.ok(!bab4.includes('TT | Tinggi Tanaman'));

console.log('Three-part parameter metadata verified: code, full name, unit, BAB IV title, and interpretation usage.');
