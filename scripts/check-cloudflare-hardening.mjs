import fs from 'node:fs';

function fail(message){console.error('Cloudflare hardening check failed:',message);process.exit(1);}
function requireText(text,marker,label){if(!text.includes(marker))fail(label+' missing '+marker);}

const worker=fs.readFileSync('cloudflare/hitung-cabai-worker/src/index.js','utf8');
const schema=fs.readFileSync('cloudflare/hitung-cabai-worker/schema.sql','utf8');
const sync=fs.readFileSync('src/account-dataset-sync.js','utf8');
const workflow=fs.readFileSync('.github/workflows/deploy-hitung-cabai-worker.yml','utf8');
const develop=fs.readFileSync('public/develop/app.js','utf8');

for(const marker of [
  'image_object_key','image_size_bytes','storage_backend',
  'env.IMAGES.put','env.IMAGES.get','cleanupCloudData',
  'IDEMPOTENCY_RETENTION_DAYS','AUDIT_RETENTION_DAYS','DELETED_DATASET_RETENTION_DAYS',
  "quotaGuard:true","idempotentSync:true","cloud_temporarily_unavailable",
  "Retry-After","migrateLegacyContributionImages","/v1/develop/contributions/migrate-images"
]) requireText(worker,marker,'Worker');

for(const marker of [
  'idx_contributions_status_created','idx_contributions_model_status',
  'idx_sessions_user_active','idx_user_datasets_user_deleted_updated',
  'idx_membership_payments_user_status_created','idx_audit_logs_action_created',
  'idx_idempotent_operations_scope_created'
]) requireText(schema,marker,'D1 schema');

for(const marker of [
  'CIRCUIT_FAILURE_LIMIT','circuitOpenUntil','registerCloudFailure',
  "response?.headers?.get?.('Retry-After')",
  'Cloud dijeda sementara · data aman di perangkat'
]) requireText(sync,marker,'Dataset sync');

for(const marker of [
  'CLOUDFLARE_IMAGE_BUCKET','r2 bucket info','r2 bucket create',
  "binding:'IMAGES'","binding:'BACKUPS'"
]) requireText(workflow,marker,'Deploy workflow');

for(const marker of [
  'contributionD1ImageBytes','contributionR2ImageBytes',
  'R2 foto kontribusi','Retention terjadwal','Idempotent sync',
  '/v1/develop/contributions/migrate-images','Migrasi selesai'
]) requireText(develop,marker,'Develop UI');

console.log('Cloudflare hardening contract OK: local-first circuit breaker, D1 indexes, R2 image storage, retention, and deploy guards.');
