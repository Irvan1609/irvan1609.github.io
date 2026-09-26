const FILES_KEY='statistical_web_csv_files_v1';
const ACTIVE_KEY='statistical_web_active_csv_v1';
const META_KEY='statistical_web_dataset_meta_v1';
const BASE_NAME='Pengukur';
export const MEASUREMENT_HEADERS=[
  'Sampel','Mode | Jenis pengukuran','Nilai | Nilai utama','Unit',
  'Area | Area (mm²)','Perimeter | Keliling (mm)','Width | Lebar objek (mm)','Height | Tinggi objek (mm)',
  'Major | Major axis (mm)','Minor | Minor axis (mm)','Feret | Feret (mm)','MinFeret | MinFeret (mm)',
  'Circularity | Circularity','Solidity | Solidity','AspectRatio | Aspect ratio',
  'R | Mean R','G | Mean G','B | Mean B','H | Mean hue (°)','S | Mean saturation (%)','V | Mean value (%)',
  'Lstar | CIELAB L*','astar | CIELAB a*','bstar | CIELAB b*',
  'Quality | Skor kualitas','Reference | Nilai acuan','Eksperimen','Genotipe','Perlakuan','Ulangan','Panen','Foto'
];
const clean=v=>String(v??'').trim();
const csvCell=v=>{const s=String(v??'');return /[",\r\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s;};
const csvText=rows=>rows.map(r=>r.map(csvCell).join(',')).join('\n');
const safeObject=text=>{try{const v=JSON.parse(text||'{}');return v&&typeof v==='object'?v:{};}catch{return{};}};
function parseCsv(text){
  const rows=[];let row=[],cell='',quoted=false,s=String(text||'');
  for(let i=0;i<s.length;i++){const ch=s[i];if(quoted){if(ch==='"'&&s[i+1]==='"'){cell+='"';i++;}else if(ch==='"')quoted=false;else cell+=ch;}
    else if(ch==='"')quoted=true;else if(ch===','){row.push(cell);cell='';}else if(ch==='\n'){row.push(cell);rows.push(row);row=[];cell='';}else if(ch!=='\r')cell+=ch;}
  if(cell.length||row.length){row.push(cell);rows.push(row);}return rows;
}
const compatible=text=>{const rows=parseCsv(text);return rows.length&&MEASUREMENT_HEADERS.every((h,i)=>rows[0]?.[i]===h)&&rows[0].length===MEASUREMENT_HEADERS.length;};
function destinationName(files){
  const preferred=BASE_NAME+'.csv';if(!(preferred in files)||compatible(files[preferred]))return preferred;
  let n=2,name=`${BASE_NAME} (${n}).csv`;while(name in files&&!compatible(files[name]))name=`${BASE_NAME} (${++n}).csv`;return name;
}
const val=v=>Number.isFinite(Number(v))?String(Number(v)):'';
export function measurementsToStatistics(storage,records=[]){
  const rows=Array.isArray(records)?records.filter(r=>r&&clean(r.sampleId)):[];
  if(!rows.length)throw Error('Belum ada pengukuran untuk dikirim.');
  const files=safeObject(storage.getItem(FILES_KEY)),target=destinationName(files);
  const data=rows.map(r=>{const m=r.metrics||{},c=r.color||{},meta=r.research||{};return[
    r.sampleId,r.type,val(r.primaryValue),r.unit||'',val(m.area),val(m.perimeter),val(m.width),val(m.height),val(m.major),val(m.minor),
    val(m.feret),val(m.minFeret),val(m.circularity),val(m.solidity),val(m.aspectRatio),
    val(c.r),val(c.g),val(c.b),val(c.h),val(c.s),val(c.v),val(c.lab?.[0]),val(c.lab?.[1]),val(c.lab?.[2]),
    val(r.quality),val(r.referenceValue),meta.experiment||'',meta.genotype||'',meta.treatment||'',meta.replication||'',meta.harvest||'',r.photo||''
  ];});
  files[target]=csvText([MEASUREMENT_HEADERS,...data]);
  const metadata=safeObject(storage.getItem(META_KEY));metadata[target]={...(metadata[target]||{}),source:'Pengukur',plant:metadata[target]?.plant||'',treatment:metadata[target]?.treatment||''};
  storage.setItem(FILES_KEY,JSON.stringify(files));storage.setItem(ACTIVE_KEY,target);storage.setItem(META_KEY,JSON.stringify(metadata));
  return {dataset:target.replace(/\.csv$/i,''),file:target,rowCount:data.length,headers:[...MEASUREMENT_HEADERS]};
}