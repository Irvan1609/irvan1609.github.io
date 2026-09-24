const FILES_KEY='statistical_web_csv_files_v1';
const ACTIVE_KEY='statistical_web_active_csv_v1';
const META_KEY='statistical_web_dataset_meta_v1';
const BASE_NAME='Hitung Cabai';
const HEADERS=['Sampel','JB | Jumlah Cabai (buah)'];

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
  const rows=parseCsv(text);
  return rows.length&&HEADERS.every((header,index)=>rows[0]?.[index]===header)&&rows[0].length===HEADERS.length;
}
function destinationName(files){
  const preferred=BASE_NAME+'.csv';
  if(!(preferred in files)||compatible(files[preferred]))return preferred;
  let n=2,name=`${BASE_NAME} (${n}).csv`;
  while(name in files&&!compatible(files[name]))name=`${BASE_NAME} (${++n}).csv`;
  return name;
}

export function upsertChiliCountToStatistics(storage,{sample,count}={}){
  const name=clean(sample),value=Number(count);
  if(!name)throw Error('Kode sampel belum diisi.');
  if(!Number.isFinite(value)||value<0||!Number.isInteger(value))throw Error('Jumlah cabai tidak valid.');

  const files=safeObject(storage.getItem(FILES_KEY)),target=destinationName(files);
  let rows=files[target]?parseCsv(files[target]):[HEADERS];
  if(!rows.length)rows=[HEADERS];
  const data=rows.slice(1).filter(row=>row.some(cell=>clean(cell)));
  const index=data.findIndex(row=>clean(row[0])===name);
  const next=[name,String(value)];
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
