import fs from 'node:fs';
function fail(m){console.error('Resilience contract failed:',m);process.exit(1);}
function has(text,markers,label){for(const m of markers)if(!text.includes(m))fail(label+' missing '+m);}
const resilience=fs.readFileSync('public/resilience.js','utf8');
const account=fs.readFileSync('public/account.js','utf8');
const diagnostic=fs.readFileSync('public/diagnostic/index.html','utf8');
const diagnosticApp=fs.readFileSync('public/diagnostic/app.js','utf8');
const sync=fs.readFileSync('src/account-dataset-sync.js','utf8');
const gameSync=fs.readFileSync('public/game/sync.js','utf8');
const store=fs.readFileSync('src/local-dataset-store.js','utf8');
const sw=fs.readFileSync('public/sw.js','utf8');
const develop=fs.readFileSync('public/develop/app.js','utf8');
has(resilience,['navigator.storage?.estimate','runDiagnostics','copyErrorReport','openPalette','toggleSafeMode','rollbackStatus','setRollback','e.ctrlKey','agrotik_recent_activity_v1'],'resilience');
has(account,["import './resilience.js'","Cari alat / perintah"],'account');
has(diagnostic,['Diagnostic','Safe Mode','Versi sebelumnya'],'diagnostic');
has(diagnosticApp,['runDiagnostics','queue','rollbackStatus'],'diagnostic app');
has(sync,['agrotik_sync_queue_v1','safe-mode','queueSummary'],'stat queue');
has(gameSync,['agrotik_sync_queue_v1','safe-mode','queueSummary'],'game queue');
has(store,['DB_VERSION=4',"META_STORE='meta'",'HISTORY_STORE','ANALYSIS_STORE','SYNC_STORE','TRASH_STORE','migrateLegacyResearchStores','localStoreInfo'],'local migration');
has(sw,['CONTROL_CACHE','ROLLBACK_PREVIOUS','previousMatch','agrotik-control'],'service worker rollback');
has(develop,['loadDiagnostic','labelMobileTables','queueInspector'],'develop diagnostic');
console.log('Resilience contract OK.');
