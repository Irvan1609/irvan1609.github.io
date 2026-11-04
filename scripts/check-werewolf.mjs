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
  'createForm', 'joinForm', 'createName', 'joinName', 'joinCode',
  'roomPanel', 'roomIdentity', 'roomMeta', 'playersSection', 'playersList', 'resetRoom',
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
assert.match(app, /function renderPlayerDiscussion/);
assert.match(app, /Diskusi offline/);
assert.doesNotMatch(app, /Simpan diskusi online|discussionCallUrl|meet\\.google\\.com|Buka ruang diskusi online|Diskusi online/);
assert.match(app, /Komentar bot \(simulasi\)/);
assert.match(app, /roomState\.chat/);
assert.match(worker, /this\.seedBotDiscussion\(room, now\)/);
assert.match(worker, /chat: isModerator/);
assert.match(css, /bot-discussion-log/);
assert.match(html, /20261105-werewolf-host-player1/);
assert.match(html, /app\.js\?v=20261105-werewolf-host-player1/);
assert.match(app, /function isRoomModerator/);
assert.match(app, /session\?\.isHost/);
assert.match(app, /resetButton\.disabled = !host/);
assert.match(html, /id="resetRoom" class="text-button restart-button"/);
assert.match(css, /#resetRoom:disabled/);
assert.match(html, /app\.js\?v=20261105-werewolf-host-player1/);
assert.match(app, /resetButton\.classList\.remove\('hidden'\)/);
assert.doesNotMatch(app, /resetButton\.classList\.toggle\('hidden', !moderator \|\| room\.phase === 'lobby'\)/);
assert.match(app, /Room sudah berada di lobby/);
assert.match(css, /\.text-button\.restart-button/);
assert.doesNotMatch(worker, /cleanCallUrl|Tautan diskusi online/);
assert.match(worker, /room\.discussionMode = 'offline'/);
assert.match(worker, /discussionMode: room\.phase === 'discussion'/);
assert.match(css, /system-narrator-panel/);
assert.match(app, /function systemNarrationText/);
assert.match(app, /function playWolfHowl/);
assert.match(app, /function playRoosterCrow/);
assert.match(app, /speechSynthesis/);
assert.match(app, /data-moderator-mode/);
assert.match(app, /\['host', 'Host'\]/);
assert.match(app, /\['system', 'Sistem'\]/);
assert.match(app, /\['random', 'Acak'\]/);
assert.doesNotMatch(app, /data-ability/);
assert.match(app, /roleDraft/);
assert.match(app, /function captureRoleDraft/);
assert.match(app, /function clearAllRoleCounts/);
assert.match(app, /Jadikan Semua Role 0/);
assert.match(app, /clearRolesButton\.dataset\.clearAllRoles/);
assert.match(app, /Restart Permainan/);
assert.match(app, /resetButton\.classList\.remove\('hidden'\)/);
assert.match(css, /role-config-actions/);
assert.match(css, /role-zero-button/);
assert.match(css, /room-top-actions #resetRoom/);
assert.match(app, /reset_to_lobby/);
assert.match(app, /PLAYER_NAME_KEY/);
assert.match(app, /villager_math/);
assert.match(app, /waiting-room-roster/);
assert.match(worker, /resolveSystemNightIfReady/);
assert.match(worker, /resolveSystemVoteIfReady/);
assert.match(worker, /isSystemModerator/);
assert.match(worker, /type === 'reset_to_lobby'/);
assert.match(worker, /activeModeratorMode/);

assert.match(worker, /activeModeratorId/);
assert.match(worker, /activeModeratorRosterIndex/);
assert.match(worker, /hostAccount/);
assert.match(worker, /selectedModerator = candidates\[randomInt\(candidates\.length\)\]/);
assert.match(worker, /room\.players = activePlayers/);
assert.match(app, /function rolePlayerCount/);
assert.match(app, /function renderSystemHostControls/);
assert.match(app, /Pemain yang menerima role/);
assert.match(html, /Nama host/);

assert.match(worker, /moderatorMode/);
assert.match(worker, /villagerPrompts/);
assert.match(worker, /villager_math/);
assert.match(worker, /lobbyPlayers/);
assert.match(app, /function renderPlayerPhase/);
assert.match(app, /function renderPrivateInspectionResult/);
assert.match(app, /Hasil penerawangan malam/);
assert.match(app, /heartbeatTimer/);
assert.match(app, /realtimeGeneration/);
assert.match(app, /pollingSession/);
assert.match(app, /nextState\.room\.revision/);
assert.match(app, /type: 'leave_room'/);
assert.match(app, /type: 'disband_room'/);
assert.match(app, /room_disbanded/);
assert.match(app, /Bubarkan Room/);
assert.doesNotMatch(app, /Moderator tidak dapat keluar sebagai pemain/);
assert.match(app, /Sesi tidak valid atau room sudah kedaluwarsa/);
assert.match(worker, /runExclusive\(operation\)/);
assert.match(worker, /firstVoteAt/);
assert.match(worker, /submittedAt: now/);
assert.match(worker, /type === 'leave_room'/);
assert.match(app, /roomState\?\.self\?\.isModerator/);
assert.match(app, /roomState\.targets/);
assert.match(app, /phasePanel\.dataset\.phase/);
assert.match(app, /assets\/illustrations\/role-/);
assert.match(app, /witchAttack/);
assert.match(app, /Pasangan yang kamu hubungkan/);
assert.match(worker, /wolfAttackSummary/);
assert.match(worker, /loverNames/);
assert.match(app, /player-avatar/);
assert.doesNotMatch(app, /updateDiscussionClock|send_chat/);
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
const joinFormPosition = html.indexOf('<form id="joinForm"');
const createFormPosition = html.indexOf('<form id="createForm"');
assert.ok(joinFormPosition >= 0 && createFormPosition > joinFormPosition, 'Join Room must appear above Create Room.');
assert.doesNotMatch(html, /createRoleConfig|soloMode|how-to-play/, 'Landing must not contain role setup, bot setup, or the long rules panel.');
assert.doesNotMatch(app, /createRoleConfig|soloMode/, 'Role and bot configuration must not be read from the landing form.');
assert.match(app, /renderRoleConfigEditor\(configEditor, settings\)/, 'Role configuration must remain in the moderator lobby.');
assert.match(app, /Mulai Permainan & Bagikan Kartu/, 'Moderator must have an explicit start-and-deal action.');
assert.match(app, /roomState\.players\.length >= 2 && exact/, 'Starting requires at least two players and an exact role count.');
assert.match(app, /recommendedRoleCounts/);
assert.match(app, /\['witch', 7\]/);
assert.match(app, /\['detective', 11\]/);
assert.match(app, /\['mayor', 13\]/);
assert.match(app, /\['guardian_angel', 14\]/);
assert.match(app, /\['jester', 17\]/);
assert.match(app, /4–25 pemain/);
assert.match(app, /Maksimal 500 bot dalam satu penambahan/);
assert.match(worker, /MAX_BOT_BATCH = 500/);
assert.match(worker, /Minimal 2 pemain diperlukan/);
assert.doesNotMatch(worker, /MAX_PLAYERS|MIN_PLAYERS/);
assert.doesNotMatch(app, /Pemain bergabung: .*\/ 20\. Minimal 5 pemain/);
assert.match(css, /entry-grid\{grid-template-columns:minmax\(0,1fr\)/, 'Entry forms must be stacked vertically.');

assert.match(app, /ROLE_CONFIG_GROUPS/);
assert.doesNotMatch(app, /ABILITY_OPTIONS|ABILITY_DEFAULTS|data-ability/, 'Role skill checkboxes are no longer part of the moderator settings.');
assert.match(app, /update_settings/);
assert.match(app, /Memiliki dua bobot suara/);
assert.match(html, /id="playersSection"/);
assert.match(css, /prefers-reduced-motion/);
assert.match(css, /role-count-grid/);
assert.match(css, /role-count-grid\{grid-template-columns:repeat\(3/);
assert.match(css, /moderator-mode-row/);
assert.match(css, /waiting-room-roster/);
assert.match(css, /villager-math-question/);
assert.match(css, /ability-toggle-grid/);
assert.match(css, /@media\(max-width:760px\)/);
assert.match(home, /href="\/werewolf\//);
assert.match(config, /new_sqlite_classes = \["WerewolfRoom"\]/);
assert.match(config, /ROOM_CREATE_LIMITER/);
assert.match(sw, /20261105-werewolf-host-player1/);
assert.match(sw, /\/werewolf\/assets\/illustrations\/hero-night\.svg/);
assert.match(app, /location\.hostname === 'irvan1609\.github\.io'/);
assert.match(html, /href="\.\/subweb-header\.css"/);
assert.match(app, /Mode latihan vs bot/);
assert.match(app, /Lewati pemain yang belum beraksi/);
assert.match(app, /Tidak ada hitung mundur malam/);
assert.match(app, /Tidak ada batas maksimal ronde malam/);
assert.match(worker, /No fixed night-round cap/);
assert.match(worker, /wolfAttackSummary\(room, body\.force === true\)/);
assert.match(app, /role-balance/);
assert.match(app, /updatePhaseTracker/);
assert.match(app, /\['seer', 'detective', 'doctor', 'bodyguard', 'guardian_angel'\]\.includes\(self\.role\)/);

console.log('Werewolf UI checks passed: separate moderator dashboard, minimal player actions, manual phase control, responsive UI, and private role assets.');


assert.match(app, /function renderPlayerRoleReminder/);
assert.match(app, /role-flip-card/);
assert.match(app, /aria-pressed/);
assert.match(app, /function renderWolfNightRoom/);
assert.match(app, /wolf_chat/);
assert.match(app, /wolfChatInput/);
assert.match(app, /messages\.scrollTop = messages\.scrollHeight/);
assert.match(app, /wolfSelections/);
assert.match(app, /Pilihan seranganmu sudah dikirim/);
assert.doesNotMatch(app, /renderWolfTeamPanel\(parent\)/);
assert.match(app, /roomState\.wolfTeam/);
assert.match(app, /Voting bersifat rahasia/);
assert.match(app, /function renderModeratorEventReport/);
assert.match(app, /ROLE MODERATOR · PENGATUR JALANNYA PERMAINAN/);
assert.match(app, /moderator: \['Moderator'/);
assert.match(app, /roleCounts\?\.moderator/);
assert.match(css, /\.role-flip-card/);
assert.match(css, /\.role-flip-card\.is-flipped/);
assert.match(css, /\.wolf-night-room/);
assert.match(css, /\.wolf-selection-board/);
assert.match(css, /\.wolf-private-chat/);
assert.match(css, /\.wolf-chat-form/);
assert.match(css, /\.moderator-event-report/);
assert.match(html, /20261105-werewolf-host-player1/);
assert.match(sw, /20261105-werewolf-host-player1/);
assert.ok(sw.includes('/werewolf/assets/illustrations/role-moderator.svg'));
assert.match(read('public/werewolf/assets/illustrations/role-moderator.svg'), /<svg/);

console.log('Werewolf private-card, moderator-report, role privacy, and wolf-team UI checks passed.');
