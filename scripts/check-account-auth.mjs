import fs from 'node:fs';

function fail(message){
  console.error('Account auth check failed:',message);
  process.exit(1);
}

const worker=fs.readFileSync('cloudflare/hitung-cabai-worker/src/index.js','utf8');
const schema=fs.readFileSync('cloudflare/hitung-cabai-worker/schema.sql','utf8');
const account=fs.readFileSync('public/account.js','utf8');
const config=fs.readFileSync('public/account-config.js','utf8');
const css=fs.readFileSync('public/account.css','utf8');

for(const marker of ['/v1/auth/google/start','/v1/auth/google/callback','/v1/auth/exchange','/v1/auth/session','/v1/auth/profile','/v1/auth/logout','GOOGLE_CLIENT_ID','GOOGLE_CLIENT_SECRET','openidconnect.googleapis.com/v1/userinfo','ensureAuthSchema','token_hash','__Host-agrotik_session','csrfGuard','rotateSessionIfNeeded','user_agent','ip_hash']){
  if(!worker.includes(marker))fail('Worker missing '+marker);
}
for(const table of ['users','oauth_states','auth_exchange_codes','sessions']){
  if(!schema.includes('CREATE TABLE IF NOT EXISTS '+table))fail('schema missing '+table);
}
for(const marker of ['startLogin','refreshSession','logout','accountchange','LOGIN_STATE_KEY','SESSION_FALLBACK_KEY','CSRF_KEY','credentials:\'include\'','/v1/auth/exchange','/v1/auth/session']){
  if(!account.includes(marker))fail('account.js missing '+marker);
}
if(!config.includes('https://hitung-cabai-api.andyirvan1609.workers.dev'))fail('account API endpoint missing');
if(!css.includes('.account-login')||!css.includes('.account-menu')||!css.includes('@media(max-width:520px)'))fail('responsive account CSS missing');

for(const page of ['index.html','stat/index.html','public/hitung-cabai/index.html','public/kamera-pengukur/index.html','mendeley/index.html','print-skripsi/index.html']){
  const html=fs.readFileSync(page,'utf8');
  if(!html.includes('/account.css')||!html.includes('/account.js'))fail(page+' does not load account UI');
}
console.log('Account auth contract OK.');
