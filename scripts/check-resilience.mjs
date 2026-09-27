import fs from 'node:fs';

function fail(message){console.error('Resilience check failed:',message);process.exit(1);}
function must(text,marker,label){if(!text.includes(marker))fail(label+' missing '+marker);}

const core=fs.readFileSync('public/system-core.js','utf8');
const css=fs.readFileSync('public/system-core.css','utf8');
const pwa=fs.readFileSync('public/pwa-register.js','utf8');
const sw=fs.readFileSync('public/sw.js','utf8');
const local=fs.readFileSync('src/local-dataset-store.js','utf8');
const sync=fs.readFileSync('src/account-dataset-sync.js','utf8');
const gameSync=fs.readFileSync('public/game/sync.js','utf8');
const chiliCloud=fs.readFileSync('public/hitung-cabai/cloud-sync.js','utf8');
const account=fs.readFileSync('public/account.js','utf8');
const develop=fs.readFileSync('public/develop/app.js','utf8');
const developHtml=fs.readFileSync('public/develop/index.html','utf8');
const worker=fs.readFileSync('cloudflare/hitung-cabai-worker/src/index.js','utf8');
const schema=fs.readFileSync('cloudflare/hitung-cabai-worker/schema.sql','utf8');
const diagnostic=fs.readFileSync('public/diagnostic/index.html','utf8');

for(const marker of [
  'openDiagnostics','runDiagnostics','navigator.storage?.estimate','indexedDB.open',
  "window.addEventListener('error'","window.addEventListener('unhandledrejection'",
  'DRAFT_PREFIX','HEARTBEAT_PREFIX','restoreDraftIfCrash','queueSnapshot','reportQueue',
  'openPalette','event.ctrlKey','RECENT_KEY','renderRecent','requestRollback','SAFE_KEY'
])must(core,marker,'system core');
for(const marker of ['@media(max-width:680px)','ag-system-sheet','ag-command','agrotik-recent','data-agrotik-safe'])must(css,marker,'system CSS');
must(pwa,"import('/system-core.js?v=20260927-1')",'PWA bootstrap');
for(const marker of ['META_PREVIOUS','ROLLBACK_PREVIOUS','CLEAR_ROLLBACK','GET_ROLLBACK_STATUS','rollbackMatch'])must(sw,marker,'service worker rollback');
for(const marker of ['LOCAL_DB_SCHEMA_VERSION=2',"META_STORE='meta'",'schemaVersion'])must(local,marker,'local schema migration');
for(const marker of ['schema_migrations','version INTEGER PRIMARY KEY','schemaVersion:18'])must(worker,marker,'D1 migration ledger');
must(schema,'CREATE TABLE IF NOT EXISTS schema_migrations','D1 schema source');
for(const marker of ['publishQueue','agrotik-retry-queues','SAFE_MODE'])must(sync,marker,'dataset queue');
for(const marker of ['reportQueue','agrotik-retry-queues','SAFE_MODE'])must(gameSync,marker,'game queue');
for(const marker of ['reportQueue','SAFE_MODE'])must(chiliCloud,marker,'chili queue');
for(const marker of ['ag-system-open','Perintah & diagnostik'])must(account,marker,'account compact access');
for(const marker of ['renderLocalDeviceState','retryLocalQueue','openDiagnostics'])must(develop,marker,'develop device inspector');
for(const marker of ['deviceQueueState','pwa-register.js'])must(developHtml,marker,'develop device UI');
must(diagnostic,'Diagnostik Agrotik','diagnostic route');
if(/alert\(|confirm\(/.test(core))fail('system core must not interrupt users with alert/confirm');
console.log('Resilience contract OK: diagnostics, storage guard, crash recovery, queue inspector, safe mode, rollback and mobile command UI are wired.');
