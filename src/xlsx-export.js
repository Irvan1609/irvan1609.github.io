// Loaded only when the user exports a report.
import ExcelJS from 'exceljs';
import {datasetExcelFilename} from './export-filename.js';
import {excelRichText} from './excel-rich-text.js';
import { getDecimalSeparator } from './number-format.js';
import {tableLayout} from './table-layout.js';
import {observationFormulaPlan,oneWayAnovaFormulaPlan,factorialAnovaFormulaPlan,excelRef,excelColumn,transformationExcelFormula,descriptiveFormulaPlan} from './xlsx-formulas.js';
import {safeSheetNameFromParameter} from './editor-features.js';

const textOf = element => element.textContent.replace(/\s+/g, ' ').trim();
const border = {style:'thin', color:{argb:'FFB7B7B7'}};

const rawKey=(a,b,rep)=>[a,b,rep].map(value=>String(value??'')).join('\u0000');
function rawNumber(cell,separator){
  const raw=cell?.hasAttribute?.('data-number')?cell.dataset.number:cell?.querySelector?.('[data-number]')?.dataset.number;
  if(raw!==undefined){const n=Number(raw);return Number.isFinite(n)?n:NaN;}
  const text=textOf(cell),normalized=separator===','?text.replace(',','.'):text;
  if(separator===','&&text.includes('.'))return NaN;
  return /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(normalized)?Number(normalized):NaN;
}
function observationMeta(table){
  const head=[...(table.tHead?.rows||[])];
  if(!head.length)return {repCount:0,repLabels:[]};
  if(head.length>1){
    return {repCount:head[1].cells.length,repLabels:[...head[1].cells].map(cell=>textOf(cell))};
  }
  const cells=[...head[0].cells],repCount=Math.max(0,cells.length-3);
  return {repCount,repLabels:cells.slice(1,1+repCount).map(cell=>textOf(cell).replace(/^(Ulangan|Kelompok)\s+/i,''))};
}
function prepareFormulaRawData(book,scopes){
  const sheet=book.addWorksheet('all data');
  sheet.columns=[{width:28},{width:20},{width:20},{width:18},{width:16},{width:24},{width:18},{width:18}];
  sheet.addRow(['Parameter','Faktor A / Perlakuan','Faktor B','Ulangan / Kelompok','Nilai Asli','Transformasi','Nilai Analisis','Nilai Analisis²']);
  const contexts=new Map();let nextRow=2;
  for(const scope of scopes){
    const analysisTable=scope.querySelector('.observation-table');
    if(!analysisTable)continue;
    const originalTable=scope.querySelector('.observation-before-table')||analysisTable;
    const separator=scope.dataset.decimalSeparator||getDecimalSeparator(),meta=observationMeta(analysisTable),originalMeta=observationMeta(originalTable);
    if(!meta.repCount)continue;
    const parameter=scope.dataset.parameter||scope.querySelector('h3')?.textContent||'Parameter';
    const transformType=scope.dataset.transformType||'none',lambdaRaw=Number(scope.dataset.transformLambda),lambda=Number.isFinite(lambdaRaw)?lambdaRaw:null;
    const rows=[...(analysisTable.tBodies?.[0]?.rows||[])],originalRows=[...(originalTable.tBodies?.[0]?.rows||[])];
    const originalByKey=new Map();
    for(const row of originalRows){
      if(/^Total$/i.test(textOf(row.cells[0])))continue;
      const marker=row.cells[0]?.querySelector?.('[data-factor-a]'),a=marker?.dataset.factorA??textOf(row.cells[0]),b=marker?.dataset.factorB??'';
      for(let i=0;i<originalMeta.repCount;i++){
        const rep=originalMeta.repLabels[i]||String(i+1),value=rawNumber(row.cells[i+1],separator);
        if(Number.isFinite(value))originalByKey.set(rawKey(a,b,rep),value);
      }
    }
    const context={sheetName:'all data',startRow:nextRow,endRow:nextRow-1,aLevels:[],bLevels:[],reps:[],cellRows:new Map(),valueCol:7,squareCol:8,originalCol:5,transformType,lambda};
    for(const row of rows){
      if(/^Total$/i.test(textOf(row.cells[0])))continue;
      const marker=row.cells[0]?.querySelector?.('[data-factor-a]'),a=marker?.dataset.factorA??textOf(row.cells[0]),b=marker?.dataset.factorB??'';
      if(!context.aLevels.includes(a))context.aLevels.push(a);
      if(b&&!context.bLevels.includes(b))context.bLevels.push(b);
      for(let i=0;i<meta.repCount;i++){
        const analyzed=rawNumber(row.cells[i+1],separator);
        if(!Number.isFinite(analyzed))continue;
        const rep=meta.repLabels[i]||String(i+1);
        if(!context.reps.includes(rep))context.reps.push(rep);
        const sourceKey=rawKey(a,b,rep),original=originalByKey.get(sourceKey);
        const rawRow=nextRow,sourceValue=Number.isFinite(original)?original:analyzed;
        const transformLabel=transformType==='none'?'Tanpa transformasi':scope.dataset.transformLabel||transformType;
        const added=sheet.addRow([parameter,a,b,rep,sourceValue,transformLabel,analyzed,analyzed*analyzed]);
        const transformation=transformationExcelFormula(transformType,`E${rawRow}`,lambda).replace(/^=/,'');
        added.getCell(7).value={formula:transformation,result:analyzed};
        added.getCell(8).value={formula:`G${rawRow}^2`,result:analyzed*analyzed};
        context.cellRows.set(sourceKey,rawRow);
        nextRow++;
      }
    }
    context.endRow=nextRow-1;
    if(context.endRow>=context.startRow)contexts.set(scope,context);
  }
  const header=sheet.getRow(1);
  header.font={name:'Calibri',size:11,bold:true};
  header.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFEAF0F7'}};
  header.alignment={horizontal:'center',vertical:'middle'};
  sheet.views=[{state:'frozen',ySplit:1}];
  if(nextRow===2)book.removeWorksheet(sheet.id);
  return contexts;
}

function normalizeFormulaHeader(value){
  return String(value??'').toLocaleLowerCase('id-ID').normalize('NFKD').replace(/[^a-z0-9]+/g,' ').trim();
}

function rawDatasetNumber(value,separator){
  if(typeof value==='number')return Number.isFinite(value)?value:null;
  const text=String(value??'').trim();
  if(!text)return null;
  if(/^[-+]?0\d+$/.test(text))return null;
  const normalized=separator===','?text.replace(',','.'):text;
  if(separator===','&&text.includes('.'))return null;
  if(!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(normalized))return null;
  const number=Number(normalized);
  return Number.isFinite(number)?number:null;
}

