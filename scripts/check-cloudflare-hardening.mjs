import fs from 'node:fs';

function fail(message){console.error('Cloudflare hardening check failed:',message);process.exit(1);}
function requireText(text,marker,label){if(!text.includes(marker))fail(label+' missing '+marker);}

const worker=fs.readFileSync('cloudflare/hitung-cabai-worker/src/index.js','utf8');
const schema=fs.readFileSync('cloudflare/hitung-cabai-worker/schema.sql','utf8');
const sync=fs.readFileSync('src/account-dataset-sync.js','utf8');
const workflow=fs.readFileSync('.github/workflows/deploy-hitung-cabai-worker.yml','utf8');
const develop=fs.readFileSync('public/develop/app.js','utf8');
const account=fs.readFileSync('public/account.js','utf8');
const gameSync=fs.readFileSync('public/game/sync.js','utf8');
const gameSocial=fs.readFileSync('public/game/social.js','utf8');
const chiliSync=fs.readFileSync('public/hitung-cabai/cloud-sync.js','utf8');
const membership=fs.readFileSync('public/membership/app.js','utf8');
const ghPages=fs.readFileSync('.github/workflows/deploy.yml','utf8');
const cfPages=fs.readFileSync('.github/workflows/deploy-cloudflare-pages.yml','utf8');

for(const marker of [
  'image_object_key','image_size_bytes','storage_backend',
  'env.IMAGES.put','env.IMAGES.get','cleanupCloudData',
  'IDEMPOTENCY_RETENTION_DAYS','AUDIT_RETENTION_DAYS','DELETED_DATASET_RETENTION_DAYS',
  "quotaGuard:true","idempotentSync:true","cloud_temporarily_unavailable",
  "Retry-After","migrateLegacyContributionImages","/v1/develop/contributions/migrate-images",
  'DEFAULT_CLOUD_POLICY','CLOUDFLARE_FREE_REFERENCE','app_settings','cloudFeatureGate',
  '/v1/develop/cloud-policy','d1_free_tier_exhausted','image_sha256','storeContributionImageR2',
  'verifyBackupObject','validateBackupPayload','/verify'
]) requireText(worker,marker,'Worker');

for(const marker of [
  'idx_contributions_status_created','idx_contributions_model_status',
  'idx_sessions_user_active','idx_user_datasets_user_deleted_updated',
  'idx_membership_payments_user_status_created','idx_audit_logs_action_created',
  'idx_idempotent_operations_scope_created','idx_contributions_image_sha256',
  'image_sha256','checksum_sha256','verified_at','validation_json','app_settings'
]) requireText(schema,marker,'D1 schema');

for(const marker of [
  'CIRCUIT_FAILURE_LIMIT','circuitOpenUntil','registerCloudFailure',
  "response?.headers?.get?.('Retry-After')",
  'Cloud dijeda sementara · data aman di perangkat','adaptiveDelay','changeBurst',
  'cloudpolicychange','policyAllowsSync'
]) requireText(sync,marker,'Dataset sync');

for(const marker of [
  'CLOUDFLARE_IMAGE_BUCKET','r2 bucket info','r2 bucket create',
  "binding:'IMAGES'","binding:'BACKUPS'",'r2 bucket lifecycle list',
  'agrotik-daily-30d','d1-logical/','agrotik-monthly-365d','d1-monthly/'
]) requireText(workflow,marker,'Deploy workflow');

for(const marker of [
  'contributionD1ImageBytes','contributionR2ImageBytes',
  'R2 foto kontribusi','Retention terjadwal','Idempotent sync',
  '/v1/develop/contributions/migrate-images','Migrasi selesai',
  '/v1/develop/cloud-policy','renderCloudPolicy','saveCloudPolicy',
  'D1 rows read/hari','backup-verify','Verifikasi backup'
]) requireText(develop,marker,'Develop UI');

for(const marker of ['account-cloud','CLOUD_HEALTH_CACHE_MS','window.IrvanCloudPolicy','cloudpolicychange','refreshCloudStatus'])
  requireText(account,marker,'Shared cloud status');
for(const marker of ['cloudSaveAllowed','policySyncDelay','cloudpolicychange'])
  requireText(gameSync,marker,'Game cloud save');
for(const marker of ['socialAllowed','Fitur sosial sedang dijeda','cloudpolicychange'])
  requireText(gameSocial,marker,'Game social');
for(const marker of ['cloudContributionConfigured','window.IrvanCloudPolicy','Kontribusi AI sedang dijeda'])
  requireText(chiliSync,marker,'Hitung Cabai cloud');
for(const marker of ['paymentsAllowed','Pembayaran dijeda','cloudpolicychange'])
  requireText(membership,marker,'Membership cloud policy');
for(const marker of ['paths:','scripts/public-build.mjs'])
  requireText(ghPages,marker,'GitHub Pages deploy filter');
for(const marker of ['scripts/public-build.mjs'])
  requireText(cfPages,marker,'Cloudflare Pages deploy filter');

console.log('Cloudflare hardening contract OK: budget policy, local-first circuit breakers, adaptive sync, D1 indexes, R2 dedupe/lifecycle, verified backups, emergency controls, and deploy guards.');
