// Loaded only when the user exports a report.
import ExcelJS from 'exceljs';
import {datasetExcelFilename} from './export-filename.js';
import {excelRichText} from './excel-rich-text.js';
import { getDecimalSeparator } from './number-format.js';
import {tableLayout} from './table-layout.js';
import {observationFormulaPlan,oneWayAnovaFormulaPlan,excelRef} from './xlsx-formulas.js';

const textOf = element => element.textContent.replace(/\s+/g, ' ').trim();
const border = {style:'thin', color:{argb:'FFB7B7B7'}};

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
    cell.value=text;
    cell.font={name:'Calibri',size:11,bold};
    cell.alignment={vertical:'middle',wrapText:true};
    sheet.getRow(rowNumber).height=Math.max(26,18*Math.ceil(text.length/(40+18*(width-1))));
    rowNumber++;
  }
  let observationContext=null,lastAnovaContext=null;
  const sourceNumber=cell=>{
    const raw=cell?.hasAttribute?.('data-number')?cell.dataset.number:cell?.querySelector?.('[data-number]')?.dataset.number;
    const value=raw===undefined?parseNumber(textOf(cell)):Number(raw);
    return Number.isFinite(value)?value:NaN;
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
      const wanted=explicit.get(item.label.toLocaleLowerCase('id-ID'));
      const error=wanted?rows.find(candidate=>candidate.label===wanted):errors.length===1?errors[0]:null;
      if(!error)continue;
      setFormula(item.row,5,`IFERROR(${excelRef(item.row,4,false)}/${excelRef(error.row,4)},"")`,item.f);
      setFormula(item.row,6,`IFERROR(F.INV.RT(0.05,${excelRef(item.row,2,false)},${excelRef(error.row,2)}),"")`,item.f05);
      setFormula(item.row,7,`IFERROR(F.INV.RT(0.01,${excelRef(item.row,2,false)},${excelRef(error.row,2)}),"")`,item.f01);
      if(item.tr.cells.length>=8)setFormula(item.row,8,`IF(${excelRef(item.row,5,false)}>${excelRef(item.row,7,false)},"**",IF(${excelRef(item.row,5,false)}>${excelRef(item.row,6,false)},"*","tn"))`,item.mark);
    }
  }
  function applyTableFormulas(table,start){
    if(!formulaMode)return;
    if(table.classList.contains('observation-table')){
      const headRows=table.tHead?.rows.length||0,body=[...(table.tBodies?.[0]?.rows||[])],repCount=table.tHead?.rows?.[1]?.cells.length||0;
      if(body.length&&repCount){
        const dataStartRow=start+headRows,dataEndRow=dataStartRow+body.length-1,repStartCol=2,repEndCol=1+repCount,totalCol=repEndCol+1,meanCol=totalCol+1,footerRow=dataEndRow+(table.tFoot?.rows.length?1:0);
        const counts=body.map(row=>[...row.cells].slice(1,1+repCount).filter(cell=>Number.isFinite(sourceNumber(cell))).length);
        observationContext={dataStartRow,dataEndRow,repStartCol,repEndCol,totalCol,meanCol,footerRow,equalN:counts.length>0&&counts.every(n=>n===counts[0]),n:counts[0]||0};
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
      applyScientificAnovaFormulas(table,start);
      return;
    }
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
    if(sourceTable)applyTableFormulas(sourceTable,start);
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
  const book=createReportWorkbook(scope,null,'Hasil analisis',options);
  await addChartImages(book,book.worksheets[0],scope);
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

export function createCombinedWorkbook(scopes,options={}){
  const book=new ExcelJS.Workbook(),used=new Set();
  scopes.forEach((scope,index)=>{
    const base=String(scope.dataset.parameter||scope.querySelector('h3')?.textContent||`Parameter ${index+1}`).replace(/[\\/*?:\[\]]/g,'-').replace(/^'+|'+$/g,'').slice(0,31)||`Parameter ${index+1}`;
    let name=base,n=2;while(used.has(name.toLowerCase())){const suffix=` (${n++})`;name=base.slice(0,31-suffix.length)+suffix;}used.add(name.toLowerCase());
    createReportWorkbook(scope,book,name,options);
  });
  return book;
}
export async function downloadAllReportsXlsx(scope,options={}){
  const sections=[...scope.querySelectorAll('[data-export-scope]')];
  if(!sections.length)throw Error('Belum ada hasil untuk diekspor.');
  sections.forEach(section=>section.dataset.decimalSeparator=scope.dataset.decimalSeparator||getDecimalSeparator());
  const book=createCombinedWorkbook(sections,options);
  for(let i=0;i<sections.length;i++)await addChartImages(book,book.worksheets[i],sections[i]);
  const buffer=await book.xlsx.writeBuffer(),url=URL.createObjectURL(new Blob([buffer],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));
  const a=document.createElement('a');a.href=url;a.download=datasetExcelFilename((scope.dataset.datasetName||sections[0]?.dataset.datasetName)+(options.formulas?'-formula':''));a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);
}
