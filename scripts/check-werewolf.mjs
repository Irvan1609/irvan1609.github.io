import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = path => readFileSync(path, 'utf8');
const html = read('public/werewolf/index.html'), app = read('public/werewolf/app.js');
const css = read('public/werewolf/style.css'), worker = read('cloudflare/werewolf-worker/src/index.js');
const config = read('cloudflare/werewolf-worker/wrangler.toml'), home = read('index.html'), sw = read('public/sw.js');
for (const id of ['createForm','joinForm','createName','joinName','joinCode','soloMode','roomPanel','playersList','phaseContent','roomMessage','phasePanel']) assert.match(html,new RegExp('id="'+id+'"'),'Missing UI element '+id);
for (const token of ['add_bots','draw_card','night_action','resolve_night','set_discussion','send_chat','start_voting','cast_vote','next_round']) assert.ok(app.includes(token),'Missing client action '+token);
for (const token of ['Durable Objects','WebSocketPair','role_draw','night_action','resolve_night','set_discussion','send_chat','cast_vote','resolve_vote','finishVote']) assert.ok(worker.includes(token),'Missing server game contract '+token);
assert.match(app,/Ambil kartu rahasia/);assert.match(app,/offline/);assert.match(app,/online/);assert.match(app,/voice \/ video call/);
assert.match(app,/phasePanel\.dataset\.phase/);assert.match(app,/assets\/illustrations\/role-/);assert.match(app,/player-avatar/);
for(const file of ['hero-night.svg','card-back.svg','role-wolf.svg','role-seer.svg','role-doctor.svg','role-villager.svg']) assert.match(read('public/werewolf/assets/illustrations/'+file),/<svg/,'Missing SVG asset '+file);
assert.match(html,/THE VILLAGE/);assert.match(css,/prefers-reduced-motion/);assert.match(css,/@media\(max-width:760px\)/);
assert.match(home,/Hybrid discussion/);assert.match(home,/href="\/werewolf\//);assert.match(config,/new_sqlite_classes = \["WerewolfRoom"\]/);assert.match(config,/ROOM_CREATE_LIMITER/);
assert.match(sw,/20261104-werewolf-visual1/);assert.match(sw,/\/werewolf\/assets\/illustrations\/hero-night\.svg/);
assert.doesNotMatch(html,/disabled>Buat room/);
console.log('Werewolf illustrated redesign checks passed: game art, secret roles, responsive UI, PWA assets, and multiplayer contract.');

assert.match(app,/location\.hostname === 'irvan1609\.github\.io'/);
assert.match(html,/href="\.\/subweb-header\.css"/);

assert.match(app,/Mode latihan vs bot/);assert.match(app,/Lewati diskusi & lanjut voting/);assert.match(app,/Bot otomatis/);

assert.match(html,/phaseTracker/);assert.match(html,/Aturan singkat & cara bermain/);
assert.match(app,/role-balance/);assert.match(app,/updatePhaseTracker/);assert.match(app,/chat-bot-badge/);
assert.match(app,/self\.role === 'doctor'/);
