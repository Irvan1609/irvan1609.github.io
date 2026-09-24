import {parseNumber} from './number-format.js';
import {parseParameterHeader,parameterLongName} from './parameter-metadata.js';

const clean=value=>String(value??'').trim();

export function detectColumnType(values){
  const items=(values||[]).map(clean).filter(Boolean);
  if(!items.length)return {type:'kosong',label:'Kosong'};
  if(items.every(value=>Number.isFinite(parseNumber(value))))return {type:'numeric',label:'Numerik'};
  const dates=items.filter(value=>/^\d{4}-\d{1,2}-\d{1,2}$/.test(value)||/^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}$/.test(value));
  if(dates.length===items.length)return {type:'date',label:'Tanggal'};
  const unique=new Set(items).size,threshold=Math.min(12,Math.max(3,Math.ceil(items.length*.45)));
  if(unique<=threshold)return {type:'category',label:'Kategori'};
  return {type:'text',label:'Teks'};
}

export function normalizeCellRange(anchor,focus){
  if(!anchor||!focus)return null;
  return {
    r1:Math.min(anchor.r,focus.r),r2:Math.max(anchor.r,focus.r),
    c1:Math.min(anchor.c,focus.c),c2:Math.max(anchor.c,focus.c)
  };
}

export function rangeMatrix(rows,range){
  if(!range)return [];
  const out=[];
  for(let r=range.r1;r<=range.r2;r++){
    const row=[];
    for(let c=range.c1;c<=range.c2;c++)row.push(String(rows?.[r]?.[c]??''));
    out.push(row);
  }
  return out;
}

export function matrixTsv(matrix){
  return (matrix||[]).map(row=>row.map(value=>String(value??'')).join('\t')).join('\n');
}

export function columnTooltip(header,typeInfo,categoryMeta){
  const meta=parseParameterHeader(header),parts=[parameterLongName(header)];
  if(meta.code&&meta.name&&meta.code!==meta.name)parts.unshift(meta.code);
  if(typeInfo?.label)parts.push(`Tipe: ${typeInfo.label}`);
  const levels=Object.entries(categoryMeta?.levels||{}).filter(([,entry])=>clean(entry?.value));
  if(levels.length){
    const unit=clean(categoryMeta?.unit);
    parts.push(levels.slice(0,8).map(([code,entry])=>`${code} = ${clean(entry.value)}${unit?' '+unit:''}`).join('; ')+(levels.length>8?' …':''));
  }
  return parts.filter(Boolean).join('\n');
}

export function contextualAnalysisTitle(parameter,{plant='',treatment=''}={}){
  const name=parameterLongName(parameter),context=[clean(plant),clean(treatment)].filter(Boolean);
  return context.length?`Analisis ${name} — ${context.join(' — ')}`:`Analisis ${name}`;
}

export function safeSheetNameFromParameter(parameter,index=1){
  const meta=parseParameterHeader(parameter),base=(meta.code||meta.name||`Parameter ${index}`).replace(/[\\/*?:\[\]]/g,'-').replace(/^'+|'+$/g,'').trim();
  return (base||`Parameter ${index}`).slice(0,31);
}