function addRawDatasetWorksheet(book,dataset,separator=getDecimalSeparator()){
  if(!dataset?.headers?.length||!Array.isArray(dataset.rows))return null;
  const existing=book.getWorksheet('Data Mentah');
  if(existing)book.removeWorksheet(existing.id);
  const sheet=book.addWorksheet('Data Mentah');
  const headers=dataset.headers.map(value=>String(value??''));
  sheet.addRow(headers);
  dataset.rows.forEach(source=>{
    const row=headers.map((_,i)=>{
      const raw=source?.[i]??'';
      const number=rawDatasetNumber(raw,separator);
      return number===null?String(raw??''):number;
    });
    sheet.addRow(row);
  });
  sheet.columns=headers.map(header=>({width:Math.max(14,Math.min(28,header.length+4))}));
  const header=sheet.getRow(1);
  header.font={bold:true};
  header.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFEAF0F7'}};
  header.alignment={horizontal:'center',vertical:'middle'};
  sheet.views=[{state:'frozen',ySplit:1}];
  if(headers.length)sheet.autoFilter={from:{row:1,column:1},to:{row:1,column:headers.length}};
  const headerMap=new Map();
  headers.forEach((header,index)=>headerMap.set(normalizeFormulaHeader(header),index+1));
  return {sheetName:'Data Mentah',startRow:2,endRow:Math.max(2,dataset.rows.length+1),headers,headerMap,rowCount:dataset.rows.length};
}

function formulaIndexCachedValue(value){
  if(value===null||value===undefined)return '';
  if(typeof value==='number'||typeof value==='string'||typeof value==='boolean')return value;
  if(value instanceof Date)return value.toISOString();
  if(Array.isArray(value?.richText))return value.richText.map(run=>run?.text??'').join('');
  return String(value);
}

function addFormulaIndexWorksheet(book){
  const rows=[];
  for(const source of book.worksheets){
    if(source.name==='Daftar Formula')continue;
    source.eachRow({includeEmpty:false},row=>{
      row.eachCell({includeEmpty:false},cell=>{
        const value=cell.value;
        if(!value||typeof value!=='object'||typeof value.formula!=='string')return;
        const isStored=/^N\("hasil algoritme"\)\+[-+]?\d/i.test(value.formula);
        rows.push([source.name,cell.address,`=${value.formula}`,formulaIndexCachedValue(value.result),isStored?'Hasil algoritme':'Dinamis']);
      });
    });
  }
  const existing=book.getWorksheet('Daftar Formula');
  if(existing)book.removeWorksheet(existing.id);
  if(!rows.length)return null;
  const sheet=book.addWorksheet('Daftar Formula');
  sheet.columns=[{width:28},{width:12},{width:72},{width:22},{width:18}];
  sheet.addRow(['Lembar','Sel','Formula Excel','Nilai tersimpan','Jenis']);
  rows.forEach(row=>sheet.addRow(row));
  const header=sheet.getRow(1);
  header.font={bold:true};
  header.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFEAF0F7'}};
  header.alignment={horizontal:'center',vertical:'middle'};
  sheet.views=[{state:'frozen',ySplit:1}];
  sheet.getColumn(3).alignment={wrapText:true,vertical:'top'};
  return sheet;
}

function addFormulaSummaryWorksheet(book,contexts){
  if(!contexts?.size)return null;
  const sheet=book.addWorksheet('Formula Ringkas');
  sheet.columns=[
    {width:28},{width:24},{width:10},{width:15},{width:15},{width:15},{width:15},
    {width:15},{width:15},{width:13},{width:16},{width:13},{width:13},{width:13}
  ];
  sheet.addRow(['Parameter','Transformasi','N','Total','Rataan','Minimum','Maksimum','Varians','SD','CV (%)','Σx²','Taraf A','Taraf B','Ulangan/Kelompok']);
  let row=2;
  for(const [scope,context] of contexts){
    const parameter=scope.dataset.parameter||scope.querySelector('h3')?.textContent||`Parameter ${row-1}`;
    const transform=context.transformType==='none'?'Tanpa transformasi':scope.dataset.transformLabel||context.transformType;
    sheet.addRow([parameter,transform]);
    for(const item of descriptiveFormulaPlan({row,startRow:context.startRow,endRow:context.endRow,valueCol:context.valueCol,aCol:2,bCol:3,repCol:4,multi:context.bLevels.length>0,sheetName:context.sheetName})){
      const cell=sheet.getCell(item.row,item.col),cached=cell.value;
      cell.value={formula:item.formula,...(cached!==null&&cached!==undefined?{result:cached}:{})};
    }
    if(!context.bLevels.length)sheet.getCell(row,13).value='—';
    row++;
  }
  const header=sheet.getRow(1);header.font={bold:true};header.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFEAF0F7'}};
  sheet.views=[{state:'frozen',ySplit:1}];
  for(let r=2;r<row;r++)for(let col=3;col<=14;col++)sheet.getCell(r,col).numFmt=col===3||col>=12?'0':'0.0000';
  return sheet;
}

