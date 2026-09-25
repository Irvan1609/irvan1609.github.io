import fs from 'node:fs';

function fail(message){console.error('Admin membership check failed:',message);process.exit(1);}

const worker=fs.readFileSync('cloudflare/hitung-cabai-worker/src/index.js','utf8');
const account=fs.readFileSync('public/account.js','utf8');
const sync=fs.readFileSync('src/account-dataset-sync.js','utf8');
const payment=fs.readFileSync('src/payment-gate.js','utf8');
const develop=fs.readFileSync('public/develop/app.js','utf8');
const developHtml=fs.readFileSync('public/develop/index.html','utf8');

for(const marker of [
  "ADMIN_EMAIL_DEFAULT='andyirvan1609@gmail.com'",
  "role TEXT NOT NULL DEFAULT 'user'",
  "membership_status TEXT NOT NULL DEFAULT 'inactive'",
  "membership_expires_at",
  "membership_source",
  "requireAdminUser",
  "/v1/develop/overview",
  "/v1/develop/users",
  "/v1/account/summary",
  "/v1/membership/plans",
  "membership_required",
  "SESSION_TOUCH_MINUTES=15",
  "apiVersion:'2026-09-26.2'"
]) if(!worker.includes(marker))fail('Worker missing '+marker);

for(const marker of ['features:{','datasetSync:syncAccess','analysisIncluded:analysisIncluded','develop:row.role'])if(!worker.includes(marker))fail('Public entitlements missing '+marker);
if(!account.includes("currentUser.features?.develop")||!account.includes("location.assign('/develop/')"))fail('Admin account menu missing Develop Console');
if(!sync.includes('FALLBACK_SYNC_MS=10*60*1000')||!sync.includes("currentUser.features?.datasetSync"))fail('Optimized membership-only sync missing');
if(!payment.includes('includedAnalysisAccess')||!payment.includes("Membership · Analisis bebas")||!payment.includes("Admin · Analisis bebas"))fail('Payment bypass missing');
if(!developHtml.includes('noindex,nofollow,noarchive')||!develop.includes('/v1/develop/overview')||!develop.includes('/access'))fail('Develop console contract incomplete');

console.log('Admin membership contract OK: admin role, membership entitlements, optimized sync, payment bypass, and server-protected Develop Console are wired.');
