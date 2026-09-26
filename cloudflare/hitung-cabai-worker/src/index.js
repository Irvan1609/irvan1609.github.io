const MAX_IMAGE_BYTES=850000;
const MAX_CONTRIBUTION_REQUEST_BYTES=1_500_000;
const MAX_BOXES=1500;
const MAX_DATASET_BYTES=2_000_000;
const MAX_DATASET_REQUEST_BYTES=4_500_000;
const MAX_DATASETS_PER_USER=120;
const SESSION_DAYS=30;
const SESSION_ROTATE_HOURS=24;
const SESSION_COOKIE='__Host-agrotik_session';
const CSRF_HEADER='X-Agrotik-CSRF';
const STATE_MINUTES=10;
const EXCHANGE_MINUTES=5;
const SESSION_TOUCH_MINUTES=15;
const CLEANUP_INTERVAL_MS=6*60*60*1000;
const ADMIN_EMAIL_DEFAULT='andyirvan1609@gmail.com';
let AUTH_SCHEMA_READY=false;
let DATASET_SCHEMA_READY=false;
let MEMBERSHIP_SCHEMA_READY=false;
let OPERATIONS_SCHEMA_READY=false;
let CONTRIBUTION_SCHEMA_READY=false;
let GAME_SCHEMA_READY=false;
let LAST_CLEANUP_AT=0;

function allowedOrigins(env){
  return new Set(String(env.ALLOWED_ORIGINS||'https://irvan1609.github.io,https://agrotik.pages.dev,https://agrotik-irvan1609.pages.dev').split(',').map(v=>v.trim()).filter(Boolean));
}
function corsHeaders(request,env){
  const origin=request.headers.get('Origin')||'';
  const allowed=allowedOrigins(env);
  return {
    'Access-Control-Allow-Origin':allowed.has(origin)?origin:[...allowed][0]||'https://irvan1609.github.io',
    'Access-Control-Allow-Methods':'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    'Access-Control-Allow-Headers':'Content-Type,Authorization,CF-Turnstile-Token,X-Contribution-Edit,X-Agrotik-CSRF',
    'Access-Control-Allow-Credentials':'true',
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
function requestTooLarge(request,maxBytes){
  const raw=request.headers.get('Content-Length');
  if(!raw)return false;
  const bytes=Number(raw);
  return Number.isFinite(bytes)&&bytes>maxBytes;
}
async function rateLimitAllowed(env,binding,key){
  const limiter=env?.[binding];
  if(!limiter?.limit)return true;
  try{
    const result=await limiter.limit({key:String(key||'anonymous').slice(0,192)});
    return result?.success!==false;
  }catch(error){
    console.warn('Rate limiter unavailable:',binding,error?.message||error);
    return true;
  }
}
function anonymousRateKey(request){
  const ip=request.headers.get('CF-Connecting-IP')||'unknown';
  const ua=(request.headers.get('User-Agent')||'').slice(0,96);
  return ip+'|'+ua;
}
async function datasetMutationGuard(request,env,user){
  if(requestTooLarge(request,MAX_DATASET_REQUEST_BYTES))return json(request,env,{error:'Permintaan dataset terlalu besar.'},413);
  if(!(await rateLimitAllowed(env,'DATASET_RATE_LIMITER','dataset:'+user.id))){
    return json(request,env,{error:'Terlalu banyak perubahan dataset. Coba lagi sesaat lagi.'},429,{'Retry-After':'60'});
  }
  return null;
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
function randomHex(bytes=16){
  const data=new Uint8Array(bytes);crypto.getRandomValues(data);
  return [...data].map(value=>value.toString(16).padStart(2,'0')).join('');
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
function cookieValue(request,name){
  const cookie=request.headers.get('Cookie')||'';
  for(const part of cookie.split(';')){
    const i=part.indexOf('=');
    if(i<0)continue;
    if(part.slice(0,i).trim()===name)return decodeURIComponent(part.slice(i+1).trim());
  }
  return '';
}
function sessionCredential(request){
  const bearer=bearerToken(request);
  if(bearer)return {token:bearer,source:'bearer'};
  const cookie=cookieValue(request,SESSION_COOKIE);
  return cookie?{token:cookie,source:'cookie'}:{token:'',source:'none'};
}
function sessionToken(request){return sessionCredential(request).token;}
function sessionCookie(token,maxAge=SESSION_DAYS*86400){
  const value=encodeURIComponent(String(token||''));
  return `${SESSION_COOKIE}=${value}; Path=/; Max-Age=${Math.max(0,Math.floor(maxAge))}; HttpOnly; Secure; SameSite=None`;
}
function clearSessionCookie(){return sessionCookie('',0);}
async function csrfTokenFor(token){return sha256('agrotik-csrf:'+String(token||''));}
function constantTimeEqual(a,b){
  const x=String(a||''),y=String(b||'');
  if(x.length!==y.length)return false;
  let diff=0;for(let i=0;i<x.length;i++)diff|=x.charCodeAt(i)^y.charCodeAt(i);
  return diff===0;
}
function csrfProtectedPath(pathname){
  if(pathname==='/v1/membership/webhook'||pathname==='/v1/auth/exchange')return false;
  return pathname==='/v1/auth/logout'||pathname.startsWith('/v1/account/')||pathname.startsWith('/v1/datasets')||
    pathname.startsWith('/v1/membership/')||pathname.startsWith('/v1/develop/')||pathname.startsWith('/v1/game/');
}
async function csrfGuard(request,env,url){
  if(['GET','HEAD','OPTIONS'].includes(request.method)||!csrfProtectedPath(url.pathname))return null;
  const credential=sessionCredential(request);
  if(credential.source!=='cookie')return null;
  const origin=request.headers.get('Origin')||'';
  if(!origin||!allowedOrigins(env).has(origin))return json(request,env,{error:'csrf_origin',message:'Origin permintaan tidak diizinkan.'},403);
  const supplied=request.headers.get(CSRF_HEADER)||'';
  const expected=await csrfTokenFor(credential.token);
  if(!constantTimeEqual(supplied,expected))return json(request,env,{error:'csrf_invalid',message:'Verifikasi keamanan sesi gagal.'},403);
  return null;
}
function sessionDeviceLabel(userAgent){
  const ua=String(userAgent||'');
  const browser=/Edg\//.test(ua)?'Edge':/Chrome\//.test(ua)?'Chrome':/Firefox\//.test(ua)?'Firefox':/Safari\//.test(ua)?'Safari':'Browser';
  const os=/Android/i.test(ua)?'Android':/iPhone|iPad/i.test(ua)?'iOS/iPadOS':/Windows/i.test(ua)?'Windows':/Mac OS X/i.test(ua)?'macOS':/Linux/i.test(ua)?'Linux':'Perangkat';
  return browser+' · '+os;
}
async function sessionClientMeta(request){
  const userAgent=(request.headers.get('User-Agent')||'').slice(0,300);
  const ip=request.headers.get('CF-Connecting-IP')||'';
  const ipHash=ip?await sha256('agrotik-ip:'+ip):'';
  return {userAgent,ipHash};
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
      last_login_at TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      membership_status TEXT NOT NULL DEFAULT 'inactive',
      membership_expires_at TEXT,
      membership_source TEXT NOT NULL DEFAULT 'none',
      access_updated_at TEXT,
      membership_plan_id TEXT,
      account_status TEXT NOT NULL DEFAULT 'active'
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
      user_agent TEXT NOT NULL DEFAULT '',
      ip_hash TEXT NOT NULL DEFAULT '',
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
  if(!columns.has('membership_plan_id'))await env.DB.prepare("ALTER TABLE users ADD COLUMN membership_plan_id TEXT").run();
  if(!columns.has('account_status'))await env.DB.prepare("ALTER TABLE users ADD COLUMN account_status TEXT NOT NULL DEFAULT 'active'").run();
  const sessionInfo=await env.DB.prepare('PRAGMA table_info(sessions)').all();
  const sessionColumns=new Set((sessionInfo.results||[]).map(row=>row.name));
  if(!sessionColumns.has('user_agent'))await env.DB.prepare("ALTER TABLE sessions ADD COLUMN user_agent TEXT NOT NULL DEFAULT ''").run();
  if(!sessionColumns.has('ip_hash'))await env.DB.prepare("ALTER TABLE sessions ADD COLUMN ip_hash TEXT NOT NULL DEFAULT ''").run();
  for(const email of adminEmails(env)){
    await env.DB.prepare(`UPDATE users SET role='admin',membership_status='active',membership_expires_at=NULL,membership_source='admin',membership_plan_id='admin',access_updated_at=COALESCE(access_updated_at,?) WHERE lower(email)=? AND email_verified=1`)
      .bind(new Date().toISOString(),email).run();
  }
  AUTH_SCHEMA_READY=true;
}

async function ensureGameSchema(env){
  if(GAME_SCHEMA_READY)return;
  await env.DB.batch([
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS game_profiles (
      user_id TEXT PRIMARY KEY,
      score INTEGER NOT NULL DEFAULT 0,
      score_version INTEGER NOT NULL DEFAULT 2,
      best_yield REAL NOT NULL DEFAULT 0,
      season INTEGER NOT NULL DEFAULT 1,
      level INTEGER NOT NULL DEFAULT 1,
      legacy INTEGER NOT NULL DEFAULT 0,
      location TEXT NOT NULL DEFAULT 'zero',
      updated_at TEXT NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id)
    )`),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_game_profiles_score ON game_profiles(score DESC,updated_at ASC)'),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS game_friends (
      user_id TEXT NOT NULL,
      friend_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY(user_id,friend_id),
      FOREIGN KEY(user_id) REFERENCES users(id),
      FOREIGN KEY(friend_id) REFERENCES users(id)
    )`),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_game_friends_friend ON game_friends(friend_id,status,updated_at)'),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS game_raids (
      id TEXT PRIMARY KEY,
      attacker_id TEXT NOT NULL,
      target_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      claimed_at TEXT,
      FOREIGN KEY(attacker_id) REFERENCES users(id),
      FOREIGN KEY(target_id) REFERENCES users(id)
    )`),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_game_raids_target ON game_raids(target_id,claimed_at,created_at)'),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_game_raids_pair ON game_raids(attacker_id,target_id,created_at)'),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS game_aids (
      id TEXT PRIMARY KEY,
      helper_id TEXT NOT NULL,
      target_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      claimed_at TEXT,
      FOREIGN KEY(helper_id) REFERENCES users(id),
      FOREIGN KEY(target_id) REFERENCES users(id)
    )`),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_game_aids_target ON game_aids(target_id,claimed_at,created_at)'),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_game_aids_pair ON game_aids(helper_id,target_id,created_at)')
  ]);
  const profileInfo=await env.DB.prepare('PRAGMA table_info(game_profiles)').all();
  const profileColumns=new Set((profileInfo.results||[]).map(row=>row.name));
  if(!profileColumns.has('score_version'))await env.DB.prepare('ALTER TABLE game_profiles ADD COLUMN score_version INTEGER NOT NULL DEFAULT 1').run();
  GAME_SCHEMA_READY=true;
}