export function createReportWorkbook(scope,book=null,sheetName='Hasil analisis',options={}) {
  const separator=scope.dataset.decimalSeparator||getDecimalSeparator();
  const parseNumber=text=>{
    const normalized=separator===','?text.replace(',','.'):text;
    if(separator===','&&text.includes('.'))return NaN;
    return /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(normalized)?Number(normalized):NaN;
  };
  book ||= new ExcelJS.Workbook();
  book.creator = 'Statistical Web';
  const formulaMode=options.formulas===true;
  if(formulaMode){book.calcProperties.fullCalcOnLoad=true;book.calcProperties.forceFullCalc=true;book.calcProperties.calcMode='auto';}
  const sheet = book.addWorksheet(sheetName, {
    pageSetup:{paperSize:9, orientation:'landscape', fitToPage:true, fitToWidth:1, fitToHeight:0}
  });
  const width = Math.max(4, ...[...scope.querySelectorAll('table')].map(table=>tableLayout([...table.rows].map(row=>[...row.cells])).width));
  sheet.columns = Array.from({length:width},(_,i)=>({width:i===0?44:18}));
  let rowNumber=1;
  function paragraph(text, bold=false) {
    if(!text)return;
    sheet.mergeCells(rowNumber,1,rowNumber,width);
    const cell=sheet.getCell(rowNumber,1);
    if(formulaMode&&/^KK\s*=/.test(text)&&lastAnovaContext?.errorRow&&observationContext&&scope.dataset.design!=='split'){
      const formula=`"KK = "&TEXT(SQRT(${excelRef(lastAnovaContext.errorRow,4)}/${excelRef(observationContext.footerRow,observationContext.meanCol)}*100,"0.00")&"%"`;
      cell.value={formula,result:text};
    }else cell.value=text;
    cell.font={name:'Calibri',size:11,bold};
    cell.alignment={vertical:'middle',wrapText:true};
    sheet.getRow(rowNumber).height=Math.max(26,18*Math.ceil(text.length/(40+18*(width-1))));
    rowNumber++;
  }
  let observationContext=null,lastAnovaContext=null,lastContrastContext=null;
  const sourceNumber=cell=>{
    const raw=cell?.hasAttribute?.('data-number')?cell.dataset.number:cell?.querySelector?.('[data-number]')?.dataset.number;
    const value=raw===undefined?parseNumber(textOf(cell)):Number(raw);
    return Number.isFinite(value)?value:NaN;
  };
  const sourceBaseNumber=cell=>{
    const direct=sourceNumber(cell);if(Number.isFinite(direct))return direct;
    if(!cell?.cloneNode)return NaN;
    const clone=cell.cloneNode(true);
    clone.querySelectorAll?.('sup,sub').forEach(node=>node.remove());
    return parseNumber(textOf(clone));
  };
  const setFormula=(row,col,formula,result)=>{
    const cell=sheet.getCell(row,col),cached=result!==undefined?result:cell.value;
    cell.value=(typeof cached==='number'&&Number.isFinite(cached))||typeof cached==='string'?{formula,result:cached}:{formula};
  };
  const applyPlan=plan=>plan.forEach(item=>setFormula(item.row,item.col,item.formula));
  function parseErrorMap(table){
    const map=new Map();let node=table.closest('.table-scroll')?.nextElementSibling,steps=0;
    while(node&&steps++<5){
      const text=textOf(node),at=text.indexOf('Pembanding:');
      if(at>=0){
        text.slice(at+'Pembanding:'.length).split(';').forEach(part=>{
          const arrow=part.indexOf('→');if(arrow<0)return;
          const left=part.slice(0,arrow).trim().replace(/[.:]+$/,''),right=part.slice(arrow+1).trim().replace(/[.:]+$/,'');
          if(left&&right)map.set(left.toLocaleLowerCase('id-ID'),right);
        });
        break;
      }
      node=node.nextElementSibling;
    }
    return map;
  }
  function applyScientificAnovaFormulas(table,start){
    const headRows=table.tHead?.rows.length||1,body=[...(table.tBodies?.[0]?.rows||[])];
    const rows=body.map((tr,i)=>({tr,row:start+headRows+i,label:textOf(tr.cells[0]),df:sourceNumber(tr.cells[1]),ss:sourceNumber(tr.cells[2]),ms:sourceNumber(tr.cells[3]),f:sourceNumber(tr.cells[4]),f05:sourceNumber(tr.cells[5]),f01:sourceNumber(tr.cells[6]),mark:textOf(tr.cells[7]||{textContent:''})}));
    rows.filter(item=>Number.isFinite(item.df)&&item.df>0&&Number.isFinite(item.ss)&&!/^Total$/i.test(item.label)).forEach(item=>setFormula(item.row,4,`IFERROR(${excelRef(item.row,3,false)}/${excelRef(item.row,2,false)},"")`,item.ms));
    const tested=rows.filter(item=>Number.isFinite(item.f));
    const errors=rows.filter(item=>!Number.isFinite(item.f)&&Number.isFinite(item.ms)&&item.df>0&&!/^Total$/i.test(item.label));
    const explicit=parseErrorMap(table);
    for(const item of tested){
      const labelKey=item.label.toLocaleLowerCase('id-ID');
      const wanted=explicit.get(labelKey)||(labelKey==='kelompok'?explicit.get('ulangan'):null);
      const error=wanted?rows.find(candidate=>candidate.label===wanted):errors.length===1?errors[0]:null;
      if(!error)continue;
      setFormula(item.row,5,`IFERROR(${excelRef(item.row,4,false)}/${excelRef(error.row,4)},"")`,item.f);
      setFormula(item.row,6,`IFERROR(F.INV.RT(0.05,${excelRef(item.row,2,false)},${excelRef(error.row,2)}),"")`,item.f05);
      setFormula(item.row,7,`IFERROR(F.INV.RT(0.01,${excelRef(item.row,2,false)},${excelRef(error.row,2)}),"")`,item.f01);
      if(item.tr.cells.length>=8)setFormula(item.row,8,`IF(${excelRef(item.row,5,false)}>${excelRef(item.row,7,false)},"**",IF(${excelRef(item.row,5,false)}>${excelRef(item.row,6,false)},"*","tn"))`,item.mark);
    }
    lastAnovaContext={errorRow:errors.length===1?errors[0].row:null,errorRows:new Map(errors.map(item=>[item.label.toLocaleLowerCase('id-ID'),item.row]))};
  }
  function applyPosthocFormulas(table,start){
    if(!options.rawContext||!lastAnovaContext)return;
    const headers=[...(table.tHead?.rows||[])].flatMap(row=>[...row.cells].map(textOf));
    if(!headers.some(x=>/^SD$/i.test(x))||!headers.some(x=>/^SE$/i.test(x)))return;
    const body=[...(table.tBodies?.[0]?.rows||[])];
    if(!body.length||body.some(row=>row.cells.length<5))return;
    const wrapper=table.closest('.table-scroll'),caption=textOf(wrapper?.previousElementSibling||{textContent:''});
    const lower=caption.toLocaleLowerCase('id-ID');
    const raw=options.rawContext,sheetName="'"+String(raw.sheetName||'all data').replace(/'/g,"''")+"'";
    const range=col=>`${sheetName}!${excelColumn(col)}${raw.startRow}:${excelColumn(col)}${raw.endRow}`;
    const aRange=range(2),bRange=range(3),yRange=range(raw.valueCol||7),sqRange=range(raw.squareCol||8);
    const quote=value=>'"'+String(value??'').replace(/"/g,'""')+'"';
    const simpleA=caption.match(/Faktor B pada A\s*=\s*([^—]+)/i)?.[1]?.trim()||null;
    const dimension=/faktor b/i.test(caption)?'b':'a';
    const errorName=scope.dataset.design==='split'?(dimension==='a'?'galat (a)':'galat (b)'):'galat';
    const errorRow=lastAnovaContext.errorRows?.get(errorName)||lastAnovaContext.errorRow;
    for(let i=0;i<body.length;i++){
      const source=body[i],row=start+(table.tHead?.rows.length||1)+i,label=textOf(source.cells[0]);
      const criteria=[];
      if(simpleA)criteria.push([aRange,simpleA]);
      criteria.push([dimension==='b'?bRange:aRange,label]);
      const args=criteria.flatMap(([r,v])=>[r,quote(v)]).join(',');
      const count=`COUNTIFS(${args})`,sum=`SUMIFS(${yRange},${args})`,sumSq=`SUMIFS(${sqRange},${args})`;
      if(!source.cells[1].querySelector('sup,sub'))setFormula(row,2,`IFERROR(${sum}/${count},"")`,sourceNumber(source.cells[1]));
      setFormula(row,3,`IFERROR(${count},"")`,sourceNumber(source.cells[2]));
      setFormula(row,4,`IFERROR(SQRT((${sumSq}-(${sum}^2/${count}))/(${count}-1)),"")`,sourceNumber(source.cells[3]));
      if(errorRow)setFormula(row,5,`IFERROR(SQRT(${excelRef(errorRow,4)}/${count}),"")`,sourceNumber(source.cells[4]));
    }
  }
  function reportAlpha(){
    const text=textOf(scope.querySelector('.analysis-lead')||{textContent:''}),match=text.match(/α\s*=\s*([0-9.,]+)/i);
    if(!match)return .05;
    const parsed=Number(match[1].replace(',','.'));
    return Number.isFinite(parsed)&&parsed>0&&parsed<1?parsed:.05;
  }
  function applyContrastCalculationFormulas(table,start){
    if(!observationContext||!lastAnovaContext?.errorRow)return;
    const headRows=table.tHead?.rows.length||1,body=[...(table.tBodies?.[0]?.rows||[])],labels=body.map(row=>textOf(row.cells[0]));
    const qIndex=labels.findIndex(label=>/^Q$/i.test(label)),jkIndex=labels.findIndex(label=>/^JK$/i.test(label)),fIndex=labels.findIndex(label=>/^F\.\s*Hitung$/i.test(label)),mean1Index=labels.findIndex(label=>/^Rata-rata 1$/i.test(label)),mean2Index=labels.findIndex(label=>/^Rata-rata 2$/i.test(label));
    if(qIndex<1||jkIndex<0||fIndex<0||mean1Index<0||mean2Index<0)return;
    const treatmentCount=qIndex,treatmentStart=start+headRows,treatmentEnd=treatmentStart+treatmentCount-1;
    const obsTotalRange=excelRef(observationContext.dataStartRow,observationContext.totalCol,false)+':'+excelRef(observationContext.dataEndRow,observationContext.totalCol,false);
    const obsMeanRange=excelRef(observationContext.dataStartRow,observationContext.meanCol,false)+':'+excelRef(observationContext.dataEndRow,observationContext.meanCol,false);
    for(let i=0;i<treatmentCount;i++)setFormula(treatmentStart+i,2,`=${excelRef(observationContext.dataStartRow+i,observationContext.totalCol,false)}`.replace(/^=/,''),sourceNumber(body[i].cells[1]));
    const contexts=[];
    const contrastCount=Math.max(0,(body[0]?.cells.length||2)-2);
    for(let j=0;j<contrastCount;j++){
      const col=3+j,coeffRange=excelRef(treatmentStart,col,false)+':'+excelRef(treatmentEnd,col,false),qRow=start+headRows+qIndex,jkRow=start+headRows+jkIndex,fRow=start+headRows+fIndex,m1Row=start+headRows+mean1Index,m2Row=start+headRows+mean2Index;
      setFormula(qRow,col,`SUMPRODUCT(${obsTotalRange},${coeffRange})`,sourceNumber(body[qIndex].cells[col-1]));
      if(observationContext.equalN&&observationContext.n>0)setFormula(jkRow,col,`IFERROR(${excelRef(qRow,col,false)}^2/(${observationContext.n}*SUMSQ(${coeffRange})),"")`,sourceNumber(body[jkIndex].cells[col-1]));
      setFormula(fRow,col,`IFERROR(${excelRef(jkRow,col,false)}/${excelRef(lastAnovaContext.errorRow,4)},"")`,sourceNumber(body[fIndex].cells[col-1]));
      const coeffs=body.slice(0,treatmentCount).map(row=>sourceNumber(row.cells[col-1])),first=coeffs.find(value=>Number.isFinite(value)&&value!==0),sign=first>=0?'>0':'<0',opposite=first>=0?'<0':'>0';
      setFormula(m1Row,col,`IFERROR(SUMPRODUCT(--(${coeffRange}${sign}),ABS(${coeffRange}),${obsMeanRange})/SUMPRODUCT(--(${coeffRange}${sign}),ABS(${coeffRange})),"")`,sourceNumber(body[mean1Index].cells[col-1]));
      setFormula(m2Row,col,`IFERROR(SUMPRODUCT(--(${coeffRange}${opposite}),ABS(${coeffRange}),${obsMeanRange})/SUMPRODUCT(--(${coeffRange}${opposite}),ABS(${coeffRange})),"")`,sourceNumber(body[mean2Index].cells[col-1]));
      contexts.push({col,coeffRange,qRow,jkRow,fRow,m1Row,m2Row});
    }
    lastContrastContext={contexts,treatmentStart,treatmentEnd,obsMeanRange,errorRow:lastAnovaContext.errorRow,n:observationContext.n,equalN:observationContext.equalN};
  }
  function applyContrastSummaryFormulas(table,start){
    if(!lastContrastContext)return;
    const headRows=table.tHead?.rows.length||1,body=[...(table.tBodies?.[0]?.rows||[])];
    body.forEach((source,i)=>{
      const ctx=lastContrastContext.contexts[i];if(!ctx)return;
      const row=start+headRows+i;
      setFormula(row,2,`TEXT(${excelRef(ctx.m1Row,ctx.col,false)},"0.00")&" vs "&TEXT(${excelRef(ctx.m2Row,ctx.col,false)},"0.00")`,textOf(source.cells[1]));
    });
  }
  function applyContrastDetailFormulas(table,start){
    if(!lastContrastContext)return false;
    const headers=[...(table.tHead?.rows||[])].flatMap(row=>[...row.cells].map(textOf));
    if(headers.length<6||!/estimasi/i.test(headers[1]||'')||!/^SE$/i.test(headers[2]||'')||!/^JK$/i.test(headers[3]||'')||!/^F$/i.test(headers[4]||'')||!/^p$/i.test(headers[5]||''))return false;
    const headRows=table.tHead?.rows.length||1,body=[...(table.tBodies?.[0]?.rows||[])];
    body.forEach((source,i)=>{
      const ctx=lastContrastContext.contexts[i];if(!ctx)return;
      const row=start+headRows+i,estimate=`SUMPRODUCT(${ctx.coeffRange},${lastContrastContext.obsMeanRange})`;
      setFormula(row,2,estimate,sourceNumber(source.cells[1]));
      if(lastContrastContext.equalN&&lastContrastContext.n>0)setFormula(row,3,`IFERROR(SQRT(${excelRef(lastContrastContext.errorRow,4)}*SUMSQ(${ctx.coeffRange})/${lastContrastContext.n}),"")`,sourceNumber(source.cells[2]));
      setFormula(row,4,`${excelRef(ctx.jkRow,ctx.col,false)}`,sourceNumber(source.cells[3]));
      setFormula(row,5,`${excelRef(ctx.fRow,ctx.col,false)}`,sourceNumber(source.cells[4]));
      setFormula(row,6,`IFERROR(F.DIST.RT(${excelRef(row,5,false)},1,${excelRef(lastContrastContext.errorRow,2)}),"")`,sourceNumber(source.cells[5]));
    });
    return true;
  }
  function applyCriticalValueFormulas(table,start){
    const headers=[...(table.tHead?.rows||[])].flatMap(row=>[...row.cells].map(textOf));
    if(headers.length<2||!/^Rentang$/i.test(headers[0]||'')||!/Nilai kritis t/i.test(headers[1]||'')||!lastAnovaContext?.errorRow)return false;
    const headRows=table.tHead?.rows.length||1,alpha=reportAlpha();
    [...(table.tBodies?.[0]?.rows||[])].forEach((source,i)=>{
      const row=start+headRows+i;
      setFormula(row,2,`IFERROR(T.INV.2T(${alpha},${excelRef(lastAnovaContext.errorRow,2)}),"")`,sourceNumber(source.cells[1]));
    });
    return true;
  }
  function rawColumnRange(col){
    const raw=options.rawDatasetContext;
    if(!raw||!col)return null;
    const name="'"+String(raw.sheetName).replace(/'/g,"''")+"'";
    return `${name}!${excelRef(raw.startRow,col,false)}:${excelRef(raw.endRow,col,false)}`;
  }
  function rawColumnFor(label){
    const raw=options.rawDatasetContext;
    if(!raw)return null;
    const normalized=normalizeFormulaHeader(label);
    if(raw.headerMap.has(normalized))return raw.headerMap.get(normalized);
    const synonyms=[
      ['genotipe','genotip genotype entry galur varietas perlakuan'],
      ['perlakuan','treatment perlakuan genotip genotype entry'],
      ['kelompok','ulangan blok block rep replication kelompok'],
      ['lokasi','location environment lingkungan lokasi'],
      ['lingkungan','environment location lokasi lingkungan']
    ];
    for(const [target,words] of synonyms){
      if(normalized.includes(target)){
        for(const word of words.split(' ')){
          const found=[...raw.headerMap.entries()].find(([key])=>key===word||key.includes(word));
          if(found)return found[1];
        }
      }
    }
    return null;
  }
  function inferResponseRawColumn(){
    const raw=options.rawDatasetContext;
    if(!raw)return null;
    const candidates=[
      scope.dataset.parameter,
      textOf(scope.querySelector('.analysis-lead')||{textContent:''}).match(/Parameter\s*:\s*([^;]+)/i)?.[1],
      textOf(scope.querySelector('h3')||{textContent:''}).split('—').pop()
    ].filter(Boolean);
    for(const value of candidates){
      const col=rawColumnFor(String(value).trim());
      if(col)return col;
    }
    return null;
  }
  function genericDescriptiveFormulas(table,start){
    const raw=options.rawDatasetContext;if(!raw)return false;
    const headers=[...(table.tHead?.rows?.[0]?.cells||[])].map(textOf),normalized=headers.map(normalizeFormulaHeader);
    if(!normalized.includes('variabel')||!normalized.some(x=>x==='mean'||x==='rataan')||!normalized.includes('sd'))return false;
    const idx=name=>normalized.findIndex(x=>x===name);
    const positions={
      n:idx('n'),mean:Math.max(idx('mean'),idx('rataan')),median:idx('median'),min:idx('min'),q1:idx('q1'),q3:idx('q3'),
      max:idx('max'),variance:Math.max(idx('varians'),idx('variance')),sd:idx('sd'),se:idx('se'),cv:normalized.findIndex(x=>x==='cv'||x==='cv'),skew:idx('skewness'),kurt:idx('kurtosis')
    };
    const headRows=table.tHead?.rows.length||1;
    [...(table.tBodies?.[0]?.rows||[])].forEach((source,i)=>{
      const col=rawColumnFor(textOf(source.cells[0]));if(!col)return;
      const range=rawColumnRange(col),row=start+headRows+i;
      const set=(p,formula)=>{if(p>=0)setFormula(row,p+1,formula,sourceNumber(source.cells[p]));};
      set(positions.n,`COUNT(${range})`);
      set(positions.mean,`IFERROR(AVERAGE(${range}),"")`);
      set(positions.median,`IFERROR(MEDIAN(${range}),"")`);
      set(positions.min,`IFERROR(MIN(${range}),"")`);
      set(positions.q1,`IFERROR(QUARTILE.INC(${range},1),"")`);
      set(positions.q3,`IFERROR(QUARTILE.INC(${range},3),"")`);
      set(positions.max,`IFERROR(MAX(${range}),"")`);
      set(positions.variance,`IFERROR(VAR.S(${range}),"")`);
      set(positions.sd,`IFERROR(STDEV.S(${range}),"")`);
      if(positions.se>=0&&positions.sd>=0&&positions.n>=0)set(positions.se,`IFERROR(${excelRef(row,positions.sd+1,false)}/SQRT(${excelRef(row,positions.n+1,false)}),"")`);
      if(positions.cv>=0&&positions.sd>=0&&positions.mean>=0)set(positions.cv,`IFERROR(${excelRef(row,positions.sd+1,false)}/ABS(${excelRef(row,positions.mean+1,false)})*100,"")`);
      set(positions.skew,`IFERROR(SKEW(${range}),"")`);
      set(positions.kurt,`IFERROR(KURT(${range}),"")`);
    });
    return true;
  }
  function genericCorrelationFormulas(table,start){
    const raw=options.rawDatasetContext;if(!raw)return false;
    const title=normalizeFormulaHeader(textOf(scope.querySelector('h3')||{textContent:''}));
    if(!title.includes('korelasi'))return false;
    const headRows=[...(table.tHead?.rows||[])];
    const variableHeader=[...headRows].reverse().find(row=>{
      const cells=[...row.cells],labels=cells.map(textOf);
      return labels.length>=3&&labels.slice(1).every(label=>rawColumnFor(label));
    });
    if(!variableHeader)return false;
    const headers=[...variableHeader.cells].map(textOf),cols=headers.slice(1).map(rawColumnFor);
    if(cols.some(col=>!col))return false;
    const body=[...(table.tBodies?.[0]?.rows||[])];
    if(body.length!==cols.length)return false;
    const spearman=title.includes('spearman'),headerRowIndex=headRows.indexOf(variableHeader);
    const tableHeadHeight=headRows.length;
    const completeCount=`SUMPRODUCT(${cols.map(col=>`--ISNUMBER(${rawColumnRange(col)})`).join(',')})`;
    if(headRows.length>=3&&/^n$/i.test(textOf(headRows[0].cells[0]||{textContent:''}))){
      const nCell=sheet.getCell(start,3);
      nCell.value={formula:completeCount,result:Number(textOf(headRows[0].cells[2]||{textContent:''}))||undefined};
      for(let h=1;h<Math.min(3,headRows.length);h++){
        const alpha=sourceBaseNumber(headRows[h].cells[0]);const cached=sourceBaseNumber(headRows[h].cells[2]);
        if(Number.isFinite(alpha)){
          const nRef=excelRef(start,3);
          setFormula(start+h,3,`IFERROR(LET(t,T.INV.2T(${alpha},${nRef}-2),t/SQRT(t^2+${nRef}-2)),"")`,cached);
        }
      }
    }
    body.forEach((source,i)=>{
      const rowCol=rawColumnFor(textOf(source.cells[0]));if(!rowCol)return;
      for(let j=0;j<cols.length;j++){
        if(j<i)continue;
        const x=rawColumnRange(rowCol),y=rawColumnRange(cols[j]),row=start+tableHeadHeight+i,col=j+2;
        let formula;
        if(i===j)formula='1';
        else if(spearman)formula=`LET(x,FILTER(${x},ISNUMBER(${x})*ISNUMBER(${y})),y,FILTER(${y},ISNUMBER(${x})*ISNUMBER(${y})),CORREL(MAP(x,LAMBDA(v,RANK.AVG(v,x))),MAP(y,LAMBDA(v,RANK.AVG(v,y)))))`;
        else formula=`IFERROR(CORREL(FILTER(${x},ISNUMBER(${x})*ISNUMBER(${y})),FILTER(${y},ISNUMBER(${x})*ISNUMBER(${y}))),"")`;
        setFormula(row,col,formula,sourceBaseNumber(source.cells[j+1]));
      }
    });
    return true;
  }
  function genericAnovaFormulas(table,start){
    const headers=[...(table.tHead?.rows?.[0]?.cells||[])].map(textOf),norm=headers.map(normalizeFormulaHeader);
    const db=norm.indexOf('db'),jk=norm.indexOf('jk'),kt=norm.indexOf('kt');
    const fIndex=norm.findIndex(x=>x==='f'||x==='f hitung'||x==='wald f');
    if(db<0||fIndex<0)return false;
    const headRows=table.tHead?.rows.length||1,body=[...(table.tBodies?.[0]?.rows||[])];
    if(kt>=0&&jk>=0){
      body.forEach((source,i)=>{
        const row=start+headRows+i,df=sourceNumber(source.cells[db]),ss=sourceNumber(source.cells[jk]);
        if(Number.isFinite(df)&&df>0&&Number.isFinite(ss)&&!/^total$/i.test(textOf(source.cells[0])))setFormula(row,kt+1,`IFERROR(${excelRef(row,jk+1,false)}/${excelRef(row,db+1,false)},"")`,sourceNumber(source.cells[kt]));
      });
    }
    const pIndex=norm.indexOf('p'),df2Index=norm.findIndex(x=>x.includes('db denominator'));
    if(pIndex>=0&&df2Index>=0){
      body.forEach((source,i)=>{
        const row=start+headRows+i,f=sourceNumber(source.cells[fIndex]),df1=sourceNumber(source.cells[db]),df2=sourceNumber(source.cells[df2Index]);
        if(Number.isFinite(f)&&Number.isFinite(df1)&&Number.isFinite(df2))setFormula(row,pIndex+1,`IFERROR(F.DIST.RT(${excelRef(row,fIndex+1,false)},${excelRef(row,db+1,false)},${excelRef(row,df2Index+1,false)}),"")`,sourceNumber(source.cells[pIndex]));
      });
      return true;
    }
    if(kt<0)return false;
    const items=body.map((source,i)=>({source,row:start+headRows+i,label:textOf(source.cells[0]),df:sourceNumber(source.cells[db]),ms:sourceNumber(source.cells[kt]),f:sourceNumber(source.cells[fIndex])}));
    const f05=norm.findIndex(x=>x.includes('f tabel 0 05')||x==='0 05'),f01=norm.findIndex(x=>x.includes('f tabel 0 01')||x==='0 01'),ket=norm.findIndex(x=>x==='ket');
    for(const item of items.filter(x=>Number.isFinite(x.f)&&Number.isFinite(x.ms))){
      const candidates=items.filter(x=>x!==item&&Number.isFinite(x.ms)&&x.ms!==0&&Number.isFinite(x.df)&&x.df>0);
      candidates.sort((a,b)=>Math.abs(item.ms/a.ms-item.f)-Math.abs(item.ms/b.ms-item.f));
      const error=candidates[0],diff=error?Math.abs(item.ms/error.ms-item.f):Infinity,tol=Math.max(1e-7,Math.abs(item.f)*1e-5);
      if(!error||diff>tol)continue;
      setFormula(item.row,fIndex+1,`IFERROR(${excelRef(item.row,kt+1,false)}/${excelRef(error.row,kt+1)},"")`,item.f);
      if(f05>=0)setFormula(item.row,f05+1,`IFERROR(F.INV.RT(0.05,${excelRef(item.row,db+1,false)},${excelRef(error.row,db+1)}),"")`,sourceNumber(item.source.cells[f05]));
      if(f01>=0)setFormula(item.row,f01+1,`IFERROR(F.INV.RT(0.01,${excelRef(item.row,db+1,false)},${excelRef(error.row,db+1)}),"")`,sourceNumber(item.source.cells[f01]));
      if(ket>=0&&f05>=0&&f01>=0)setFormula(item.row,ket+1,`IF(${excelRef(item.row,fIndex+1,false)}>${excelRef(item.row,f01+1,false)},"**",IF(${excelRef(item.row,fIndex+1,false)}>${excelRef(item.row,f05+1,false)},"*","tn"))`,textOf(item.source.cells[ket]));
    }
    return items.some(x=>Number.isFinite(x.f));
  }
  function genericGroupMeanFormulas(table,start){
    const raw=options.rawDatasetContext;if(!raw)return false;
    const headers=[...(table.tHead?.rows?.[0]?.cells||[])].map(textOf),norm=headers.map(normalizeFormulaHeader);
    if(headers.length<2||headers.length>3)return false;
    const groupCol=rawColumnFor(headers[0]),meanIndex=norm.findIndex(x=>x==='rataan'||x==='mean'),nIndex=norm.indexOf('n'),responseCol=inferResponseRawColumn();
    if(!groupCol||meanIndex<0||!responseCol)return false;
    const groupRange=rawColumnRange(groupCol),yRange=rawColumnRange(responseCol),headRows=table.tHead?.rows.length||1;
    [...(table.tBodies?.[0]?.rows||[])].forEach((source,i)=>{
      const label=textOf(source.cells[0]),row=start+headRows+i,quoted='"'+label.replace(/"/g,'""')+'"';
      setFormula(row,meanIndex+1,`IFERROR(AVERAGEIF(${groupRange},${quoted},${yRange}),"")`,sourceNumber(source.cells[meanIndex]));
      if(nIndex>=0)setFormula(row,nIndex+1,`COUNTIF(${groupRange},${quoted})`,sourceNumber(source.cells[nIndex]));
    });
    return true;
  }
  function formulaizeRemainingNumerics(table,start){
    if(!formulaMode||table.classList.contains('observation-before-table'))return;
    const layout=tableLayout([...table.rows].map(row=>[...row.cells]));
    for(const {source,row,col,rowSpan,colSpan} of layout.cells){
      if(source.tagName==='TH'||col===0||rowSpan>1||colSpan>1)continue;
      const number=sourceBaseNumber(source);if(!Number.isFinite(number))continue;
      const target=sheet.getCell(start+row,col+1),value=target.value;
      if(value&&typeof value==='object'&&typeof value.formula==='string')continue;
      setFormula(start+row,col+1,`N("hasil algoritme")+${Number(number).toPrecision(15)}`,number);
    }
  }

  function applyTableFormulas(table,start){
    if(!formulaMode)return;
    genericDescriptiveFormulas(table,start);
    genericCorrelationFormulas(table,start);
    genericGroupMeanFormulas(table,start);
    genericAnovaFormulas(table,start);
    if(table.classList.contains('observation-table')){
      const headRows=table.tHead?.rows.length||0,body=[...(table.tBodies?.[0]?.rows||[])],meta=observationMeta(table),repCount=meta.repCount;
      const totalIndex=body.findIndex(row=>/^Total$/i.test(textOf(row.cells[0]))),dataRows=body.filter((_,i)=>i!==totalIndex);
      if(dataRows.length&&repCount){
        const dataStartRow=start+headRows,dataEndRow=dataStartRow+dataRows.length-1,repStartCol=2,repEndCol=1+repCount,totalCol=repEndCol+1,meanCol=totalCol+1;
        const footerRow=table.tFoot?.rows.length?start+headRows+body.length:totalIndex>=0?start+headRows+totalIndex:dataEndRow+1;
        const counts=dataRows.map(row=>[...row.cells].slice(1,1+repCount).filter(cell=>Number.isFinite(sourceNumber(cell))).length);
        observationContext={dataStartRow,dataEndRow,repStartCol,repEndCol,totalCol,meanCol,footerRow,equalN:counts.length>0&&counts.every(n=>n===counts[0]),n:counts[0]||0};
        if(options.rawContext){
          dataRows.forEach((row,rowIndex)=>{
            const marker=row.cells[0]?.querySelector?.('[data-factor-a]'),a=marker?.dataset.factorA??textOf(row.cells[0]),b=marker?.dataset.factorB??'';
            for(let i=0;i<repCount;i++){
              const rawRow=options.rawContext.cellRows?.get(rawKey(a,b,meta.repLabels[i]||String(i+1)));
              if(rawRow)setFormula(dataStartRow+rowIndex,repStartCol+i,`='all data'!${excelColumn(options.rawContext.valueCol||7)}${rawRow}`,sourceNumber(row.cells[i+1]));
            }
          });
        }
        applyPlan(observationFormulaPlan(observationContext));
      }
      return;
    }
    if(table.classList.contains('anova-report-table')&&observationContext){
      const headRows=table.tHead?.rows.length||1,rowByLabel={};
      [...(table.tBodies?.[0]?.rows||[])].forEach((row,i)=>{rowByLabel[textOf(row.cells[0]).toLocaleLowerCase('id-ID')]=start+headRows+i;});
      const design=(rowByLabel.kelompok||rowByLabel.ulangan)?'rak':'ral';
      applyPlan(oneWayAnovaFormulaPlan(design,rowByLabel,observationContext));
      lastAnovaContext={errorRow:rowByLabel.galat};
      return;
    }
    if(table.classList.contains('anova-table')){
      const headRows=table.tHead?.rows.length||1,rowByLabel={};
      [...(table.tBodies?.[0]?.rows||[])].forEach((row,i)=>{rowByLabel[textOf(row.cells[0]).toLocaleLowerCase('id-ID')]=start+headRows+i;});
      if(observationContext&&['ral','rak'].includes(scope.dataset.design))applyPlan(oneWayAnovaFormulaPlan(scope.dataset.design,rowByLabel,observationContext));
      if(options.rawContext&&['fral','frak','split'].includes(scope.dataset.design))applyPlan(factorialAnovaFormulaPlan(scope.dataset.design,rowByLabel,options.rawContext));
      applyScientificAnovaFormulas(table,start);
      return;
    }
    if(table.classList.contains('contrast-calculation-table')){applyContrastCalculationFormulas(table,start);return;}
    if(table.classList.contains('contrast-summary-table')){applyContrastSummaryFormulas(table,start);return;}
    if(applyContrastDetailFormulas(table,start))return;
    if(applyCriticalValueFormulas(table,start))return;
    if(table.classList.contains('posthoc-table'))applyPosthocFormulas(table,start);
    if(table.classList.contains('report-bnj-table')&&observationContext?.equalN&&lastAnovaContext?.errorRow){
      const headRows=table.tHead?.rows.length||1,row=start+headRows,bodyRow=table.tBodies?.[0]?.rows?.[0];
      if(bodyRow&&bodyRow.cells.length>=3&&Number.isFinite(sourceNumber(bodyRow.cells[1]))&&Number.isFinite(sourceNumber(bodyRow.cells[2]))){
        setFormula(row,2,`IFERROR(SQRT(${excelRef(lastAnovaContext.errorRow,4)}/COUNT(${excelRef(observationContext.dataStartRow,observationContext.repStartCol,false)}:${excelRef(observationContext.dataStartRow,observationContext.repEndCol,false)})),"")`,sourceNumber(bodyRow.cells[1]));
        setFormula(row,3,`IFERROR(${excelRef(row,1,false)}*${excelRef(row,2,false)},"")`,sourceNumber(bodyRow.cells[2]));
      }
    }
  }
  function addTable(rows,sourceTable=null) {
    const layout=tableLayout(rows),start=rowNumber;
    for(const {source,row,col:index,rowSpan,colSpan} of layout.cells){
        rowNumber=start+row;
        if(rowSpan>1||colSpan>1)sheet.mergeCells(rowNumber,index+1,rowNumber+rowSpan-1,index+colSpan);
        const cell=sheet.getCell(rowNumber,index+1);
        const header=source.tagName==='TH';
        const sup=source.querySelector('sup,sub');
        const text=textOf(source);
        cell.font={name:'Calibri',size:11,bold:header};
        cell.alignment={horizontal:header?'center':index===0?'left':'right',vertical:'middle',wrapText:true};
        cell.border={top:border,left:border,bottom:border,right:border};
        if(header)cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFEAF0F7'}};
        if(sup){
          cell.value=excelRichText(source);
        }else{
          const number=parseNumber(text);
          // Treatment names and column headings are always literal text, including numeric IDs.
          const precise=source.hasAttribute('data-number')?Number(source.dataset.number):number;
          cell.value=!header&&index>0&&text!==''&&Number.isFinite(precise)?precise:text;
          if(typeof cell.value==='number'){
            const decimals=text.match(/[.,](\d+)/)?.[1].length||0;
            cell.numFmt=decimals?'0.'+'0'.repeat(decimals):'0';
          }
        }
    }
    if(sourceTable){
      applyTableFormulas(sourceTable,start);
      formulaizeRemainingNumerics(sourceTable,start);
    }else if(formulaMode){
      const layoutFallback=tableLayout(rows);
      for(const {source,row,col,rowSpan,colSpan} of layoutFallback.cells){
        if(source.tagName==='TH'||col===0||rowSpan>1||colSpan>1)continue;
        const number=sourceBaseNumber(source);if(!Number.isFinite(number))continue;
        const target=sheet.getCell(start+row,col+1),value=target.value;
        if(value&&typeof value==='object'&&typeof value.formula==='string')continue;
        setFormula(start+row,col+1,`N("hasil algoritme")+${Number(number).toPrecision(15)}`,number);
      }
    }
    rows.forEach((cells,i)=>{sheet.getRow(start+i).height=Math.max(24,18*Math.max(1,...cells.map((cell,j)=>Math.ceil(textOf(cell).length/((j===0?42:16)*Math.max(1,cell.colSpan||1))))));});
    rowNumber=start+layout.height+1;
  }
  const clone=scope.cloneNode(true);
  clone.querySelectorAll('.result-actions,button,input,select,textarea,[hidden]').forEach(el=>el.remove());
  const selector='h3,h4,.analysis-lead,.table-caption,.figure-caption,.analysis-note,table,.mean-chart';
  for(const element of clone.querySelectorAll(selector)){
    if(element.parentElement?.closest('table,.mean-chart'))continue;
    if(element.tagName==='TABLE')addTable([...element.rows].map(row=>[...row.cells]),element);
    else if(element.classList.contains('mean-chart')){
      const rows=[...element.querySelectorAll('.mean-chart-row')].map(row=>{
        return ['.mean-chart-label','.mean-chart-value'].map(selector=>{
          const td=clone.ownerDocument.createElement('td');td.textContent=row.querySelector(selector)?.textContent||'';return td;
        });
      });
      addTable(rows);
    }else paragraph(textOf(element),/^H[34]$/.test(element.tagName)||element.classList.contains('table-caption'));
  }
  if(rowNumber===1)throw new Error('Belum ada hasil analisis untuk diekspor.');
  sheet.pageSetup.printArea=`A1:${sheet.getColumn(width).letter}${rowNumber-1}`;
  return book;
}

export async function downloadReportXlsx(scope,filename,options={}) {
  // Capture the visible report synchronously, before asynchronous workbook serialization.
  let book,reportSheet;
  if(options.formulas){
    book=new ExcelJS.Workbook();
    const rawDatasetContext=addRawDatasetWorksheet(book,options.rawDataset,scope.dataset.decimalSeparator||getDecimalSeparator());
    const contexts=prepareFormulaRawData(book,[scope]);
    addFormulaSummaryWorksheet(book,contexts);
    createReportWorkbook(scope,book,'Hasil analisis',{...options,rawContext:contexts.get(scope),rawDatasetContext});
    reportSheet=book.getWorksheet('Hasil analisis');
  }else{
    book=createReportWorkbook(scope,null,'Hasil analisis',options);
    reportSheet=book.getWorksheet('Hasil analisis');
  }
  await addChartImages(book,reportSheet,scope);
  if(options.formulas)addFormulaIndexWorksheet(book);
  const buffer=await book.xlsx.writeBuffer();
  const blob=new Blob([buffer],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
  const url=URL.createObjectURL(blob);
  const link=document.createElement('a');
  link.href=url;
  link.download=datasetExcelFilename((scope.dataset.datasetName||filename)+(options.formulas?'-formula':''));
  document.body.appendChild(link);
  try{link.click();}finally{link.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);}
}

async function addChartImages(book,sheet,scope){
  let row=sheet.rowCount+2;
  for(const svg of scope.querySelectorAll('.scientific-chart svg')){
    const rect=svg.getAttribute('viewBox').split(/\s+/).map(Number),scale=Math.min(1,1100/rect[2]);
    const canvas=document.createElement('canvas');canvas.width=Math.ceil(rect[2]*scale);canvas.height=Math.ceil(rect[3]*scale);
    const url=URL.createObjectURL(new Blob([svg.outerHTML],{type:'image/svg+xml'}));
    try{
      const image=new Image();await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=()=>reject(Error('Grafik tidak dapat disisipkan ke Excel.'));image.src=url;});
      canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);
      const id=book.addImage({base64:canvas.toDataURL('image/png'),extension:'png'});
      sheet.addImage(id,{tl:{col:0,row},ext:{width:canvas.width,height:canvas.height}});
      row+=Math.ceil(canvas.height/20)+2;
    }finally{URL.revokeObjectURL(url);}
  }
  if(row>sheet.rowCount+2)sheet.pageSetup.printArea=`A1:${sheet.getColumn(sheet.columnCount).letter}${row}`;
}

export function createCombinedWorkbook(scopes,options={},book=null){
  book ||= new ExcelJS.Workbook();
  const rawDatasetContext=options.formulas?addRawDatasetWorksheet(book,options.rawDataset,scopes[0]?.dataset.decimalSeparator||getDecimalSeparator()):null;
  const contexts=options.formulas?prepareFormulaRawData(book,scopes):new Map();
  if(options.formulas)addFormulaSummaryWorksheet(book,contexts);
  const used=new Set(book.worksheets.map(sheet=>sheet.name.toLowerCase()));
  scopes.forEach((scope,index)=>{
    const base=safeSheetNameFromParameter(scope.dataset.parameter||scope.querySelector('h3')?.textContent||`Parameter ${index+1}`,index+1);
    let name=base,n=2;while(used.has(name.toLowerCase())){const suffix=` (${n++})`;name=base.slice(0,31-suffix.length)+suffix;}used.add(name.toLowerCase());
    createReportWorkbook(scope,book,name,{...options,rawContext:contexts.get(scope),rawDatasetContext});
  });
  return book;
}
export async function downloadAllReportsXlsx(scope,options={}){
  const sections=[...scope.querySelectorAll('[data-export-scope]')];
  if(!sections.length)throw Error('Belum ada hasil untuk diekspor.');
  sections.forEach(section=>section.dataset.decimalSeparator=scope.dataset.decimalSeparator||getDecimalSeparator());
  const book=createCombinedWorkbook(sections,options);
  addSummaryWorksheet(book,scope);
  const reportSheets=book.worksheets.filter(sheet=>!['all data','Formula Ringkas','Ringkasan'].includes(sheet.name));
  for(let i=0;i<sections.length;i++)await addChartImages(book,reportSheets[i],sections[i]);
  if(options.formulas)addFormulaIndexWorksheet(book);
  const buffer=await book.xlsx.writeBuffer(),url=URL.createObjectURL(new Blob([buffer],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));
  const a=document.createElement('a');a.href=url;a.download=datasetExcelFilename((scope.dataset.datasetName||sections[0]?.dataset.datasetName)+(options.formulas?'-formula':''));a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);
}

function addSummaryWorksheet(book,root){
  const table=root.querySelector('[data-analysis-summary] table');
  if(!table)return;
  const sheet=book.addWorksheet('Ringkasan');
  for(const row of table.rows){
    const values=[...row.cells].map((cell,index)=>{
      const raw=cell.hasAttribute?.('data-number')?Number(cell.dataset.number):NaN;
      return index>0&&Number.isFinite(raw)?raw:textOf(cell);
    });
    sheet.addRow(values);
  }
  sheet.columns=[{width:30},{width:10},{width:14},{width:12},{width:14},{width:34},{width:20}];
  sheet.getRow(1).font={bold:true};sheet.getRow(1).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFEAF0F7'}};
  sheet.views=[{state:'frozen',ySplit:1}];
}
