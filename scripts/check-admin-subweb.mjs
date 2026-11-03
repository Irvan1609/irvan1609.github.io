import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=file=>readFileSync(file,'utf8');
const landing=read('index.html');
const account=read('public/account.js');
const gate=read('public/admin-subweb-access.js');
const css=read('public/admin-subweb-gate.css');
assert.match(landing,/Irvan · Agronomi/);
assert.match(landing,/Statistical Web/);
assert.match(landing,/data-admin-only/);
assert.match(gate,/await account\.refresh\(\)/,'Must check a current server session, not cached user data');
assert.match(gate,/user\?\.role!=='admin'/,'Only the admin role can unlock modules');
assert.match(gate,/document\.body\.classList\.remove\('admin-subweb-locked'\)/);
assert.match(css,/admin-subweb-locked/);
assert.match(account,/\/v1\/auth\/session/);
for(const [html,entry] of [
  ['public/hitung-cabai/index.html','public/hitung-cabai/app.js'],
  ['public/pengukur/index.html','public/pengukur/app.js'],
  ['public/game/index.html','public/game/app.js'],
  ['mendeley/index.html','mendeley/app.js'],
  ['print-skripsi/index.html','print-skripsi/app.js']
]){
  const page=read(html),script=read(entry);
  assert.match(page,/admin-subweb-locked/,html+' must start locked');
  assert.match(page,/id="adminSubwebGate"/,html+' must explain access restriction');
  assert.match(page,/admin-subweb-gate\.css/,html+' must hide app before verification');
  assert.match(script,/requireAdminSubweb\(\)/,entry+' must wait for verified admin before initialization');
}
for(const file of ['public/game/social.js','public/game/sync.js'])
  assert.match(read(file),/requireAdminSubweb\(\)/,file+' may not run ahead of admin');
assert.doesNotMatch(read('src/main.js'),/requireAdminSubweb\(\)/,'Stat must remain public');
assert.doesNotMatch(read('stat/index.html'),/admin-subweb-locked/,'Stat must remain public');
console.log('Admin subweb directory: historic tools visible, public Stat unaffected, other modules start locked and verify server-issued admin sessions.');
