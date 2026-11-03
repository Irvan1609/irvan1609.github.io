import fs from 'node:fs';

function fail(message){
  console.error('Security contract failed:',message);
  process.exit(1);
}
function requireText(text,marker,label){
  if(!text.includes(marker))fail(label+' missing: '+marker);
}

const worker=fs.readFileSync('cloudflare/hitung-cabai-worker/src/index.js','utf8');
const account=fs.readFileSync('public/account.js','utf8');
const headers=fs.readFileSync('public/_headers','utf8');

const workerDeploy=fs.readFileSync('.github/workflows/deploy-hitung-cabai-worker.yml','utf8');
const securityWorkflow=fs.readFileSync('.github/workflows/security.yml','utf8');
const pagesWorkflow=fs.readFileSync('.github/workflows/deploy.yml','utf8');
const gitignore=fs.readFileSync('.gitignore','utf8');
const social=fs.readFileSync('public/game/social.js','utf8');
const ruleset=fs.readFileSync('.github/rulesets/master-protection.json','utf8');

for(const marker of [
  'MAX_IMAGE_BYTES=850000',
  'MAX_CONTRIBUTION_REQUEST_BYTES',
  'MAX_DATASET_REQUEST_BYTES',
  'CONTRIBUTION_RATE_LIMITER',
  'DATASET_RATE_LIMITER',
  'requestTooLarge',
  'datasetMutationGuard',
  'verifyTurnstile(request,env)',
  "SESSION_COOKIE='__Host-agrotik_session'",
  "CSRF_HEADER='X-Agrotik-CSRF'",
  'csrfGuard',
  'sessionCookie(',
  'rotateSessionIfNeeded',
  'sessionClientMeta',
  'handleDevelopSecurity',
  'BEARER_FALLBACK_HOURS=8',
  'SameSite=None; Partitioned',
  "if(cookie)return {token:cookie,source:'cookie'}",
  'authSource:credential.source'
]) requireText(worker,marker,'Worker security');

const unsafeDatasetLookup='SELECT id,user_id,revision,content,meta_json FROM user_datasets WHERE id=? LIMIT 1';
if(worker.includes(unsafeDatasetLookup))fail('dataset PUT performs an unscoped ownership lookup');

const scoped='WHERE id=? AND user_id=? LIMIT 1';
const scopedCount=worker.split(scoped).length-1;
if(scopedCount<6)fail('dataset access is not consistently scoped to user_id');

for(const marker of [
  'UPDATE user_datasets SET name=?,content=?,meta_json=?,revision=revision+1,updated_at=?,deleted_at=NULL WHERE id=? AND user_id=?',
  'UPDATE user_datasets SET content=?,revision=revision+1,updated_at=? WHERE id=? AND user_id=?',
  'UPDATE user_datasets SET revision=revision+1,updated_at=?,deleted_at=? WHERE id=? AND user_id=?'
]) requireText(worker,marker,'Dataset mutation ownership');

for(const marker of [
  "gitleaks/gitleaks-action@e0c47f4f8be36e29cdc102c57e68cb5cbf0e8d1e",
  'fetch-depth: 0',
  'npm run verify'
]) requireText(securityWorkflow,marker,'Security workflow');

for(const marker of [
  'Checkout full history',
  'fetch-depth: 0',
  "gitleaks/gitleaks-action@e0c47f4f8be36e29cdc102c57e68cb5cbf0e8d1e"
]) requireText(pagesWorkflow,marker,'GitHub Pages security workflow');

for(const marker of [
  "name:'CONTRIBUTION_RATE_LIMITER'",
  "name:'DATASET_RATE_LIMITER'",
  'ratelimits'
]) requireText(workerDeploy,marker,'Worker deployment rate-limit binding');

for(const marker of ['.env','.dev.vars','*.pem','*.key','**/wrangler.toml'])
  requireText(gitignore,marker,'.gitignore');

const forbidden=[
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /github_pat_[A-Za-z0-9_]{20,}/,
  /gh[pousr]_[A-Za-z0-9]{30,}/,
  /AKIA[0-9A-Z]{16}/
];
for(const file of ['public/hitung-cabai/cloud-config.js','public/account-config.js','src/payment-config.js']){
  if(!fs.existsSync(file))continue;
  const content=fs.readFileSync(file,'utf8');
  for(const pattern of forbidden)if(pattern.test(content))fail('high-confidence secret pattern found in '+file);
}

if(account.includes("localStorage.setItem(TOKEN_KEY"))fail('session token must not be persisted in localStorage');
for(const marker of ['SESSION_FALLBACK_KEY','FALLBACK_EXPIRES_KEY','credentials:\'include\'','X-Agrotik-CSRF','request:authFetch'])
  requireText(account,marker,'Browser session hardening');
if(social.includes("headers.set('Authorization'"))fail('Field Zero social must use the hardened account request instead of constructing bearer headers');
for(const marker of ['window.IrvanAccount?.request','window.IrvanAccount?.authenticated'])
  requireText(social,marker,'Field Zero session compatibility');
for(const marker of ['"Protect master"','"refs/heads/master"','"required_status_checks"','"verify"','"security"'])
  requireText(ruleset,marker,'Master ruleset template');
for(const marker of ['Content-Security-Policy:','Strict-Transport-Security:','X-Frame-Options: DENY'])
  requireText(headers,marker,'Pages security headers');

console.log('Security contract OK: ownership, HttpOnly+Partitioned cookie, short bearer fallback, CSRF, rotation, request caps, rate limits, Turnstile, CSP, social-session compatibility and secret scanning are wired.');
