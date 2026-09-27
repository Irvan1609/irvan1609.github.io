const encoder=new TextEncoder();
const u16=n=>new Uint8Array([n&255,(n>>>8)&255]);
const u32=n=>new Uint8Array([n&255,(n>>>8)&255,(n>>>16)&255,(n>>>24)&255]);
const concat=parts=>new Blob(parts);

function crc32(bytes){
  let crc=0xffffffff;
  for(const b of bytes){crc^=b;for(let k=0;k<8;k++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}
  return (crc^0xffffffff)>>>0;
}
function safe(value){return String(value||'sample').normalize('NFC').replace(/[^\p{L}\p{N}._-]+/gu,'_').replace(/^_+|_+$/g,'').slice(0,96)||'sample';}
function extOf(blob){const t=blob?.type||'';return t.includes('png')?'png':t.includes('webp')?'webp':'jpg';}
function yoloText(boxes=[]){
  return boxes.map(b=>'0 '+(b[0]+b[2]/2).toFixed(6)+' '+(b[1]+b[3]/2).toFixed(6)+' '+b[2].toFixed(6)+' '+b[3].toFixed(6)).join('\n')+(boxes.length?'\n':'');
}
function csvCell(v){const s=String(v??'');return /[",\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s;}

function coco(rows){
  let annotationId=1;
  const images=[],annotations=[];
  rows.forEach((r,index)=>{
    images.push({id:index+1,file_name:safe(r.name)+'.'+extOf(r.imageBlob),width:r.width||0,height:r.height||0,split:r.datasetSplit||'train'});
    for(const b of r.boxes||[]){
      const w=(r.width||0)*b[2],h=(r.height||0)*b[3],x=(r.width||0)*b[0],y=(r.height||0)*b[1];
      annotations.push({id:annotationId++,image_id:index+1,category_id:1,bbox:[x,y,w,h],area:w*h,iscrowd:0});
    }
  });
  return JSON.stringify({info:{description:'Agrotik Hitung Cabai export',version:'1.0'},licenses:[],categories:[{id:1,name:'cabai',supercategory:'fruit'}],images,annotations},null,2);
}
function csv(rows){
  const head=['sample','split','model_version','validated_count','predicted_count','error','fp','fn','condition','quality','mean_confidence','image_hash'];
  const lines=[head.join(',')];
  for(const r of rows){
    const c=r.correction||{},mean=r.confidenceStats?.confidence?.mean;
    lines.push([r.name,r.datasetSplit,r.modelVersion,r.boxes?.length||0,r.predictedDetections?.length||0,c.countError??'',c.fp??'',c.fn??'',r.condition||'',r.qualityStats?.score??'',Number.isFinite(mean)?mean:'',r.imageHash||''].map(csvCell).join(','));
  }
  return lines.join('\n');
}

async function bytesOf(value){
  if(value instanceof Blob)return new Uint8Array(await value.arrayBuffer());
  if(value instanceof Uint8Array)return value;
  return encoder.encode(String(value));
}
async function zipStore(files){
  const locals=[],centrals=[];let offset=0;
  for(const file of files){
    const nameBytes=encoder.encode(file.name),data=await bytesOf(file.data),crc=crc32(data);
    const local=new Blob([u32(0x04034b50),u16(20),u16(0),u16(0),u16(0),u16(0),u32(crc),u32(data.length),u32(data.length),u16(nameBytes.length),u16(0),nameBytes,data]);
    locals.push(local);
    const central=new Blob([u32(0x02014b50),u16(20),u16(20),u16(0),u16(0),u16(0),u16(0),u32(crc),u32(data.length),u32(data.length),u16(nameBytes.length),u16(0),u16(0),u16(0),u16(0),u32(0),u32(offset),nameBytes]);
    centrals.push(central);offset+=local.size;
  }
  const centralSize=centrals.reduce((s,b)=>s+b.size,0);
  const end=new Blob([u32(0x06054b50),u16(0),u16(0),u16(files.length),u16(files.length),u32(centralSize),u32(offset),u16(0)]);
  return concat([...locals,...centrals,end]);
}

export async function buildDatasetZip(records=[],{split='all',includeImages=true}={}){
  const rows=records.filter(r=>(split==='all'||r.datasetSplit===split)&&(r.validationStatus==='validated'||(!r.validationStatus&&r.reviewed!==false)));
  if(!rows.length)throw Error('Tidak ada anotasi tervalidasi pada subset ini.');
  const files=[
    {name:'data.yaml',data:'path: .\ntrain: images/train\nval: images/validation\ntest: images/test\nnames:\n  0: cabai\n'},
    {name:'annotations/coco.json',data:coco(rows)},
    {name:'annotations/summary.csv',data:csv(rows)}
  ];
  for(const row of rows){
    const sp=['train','validation','test'].includes(row.datasetSplit)?row.datasetSplit:'train',stem=safe(row.name||row.id);
    files.push({name:'labels/'+sp+'/'+stem+'.txt',data:yoloText(row.boxes||[])});
    if(includeImages&&row.imageBlob instanceof Blob)files.push({name:'images/'+sp+'/'+stem+'.'+extOf(row.imageBlob),data:row.imageBlob});
  }
  files.push({name:'README.txt',data:'Ekspor Agrotik Hitung Cabai. Format kotak YOLO: class x_center y_center width height (ternormalisasi). COCO dan CSV menggunakan anotasi yang sudah divalidasi.'});
  return zipStore(files);
}

export function downloadBlob(blob,name){
  const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),2500);
}