async function ensureMembershipSchema(env){
  if(MEMBERSHIP_SCHEMA_READY)return;
  await env.DB.batch([
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS membership_plans (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      duration_days INTEGER NOT NULL,
      price_idr INTEGER NOT NULL DEFAULT 0,
      dataset_limit INTEGER NOT NULL DEFAULT 30,
      storage_limit_bytes INTEGER NOT NULL DEFAULT 20971520,
      active INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS membership_payments (
      order_id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      plan_id TEXT NOT NULL,
      amount INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      midtrans_transaction_id TEXT,
      qr_url TEXT,
      paid_at TEXT,
      applied_at TEXT,
      membership_expires_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id),
      FOREIGN KEY(plan_id) REFERENCES membership_plans(id)
    )`),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_membership_payments_user ON membership_payments(user_id,created_at)'),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_membership_payments_status ON membership_payments(status)')
  ]);
  const paymentInfo=await env.DB.prepare('PRAGMA table_info(membership_payments)').all();
  const paymentColumns=new Set((paymentInfo.results||[]).map(row=>row.name));
  if(!paymentColumns.has('qr_url'))await env.DB.prepare('ALTER TABLE membership_payments ADD COLUMN qr_url TEXT').run();
  const now=new Date().toISOString();
  const seeds=[
    ['manual','Membership Manual','Akses membership yang diberikan admin.',30,0,50,52428800,0,0],
    ['monthly','Membership 30 Hari','Membership 30 hari.',30,0,50,52428800,0,10],
    ['quarterly','Membership 90 Hari','Membership 90 hari.',90,0,75,104857600,0,20],
    ['yearly','Membership 365 Hari','Membership 365 hari.',365,0,120,262144000,0,30]
  ];
  for(const row of seeds){
    await env.DB.prepare(`INSERT OR IGNORE INTO membership_plans
      (id,name,description,duration_days,price_idr,dataset_limit,storage_limit_bytes,active,sort_order,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)`).bind(...row,now,now).run();
  }
  MEMBERSHIP_SCHEMA_READY=true;
}
async function ensureOperationsSchema(env){
  if(OPERATIONS_SCHEMA_READY)return;
  await env.DB.batch([
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      actor_user_id TEXT,
      action TEXT NOT NULL,
      target_type TEXT,
      target_id TEXT,
      detail_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL
    )`),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at)'),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON audit_logs(actor_user_id,created_at)'),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS backup_runs (
      id TEXT PRIMARY KEY,
      object_key TEXT,
      status TEXT NOT NULL,
      size_bytes INTEGER NOT NULL DEFAULT 0,
      note TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    )`),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_backup_runs_created ON backup_runs(created_at)'),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS idempotent_operations (
      operation_id TEXT NOT NULL,
      scope TEXT NOT NULL,
      response_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY(operation_id,scope)
    )`),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_idempotent_operations_created ON idempotent_operations(created_at)')
  ]);
  OPERATIONS_SCHEMA_READY=true;
}
function validOperationId(value){return /^[0-9a-f-]{36}$/i.test(String(value||''));}
async function replayOperation(env,scope,operationId){
  if(!validOperationId(operationId))return null;
  await ensureOperationsSchema(env);
  const row=await env.DB.prepare('SELECT response_json FROM idempotent_operations WHERE operation_id=? AND scope=? LIMIT 1').bind(operationId,scope).first();
  if(!row)return null;
  try{return JSON.parse(row.response_json||'null');}catch{return null;}
}
async function rememberOperation(env,scope,operationId,payload){
  if(!validOperationId(operationId))return;
  await ensureOperationsSchema(env);
  await env.DB.prepare('INSERT OR IGNORE INTO idempotent_operations (operation_id,scope,response_json,created_at) VALUES (?,?,?,?)')
    .bind(operationId,scope,JSON.stringify(payload),new Date().toISOString()).run();
}
async function audit(env,actor,action,targetType='',targetId='',detail={}){
  try{
    await ensureOperationsSchema(env);
    await env.DB.prepare('INSERT INTO audit_logs (id,actor_user_id,action,target_type,target_id,detail_json,created_at) VALUES (?,?,?,?,?,?,?)')
      .bind(crypto.randomUUID(),actor?.id||null,String(action),String(targetType||''),String(targetId||''),JSON.stringify(detail||{}).slice(0,20000),new Date().toISOString()).run();
  }catch(error){console.error('audit log failed',error);}
}
function midtransServerKey(env){
  let value=String(env.MIDTRANS_SERVER_KEY||'').replace(/[\u200B-\u200D\uFEFF]/g,'').trim();
  if((value.startsWith('"')&&value.endsWith('"'))||(value.startsWith("'")&&value.endsWith("'")))value=value.slice(1,-1).trim();
  if(/^Basic\s+/i.test(value)){
    try{
      const decoded=atob(value.replace(/^Basic\s+/i,'').trim());
      if(decoded.endsWith(':'))value=decoded.slice(0,-1).trim();
    }catch{}
  }else if(!value.toLowerCase().includes('-server-')&&/^[A-Za-z0-9+/=]+$/.test(value)&&value.length>24){
    try{
      const decoded=atob(value);
      if(decoded.toLowerCase().includes('-server-'))value=(decoded.endsWith(':')?decoded.slice(0,-1):decoded).trim();
    }catch{}
  }
  return value;
}
function midtransEnvironment(env){
  const configured=String(env.MIDTRANS_ENV||'sandbox').trim().toLowerCase();
  return configured==='production'?'production':'sandbox';
}
function midtransMembershipConfigured(env){return Boolean(midtransServerKey(env));}
function midtransMembershipBase(env){return midtransEnvironment(env)==='production'?'https://api.midtrans.com':'https://api.sandbox.midtrans.com';}
function midtransCredentialHint(env){
  const key=midtransServerKey(env),environment=midtransEnvironment(env);
  if(!key)return {ok:false,code:'missing_server_key',message:'MIDTRANS_SERVER_KEY belum dikonfigurasi.',environment,keyType:'missing'};
  const lower=key.toLowerCase();
  const clientKey=lower.includes('-client-');
  const serverKey=lower.includes('-server-');
  if(clientKey)return {ok:false,code:'client_key_used',message:'MIDTRANS_SERVER_KEY berisi Client Key. Gunakan Server Key dari Midtrans Settings → Access Keys.',environment,keyType:'client'};
  return {ok:true,code:'ok',message:'Environment Midtrans mengikuti MIDTRANS_ENV secara eksplisit.',environment,keyType:serverKey?'server':'unknown'};
}
function midtransMembershipAuth(env){
  const key=midtransServerKey(env);
  if(!key)throw Error('MIDTRANS_SERVER_KEY belum dikonfigurasi.');
  const hint=midtransCredentialHint(env);
  if(!hint.ok)throw Error(hint.message);
  return 'Basic '+btoa(key+':');
}
async function midtransMembershipRequest(env,path,options={}){
  const response=await fetch(midtransMembershipBase(env)+path,{...options,headers:{
    Accept:'application/json',
    Authorization:midtransMembershipAuth(env),
    ...(options.body?{'Content-Type':'application/json'}:{}),
    ...(options.headers||{})
  }});
  const data=await response.json().catch(()=>({}));
  if(!response.ok){
    const errors=Array.isArray(data?.error_messages)?data.error_messages.filter(Boolean).join(' · '):'';
    if(response.status===401){
      const hint=midtransCredentialHint(env);
      const detail=!hint.ok?hint.message:(errors||'Autentikasi Midtrans ditolak. Periksa Server Key dan environment Sandbox/Production.');
      throw Error('Midtrans 401: '+detail);
    }
    throw Error(errors||data?.status_message||data?.message||('Midtrans HTTP '+response.status));
  }
  return data;
}
function successfulMidtrans(status){return status?.transaction_status==='settlement'&&(!status.fraud_status||status.fraud_status==='accept');}
function safeMembershipOrderId(value){const v=String(value||'');return /^member-[0-9]{10,}-[a-f0-9]{16,64}$/.test(v)?v:'';}
function addDaysIso(baseIso,days){
  const base=Math.max(Date.now(),Date.parse(baseIso||'')||0);
  return new Date(base+Math.max(1,Number(days)||1)*86400000).toISOString();
}
async function activePlanForUser(env,user){
  if(!user?.membership_plan_id)return null;
  await ensureMembershipSchema(env);
  return env.DB.prepare('SELECT id,name,description,duration_days,price_idr,dataset_limit,storage_limit_bytes,active FROM membership_plans WHERE id=? LIMIT 1').bind(user.membership_plan_id).first();
}
async function userQuota(env,user){
  if(user?.role==='admin')return {datasetLimit:null,storageLimitBytes:null,planId:'admin',planName:'Admin'};
  if(!membershipActive(user))return {datasetLimit:0,storageLimitBytes:0,planId:null,planName:'Gratis'};
  const plan=await activePlanForUser(env,user)||await env.DB.prepare("SELECT * FROM membership_plans WHERE id='manual' LIMIT 1").first();
  return {
    datasetLimit:Number(plan?.dataset_limit||0)||0,
    storageLimitBytes:Number(plan?.storage_limit_bytes||0)||0,
    planId:plan?.id||'manual',
    planName:plan?.name||'Membership'
  };
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
function parseDatasetCsv(text){
  const rows=[];let row=[],cell='',quoted=false;
  const source=String(text||'');
  for(let i=0;i<source.length;i++){
    const ch=source[i];
    if(ch==='"'){
      if(quoted&&source[i+1]==='"'){cell+='"';i++;}
      else quoted=!quoted;
    }else if(ch===','&&!quoted){row.push(cell);cell='';}
    else if((ch==='\n'||ch==='\r')&&!quoted){
      if(ch==='\r'&&source[i+1]==='\n')i++;
      row.push(cell);rows.push(row);row=[];cell='';
    }else cell+=ch;
  }
  if(cell!==''||row.length){row.push(cell);rows.push(row);}
  return rows.filter(r=>r.some(value=>String(value).length>0));
}
function datasetCsvCell(value){
  const text=String(value??'');
  return /[",\r\n]/.test(text)?'"'+text.replace(/"/g,'""')+'"':text;
}
function serializeDatasetCsv(rows){return rows.map(row=>row.map(datasetCsvCell).join(',')).join('\n');}
function applyDatasetOperations(content,operations){
  if(!Array.isArray(operations)||!operations.length||operations.length>300)throw Error('Delta dataset tidak valid.');
  const rows=parseDatasetCsv(content);
  if(!rows.length)throw Error('Dataset kosong perlu disinkronkan penuh.');
  const cols=rows[0].length;
  const data=rows.slice(1).map(row=>Array.from({length:cols},(_,i)=>String(row[i]??'')));
  for(const operation of operations){
    const kind=String(operation?.kind||'');
    if(kind==='set_cell'){
      const r=Number(operation.row),col=Number(operation.col);
      if(!Number.isInteger(r)||!Number.isInteger(col)||r<0||r>=data.length||col<0||col>=cols)throw Error('Posisi sel delta tidak valid.');
      data[r][col]=String(operation.value??'');
    }else if(kind==='set_range'){
      const r0=Number(operation.row),c0=Number(operation.col),values=operation.values;
      if(!Number.isInteger(r0)||!Number.isInteger(c0)||r0<0||c0<0||!Array.isArray(values)||!values.length)throw Error('Rentang delta tidak valid.');
      for(let r=0;r<values.length;r++){
        if(!Array.isArray(values[r])||r0+r>=data.length||c0+values[r].length>cols)throw Error('Rentang delta melewati ukuran dataset.');
        for(let col=0;col<values[r].length;col++)data[r0+r][c0+col]=String(values[r][col]??'');
      }
    }else if(kind==='append_row'){
      const values=Array.isArray(operation.values)?operation.values:[];
      if(values.length!==cols)throw Error('Jumlah kolom baris baru tidak sesuai.');
      data.push(values.map(value=>String(value??'')));
    }else if(kind==='delete_row'){
      const r=Number(operation.row);
      if(!Number.isInteger(r)||r<0||r>=data.length)throw Error('Baris delta tidak valid.');
      data.splice(r,1);
    }else if(kind==='move_column'){
      const from=Number(operation.from),to=Number(operation.to);
      if(!Number.isInteger(from)||!Number.isInteger(to)||from<0||to<0||from>=cols||to>=cols)throw Error('Kolom delta tidak valid.');
      for(const row of [rows[0],...data]){const [value]=row.splice(from,1);row.splice(to,0,value);}
    }else throw Error('Jenis delta dataset tidak didukung.');
  }
  return serializeDatasetCsv([rows[0],...data]);
}
async function datasetVersion(env,userId){
  const row=await env.DB.prepare(`SELECT COUNT(*) AS n,COALESCE(SUM(revision),0) AS revisions,COALESCE(MAX(updated_at),'') AS updated
    FROM user_datasets WHERE user_id=?`).bind(userId).first();
  return `${Number(row?.n||0)}:${Number(row?.revisions||0)}:${String(row?.updated||'')}`;
}
async function datasetUsage(env,userId){
  await ensureDatasetSchema(env);
  const row=await env.DB.prepare(`SELECT
    COUNT(*) AS dataset_count,
    COALESCE(SUM(length(CAST(content AS BLOB))+length(CAST(meta_json AS BLOB))),0) AS storage_bytes,
    COALESCE(SUM(revision),0) AS revision_total
    FROM user_datasets WHERE user_id=? AND deleted_at IS NULL`).bind(userId).first();
  return {
    datasetCount:Number(row?.dataset_count||0),
    storageBytes:Number(row?.storage_bytes||0),
    revisionTotal:Number(row?.revision_total||0)
  };
}
async function enforceDatasetQuota(env,user,{incomingBytes=0,existingBytes=0,isNew=false}={}){
  if(user?.role==='admin')return {ok:true,usage:await datasetUsage(env,user.id),quota:await userQuota(env,user)};
  const quota=await userQuota(env,user),usage=await datasetUsage(env,user.id);
  if(isNew&&quota.datasetLimit>0&&usage.datasetCount>=quota.datasetLimit)return {ok:false,error:'dataset_limit',usage,quota};
  const nextStorage=Math.max(0,usage.storageBytes-existingBytes+incomingBytes);
  if(quota.storageLimitBytes>0&&nextStorage>quota.storageLimitBytes)return {ok:false,error:'storage_limit',usage:{...usage,storageBytes:nextStorage},quota};
  return {ok:true,usage:{...usage,storageBytes:nextStorage},quota};
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
  const version=await datasetVersion(env,user.id),known=String(url.searchParams.get('known_version')||'');
  if(known&&known===version)return json(request,env,{unchanged:true,version,items:[]});
  const result=await env.DB.prepare(`SELECT id,name,revision,created_at,updated_at,deleted_at
    FROM user_datasets WHERE user_id=? ${includeDeleted?'':'AND deleted_at IS NULL'} ORDER BY updated_at ASC`)
    .bind(user.id).all();
  return json(request,env,{unchanged:false,version,items:(result.results||[]).map(datasetSummary)});
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
  const mutationGuard=await datasetMutationGuard(request,env,user);
  if(mutationGuard)return mutationGuard;
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
  const existing=await env.DB.prepare('SELECT id,user_id,revision,content,meta_json FROM user_datasets WHERE id=? AND user_id=? LIMIT 1').bind(id,user.id).first();
  const incomingBytes=new TextEncoder().encode(content+metaJson).byteLength;
  const existingBytes=existing?new TextEncoder().encode(String(existing.content||'')+String(existing.meta_json||'')).byteLength:0;
  const quotaCheck=await enforceDatasetQuota(env,user,{incomingBytes,existingBytes,isNew:!existing});
  if(!quotaCheck.ok)return json(request,env,{
    error:quotaCheck.error,
    message:quotaCheck.error==='dataset_limit'?'Batas jumlah dataset membership tercapai.':'Batas penyimpanan membership tercapai.',
    usage:quotaCheck.usage,
    quota:quotaCheck.quota
  },413);

  if(existing){
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
async function handleDatasetPatch(request,env,id){
  const access=await requireSyncUser(request,env),user=access.user;
  if(access.error==='unauthenticated')return json(request,env,{error:'Sesi tidak valid.'},401);
  if(access.error==='membership_required')return json(request,env,{error:'membership_required',message:'Sinkronisasi cloud tersedia untuk admin dan membership aktif.'},403);
  const mutationGuard=await datasetMutationGuard(request,env,user);
  if(mutationGuard)return mutationGuard;
  if(!validDatasetId(id))return json(request,env,{error:'ID dataset tidak valid.'},400);
  await ensureDatasetSchema(env);
  const body=await request.json().catch(()=>null),expectedRevision=Number(body?.expectedRevision),operationId=String(body?.operationId||''),operations=body?.operations;
  if(!validOperationId(operationId))return json(request,env,{error:'operation_id tidak valid.'},400);
  const scope=`dataset:${user.id}:${id}`,replayed=await replayOperation(env,scope,operationId);
  if(replayed)return json(request,env,replayed);
  const row=await env.DB.prepare('SELECT id,name,content,meta_json,revision,created_at,updated_at,deleted_at FROM user_datasets WHERE id=? AND user_id=? LIMIT 1').bind(id,user.id).first();
  if(!row)return json(request,env,{error:'Dataset tidak ditemukan.'},404);
  if(!Number.isFinite(expectedRevision)||Number(row.revision)!==expectedRevision)return json(request,env,{error:'revision_conflict',current:datasetPayload(row)},409);
  let content;
  try{content=applyDatasetOperations(row.content,operations);}catch(error){return json(request,env,{error:error.message},400);}
  if(new TextEncoder().encode(content).byteLength>MAX_DATASET_BYTES)return json(request,env,{error:'Dataset terlalu besar untuk sinkronisasi akun.'},413);
  const incomingBytes=new TextEncoder().encode(content+String(row.meta_json||'')).byteLength;
  const existingBytes=new TextEncoder().encode(String(row.content||'')+String(row.meta_json||'')).byteLength;
  const quotaCheck=await enforceDatasetQuota(env,user,{incomingBytes,existingBytes,isNew:false});
  if(!quotaCheck.ok)return json(request,env,{error:quotaCheck.error,message:'Batas penyimpanan membership tercapai.',usage:quotaCheck.usage,quota:quotaCheck.quota},413);
  const now=new Date().toISOString();
  await env.DB.prepare('UPDATE user_datasets SET content=?,revision=revision+1,updated_at=? WHERE id=? AND user_id=?').bind(content,now,id,user.id).run();
  const current=await env.DB.prepare('SELECT id,name,content,meta_json,revision,created_at,updated_at,deleted_at FROM user_datasets WHERE id=? AND user_id=? LIMIT 1').bind(id,user.id).first();
  const payload={ok:true,item:datasetPayload(current),applied:Array.isArray(operations)?operations.length:0};
  await rememberOperation(env,scope,operationId,payload);
  return json(request,env,payload);
}
async function handleDatasetDelete(request,env,id){
  const access=await requireSyncUser(request,env),user=access.user;
  if(access.error==='unauthenticated')return json(request,env,{error:'Sesi tidak valid.'},401);
  if(access.error==='membership_required')return json(request,env,{error:'membership_required',message:'Sinkronisasi cloud tersedia untuk admin dan membership aktif.'},403);
  const mutationGuard=await datasetMutationGuard(request,env,user);
  if(mutationGuard)return mutationGuard;
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
      source:row.role==='admin'?'admin':(row.membership_source||'none'),
      planId:row.role==='admin'?'admin':(row.membership_plan_id||null)
    },
    accountStatus:row.account_status||'active',
    features:{
      datasetSync:syncAccess(row),
      analysisIncluded:analysisIncluded(row),
      develop:row.role==='admin'
    },
    createdAt:row.created_at,
    lastLoginAt:row.last_login_at
  };
}
async function userFromSession(request,env,credential=sessionCredential(request)){
  const token=credential.token;
  if(!token)return null;
  const hash=await sha256(token),nowMs=Date.now(),now=new Date(nowMs).toISOString();
  const row=await env.DB.prepare(`SELECT u.id,u.email,u.email_verified,u.name,u.picture_url,u.role,u.membership_status,u.membership_expires_at,u.membership_source,u.membership_plan_id,u.account_status,u.access_updated_at,u.created_at,u.last_login_at,s.id AS session_id,s.created_at AS session_created_at,s.expires_at AS session_expires_at,s.last_seen_at,s.user_agent
    FROM sessions s JOIN users u ON u.id=s.user_id
    WHERE s.token_hash=? AND s.revoked_at IS NULL AND s.expires_at>? LIMIT 1`).bind(hash,now).first();
  if(row&&row.account_status!=='active')return null;
  if(row&&row.access_updated_at&&Date.parse(row.access_updated_at)>Date.parse(row.session_created_at||'')){
    await env.DB.prepare('UPDATE sessions SET revoked_at=? WHERE id=? AND revoked_at IS NULL').bind(now,row.session_id).run();
    return null;
  }
  if(row){
    row.session_auth_source=credential.source;
    const lastSeen=Date.parse(row.last_seen_at||'');
    if(!Number.isFinite(lastSeen)||nowMs-lastSeen>=SESSION_TOUCH_MINUTES*60000){
      env.DB.prepare('UPDATE sessions SET last_seen_at=? WHERE id=?').bind(now,row.session_id).run().catch(()=>{});
      row.last_seen_at=now;
    }
  }
  return row||null;
}
async function rotateSessionIfNeeded(request,env,row,credential){
  const created=Date.parse(row?.session_created_at||'');
  if(!row||!Number.isFinite(created)||Date.now()-created<SESSION_ROTATE_HOURS*3600000)return null;
  const token=randomToken(32),hash=await sha256(token),now=new Date().toISOString(),expiresAt=isoAfter({days:SESSION_DAYS});
  const meta=await sessionClientMeta(request);
  await env.DB.prepare('UPDATE sessions SET token_hash=?,created_at=?,expires_at=?,last_seen_at=?,user_agent=?,ip_hash=? WHERE id=? AND revoked_at IS NULL')
    .bind(hash,now,expiresAt,now,meta.userAgent,meta.ipHash,row.session_id).run();
  return {token,csrfToken:await csrfTokenFor(token),expiresAt,source:credential.source};
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
      (id,google_sub,email,email_verified,name,picture_url,created_at,updated_at,last_login_at,role,membership_status,membership_expires_at,membership_source,access_updated_at,membership_plan_id,account_status)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .bind(user.id,String(profile.sub),cleanEmail,verified,String(profile.name||profile.email).slice(0,160),String(profile.picture||'').slice(0,1000),now,now,now,admin?'admin':'user',admin?'active':'inactive',null,admin?'admin':'none',now,admin?'admin':null,'active').run();
  }else{
    await env.DB.prepare(`UPDATE users SET email=?,email_verified=?,name=?,picture_url=?,updated_at=?,last_login_at=? WHERE id=?`)
      .bind(cleanEmail,verified,String(profile.name||profile.email).slice(0,160),String(profile.picture||'').slice(0,1000),now,now,user.id).run();
    if(admin)await env.DB.prepare(`UPDATE users SET role='admin',membership_status='active',membership_expires_at=NULL,membership_source='admin',membership_plan_id='admin',access_updated_at=? WHERE id=?`).bind(now,user.id).run();
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
  const sessionMeta=await sessionClientMeta(request);
  await env.DB.prepare(`INSERT INTO sessions
    (id,user_id,token_hash,created_at,expires_at,last_seen_at,revoked_at,user_agent,ip_hash) VALUES (?,?,?,?,?,?,NULL,?,?)`)
    .bind(sessionId,row.user_id,tokenHash,now,expiresAt,now,sessionMeta.userAgent,sessionMeta.ipHash).run();

  const user=await env.DB.prepare('SELECT id,email,email_verified,name,picture_url,role,membership_status,membership_expires_at,membership_source,membership_plan_id,account_status,created_at,last_login_at FROM users WHERE id=? LIMIT 1').bind(row.user_id).first();
  if(user?.account_status&&user.account_status!=='active'){
    await env.DB.prepare('UPDATE sessions SET revoked_at=? WHERE id=?').bind(new Date().toISOString(),sessionId).run();
    return json(request,env,{error:'account_suspended',message:'Akun ini sedang ditangguhkan.'},403);
  }
  const csrfToken=await csrfTokenFor(sessionToken);
  await audit(env,user,'auth.login','session',sessionId,{device:sessionDeviceLabel(sessionMeta.userAgent),ipHashPrefix:sessionMeta.ipHash.slice(0,12)});
  return json(request,env,{ok:true,token:sessionToken,csrfToken,expiresAt,user:publicUser(user)},200,{'Set-Cookie':sessionCookie(sessionToken)});
}
async function handleAuthSession(request,env){
  const credential=sessionCredential(request);
  const row=await userFromSession(request,env,credential);
  if(!row)return json(request,env,{authenticated:false},401,credential.source==='cookie'?{'Set-Cookie':clearSessionCookie()}:{});
  const rotated=await rotateSessionIfNeeded(request,env,row,credential);
  if(rotated){
    const payload={authenticated:true,user:publicUser(row),csrfToken:rotated.csrfToken,session:{createdAt:new Date().toISOString(),expiresAt:rotated.expiresAt,device:sessionDeviceLabel(row.user_agent)}};
    if(rotated.source==='bearer')payload.token=rotated.token;
    return json(request,env,payload,200,{'Set-Cookie':sessionCookie(rotated.token)});
  }
  return json(request,env,{authenticated:true,user:publicUser(row),csrfToken:await csrfTokenFor(credential.token),session:{createdAt:row.session_created_at,expiresAt:row.session_expires_at,device:sessionDeviceLabel(row.user_agent)}});
}
async function handleAuthLogout(request,env){
  const credential=sessionCredential(request),row=await userFromSession(request,env,credential);
  if(credential.token){
    const hash=await sha256(credential.token);
    await env.DB.prepare('UPDATE sessions SET revoked_at=? WHERE token_hash=? AND revoked_at IS NULL').bind(new Date().toISOString(),hash).run();
    if(row)await audit(env,row,'auth.logout','session',row.session_id,{source:credential.source});
  }
  return json(request,env,{ok:true},200,{'Set-Cookie':clearSessionCookie()});
}
async function handleAuthProfile(request,env){
  const row=await userFromSession(request,env);
  if(!row)return json(request,env,{error:'Sesi tidak valid.'},401);
  return json(request,env,{user:publicUser(row)});
}
async function handleMembershipPlans(request,env){
  await ensureMembershipSchema(env);
  const result=await env.DB.prepare(`SELECT id,name,description,duration_days,price_idr,dataset_limit,storage_limit_bytes,active,sort_order
    FROM membership_plans WHERE active=1 AND price_idr>0 ORDER BY sort_order,id`).all();
  return json(request,env,{items:(result.results||[]).map(row=>({
    id:row.id,name:row.name,description:row.description,durationDays:Number(row.duration_days),
    priceIdr:Number(row.price_idr),datasetLimit:Number(row.dataset_limit),storageLimitBytes:Number(row.storage_limit_bytes)
  })),paymentConfigured:midtransMembershipConfigured(env)});
}
async function applyMembershipPayment(env,payment,status){
  if(!payment||payment.applied_at||!successfulMidtrans(status))return payment;
  await ensureMembershipSchema(env);
  const plan=await env.DB.prepare('SELECT id,duration_days FROM membership_plans WHERE id=? LIMIT 1').bind(payment.plan_id).first();
  if(!plan)throw Error('Paket membership tidak ditemukan.');
  const user=await env.DB.prepare('SELECT id,role,membership_expires_at FROM users WHERE id=? LIMIT 1').bind(payment.user_id).first();
  if(!user)throw Error('Pengguna pembayaran tidak ditemukan.');
  const now=new Date().toISOString();
  const expiresAt=user.role==='admin'?null:addDaysIso(user.membership_expires_at,Number(plan.duration_days));
  const transactionId=String(status.transaction_id||'').slice(0,160);
  await env.DB.batch([
    env.DB.prepare(`UPDATE membership_payments SET status='settlement',midtrans_transaction_id=?,paid_at=COALESCE(paid_at,?),applied_at=?,membership_expires_at=?,updated_at=? WHERE order_id=? AND applied_at IS NULL`)
      .bind(transactionId,now,now,expiresAt,now,payment.order_id),
    env.DB.prepare(`UPDATE users SET membership_status='active',membership_expires_at=?,membership_source='qris',membership_plan_id=?,access_updated_at=? WHERE id=? AND role!='admin'`)
      .bind(expiresAt,payment.plan_id,now,payment.user_id)
  ]);
  await audit(env,{id:payment.user_id},'membership.payment_applied','membership_payment',payment.order_id,{planId:payment.plan_id,expiresAt});
  return env.DB.prepare('SELECT * FROM membership_payments WHERE order_id=? LIMIT 1').bind(payment.order_id).first();
}
async function syncMembershipPayment(env,payment){
  const status=await midtransMembershipRequest(env,'/v2/'+encodeURIComponent(payment.order_id)+'/status',{method:'GET'});
  const gross=Number(status.gross_amount);
  if(!Number.isFinite(gross)||Math.round(gross)!==Number(payment.amount))throw Error('Nominal transaksi Midtrans tidak sesuai.');
  const nextStatus=String(status.transaction_status||payment.status||'unknown');
  const transactionId=String(status.transaction_id||'').slice(0,160);
  const statusChanged=nextStatus!==String(payment.status||'');
  const transactionChanged=Boolean(transactionId&&transactionId!==String(payment.midtrans_transaction_id||''));
  let current=payment;
  if(statusChanged||transactionChanged){
    const now=new Date().toISOString();
    await env.DB.prepare('UPDATE membership_payments SET status=?,midtrans_transaction_id=?,paid_at=CASE WHEN ?=\'settlement\' THEN COALESCE(paid_at,?) ELSE paid_at END,updated_at=? WHERE order_id=?')
      .bind(nextStatus,transactionId,nextStatus,now,now,payment.order_id).run();
    current=await env.DB.prepare('SELECT * FROM membership_payments WHERE order_id=? LIMIT 1').bind(payment.order_id).first();
  }
  return successfulMidtrans(status)?applyMembershipPayment(env,current,status):current;
}
async function handleMembershipCreatePayment(request,env){
  const user=await requireUser(request,env);
  if(!user)return json(request,env,{error:'Sesi tidak valid.'},401);
  if(user.role==='admin')return json(request,env,{error:'admin_permanent',message:'Admin memiliki membership permanen.'},409);
  if(!midtransMembershipConfigured(env))return json(request,env,{error:'payment_not_configured',message:'Pembayaran membership belum dikonfigurasi.'},503);
  await ensureMembershipSchema(env);
  const body=await request.json().catch(()=>({})),planId=String(body.planId||'');
  const plan=await env.DB.prepare('SELECT * FROM membership_plans WHERE id=? AND active=1 AND price_idr>0 LIMIT 1').bind(planId).first();
  if(!plan)return json(request,env,{error:'plan_not_available',message:'Paket membership tidak tersedia.'},404);
  const orderId='member-'+Date.now()+'-'+randomHex(12);
  const now=new Date().toISOString(),amount=Number(plan.price_idr);
  await env.DB.prepare(`INSERT INTO membership_payments (order_id,user_id,plan_id,amount,status,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?)`).bind(orderId,user.id,plan.id,amount,'creating',now,now).run();
  try{
    const base=String(env.MEMBERSHIP_PUBLIC_BASE_URL||new URL(request.url).origin).replace(/\/$/,'');
    const charge=await midtransMembershipRequest(env,'/v2/charge',{
      method:'POST',
      headers:{'X-Override-Notification':base+'/v1/membership/webhook'},
      body:JSON.stringify({
        payment_type:'qris',
        transaction_details:{order_id:orderId,gross_amount:amount},
        item_details:[{id:'membership-'+plan.id,price:amount,quantity:1,name:String(plan.name).slice(0,50)}],
        customer_details:{first_name:String(user.name||'Pengguna').slice(0,50),email:String(user.email||'').slice(0,254)},
        qris:{acquirer:'gopay'}
      })
    });
    const qr=(charge.actions||[]).find(action=>action.name==='generate-qr-code-v2')||(charge.actions||[]).find(action=>action.name==='generate-qr-code');
    if(!qr?.url)throw Error('Midtrans tidak mengembalikan URL QRIS.');
    await env.DB.prepare('UPDATE membership_payments SET status=?,midtrans_transaction_id=?,qr_url=?,updated_at=? WHERE order_id=?')
      .bind(String(charge.transaction_status||'pending'),String(charge.transaction_id||'').slice(0,160),String(qr.url||'').slice(0,2000),new Date().toISOString(),orderId).run();
    await audit(env,user,'membership.payment_created','membership_payment',orderId,{planId:plan.id,amount});
    return json(request,env,{orderId,planId:plan.id,planName:plan.name,amount,qrUrl:qr.url,status:charge.transaction_status||'pending'},201);
  }catch(error){
    await env.DB.prepare("UPDATE membership_payments SET status='error',updated_at=? WHERE order_id=?").bind(new Date().toISOString(),orderId).run();
    throw error;
  }
}
async function handleMembershipQrImage(request,env,orderId){
  const user=await requireUser(request,env);
  if(!user)return json(request,env,{error:'Sesi tidak valid.'},401);
  await ensureMembershipSchema(env);
  const payment=await env.DB.prepare('SELECT order_id,user_id,midtrans_transaction_id,qr_url,status FROM membership_payments WHERE order_id=? AND user_id=? LIMIT 1').bind(orderId,user.id).first();
  if(!payment)return json(request,env,{error:'Pembayaran tidak ditemukan.'},404);
  if(['settlement','expire','deny','cancel','error'].includes(String(payment.status||'')))return json(request,env,{error:'QRIS tidak lagi aktif untuk transaksi ini.'},410);

  let qrUrl=String(payment.qr_url||'');
  if(!qrUrl){
    try{
      const status=await midtransMembershipRequest(env,'/v2/'+encodeURIComponent(orderId)+'/status',{method:'GET'});
      if(!payment.midtrans_transaction_id&&status.transaction_id){
        payment.midtrans_transaction_id=String(status.transaction_id).slice(0,160);
        await env.DB.prepare('UPDATE membership_payments SET midtrans_transaction_id=?,updated_at=? WHERE order_id=?').bind(payment.midtrans_transaction_id,new Date().toISOString(),orderId).run();
      }
    }catch(error){
      console.error('QR status lookup failed',error);
    }
    if(payment.midtrans_transaction_id){
      qrUrl=midtransMembershipBase(env)+'/v2/qris/'+encodeURIComponent(payment.midtrans_transaction_id)+'/qr-code';
    }
  }
  if(!qrUrl)return json(request,env,{error:'URL QRIS belum tersedia dari Midtrans.'},404);

  let imageResponse=await fetch(qrUrl,{headers:{Accept:'image/png',Authorization:midtransMembershipAuth(env)}});
  if(!imageResponse.ok)imageResponse=await fetch(qrUrl,{headers:{Accept:'image/png'}});
  if(!imageResponse.ok)return json(request,env,{error:'Gambar QRIS tidak dapat diambil dari Midtrans.'},502);

  const image=await imageResponse.arrayBuffer();
  return new Response(image,{status:200,headers:{
    'Content-Type':imageResponse.headers.get('Content-Type')||'image/png',
    'Cache-Control':'no-store, max-age=0',
    ...corsHeaders(request,env)
  }});
}
async function handleMembershipPaymentStatus(request,env,orderId){
  const user=await requireUser(request,env);
  if(!user)return json(request,env,{error:'Sesi tidak valid.'},401);
  await ensureMembershipSchema(env);
  const payment=await env.DB.prepare('SELECT * FROM membership_payments WHERE order_id=? AND user_id=? LIMIT 1').bind(orderId,user.id).first();
  if(!payment)return json(request,env,{error:'Pembayaran tidak ditemukan.'},404);
  const current=['settlement','expire','deny','cancel','error'].includes(payment.status)?payment:await syncMembershipPayment(env,payment);
  return json(request,env,{orderId:current.order_id,status:current.status,paid:current.status==='settlement',applied:Boolean(current.applied_at),expiresAt:current.membership_expires_at||null,qrUrl:current.qr_url||null});
}
async function handleMembershipWebhook(request,env){
  if(!midtransMembershipConfigured(env))return json(request,env,{received:true,ignored:true});
  await ensureMembershipSchema(env);
  const body=await request.json().catch(()=>({})),orderId=safeMembershipOrderId(body.order_id);
  if(!orderId)return json(request,env,{received:true,ignored:true});
  const payment=await env.DB.prepare('SELECT * FROM membership_payments WHERE order_id=? LIMIT 1').bind(orderId).first();
  if(!payment)return json(request,env,{received:true,ignored:true});
  await syncMembershipPayment(env,payment);
  return json(request,env,{received:true});
}
async function accountSummary(env,user){
  await ensureMembershipSchema(env);await ensureDatasetSchema(env);
  const [usage,quota,sessions,payment]=await Promise.all([
    datasetUsage(env,user.id),
    userQuota(env,user),
    env.DB.prepare('SELECT COUNT(*) AS n FROM sessions WHERE user_id=? AND revoked_at IS NULL AND expires_at>?').bind(user.id,new Date().toISOString()).first(),
    env.DB.prepare('SELECT order_id,plan_id,amount,status,paid_at,membership_expires_at,created_at FROM membership_payments WHERE user_id=? ORDER BY created_at DESC LIMIT 1').bind(user.id).first()
  ]);
  return {user:publicUser(user),usage,quota,activeSessions:Number(sessions?.n||0),lastPayment:payment||null};
}
async function handleAccountSummary(request,env){
  const user=await requireUser(request,env);
  if(!user)return json(request,env,{error:'Sesi tidak valid.'},401);
  return json(request,env,await accountSummary(env,user));
}
async function handleAccountMembershipCancel(request,env){
  const user=await requireUser(request,env);
  if(!user)return json(request,env,{error:'Sesi tidak valid.'},401);
  if(user.role==='admin')return json(request,env,{error:'admin_permanent',message:'Membership admin bersifat permanen dan tidak dapat dibatalkan dari akun.'},409);
  if(!membershipActive(user))return json(request,env,{error:'membership_not_active',message:'Tidak ada membership aktif yang dapat dibatalkan.'},409);
  const now=new Date().toISOString();
  await env.DB.prepare(`UPDATE users
    SET membership_status='cancelled',membership_expires_at=?,membership_source='user_cancelled',access_updated_at=?
    WHERE id=? AND role!='admin'`).bind(now,now,user.id).run();
  await audit(env,user,'membership.cancelled','user',user.id,{previousPlanId:user.membership_plan_id||null,previousExpiresAt:user.membership_expires_at||null,cancelledAt:now});
  const updated=await env.DB.prepare('SELECT id,email,email_verified,name,picture_url,role,membership_status,membership_expires_at,membership_source,membership_plan_id,account_status,created_at,last_login_at FROM users WHERE id=? LIMIT 1').bind(user.id).first();
  return json(request,env,{ok:true,cancelledAt:now,user:publicUser(updated)});
}
async function handleAccountSessions(request,env){
  const user=await requireUser(request,env);
  if(!user)return json(request,env,{error:'Sesi tidak valid.'},401);
  const currentHash=await sha256(sessionToken(request));
  const result=await env.DB.prepare(`SELECT id,token_hash,created_at,expires_at,last_seen_at,revoked_at,user_agent FROM sessions
    WHERE user_id=? ORDER BY last_seen_at DESC LIMIT 50`).bind(user.id).all();
  return json(request,env,{items:(result.results||[]).map(row=>({
    id:row.id,current:row.token_hash===currentHash,createdAt:row.created_at,expiresAt:row.expires_at,lastSeenAt:row.last_seen_at,
    revoked:Boolean(row.revoked_at),device:sessionDeviceLabel(row.user_agent)
  }))});
}
async function handleAccountRevokeSession(request,env,sessionId){
  const user=await requireUser(request,env);
  if(!user)return json(request,env,{error:'Sesi tidak valid.'},401);
  const currentHash=await sha256(sessionToken(request));
  const target=await env.DB.prepare('SELECT id,token_hash FROM sessions WHERE id=? AND user_id=? LIMIT 1').bind(sessionId,user.id).first();
  if(!target)return json(request,env,{error:'Sesi tidak ditemukan.'},404);
  if(target.token_hash===currentHash)return json(request,env,{error:'current_session',message:'Gunakan tombol Keluar untuk sesi perangkat ini.'},409);
  await env.DB.prepare('UPDATE sessions SET revoked_at=? WHERE id=? AND user_id=?').bind(new Date().toISOString(),sessionId,user.id).run();
  await audit(env,user,'auth.session_revoked','session',sessionId,{});
  return json(request,env,{ok:true});
}
async function handleAccountRevokeOthers(request,env){
  const user=await requireUser(request,env);
  if(!user)return json(request,env,{error:'Sesi tidak valid.'},401);
  const currentHash=await sha256(sessionToken(request)),now=new Date().toISOString();
  const result=await env.DB.prepare('UPDATE sessions SET revoked_at=? WHERE user_id=? AND token_hash!=? AND revoked_at IS NULL').bind(now,user.id,currentHash).run();
  const revoked=Number(result?.meta?.changes||0);
  await audit(env,user,'auth.sessions_revoked_others','user',user.id,{count:revoked});
  return json(request,env,{ok:true,revoked});
}
async function handleAccountPayments(request,env){
  const user=await requireUser(request,env);
  if(!user)return json(request,env,{error:'Sesi tidak valid.'},401);
  await ensureMembershipSchema(env);
  const result=await env.DB.prepare(`SELECT p.order_id,p.plan_id,pl.name AS plan_name,p.amount,p.status,p.paid_at,p.membership_expires_at,p.created_at
    FROM membership_payments p LEFT JOIN membership_plans pl ON pl.id=p.plan_id
    WHERE p.user_id=? ORDER BY p.created_at DESC LIMIT 100`).bind(user.id).all();
  return json(request,env,{items:result.results||[]});
}
async function handleAccountExport(request,env){
  const user=await requireUser(request,env);
  if(!user)return json(request,env,{error:'Sesi tidak valid.'},401);
  await ensureDatasetSchema(env);await ensureMembershipSchema(env);
  const [datasets,payments]=await Promise.all([
    env.DB.prepare('SELECT id,name,content,meta_json,revision,created_at,updated_at,deleted_at FROM user_datasets WHERE user_id=? ORDER BY updated_at').bind(user.id).all(),
    env.DB.prepare('SELECT order_id,plan_id,amount,status,paid_at,membership_expires_at,created_at FROM membership_payments WHERE user_id=? ORDER BY created_at').bind(user.id).all()
  ]);
  return json(request,env,{exportedAt:new Date().toISOString(),account:publicUser(user),datasets:(datasets.results||[]).map(datasetPayload),membershipPayments:payments.results||[]},200,{'Content-Disposition':'attachment; filename="irvan-account-export.json"'});
}
async function handleDevelopMidtransDiagnostic(request,env){
  const access=await requireAdminUser(request,env);
  if(access.error)return json(request,env,{error:access.error},access.error==='unauthenticated'?401:403);
  const hint=midtransCredentialHint(env);
  const result={configured:midtransMembershipConfigured(env),...hint,verified:false,httpStatus:null};
  if(!hint.ok)return json(request,env,result,200);
  try{
    const response=await fetch(midtransMembershipBase(env)+'/v2/agrotik-credential-check-does-not-exist/status',{
      method:'GET',
      headers:{Accept:'application/json',Authorization:midtransMembershipAuth(env)}
    });
    result.httpStatus=response.status;
    result.verified=response.status!==401;
    if(response.status===401){
      const data=await response.json().catch(()=>({}));
      result.ok=false;
      result.code='midtrans_unauthorized';
      result.message=(Array.isArray(data?.error_messages)?data.error_messages.join(' · '):'')||'Midtrans menolak Server Key.';
    }else{
      result.ok=true;
      result.code='credential_verified';
      result.message='Midtrans menerima autentikasi Server Key untuk environment ini.';
    }
  }catch(error){
    result.ok=false;result.code='network_error';result.message=String(error?.message||error);
  }
  return json(request,env,result);
}
async function handleDevelopPlans(request,env){
  const access=await requireAdminUser(request,env);
  if(access.error)return json(request,env,{error:access.error},access.error==='unauthenticated'?401:403);
  await ensureMembershipSchema(env);
  const result=await env.DB.prepare('SELECT * FROM membership_plans ORDER BY sort_order,id').all();
  return json(request,env,{items:result.results||[],paymentConfigured:midtransMembershipConfigured(env)});
}
async function handleDevelopPlanUpdate(request,env,planId){
  const access=await requireAdminUser(request,env),admin=access.user;
  if(access.error)return json(request,env,{error:access.error},access.error==='unauthenticated'?401:403);
  await ensureMembershipSchema(env);
  const body=await request.json().catch(()=>({})),existing=await env.DB.prepare('SELECT * FROM membership_plans WHERE id=? LIMIT 1').bind(planId).first();
  if(!existing)return json(request,env,{error:'Paket tidak ditemukan.'},404);
  const name=String(body.name??existing.name).trim().slice(0,100),description=String(body.description??existing.description).trim().slice(0,500);
  const durationDays=Math.max(1,Math.min(3650,Number(body.durationDays??existing.duration_days)||30));
  const priceIdr=Math.max(0,Math.min(100000000,Math.round(Number(body.priceIdr??existing.price_idr)||0)));
  const datasetLimit=Math.max(1,Math.min(5000,Math.round(Number(body.datasetLimit??existing.dataset_limit)||30)));
  const storageLimitBytes=Math.max(1048576,Math.min(10*1024*1024*1024,Math.round(Number(body.storageLimitBytes??existing.storage_limit_bytes)||20971520)));
  let active=body.active===undefined?Number(existing.active):body.active?1:0;
  if(planId==='manual')active=0;
  if(active&&priceIdr<=0)return json(request,env,{error:'invalid_public_price',message:'Paket publik harus memiliki harga lebih dari Rp0.'},400);
  const now=new Date().toISOString();
  await env.DB.prepare(`UPDATE membership_plans SET name=?,description=?,duration_days=?,price_idr=?,dataset_limit=?,storage_limit_bytes=?,active=?,updated_at=? WHERE id=?`)
    .bind(name,description,durationDays,priceIdr,datasetLimit,storageLimitBytes,active,now,planId).run();
  await audit(env,admin,'membership.plan_updated','membership_plan',planId,{durationDays,priceIdr,datasetLimit,storageLimitBytes,active:Boolean(active)});
  return json(request,env,{ok:true});
}
async function handleDevelopPayments(request,env,url){
  const access=await requireAdminUser(request,env);
  if(access.error)return json(request,env,{error:access.error},access.error==='unauthenticated'?401:403);
  await ensureMembershipSchema(env);
  const limit=Math.min(500,Math.max(1,Number(url.searchParams.get('limit'))||200));
  const result=await env.DB.prepare(`SELECT p.order_id,p.user_id,u.email,u.name,p.plan_id,pl.name AS plan_name,p.amount,p.status,p.paid_at,p.applied_at,p.membership_expires_at,p.created_at
    FROM membership_payments p LEFT JOIN users u ON u.id=p.user_id LEFT JOIN membership_plans pl ON pl.id=p.plan_id
    ORDER BY p.created_at DESC LIMIT ?`).bind(limit).all();
  return json(request,env,{items:result.results||[]});
}
async function handleDevelopAllDatasets(request,env,url){
  const access=await requireAdminUser(request,env);
  if(access.error)return json(request,env,{error:access.error},access.error==='unauthenticated'?401:403);
  await ensureDatasetSchema(env);
  const limit=Math.min(1000,Math.max(1,Number(url.searchParams.get('limit'))||300));
  const result=await env.DB.prepare(`SELECT d.id,d.user_id,u.email,u.name AS user_name,d.name AS dataset_name,d.revision,length(CAST(d.content AS BLOB))+length(CAST(d.meta_json AS BLOB)) AS size_bytes,d.created_at,d.updated_at,d.deleted_at
    FROM user_datasets d LEFT JOIN users u ON u.id=d.user_id ORDER BY d.updated_at DESC LIMIT ?`).bind(limit).all();
  return json(request,env,{items:result.results||[]});
}
async function handleDevelopContributions(request,env,url){
  const access=await requireAdminUser(request,env);
  if(access.error)return json(request,env,{error:access.error},access.error==='unauthenticated'?401:403);
  const limit=Math.min(500,Math.max(1,Number(url.searchParams.get('limit'))||100));
  const result=await env.DB.prepare(`SELECT id,sample,width,height,predicted_count,final_count,prediction_method,model_version,correction_count,quality_score,status,created_at
    FROM contributions ORDER BY created_at DESC LIMIT ?`).bind(limit).all();
  return json(request,env,{items:result.results||[]});
}
async function handleDevelopAudit(request,env,url){
  const access=await requireAdminUser(request,env);
  if(access.error)return json(request,env,{error:access.error},access.error==='unauthenticated'?401:403);
  await ensureOperationsSchema(env);
  const limit=Math.min(1000,Math.max(1,Number(url.searchParams.get('limit'))||250));
  const result=await env.DB.prepare(`SELECT a.id,a.actor_user_id,u.email AS actor_email,a.action,a.target_type,a.target_id,a.detail_json,a.created_at
    FROM audit_logs a LEFT JOIN users u ON u.id=a.actor_user_id ORDER BY a.created_at DESC LIMIT ?`).bind(limit).all();
  return json(request,env,{items:(result.results||[]).map(row=>({...row,detail:safeJsonText(row.detail_json)}))});
}
function safeJsonText(value){try{return JSON.parse(value||'{}');}catch{return {};}}
async function handleDevelopUsage(request,env){
  const access=await requireAdminUser(request,env);
  if(access.error)return json(request,env,{error:access.error},access.error==='unauthenticated'?401:403);
  await ensureDatasetSchema(env);
  const [datasets,sessions,users,contrib]=await Promise.all([
    env.DB.prepare(`SELECT COUNT(*) AS datasets,COALESCE(SUM(length(CAST(content AS BLOB))+length(CAST(meta_json AS BLOB))),0) AS bytes,COALESCE(SUM(revision),0) AS revisions FROM user_datasets WHERE deleted_at IS NULL`).first(),
    env.DB.prepare(`SELECT COUNT(*) AS total,SUM(CASE WHEN revoked_at IS NULL AND expires_at>? THEN 1 ELSE 0 END) AS active FROM sessions`).bind(new Date().toISOString()).first(),
    env.DB.prepare('SELECT COUNT(*) AS n FROM users').first(),
    env.DB.prepare('SELECT COUNT(*) AS n,COALESCE(SUM(length(image)),0) AS bytes FROM contributions').first()
  ]);
  return json(request,env,{estimated:{
    users:Number(users?.n||0),datasets:Number(datasets?.datasets||0),datasetBytes:Number(datasets?.bytes||0),datasetRevisionWrites:Number(datasets?.revisions||0),
    sessions:Number(sessions?.total||0),activeSessions:Number(sessions?.active||0),contributions:Number(contrib?.n||0),contributionImageBytes:Number(contrib?.bytes||0)
  },note:'Ini estimasi penggunaan aplikasi dari D1, bukan meter resmi kuota akun Cloudflare.'});
}
async function handleDevelopSecurity(request,env){
  const access=await requireAdminUser(request,env);
  if(access.error)return json(request,env,{error:access.error},access.error==='unauthenticated'?401:403);
  await ensureOperationsSchema(env);
  const now=new Date(),nowIso=now.toISOString(),dayAgo=new Date(now.getTime()-86400000).toISOString(),weekAgo=new Date(now.getTime()-7*86400000).toISOString();
  const [sessions,users,auditRows,lastBackup]=await Promise.all([
    env.DB.prepare(`SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN revoked_at IS NULL AND expires_at>? THEN 1 ELSE 0 END) AS active,
      SUM(CASE WHEN revoked_at IS NOT NULL THEN 1 ELSE 0 END) AS revoked,
      SUM(CASE WHEN revoked_at IS NULL AND expires_at>? AND expires_at<=? THEN 1 ELSE 0 END) AS expiring_24h
      FROM sessions`).bind(nowIso,nowIso,new Date(now.getTime()+86400000).toISOString()).first(),
    env.DB.prepare(`SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN account_status!='active' THEN 1 ELSE 0 END) AS suspended,
      SUM(CASE WHEN last_login_at>=? THEN 1 ELSE 0 END) AS logged_in_7d
      FROM users`).bind(weekAgo).first(),
    env.DB.prepare(`SELECT action,COUNT(*) AS n FROM audit_logs WHERE created_at>=? GROUP BY action ORDER BY n DESC LIMIT 30`).bind(dayAgo).all(),
    env.DB.prepare(`SELECT status,size_bytes,created_at FROM backup_runs ORDER BY created_at DESC LIMIT 1`).first()
  ]);
  const events=Object.fromEntries((auditRows.results||[]).map(row=>[row.action,Number(row.n||0)]));
  return json(request,env,{
    generatedAt:nowIso,
    sessions:{total:Number(sessions?.total||0),active:Number(sessions?.active||0),revoked:Number(sessions?.revoked||0),expiring24h:Number(sessions?.expiring_24h||0)},
    users:{total:Number(users?.total||0),suspended:Number(users?.suspended||0),loggedIn7d:Number(users?.logged_in_7d||0)},
    events24h:events,
    controls:{
      httpOnlyCookie:true,csrf:true,sessionRotationHours:SESSION_ROTATE_HOURS,turnstile:Boolean(env.TURNSTILE_SECRET),
      contributionRateLimit:Boolean(env.CONTRIBUTION_RATE_LIMITER),datasetRateLimit:Boolean(env.DATASET_RATE_LIMITER),
      r2Backups:Boolean(env.BACKUPS),edgeAbuseEventsPersisted:false
    },
    lastBackup:lastBackup?{status:lastBackup.status,sizeBytes:Number(lastBackup.size_bytes||0),createdAt:lastBackup.created_at}:null
  });
}

async function handleDevelopSupportView(request,env,userId){
  const access=await requireAdminUser(request,env),admin=access.user;
  if(access.error)return json(request,env,{error:access.error},access.error==='unauthenticated'?401:403);
  const target=await env.DB.prepare('SELECT id,email,email_verified,name,picture_url,role,membership_status,membership_expires_at,membership_source,membership_plan_id,account_status,created_at,last_login_at FROM users WHERE id=? LIMIT 1').bind(userId).first();
  if(!target)return json(request,env,{error:'Pengguna tidak ditemukan.'},404);
  const summary=await accountSummary(env,target);
  const data=await env.DB.prepare('SELECT id,name,revision,updated_at,deleted_at FROM user_datasets WHERE user_id=? ORDER BY updated_at DESC LIMIT 50').bind(userId).all();
  await audit(env,admin,'support.readonly_view','user',userId,{});
  return json(request,env,{...summary,datasets:data.results||[],mode:'read-only'});
}
async function handleDevelopAccountStatus(request,env,userId){
  const access=await requireAdminUser(request,env),admin=access.user;
  if(access.error)return json(request,env,{error:access.error},access.error==='unauthenticated'?401:403);
  const target=await env.DB.prepare('SELECT id,email,email_verified,role,account_status FROM users WHERE id=? LIMIT 1').bind(userId).first();
  if(!target)return json(request,env,{error:'Pengguna tidak ditemukan.'},404);
  if(target.role==='admin'||(target.email_verified&&isAdminEmail(target.email,env)))return json(request,env,{error:'Akun admin tidak dapat ditangguhkan.'},409);
  const body=await request.json().catch(()=>({})),status=String(body.status||'active');
  if(!['active','suspended'].includes(status))return json(request,env,{error:'Status akun tidak valid.'},400);
  await env.DB.prepare('UPDATE users SET account_status=?,access_updated_at=? WHERE id=?').bind(status,new Date().toISOString(),userId).run();
  if(status==='suspended')await env.DB.prepare('UPDATE sessions SET revoked_at=? WHERE user_id=? AND revoked_at IS NULL').bind(new Date().toISOString(),userId).run();
  await audit(env,admin,'user.account_status','user',userId,{status});
  return json(request,env,{ok:true,status});
}
async function handleDevelopRevokeSessions(request,env,userId){
  const access=await requireAdminUser(request,env),admin=access.user;
  if(access.error)return json(request,env,{error:access.error},access.error==='unauthenticated'?401:403);
  const result=await env.DB.prepare('UPDATE sessions SET revoked_at=? WHERE user_id=? AND revoked_at IS NULL').bind(new Date().toISOString(),userId).run();
  await audit(env,admin,'user.sessions_revoked','user',userId,{count:Number(result?.meta?.changes||0)});
  return json(request,env,{ok:true,revoked:Number(result?.meta?.changes||0)});
}
async function buildBackupPayload(env){
  await ensureAuthSchema(env);await ensureDatasetSchema(env);await ensureMembershipSchema(env);await ensureOperationsSchema(env);
  const [users,datasets,plans,payments,auditRows,contributionMeta]=await Promise.all([
    env.DB.prepare('SELECT id,google_sub,email,email_verified,name,picture_url,created_at,updated_at,last_login_at,role,membership_status,membership_expires_at,membership_source,access_updated_at,membership_plan_id,account_status FROM users').all(),
    env.DB.prepare('SELECT * FROM user_datasets').all(),
    env.DB.prepare('SELECT * FROM membership_plans').all(),
    env.DB.prepare('SELECT * FROM membership_payments').all(),
    env.DB.prepare('SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 5000').all(),
    env.DB.prepare(`SELECT id,sample,mime_type,width,height,boxes_json,predicted_boxes_json,predicted_count,final_count,prediction_method,model_version,correction_count,quality_score,status,created_at FROM contributions ORDER BY created_at`).all()
  ]);
  return {version:1,exportedAt:new Date().toISOString(),users:users.results||[],datasets:datasets.results||[],membershipPlans:plans.results||[],membershipPayments:payments.results||[],auditLogs:auditRows.results||[],contributionMetadata:contributionMeta.results||[],note:'Blob gambar kontribusi AI tidak disertakan dalam logical backup akun.'};
}
async function createBackupSnapshot(env,actor=null,note='manual'){
  await ensureOperationsSchema(env);
  if(!env.BACKUPS)throw Error('R2 binding BACKUPS belum dikonfigurasi.');
  const payload=await buildBackupPayload(env),text=JSON.stringify(payload),id=crypto.randomUUID(),key='d1-logical/'+new Date().toISOString().slice(0,10)+'/'+id+'.json';
  await env.BACKUPS.put(key,text,{httpMetadata:{contentType:'application/json'},customMetadata:{createdAt:payload.exportedAt,note:String(note).slice(0,100)}});
  await env.DB.prepare('INSERT INTO backup_runs (id,object_key,status,size_bytes,note,created_at) VALUES (?,?,?,?,?,?)')
    .bind(id,key,'success',new TextEncoder().encode(text).byteLength,String(note).slice(0,200),payload.exportedAt).run();
  if(actor)await audit(env,actor,'backup.created','backup',id,{key,sizeBytes:new TextEncoder().encode(text).byteLength});
  return {id,key,sizeBytes:new TextEncoder().encode(text).byteLength,createdAt:payload.exportedAt};
}
async function handleDevelopBackups(request,env){
  const access=await requireAdminUser(request,env),admin=access.user;
  if(access.error)return json(request,env,{error:access.error},access.error==='unauthenticated'?401:403);
  await ensureOperationsSchema(env);
  if(request.method==='POST'){
    try{return json(request,env,{ok:true,backup:await createBackupSnapshot(env,admin,'manual')},201);}
    catch(error){return json(request,env,{error:'backup_unavailable',message:error.message},503);}
  }
  const result=await env.DB.prepare('SELECT id,object_key,status,size_bytes,note,created_at FROM backup_runs ORDER BY created_at DESC LIMIT 100').all();
  return json(request,env,{items:result.results||[],r2Configured:Boolean(env.BACKUPS)});
}
async function handleDevelopBackupDownload(request,env,backupId){
  const access=await requireAdminUser(request,env),admin=access.user;
  if(access.error)return json(request,env,{error:access.error},access.error==='unauthenticated'?401:403);
  if(!env.BACKUPS)return json(request,env,{error:'backup_unavailable'},503);
  const row=await env.DB.prepare('SELECT object_key FROM backup_runs WHERE id=? LIMIT 1').bind(backupId).first();
  if(!row)return json(request,env,{error:'Backup tidak ditemukan.'},404);
  const object=await env.BACKUPS.get(row.object_key);
  if(!object)return json(request,env,{error:'Objek backup tidak ditemukan.'},404);
  await audit(env,admin,'backup.downloaded','backup',backupId,{});
  return new Response(object.body,{headers:{'Content-Type':'application/json; charset=utf-8','Content-Disposition':'attachment; filename="irvan-backup-'+backupId+'.json"','Cache-Control':'no-store',...corsHeaders(request,env)}});
}
async function handleDevelopBackupExport(request,env){
  const access=await requireAdminUser(request,env),admin=access.user;
  if(access.error)return json(request,env,{error:access.error},access.error==='unauthenticated'?401:403);
  const payload=await buildBackupPayload(env);
  await audit(env,admin,'backup.exported','system','logical-export',{});
  return json(request,env,payload,200,{'Content-Disposition':'attachment; filename="irvan-logical-backup.json"'});
}

async function handleDevelopOverview(request,env){
  const access=await requireAdminUser(request,env);
  if(access.error==='unauthenticated')return json(request,env,{error:'Sesi tidak valid.'},401);
  if(access.error)return json(request,env,{error:'admin_required'},403);
  await ensureDatasetSchema(env);await ensureMembershipSchema(env);await ensureOperationsSchema(env);
  const now=new Date(),nowIso=now.toISOString(),dayAgo=new Date(now.getTime()-86400000).toISOString(),weekAgo=new Date(now.getTime()-7*86400000).toISOString();
  const [users,members,datasets,contributions,sessions,newUsers,payments,lastBackup]=await Promise.all([
    env.DB.prepare('SELECT COUNT(*) AS n FROM users').first(),
    env.DB.prepare(`SELECT COUNT(*) AS n FROM users WHERE role='admin' OR (membership_status='active' AND (membership_expires_at IS NULL OR membership_expires_at>?))`).bind(nowIso).first(),
    env.DB.prepare('SELECT COUNT(*) AS n,COALESCE(SUM(length(CAST(content AS BLOB))+length(CAST(meta_json AS BLOB))),0) AS bytes FROM user_datasets WHERE deleted_at IS NULL').first(),
    env.DB.prepare('SELECT COUNT(*) AS n FROM contributions').first(),
    env.DB.prepare('SELECT COUNT(*) AS n FROM sessions WHERE revoked_at IS NULL AND expires_at>? AND last_seen_at>?').bind(nowIso,dayAgo).first(),
    env.DB.prepare('SELECT COUNT(*) AS n FROM users WHERE created_at>?').bind(weekAgo).first(),
    env.DB.prepare("SELECT COUNT(*) AS n,COALESCE(SUM(amount),0) AS revenue FROM membership_payments WHERE status='settlement'").first(),
    env.DB.prepare("SELECT created_at,status,size_bytes FROM backup_runs WHERE status='success' ORDER BY created_at DESC LIMIT 1").first()
  ]);
  return json(request,env,{ok:true,stats:{
    users:Number(users?.n||0),
    entitledUsers:Number(members?.n||0),
    datasets:Number(datasets?.n||0),
    datasetBytes:Number(datasets?.bytes||0),
    contributions:Number(contributions?.n||0),
    activeSessions24h:Number(sessions?.n||0),
    newUsers7d:Number(newUsers?.n||0),
    settledPayments:Number(payments?.n||0),
    membershipRevenueIdr:Number(payments?.revenue||0),
    lastBackupAt:lastBackup?.created_at||null,
    lastBackupBytes:Number(lastBackup?.size_bytes||0)
  },generatedAt:nowIso});
}
async function handleDevelopUsers(request,env,url){
  const access=await requireAdminUser(request,env);
  if(access.error==='unauthenticated')return json(request,env,{error:'Sesi tidak valid.'},401);
  if(access.error)return json(request,env,{error:'admin_required'},403);
  await ensureDatasetSchema(env);
  const limit=Math.min(500,Math.max(1,Number(url.searchParams.get('limit'))||200));
  const result=await env.DB.prepare(`SELECT u.id,u.email,u.name,u.picture_url,u.role,u.membership_status,u.membership_expires_at,u.membership_source,u.membership_plan_id,u.account_status,u.created_at,u.last_login_at,
    SUM(CASE WHEN d.id IS NOT NULL AND d.deleted_at IS NULL THEN 1 ELSE 0 END) AS dataset_count
    FROM users u LEFT JOIN user_datasets d ON d.user_id=u.id
    GROUP BY u.id ORDER BY u.last_login_at DESC LIMIT ?`).bind(limit).all();
  return json(request,env,{items:(result.results||[]).map(row=>({
    id:row.id,email:row.email,name:row.name,picture:row.picture_url||'',role:row.role||'user',
    membership:{status:row.role==='admin'?'active':(row.membership_status||'inactive'),active:membershipActive(row),expiresAt:row.membership_expires_at||null,source:row.role==='admin'?'admin':(row.membership_source||'none'),planId:row.role==='admin'?'admin':(row.membership_plan_id||null)},
    accountStatus:row.account_status||'active',datasetCount:Number(row.dataset_count||0),createdAt:row.created_at,lastLoginAt:row.last_login_at
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
  await ensureMembershipSchema(env);
  const body=await request.json().catch(()=>({})),status=String(body.status||'inactive');
  if(!['active','inactive'].includes(status))return json(request,env,{error:'Status membership tidak valid.'},400);
  const planId=status==='active'?String(body.planId||'manual'):'';
  if(status==='active'){
    const plan=await env.DB.prepare('SELECT id FROM membership_plans WHERE id=? LIMIT 1').bind(planId).first();
    if(!plan)return json(request,env,{error:'Paket membership tidak valid.'},400);
  }
  let expiresAt=null;
  if(status==='active'&&body.expiresAt){
    const parsed=Date.parse(String(body.expiresAt));
    if(!Number.isFinite(parsed))return json(request,env,{error:'Tanggal kedaluwarsa tidak valid.'},400);
    expiresAt=new Date(parsed).toISOString();
  }
  const now=new Date().toISOString();
  await env.DB.prepare(`UPDATE users SET membership_status=?,membership_expires_at=?,membership_source='manual',membership_plan_id=?,access_updated_at=? WHERE id=?`)
    .bind(status,expiresAt,status==='active'?planId:null,now,userId).run();
  await audit(env,access.user,'membership.manual_update','user',userId,{status,planId:status==='active'?planId:null,expiresAt});
  const row=await env.DB.prepare('SELECT id,email,email_verified,name,picture_url,role,membership_status,membership_expires_at,membership_source,membership_plan_id,account_status,created_at,last_login_at FROM users WHERE id=? LIMIT 1').bind(userId).first();
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
async function ensureContributionSchema(env){
  if(CONTRIBUTION_SCHEMA_READY)return;
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS contributions (
    id TEXT PRIMARY KEY,
    sample TEXT NOT NULL,
    image BLOB NOT NULL,
    mime_type TEXT NOT NULL,
    width INTEGER NOT NULL,
    height INTEGER NOT NULL,
    boxes_json TEXT NOT NULL,
    predicted_boxes_json TEXT NOT NULL,
    predicted_count INTEGER NOT NULL,
    final_count INTEGER NOT NULL,
    prediction_method TEXT NOT NULL,
    model_version TEXT NOT NULL,
    correction_count INTEGER NOT NULL,
    quality_score REAL NOT NULL,
    status TEXT NOT NULL DEFAULT 'candidate',
    created_at TEXT NOT NULL,
    edit_token_hash TEXT,
    updated_at TEXT
  )`).run();
  const info=await env.DB.prepare('PRAGMA table_info(contributions)').all(),columns=new Set((info.results||[]).map(row=>row.name));
  if(!columns.has('edit_token_hash'))await env.DB.prepare('ALTER TABLE contributions ADD COLUMN edit_token_hash TEXT').run();
  if(!columns.has('updated_at'))await env.DB.prepare('ALTER TABLE contributions ADD COLUMN updated_at TEXT').run();
  await env.DB.batch([
    env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_contributions_created_at ON contributions(created_at)'),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_contributions_status ON contributions(status)')
  ]);
  CONTRIBUTION_SCHEMA_READY=true;
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
  if(requestTooLarge(request,MAX_CONTRIBUTION_REQUEST_BYTES))return json(request,env,{error:'Permintaan unggahan terlalu besar.'},413);
  if(!(await rateLimitAllowed(env,'CONTRIBUTION_RATE_LIMITER',anonymousRateKey(request)))){
    return json(request,env,{error:'Terlalu banyak unggahan. Coba lagi sesaat lagi.'},429,{'Retry-After':'60'});
  }
  if(!(await verifyTurnstile(request,env)))return json(request,env,{error:'Verifikasi anti-bot tidak valid.'},403);
  await ensureContributionSchema(env);
  const form=await request.formData(),image=form.get('image'),operationId=String(form.get('operation_id')||'');
  if(!validOperationId(operationId))return json(request,env,{error:'operation_id tidak valid.'},400);
  const replayed=await replayOperation(env,'contribution:create',operationId);
  if(replayed)return json(request,env,replayed);
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
  const id=crypto.randomUUID(),createdAt=new Date().toISOString(),score=qualityScore(predictedCount,finalCount,correctionCount),editToken=randomToken(24),editTokenHash=await sha256(editToken);
  const bytes=await image.arrayBuffer();

  await env.DB.prepare(`INSERT INTO contributions
    (id,sample,image,mime_type,width,height,boxes_json,predicted_boxes_json,predicted_count,final_count,prediction_method,model_version,correction_count,quality_score,status,created_at,edit_token_hash,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .bind(id,sample,bytes,image.type,width,height,JSON.stringify(boxes),JSON.stringify(predictedBoxes),predictedCount,finalCount,method,modelVersion,correctionCount,score,'candidate',createdAt,editTokenHash,createdAt)
    .run();

  const payload={ok:true,id,editToken,qualityScore:score,finalCount};
  await rememberOperation(env,'contribution:create',operationId,payload);
  return json(request,env,payload);
}
async function handleContributionPatch(request,env,id){
  if(!(await verifyTurnstile(request,env)))return json(request,env,{error:'Verifikasi anti-bot tidak valid.'},403);
  await ensureContributionSchema(env);
  if(!validDatasetId(id))return json(request,env,{error:'ID kontribusi tidak valid.'},400);
  const editToken=request.headers.get('X-Contribution-Edit')||'';
  if(!editToken)return json(request,env,{error:'Token edit kontribusi tidak tersedia.'},401);
  const body=await request.json().catch(()=>null),operationId=String(body?.operationId||'');
  if(!validOperationId(operationId))return json(request,env,{error:'operation_id tidak valid.'},400);
  const scope='contribution:update:'+id,replayed=await replayOperation(env,scope,operationId);
  if(replayed)return json(request,env,replayed);
  const row=await env.DB.prepare('SELECT id,edit_token_hash,predicted_boxes_json FROM contributions WHERE id=? LIMIT 1').bind(id).first();
  if(!row)return json(request,env,{error:'Kontribusi tidak ditemukan.'},404);
  if(!row.edit_token_hash||await sha256(editToken)!==row.edit_token_hash)return json(request,env,{error:'Token edit kontribusi tidak valid.'},403);
  const boxes=body?.boxes,predictedBoxes=body?.predictedBoxes??JSON.parse(row.predicted_boxes_json||'[]');
  if(!validBoxes(boxes)||!validBoxes(predictedBoxes))return json(request,env,{error:'Bounding box tidak valid.'},400);
  const predictedCount=predictedBoxes.length,finalCount=boxes.length;
  const correctionCount=Math.abs(finalCount-predictedCount)+(JSON.stringify(boxes)===JSON.stringify(predictedBoxes)?0:1);
  const method=String(body?.predictionMethod||'manual').slice(0,40),modelVersion=String(body?.modelVersion||'unknown').slice(0,80);
  const score=qualityScore(predictedCount,finalCount,correctionCount),now=new Date().toISOString();
  await env.DB.prepare(`UPDATE contributions SET boxes_json=?,predicted_boxes_json=?,predicted_count=?,final_count=?,prediction_method=?,model_version=?,correction_count=?,quality_score=?,updated_at=? WHERE id=?`)
    .bind(JSON.stringify(boxes),JSON.stringify(predictedBoxes),predictedCount,finalCount,method,modelVersion,correctionCount,score,now,id).run();
  const payload={ok:true,id,updated:true,qualityScore:score,finalCount};
  await rememberOperation(env,scope,operationId,payload);
  return json(request,env,payload);
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


function gamePlayer(row){
  if(!row)return null;
  return {
    id:row.user_id||row.id,
    name:row.name||'Pemain',
    picture:row.picture_url||'',
    score:Number(row.score)||0,
    bestYield:Number(row.best_yield)||0,
    season:Number(row.season)||1,
    level:Number(row.level)||1,
    legacy:Number(row.legacy)||0,
    location:row.location||'zero',
    updatedAt:row.updated_at||null
  };
}
async function gameMutationGuard(request,env,user,scope='write'){
  if(!(await rateLimitAllowed(env,'DATASET_RATE_LIMITER','game:'+scope+':'+user.id))){
    return json(request,env,{error:'Terlalu banyak aksi game. Coba lagi sesaat lagi.'},429,{'Retry-After':'60'});
  }
  return null;
}
function parseGameProfile(body){
  const bestYield=Number(body?.bestYield),season=Math.round(Number(body?.season)),level=Math.round(Number(body?.level)),legacy=Math.round(Number(body?.legacy)),xp=Math.round(Number(body?.xp)),rivalWins=Math.round(Number(body?.rivalWins)),achievements=Math.round(Number(body?.achievements)),totalYield=Number(body?.totalYield),location=String(body?.location||'zero').slice(0,32);
  if(!Number.isFinite(bestYield)||bestYield<0||bestYield>1500)return null;
  if(!Number.isInteger(season)||season<1||season>500)return null;
  if(!Number.isInteger(level)||level<1||level>500)return null;
  if(!Number.isInteger(legacy)||legacy<0||legacy>50)return null;
  if(!Number.isInteger(xp)||xp<0||xp>5000000)return null;
  if(!Number.isInteger(rivalWins)||rivalWins<0||rivalWins>season)return null;
  if(!Number.isInteger(achievements)||achievements<0||achievements>64)return null;
  if(!Number.isFinite(totalYield)||totalYield<0||totalYield>season*1500+1500)return null;
  if(!/^[a-z0-9_-]{1,32}$/i.test(location))return null;
  const score=Math.min(50000000,Math.round(bestYield*120+totalYield*5+level*80+legacy*1500+rivalWins*300+achievements*120+Math.min(xp,1000000)*0.25));
  return {score,bestYield,season,level,legacy,location};
}
async function handleGameProfilePut(request,env){
  const user=await requireUser(request,env);
  if(!user)return json(request,env,{error:'Sesi tidak valid.'},401);
  const guard=await gameMutationGuard(request,env,user,'profile');if(guard)return guard;
  await ensureGameSchema(env);
  const profile=parseGameProfile(await request.json().catch(()=>null));
  if(!profile)return json(request,env,{error:'Profil game tidak valid.'},400);
  const now=new Date().toISOString();
  await env.DB.prepare(`INSERT INTO game_profiles (user_id,score,score_version,best_yield,season,level,legacy,location,updated_at)
    VALUES (?,?,2,?,?,?,?,?,?)
    ON CONFLICT(user_id) DO UPDATE SET
      score=excluded.score,
      score_version=2,
      best_yield=MAX(game_profiles.best_yield,excluded.best_yield),
      season=excluded.season,
      level=excluded.level,
      legacy=MAX(game_profiles.legacy,excluded.legacy),
      location=excluded.location,
      updated_at=excluded.updated_at`)
    .bind(user.id,profile.score,profile.bestYield,profile.season,profile.level,profile.legacy,profile.location,now).run();
  const row=await env.DB.prepare(`SELECT gp.*,u.name,u.picture_url FROM game_profiles gp JOIN users u ON u.id=gp.user_id WHERE gp.user_id=? LIMIT 1`).bind(user.id).first();
  return json(request,env,{ok:true,profile:gamePlayer(row)});
}
async function handleGameLeaderboard(request,env,url){
  const user=await requireUser(request,env);
  if(!user)return json(request,env,{error:'Sesi tidak valid.'},401);
  await ensureGameSchema(env);
  const limit=Math.max(5,Math.min(50,Number(url.searchParams.get('limit'))||20));
  const result=await env.DB.prepare(`SELECT gp.*,u.name,u.picture_url
    FROM game_profiles gp JOIN users u ON u.id=gp.user_id
    WHERE u.account_status='active' AND gp.score_version=2
    ORDER BY gp.score DESC,gp.best_yield DESC,gp.updated_at ASC LIMIT ?`).bind(limit).all();
  const own=await env.DB.prepare('SELECT score FROM game_profiles WHERE user_id=? AND score_version=2 LIMIT 1').bind(user.id).first();
  let rank=null;
  if(own){
    const higher=await env.DB.prepare('SELECT COUNT(*) AS total FROM game_profiles WHERE score_version=2 AND score>?').bind(Number(own.score)||0).first();
    rank=(Number(higher?.total)||0)+1;
  }
  return json(request,env,{items:(result.results||[]).map(gamePlayer),myRank:rank});
}
async function handleGamePlayerSearch(request,env,url){
  const user=await requireUser(request,env);
  if(!user)return json(request,env,{error:'Sesi tidak valid.'},401);
  await ensureGameSchema(env);
  const query=String(url.searchParams.get('q')||'').trim().slice(0,80);
  if(query.length<2)return json(request,env,{items:[]});
  const result=await env.DB.prepare(`SELECT u.id AS user_id,u.name,u.picture_url,
      COALESCE(gp.score,0) AS score,COALESCE(gp.best_yield,0) AS best_yield,COALESCE(gp.season,1) AS season,
      COALESCE(gp.level,1) AS level,COALESCE(gp.legacy,0) AS legacy,COALESCE(gp.location,'zero') AS location,gp.updated_at
    FROM users u LEFT JOIN game_profiles gp ON gp.user_id=u.id
    WHERE u.account_status='active' AND u.id!=? AND instr(lower(u.name),lower(?))>0
    ORDER BY COALESCE(gp.score,0) DESC,u.name ASC LIMIT 12`).bind(user.id,query).all();
  return json(request,env,{items:(result.results||[]).map(gamePlayer)});
}
async function handleGameFriends(request,env){
  const user=await requireUser(request,env);
  if(!user)return json(request,env,{error:'Sesi tidak valid.'},401);
  await ensureGameSchema(env);
  const [friends,incoming,outgoing]=await env.DB.batch([
    env.DB.prepare(`SELECT u.id AS user_id,u.name,u.picture_url,COALESCE(gp.score,0) AS score,COALESCE(gp.best_yield,0) AS best_yield,
      COALESCE(gp.season,1) AS season,COALESCE(gp.level,1) AS level,COALESCE(gp.legacy,0) AS legacy,COALESCE(gp.location,'zero') AS location,gp.updated_at
      FROM game_friends gf JOIN users u ON u.id=gf.friend_id LEFT JOIN game_profiles gp ON gp.user_id=u.id
      WHERE gf.user_id=? AND gf.status='accepted' AND u.account_status='active' ORDER BY COALESCE(gp.score,0) DESC,u.name ASC`).bind(user.id),
    env.DB.prepare(`SELECT u.id AS user_id,u.name,u.picture_url,COALESCE(gp.score,0) AS score,COALESCE(gp.best_yield,0) AS best_yield,
      COALESCE(gp.season,1) AS season,COALESCE(gp.level,1) AS level,COALESCE(gp.legacy,0) AS legacy,COALESCE(gp.location,'zero') AS location,gp.updated_at
      FROM game_friends gf JOIN users u ON u.id=gf.user_id LEFT JOIN game_profiles gp ON gp.user_id=u.id
      WHERE gf.friend_id=? AND gf.status='pending' AND u.account_status='active' ORDER BY gf.created_at ASC`).bind(user.id),
    env.DB.prepare(`SELECT u.id AS user_id,u.name,u.picture_url,COALESCE(gp.score,0) AS score,COALESCE(gp.best_yield,0) AS best_yield,
      COALESCE(gp.season,1) AS season,COALESCE(gp.level,1) AS level,COALESCE(gp.legacy,0) AS legacy,COALESCE(gp.location,'zero') AS location,gp.updated_at
      FROM game_friends gf JOIN users u ON u.id=gf.friend_id LEFT JOIN game_profiles gp ON gp.user_id=u.id
      WHERE gf.user_id=? AND gf.status='pending' AND u.account_status='active' ORDER BY gf.created_at ASC`).bind(user.id)
  ]);
  return json(request,env,{
    friends:(friends.results||[]).map(gamePlayer),
    incoming:(incoming.results||[]).map(gamePlayer),
    outgoing:(outgoing.results||[]).map(gamePlayer)
  });
}
async function handleGameFriendRequest(request,env){
  const user=await requireUser(request,env);
  if(!user)return json(request,env,{error:'Sesi tidak valid.'},401);
  const guard=await gameMutationGuard(request,env,user,'friend');if(guard)return guard;
  await ensureGameSchema(env);
  const body=await request.json().catch(()=>null),targetId=String(body?.targetUserId||'');
  if(!validDatasetId(targetId)||targetId===user.id)return json(request,env,{error:'Pemain tidak valid.'},400);
  const target=await env.DB.prepare("SELECT id FROM users WHERE id=? AND account_status='active' LIMIT 1").bind(targetId).first();
  if(!target)return json(request,env,{error:'Pemain tidak ditemukan.'},404);
  const current=await env.DB.prepare('SELECT status FROM game_friends WHERE user_id=? AND friend_id=? LIMIT 1').bind(user.id,targetId).first();
  if(current?.status==='accepted')return json(request,env,{error:'Sudah berteman.'},409);
  const reverse=await env.DB.prepare('SELECT status FROM game_friends WHERE user_id=? AND friend_id=? LIMIT 1').bind(targetId,user.id).first();
  if(reverse?.status==='pending')return json(request,env,{error:'Permintaan dari pemain ini sudah menunggu Anda.'},409);
  const now=new Date().toISOString();
  await env.DB.prepare(`INSERT INTO game_friends (user_id,friend_id,status,created_at,updated_at) VALUES (?,?,'pending',?,?)
    ON CONFLICT(user_id,friend_id) DO UPDATE SET status='pending',updated_at=excluded.updated_at`).bind(user.id,targetId,now,now).run();
  return json(request,env,{ok:true});
}
async function handleGameFriendAccept(request,env,requesterId){
  const user=await requireUser(request,env);
  if(!user)return json(request,env,{error:'Sesi tidak valid.'},401);
  if(!validDatasetId(requesterId)||requesterId===user.id)return json(request,env,{error:'Pemain tidak valid.'},400);
  const guard=await gameMutationGuard(request,env,user,'friend');if(guard)return guard;
  await ensureGameSchema(env);
  const pending=await env.DB.prepare("SELECT status FROM game_friends WHERE user_id=? AND friend_id=? AND status='pending' LIMIT 1").bind(requesterId,user.id).first();
  if(!pending)return json(request,env,{error:'Permintaan teman tidak ditemukan.'},404);
  const now=new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare("UPDATE game_friends SET status='accepted',updated_at=? WHERE user_id=? AND friend_id=?").bind(now,requesterId,user.id),
    env.DB.prepare(`INSERT INTO game_friends (user_id,friend_id,status,created_at,updated_at) VALUES (?,?,'accepted',?,?)
      ON CONFLICT(user_id,friend_id) DO UPDATE SET status='accepted',updated_at=excluded.updated_at`).bind(user.id,requesterId,now,now)
  ]);
  return json(request,env,{ok:true});
}
async function handleGameFriendRemove(request,env,targetId){
  const user=await requireUser(request,env);
  if(!user)return json(request,env,{error:'Sesi tidak valid.'},401);
  if(!validDatasetId(targetId)||targetId===user.id)return json(request,env,{error:'Pemain tidak valid.'},400);
  const guard=await gameMutationGuard(request,env,user,'friend');if(guard)return guard;
  await ensureGameSchema(env);
  await env.DB.batch([
    env.DB.prepare('DELETE FROM game_friends WHERE user_id=? AND friend_id=?').bind(user.id,targetId),
    env.DB.prepare('DELETE FROM game_friends WHERE user_id=? AND friend_id=?').bind(targetId,user.id)
  ]);
  return json(request,env,{ok:true});
}
async function handleGameRaid(request,env,targetId){
  const user=await requireUser(request,env);
  if(!user)return json(request,env,{error:'Sesi tidak valid.'},401);
  if(!validDatasetId(targetId)||targetId===user.id)return json(request,env,{error:'Target tidak valid.'},400);
  const guard=await gameMutationGuard(request,env,user,'raid');if(guard)return guard;
  await ensureGameSchema(env);
  const friendship=await env.DB.prepare("SELECT status FROM game_friends WHERE user_id=? AND friend_id=? AND status='accepted' LIMIT 1").bind(user.id,targetId).first();
  if(!friendship)return json(request,env,{error:'Raid hanya dapat dilakukan ke teman.'},403);
  const last=await env.DB.prepare('SELECT created_at FROM game_raids WHERE attacker_id=? AND target_id=? ORDER BY created_at DESC LIMIT 1').bind(user.id,targetId).first();
  const shield=await env.DB.prepare('SELECT created_at FROM game_raids WHERE target_id=? ORDER BY created_at DESC LIMIT 1').bind(targetId).first();
  const shieldMs=2*60*60*1000,shieldAt=Date.parse(shield?.created_at||'');
  if(Number.isFinite(shieldAt)&&Date.now()-shieldAt<shieldMs){
    const retry=Math.max(60,Math.ceil((shieldMs-(Date.now()-shieldAt))/1000));
    return json(request,env,{error:'Target sedang terlindungi setelah raid sebelumnya.',retryAfterSec:retry},429,{'Retry-After':String(retry)});
  }
  const cooldownMs=12*60*60*1000,lastMs=Date.parse(last?.created_at||'');
  if(Number.isFinite(lastMs)&&Date.now()-lastMs<cooldownMs){
    const retry=Math.max(60,Math.ceil((cooldownMs-(Date.now()-lastMs))/1000));
    return json(request,env,{error:'Raid masih cooldown.',retryAfterSec:retry},429,{'Retry-After':String(retry)});
  }
  const pending=await env.DB.prepare('SELECT COUNT(*) AS total FROM game_raids WHERE target_id=? AND claimed_at IS NULL').bind(targetId).first();
  if((Number(pending?.total)||0)>=3)return json(request,env,{error:'Target sudah memiliki terlalu banyak raid yang belum diproses.'},409);
  const id=crypto.randomUUID(),now=new Date().toISOString();
  await env.DB.prepare('INSERT INTO game_raids (id,attacker_id,target_id,created_at,claimed_at) VALUES (?,?,?,?,NULL)').bind(id,user.id,targetId,now).run();
  await audit(env,user,'game.raid','user',targetId,{raidId:id});
  return json(request,env,{ok:true,raid:{id,createdAt:now,cooldownHours:12}});
}
async function handleGameRaidInbox(request,env){
  const user=await requireUser(request,env);
  if(!user)return json(request,env,{error:'Sesi tidak valid.'},401);
  await ensureGameSchema(env);
  const result=await env.DB.prepare(`SELECT r.id,r.created_at,u.id AS attacker_id,u.name AS attacker_name,u.picture_url AS attacker_picture
    FROM game_raids r JOIN users u ON u.id=r.attacker_id
    WHERE r.target_id=? AND r.claimed_at IS NULL ORDER BY r.created_at ASC LIMIT 10`).bind(user.id).all();
  return json(request,env,{items:(result.results||[]).map(row=>({
    id:row.id,createdAt:row.created_at,attacker:{id:row.attacker_id,name:row.attacker_name||'Teman',picture:row.attacker_picture||''}
  }))});
}
async function handleGameRaidClaim(request,env,raidId){
  const user=await requireUser(request,env);
  if(!user)return json(request,env,{error:'Sesi tidak valid.'},401);
  if(!validDatasetId(raidId))return json(request,env,{error:'Raid tidak valid.'},400);
  await ensureGameSchema(env);
  const row=await env.DB.prepare('SELECT id FROM game_raids WHERE id=? AND target_id=? AND claimed_at IS NULL LIMIT 1').bind(raidId,user.id).first();
  if(!row)return json(request,env,{error:'Raid tidak ditemukan.'},404);
  await env.DB.prepare('UPDATE game_raids SET claimed_at=? WHERE id=? AND target_id=? AND claimed_at IS NULL').bind(new Date().toISOString(),raidId,user.id).run();
  return json(request,env,{ok:true});
}
async function handleGameAid(request,env,targetId){
  const user=await requireUser(request,env);
  if(!user)return json(request,env,{error:'Sesi tidak valid.'},401);
  if(!validDatasetId(targetId)||targetId===user.id)return json(request,env,{error:'Target tidak valid.'},400);
  const guard=await gameMutationGuard(request,env,user,'aid');if(guard)return guard;
  await ensureGameSchema(env);
  const friendship=await env.DB.prepare("SELECT status FROM game_friends WHERE user_id=? AND friend_id=? AND status='accepted' LIMIT 1").bind(user.id,targetId).first();
  if(!friendship)return json(request,env,{error:'Bantuan hanya dapat dikirim ke teman.'},403);
  const last=await env.DB.prepare('SELECT created_at FROM game_aids WHERE helper_id=? AND target_id=? ORDER BY created_at DESC LIMIT 1').bind(user.id,targetId).first();
  const cooldownMs=6*60*60*1000,lastMs=Date.parse(last?.created_at||'');
  if(Number.isFinite(lastMs)&&Date.now()-lastMs<cooldownMs){
    const retry=Math.max(60,Math.ceil((cooldownMs-(Date.now()-lastMs))/1000));
    return json(request,env,{error:'Bantuan masih cooldown.',retryAfterSec:retry},429,{'Retry-After':String(retry)});
  }
  const id=crypto.randomUUID(),now=new Date().toISOString();
  await env.DB.prepare('INSERT INTO game_aids (id,helper_id,target_id,created_at,claimed_at) VALUES (?,?,?,?,NULL)').bind(id,user.id,targetId,now).run();
  await audit(env,user,'game.aid','user',targetId,{aidId:id});
  return json(request,env,{ok:true,aid:{id,createdAt:now,cooldownHours:6}});
}
async function handleGameAidInbox(request,env){
  const user=await requireUser(request,env);
  if(!user)return json(request,env,{error:'Sesi tidak valid.'},401);
  await ensureGameSchema(env);
  const result=await env.DB.prepare(`SELECT a.id,a.created_at,u.id AS helper_id,u.name AS helper_name,u.picture_url AS helper_picture
    FROM game_aids a JOIN users u ON u.id=a.helper_id
    WHERE a.target_id=? AND a.claimed_at IS NULL ORDER BY a.created_at ASC LIMIT 10`).bind(user.id).all();
  return json(request,env,{items:(result.results||[]).map(row=>({
    id:row.id,createdAt:row.created_at,helper:{id:row.helper_id,name:row.helper_name||'Teman',picture:row.helper_picture||''}
  }))});
}
async function handleGameAidClaim(request,env,aidId){
  const user=await requireUser(request,env);
  if(!user)return json(request,env,{error:'Sesi tidak valid.'},401);
  if(!validDatasetId(aidId))return json(request,env,{error:'Bantuan tidak valid.'},400);
  await ensureGameSchema(env);
  const row=await env.DB.prepare('SELECT id FROM game_aids WHERE id=? AND target_id=? AND claimed_at IS NULL LIMIT 1').bind(aidId,user.id).first();
  if(!row)return json(request,env,{error:'Bantuan tidak ditemukan.'},404);
  await env.DB.prepare('UPDATE game_aids SET claimed_at=? WHERE id=? AND target_id=? AND claimed_at IS NULL').bind(new Date().toISOString(),aidId,user.id).run();
  return json(request,env,{ok:true});
}

export default {
  async scheduled(event,env,ctx){
    if(!env.BACKUPS)return;
    ctx.waitUntil(createBackupSnapshot(env,null,'scheduled').catch(error=>console.error('scheduled backup failed',error)));
  },
  async fetch(request,env){
    if(request.method==='OPTIONS')return new Response(null,{status:204,headers:corsHeaders(request,env)});
    const url=new URL(request.url);
    try{
      if(request.method==='GET'&&url.pathname==='/v1/auth/google/start')await cleanupAuth(env);
      if(request.method==='GET'&&url.pathname==='/v1/health')return json(request,env,{ok:true,service:'hitung-cabai-api',authConfigured:authConfigured(env),datasetSync:true,membershipAccess:true,developConsole:true,accountCenter:true,gameSocial:true,membershipPayments:midtransMembershipConfigured(env),midtransEnvironment:midtransEnvironment(env),apiVersion:'2026-09-26.14'});
      if(url.pathname.startsWith('/v1/auth/')||url.pathname.startsWith('/v1/datasets')||url.pathname.startsWith('/v1/develop/')||url.pathname.startsWith('/v1/account/')||url.pathname.startsWith('/v1/membership/')||url.pathname.startsWith('/v1/game/'))await ensureAuthSchema(env);
      if(url.pathname.startsWith('/v1/game/'))await ensureGameSchema(env);
      const csrfFailure=await csrfGuard(request,env,url);
      if(csrfFailure)return csrfFailure;
      if(request.method==='GET'&&url.pathname==='/v1/auth/google/start')return await handleGoogleStart(request,env,url);
      if(request.method==='GET'&&url.pathname==='/v1/auth/google/callback')return await handleGoogleCallback(request,env,url);
      if(request.method==='POST'&&url.pathname==='/v1/auth/exchange')return await handleAuthExchange(request,env);
      if(request.method==='GET'&&url.pathname==='/v1/auth/session')return await handleAuthSession(request,env);
      if(request.method==='GET'&&url.pathname==='/v1/auth/profile')return await handleAuthProfile(request,env);
      if(request.method==='POST'&&url.pathname==='/v1/auth/logout')return await handleAuthLogout(request,env);
      if(request.method==='GET'&&url.pathname==='/v1/membership/plans')return await handleMembershipPlans(request,env);
      if(request.method==='POST'&&url.pathname==='/v1/membership/payments')return await handleMembershipCreatePayment(request,env);
      const membershipPaymentQrMatch=url.pathname.match(/^\/v1\/membership\/payments\/(member-[0-9]+-[a-f0-9]{24})\/qr$/i);
      if(request.method==='GET'&&membershipPaymentQrMatch)return await handleMembershipQrImage(request,env,membershipPaymentQrMatch[1]);
      const membershipPaymentMatch=url.pathname.match(/^\/v1\/membership\/payments\/(member-[0-9]+-[a-f0-9]{24})$/i);
      if(request.method==='GET'&&membershipPaymentMatch)return await handleMembershipPaymentStatus(request,env,membershipPaymentMatch[1]);
      if(request.method==='POST'&&url.pathname==='/v1/membership/webhook')return await handleMembershipWebhook(request,env);
      if(request.method==='GET'&&url.pathname==='/v1/account/summary')return await handleAccountSummary(request,env);
      if(request.method==='POST'&&url.pathname==='/v1/account/membership/cancel')return await handleAccountMembershipCancel(request,env);
      if(request.method==='GET'&&url.pathname==='/v1/account/sessions')return await handleAccountSessions(request,env);
      if(request.method==='POST'&&url.pathname==='/v1/account/sessions/revoke-others')return await handleAccountRevokeOthers(request,env);
      const accountSessionMatch=url.pathname.match(/^\/v1\/account\/sessions\/([0-9a-f-]{36})$/i);
      if(request.method==='DELETE'&&accountSessionMatch)return await handleAccountRevokeSession(request,env,accountSessionMatch[1]);
      if(request.method==='GET'&&url.pathname==='/v1/account/payments')return await handleAccountPayments(request,env);
      if(request.method==='GET'&&url.pathname==='/v1/account/export')return await handleAccountExport(request,env);
      if(request.method==='PUT'&&url.pathname==='/v1/game/profile')return await handleGameProfilePut(request,env);
      if(request.method==='GET'&&url.pathname==='/v1/game/leaderboard')return await handleGameLeaderboard(request,env,url);
      if(request.method==='GET'&&url.pathname==='/v1/game/players')return await handleGamePlayerSearch(request,env,url);
      if(request.method==='GET'&&url.pathname==='/v1/game/friends')return await handleGameFriends(request,env);
      if(request.method==='POST'&&url.pathname==='/v1/game/friends')return await handleGameFriendRequest(request,env);
      const gameFriendAccept=url.pathname.match(/^\/v1\/game\/friends\/([0-9a-f-]{36})\/accept$/i);
      if(request.method==='POST'&&gameFriendAccept)return await handleGameFriendAccept(request,env,gameFriendAccept[1]);
      const gameFriendMatch=url.pathname.match(/^\/v1\/game\/friends\/([0-9a-f-]{36})$/i);
      if(request.method==='DELETE'&&gameFriendMatch)return await handleGameFriendRemove(request,env,gameFriendMatch[1]);
      if(request.method==='GET'&&url.pathname==='/v1/game/raids/inbox')return await handleGameRaidInbox(request,env);
      if(request.method==='GET'&&url.pathname==='/v1/game/aids/inbox')return await handleGameAidInbox(request,env);
      const gameRaidClaim=url.pathname.match(/^\/v1\/game\/raids\/([0-9a-f-]{36})\/claim$/i);
      if(request.method==='POST'&&gameRaidClaim)return await handleGameRaidClaim(request,env,gameRaidClaim[1]);
      const gameAidClaim=url.pathname.match(/^\/v1\/game\/aids\/([0-9a-f-]{36})\/claim$/i);
      if(request.method==='POST'&&gameAidClaim)return await handleGameAidClaim(request,env,gameAidClaim[1]);
      const gameRaidTarget=url.pathname.match(/^\/v1\/game\/raids\/([0-9a-f-]{36})$/i);
      if(request.method==='POST'&&gameRaidTarget)return await handleGameRaid(request,env,gameRaidTarget[1]);
      const gameAidTarget=url.pathname.match(/^\/v1\/game\/aids\/([0-9a-f-]{36})$/i);
      if(request.method==='POST'&&gameAidTarget)return await handleGameAid(request,env,gameAidTarget[1]);
      if(request.method==='GET'&&url.pathname==='/v1/develop/overview')return await handleDevelopOverview(request,env);
      if(request.method==='GET'&&url.pathname==='/v1/develop/users')return await handleDevelopUsers(request,env,url);
      if(request.method==='GET'&&url.pathname==='/v1/develop/midtrans-diagnostic')return await handleDevelopMidtransDiagnostic(request,env);
      if(request.method==='GET'&&url.pathname==='/v1/develop/plans')return await handleDevelopPlans(request,env);
      const developPlanMatch=url.pathname.match(/^\/v1\/develop\/plans\/([a-z0-9_-]{2,40})$/i);
      if(request.method==='PUT'&&developPlanMatch)return await handleDevelopPlanUpdate(request,env,developPlanMatch[1]);
      if(request.method==='GET'&&url.pathname==='/v1/develop/payments')return await handleDevelopPayments(request,env,url);
      if(request.method==='GET'&&url.pathname==='/v1/develop/datasets')return await handleDevelopAllDatasets(request,env,url);
      if(request.method==='GET'&&url.pathname==='/v1/develop/contributions')return await handleDevelopContributions(request,env,url);
      if(request.method==='GET'&&url.pathname==='/v1/develop/audit')return await handleDevelopAudit(request,env,url);
      if(request.method==='GET'&&url.pathname==='/v1/develop/usage')return await handleDevelopUsage(request,env);
      if(request.method==='GET'&&url.pathname==='/v1/develop/security')return await handleDevelopSecurity(request,env);
      if((request.method==='GET'||request.method==='POST')&&url.pathname==='/v1/develop/backups')return await handleDevelopBackups(request,env);
      if(request.method==='GET'&&url.pathname==='/v1/develop/backups/export')return await handleDevelopBackupExport(request,env);
      const developBackupMatch=url.pathname.match(/^\/v1\/develop\/backups\/([0-9a-f-]{36})\/download$/i);
      if(request.method==='GET'&&developBackupMatch)return await handleDevelopBackupDownload(request,env,developBackupMatch[1]);
      const developDatasetsMatch=url.pathname.match(/^\/v1\/develop\/users\/([0-9a-f-]{36})\/datasets$/i);
      if(request.method==='GET'&&developDatasetsMatch)return await handleDevelopUserDatasets(request,env,developDatasetsMatch[1]);
      const developSupportMatch=url.pathname.match(/^\/v1\/develop\/users\/([0-9a-f-]{36})\/support-view$/i);
      if(request.method==='GET'&&developSupportMatch)return await handleDevelopSupportView(request,env,developSupportMatch[1]);
      const developStatusMatch=url.pathname.match(/^\/v1\/develop\/users\/([0-9a-f-]{36})\/account-status$/i);
      if(request.method==='POST'&&developStatusMatch)return await handleDevelopAccountStatus(request,env,developStatusMatch[1]);
      const developRevokeSessionsMatch=url.pathname.match(/^\/v1\/develop\/users\/([0-9a-f-]{36})\/revoke-sessions$/i);
      if(request.method==='POST'&&developRevokeSessionsMatch)return await handleDevelopRevokeSessions(request,env,developRevokeSessionsMatch[1]);
      const developAccessMatch=url.pathname.match(/^\/v1\/develop\/users\/([0-9a-f-]{36})\/access$/i);
      if(request.method==='POST'&&developAccessMatch)return await handleDevelopAccess(request,env,developAccessMatch[1]);
      if(request.method==='GET'&&url.pathname==='/v1/datasets')return await handleDatasetList(request,env,url);
      const datasetMatch=url.pathname.match(/^\/v1\/datasets\/([0-9a-f-]{36})$/i);
      if(request.method==='GET'&&datasetMatch)return await handleDatasetGet(request,env,datasetMatch[1]);
      if(request.method==='PUT'&&datasetMatch)return await handleDatasetPut(request,env,datasetMatch[1]);
      if(request.method==='PATCH'&&datasetMatch)return await handleDatasetPatch(request,env,datasetMatch[1]);
      if(request.method==='DELETE'&&datasetMatch)return await handleDatasetDelete(request,env,datasetMatch[1]);
      if(request.method==='POST'&&url.pathname==='/v1/contributions')return await handleContribution(request,env);
      const contributionMatch=url.pathname.match(/^\/v1\/contributions\/([0-9a-f-]{36})$/i);
      if(request.method==='PATCH'&&contributionMatch)return await handleContributionPatch(request,env,contributionMatch[1]);
      if(request.method==='GET'&&url.pathname==='/v1/admin/manifest')return await handleManifest(request,env,url);
      const imageMatch=url.pathname.match(/^\/v1\/admin\/image\/([0-9a-f-]+)$/i);
      if(request.method==='GET'&&imageMatch)return await handleImage(request,env,imageMatch[1]);
      return json(request,env,{error:'Endpoint tidak ditemukan.'},404);
    }catch(error){
      console.error(error);
      if(url.pathname.startsWith('/v1/membership/')){
        const message=String(error?.message||'Layanan membership sedang bermasalah.').slice(0,300);
        return json(request,env,{error:'membership_upstream_error',message},502);
      }
      return json(request,env,{error:'Server tidak dapat memproses permintaan.'},500);
    }
  }
};
