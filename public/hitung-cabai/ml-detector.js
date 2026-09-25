const MANIFEST_URL='./model-manifest.json';
let manifestPromise=null,sessionPromise=null;

const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
const iou=(a,b)=>{
  const ax2=a[0]+a[2],ay2=a[1]+a[3],bx2=b[0]+b[2],by2=b[1]+b[3];
  const x1=Math.max(a[0],b[0]),y1=Math.max(a[1],b[1]),x2=Math.min(ax2,bx2),y2=Math.min(ay2,by2);
  const intersection=Math.max(0,x2-x1)*Math.max(0,y2-y1);
  const union=a[2]*a[3]+b[2]*b[3]-intersection;
  return union>0?intersection/union:0;
};

export function nmsBoxes(candidates,iouThreshold=.45,maxDetections=1500){
  const sorted=[...candidates].sort((a,b)=>b.score-a.score),kept=[];
  while(sorted.length&&kept.length<maxDetections){
    const current=sorted.shift();kept.push(current);
    for(let i=sorted.length-1;i>=0;i--)if(iou(current.box,sorted[i].box)>iouThreshold)sorted.splice(i,1);
  }
  return kept;
}

export function decodeYoloOutput(data,dims,{inputSize=640,confidence=.25,iouThreshold=.45}={}){
  if(!data||!Array.isArray(dims)||dims.length!==3)throw Error('Output model YOLO tidak dikenali.');
  let count,channels,channelFirst;
  if(dims[1]>=5&&dims[1]<=128){channels=dims[1];count=dims[2];channelFirst=true;}
  else{count=dims[1];channels=dims[2];channelFirst=false;}
  if(channels<5)throw Error('Output model tidak memiliki confidence kelas.');
  const at=(i,c)=>channelFirst?data[c*count+i]:data[i*channels+c];
  const candidates=[];
  for(let i=0;i<count;i++){
    let score=0;
    for(let c=4;c<channels;c++)if(at(i,c)>score)score=at(i,c);
    if(score<confidence)continue;
    const cx=at(i,0)/inputSize,cy=at(i,1)/inputSize,w=at(i,2)/inputSize,h=at(i,3)/inputSize;
    candidates.push({score,box:[cx-w/2,cy-h/2,w,h]});
  }
  return nmsBoxes(candidates,iouThreshold).map(item=>item);
}

async function manifest(){
  if(!manifestPromise)manifestPromise=fetch(MANIFEST_URL,{cache:'no-store'}).then(r=>r.ok?r.json():null).catch(()=>null);
  return await manifestPromise;
}
async function loadRuntime(){
  if(window.ort)return window.ort;
  await new Promise((resolve,reject)=>{
    const script=document.createElement('script');
    script.src='https://cdn.jsdelivr.net/npm/onnxruntime-web@1.22.0/dist/ort.min.js';
    script.async=true;script.onload=resolve;script.onerror=()=>reject(Error('ONNX Runtime Web gagal dimuat.'));
    document.head.append(script);
  });
  if(!window.ort)throw Error('ONNX Runtime Web tidak tersedia.');
  window.ort.env.wasm.wasmPaths='https://cdn.jsdelivr.net/npm/onnxruntime-web@1.22.0/dist/';
  return window.ort;
}
async function session(){
  const info=await manifest();
  if(!info?.enabled||!info.modelUrl)return null;
  if(!sessionPromise)sessionPromise=(async()=>{
    const ort=await loadRuntime();
    return await ort.InferenceSession.create(info.modelUrl,{executionProviders:['wasm']});
  })();
  return await sessionPromise;
}

function letterbox(source,size){
  const scale=Math.min(size/source.naturalWidth,size/source.naturalHeight);
  const drawW=Math.round(source.naturalWidth*scale),drawH=Math.round(source.naturalHeight*scale);
  const dx=Math.floor((size-drawW)/2),dy=Math.floor((size-drawH)/2);
  const canvas=document.createElement('canvas');canvas.width=size;canvas.height=size;
  const ctx=canvas.getContext('2d',{alpha:false,willReadFrequently:true});
  ctx.fillStyle='#727272';ctx.fillRect(0,0,size,size);ctx.drawImage(source,dx,dy,drawW,drawH);
  return {imageData:ctx.getImageData(0,0,size,size),scale,dx,dy,drawW,drawH};
}
function tensorFromImageData(imageData,ort){
  const {data,width,height}=imageData,out=new Float32Array(3*width*height),plane=width*height;
  for(let i=0,p=0;i<data.length;i+=4,p++){
    out[p]=data[i]/255;out[plane+p]=data[i+1]/255;out[plane*2+p]=data[i+2]/255;
  }
  return new ort.Tensor('float32',out,[1,3,height,width]);
}
function unletterbox(box,meta,size){
  const [x,y,w,h]=box;
  const x1=(x*size-meta.dx)/meta.drawW,y1=(y*size-meta.dy)/meta.drawH;
  const x2=((x+w)*size-meta.dx)/meta.drawW,y2=((y+h)*size-meta.dy)/meta.drawH;
  const nx1=clamp(x1,0,1),ny1=clamp(y1,0,1),nx2=clamp(x2,0,1),ny2=clamp(y2,0,1);
  return [nx1,ny1,Math.max(0,nx2-nx1),Math.max(0,ny2-ny1)];
}

export async function detectChiliWithModel(source){
  const info=await manifest();
  if(!info?.enabled)return null;
  const active=await session();if(!active)return null;
  const ort=window.ort,size=Number(info.inputSize)||640,prepared=letterbox(source,size);
  const inputName=active.inputNames[0],tensor=tensorFromImageData(prepared.imageData,ort);
  const outputs=await active.run({[inputName]:tensor}),output=outputs[active.outputNames[0]];
  const decoded=decodeYoloOutput(output.data,output.dims,{inputSize:size,confidence:Number(info.confidence)||.25,iouThreshold:Number(info.iou)||.45});
  const boxes=decoded.map(item=>unletterbox(item.box,prepared,size)).filter(box=>box[2]>0&&box[3]>0);
  return {boxes,version:String(info.version||'onnx'),method:'onnx',stats:{accepted:boxes.length}};
}
