Warning: truncated output (original token count: 7293)
Total output lines: 563

// Regression coverage follows the production asset-version contract.
import { qrMatrix, qrSvg } from '../public/werewolf/qr.js';
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
  'createForm', 'joinForm', 'createName', 'joinName', 'joinCode', 'joinOnlineButton', 'joinOfflineButton',
  'roomPanel', 'roomIdentity', 'roomMeta', 'playersSection', 'playersList', 'resetRoom',
  'phaseContent', 'roomMessage', 'phasePanel', 'reconnectButton'
]) {
  assert.match(html, new RegExp('id="' + id + '"'), 'Missing UI element ' + id);
}

for (const token of [
  'add_bots', 'draw_card', 'night_action', 'villager_math', 'resolve_night', 'resolve_dawn',
  'start_voting', 'cast_vote', 'resolve_result', 'next_round',
  'hunter_shot', 'EXTRA_ROLE_OPTIONS', "mode: 'heal'", "mode: 'poison'", 'partnerId'
]) assert.ok(app.includes(token), 'Missing client action ' + token);

for (const token of [
  'Durable Objects', 'WebSocketPair', 'role_draw', 'night_action', 'night_pass',
  'resolve_night', 'start_discussion', 'start_voting', 'cast_vote',
  'resolve_vote', 'finishVote', 'makeModerator'
]) assert.ok(worker.includes(token), 'Missing server game contract ' + token);

for (const text of [
  'Buka kartu saya', 'Lanjut ke Malam ', 'TENGAH MALAM DIMULAI DALAM',
  'Voting', 'DISKUSI TERSISA', 'VOTING TERSISA',
  'Kamu bertahan.', 'Kamu tereliminasi.'
]) assert.ok(app.includes(text), 'Missing moderator-led UI text: ' + text);

assert.match(app, /function renderModeratorDashboard/);
assert.match(html, /data-voice-mode/);
assert.match(app, /function renderReplayTimeline…6293 tokens truncated…etails'));
assert.ok(css.includes('chat-night-report-badge'));


// Timed choices remain editable without browser confirmation popups.
assert.ok(html.includes('id="confirmDialog"'), 'Destructive room actions use the styled in-game dialog.');
assert.ok(app.includes('function askConfirmation('));
assert.doesNotMatch(app, /\bconfirm\s*\(/, 'No native browser confirmation is used.');
assert.ok(app.includes("mode: 'cupid_clear'"), 'Cupid can clear a pending pair while revising it.');
assert.ok(worker.includes("body.mode === 'cupid_clear'"));
assert.ok(!app.includes('Simpan ikatan'), 'Cupid pair selection is saved automatically.');
assert.ok(app.includes('discussion-chat-actions'));
assert.ok(app.includes("button('Narasi ↻'"));
assert.ok(css.includes('.confirm-dialog'));
assert.ok(css.includes('.discussion-chat-actions'));
assert.ok(app.includes('bekas gigitan di leher'));
assert.ok(app.includes('luka tembak'));
assert.ok(app.includes('botol kecil'));
assert.ok(app.includes('function renderPrivateInspectionResult'));
assert.ok(app.includes('seer-inspection-tag'));
assert.ok(app.includes('public-player-row'));
assert.ok(app.includes('HASIL PENERAWANGAN PRIBADI'));
const renderRoomStart = app.indexOf('function renderRoom');
const renderRoomEnd = app.indexOf('function renderPlayerPhase', renderRoomStart);
const sharedRoomMarkup = app.slice(renderRoomStart, renderRoomEnd);
assert.ok(sharedRoomMarkup.indexOf('renderPlayerPhase(content)') < sharedRoomMarkup.indexOf('renderLivingPlayers(content)'));
assert.ok(app.indexOf('renderDiscussionTools(content)') > app.indexOf('renderPlayerPhase(content)'));
console.log('Werewolf gameplay UX checks passed: timed actions, private inspections, integrated voice/chat, custom confirmations and story narration.');

assert.ok(app.includes("seer: ['Seer', 'Mengungkap role asli pemain yang diperiksa.'"));
assert.ok(app.includes("inspected.targetRole ? roleLabel(inspected.targetRole)"));
assert.ok(worker.includes("targetRole: inspected.role"));
