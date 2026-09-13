// Loaded only when the user exports a report.
import ExcelJS from 'exceljs';
import { getDecimalSeparator } from './number-format.js';

const textOf = element => element.textContent.replace(/\s+/g, ' ').trim();
const border = {style:'thin', color:{argb:'FFB7B7B7'}};

export function createReportWorkbook(scope,book=null,sheetName='Hasil analisis') {
  const separator=scope.dataset.decimalSeparator||getDecimalSeparator();
  const parseNumber=text=>{
    const normalized=separator===','?text.replace(',','.'):text;
    if(separator===','&&text.includes('.'))return NaN;
    return /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(normalized)?Number(normalized):NaN;
  };
  book ||= new ExcelJS.Workbook();
  book.creator = 'Statistical Web';
  const sheet = book.addWorksheet(sheetName, {
    pageSetup:{paperSize:9, orientation:'landscape', fitToPage:true, fitToWidth:1, fitToHeight:0}
  });
  const width = Math.max(4, ...[...scope.querySelectorAll('table tr')].map(row=>row.cells.length));
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
  function addTable(rows) {
    for(const cells of rows){
      cells.forEach((source,index)=>{
        const cell=sheet.getCell(rowNumber,index+1);
        const header=source.tagName==='TH';
        const sup=source.querySelector('sup');
        const text=textOf(source);
        cell.font={name:'Calibri',size:11,bold:header};
        cell.alignment={horizontal:index===0?'left':'right',vertical:'middle',wrapText:true};
        cell.border={top:border,left:border,bottom:border,right:border};
        if(header)cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFEAF0F7'}};
        if(sup){
          const base=source.cloneNode(true);base.querySelectorAll('sup').forEach(el=>el.remove());
          cell.value={richText:[
            {text:textOf(base),font:{name:'Calibri',size:11}},
            {text:textOf(sup),font:{name:'Calibri',size:11,vertAlign:'superscript'}}
          ]};
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
      });
      sheet.getRow(rowNumber).height=Math.max(24,18*Math.max(...cells.map((cell,i)=>Math.ceil(textOf(cell).length/(i===0?42:16)))));
      rowNumber++;
    }
    rowNumber++;
  }
  const clone=scope.cloneNode(true);
  clone.querySelectorAll('.result-actions,button,input,select,textarea,[hidden]').forEach(el=>el.remove());
  const selector='h3,h4,.analysis-lead,.table-caption,.figure-caption,.analysis-note,table,.mean-chart';
  for(const element of clone.querySelectorAll(selector)){
    if(element.parentElement?.closest('table,.mean-chart'))continue;
    if(element.tagName==='TABLE')addTable([...element.rows].map(row=>[...row.cells]));
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

export async function downloadReportXlsx(scope,filename) {
  // Capture the visible report synchronously, before asynchronous workbook serialization.
  const book=createReportWorkbook(scope);
  await addChartImages(book,book.worksheets[0],scope);
  const buffer=await book.xlsx.writeBuffer();
  const blob=new Blob([buffer],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
  const url=URL.createObjectURL(blob);
  const link=document.createElement('a');
  link.href=url;
  link.download=(String(filename||'hasil-analisis').replace(/[^a-z0-9._-]+/gi,'-').replace(/^-+|-+$/g,'')||'hasil-analisis')+'.xlsx';
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

export function createCombinedWorkbook(scopes){
  const book=new ExcelJS.Workbook(),used=new Set();
  scopes.forEach((scope,index)=>{
    const base=String(scope.dataset.parameter||scope.querySelector('h3')?.textContent||`Parameter ${index+1}`).replace(/[\\/*?:\[\]]/g,'-').replace(/^'+|'+$/g,'').slice(0,31)||`Parameter ${index+1}`;
    let name=base,n=2;while(used.has(name.toLowerCase())){const suffix=` (${n++})`;name=base.slice(0,31-suffix.length)+suffix;}used.add(name.toLowerCase());
    createReportWorkbook(scope,book,name);
  });
  return book;
}
export async function downloadAllReportsXlsx(scope){
  const sections=[...scope.querySelectorAll('[data-export-scope]')];
  if(!sections.length)throw Error('Belum ada hasil untuk diekspor.');
  sections.forEach(section=>section.dataset.decimalSeparator=scope.dataset.decimalSeparator||getDecimalSeparator());
  const book=createCombinedWorkbook(sections);
  for(let i=0;i<sections.length;i++)await addChartImages(book,book.worksheets[i],sections[i]);
  const buffer=await book.xlsx.writeBuffer(),url=URL.createObjectURL(new Blob([buffer],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));
  const a=document.createElement('a');a.href=url;a.download='seluruh-hasil-analisis.xlsx';a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);
}
