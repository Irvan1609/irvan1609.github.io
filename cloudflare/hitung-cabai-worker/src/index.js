const MAX_IMAGE_BYTES=850000;
const MAX_BOXES=1500;

function allowedOrigins(env){
  return new Set(String(env.ALLOWED_ORIGINS||'https://irvan1609.github.io').split(',').map(v=>v.trim()).filter(Boolean));
}
function corsHeaders(request,env){
  const origin=request.headers.get('Origin')||'';
  const allowed=allowedOrigins(env);
  return {
    'Access-Control-Allow-Origin':allowed.has(origin)?origin:[...allowed][0]||'https://irvan1609.github.io',
    'Access-Control-Allow-Methods':'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers':'Content-Type,Authorization,CF-Turnstile-Token',
    'Access-Control-Max-Age':'86400',
    'Vary':'Origin'
  };
}
function json(request,env,payload,status=200){
  return new Response(JSON.stringify(payload),{status,headers:{'Content-Type':'application/json; charset=utf-8',...corsHeaders(request,env)}});
}
function validBoxes(value){
  if(!Array.isArray(value)||value.length>MAX_BOXES)return false;
  return value.every(box=>Array.isArray(box)&&box.length===4&&box.every(Number.isFinite)&&box[0]>=0&&box[1]>=0&&box[2]>0&&box[3]>0&&box[0]+box[2]<=1.000001&&box[1]+box[3]<=1.000001);
}
function authAdmin(request,env){
  const expected=String(env.ADMIN_TOKEN||'');
  const header=request.headers.get('Authorization')||'';
  return expected&&header===`Bearer ${expected}`;
}
async function verifyTurnstile(request,env){
  if(!env.TURNSTILE_SECRET)throw Error('TURNSTILE_SECRET belum dikonfigurasi.');
  const token=request.headers.get('CF-Turnstile-Token')||'';
  if(!token)return false;
  const body=new FormData();body.append('secret',env.TURNSTILE_SECRET);body.append('response',token);
  const result=await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify',{method:'POST',body});
  const data=await result.json();
  return Boolean(data.success&&(!data.action||data.action==='chili_contribute'));
}
function qualityScore(predictedCount,finalCount,correctionCount){
  const denominator=Math.max(1,finalCount,predictedCount);
  const rate=Math.min(1,correctionCount/denominator);
  return Number(Math.min(.99,.72+.22*rate+(finalCount>0?.04:0)).toFixed(3));
}
function parseJsonField(form,name,fallback=[]){
  try{return JSON.parse(String(form.get(name)??JSON.stringify(fallback)));}catch{return null;}
}

async function handleContribution(request,env){
  if(!(await verifyTurnstile(request,env)))return json(request,env,{error:'Verifikasi anti-bot tidak valid.'},403);
  const form=await request.formData(),image=form.get('image');
  if(!(image instanceof File))return json(request,env,{error:'Foto tidak ditemukan.'},400);
  if(image.size<=0||image.size>MAX_IMAGE_BYTES)return json(request,env,{error:'Ukuran foto kontribusi tidak valid.'},413);
  if(!['image/webp','image/jpeg','image/png'].includes(image.type))return json(request,env,{error:'Format foto tidak didukung.'},415);
  if(String(form.get('consent'))!=='true')return json(request,env,{error:'Persetujuan penggunaan data diperlukan.'},400);

  const boxes=parseJsonField(form,'boxes'),predictedBoxes=parseJsonField(form,'predicted_boxes');
  if(!validBoxes(boxes)||!validBoxes(predictedBoxes))return json(request,env,{error:'Bounding box tidak valid.'},400);
  const width=Number(form.get('width')),height=Number(form.get('height'));
  if(!Number.isInteger(width)||!Number.isInteger(height)||width<32||height<32||width>5000||height>5000)return json(request,env,{error:'Dimensi foto tidak valid.'},400);
  const sample=String(form.get('sample')||'Tanpa kode').trim().slice(0,100)||'Tanpa kode';
  const predictedCount=predictedBoxes.length,finalCount=boxes.length;
  const correctionCount=Math.abs(finalCount-predictedCount)+(JSON.stringify(boxes)===JSON.stringify(predictedBoxes)?0:1);
  const method=String(form.get('prediction_method')||'unknown').slice(0,40);
  const modelVersion=String(form.get('model_version')||'unknown').slice(0,80);
  const id=crypto.randomUUID(),createdAt=new Date().toISOString(),score=qualityScore(predictedCount,finalCount,correctionCount);
  const bytes=await image.arrayBuffer();

  await env.DB.prepare(`INSERT INTO contributions
    (id,sample,image,mime_type,width,height,boxes_json,predicted_boxes_json,predicted_count,final_count,prediction_method,model_version,correction_count,quality_score,status,created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .bind(id,sample,bytes,image.type,width,height,JSON.stringify(boxes),JSON.stringify(predictedBoxes),predictedCount,finalCount,method,modelVersion,correctionCount,score,'candidate',createdAt)
    .run();

  return json(request,env,{ok:true,id,qualityScore:score,finalCount});
}
async function handleManifest(request,env,url){
  if(!authAdmin(request,env))return json(request,env,{error:'Tidak diizinkan.'},401);
  const limit=Math.min(5000,Math.max(1,Number(url.searchParams.get('limit'))||2000));
  const result=await env.DB.prepare(`SELECT id,sample,mime_type,width,height,boxes_json,predicted_count,final_count,prediction_method,model_version,correction_count,quality_score,status,created_at
    FROM contributions WHERE status IN ('candidate','reviewed') ORDER BY created_at ASC LIMIT ?`).bind(limit).all();
  return json(request,env,{items:result.results||[]});
}
async function handleImage(request,env,id){
  if(!authAdmin(request,env))return json(request,env,{error:'Tidak diizinkan.'},401);
  const row=await env.DB.prepare('SELECT image,mime_type FROM contributions WHERE id=?').bind(id).first();
  if(!row?.image)return json(request,env,{error:'Foto tidak ditemukan.'},404);
  return new Response(new Uint8Array(row.image),{headers:{'Content-Type':row.mime_type||'application/octet-stream','Cache-Control':'private, max-age=3600'}});
}

export default {
  async fetch(request,env){
    if(request.method==='OPTIONS')return new Response(null,{status:204,headers:corsHeaders(request,env)});
    const url=new URL(request.url);
    try{
      if(request.method==='GET'&&url.pathname==='/v1/health')return json(request,env,{ok:true,service:'hitung-cabai-api'});
      if(request.method==='POST'&&url.pathname==='/v1/contributions')return await handleContribution(request,env);
      if(request.method==='GET'&&url.pathname==='/v1/admin/manifest')return await handleManifest(request,env,url);
      const imageMatch=url.pathname.match(/^\/v1\/admin\/image\/([0-9a-f-]+)$/i);
      if(request.method==='GET'&&imageMatch)return await handleImage(request,env,imageMatch[1]);
      return json(request,env,{error:'Endpoint tidak ditemukan.'},404);
    }catch(error){
      console.error(error);
      return json(request,env,{error:'Server tidak dapat memproses permintaan.'},500);
    }
  }
};
