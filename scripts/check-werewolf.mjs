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
  'createForm', 'joinForm', 'createName', 'joinName', 'joinCode', 'joinVoiceMode',
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
assert.match(app, /function renderReplayTimeline/);
assert.match(app, /function renderReplayArchive/);
assert.match(app, /function reconnectNow/);
assert.match(app, /window\.addEventListener\('online', reconnectNow\)/);
assert.match(app, /window\.addEventListener\('offline'/);
assert.match(app, /document\.addEventListener\('visibilitychange'/);
assert.match(css, /\.moderator-dashboard/);
assert.match(css, /\.replay-panel/);
assert.match(css, /\.reconnect-button/);
assert.match(worker, /gameHistory:/);
assert.match(worker, /gameArchive:/);
assert.match(worker, /recordGameEvent\(room/);
assert.match(worker, /archiveCompletedGame\(room, now\)/);
assert.ok((worker.match(/kind: 'night_started'/g) || []).length >= 2,
  'Initial and subsequent rounds must both be recorded in replay history.');
assert.match(html, /id="reconnectButton"/);
assert.match(app, /function renderModeratorPhase/);
assert.match(app, /function renderPlayerDiscussion/);
assert.match(app, /Diskusi pemain/);
assert.match(app, /Voice chat mengikuti pilihan saat bergabung/);
assert.doesNotMatch(app, /Simpan diskusi online|discussionCallUrl|meet\\.google\\.com|Buka ruang diskusi online|Diskusi online/);
assert.match(app, /renderDiscussionTools/);
assert.match(app, /CHAT DISKUSI/);
assert.match(app, /Abstain · Tidak memilih siapa pun/);
assert.match(app, /Ganti BOT/);
assert.doesNotMatch(app, /skip_missing_night/);
assert.match(worker, /type === 'replace_with_bot'/);
assert.match(worker, /type === 'restore_player_control'/);
assert.match(worker, /type === 'skip_missing_night'/);
assert.match(worker, /highestVote > totalVoteWeight \/ 2/);
assert.match(worker, /nightActionsSkipped/);
assert.match(worker, /voiceMode/);
assert.match(worker, /waitingPlayers/);
assert.match(worker, /signalKind === 'offer'/);
assert.match(app, /function discussionVoiceListeningAllowed/);
assert.match(app, /Kamu masuk saat permainan berlangsung/);
assert.doesNotMatch(html, /id="createGameMode"/);
assert.match(app, /function renderLivingPlayers/);
assert.match(app, /ROLE DALAM PERMAINAN/);
assert.match(worker, /livingPlayers: alive\.map/);
assert.match(worker, /hasSpecialNightAction/);
assert.match(worker, /canAnswerNightMath/);
assert.doesNotMatch(worker, /prepareAutomaticNightPasses|nightActionsAutoPassed|Otomatis dihitung/);
assert.match(app, /function renderFactionBadge/);
assert.match(app, /function renderNightMath/);
assert.match(app, /function renderMasonCircle/);
const allCardRoles = [
  'wolf', 'alpha_wolf', 'wolf_seer', 'villager', 'seer', 'doctor', 'bodyguard', 'trapper', 'witch',
  'hunter', 'reviver', 'cupid', 'guardian_angel', 'detective', 'mayor', 'jester',
  'priest', 'vigilante', 'mason', 'serial_killer', 'moderator'
];
for (const role of allCardRoles) {
  assert.match(app, new RegExp(role + ': \\['));
  assert.match(read('public/werewolf/assets/illustrations/role-' + role + '.svg'), /<svg/);
}
assert.match(css, /\.role-faction-badge\.faction-wolves/);
assert.match(css, /\.role-faction-badge\.faction-village/);
assert.match(css, /\.role-faction-badge\.faction-neutral/);
assert.match(app, /roomState\.chat/);
assert.match(worker, /this\.seedBotDiscussion\(room, now\)/);
assert.match(worker, /chat: \(room\.chat \|\| \[\]\)\.slice/);
assert.match(worker, /voicePeers/);
assert.match(css, /bot-discussion-log/);
assert.match(html, /20261106-werewolf-complete-1/);
assert.match(html, /id="joinEntryMode"/);
assert.match(html, /id="audioSettings"/);
assert.match(html, /id="gameSoundVolume"/);
assert.match(html, /id="voicePlaybackVolume"/);
assert.match(app, /function renderSpectatorPhase/);
assert.match(app, /function renderEmergencyControls/);
assert.match(worker, /selectBotSuspect/);
assert.match(worker, /serial_killer_kill/);
assert.match(worker, /type === 'pause_game'/);
assert.match(worker, /type === 'resume_game'/);
assert.match(worker, /type === 'restart_phase'/);
assert.match(html, /id="showInviteQr"/);
assert.match(html, /id="inviteDialog"/);
assert.match(html, /id="inviteQrImage"/);
assert.match(html, /id="saveInviteQr"/);
assert.match(html, /id="shareInviteQr"/);
assert.match(app, /import \{ qrMatrix, qrSvg \} from '\.\/qr\.js'/);
assert.match(app, /function buildInviteUrl/);
assert.match(app, /function openInviteDialog/);
assert.match(app, /navigator\.canShare/);
assert.match(app, /Undangan room .* ditemukan/);
assert.match(css, /\.invite-dialog/);
assert.ok(read('public/werewolf/qr.js').includes('export function qrMatrix'));
assert.ok(read('public/werewolf/qr.js').includes('export function qrSvg'));
const inviteExample = 'https://irvan1609.github.io/werewolf/?room=ABC234';
const inviteMatrix = qrMatrix(inviteExample);
assert.ok(inviteMatrix.length >= 21 && inviteMatrix.length <= 57);
assert.equal(inviteMatrix.length, inviteMatrix[0].length);
assert.equal(inviteMatrix[0][0], true);
assert.equal(inviteMatrix[3][3], true);
assert.equal(inviteMatrix[1][1], false);
assert.match(qrSvg(inviteExample), /<svg[^>]+viewBox=/);
assert.match(sw, /\/werewolf\/qr\.js/);

assert.match(html, /app\.js\?v=20261106-werewolf-complete-1/);
assert.match(app, /function isRoomModerator/);
assert.match(app, /session\?\.isHost/);
assert.match(app, /resetButton\.disabled = !host/);
assert.match(html, /id="resetRoom" class="text-button restart-button"/);
assert.match(css, /#resetRoom:disabled/);
assert.match(html, /style\.css\?v=20261106-werewolf-live-activity-12/);
assert.match(app, /resetButton\.classList\.remove\('hidden'\)/);
assert.doesNotMatch(app, /resetButton\.classList\.toggle\('hidden', !moderator \|\| room\.phase === 'lobby'\)/);
assert.match(app, /Room sudah berada di lobby/);
assert.match(css, /\.text-button\.restart-button/);
assert.doesNotMatch(worker, /cleanCallUrl|Tautan diskusi online/);
assert.match(worker, /room\.discussionMode = 'offline'/);
assert.match(worker, /discussionMode: room\.phase === 'discussion'/);
assert.match(css, /system-narrator-panel/);
assert.match(app, /function systemNarrationText/);
assert.match(app, /Kita berada di ' \+ village/);
assert.match(app, /Malam turun di ' \+ village/);
assert.match(app, /Matahari baru saja terbit/);
assert.match(app, /Warga berkumpul di alun-alun/);
assert.match(app, /Sore tiba\. Tiang eksekusi berdiri/);
assert.match(app, /Keputusan telah dijatuhkan/);
assert.match(app, /Kawanan Werewolf akhirnya menguasai desa/);
assert.match(app, /utterance\.rate = 0\.9/);
assert.match(app, /utterance\.pitch = 0\.9/);
assert.doesNotMatch(app, /Sistem akan mengumumkan pagi setelah semua aksi selesai/);
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
assert.match(worker, /runBotDawnActions/);
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
assert.doesNotMatch(app, /function renderSystemHostControls/);
assert.match(app, /Pemain yang menerima role/);
assert.match(html, /Nama host/);
assert.match(app, /function playGameStartBell/);
assert.match(app, /phaseChanged && nextState\.room\.phase === 'role_draw'\) playGameStartBell\(\)/);
assert.match(app, /roleDrawSeconds/);
assert.match(app, /TENGAH MALAM DIMULAI DALAM/);
assert.match(app, /Buka kartu saya sekarang/);
assert.match(app, /roomState\.self\?\.hasRole/);
assert.match(app, /pending-role-card/);
assert.match(app, /startNightAfterDrawButton/);
assert.match(app, /roleDrawEndsAt/);
assert.match(app, /function renderSystemHostPlayerContext/);
assert.match(app, /HOST JUGA PEMAIN/);
assert.match(app, /Role kamu:/);
assert.match(app, /Kekuatan & aturan pakai/);
assert.match(app, /appendRoleDetails\(disclosure, info, 'role-config-info'\)/);
assert.match(app, /ROLE_INFO\[key\]/);
assert.match(app, /wolf_seer: \['Wolf Seer'/);
assert.match(app, /trapper: \['Trapper'/);
assert.match(app, /Penduduk Aneh \(Jester\)/);
assert.match(app, /startGameButton/);
assert.match(app, /Komposisi tepat\. Permainan siap dimulai\./);
assert.doesNotMatch(app, /Simpan pengaturan role/);
assert.doesNotMatch(app, /role-balance/);
assert.equal(app.split('KOMPOSISI KUBU').length - 1, 1, 'Lobby must show only one faction composition summary.');
assert.match(worker, /nonWolfPlayers = alive\.length - wolves/);
assert.match(worker, /trapperInterception/);
assert.match(worker, /wolfSeerInspectTargetId/);
assert.match(worker, /role === 'trapper'/);
assert.match(worker, /role === 'wolf_seer'/);
assert.doesNotMatch(worker, /NEUTRAL_ROLES = new Set\(\['jester'/);
assert.match(css, /\.role-config-info-disclosure/);
assert.match(css, /\.system-host-player-context/);

assert.match(worker, /moderatorMode/);
assert.match(worker, /villagerPrompts/);
assert.match(worker, /villager_math/);
assert.match(worker, /lobbyPlayers/);

assert.match(worker, /publicResult,/);
assert.match(worker, /finalPlayers,/);
assert.match(worker, /winner: isModerator \|\| room\.phase === 'finished' \? room\.winner : null/);
assert.match(worker, /room\.phase = hasWinner \? 'finished' : 'morning'/);
assert.match(worker, /eliminatedPlayers:/);
assert.match(worker, /winReason: bonusWinner/);
assert.match(app, /function renderPublicResult/);
assert.match(app, /function renderVictoryScreen/);
assert.match(app, /function factionForRole/);
assert.match(app, /renderVictoryScreen\(parent, false\)/);
assert.match(app, /KUBU WEREWOLF MENANG/);
assert.match(app, /PENDUDUK DESA/);
assert.match(app, /KUBU NETRAL/);
assert.match(css, /\.victory-wolves/);
assert.match(css, /\.victory-village/);
assert.match(css, /\.victory-neutral/);
assert.match(css, /\.public-result-card/);
assert.match(css, /\.moderator-event-outcome/);

assert.match(app, /function renderModeratorDawn/);
assert.match(app, /function renderSystemModeratorVoteResult/);
assert.match(app, /case 'morning': renderPlayerMorning\(parent\)/);
assert.match(app, /case 'result':[\s\S]*?systemModeratorEnabled\(\)[\s\S]*?renderSystemModeratorVoteResult/);
assert.match(app, /const canRestart = moderatorView \|\| \(systemModeratorEnabled\(\) && isHost\(\)\)/);
assert.match(app, /function renderPlayerPhase/);
assert.match(app, /function appendRoleDetails/);
assert.match(app, /KEKUATAN/);
assert.match(app, /ATURAN PAKAI/);
assert.match(css, /role-card-detail-text/);
assert.match(css, /role-flip-detail-text/);
assert.match(app, /seerHistory/);
assert.match(app, /HASIL PENERAWANGAN PRIBADI/);
assert.match(app, /heartbeatTimer/);
assert.match(app, /realtimeGeneration/);
assert.match(app, /pollingSession/);
assert.match(app, /nextState\.room\.revision/);
assert.match(app, /type: 'leave_room'/);
assert.match(app, /type: 'disband_room'/);
assert.match(app, /room_disbanded/);
assert.match(app, /sendAction\('kick_player'/);
assert.match(app, /player_kicked/);
assert.match(app, /function kickPlayer/);
assert.match(app, /kick-player-button/);
assert.match(worker, /type === 'kick_player'/);
assert.match(worker, /if \(!isHost && !isModerator\)/);
assert.match(worker, /closeKickedPlayerSockets/);
assert.match(worker, /self\?\.id === room\.hostId/);
assert.match(css, /\.kick-player-button/);
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
assert.doesNotMatch(app, /updateDiscussionClock/);
assert.doesNotMatch(app, /setInterval\(\(\) => updateDiscussionClock/);
assert.match(worker, /roleAssignments/);
assert.match(worker, /send_discussion_chat/);
assert.match(worker, /voicePeers/);
assert.match(worker, /signalKind/);
assert.match(app, /send_discussion_chat/);
assert.match(app, /RTCPeerConnection/);
assert.match(app, /getUserMedia/);
assert.match(app, /renderDiscussionTools/);
assert.match(css, /\.discussion-voice-panel/);
assert.match(css, /\.discussion-chat-list/);
assert.match(html, /mikrofon otomatis aktif/i);

for (const file of [
  'hero-night.svg', 'card-back.svg', 'role-wolf.svg',
  'role-seer.svg', 'role-doctor.svg', 'role-villager.svg',
  'role-alpha_wolf.svg', 'role-bodyguard.svg', 'role-witch.svg',
  'role-hunter.svg', 'role-reviver.svg', 'role-cupid.svg', 'role-guardian_angel.svg',
  'role-detective.svg', 'role-mayor.svg', 'role-jester.svg', 'role-wolf_seer.svg', 'role-trapper.svg'
]) {
  assert.match(read('public/werewolf/assets/illustrations/' + file), /<svg/, 'Missing SVG asset ' + file);
  assert.ok(sw.includes('/werewolf/assets/illustrations/' + file), 'Role illustration is not precached: ' + file);
}

assert.match(html, /THE VILLAGE/);
assert.match(html, /HOST ROOM/);
assert.match(html, /data-step="morning"/);
const joinFormPosition = html.indexOf('<form id="joinForm"');
const createFormPosition = html.indexOf('<form id="createForm"');
assert.ok(joinFormPosition >= 0 && createFormPosition > joinFormPosition, 'Join Room must appear above Create Room.');
assert.doesNotMatch(html, /createRoleConfig|soloMode|how-to-play/, 'Landing must not contain role setup, bot setup, or the long rules panel.');
assert.doesNotMatch(app, /createRoleConfig|soloMode/, 'Role and bot configuration must not be read from the landing form.');
assert.match(app, /renderRoleConfigEditor\(configEditor, settings\)/, 'Role configuration must remain in the moderator lobby.');
assert.match(app, /Mulai Permainan & Bagikan Kartu/, 'Moderator must have an explicit start-and-deal action.');
assert.match(app, /activePlayers >= 2 && exact/, 'Starting requires at least two active players and an exact role count after moderator selection.');
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
assert.match(sw, /20261106-werewolf-live-activity-12/);
assert.match(sw, /\/werewolf\/assets\/illustrations\/hero-night\.svg/);
assert.match(app, /isProductionHost/);
assert.match(app, /www\.irvan1609\.github\.io/);
assert.match(html, /href="\.\/subweb-header\.css"/);
assert.match(app, /Mode latihan vs bot/);
assert.match(app, /Lanjut ke Subuh/);
assert.match(app, /Semua pilihan tetap dapat diubah sampai waktu tengah malam/);
assert.match(app, /appendPhaseCountdown/);
assert.match(app, /startPhaseClock/);
assert.match(app, /data-phase-duration/);
assert.match(worker, /nightEndsAt/);
assert.match(worker, /votingEndsAt/);
assert.match(worker, /discussionSeconds/);
assert.match(worker, /Durable Object timed phase alarm|scheduleRoomAlarm/);
assert.match(app, /Tidak ada batas maksimal ronde/);
assert.match(worker, /No fixed night-round cap/);
assert.match(worker, /wolfAttackSummary\(room, body\.force === true\)/);
assert.match(app, /role-team-summary/);
assert.match(app, /updatePhaseTracker/);
assert.match(app, /\['seer', 'detective', 'doctor', 'bodyguard', 'guardian_angel', 'priest', 'vigilante', 'trapper'\]\.includes\(self\.role\)/);

console.log('Werewolf UI checks passed: moderator-led flow, automatic phase timers, private Seer reveal, responsive UI, and private role assets.');


assert.match(app, /function renderPlayerRoleReminder/);
assert.match(app, /role-flip-card/);
assert.match(app, /aria-pressed/);
assert.match(app, /function renderWolfNightRoom/);
assert.match(app, /wolf_chat/);
assert.match(app, /wolfChatInput/);
assert.match(app, /messages\.scrollTop = messages\.scrollHeight/);
assert.match(app, /wolfSelections/);
assert.match(app, /Pilihan kawanan diperbarui realtime/);
assert.doesNotMatch(app, /renderWolfTeamPanel\(parent\)/);
assert.match(app, /roomState\.wolfTeam/);
assert.match(app, /Voting terbuka: semua pemain dapat melihat siapa memilih siapa/);
assert.match(app, /function renderModeratorEventReport/);

assert.match(app, /Perlihatkan role pemain saat mati/);
assert.match(app, /data-reveal-role-on-death/);
assert.match(app, /publicRoles/);
assert.match(app, /publicVotes/);
assert.match(app, /public-player-row/);
assert.match(app, /public-role-deceased-name/);
assert.match(app, /ROLE DALAM PERMAINAN/);
assert.match(app, /PEMAIN & STATUS/);
assert.match(app, /renderLivingPlayers\(content\);/);
assert.match(app, /function syncBotTakeoverDialog/);
assert.match(app, /if \(takeoverDialog\?\.open\) takeoverDialog\.close\(\)/);
assert.match(app, /botTakeoverReturn/);
assert.match(app, /botTakeoverLeave/);
assert.match(app, /echoCancellation: \{ ideal: true \}/);
assert.match(app, /noiseSuppression: \{ ideal: true \}/);
assert.match(app, /autoGainControl: \{ ideal: true \}/);
assert.match(app, /function updateRemoteVoiceVolume/);
assert.match(app, /voiceLocalStream && !voiceMuted \? 0\.14 : 0\.2/);
assert.match(css, /\.public-role-card\.faction-wolves/);
assert.match(css, /\.public-role-card\.faction-village/);
assert.match(css, /\.public-role-card\.faction-neutral/);
assert.match(css, /\.bot-takeover-dialog/);
assert.match(html, /id="botTakeoverDialog"/);
assert.match(html, /id="botTakeoverReturn"/);
assert.match(html, /id="botTakeoverLeave"/);
assert.match(worker, /revealRoleOnDeath/);
assert.match(worker, /room\.phase === 'night' && Number\(room\.nightEndsAt\) > 0\) deadlines\.push/);
assert.match(worker, /room\.phase === 'dawn' && Number\(room\.dawnEndsAt\) > 0\) deadlines\.push/);
const leaveRoomAction = worker.slice(worker.indexOf("if (type === 'leave_room')"), worker.indexOf("if (type === 'add_bots')"));
assert.doesNotMatch(leaveRoomAction, /requirePlayer\(\)/);
assert.match(worker, /takeOverInactivePlayers/);
assert.match(worker, /publicVotes/);
assert.match(worker, /publicRoles/);
assert.match(worker, /type === 'restore_player_control'/);
assert.match(worker, /voterName: voter\.name/);
assert.match(worker, /room\.lastResult\?\.publicVotes/);

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
assert.match(app, /URUTAN AKSI DAN HASIL/);
assert.match(app, /moderator-event-number/);
assert.match(worker, /Perlindungan malam nonaktif/);
assert.match(worker, /Menetapkan target bonus kemenangan/);

assert.match(app, /actionReport/);
assert.match(css, /phase-panel \.hint/);
assert.match(css, /\.moderator-event-detail/);
assert.doesNotMatch(app.slice(app.indexOf('function phaseHeader'), app.indexOf('function appendRoleDetails')), /if \(description\)/);

assert.match(css, /\.app:has\(#roomPanel:not\(\.hidden\)\)/, 'The large landing hero must disappear while a room is active.');
assert.match(css, /#playersList\{max-height:/, 'The mobile player list must stay compact and scroll internally.');
assert.match(css, /\.phase-tracker\{display:flex/, 'The phase tracker must scroll horizontally on mobile.');
assert.match(css, /\.action-button\{min-height:50px/, 'Mobile action buttons must remain easy to tap.');
assert.match(css, /\.role-flip-card\{width:min\(275px,100%\);height:310px/, 'Role reminder cards must fit phone screens.');
assert.match(css, /\.phase-title p\{display:none/, 'Long phase descriptions are hidden on mobile.');
assert.match(html, /20261106-werewolf-live-activity-12/);
assert.match(sw, /20261106-werewolf-live-activity-12/);
assert.ok(sw.includes('/werewolf/assets/illustrations/role-moderator.svg'));
assert.ok(sw.includes('/werewolf/assets/illustrations/role-wolf_seer.svg'));
assert.ok(sw.includes('/werewolf/assets/illustrations/role-trapper.svg'));
assert.match(read('public/werewolf/assets/illustrations/role-moderator.svg'), /<svg/);

assert.match(app, /function renderPlayerDawn/);
assert.match(app, /function renderModeratorDawn/);
assert.match(app, /role-count-stepper/);
assert.match(app, /roleDrawSeconds/);
assert.match(app, /nightSeconds/);
assert.match(app, /dawnSeconds/);
assert.match(app, /resultSeconds/);
assert.match(app, /HASIL PENERAWANGAN PRIBADI/);
assert.match(app, /Pilihan dapat diganti sampai timer habis/);
assert.match(app, /self\.voteTargetId === target\.id/);
assert.doesNotMatch(app, /Pilihan tersimpan/);
assert.match(worker, /type === 'dawn_action'/);
assert.match(worker, /type === 'resolve_dawn'/);
assert.match(worker, /type === 'resolve_result'/);
assert.match(worker, /resultActions/);
assert.match(worker, /resultResolved/);
assert.match(worker, /seerHistory/);
assert.match(worker, /botNightReports/);
assert.match(css, /\.role-count-stepper/);
assert.match(css, /\.private-inspection-panel/);
assert.match(css, /\.discussion-chat-form/);

console.log('Werewolf private-card, moderator-report, role privacy, and wolf-team UI checks passed.');


assert.match(html, /id="scanQrButton"/);
assert.match(html, /id="scanQrDialog"/);
assert.match(html, /id="qrScannerVideo"/);
assert.match(html, /id="qrScannerCanvas"/);
assert.match(app, /function parseRoomCodeFromQr/);
assert.match(app, /function openQrScanner/);
assert.match(app, /function stopQrScanner/);
assert.match(app, /navigator\.mediaDevices\?\.getUserMedia/);
assert.match(app, /window\.jsQR/);
assert.match(app, /room=\(\[A-HJ-NP-Z2-9\]\{6\}\)/);
assert.match(css, /\.scan-qr-dialog/);
assert.match(css, /\.scan-qr-video/);
assert.match(sw, /\/werewolf\/vendor\/jsQR\.js/);
console.log('Werewolf lobby QR camera scanner checks passed.');


assert.ok(html.includes('data-step="morning">Pagi · Diskusi'));
assert.ok(html.includes('data-step="voting">Sore · Voting'));
assert.ok(app.includes("phaseHeader(parent, 'BUKA KARTU'"));
assert.ok(app.includes("phaseHeader(parent, 'TENGAH MALAM · RONDE ' + room.round, 'Aksi malam'"));
assert.ok(app.includes("phaseHeader(parent, 'SORE · RONDE ' + room.round, 'Voting eksekusi'"));
assert.ok(app.includes('Pagi · Diskusi (detik)'));
assert.ok(app.includes('Sore · Voting (detik)'));
assert.ok(app.includes('chat-night-report-badge'));
assert.ok(worker.includes('actionSpeakers'));
assert.ok(worker.includes('isNightReport: Boolean(message.isNightReport)'));
assert.ok(css.includes('.role-count-grid .role-config-info-disclosure[open] .role-config-info-details'));
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
