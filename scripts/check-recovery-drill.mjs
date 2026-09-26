import fs from 'node:fs';

function fail(message){console.error('Recovery drill check failed:',message);process.exit(1);}
const workflow=fs.readFileSync('.github/workflows/d1-recovery-drill.yml','utf8');
for(const marker of [
  'd1 time-travel info hitung-cabai --json',
  'd1 export hitung-cabai --remote',
  'd1 create "$TEMP_DB"',
  'd1 execute "$TEMP_DB" --remote --file=/tmp/agrotik-recovery.sql',
  'PRAGMA integrity_check;',
  'sqlite_master',
  'd1 delete "$TEMP_DB"',
  'trap cleanup EXIT'
]) if(!workflow.includes(marker))fail('missing recovery marker '+marker);
if(/d1 time-travel restore\s+hitung-cabai/.test(workflow))fail('drill must never restore production in place');
console.log('Recovery drill contract OK: production is read/export only; restore validation occurs in a disposable D1 database.');
