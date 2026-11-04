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

for (const id of [
  'createForm', 'joinForm', 'createName', 'joinName', 'joinCode', 'soloMode',
  'roomPanel', 'roomIdentity', 'roomMeta', 'playersSection', 'playersList',
  'phaseContent', 'roomMessage', 'phasePanel'
]) {
  assert.match(html, new RegExp('id="' + id + '"'), 'Missing UI element ' + id);
}

for (const token of [
  'add_bots', 'draw_card', 'night_action', 'night_pass', 'resolve_night',
  'start_discussion', 'start_voting', 'cast_vote', 'resolve_vote', 'next_round',
  'hunter_shot', 'EXTRA_ROLE_OPTIONS', "mode: 'heal'", "mode: 'poison'", 'partnerId', 'cupidBond'
]) assert.ok(app.includes(token), 'Missing client action ' + token);

for (const token of [
  'Durable Objects', 'WebSocketPair', 'role_draw', 'night_action', 'night_pass',
  'resolve_night', 'start_discussion', 'start_voting', 'cast_vote',
  'resolve_vote', 'finishVote', 'makeModerator'
]) assert.ok(worker.includes(token), 'Missing server game contract ' + token);

for (const text of [
  'Buka kartu saya', 'Lanjut ke Malam 1', 'Lanjut ke Pagi',
  'Lanjut ke Diskusi', 'Lanjut ke Voting', 'Lanjut · Umumkan hasil voting',
  'Kamu bertahan.', 'Kamu tereliminasi.'
]) assert.ok(app.includes(text), 'Missing moderator-led UI text: ' + text);

assert.match(app, /function renderModeratorPhase/);
assert.match(app, /function renderPlayerPhase/);
assert.match(app, /roomState\?\.self\?\.isModerator/);
assert.match(app, /roomState\.targets/);
assert.match(app, /phasePanel\.dataset\.phase/);
assert.match(app, /assets\/illustrations\/role-/);
assert.match(app, /player-avatar/);
assert.doesNotMatch(app, /updateDiscussionClock|set_discussion|send_chat/);
assert.doesNotMatch(app, /setInterval\(\(\) => updateDiscussionClock/);

for (const file of [
  'hero-night.svg', 'card-back.svg', 'role-wolf.svg',
  'role-seer.svg', 'role-doctor.svg', 'role-villager.svg',
  'role-alpha_wolf.svg', 'role-bodyguard.svg', 'role-witch.svg',
  'role-hunter.svg', 'role-cupid.svg', 'role-guardian_angel.svg',
  'role-detective.svg', 'role-mayor.svg', 'role-jester.svg'
]) {
  assert.match(read('public/werewolf/assets/illustrations/' + file), /<svg/, 'Missing SVG asset ' + file);
  assert.ok(sw.includes('/werewolf/assets/illustrations/' + file), 'Role illustration is not precached: ' + file);
}

assert.match(html, /THE VILLAGE/);
assert.match(html, /MODERATOR ROOM/);
assert.match(html, /data-step="morning"/);
assert.match(html, /createRoleConfig/);
assert.match(app, /ROLE_CONFIG_GROUPS/);
assert.match(app, /ABILITY_OPTIONS/);
assert.match(app, /update_settings/);
assert.match(app, /Memiliki dua bobot suara/);
assert.match(html, /id="playersSection"/);
assert.match(css, /prefers-reduced-motion/);
assert.match(css, /role-count-grid/);
assert.match(css, /ability-toggle-grid/);
assert.match(css, /@media\(max-width:760px\)/);
assert.match(home, /href="\/werewolf\//);
assert.match(config, /new_sqlite_classes = \["WerewolfRoom"\]/);
assert.match(config, /ROOM_CREATE_LIMITER/);
assert.match(sw, /20261104-werewolf-role-config1/);
assert.match(sw, /\/werewolf\/assets\/illustrations\/hero-night\.svg/);
assert.match(app, /location\.hostname === 'irvan1609\.github\.io'/);
assert.match(html, /href="\.\/subweb-header\.css"/);
assert.match(app, /Mode latihan vs bot/);
assert.match(app, /Lewati pemain yang belum beraksi/);
assert.match(app, /role-balance/);
assert.match(app, /updatePhaseTracker/);
assert.match(app, /\['seer', 'detective', 'doctor', 'bodyguard', 'guardian_angel'\]\.includes\(self\.role\)/);

console.log('Werewolf UI checks passed: separate moderator dashboard, minimal player actions, manual phase control, responsive UI, and private role assets.');
