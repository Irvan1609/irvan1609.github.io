const FILES_KEY='statistical_web_csv_files_v1';
const ACTIVE_KEY='statistical_web_active_csv_v1';
const META_KEY='statistical_web_dataset_meta_v1';
const BASE_NAME='Hitung Cabai';
const BASE_HEADERS=['Sampel','JB | Jumlah Cabai (buah)'];
const HEADERS=[
  ...BASE_HEADERS,'Status Validasi','Model AI','Subset','Quality Gate','Confidence Mean','FP','FN',
  'Area Rata-rata (mm²)','Lebar Rata-rata (mm)','Tinggi Rata-rata (mm)','Feret Rata-rata (mm)'
];

const clean=value=>String(value??'').trim();
const csvCell=value=>{
  const text=String(value??'');
  return /[",\r\n]/.test(text)?'"'+text.replace(/"/g,'""')+'"':text;
};
const csvText=rows=>rows.map(row=>row.map(csvCell).join(',')).join('\n');

function parseCsv(text){
  const rows=[];let row=[],cell='',quoted=false;
  for(let i=0;i<String(text||'').length;i++){
    const ch=text[i];
    if(quoted){
      if(ch==='"'&&text[i+1]==='"'){cell+='"';i++;}
      else if(ch==='"')quoted=false;
      else cell+=ch;
    }else if(ch==='"')quoted=true;
    else if(ch===','){row.push(cell);cell='';}
    else if(ch==='\n'){row.push(cell);rows.push(row);row=[];cell='';}
    else if(ch!=='\r')cell+=ch;
  }
  if(cell.length||row.length){row.push(cell);rows.push(row);}
  return rows;
}
function safeObject(text){
  try{const value=JSON.parse(text||'{}');return value&&typeof value==='object'?value:{};}catch{return {};}
}
function compatible(text){
  const rows=parseCsv(text),head=rows[0]||[];
  return BASE_HEADERS.every((header,index)=>head[index]===header);
}
function destinationName(files){
  const preferred=BASE_NAME+'.csv';
  if(!(preferred in files)||compatible(files[preferred]))return preferred;
  let n=2,name=BASE_NAME+' ('+n+').csv';
  while(name in files&&!compatible(files[name]))name=BASE_NAME+' ('+(++n)+').csv';
  return name;
}
function upgradeRows(rows){
  if(!rows.length)return [HEADERS];
  const oldHead=rows[0],indexByName=new Map(oldHead.map((h,i)=>[h,i]));
  const data=rows.slice(1).filter(row=>row.some(cell=>clean(cell))).map(row=>HEADERS.map((header,i)=>{
    const old=indexByName.get(header);
    if(Number.isInteger(old))return row[old]??'';
    if(i<2)return row[i]??'';
    return '';
  }));
  return [HEADERS,...data];
}
function num(value,digits=4){
  const n=Number(value);return Number.isFinite(n)?String(Math.round(n*10**digits)/10**digits):'';
}

export function upsertChiliCountToStatistics(storage,{sample,count,status='',modelVersion='',datasetSplit='',quality=null,confidence=null,correction=null,phenotype=null}={}){
  const name=clean(sample),value=Number(count);
  if(!name)throw Error('Kode sampel belum diisi.');
  if(!Number.isFinite(value)||value<0||!Number.isInteger(value))throw Error('Jumlah cabai tidak valid.');

  const files=safeObject(storage.getItem(FILES_KEY)),target=destinationName(files);
  let rows=upgradeRows(files[target]?parseCsv(files[target]):[HEADERS]);
  const data=rows.slice(1),index=data.findIndex(row=>clean(row[0])===name);
  const next=[
    name,String(value),clean(status),clean(modelVersion),clean(datasetSplit),num(quality,1),num(confidence,4),
    correction?.fp??'',correction?.fn??'',num(phenotype?.meanAreaMm2),num(phenotype?.meanWidthMm),num(phenotype?.meanHeightMm),num(phenotype?.meanFeretMm)
  ];
  let updated=false;
  if(index>=0){data[index]=next;updated=true;}else data.push(next);
  files[target]=csvText([HEADERS,...data]);

  const metadata=safeObject(storage.getItem(META_KEY));
  metadata[target]={...(metadata[target]||{}),plant:'Cabai',treatment:metadata[target]?.treatment||''};

  storage.setItem(FILES_KEY,JSON.stringify(files));
  storage.setItem(ACTIVE_KEY,target);
  storage.setItem(META_KEY,JSON.stringify(metadata));
  return {dataset:target.replace(/\.csv$/i,''),file:target,updated,rowCount:data.length,headers:[...HEADERS]};
}

export const chiliStatisticsHeaders=()=>[...HEADERS];
