import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(path, 'utf8');
const html = read('public/werewolf/index.html');
const app = read('public/werewolf/app.js');
const css = read('public/werewolf/style.css');
const worker = read('cloudflare/werewolf-worker/src/index.js');
const config = read('cloudflare/werewolf-worker/wrangler.toml');
const home = read('index.html');
const sw = read('public/sw.js');

for (const id of ['createForm', 'joinForm', 'createName', 'joinName', 'joinCode', 'roomPanel', 'playersList', 'phaseContent', 'roomMessage']) {
  assert.match(html, new RegExp('id="' + id + '"'), 'Missing UI element ' + id);
}
for (const token of ['draw_card', 'night_action', 'resolve_night', 'set_discussion', 'send_chat', 'start_voting', 'cast_vote', 'next_round']) {
  assert.ok(app.includes(token), 'Missing client action ' + token);
}
for (const token of ['Durable Objects', 'WebSocketPair', 'role_draw', 'night_action', 'resolve_night', 'set_discussion', 'send_chat', 'cast_vote', 'resolve_vote', 'finishVote']) {
  assert.ok(worker.includes(token), 'Missing server game contract ' + token);
}
assert.match(html, /Ambil kartu peranmu/);
assert.match(app, /offline/);
assert.match(app, /online/);
assert.match(app, /voice \/ video call/);
assert.match(app, /werewolf-room-api-dev/);
assert.match(app, /werewolf-room-api\.andyirvan1609\.workers\.dev/);
assert.match(css, /@media\(max-width:620px\)/);
assert.match(home, /Hybrid discussion/);
assert.match(home, /href="\/werewolf\//);
assert.match(config, /new_sqlite_classes = \["WerewolfRoom"\]/);
assert.match(config, /ROOM_CREATE_LIMITER/);
assert.match(sw, /20261103-werewolf2/);
assert.match(sw, /\/werewolf\/app\.js/);
assert.doesNotMatch(html, /disabled>Buat room/);
console.log('Werewolf UI contract checks passed: multi-device room, secret cards, server actions, hybrid discussion, chat, voting, and mobile layout.');
