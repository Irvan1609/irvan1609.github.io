import fs from 'node:fs';

function fail(message){console.error('Account platform check failed:',message);process.exit(1);}

const worker=fs.readFileSync('cloudflare/hitung-cabai-worker/src/index.js','utf8');
const schema=fs.readFileSync('cloudflare/hitung-cabai-worker/schema.sql','utf8');
const account=fs.readFileSync('public/account-center/app.js','utf8');
const membership=fs.readFileSync('public/membership/app.js','utf8');
const develop=fs.readFileSync('public/develop/app.js','utf8');
const developHtml=fs.readFileSync('public/develop/index.html','utf8');

for(const marker of [
  'CREATE TABLE IF NOT EXISTS membership_plans',
  'CREATE TABLE IF NOT EXISTS membership_payments',
  'CREATE TABLE IF NOT EXISTS audit_logs',
  'CREATE TABLE IF NOT EXISTS backup_runs'
]) if(!schema.includes(marker))fail('schema missing '+marker);

for(const marker of [
  'handleMembershipCreatePayment','handleMembershipWebhook','applyMembershipPayment',
  'handleAccountSummary','handleAccountSessions','handleAccountPayments','handleAccountExport',
  'handleDevelopPlanUpdate','handleDevelopPayments','handleDevelopAllDatasets','handleDevelopAudit',
  'handleDevelopSupportView','handleDevelopAccountStatus','handleDevelopBackups',
  'enforceDatasetQuota','dataset_limit','storage_limit',
  "scheduled(event,env,ctx)"
]) if(!worker.includes(marker))fail('Worker missing '+marker);

for(const marker of ['/v1/account/summary','/v1/account/sessions','/v1/account/payments','/v1/account/export'])if(!account.includes(marker))fail('Account Center missing '+marker);
for(const marker of ['/v1/membership/plans','/v1/membership/payments','QRIS'])if(!membership.includes(marker))fail('Membership app missing '+marker);
for(const marker of ['/v1/develop/plans','/v1/develop/payments','/v1/develop/datasets','/v1/develop/contributions','/v1/develop/audit','/v1/develop/backups','support-view','account-status'])if(!develop.includes(marker))fail('Develop app missing '+marker);
for(const tab of ['Overview','Users','Membership','Payments','Datasets','Hitung Cabai / AI','Server','Audit Log','Backups'])if(!developHtml.includes(tab))fail('Develop tab missing '+tab);

console.log('Account platform contract OK: membership QRIS, Account Center, quotas, support mode, audit, operations dashboard and backups are wired.');
