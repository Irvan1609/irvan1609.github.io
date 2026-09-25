const MAX_IMAGE_BYTES=850000;
const MAX_BOXES=1500;
const MAX_DATASET_BYTES=2_000_000;
const MAX_DATASETS_PER_USER=120;
const SESSION_DAYS=30;
const STATE_MINUTES=10;
const EXCHANGE_MINUTES=5;
const SESSION_TOUCH_MINUTES=15;
const CLEANUP_INTERVAL_MS=6*60*60*1000;
const ADMIN_EMAIL_DEFAULT='andyirvan1609@gmail.com';
let AUTH_SCHEMA_READY=false;
let DATASET_SCHEMA_READY=false;
let LAST_CLEANUP_AT=0;

function allowedOrigins(env){
  return new Set(String(env.ALLOWED_ORIGINS||'https://irvan1609.github.io').split(',').map(v=>v.trim()).filter(Boolean));
}
function corsHeaders(request,env){
  const origin=request.headers.get('Origin')||'';
  const allowed=allowedOrigins(env);
  return {
    'Access-Control-Allow-Origin':allowed.has(origin)?origin:[...allowed][0]||'https://irvan1609.github.io',
    'Access-Control-Allow-Methods':'GET,POST,PUT,DELETE,OPTIONS',
    'Access-Control-Allow-Headers':'Content-Type,Authorization,CF-Turnstile-Token',
    'Access-Control-Max-Age':'86400',
    'Vary':'Origin'
  };
}
function json(request,env,payload,status=200,extraHeaders={}){
  return new Response(JSON.stringify(payload),{status,headers:{'Content-Type':'application/json; charset=utf-8',...corsHeaders(request,env),...extraHeaders}});
}
function redirect(location,status=302){
  return new Response(null,{status,headers:{Location:location,'Cache-Control':'no-store'}});
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
function authConfigured(env){
  return Boolean(env.GOOGLE_CLIENT_ID&&env.GOOGLE_CLIENT_SECRET);
}
function adminEmails(env){
  return new Set(String(env.ADMIN_EMAILS||ADMIN_EMAIL_DEFAULT).split(',').map(value=>value.trim().toLowerCase()).filter(Boolean));
}
function isAdminEmail(email,env){
  return adminEmails(env).has(String(email||'').trim().toLowerCase());
}
function membershipActive(row,now=Date.now()){
  if(!row)return false;
  if(row.role==='admin')return true;
  if(row.membership_status!=='active')return false;
  if(!row.membership_expires_at)return true;
  const expires=Date.parse(row.membership_expires_at);
  return Number.isFinite(expires)&&expires>now;
}
function syncAccess(row){return Boolean(row&&(row.role==='admin'||membershipActive(row)));}
function analysisIncluded(row){return syncAccess(row);}
function isoAfter({minutes=0,days=0}={}){
  return new Date(Date.now()+minutes*60000+days*86400000).toISOString();
}
function randomToken(bytes=32){
  const data=new Uint8Array(bytes);crypto.getRandomValues(data);
  let binary='';for(const byte of data)binary+=String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
async function sha256(value){
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(String(value)));
  return [...new Uint8Array(digest)].map(byte=>byte.toString(16).padStart(2,'0')).join('');
}
function bearerToken(request){
  const header=request.headers.get('Authorization')||'';
  const match=header.match(/^Bearer\s+(.+)$/i);
  return match?match[1].trim():'';
}
function safeReturnTo(value,env){
  const fallback=[...allowedOrigins(env)][0]||'https://irvan1609.github.io';
  try{
    const url=new URL(value||fallback);
    if(!allowedOrigins(env).has(url.origin))return fallback+'/';
    url.searchParams.delete('auth_code');
    url.searchParams.delete('auth_state');
    url.searchParams.delete('auth_error');
    return url.toString();
  }catch{return fallback+'/';}
}
function googleRedirectUri(request,env){
  return String(env.GOOGLE_REDIRECT_URI||new URL('/v1/auth/google/callback',request.url).toString());
}
function appendAuthResult(returnTo,params){
  const url=new URL(returnTo);
  for(const [key,value] of Object.entries(params)){
    if(value!==null&&value!==undefined&&value!=='')url.searchParams.set(key,String(value));
  }
  return url.toString();
}
async function cleanupAuth(env,{force=false}={}){
  const nowMs=Date.now();
  if(!force&&nowMs-LAST_CLEANUP_AT<CLEANUP_INTERVAL_MS)return;
  LAST_CLEANUP_AT=nowMs;
  const now=new Date(nowMs).toISOString();
  await env.DB.batch([
    env.DB.prepare('DELETE FROM oauth_states WHERE expires_at < ? OR used_at IS NOT NULL').bind(now),
    env.DB.prepare('DELETE FROM auth_exchange_codes WHERE expires_at < ? OR used_at IS NOT NULL').bind(now),
    env.DB.prepare('DELETE FROM sessions WHERE expires_at < ? OR revoked_at IS NOT NULL').bind(now)
  ]).catch(()=>{});
}
async function ensureAuthSchema(env){
  if(AUTH_SCHEMA_READY)return;
  await env.DB.batch([
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      google_sub TEXT NOT NULL UNIQUE,
      email TEXT NOT NULL,
      email_verified INTEGER NOT NULL DEFAULT 0,
      name TEXT NOT NULL,
      picture_url TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      last_login_at TEXT NOT NULL
    )`),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)'),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_users_google_sub ON users(google_sub)'),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS oauth_states (
      state TEXT PRIMARY KEY,
      client_state TEXT NOT NULL,
      return_to TEXT NOT NULL,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      used_at TEXT
    )`),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_oauth_states_expires_at ON oauth_states(expires_at)'),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS auth_exchange_codes (
      code_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      client_state TEXT NOT NULL,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      used_at TEXT,
      FOREIGN KEY(user_id) REFERENCES users(id)
    )`),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_auth_exchange_codes_user_id ON auth_exchange_codes(user_id)'),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_auth_exchange_codes_expires_at ON auth_exchange_codes(expires_at)'),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      last_seen_at TEXT NOT NULL,
      revoked_at TEXT,
      FOREIGN KEY(user_id) REFERENCES users(id)
    )`),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id)'),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_sessions_token_hash ON sessions(token_hash)'),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at)')
  ]);
  const info=await env.DB.prepare('PRAGMA table_info(users)').all();
  const columns=new Set((info.results||[]).map(row=>row.name));
  if(!columns.has('role'))await env.DB.prepare("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user'").run();
  if(!columns.has('membership_status'))await env.DB.prepare("ALTER TABLE users ADD COLUMN membership_status TEXT NOT NULL DEFAULT 'inactive'").run();
  if(!columns.has('membership_expires_at'))await env.DB.prepare("ALTER TABLE users ADD COLUMN membership_expires_at TEXT").run();
  if(!columns.has('membership_source'))await env.DB.prepare("ALTER TABLE users ADD COLUMN membership_source TEXT NOT NULL DEFAULT 'none'").run();
  if(!columns.has('access_updated_at'))await env.DB.prepare("ALTER TABLE users ADD COLUMN access_updated_at TEXT").run();
  for(const email of adminEmails(env)){
    await env.DB.prepare(`UPDATE users SET role='admin',membership_status='active',membership_expires_at=NULL,membership_source='admin',access_updated_at=COALESCE(access_updated_at,?) WHERE lower(email)=? AND email_verified=1`)
      .bind(new Date().toISOString(),email).run();
  }
  AUTH_SCHEMA_READY=true;
}

async function ensureDatasetSchema(env){
  if(DATASET_SCHEMA_READY)return;
  await env.DB.batch([
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS user_datasets (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      content TEXT NOT NULL,
      meta_json TEXT NOT NULL DEFAULT '{}',
      revision INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT,
      FOREIGN KEY(user_id) REFERENCES users(id)
    )`),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_user_datasets_user_updated ON user_datasets(user_id,updated_at)'),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_user_datasets_user_deleted ON user_datasets(user_id,deleted_at)'),
    env.DB.prepare('CREATE UNIQUE INDEX IF NOT EXISTS idx_user_datasets_active_name ON user_datasets(user_id,name) WHERE deleted_at IS NULL')
  ]);
  DATASET_SCHEMA_READY=true;
}
function validDatasetId(value){
  return /^[0-9a-f-]{36}$/i.test(String(value||''));
}
function normalizeDatasetName(value){
  const base=String(value||'').trim().replace(/\.(?:txt|csv)$/i,'');
  if(!base||base.length>176||/[\\/\u0000-\u001f]/.test(base))return '';
  return base+'.csv';
}
function parseDatasetMeta(value){
  const meta=value&&typeof value==='object'&&!Array.isArray(value)?value:{};
  const json=JSON.stringify(meta);
  if(new TextEncoder().encode(json).byteLength>40_000)throw Error('Metadata dataset terlalu besar.');
  return json;
}
function datasetSummary(row){
  return {
    id:row.id,
    name:row.name,
    revision:Number(row.revision)||1,
    createdAt:row.created_at,
    updatedAt:row.updated_at,
    deletedAt:row.deleted_at||null
  };
}
function datasetPayload(row){
  let meta={};
  try{meta=JSON.parse(row.meta_json||'{}')||{};}catch{}
  return {
    id:row.id,
    name:row.name,
    content:row.content,
    meta,
    revision:Number(row.revision)||1,
    createdAt:row.created_at,
    updatedAt:row.updated_at,
    deletedAt:row.deleted_at||null
  };
}
async function requireUser(request,env){
  const user=await userFromSession(request,env);
  return user||null;
}
async function requireSyncUser(request,env){
  const user=await requireUser(request,env);
  if(!user)return {error:'unauthenticated',user:null};
  if(!syncAccess(user))return {error:'membership_required',user};
  return {error:null,user};
}
async function requireAdminUser(request,env){
  const user=await requireUser(request,env);
  if(!user)return {error:'unauthenticated',user:null};
  if(user.role!=='admin')return {error:'admin_required',user};
  return {error:null,user};
}
async function handleDatasetList(request,env,url){
  const access=await requireSyncUser(request,env),user=access.user;
  if(access.error==='unauthenticated')return json(request,env,{error:'Sesi tidak valid.'},401);
  if(access.error==='membership_required')return json(request,env,{error:'membership_required',message:'Sinkronisasi cloud tersedia untuk admin dan membership aktif.'},403);
  await ensureDatasetSchema(env);
  const includeDeleted=url.searchParams.get('include_deleted')==='1';
  const result=await env.DB.prepare(`SELECT id,name,revision,created_at,updated_at,deleted_at
    FROM user_datasets WHERE user_id=? ${includeDeleted?'':'AND deleted_at IS NULL'} ORDER BY updated_at ASC`)
    .bind(user.id).all();
  return json(request,env,{items:(result.results||[]).map(datasetSummary)});
}
async function handleDatasetGet(request,env,id){
  const access=await requireSyncUser(request,env),user=access.user;
  if(access.error==='unauthenticated')return json(request,env,{error:'Sesi tidak valid.'},401);
  if(access.error==='membership_required')return json(request,env,{error:'membership_required',message:'Sinkronisasi cloud tersedia untuk admin dan membership aktif.'},403);
  if(!validDatasetId(id))return json(request,env,{error:'ID dataset tidak valid.'},400);
  await ensureDatasetSchema(env);
  const row=await env.DB.prepare('SELECT id,name,content,meta_json,revision,created_at,updated_at,deleted_at FROM user_datasets WHERE id=? AND user_id=? LIMIT 1').bind(id,user.id).first();
  if(!row)return json(request,env,{error:'Dataset tidak ditemukan.'},404);
  return json(request,env,{item:datasetPayload(row)});
}
async function handleDatasetPut(request,env,id){
  const access=await requireSyncUser(request,env),user=access.user;
  if(access.error==='unauthenticated')return json(request,env,{error:'Sesi tidak valid.'},401);
  if(access.error==='membership_required')return json(request,env,{error:'membership_required',message:'Sinkronisasi cloud tersedia untuk admin dan membership aktif.'},403);
  if(!validDatasetId(id))return json(request,env,{error:'ID dataset tidak valid.'},400);
  await ensureDatasetSchema(env);

  const body=await request.json().catch(()=>null);
  const name=normalizeDatasetName(body?.name);
  const content=typeof body?.content==='string'?body.content:null;
  const expectedRevision=body?.expectedRevision===null||body?.expectedRevision===undefined?null:Number(body.expectedRevision);
  if(!name||content===null)return json(request,env,{error:'Nama atau isi dataset tidak valid.'},400);
  if(new TextEncoder().encode(content).byteLength>MAX_DATASET_BYTES)return json(request,env,{error:'Dataset terlalu besar untuk sinkronisasi akun.'},413);

  let metaJson;
  try{metaJson=parseDatasetMeta(body?.meta);}catch(error){return json(request,env,{error:error.message},413);}
  const now=new Date().toISOString();
  const existing=await env.DB.prepare('SELECT id,user_id,revision FROM user_datasets WHERE id=? LIMIT 1').bind(id).first();

  if(existing){
    if(existing.user_id!==user.id)return json(request,env,{error:'Dataset tidak ditemukan.'},404);
    if(expectedRevision===null||Number(existing.revision)!==expectedRevision){
      const current=await env.DB.prepare('SELECT id,name,content,meta_json,revision,created_at,updated_at,deleted_at FROM user_datasets WHERE id=? AND user_id=? LIMIT 1').bind(id,user.id).first();
      return json(request,env,{error:'revision_conflict',current:current?datasetPayload(current):null},409);
    }
    try{
      await env.DB.prepare(`UPDATE user_datasets SET name=?,content=?,meta_json=?,revision=revision+1,updated_at=?,deleted_at=NULL WHERE id=? AND user_id=?`)
        .bind(name,content,metaJson,now,id,user.id).run();
    }catch(error){
      if(String(error?.message||'').toLowerCase().includes('unique'))return json(request,env,{error:'name_conflict'},409);
      throw error;
    }
  }else{
    const countRow=await env.DB.prepare('SELECT COUNT(*) AS n FROM user_datasets WHERE user_id=? AND deleted_at IS NULL').bind(user.id).first();
    if(Number(countRow?.n||0)>=MAX_DATASETS_PER_USER)return json(request,env,{error:'Batas dataset akun tercapai.'},429);
    try{
      await env.DB.prepare(`INSERT INTO user_datasets (id,user_id,name,content,meta_json,revision,created_at,updated_at,deleted_at)
        VALUES (?,?,?,?,?,1,?,?,NULL)`).bind(id,user.id,name,content,metaJson,now,now).run();
    }catch(error){
      if(String(error?.message||'').toLowerCase().includes('unique'))return json(request,env,{error:'name_conflict'},409);
      throw error;
    }
  }

  const row=await env.DB.prepare('SELECT id,name,content,meta_json,revision,created_at,updated_at,deleted_at FROM user_datasets WHERE id=? AND user_id=? LIMIT 1').bind(id,user.id).first();
  return json(request,env,{ok:true,item:datasetPayload(row)});
}
async function handleDatasetDelete(request,env,id){
  const access=await requireSyncUser(request,env),user=access.user;
  if(access.error==='unauthenticated')return json(request,env,{error:'Sesi tidak valid.'},401);
  if(access.error==='membership_required')return json(request,env,{error:'membership_required',message:'Sinkronisasi cloud tersedia untuk admin dan membership aktif.'},403);
  if(!validDatasetId(id))return json(request,env,{error:'ID dataset tidak valid.'},400);
  await ensureDatasetSchema(env);

  const body=await request.json().catch(()=>({}));
  const expectedRevision=Number(body?.expectedRevision);
  const row=await env.DB.prepare('SELECT revision,deleted_at FROM user_datasets WHERE id=? AND user_id=? LIMIT 1').bind(id,user.id).first();
  if(!row)return json(request,env,{error:'Dataset tidak ditemukan.'},404);
  if(!Number.isFinite(expectedRevision)||Number(row.revision)!==expectedRevision){
    const current=await env.DB.prepare('SELECT id,name,content,meta_json,revision,created_at,updated_at,deleted_at FROM user_datasets WHERE id=? AND user_id=? LIMIT 1').bind(id,user.id).first();
    return json(request,env,{error:'revision_conflict',current:current?datasetPayload(current):null},409);
  }
  if(!row.deleted_at){
    const now=new Date().toISOString();
    await env.DB.prepare('UPDATE user_datasets SET revision=revision+1,updated_at=?,deleted_at=? WHERE id=? AND user_id=?')
      .bind(now,now,id,user.id).run();
  }
  const current=await env.DB.prepare('SELECT id,name,content,meta_json,revision,created_at,updated_at,deleted_at FROM user_datasets WHERE id=? AND user_id=? LIMIT 1').bind(id,user.id).first();
  return json(request,env,{ok:true,item:datasetPayload(current)});
}

function publicUser(row){
  if(!row)return null;
  const active=membershipActive(row);
  return {
    id:row.id,
    email:row.email,
    emailVerified:Boolean(row.email_verified),
    name:row.name||'Pengguna',
    picture:row.picture_url||'',
    role:row.role||'user',
    membership:{
      status:row.role==='admin'?'active':(row.membership_status||'inactive'),
      active,
      expiresAt:row.membership_expires_at||null,
      source:row.role==='admin'?'admin':(row.membership_source||'none')
    },
    features:{
      datasetSync:syncAccess(row),
      analysisIncluded:analysisIncluded(row),
      develop:row.role==='admin'
    },
    createdAt:row.created_at,
    lastLoginAt:row.last_login_at
  };
}
async function userFromSession(request,env){
  const token=bearerToken(request);
  if(!token)return null;
  const hash=await sha256(token),nowMs=Date.now(),now=new Date(nowMs).toISOString();
  const row=await env.DB.prepare(`SELECT u.id,u.email,u.email_verified,u.name,u.picture_url,u.role,u.membership_status,u.membership_expires_at,u.membership_source,u.created_at,u.last_login_at,s.id AS session_id,s.last_seen_at
    FROM sessions s JOIN users u ON u.id=s.user_id
    WHERE s.token_hash=? AND s.revoked_at IS NULL AND s.expires_at>? LIMIT 1`).bind(hash,now).first();
  if(row){
    const lastSeen=Date.parse(row.last_seen_at||'');
    if(!Number.isFinite(lastSeen)||nowMs-lastSeen>=SESSION_TOUCH_MINUTES*60000){
      env.DB.prepare('UPDATE sessions SET last_seen_at=? WHERE id=?').bind(now,row.session_id).run().catch(()=>{});
      row.last_seen_at=now;
    }
  }
  return row||null;
}
async function handleGoogleStart(request,env,url){
  const returnTo=safeReturnTo(url.searchParams.get('return_to'),env);
  const clientState=String(url.searchParams.get('client_state')||'').trim();
  if(!authConfigured(env))return redirect(appendAuthResult(returnTo,{auth_error:'google_not_configured'}));
  if(!/^[A-Za-z0-9_-]{16,160}$/.test(clientState))return redirect(appendAuthResult(returnTo,{auth_error:'invalid_state'}));

  const state=randomToken(32),createdAt=new Date().toISOString(),expiresAt=isoAfter({minutes:STATE_MINUTES});
  await env.DB.prepare('INSERT INTO oauth_states (state,client_state,return_to,created_at,expires_at,used_at) VALUES (?,?,?,?,?,NULL)')
    .bind(state,clientState,returnTo,createdAt,expiresAt).run();

  const authUrl=new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authUrl.searchParams.set('client_id',String(env.GOOGLE_CLIENT_ID));
  authUrl.searchParams.set('redirect_uri',googleRedirectUri(request,env));
  authUrl.searchParams.set('response_type','code');
  authUrl.searchParams.set('scope','openid email profile');
  authUrl.searchParams.set('state',state);
  authUrl.searchParams.set('prompt','select_account');
  authUrl.searchParams.set('include_granted_scopes','true');
  return redirect(authUrl.toString());
}
async function handleGoogleCallback(request,env,url){
  const state=String(url.searchParams.get('state')||'');
  const row=state?await env.DB.prepare('SELECT state,client_state,return_to,expires_at,used_at FROM oauth_states WHERE state=? LIMIT 1').bind(state).first():null;
  const fallback=safeReturnTo(row?.return_to,env);
  if(!row||row.used_at||row.expires_at<=new Date().toISOString())return redirect(appendAuthResult(fallback,{auth_error:'expired_state'}));

  const usedAt=new Date().toISOString();
  await env.DB.prepare('UPDATE oauth_states SET used_at=? WHERE state=? AND used_at IS NULL').bind(usedAt,state).run();

  const oauthError=url.searchParams.get('error');
  if(oauthError)return redirect(appendAuthResult(fallback,{auth_error:String(oauthError).slice(0,80),auth_state:row.client_state}));

  const code=String(url.searchParams.get('code')||'');
  if(!code)return redirect(appendAuthResult(fallback,{auth_error:'missing_code',auth_state:row.client_state}));

  const tokenBody=new URLSearchParams({
    code,
    client_id:String(env.GOOGLE_CLIENT_ID),
    client_secret:String(env.GOOGLE_CLIENT_SECRET),
    redirect_uri:googleRedirectUri(request,env),
    grant_type:'authorization_code'
  });
  const tokenResponse=await fetch('https://oauth2.googleapis.com/token',{
    method:'POST',
    headers:{'Content-Type':'application/x-www-form-urlencoded'},
    body:tokenBody.toString()
  });
  const tokenData=await tokenResponse.json().catch(()=>({}));
  if(!tokenResponse.ok||!tokenData.access_token)return redirect(appendAuthResult(fallback,{auth_error:'token_exchange_failed',auth_state:row.client_state}));

  const profileResponse=await fetch('https://openidconnect.googleapis.com/v1/userinfo',{
    headers:{Authorization:`Bearer ${tokenData.access_token}`}
  });
  const profile=await profileResponse.json().catch(()=>({}));
  if(!profileResponse.ok||!profile.sub||!profile.email)return redirect(appendAuthResult(fallback,{auth_error:'profile_failed',auth_state:row.client_state}));

  const now=new Date().toISOString();
  let user=await env.DB.prepare('SELECT id FROM users WHERE google_sub=? LIMIT 1').bind(String(profile.sub)).first();
  const cleanEmail=String(profile.email).slice(0,254),verified=profile.email_verified?1:0,admin=Boolean(verified&&isAdminEmail(cleanEmail,env));
  if(!user){
    user={id:crypto.randomUUID()};
    await env.DB.prepare(`INSERT INTO users
      (id,google_sub,email,email_verified,name,picture_url,created_at,updated_at,last_login_at,role,membership_status,membership_expires_at,membership_source,access_updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .bind(user.id,String(profile.sub),cleanEmail,verified,String(profile.name||profile.email).slice(0,160),String(profile.picture||'').slice(0,1000),now,now,now,admin?'admin':'user',admin?'active':'inactive',null,admin?'admin':'none',now).run();
  }else{
    await env.DB.prepare(`UPDATE users SET email=?,email_verified=?,name=?,picture_url=?,updated_at=?,last_login_at=? WHERE id=?`)
      .bind(cleanEmail,verified,String(profile.name||profile.email).slice(0,160),String(profile.picture||'').slice(0,1000),now,now,user.id).run();
    if(admin)await env.DB.prepare(`UPDATE users SET role='admin',membership_status='active',membership_expires_at=NULL,membership_source='admin',access_updated_at=? WHERE id=?`).bind(now,user.id).run();
  }

  const rawCode=randomToken(32),codeHash=await sha256(rawCode);
  await env.DB.prepare(`INSERT INTO auth_exchange_codes
    (code_hash,user_id,client_state,created_at,expires_at,used_at) VALUES (?,?,?,?,?,NULL)`)
    .bind(codeHash,user.id,row.client_state,now,isoAfter({minutes:EXCHANGE_MINUTES})).run();

  return redirect(appendAuthResult(fallback,{auth_code:rawCode,auth_state:row.client_state}));
}
async function handleAuthExchange(request,env){
  const body=await request.json().catch(()=>null);
  const code=String(body?.code||''),clientState=String(body?.state||'');
  if(!code||!clientState)return json(request,env,{error:'Kode login tidak lengkap.'},400);
  const codeHash=await sha256(code),now=new Date().toISOString();
  const row=await env.DB.prepare(`SELECT code_hash,user_id,client_state,expires_at,used_at
    FROM auth_exchange_codes WHERE code_hash=? LIMIT 1`).bind(codeHash).first();
  if(!row||row.used_at||row.expires_at<=now||row.client_state!==clientState)return json(request,env,{error:'Kode login tidak valid atau sudah kedaluwarsa.'},401);

  await env.DB.prepare('UPDATE auth_exchange_codes SET used_at=? WHERE code_hash=? AND used_at IS NULL').bind(now,codeHash).run();

  const sessionToken=randomToken(32),tokenHash=await sha256(sessionToken),sessionId=crypto.randomUUID(),expiresAt=isoAfter({days:SESSION_DAYS});
  await env.DB.prepare(`INSERT INTO sessions
    (id,user_id,token_hash,created_at,expires_at,last_seen_at,revoked_at) VALUES (?,?,?,?,?,?,NULL)`)
    .bind(sessionId,row.user_id,tokenHash,now,expiresAt,now).run();

  const user=await env.DB.prepare('SELECT id,email,email_verified,name,picture_url,role,membership_status,membership_expires_at,membership_source,created_at,last_login_at FROM users WHERE id=? LIMIT 1').bind(row.user_id).first();
  return json(request,env,{ok:true,token:sessionToken,expiresAt,user:publicUser(user)});
}
async function handleAuthSession(request,env){
  const row=await userFromSession(request,env);
  if(!row)return json(request,env,{authenticated:false},401);
  return json(request,env,{authenticated:true,user:publicUser(row)});
}
async function handleAuthLogout(request,env){
  const token=bearerToken(request);
  if(token){
    const hash=await sha256(token);
    await env.DB.prepare('UPDATE sessions SET revoked_at=? WHERE token_hash=? AND revoked_at IS NULL').bind(new Date().toISOString(),hash).run();
  }
  return json(request,env,{ok:true});
}
async function handleAuthProfile(request,env){
  const row=await userFromSession(request,env);
  if(!row)return json(request,env,{error:'Sesi tidak valid.'},401);
  return json(request,env,{user:publicUser(row)});
}
async function handleDevelopOverview(request,env){
  const access=await requireAdminUser(request,env);
  if(access.error==='unauthenticated')return json(request,env,{error:'Sesi tidak valid.'},401);
  if(access.error)return json(request,env,{error:'admin_required'},403);
  await ensureDatasetSchema(env);
  const now=new Date(),nowIso=now.toISOString(),dayAgo=new Date(now.getTime()-86400000).toISOString(),weekAgo=new Date(now.getTime()-7*86400000).toISOString();
  const [users,members,datasets,contributions,sessions,newUsers]=await Promise.all([
    env.DB.prepare('SELECT COUNT(*) AS n FROM users').first(),
    env.DB.prepare(`SELECT COUNT(*) AS n FROM users WHERE role='admin' OR (membership_status='active' AND (membership_expires_at IS NULL OR membership_expires_at>?))`).bind(nowIso).first(),
    env.DB.prepare('SELECT COUNT(*) AS n FROM user_datasets WHERE deleted_at IS NULL').first(),
    env.DB.prepare('SELECT COUNT(*) AS n FROM contributions').first(),
    env.DB.prepare('SELECT COUNT(*) AS n FROM sessions WHERE revoked_at IS NULL AND expires_at>? AND last_seen_at>?').bind(nowIso,dayAgo).first(),
    env.DB.prepare('SELECT COUNT(*) AS n FROM users WHERE created_at>?').bind(weekAgo).first()
  ]);
  return json(request,env,{ok:true,stats:{
    users:Number(users?.n||0),
    entitledUsers:Number(members?.n||0),
    datasets:Number(datasets?.n||0),
    contributions:Number(contributions?.n||0),
    activeSessions24h:Number(sessions?.n||0),
    newUsers7d:Number(newUsers?.n||0)
  },generatedAt:nowIso});
}
async function handleDevelopUsers(request,env,url){
  const access=await requireAdminUser(request,env);
  if(access.error==='unauthenticated')return json(request,env,{error:'Sesi tidak valid.'},401);
  if(access.error)return json(request,env,{error:'admin_required'},403);
  await ensureDatasetSchema(env);
  const limit=Math.min(500,Math.max(1,Number(url.searchParams.get('limit'))||200));
  const result=await env.DB.prepare(`SELECT u.id,u.email,u.name,u.picture_url,u.role,u.membership_status,u.membership_expires_at,u.membership_source,u.created_at,u.last_login_at,
    SUM(CASE WHEN d.id IS NOT NULL AND d.deleted_at IS NULL THEN 1 ELSE 0 END) AS dataset_count
    FROM users u LEFT JOIN user_datasets d ON d.user_id=u.id
    GROUP BY u.id ORDER BY u.last_login_at DESC LIMIT ?`).bind(limit).all();
  return json(request,env,{items:(result.results||[]).map(row=>({
    id:row.id,email:row.email,name:row.name,picture:row.picture_url||'',role:row.role||'user',
    membership:{status:row.role==='admin'?'active':(row.membership_status||'inactive'),active:membershipActive(row),expiresAt:row.membership_expires_at||null,source:row.role==='admin'?'admin':(row.membership_source||'none')},
    datasetCount:Number(row.dataset_count||0),createdAt:row.created_at,lastLoginAt:row.last_login_at
  }))});
}
async function handleDevelopUserDatasets(request,env,userId){
  const access=await requireAdminUser(request,env);
  if(access.error==='unauthenticated')return json(request,env,{error:'Sesi tidak valid.'},401);
  if(access.error)return json(request,env,{error:'admin_required'},403);
  await ensureDatasetSchema(env);
  const result=await env.DB.prepare(`SELECT id,name,revision,created_at,updated_at,deleted_at FROM user_datasets WHERE user_id=? ORDER BY updated_at DESC LIMIT 200`).bind(userId).all();
  return json(request,env,{items:(result.results||[]).map(datasetSummary)});
}
async function handleDevelopAccess(request,env,userId){
  const access=await requireAdminUser(request,env);
  if(access.error==='unauthenticated')return json(request,env,{error:'Sesi tidak valid.'},401);
  if(access.error)return json(request,env,{error:'admin_required'},403);
  const target=await env.DB.prepare('SELECT id,email,email_verified,role FROM users WHERE id=? LIMIT 1').bind(userId).first();
  if(!target)return json(request,env,{error:'Pengguna tidak ditemukan.'},404);
  if(target.role==='admin'||(target.email_verified&&isAdminEmail(target.email,env)))return json(request,env,{error:'Akses admin tidak dapat diturunkan dari panel ini.'},409);
  const body=await request.json().catch(()=>({})),status=String(body.status||'inactive');
  if(!['active','inactive'].includes(status))return json(request,env,{error:'Status membership tidak valid.'},400);
  let expiresAt=null;
  if(status==='active'&&body.expiresAt){
    const parsed=Date.parse(String(body.expiresAt));
    if(!Number.isFinite(parsed))return json(request,env,{error:'Tanggal kedaluwarsa tidak valid.'},400);
    expiresAt=new Date(parsed).toISOString();
  }
  const now=new Date().toISOString();
  await env.DB.prepare(`UPDATE users SET membership_status=?,membership_expires_at=?,membership_source='manual',access_updated_at=? WHERE id=?`)
    .bind(status,expiresAt,now,userId).run();
  const row=await env.DB.prepare('SELECT id,email,email_verified,name,picture_url,role,membership_status,membership_expires_at,membership_source,created_at,last_login_at FROM users WHERE id=? LIMIT 1').bind(userId).first();
  return json(request,env,{ok:true,user:publicUser(row)});
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
      if(request.method==='GET'&&url.pathname==='/v1/auth/google/start')await cleanupAuth(env);
      if(request.method==='GET'&&url.pathname==='/v1/health')return json(request,env,{ok:true,service:'hitung-cabai-api',authConfigured:authConfigured(env),datasetSync:true,membershipAccess:true,developConsole:true,apiVersion:'2026-09-26.1'});
      if(url.pathname.startsWith('/v1/auth/')||url.pathname.startsWith('/v1/datasets')||url.pathname.startsWith('/v1/develop/'))await ensureAuthSchema(env);
      if(request.method==='GET'&&url.pathname==='/v1/auth/google/start')return await handleGoogleStart(request,env,url);
      if(request.method==='GET'&&url.pathname==='/v1/auth/google/callback')return await handleGoogleCallback(request,env,url);
      if(request.method==='POST'&&url.pathname==='/v1/auth/exchange')return await handleAuthExchange(request,env);
      if(request.method==='GET'&&url.pathname==='/v1/auth/session')return await handleAuthSession(request,env);
      if(request.method==='GET'&&url.pathname==='/v1/auth/profile')return await handleAuthProfile(request,env);
      if(request.method==='POST'&&url.pathname==='/v1/auth/logout')return await handleAuthLogout(request,env);
      if(request.method==='GET'&&url.pathname==='/v1/develop/overview')return await handleDevelopOverview(request,env);
      if(request.method==='GET'&&url.pathname==='/v1/develop/users')return await handleDevelopUsers(request,env,url);
      const developDatasetsMatch=url.pathname.match(/^\/v1\/develop\/users\/([0-9a-f-]{36})\/datasets$/i);
      if(request.method==='GET'&&developDatasetsMatch)return await handleDevelopUserDatasets(request,env,developDatasetsMatch[1]);
      const developAccessMatch=url.pathname.match(/^\/v1\/develop\/users\/([0-9a-f-]{36})\/access$/i);
      if(request.method==='POST'&&developAccessMatch)return await handleDevelopAccess(request,env,developAccessMatch[1]);
      if(request.method==='GET'&&url.pathname==='/v1/datasets')return await handleDatasetList(request,env,url);
      const datasetMatch=url.pathname.match(/^\/v1\/datasets\/([0-9a-f-]{36})$/i);
      if(request.method==='GET'&&datasetMatch)return await handleDatasetGet(request,env,datasetMatch[1]);
      if(request.method==='PUT'&&datasetMatch)return await handleDatasetPut(request,env,datasetMatch[1]);
      if(request.method==='DELETE'&&datasetMatch)return await handleDatasetDelete(request,env,datasetMatch[1]);
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
