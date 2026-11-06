import assert from 'node:assert/strict';
import worker, { WerewolfRoom, recommendedRoleCounts } from '../cloudflare/werewolf-worker/src/index.js';

class MemoryStorage {
  constructor() { this.values = new Map(); }
  async get(key) { return this.values.get(key); }
  async put(key, value) { this.values.set(key, structuredClone(value)); }
  async delete(key) { return this.values.delete(key); }
  async setAlarm(value) { this.alarmAt = value; }
  async deleteAll() { this.values.clear(); }
  async deleteAlarm() { this.alarmAt = null; }
}

class FakeSocket {
  constructor(actorId, actorType = 'player') {
    this.attachment = { actorId, actorType };
    this.messages = [];
  }
  deserializeAttachment() { return this.attachment; }
  send(message) { this.messages.push(String(message)); }
}

function makeRequest(path, method = 'GET', body, token) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = 'Bearer ' + token;
  return new Request('https://room.internal' + path, {
    method, headers, body: body === undefined ? undefined : JSON.stringify(body)
  });
}

async function payload(response, expectedStatus = 200) {
  const data = await response.json();
  assert.equal(response.status, expectedStatus, data.error || 'Unexpected response status ' + response.status);
  return data;
}

async function submitVillagerMath(room, token) {
  const view = (await payload(await room.fetch(makeRequest('/internal/state', 'GET', undefined, token)))).state;
  const prompt = view.self.villagerPrompt;
  assert.ok(prompt && prompt.id && prompt.question);
  assert.equal(prompt.options.length, 4);
  assert.deepEqual(Object.keys(prompt).sort(), ['id', 'options', 'question']);
  await payload(await room.fetch(makeRequest('/internal/action', 'POST', {
    type: 'night_action', mode: 'villager_math', promptId: prompt.id, choiceIndex: 0
  }, token)));
}

async function actionAfterDeadline(room, token, type, body = {}) {
  const deadlineField = ({
    resolve_night: 'nightEndsAt',
    resolve_dawn: 'dawnEndsAt',
    start_voting: 'discussionEndsAt',
    resolve_result: 'resultEndsAt',
    next_round: 'resultEndsAt'
  })[type];
  const state = await room.loadRoom();
  const deadline = Number(deadlineField ? state?.[deadlineField] : 0) || 0;
  const realNow = Date.now;
  try {
    if (deadline > realNow()) Date.now = () => deadline + 1;
    return await payload(await room.fetch(makeRequest('/internal/action', 'POST', {
      ...body, type
    }, token)));
  } finally {
    Date.now = realNow;
  }
}

const storage = new MemoryStorage();
const room = new WerewolfRoom({ storage, getWebSockets: () => [] }, {
  ALLOWED_ORIGINS: 'https://irvan1609.github.io'
});
const created = await payload(await room.fetch(makeRequest('/internal/create', 'POST', {
  code: 'WALF23', name: 'Moderator'
})), 201);
assert.ok(created.moderatorId);
let saved = await room.loadRoom();
assert.equal(saved.players.length, 1);
assert.equal(saved.players[0].id, created.moderatorId);
assert.equal(saved.players[0].isHost, true);
assert.equal(saved.players[0].tokenHash, saved.moderator.tokenHash);
assert.equal(saved.phase, 'lobby');
assert.equal(saved.settings.roleCounts, null);
assert.equal(saved.settings.wolves, 1);
assert.equal(saved.settings.seer, true);
assert.equal(saved.settings.doctor, true);
assert.equal(saved.settings.gameMode, undefined, 'Rooms no longer have a global online/offline voice setting.');
assert.equal(saved.players[0].voiceMode, 'online', 'The room creator defaults to online voice.');
assert.equal(saved.hostId, created.moderatorId);
assert.ok(saved.moderator.tokenHash);

const moderatorToken = created.token;
const names = ['Alya', 'Bima', 'Citra', 'Doni', 'Eka'];
const playerTokens = [];
for (const name of names) {
  const joined = await payload(await room.fetch(makeRequest('/internal/join', 'POST', { name })), 201);
  playerTokens.push(joined.token);
}
assert.equal((await room.loadRoom()).players.length, 6);
await payload(await room.fetch(makeRequest('/internal/action', 'POST', {
  type: 'send_discussion_chat', text: 'Pesan dari lobby.'
}, playerTokens[0])));
const lobbyChatReader = (await payload(await room.fetch(
  makeRequest('/internal/state', 'GET', undefined, playerTokens[1])
))).state;
assert.equal(lobbyChatReader.chat.length, 1);
assert.equal(lobbyChatReader.chat[0].text, 'Pesan dari lobby.');

const moderatorBeforeStart = (await payload(await room.fetch(
  makeRequest('/internal/state', 'GET', undefined, moderatorToken)
))).state;
assert.equal(moderatorBeforeStart.self.isModerator, true);
assert.equal(moderatorBeforeStart.players.length, 6);
assert.equal(moderatorBeforeStart.players.some(player => player.role), false);

const roleSettings = {
  roleCounts: {
    wolf: 1, alpha_wolf: 0, seer: 1, doctor: 1, bodyguard: 0,
    witch: 0, hunter: 0, cupid: 0, guardian_angel: 0, detective: 0,
    mayor: 0, jester: 0, villager: 2, moderator: 0
  },
  abilities: {
    alphaDoubleVote: true, seerInspection: true, doctorProtection: true,
    bodyguardSacrifice: true, witchHeal: true, witchPoison: true,
    hunterShot: true, cupidBond: true, guardianProtection: true,
    guardianBonus: true, detectiveInspection: true, mayorDoubleVote: false,
    jesterSoloWin: true
  }
};
await payload(await room.fetch(makeRequest('/internal/action', 'POST', {
  type: 'update_settings', settings: roleSettings
}, playerTokens[0])), 403);
await payload(await room.fetch(makeRequest('/internal/action', 'POST', {
  type: 'update_settings', settings: { ...roleSettings, roleCounts: { ...roleSettings.roleCounts, villager: 1 } }
}, moderatorToken)));
await payload(await room.fetch(makeRequest('/internal/action', 'POST', { type: 'start_game' }, moderatorToken)), 409);
await payload(await room.fetch(makeRequest('/internal/action', 'POST', {
  type: 'update_settings', settings: roleSettings
}, moderatorToken)));
saved = await room.loadRoom();
assert.equal(saved.settings.roleCounts.wolf, 1);
assert.equal(saved.settings.roleCounts.villager, 2);
assert.equal(saved.settings.roleCounts.moderator, 0);
assert.equal(saved.settings.abilities.mayorDoubleVote, false);
await payload(await room.fetch(makeRequest('/internal/action', 'POST', {
  type: 'update_settings', settings: { ...roleSettings, roleCounts: { ...roleSettings.roleCounts, moderator: 1 } }
}, moderatorToken)));
assert.equal((await room.loadRoom()).settings.roleCounts.moderator, 1);
await payload(await room.fetch(makeRequest('/internal/action', 'POST', {
  type: 'update_settings', settings: { ...roleSettings, roleCounts: { ...roleSettings.roleCounts, moderator: 2 } }
}, moderatorToken)), 400);
await payload(await room.fetch(makeRequest('/internal/action', 'POST', { type: 'update_settings', settings: roleSettings }, moderatorToken)));

await payload(await room.fetch(makeRequest('/internal/action', 'POST', { type: 'start_game' }, playerTokens[0])), 403);
await payload(await room.fetch(makeRequest('/internal/action', 'POST', { type: 'start_game' }, moderatorToken)));
saved = await room.loadRoom();
assert.equal(saved.phase, 'role_draw');
assert.equal(saved.players.length, 5);
assert.equal(saved.activeModeratorId, saved.hostId);
assert.equal(saved.moderator.id, saved.hostId);
assert.ok(!saved.players.some(player => player.id === saved.hostId));

// Deterministic roles make the night and voting checks repeatable.
saved.players[0].role = 'wolf';
saved.players[1].role = 'seer';
saved.players[2].role = 'doctor';
saved.players[3].role = 'villager';
saved.players[4].role = 'villager';
await room.saveRoom(saved);

for (let i = 0; i < playerTokens.length; i += 1) {
  const before = (await payload(await room.fetch(
    makeRequest('/internal/state', 'GET', undefined, playerTokens[i])
  ))).state;
  assert.equal(before.self.role, null);
  assert.equal(before.players.length, 0);
  assert.equal(before.room.lastResult, null);
  await payload(await room.fetch(makeRequest('/internal/action', 'POST', { type: 'draw_card' }, playerTokens[i])));
}
const moderatorAfterDraw = (await payload(await room.fetch(
  makeRequest('/internal/state', 'GET', undefined, moderatorToken)
))).state;
assert.ok(moderatorAfterDraw.players.every(player => player.hasDrawn));

await payload(await room.fetch(makeRequest('/internal/action', 'POST', { type: 'start_night' }, playerTokens[0])), 403);
await payload(await room.fetch(makeRequest('/internal/action', 'POST', { type: 'start_night' }, moderatorToken)));
saved = await room.loadRoom();
assert.equal(saved.phase, 'night');

const nightActions = [
  { type: 'night_action', targetId: saved.players[3].id },
  { type: 'night_action', targetId: saved.players[0].id },
  { type: 'night_action', targetId: saved.players[3].id }
];
for (let i = 0; i < nightActions.length; i += 1) {
  await payload(await room.fetch(makeRequest('/internal/action', 'POST', nightActions[i], playerTokens[i])));
}
await submitVillagerMath(room, playerTokens[3]);
await submitVillagerMath(room, playerTokens[4]);
const nightProgress = (await payload(await room.fetch(
  makeRequest('/internal/state', 'GET', undefined, moderatorToken)
))).state;
assert.equal(nightProgress.room.nightActionsSubmitted, 5);
assert.equal(nightProgress.room.nightActionsRequired, 5);
assert.ok(nightProgress.room.nightEndsAt > Date.now());
const seerNightView = (await payload(await room.fetch(
  makeRequest('/internal/state', 'GET', undefined, playerTokens[1])
))).state;
assert.equal(seerNightView.room.phase, 'night');
assert.equal(seerNightView.self.seerResult, null,
  'Seer results must remain hidden until the night phase is resolved.');
const nonSeerNightView = (await payload(await room.fetch(
  makeRequest('/internal/state', 'GET', undefined, playerTokens[3])
))).state;
assert.equal(nonSeerNightView.self.seerResult, null, 'Seer inspection must stay private.');
const firstNightDeadline = (await room.loadRoom()).nightEndsAt;
const realNowAfterFirstNight = Date.now;
try {
  Date.now = () => firstNightDeadline + 1;
  await payload(await room.fetch(makeRequest('/internal/action', 'POST', {
    type: 'resolve_night'
  }, moderatorToken)));
} finally {
  Date.now = realNowAfterFirstNight;
}
saved = await room.loadRoom();
assert.equal(saved.phase, 'morning');
assert.equal(saved.discussionEndsAt, saved.lastResult.at + 30000,
  'Morning discussion must default to 30 seconds.');
assert.equal(saved.players[3].alive, true); // Doctor protected the selected target.
const morningModerator = (await payload(await room.fetch(
  makeRequest('/internal/state', 'GET', undefined, moderatorToken)
))).state;
assert.match(morningModerator.room.lastResult.message, /perlindungan/);
const nightActionReport = morningModerator.room.lastResult.actionReport;
assert.ok(Array.isArray(nightActionReport));
assert.deepEqual(nightActionReport.map(item => item.role), [
  'Werewolf', 'Seer', 'Doctor', 'Warga Desa', 'Warga Desa', 'Hasil akhir'
]);
assert.match(nightActionReport[0].outcome, /Doni/);
assert.match(nightActionReport.find(item => item.role === 'Seer').outcome, /Werewolf/);
assert.match(nightActionReport.find(item => item.role === 'Doctor').outcome, /selamat/);

assert.match(nightActionReport.find(item => item.role === 'Warga Desa').outcome, /Jawaban (benar|salah)/);
assert.deepEqual(nightActionReport.map(item => item.order),
  [...nightActionReport].map(item => item.order).sort((left, right) => left - right));

assert.equal(morningModerator.players[0].role, 'wolf');
const morningPlayer = (await payload(await room.fetch(
  makeRequest('/internal/state', 'GET', undefined, playerTokens[3])
))).state;
assert.equal(morningPlayer.room.lastResult, null);
assert.equal(morningPlayer.room.lastResult?.actionReport, undefined);
assert.equal(morningPlayer.players.length, 0);
assert.equal(morningPlayer.self.status, 'survived');
assert.ok(morningPlayer.targets.every(target => target.name && target.id));
const seerMorning = (await payload(await room.fetch(
  makeRequest('/internal/state', 'GET', undefined, playerTokens[1])
))).state;
assert.equal(seerMorning.self.alive, true);
assert.equal(seerMorning.self.seerResult.playerName, 'Alya');
assert.equal(seerMorning.self.seerResult.result, 'wolf');
assert.equal(seerMorning.self.seerResult.targetRole, 'wolf',
  'The Seer receives the exact inspected role in the private result.');
assert.equal(seerMorning.self.seerResult.targetFaction, 'wolves');
assert.equal(seerMorning.self.seerResult.round, 1);
assert.ok(seerMorning.room.revision > 0);
await payload(await room.fetch(makeRequest('/internal/action', 'POST', {
  type: 'send_discussion_chat', text: 'Aku melihat kejadian malam tadi.'
}, playerTokens[3])));
const chatReader = (await payload(await room.fetch(
  makeRequest('/internal/state', 'GET', undefined, playerTokens[4])
))).state;
assert.equal(chatReader.chat.length, 2, 'Chat history remains visible across phases.');
assert.equal(chatReader.chat[0].text, 'Pesan dari lobby.');
assert.equal(chatReader.chat[1].name, 'Doni');
assert.equal(chatReader.chat[1].text, 'Aku melihat kejadian malam tadi.');
await payload(await room.fetch(makeRequest('/internal/action', 'POST', { type: 'start_voting' }, playerTokens[0])), 403);
await payload(await room.fetch(makeRequest('/internal/action', 'POST', { type: 'start_voting' }, moderatorToken)), 409);
const discussionDeadline = saved.discussionEndsAt;
const realNowAfterDiscussion = Date.now;
try {
  Date.now = () => discussionDeadline + 1;
  await payload(await room.fetch(makeRequest('/internal/action', 'POST', { type: 'start_voting' }, moderatorToken)));
} finally {
  Date.now = realNowAfterDiscussion;
}
saved = await room.loadRoom();
assert.equal(saved.phase, 'voting');
assert.equal(saved.votingEndsAt, discussionDeadline + 1 + 15000,
  'Voting must default to a 15-second window.');

for (let i = 0; i < playerTokens.length; i += 1) {
  if (i === 4) {
    await payload(await room.fetch(makeRequest('/internal/action', 'POST', {
      type: 'cast_vote', abstain: true
    }, playerTokens[i])));
  } else {
    await payload(await room.fetch(makeRequest('/internal/action', 'POST', {
      type: 'cast_vote', targetId: saved.players[4].id
    }, playerTokens[i])));
  }
}
saved = await room.loadRoom();
assert.equal(saved.phase, 'voting'); // Votes never advance the phase automatically.
assert.equal(Object.keys(saved.votes).length, 5);
assert.equal(saved.votes[saved.players[4].id], null, 'Abstain must be stored as a submitted ballot.');
await payload(await room.fetch(makeRequest('/internal/action', 'POST', {
  type: 'cast_vote', targetId: saved.players[3].id
}, playerTokens[0])));
saved = await room.loadRoom();
assert.equal(saved.votes[saved.players[0].id], saved.players[3].id,
  'A player may replace a vote while the voting timer remains active.');
await payload(await room.fetch(makeRequest('/internal/action', 'POST', {
  type: 'cast_vote', targetId: saved.players[4].id
}, playerTokens[0])));
saved = await room.loadRoom();
assert.equal(saved.votes[saved.players[0].id], saved.players[4].id,
  'The latest vote choice must replace the earlier ballot.');
await payload(await room.fetch(makeRequest('/internal/action', 'POST', { type: 'resolve_vote' }, playerTokens[0])), 403);
const votingDeadline = saved.votingEndsAt;
const realNowAfterVoting = Date.now;
try {
  Date.now = () => votingDeadline + 1;
  await room.alarm();
} finally {
  Date.now = realNowAfterVoting;
}
saved = await room.loadRoom();
assert.equal(saved.phase, 'result', 'Manual moderator voting must be tallied automatically when its timer expires.');
assert.equal(saved.players[4].alive, false);
assert.equal(saved.lastResult.voteTotalWeight, 5);
assert.equal(saved.lastResult.abstainCount, 1);
const voteResultPlayer = (await payload(await room.fetch(
  makeRequest('/internal/state', 'GET', undefined, playerTokens[4])
))).state;
assert.equal(voteResultPlayer.room.lastResult, null);
assert.equal(voteResultPlayer.self.status, 'eliminated');

const firstResultDeadline = saved.resultEndsAt;
const realNowBeforeNextRound = Date.now;
try {
  Date.now = () => firstResultDeadline + 1;
  await payload(await room.fetch(makeRequest('/internal/action', 'POST', { type: 'next_round' }, moderatorToken)));
} finally {
  Date.now = realNowBeforeNextRound;
}
assert.equal((await room.loadRoom()).phase, 'night');

// Repeated moderator-controlled rounds must not stop at an arbitrary night limit.
for (let expectedRound = 3; expectedRound <= 250; expectedRound += 1) {
  const current = await room.loadRoom();
  current.phase = 'result';
  current.winner = null;
  current.resultResolved = true;
  current.resultEndsAt = 0;
  current.resultActions = {};
  await room.saveRoom(current);
  await payload(await room.fetch(makeRequest('/internal/action', 'POST', { type: 'next_round' }, moderatorToken)));
  const advanced = await room.loadRoom();
  assert.equal(advanced.round, expectedRound, `Night round ${expectedRound} must remain available.`);
  assert.equal(advanced.phase, 'night');
}
console.log('Werewolf moderator flow checks passed: private actions, manual phase control, and 250 consecutive night rounds without a round cap.');

const soloStorage = new MemoryStorage();
const soloRoom = new WerewolfRoom({ storage: soloStorage, getWebSockets: () => [] }, {});
const soloCreated = await payload(await soloRoom.fetch(makeRequest('/internal/create', 'POST', {
  code: 'B7T234', name: 'Solo Moderator',
  settings: { wolves: 1, seer: true, doctor: true }
})), 201);
const soloToken = soloCreated.token;
await payload(await soloRoom.fetch(makeRequest('/internal/action', 'POST', { type: 'add_bots', count: 5 }, soloToken)));
let soloState = await soloRoom.loadRoom();
assert.equal(soloState.players.length, 6);
assert.equal(soloState.players.filter(player => player.isBot).length, 5);
assert.ok(soloState.players.filter(player => player.isBot).every(player => !player.tokenHash));
assert.ok(soloState.players.some(player => player.isHost));
await payload(await soloRoom.fetch(makeRequest('/internal/action', 'POST', { type: 'start_game' }, soloToken)));
soloState = await soloRoom.loadRoom();
assert.ok(soloState.players.every(player => player.hasDrawn));
await payload(await soloRoom.fetch(makeRequest('/internal/action', 'POST', { type: 'start_night' }, soloToken)));
soloState = await soloRoom.loadRoom();
assert.equal(Object.keys(soloState.nightActions).length, 5);
await actionAfterDeadline(soloRoom, soloToken, 'resolve_night', { force: true });
assert.equal((await soloRoom.loadRoom()).phase, 'morning');
soloState = await soloRoom.loadRoom();
soloState.phase = 'morning';
soloState.winner = null;
soloState.players.forEach((player, index) => {
  player.role = ['wolf', 'seer', 'doctor', 'villager', 'villager'][index];
  player.alive = true;
  player.suspicionTargetId = null;
});
soloState.seerResults = {
  [soloState.players[1].id]: {
    round: 1,
    playerName: soloState.players[0].name,
    result: 'wolf'
  }
};
soloState.botNightReports[soloState.players[1].id] = {
  round: 1,
  text: 'Aku memeriksa ' + soloState.players[0].name + ' tadi malam. Hasilnya: dia terdeteksi sebagai Werewolf.'
};
soloState.lastResult = {
  kind: 'night',
  message: 'Malam berlalu tanpa korban.',
  eliminatedId: null,
  at: Date.now(),
  round: 1
};
soloState.chat = [];
soloState.botDiscussionRound = null;
await soloRoom.saveRoom(soloState);
await payload(await soloRoom.fetch(makeRequest('/internal/action', 'POST', { type: 'start_discussion' }, soloToken)));
soloState = await soloRoom.loadRoom();
assert.equal(soloState.phase, 'discussion');
assert.equal(soloState.discussionMode, 'voice');
assert.equal(soloState.callUrl, '');
assert.equal(soloState.chat.length, 5,
  'Every living bot that completed a night action must contribute to discussion.');
assert.ok(soloState.chat.every(message =>
  soloState.players.some(player => player.id === message.playerId && player.isBot)
));
assert.ok(soloState.chat[0].text.includes(soloState.players[0].name));
const soloModeratorView = (await payload(await soloRoom.fetch(
  makeRequest('/internal/state', 'GET', undefined, soloToken)
))).state;
assert.equal(soloModeratorView.chat.length, 5);
assert.ok(soloModeratorView.chat.every(message => message.isBot));
assert.ok(soloModeratorView.chat.filter(message => message.isNightReport).length >= 5);
const soloPlayerView = soloRoom.snapshot(soloState, soloState.players[0].id, 'player');
assert.equal(soloPlayerView.chat.length, 5);
assert.ok(soloPlayerView.chat.every(message => message.isBot));
await payload(await soloRoom.fetch(makeRequest('/internal/action', 'POST', { type: 'set_discussion', mode: 'offline' }, soloToken)));
await payload(await soloRoom.fetch(makeRequest('/internal/action', 'POST', { type: 'start_voting' }, soloToken)));
soloState = await soloRoom.loadRoom();
assert.equal(soloState.phase, 'voting');
assert.equal(Object.keys(soloState.votes).length, soloState.players.filter(player => player.alive).length);
await payload(await soloRoom.fetch(makeRequest('/internal/action', 'POST', { type: 'resolve_vote' }, soloToken)));
soloState = await soloRoom.loadRoom();
assert.ok(['result', 'finished'].includes(soloState.phase));


const systemStorage = new MemoryStorage();
const systemRoom = new WerewolfRoom({ storage: systemStorage, getWebSockets: () => [] }, {});
const systemCreated = await payload(await systemRoom.fetch(makeRequest('/internal/create', 'POST', {
  code: 'SYS2MD', name: 'System Moderator',
  settings: {
    roleCounts: {
      wolf: 1, alpha_wolf: 0, seer: 1, doctor: 1, bodyguard: 0,
      witch: 0, hunter: 0, cupid: 0, guardian_angel: 0, detective: 0,
      mayor: 0, jester: 0, villager: 3, moderator: 1
    }
  }
})), 201);
const systemToken = systemCreated.token;
const systemTokens = [systemToken];
for (const name of ['Ari', 'Bela', 'Caca', 'Dika', 'Evan']) {
  const joined = await payload(await systemRoom.fetch(makeRequest('/internal/join', 'POST', { name })), 201);
  systemTokens.push(joined.token);
}
await payload(await systemRoom.fetch(makeRequest('/internal/action', 'POST', { type: 'start_game' }, systemToken)));
let systemState = await systemRoom.loadRoom();
assert.equal(systemState.settings.roleCounts.moderator, 1);
assert.equal(systemState.players.length, 6, 'System moderator mode keeps the host in the active player roster.');
assert.equal(systemState.activeModeratorId, null);
assert.ok(systemState.players.some(player => player.id === systemState.hostId));
systemState.players.forEach((player, index) => {
  player.role = ['wolf', 'seer', 'doctor', 'villager', 'villager', 'villager'][index];
  player.hasDrawn = false;
});
await systemRoom.saveRoom(systemState);
for (const token of systemTokens) {
  await payload(await systemRoom.fetch(makeRequest('/internal/action', 'POST', { type: 'draw_card' }, token)));
}
const systemHostView = (await payload(await systemRoom.fetch(
  makeRequest('/internal/state', 'GET', undefined, systemToken)
))).state;
assert.equal(systemHostView.self.isHost, true);
assert.equal(systemHostView.self.isModerator, false);
assert.equal(systemHostView.self.role, 'wolf');
assert.equal(systemHostView.self.hasDrawn, true, 'The host must receive their own role card as a player in system moderator mode.');
assert.equal(systemHostView.players.length, systemState.players.length, 'The host must see the player status roster while playing.');
assert.ok(systemHostView.players.every(player => !Object.prototype.hasOwnProperty.call(player, 'role')),
  'The system host must not see other players’ private roles.');
assert.ok(systemHostView.players.every(player => !Object.prototype.hasOwnProperty.call(player, 'nightActionTarget')),
  'The system host must not see other players’ private night targets.');
systemState = await systemRoom.loadRoom();
assert.equal(systemState.phase, 'night', 'System moderator starts night after every card is opened.');
assert.equal(systemState.nightActions[systemState.players[3].id], undefined, 'System mode waits for human Villagers to complete the night challenge.');
assert.equal(systemState.nightActions[systemState.players[4].id], undefined);
await payload(await systemRoom.fetch(makeRequest('/internal/action', 'POST', {
  type: 'night_action', targetId: systemState.players[3].id
}, systemTokens[0])));
await payload(await systemRoom.fetch(makeRequest('/internal/action', 'POST', {
  type: 'night_action', targetId: systemState.players[0].id
}, systemTokens[1])));
await payload(await systemRoom.fetch(makeRequest('/internal/action', 'POST', {
  type: 'night_action', targetId: systemState.players[3].id
}, systemTokens[2])));
await submitVillagerMath(systemRoom, systemTokens[3]);
await submitVillagerMath(systemRoom, systemTokens[4]);
await submitVillagerMath(systemRoom, systemTokens[5]);
systemState = await systemRoom.loadRoom();
assert.equal(systemState.phase, 'night', 'System moderator keeps the night open for its configured action window.');
assert.ok(systemState.nightEndsAt);
const systemNightDeadline = systemState.nightEndsAt;
const realNowAfterSystemNight = Date.now;
try {
  Date.now = () => systemNightDeadline + 1;
  await systemRoom.alarm();
} finally {
  Date.now = realNowAfterSystemNight;
}
systemState = await systemRoom.loadRoom();
assert.equal(systemState.phase, 'morning', 'System moderator resolves the night and moves to morning automatically when no dawn-trigger role can act.');
assert.ok(systemState.discussionEndsAt);
assert.match(systemState.lastResult.message, /perlindungan/);
const systemMorningView = (await payload(await systemRoom.fetch(
  makeRequest('/internal/state', 'GET', undefined, systemTokens[3])
))).state;
assert.equal(systemMorningView.room.publicResult.kind, 'night');
assert.equal(systemMorningView.room.publicResult.message, systemState.lastResult.message,
  'System moderator must publish the same night-result message produced by the shared resolution engine.');
assert.deepEqual(
  systemMorningView.room.publicResult.eliminatedPlayers.map(item => item.name),
  systemState.lastResult.eliminations.map(item => item.name),
  'The public elimination list must match the actual system-resolved night result.'
);
assert.equal(systemMorningView.room.lastResult, null,
  'Private moderator action details must remain hidden from players in system mode.');
const systemDiscussionDeadline = systemState.discussionEndsAt;
const realNowAfterSystemDiscussion = Date.now;
try {
  Date.now = () => systemDiscussionDeadline + 1;
  await systemRoom.alarm();
} finally {
  Date.now = realNowAfterSystemDiscussion;
}
systemState = await systemRoom.loadRoom();
assert.equal(systemState.phase, 'voting', 'System moderator must start voting automatically after the discussion timer.');
for (let index = 0; index < systemTokens.length; index += 1) {
  const targetId = index === 3 ? systemState.players[4].id : systemState.players[3].id;
  await payload(await systemRoom.fetch(makeRequest('/internal/action', 'POST', {
    type: 'cast_vote', targetId
  }, systemTokens[index])));
}
systemState = await systemRoom.loadRoom();
assert.equal(systemState.phase, 'voting', 'System moderator keeps the voting window open for its configured duration.');
const systemVotingDeadline = systemState.votingEndsAt;
const realNowAfterSystemVotes = Date.now;
try {
  Date.now = () => systemVotingDeadline + 1;
  await systemRoom.alarm();
} finally {
  Date.now = realNowAfterSystemVotes;
}
systemState = await systemRoom.loadRoom();
assert.equal(systemState.phase, 'result', 'System moderator publishes the result automatically when the voting timer expires.');
assert.equal(systemState.players[3].alive, false);
const systemVoteView = (await payload(await systemRoom.fetch(
  makeRequest('/internal/state', 'GET', undefined, systemTokens[3])
))).state;
assert.equal(systemVoteView.room.publicResult.kind, 'vote');
assert.equal(systemVoteView.room.publicResult.message, systemState.lastResult.message,
  'System moderator must publish the same voting result message produced by the shared vote resolver.');
assert.deepEqual(
  systemVoteView.room.publicResult.eliminatedPlayers.map(item => item.name),
  systemState.lastResult.eliminations.map(item => item.name),
  'The public elimination list must match the actual system-resolved voting result.'
);
assert.equal(systemVoteView.room.lastResult, null,
  'Private moderator vote details must remain hidden from players in system mode.');
console.log('Werewolf system moderator checks passed: automatic night start, passive-role passes, automatic night resolution, public result parity, discussion, and automatic vote tally.');

const witchRoom = new WerewolfRoom({ storage: new MemoryStorage(), getWebSockets: () => [] }, {
  ALLOWED_ORIGINS: 'https://irvan1609.github.io'
});
const witchCreated = await payload(await witchRoom.fetch(makeRequest('/internal/create', 'POST', {
  code: 'W7TCH2', name: 'Witch Moderator'
})), 201);
const witchTokens = [];
const witchNames = ['Mira', 'Nino', 'Omar', 'Pia', 'Rafi'];
for (const name of witchNames) {
  const joined = await payload(await witchRoom.fetch(makeRequest('/internal/join', 'POST', { name })), 201);
  witchTokens.push(joined.token);
}
const witchSettings = {
  roleCounts: {
    wolf: 1, alpha_wolf: 0, seer: 0, doctor: 0, bodyguard: 0,
    witch: 1, hunter: 0, cupid: 1, guardian_angel: 0, detective: 0,
    mayor: 0, jester: 0, villager: 2, moderator: 0
  },
  abilities: {
    alphaDoubleVote: true, seerInspection: true, doctorProtection: true,
    bodyguardSacrifice: true, witchHeal: true, witchPoison: true,
    hunterShot: true, cupidBond: true, guardianProtection: true,
    guardianBonus: true, detectiveInspection: true, mayorDoubleVote: true,
    jesterSoloWin: true
  }
};
await payload(await witchRoom.fetch(makeRequest('/internal/action', 'POST', {
  type: 'update_settings', settings: witchSettings
}, witchCreated.token)));
await payload(await witchRoom.fetch(makeRequest('/internal/action', 'POST', { type: 'start_game' }, witchCreated.token)));
let witchState = await witchRoom.loadRoom();
const witchRoles = ['wolf', 'witch', 'cupid', 'villager', 'villager'];
witchState.players.forEach((player, index) => {
  player.role = witchRoles[index];
  player.hasDrawn = true;
});
witchState.witchPotions = {
  [witchState.players[1].id]: { heal: true, poison: true }
};
await witchRoom.saveRoom(witchState);
await payload(await witchRoom.fetch(makeRequest('/internal/action', 'POST', { type: 'start_night' }, witchCreated.token)));
const witchBeforeWolf = (await payload(await witchRoom.fetch(
  makeRequest('/internal/state', 'GET', undefined, witchTokens[1])
))).state;
assert.equal(witchBeforeWolf.self.witchAttack.ready, false);
const ordinaryPlayerBeforeWolf = (await payload(await witchRoom.fetch(
  makeRequest('/internal/state', 'GET', undefined, witchTokens[3])
))).state;
assert.equal(ordinaryPlayerBeforeWolf.self.witchAttack, null);
await payload(await witchRoom.fetch(makeRequest('/internal/action', 'POST', {
  type: 'night_action', mode: 'heal'
}, witchTokens[1])), 409);
await payload(await witchRoom.fetch(makeRequest('/internal/action', 'POST', {
  type: 'night_action', targetId: witchState.players[3].id
}, witchTokens[0])));
const witchAfterWolf = (await payload(await witchRoom.fetch(
  makeRequest('/internal/state', 'GET', undefined, witchTokens[1])
))).state;
assert.equal(witchAfterWolf.self.witchAttack.ready, true);
assert.equal(witchAfterWolf.self.witchAttack.targetName, witchNames[3]);
const ordinaryPlayerAfterWolf = (await payload(await witchRoom.fetch(
  makeRequest('/internal/state', 'GET', undefined, witchTokens[3])
))).state;
assert.equal(ordinaryPlayerAfterWolf.self.witchAttack, null);
assert.deepEqual(ordinaryPlayerAfterWolf.self.loverNames, []);
await payload(await witchRoom.fetch(makeRequest('/internal/action', 'POST', {
  type: 'night_action', targetId: witchState.players[3].id, partnerId: witchState.players[4].id
}, witchTokens[2])));
const cupidModeratorView = (await payload(await witchRoom.fetch(
  makeRequest('/internal/state', 'GET', undefined, witchCreated.token)
))).state;
assert.equal(cupidModeratorView.players[2].nightActionPartner, witchNames[4]);
await payload(await witchRoom.fetch(makeRequest('/internal/action', 'POST', {
  type: 'night_action', mode: 'heal'
}, witchTokens[1])));
await submitVillagerMath(witchRoom, witchTokens[3]);
await submitVillagerMath(witchRoom, witchTokens[4]);
await actionAfterDeadline(witchRoom, witchCreated.token, 'resolve_night', { force: true });
witchState = await witchRoom.loadRoom();
assert.equal(witchState.phase, 'morning');
assert.equal(witchState.players[3].alive, true);
assert.equal(witchState.witchPotions[witchState.players[1].id].heal, false);
const cupidView = (await payload(await witchRoom.fetch(
  makeRequest('/internal/state', 'GET', undefined, witchTokens[2])
))).state;
assert.deepEqual(cupidView.self.loverNames, [witchNames[3], witchNames[4]]);
assert.equal(cupidView.self.cupidUsed, true);
const linkedPlayerView = (await payload(await witchRoom.fetch(
  makeRequest('/internal/state', 'GET', undefined, witchTokens[3])
))).state;
assert.deepEqual(linkedPlayerView.self.loverNames, [witchNames[3], witchNames[4]]);
const wolfPlayerView = (await payload(await witchRoom.fetch(
  makeRequest('/internal/state', 'GET', undefined, witchTokens[0])
))).state;
assert.deepEqual(wolfPlayerView.self.loverNames, []);
assert.equal(wolfPlayerView.self.cupidUsed, false);
assert.deepEqual(wolfPlayerView.room.lovers, []);
const moderatorLoversView = (await payload(await witchRoom.fetch(
  makeRequest('/internal/state', 'GET', undefined, witchCreated.token)
))).state;
assert.deepEqual(moderatorLoversView.room.lovers, [witchNames[3], witchNames[4]]);
console.log('Werewolf Witch/Cupid checks passed: Witch-only attack clue, guarded healing, private Cupid pair disclosure, and moderator visibility.');

// A Cupid pair may contain a Werewolf and a Villager. Killing either member removes both.
const cupidNightRoom = new WerewolfRoom({ storage: new MemoryStorage(), getWebSockets: () => [] }, {});
const cupidNightCreated = await payload(await cupidNightRoom.fetch(makeRequest('/internal/create', 'POST', {
  code: 'CPDNT2', name: 'Cupid Moderator'
})), 201);
const cupidNightNames = ['Wolf One', 'Wolf Two', 'Cupid One', 'Village One', 'Village Two'];
const cupidNightTokens = [];
for (const name of cupidNightNames) {
  const joined = await payload(await cupidNightRoom.fetch(makeRequest('/internal/join', 'POST', { name })), 201);
  cupidNightTokens.push(joined.token);
}
await payload(await cupidNightRoom.fetch(makeRequest('/internal/action', 'POST', {
  type: 'start_game'
}, cupidNightCreated.token)));
let cupidNightState = await cupidNightRoom.loadRoom();
const cupidNightRoles = ['wolf', 'wolf', 'cupid', 'villager', 'villager'];
cupidNightState.players.forEach((player, index) => {
  player.role = cupidNightRoles[index];
  player.hasDrawn = true;
});
await cupidNightRoom.saveRoom(cupidNightState);
await payload(await cupidNightRoom.fetch(makeRequest('/internal/action', 'POST', {
  type: 'start_night'
}, cupidNightCreated.token)));
await payload(await cupidNightRoom.fetch(makeRequest('/internal/action', 'POST', {
  type: 'night_action', targetId: cupidNightState.players[3].id
}, cupidNightTokens[0])));
const liveWolfSelection = (await payload(await cupidNightRoom.fetch(
  makeRequest('/internal/state', 'GET', undefined, cupidNightTokens[1])
))).state;
assert.deepEqual(liveWolfSelection.wolfTeam, ['Wolf One', 'Wolf Two']);
assert.deepEqual(liveWolfSelection.wolfSelections, [
  { playerId: cupidNightState.players[0].id, name: 'Wolf One', hasChosen: true, targetName: 'Village One', isSelf: false },
  { playerId: cupidNightState.players[1].id, name: 'Wolf Two', hasChosen: false, targetName: null, isSelf: true }
]);
await payload(await cupidNightRoom.fetch(makeRequest('/internal/action', 'POST', {
  type: 'night_action', targetId: cupidNightState.players[3].id
}, cupidNightTokens[1])));
const allWolfSelections = (await payload(await cupidNightRoom.fetch(
  makeRequest('/internal/state', 'GET', undefined, cupidNightTokens[0])
))).state;
assert.deepEqual(allWolfSelections.wolfSelections, [
  { playerId: cupidNightState.players[0].id, name: 'Wolf One', hasChosen: true, targetName: 'Village One', isSelf: true },
  { playerId: cupidNightState.players[1].id, name: 'Wolf Two', hasChosen: true, targetName: 'Village One', isSelf: false }
]);
await payload(await cupidNightRoom.fetch(makeRequest('/internal/action', 'POST', {
  type: 'wolf_chat', text: 'Serang Village One bersama-sama.'
}, cupidNightTokens[0])));
const wolfChatForTeammate = (await payload(await cupidNightRoom.fetch(
  makeRequest('/internal/state', 'GET', undefined, cupidNightTokens[1])
))).state;
assert.equal(wolfChatForTeammate.wolfChat.length, 1);
assert.equal(wolfChatForTeammate.wolfChat[0].name, 'Wolf One');
assert.equal(wolfChatForTeammate.wolfChat[0].text, 'Serang Village One bersama-sama.');
const moderatorWolfRoomView = (await payload(await cupidNightRoom.fetch(
  makeRequest('/internal/state', 'GET', undefined, cupidNightCreated.token)
))).state;
assert.deepEqual(moderatorWolfRoomView.wolfTeam, []);
assert.deepEqual(moderatorWolfRoomView.wolfSelections, []);
assert.deepEqual(moderatorWolfRoomView.wolfChat, []);
await payload(await cupidNightRoom.fetch(makeRequest('/internal/action', 'POST', {
  type: 'wolf_chat', text: 'Saya bukan Werewolf.'
}, cupidNightTokens[3])), 403);
const privateVillagerWolfView = (await payload(await cupidNightRoom.fetch(
  makeRequest('/internal/state', 'GET', undefined, cupidNightTokens[3])
))).state;
assert.deepEqual(privateVillagerWolfView.wolfTeam, []);
assert.deepEqual(privateVillagerWolfView.wolfSelections, []);
assert.deepEqual(privateVillagerWolfView.wolfChat, []);
await payload(await cupidNightRoom.fetch(makeRequest('/internal/action', 'POST', {
  type: 'night_action', targetId: cupidNightState.players[0].id, partnerId: cupidNightState.players[3].id
}, cupidNightTokens[2])));
let cupidDraftState = await cupidNightRoom.loadRoom();
assert.equal(cupidDraftState.nightActions[cupidNightState.players[2].id].targetId, cupidNightState.players[0].id);
await payload(await cupidNightRoom.fetch(makeRequest('/internal/action', 'POST', {
  type: 'night_action', targetId: cupidNightState.players[1].id, partnerId: cupidNightState.players[4].id
}, cupidNightTokens[2])));
cupidDraftState = await cupidNightRoom.loadRoom();
assert.equal(cupidDraftState.nightActions[cupidNightState.players[2].id].targetId, cupidNightState.players[1].id,
  'Cupid can replace a saved pair before the midnight deadline.');
await payload(await cupidNightRoom.fetch(makeRequest('/internal/action', 'POST', {
  type: 'night_action', mode: 'cupid_clear'
}, cupidNightTokens[2])));
cupidDraftState = await cupidNightRoom.loadRoom();
assert.equal(cupidDraftState.nightActions[cupidNightState.players[2].id], undefined,
  'Cupid can clear a saved pair while choosing a replacement.');
await payload(await cupidNightRoom.fetch(makeRequest('/internal/action', 'POST', {
  type: 'night_action', targetId: cupidNightState.players[0].id, partnerId: cupidNightState.players[3].id
}, cupidNightTokens[2])));
await submitVillagerMath(cupidNightRoom, cupidNightTokens[3]);
await submitVillagerMath(cupidNightRoom, cupidNightTokens[4]);

const wolfNightPrivateView = (await payload(await cupidNightRoom.fetch(
  makeRequest('/internal/state', 'GET', undefined, cupidNightTokens[0])
))).state;
assert.deepEqual(wolfNightPrivateView.wolfTeam, cupidNightNames.slice(0, 2));
assert.equal(wolfNightPrivateView.wolfSelections.length, 2);
assert.equal(wolfNightPrivateView.wolfChat.length, 1);
assert.deepEqual(wolfNightPrivateView.players, []);
assert.equal(wolfNightPrivateView.room.lastResult, null);
assert.deepEqual(wolfNightPrivateView.room.lovers, []);
assert.ok(wolfNightPrivateView.targets.every(target => Object.keys(target).sort().join(',') === 'id,name'));
const villagerNightPrivateView = (await payload(await cupidNightRoom.fetch(
  makeRequest('/internal/state', 'GET', undefined, cupidNightTokens[4])
))).state;
assert.deepEqual(villagerNightPrivateView.wolfTeam, []);
assert.deepEqual(villagerNightPrivateView.players, []);

await actionAfterDeadline(cupidNightRoom, cupidNightCreated.token, 'resolve_night', { force: true });
cupidNightState = await cupidNightRoom.loadRoom();
assert.equal(cupidNightState.phase, 'morning');
assert.deepEqual(cupidNightState.wolfChat, []);
const wolfMorningPrivateView = (await payload(await cupidNightRoom.fetch(
  makeRequest('/internal/state', 'GET', undefined, cupidNightTokens[1])
))).state;
assert.deepEqual(wolfMorningPrivateView.wolfTeam, []);
assert.deepEqual(wolfMorningPrivateView.wolfSelections, []);
assert.deepEqual(wolfMorningPrivateView.wolfChat, []);
assert.equal(wolfMorningPrivateView.room.phase, 'morning');
await payload(await cupidNightRoom.fetch(makeRequest('/internal/action', 'POST', {
  type: 'wolf_chat', text: 'Chat harus tertutup setelah pagi.'
}, cupidNightTokens[1])), 409);
const moderatorMorningPrivateView = (await payload(await cupidNightRoom.fetch(
  makeRequest('/internal/state', 'GET', undefined, cupidNightCreated.token)
))).state;
assert.deepEqual(moderatorMorningPrivateView.wolfTeam, []);
assert.deepEqual(moderatorMorningPrivateView.wolfChat, []);
assert.equal(cupidNightState.players[0].alive, false);
assert.equal(cupidNightState.players[3].alive, false);
assert.equal(cupidNightState.lastResult.eliminations.find(item => item.id === cupidNightState.players[3].id).cause, 'werewolf_attack');
assert.equal(cupidNightState.lastResult.eliminations.find(item => item.id === cupidNightState.players[0].id).cause, 'cupid_bond');
assert.ok(cupidNightState.lastResult.events.some(event => event.includes('Cupid mengikat Wolf One dan Village One')));
const linkedWolfVillagerView = (await payload(await cupidNightRoom.fetch(
  makeRequest('/internal/state', 'GET', undefined, cupidNightTokens[3])
))).state;
assert.equal(linkedWolfVillagerView.self.role, 'villager');
assert.deepEqual(linkedWolfVillagerView.self.loverNames, ['Wolf One', 'Village One']);
assert.deepEqual(linkedWolfVillagerView.players, []);
assert.equal(linkedWolfVillagerView.room.lastResult, null);
assert.deepEqual(linkedWolfVillagerView.room.lovers, []);
assert.ok(linkedWolfVillagerView.targets.every(target => Object.keys(target).sort().join(',') === 'id,name'));
const cupidPrivateView = (await payload(await cupidNightRoom.fetch(
  makeRequest('/internal/state', 'GET', undefined, cupidNightTokens[2])
))).state;
assert.deepEqual(cupidPrivateView.self.loverNames, ['Wolf One', 'Village One']);
assert.deepEqual(cupidPrivateView.players, []);
console.log('Werewolf privacy/Cupid checks passed: wolves know their pack, players see no other roles, and a linked Werewolf/Villager die together.');

// Voting also eliminates both linked players, while other players cannot inspect roles or votes.
await payload(await witchRoom.fetch(makeRequest('/internal/action', 'POST', {
  type: 'start_discussion'
}, witchCreated.token)));
await payload(await witchRoom.fetch(makeRequest('/internal/action', 'POST', {
  type: 'set_discussion', mode: 'offline'
}, witchCreated.token)));
await payload(await witchRoom.fetch(makeRequest('/internal/action', 'POST', {
  type: 'start_voting'
}, witchCreated.token)));
const privateVoteView = (await payload(await witchRoom.fetch(
  makeRequest('/internal/state', 'GET', undefined, witchTokens[0])
))).state;
assert.equal(privateVoteView.self.role, 'wolf');
assert.deepEqual(privateVoteView.players, []);
assert.equal(privateVoteView.room.lastResult, null);
assert.deepEqual(privateVoteView.room.lovers, []);
assert.deepEqual(privateVoteView.wolfTeam, []);
assert.deepEqual(privateVoteView.wolfSelections, []);
assert.deepEqual(privateVoteView.wolfChat, []);
assert.ok(privateVoteView.targets.every(target => Object.keys(target).sort().join(',') === 'id,name'));
const voteTargets = [3, 3, 3, 4, 3];
for (let index = 0; index < voteTargets.length; index += 1) {
  const current = await witchRoom.loadRoom();
  await payload(await witchRoom.fetch(makeRequest('/internal/action', 'POST', {
    type: 'cast_vote', targetId: current.players[voteTargets[index]].id
  }, witchTokens[index])));
}
await payload(await witchRoom.fetch(makeRequest('/internal/action', 'POST', {
  type: 'resolve_vote'
}, witchCreated.token)));
const voteCupidResult = (await payload(await witchRoom.fetch(
  makeRequest('/internal/state', 'GET', undefined, witchCreated.token)
))).state;
const voteResultState = await witchRoom.loadRoom();
assert.deepEqual(voteCupidResult.room.lastResult.eliminatedIds, [
  voteResultState.players[3].id,
  voteResultState.players[4].id
]);
assert.deepEqual(voteCupidResult.room.lastResult.eliminations.map(item => item.cause), ['vote', 'cupid_bond']);
assert.deepEqual(voteCupidResult.room.lastResult.eliminations.map(item => item.role), ['villager', 'villager']);
console.log('Werewolf voting privacy check passed: votes stay private to players and a Cupid pair is eliminated together by vote.');

const botWitchRoom = new WerewolfRoom({ storage: new MemoryStorage(), getWebSockets: () => [] }, {});
const botWitchCreated = await payload(await botWitchRoom.fetch(makeRequest('/internal/create', 'POST', {
  code: 'B8TCH3', name: 'Bot Moderator'
})), 201);
await payload(await botWitchRoom.fetch(makeRequest('/internal/action', 'POST', { type: 'add_bots', count: 5 }, botWitchCreated.token)));
await payload(await botWitchRoom.fetch(makeRequest('/internal/action', 'POST', { type: 'start_game' }, botWitchCreated.token)));
let botWitchState = await botWitchRoom.loadRoom();
const botRoles = ['wolf', 'witch', 'villager', 'villager', 'villager'];
botWitchState.players.forEach((player, index) => {
  player.role = botRoles[index];
  player.hasDrawn = true;
});
botWitchState.witchPotions = {
  [botWitchState.players[1].id]: { heal: true, poison: true }
};
await botWitchRoom.saveRoom(botWitchState);
await payload(await botWitchRoom.fetch(makeRequest('/internal/action', 'POST', { type: 'start_night' }, botWitchCreated.token)));
botWitchState = await botWitchRoom.loadRoom();
assert.equal(botWitchState.nightActions[botWitchState.players[1].id].type, 'witch_heal');
console.log('Werewolf bot Witch check passed: bot waits for wolf votes and heals the actual target.');

const disabledRoom = new WerewolfRoom({ storage: new MemoryStorage(), getWebSockets: () => [] }, {
  ALLOWED_ORIGINS: 'https://irvan1609.github.io'
});
const disabledCreated = await payload(await disabledRoom.fetch(makeRequest('/internal/create', 'POST', {
  code: 'DS2234', name: 'Disabled Moderator',
  settings: {
    roleCounts: {
      wolf: 1, alpha_wolf: 0, seer: 1, doctor: 0, bodyguard: 0,
      witch: 0, hunter: 0, cupid: 0, guardian_angel: 0, detective: 0,
      mayor: 0, jester: 0, villager: 3
    },
    abilities: { seerInspection: false }
  }
})), 201);
const disabledTokens = [];
for (const name of ['Fina', 'Gilang', 'Hana', 'Iqbal', 'Joko']) {
  const joined = await payload(await disabledRoom.fetch(makeRequest('/internal/join', 'POST', { name })), 201);
  disabledTokens.push(joined.token);
}
await payload(await disabledRoom.fetch(makeRequest('/internal/action', 'POST', { type: 'start_game' }, disabledCreated.token)));
const disabledState = await disabledRoom.loadRoom();
disabledState.players.forEach((player, index) => {
  player.role = ['wolf', 'seer', 'villager', 'villager', 'villager'][index];
  player.hasDrawn = true;
});
await disabledRoom.saveRoom(disabledState);
await payload(await disabledRoom.fetch(makeRequest('/internal/action', 'POST', { type: 'start_night' }, disabledCreated.token)));
await payload(await disabledRoom.fetch(makeRequest('/internal/action', 'POST', {
  type: 'night_action', targetId: disabledState.players[0].id
}, disabledTokens[1])), 403);
await payload(await disabledRoom.fetch(makeRequest('/internal/action', 'POST', { type: 'night_pass' }, disabledTokens[1])), 409);
const disabledPlayerView = (await payload(await disabledRoom.fetch(
  makeRequest('/internal/state', 'GET', undefined, disabledTokens[1])
))).state;
assert.equal(disabledPlayerView.self.nightActionMode, 'math');
assert.ok(disabledPlayerView.self.villagerPrompt, 'A role with its special ability disabled must receive the village calculation challenge.');
await submitVillagerMath(disabledRoom, disabledTokens[1]);
assert.equal((await disabledRoom.loadRoom()).nightActions[disabledState.players[1].id].type, 'villager_math');
console.log('Werewolf configurable-role checks passed: disabled abilities switch to a required calculation challenge.');

const assetRequests = [];
const assetResponse = await worker.fetch(new Request('https://werewolf-room-api-dev.andyirvan1609.workers.dev/'), {
  ALLOWED_ORIGINS: 'https://werewolf-room-api-dev.andyirvan1609.workers.dev',
  ASSETS: {
    async fetch(request) {
      assetRequests.push(new URL(request.url).pathname);
      return new Response('<!doctype html><h1>THE VILLAGE</h1>', {
        headers: { 'Content-Type': 'text/html; charset=utf-8' }
      });
    }
  }
});
assert.equal(assetResponse.status, 200);
assert.match(await assetResponse.text(), /THE VILLAGE/);
assert.deepEqual(assetRequests, ['/']);
console.log('Werewolf static preview asset routing check passed.');


// Flexible player-count coverage: two-player minimum and automatically scaled roles.
const smallRoom = new WerewolfRoom({ storage: new MemoryStorage(), getWebSockets: () => [] }, {});
const smallCreated = await payload(await smallRoom.fetch(makeRequest('/internal/create', 'POST', {
  code: 'SM2PLR', name: 'Small Moderator'
})), 201);
await payload(await smallRoom.fetch(makeRequest('/internal/join', 'POST', { name: 'Solo Player' })), 201);
await payload(await smallRoom.fetch(makeRequest('/internal/action', 'POST', {
  type: 'start_game'
}, smallCreated.token)), 409);
await payload(await smallRoom.fetch(makeRequest('/internal/join', 'POST', { name: 'Second Player' })), 201);
await payload(await smallRoom.fetch(makeRequest('/internal/action', 'POST', {
  type: 'start_game'
}, smallCreated.token)));
let smallState = await smallRoom.loadRoom();
assert.equal(smallState.players.length, 2);
assert.equal(smallState.phase, 'role_draw');
assert.equal(smallState.players.filter(player => player.role === 'wolf').length, 1);
assert.equal(smallState.players.filter(player => player.role === 'villager').length, 1);
assert.equal(smallState.players.filter(player => ['seer', 'doctor'].includes(player.role)).length, 0);
console.log('Werewolf flexible-count check passed: two players can start with one Werewolf and one Villager.');

// Default composition scales with a larger human roster without a hard-coded room cap.
const scaledRoom = new WerewolfRoom({ storage: new MemoryStorage(), getWebSockets: () => [] }, {});
const scaledCreated = await payload(await scaledRoom.fetch(makeRequest('/internal/create', 'POST', {
  code: 'SC25PL', name: 'Scaled Moderator'
})), 201);
for (let index = 1; index <= 25; index += 1) {
  await payload(await scaledRoom.fetch(makeRequest('/internal/join', 'POST', {
    name: 'Player ' + String(index).padStart(2, '0')
  })), 201);
}
await payload(await scaledRoom.fetch(makeRequest('/internal/action', 'POST', {
  type: 'start_game'
}, scaledCreated.token)));
const scaledState = await scaledRoom.loadRoom();
assert.equal(scaledState.players.length, 25);
assert.equal(scaledState.players.filter(player => ['wolf', 'alpha_wolf'].includes(player.role)).length, 6);
assert.equal(scaledState.players.filter(player => player.role === 'seer').length, 1);
assert.equal(scaledState.players.filter(player => player.role === 'doctor').length, 1);
assert.equal(scaledState.players.filter(player => player.role === 'villager').length, 5);
assert.equal(scaledState.players.filter(player => player.role === 'alpha_wolf').length, 1);
const expected25RoleCounts = {
  bodyguard: 2, witch: 2, hunter: 2, cupid: 1, detective: 2,
  mayor: 1, guardian_angel: 1, jester: 1
};
for (const [role, expected] of Object.entries(expected25RoleCounts)) {
  assert.equal(scaledState.players.filter(player => player.role === role).length, expected, `25-player role mix should include ${expected} ${role} role(s).`);
}
console.log('Werewolf role-scaling check passed: 25 players receive a mixed deck with only five Villagers.');

// Every room size from 4 through 25 receives an exact, balanced automatic role composition.
const expectedAutomaticRoleDecks = {
  4: { wolf: 1, seer: 1, villager: 2 },
  5: { wolf: 1, seer: 1, doctor: 1, villager: 2 },
  6: { wolf: 1, seer: 1, doctor: 1, bodyguard: 1, villager: 2 },
  7: { wolf: 1, seer: 1, doctor: 1, bodyguard: 1, witch: 1, villager: 2 },
  8: { wolf: 2, seer: 1, doctor: 1, bodyguard: 1, witch: 1, villager: 2 },
  9: { wolf: 2, seer: 1, doctor: 1, bodyguard: 1, witch: 1, hunter: 1, villager: 2 },
  10: { wolf: 2, seer: 1, doctor: 1, bodyguard: 1, witch: 1, hunter: 1, cupid: 1, villager: 2 },
  11: { wolf: 2, seer: 1, doctor: 1, bodyguard: 1, witch: 1, hunter: 1, cupid: 1, detective: 1, villager: 2 },
  12: { wolf: 2, alpha_wolf: 1, seer: 1, doctor: 1, bodyguard: 1, witch: 1, hunter: 1, cupid: 1, detective: 1, villager: 2 },
  13: { wolf: 2, alpha_wolf: 1, seer: 1, doctor: 1, bodyguard: 1, witch: 1, hunter: 1, cupid: 1, detective: 1, mayor: 1, villager: 2 },
  14: { wolf: 2, alpha_wolf: 1, seer: 1, doctor: 1, bodyguard: 1, witch: 1, hunter: 1, cupid: 1, detective: 1, mayor: 1, guardian_angel: 1, villager: 2 },
  15: { wolf: 2, alpha_wolf: 1, seer: 1, doctor: 1, bodyguard: 1, witch: 1, hunter: 1, cupid: 1, detective: 1, mayor: 1, guardian_angel: 1, villager: 3 },
  16: { wolf: 3, alpha_wolf: 1, seer: 1, doctor: 1, bodyguard: 1, witch: 1, hunter: 1, cupid: 1, detective: 1, mayor: 1, guardian_angel: 1, villager: 3 },
  17: { wolf: 3, alpha_wolf: 1, seer: 1, doctor: 1, bodyguard: 1, witch: 1, hunter: 1, cupid: 1, detective: 1, mayor: 1, guardian_angel: 1, jester: 1, villager: 3 },
  18: { wolf: 3, alpha_wolf: 1, seer: 1, doctor: 1, bodyguard: 2, witch: 1, hunter: 1, cupid: 1, detective: 1, mayor: 1, guardian_angel: 1, jester: 1, villager: 3 },
  19: { wolf: 3, alpha_wolf: 1, seer: 1, doctor: 1, bodyguard: 2, witch: 2, hunter: 1, cupid: 1, detective: 1, mayor: 1, guardian_angel: 1, jester: 1, villager: 3 },
  20: { wolf: 4, alpha_wolf: 1, seer: 1, doctor: 1, bodyguard: 2, witch: 1, hunter: 1, cupid: 1, detective: 1, mayor: 1, guardian_angel: 1, jester: 1, villager: 4 },
  21: { wolf: 4, alpha_wolf: 1, seer: 1, doctor: 1, bodyguard: 2, witch: 2, hunter: 1, cupid: 1, detective: 1, mayor: 1, guardian_angel: 1, jester: 1, villager: 4 },
  22: { wolf: 4, alpha_wolf: 1, seer: 1, doctor: 1, bodyguard: 2, witch: 2, hunter: 2, cupid: 1, detective: 1, mayor: 1, guardian_angel: 1, jester: 1, villager: 4 },
  23: { wolf: 4, alpha_wolf: 1, seer: 1, doctor: 1, bodyguard: 2, witch: 2, hunter: 2, cupid: 1, detective: 2, mayor: 1, guardian_angel: 1, jester: 1, villager: 4 },
  24: { wolf: 5, alpha_wolf: 1, seer: 1, doctor: 1, bodyguard: 2, witch: 2, hunter: 2, cupid: 1, detective: 2, mayor: 1, guardian_angel: 1, jester: 1, villager: 4 },
  25: { wolf: 5, alpha_wolf: 1, seer: 1, doctor: 1, bodyguard: 2, witch: 2, hunter: 2, cupid: 1, detective: 2, mayor: 1, guardian_angel: 1, jester: 1, villager: 5 }
};
const compactRoleCounts = counts => Object.fromEntries(
  Object.entries(counts).filter(([, count]) => count > 0).sort(([left], [right]) => left.localeCompare(right))
);
for (const [playerCount, expected] of Object.entries(expectedAutomaticRoleDecks)) {
  const actual = recommendedRoleCounts(Number(playerCount));
  assert.equal(Object.values(actual).reduce((sum, count) => sum + count, 0), Number(playerCount), `Automatic role deck must total ${playerCount} players.`);
  assert.deepEqual(compactRoleCounts(actual), compactRoleCounts(expected), `Unexpected automatic role composition for ${playerCount} players.`);
  assert.ok(actual.villager <= Math.max(2, Math.floor(Number(playerCount) * 0.2)), `Villagers must remain near 20% for ${playerCount} players.`);
}
console.log('Werewolf automatic role presets passed for every room size from 4 through 25 players.');

// A large automatic room adds more special roles rather than filling the remainder with Villagers.
const auto50Room = new WerewolfRoom({ storage: new MemoryStorage(), getWebSockets: () => [] }, {});
const auto50Created = await payload(await auto50Room.fetch(makeRequest('/internal/create', 'POST', {
  code: 'AUTF55', name: 'Auto Fifty Host'
})), 201);
for (let index = 1; index <= 50; index += 1) {
  await payload(await auto50Room.fetch(makeRequest('/internal/join', 'POST', {
    name: 'Auto ' + String(index).padStart(2, '0')
  })), 201);
}
await payload(await auto50Room.fetch(makeRequest('/internal/action', 'POST', { type: 'start_game' }, auto50Created.token)));
const auto50State = await auto50Room.loadRoom();
assert.equal(auto50State.players.length, 50);
assert.equal(auto50State.players.filter(player => ['wolf', 'alpha_wolf'].includes(player.role)).length, 12);
assert.equal(auto50State.players.filter(player => player.role === 'villager').length, 10);
const expected50RoleCounts = {
  seer: 3, doctor: 2, bodyguard: 3, witch: 3, hunter: 3,
  cupid: 1, detective: 3, mayor: 3, guardian_angel: 3, jester: 1,
  priest: 1, vigilante: 1, mason: 1
};
for (const [role, expected] of Object.entries(expected50RoleCounts)) {
  assert.equal(auto50State.players.filter(player => player.role === role).length, expected, `50-player role mix should include ${expected} ${role} role(s).`);
}
console.log('Werewolf large automatic role-scaling check passed: 50 players receive 28 special roles and only 10 Villagers.');

// No fixed room total: join 25 humans, add 25 bots, then use a role count above twenty.
const largeRoom = new WerewolfRoom({ storage: new MemoryStorage(), getWebSockets: () => [] }, {});
const largeCreated = await payload(await largeRoom.fetch(makeRequest('/internal/create', 'POST', {
  code: 'LG52PL', name: 'Large Moderator'
})), 201);
for (let index = 1; index <= 25; index += 1) {
  await payload(await largeRoom.fetch(makeRequest('/internal/join', 'POST', {
    name: 'Guest ' + String(index).padStart(2, '0')
  })), 201);
}
await payload(await largeRoom.fetch(makeRequest('/internal/action', 'POST', {
  type: 'add_bots', count: 25
}, largeCreated.token)));
let largeState = await largeRoom.loadRoom();
assert.equal(largeState.players.length, 51);
assert.equal(largeState.players.filter(player => player.isBot).length, 25);
assert.equal(largeState.players.filter(player => player.isHost).length, 1);
const largeRoleCounts = {
  wolf: 12, alpha_wolf: 0, seer: 1, doctor: 1, bodyguard: 0,
  witch: 0, hunter: 0, cupid: 0, guardian_angel: 0, detective: 0,
  mayor: 0, jester: 0, villager: 36
};
await payload(await largeRoom.fetch(makeRequest('/internal/action', 'POST', {
  type: 'update_settings',
  settings: { roleCounts: largeRoleCounts }
}, largeCreated.token)));
await payload(await largeRoom.fetch(makeRequest('/internal/action', 'POST', {
  type: 'start_game'
}, largeCreated.token)));
largeState = await largeRoom.loadRoom();
assert.equal(largeState.players.length, 50);
assert.equal(largeState.players.filter(player => player.role === 'villager').length, 36);
assert.equal(largeState.players.filter(player => ['wolf', 'alpha_wolf'].includes(player.role)).length, 12);
assert.ok(largeState.players.every(player => player.hasDrawn === Boolean(player.isBot)));
console.log('Werewolf large-room check passed: 50 players, 25 bots, and role counts above twenty are supported.');


// Split wolf votes must still produce one attack; the first submitted vote breaks an exact tie.
const tieRoom = new WerewolfRoom({ storage: new MemoryStorage(), getWebSockets: () => [] }, {});
const tieCreated = await payload(await tieRoom.fetch(makeRequest('/internal/create', 'POST', {
  code: 'TYE234', name: 'Tie Moderator',
  settings: { roleCounts: {
    wolf: 2, alpha_wolf: 0, seer: 0, doctor: 0, bodyguard: 0, witch: 0,
    hunter: 0, cupid: 0, guardian_angel: 0, detective: 0, mayor: 0,
    jester: 0, villager: 3, moderator: 0
  } }
})), 201);
const tieTokens = [];
for (const name of ['Wolf One', 'Wolf Two', 'Town One', 'Town Two', 'Town Three']) {
  tieTokens.push((await payload(await tieRoom.fetch(makeRequest('/internal/join', 'POST', { name })), 201)).token);
}
await payload(await tieRoom.fetch(makeRequest('/internal/action', 'POST', { type: 'start_game' }, tieCreated.token)));
let tieState = await tieRoom.loadRoom();
tieState.players.forEach((player, index) => {
  player.role = index < 2 ? 'wolf' : 'villager';
  player.hasDrawn = true;
});
await tieRoom.saveRoom(tieState);
await payload(await tieRoom.fetch(makeRequest('/internal/action', 'POST', { type: 'start_night' }, tieCreated.token)));
await payload(await tieRoom.fetch(makeRequest('/internal/action', 'POST', {
  type: 'night_action', targetId: tieState.players[2].id
}, tieTokens[0])));
await payload(await tieRoom.fetch(makeRequest('/internal/action', 'POST', {
  type: 'night_action', targetId: tieState.players[3].id
}, tieTokens[1])));
for (let index = 2; index < 5; index += 1) {
  await submitVillagerMath(tieRoom, tieTokens[index]);
}
await actionAfterDeadline(tieRoom, tieCreated.token, 'resolve_night', { force: true });
tieState = await tieRoom.loadRoom();
assert.equal(tieState.phase, 'finished', 'The winning faction must be announced immediately after night resolution.');
assert.equal(tieState.winner, 'wolves');
assert.equal([tieState.players[2], tieState.players[3]].filter(player => !player.alive).length, 1);
assert.match(tieState.lastResult.message, /tereliminasi pada malam hari|ditemukan gugur setelah malam berlalu/);
assert.ok(tieState.lastResult.events.some(event => /terbagi sama kuat/.test(event)));
console.log('Werewolf split-vote regression passed: a tied wolf vote still selects one victim.');

// Lobby departures remove the player; a name can then be reused.
const leaveRoom = new WerewolfRoom({ storage: new MemoryStorage(), getWebSockets: () => [] }, {});
const leaveCreated = await payload(await leaveRoom.fetch(makeRequest('/internal/create', 'POST', {
  code: 'LEA234', name: 'Leave Moderator'
})), 201);
const leaver = await payload(await leaveRoom.fetch(makeRequest('/internal/join', 'POST', { name: 'Rejoin Me' })), 201);
await payload(await leaveRoom.fetch(makeRequest('/internal/action', 'POST', { type: 'leave_room' }, leaver.token)));
assert.equal((await leaveRoom.loadRoom()).players.length, 1);
await payload(await leaveRoom.fetch(makeRequest('/internal/join', 'POST', { name: 'Rejoin Me' })), 201);
assert.equal((await leaveRoom.loadRoom()).players.length, 2);
await payload(await leaveRoom.fetch(makeRequest('/internal/action', 'POST', { type: 'leave_room' }, leaveCreated.token)), 403);
console.log('Werewolf leave-room regression passed: lobby departures remove the player and release the name.');

// Only the host can disband a room. Connected players receive a final event,
// every socket closes, and all durable room/session data is deleted.
const disbandStorage = new MemoryStorage();
const disbandSockets = [];
const disbandRoom = new WerewolfRoom({
  storage: disbandStorage,
  getWebSockets: () => disbandSockets
}, {});
const disbandCreated = await payload(await disbandRoom.fetch(makeRequest('/internal/create', 'POST', {
  code: 'DAS234', name: 'Disband Host'
})), 201);
const disbandPlayers = [];
for (const name of ['Disband Player One', 'Disband Player Two']) {
  disbandPlayers.push(await payload(await disbandRoom.fetch(makeRequest('/internal/join', 'POST', { name })), 201));
}
await payload(await disbandRoom.fetch(makeRequest('/internal/action', 'POST', {
  type: 'start_game'
}, disbandCreated.token)));
const disbandState = await disbandRoom.loadRoom();
assert.equal(disbandState.phase, 'role_draw', 'Host must be able to disband an active game.');
const disbandSocket = actor => ({
  sent: [],
  closed: null,
  deserializeAttachment() { return { actorId: actor.id, actorType: actor.isModerator ? 'moderator' : 'player' }; },
  send(message) { this.sent.push(JSON.parse(message)); },
  close(code, reason) { this.closed = { code, reason }; }
});
disbandSockets.push(
  disbandSocket({ id: disbandCreated.moderatorId, isModerator: true }),
  ...disbandPlayers.map(player => disbandSocket({ id: player.playerId, isModerator: false }))
);
await payload(await disbandRoom.fetch(makeRequest('/internal/action', 'POST', {
  type: 'disband_room'
}, disbandPlayers[0].token)), 403);
assert.ok(await disbandRoom.loadRoom(), 'A non-host player must not be able to disband the room.');
const disbandResult = await payload(await disbandRoom.fetch(makeRequest('/internal/action', 'POST', {
  type: 'disband_room'
}, disbandCreated.token)));
assert.equal(disbandResult.disbanded, true);
assert.match(disbandResult.message, /dibubarkan oleh host/i);
assert.equal(await disbandRoom.loadRoom(), null, 'Room state must be removed.');
assert.equal(disbandStorage.values.size, 0, 'Room and temporary ticket data must be deleted.');
assert.equal(disbandStorage.alarmAt, null, 'Room expiry alarm must be cancelled.');
assert.equal(disbandSockets.length, 3);
for (const socket of disbandSockets) {
  assert.deepEqual(socket.sent, [{
    type: 'room_disbanded',
    message: 'Room dibubarkan oleh host. Kamu telah dikeluarkan dari room.'
  }]);
  assert.equal(socket.closed.code, 4001);
  assert.equal(socket.closed.reason, 'Room dibubarkan oleh host');
}
await payload(await disbandRoom.fetch(makeRequest('/internal/state', 'GET', undefined, disbandPlayers[0].token)), 404);
await payload(await disbandRoom.fetch(makeRequest('/internal/create', 'POST', {
  code: 'DAS234', name: 'New Host'
})), 201);
console.log('Werewolf host-disband regression passed: host-only shutdown notifies all connected clients, closes sockets, deletes room data, and releases the room code.');

// A departure during card reveal cannot block the host from starting the night.
const activeLeaveRoom = new WerewolfRoom({ storage: new MemoryStorage(), getWebSockets: () => [] }, {});
const activeLeaveCreated = await payload(await activeLeaveRoom.fetch(makeRequest('/internal/create', 'POST', {
  code: 'ZUT234', name: 'Active Moderator'
})), 201);
const activeLeaveTokens = [];
for (const name of ['Wolf A', 'Seer A', 'Doctor A', 'Leaving Player', 'Villager A']) {
  activeLeaveTokens.push((await payload(await activeLeaveRoom.fetch(makeRequest('/internal/join', 'POST', { name })), 201)).token);
}
await payload(await activeLeaveRoom.fetch(makeRequest('/internal/action', 'POST', { type: 'start_game' }, activeLeaveCreated.token)));
let activeLeaveState = await activeLeaveRoom.loadRoom();
activeLeaveState.players.forEach((player, index) => {
  player.role = ['wolf', 'seer', 'doctor', 'villager', 'villager'][index];
});
await activeLeaveRoom.saveRoom(activeLeaveState);
await payload(await activeLeaveRoom.fetch(makeRequest('/internal/action', 'POST', { type: 'leave_room' }, activeLeaveTokens[3])));
activeLeaveState = await activeLeaveRoom.loadRoom();
assert.equal(activeLeaveState.players[3].alive, false);
assert.equal(activeLeaveState.players[3].hasDrawn, true);
await payload(await activeLeaveRoom.fetch(makeRequest('/internal/state', 'GET', undefined, activeLeaveTokens[3])), 401);
for (const index of [0, 1, 2, 4]) {
  await payload(await activeLeaveRoom.fetch(makeRequest('/internal/action', 'POST', { type: 'draw_card' }, activeLeaveTokens[index])));
}
await payload(await activeLeaveRoom.fetch(makeRequest('/internal/action', 'POST', { type: 'start_night' }, activeLeaveCreated.token)));
assert.equal((await activeLeaveRoom.loadRoom()).phase, 'night');
console.log('Werewolf active-leave regression passed: a departed player cannot block role reveal or night start.');

// Simultaneous night actions must not overwrite each other.
const concurrentRoom = new WerewolfRoom({ storage: new MemoryStorage(), getWebSockets: () => [] }, {});
const concurrentCreated = await payload(await concurrentRoom.fetch(makeRequest('/internal/create', 'POST', {
  code: 'RACE24', name: 'Race Moderator'
})), 201);
const concurrentTokens = [];
for (const name of ['Race Wolf', 'Race Seer', 'Race Doctor', 'Race Town A', 'Race Town B']) {
  concurrentTokens.push((await payload(await concurrentRoom.fetch(makeRequest('/internal/join', 'POST', { name })), 201)).token);
}
await payload(await concurrentRoom.fetch(makeRequest('/internal/action', 'POST', { type: 'start_game' }, concurrentCreated.token)));
let concurrentState = await concurrentRoom.loadRoom();
concurrentState.players.forEach((player, index) => {
  player.role = ['wolf', 'seer', 'doctor', 'villager', 'villager'][index];
  player.hasDrawn = true;
});
await concurrentRoom.saveRoom(concurrentState);
await payload(await concurrentRoom.fetch(makeRequest('/internal/action', 'POST', { type: 'start_night' }, concurrentCreated.token)));
concurrentState = await concurrentRoom.loadRoom();
await submitVillagerMath(concurrentRoom, concurrentTokens[3]);
await submitVillagerMath(concurrentRoom, concurrentTokens[4]);
const concurrentResponses = await Promise.all([
  concurrentRoom.fetch(makeRequest('/internal/action', 'POST', { type: 'night_action', targetId: concurrentState.players[4].id }, concurrentTokens[0])),
  concurrentRoom.fetch(makeRequest('/internal/action', 'POST', { type: 'night_action', targetId: concurrentState.players[0].id }, concurrentTokens[1])),
  concurrentRoom.fetch(makeRequest('/internal/action', 'POST', { type: 'night_action', targetId: concurrentState.players[4].id }, concurrentTokens[2]))
]);
for (const response of concurrentResponses) await payload(response);
concurrentState = await concurrentRoom.loadRoom();
assert.equal(Object.keys(concurrentState.nightActions).length, 5);
console.log('Werewolf concurrent-action regression passed: simultaneous actions are retained without lost updates.');

// Room reset preserves the same roster, tokens, and room code for another game.
const replayRoom = new WerewolfRoom({ storage: new MemoryStorage(), getWebSockets: () => [] }, {});
const replayCreated = await payload(await replayRoom.fetch(makeRequest('/internal/create', 'POST', {
  code: 'RPLY25', name: 'Replay Host', settings: { moderatorMode: 'random' }
})), 201);
const replayTokens = [];
for (const name of ['Replay A', 'Replay B', 'Replay C', 'Replay D', 'Replay E']) {
  replayTokens.push((await payload(await replayRoom.fetch(makeRequest('/internal/join', 'POST', { name })), 201)).token);
}
const originalRoster = (await replayRoom.loadRoom()).players.map(player => ({ id: player.id, tokenHash: player.tokenHash }));
await payload(await replayRoom.fetch(makeRequest('/internal/action', 'POST', { type: 'start_game' }, replayCreated.token)));
let replayState = await replayRoom.loadRoom();
assert.equal(replayState.activeModeratorMode, 'random');
assert.ok(replayState.activeModeratorId);
assert.ok(!replayState.players.some(player => player.id === replayState.activeModeratorId));
const selectedModeratorIndex = originalRoster.findIndex(player => player.id === replayState.activeModeratorId);
const selectedModeratorToken = selectedModeratorIndex === 0
  ? replayCreated.token
  : replayTokens[selectedModeratorIndex - 1];
const selectedModeratorView = (await payload(await replayRoom.fetch(
  makeRequest('/internal/state', 'GET', undefined, selectedModeratorToken)
))).state;
assert.equal(selectedModeratorView.self.isModerator, true);
assert.equal(selectedModeratorView.self.id, replayState.activeModeratorId);
const replayHostView = (await payload(await replayRoom.fetch(
  makeRequest('/internal/state', 'GET', undefined, replayCreated.token)
))).state;
assert.equal(replayHostView.self.isHost, true);
assert.equal(replayHostView.self.isModerator, replayState.activeModeratorId === replayState.hostId);
assert.equal(replayHostView.self.role, null);
if (replayState.activeModeratorId === replayState.hostId) {
  assert.equal(replayHostView.players.length, 5);
} else {
  assert.equal(replayHostView.players.length, 5, 'Host receives a role-safe player roster when another participant is moderator.');
  assert.ok(replayHostView.players.every(player => !Object.prototype.hasOwnProperty.call(player, 'role')),
    'The host roster must not reveal other players’ roles when the host is not moderator.');
  assert.ok(replayState.players.some(player => player.id === replayState.hostId), 'Host must remain an active player when another participant becomes moderator.');
}
replayState.phase = 'finished';
replayState.winner = 'villagers';
replayState.lastResult = { kind: 'vote', message: 'Game selesai.' };
replayState.players.forEach(player => { player.role = 'villager'; player.alive = false; player.hasDrawn = true; });
await replayRoom.saveRoom(replayState);
const publicViewerToken = selectedModeratorIndex === 1 ? replayTokens[1] : replayTokens[0];
const publicFinalView = (await payload(await replayRoom.fetch(
  makeRequest('/internal/state', 'GET', undefined, publicViewerToken)
))).state;
assert.equal(publicFinalView.room.winner, 'villagers', 'All players must receive the final winning team.');
assert.equal(publicFinalView.room.publicResult.message, 'Game selesai.', 'All players must receive a public result summary.');
assert.equal(publicFinalView.room.finalPlayers.length, 5, 'The final roster must include every active player after the temporary moderator is excluded.');
assert.ok(publicFinalView.room.finalPlayers.every(item =>
  item.faction === 'village' && item.isWinner && item.winReason === 'Pemenang utama'
), 'Every member of the winning Village faction must be marked as a winner.');
assert.equal(publicFinalView.room.lastResult, null, 'Private moderator action details must remain hidden from players.');
const originalIds = originalRoster.map(player => player.id);
const originalHashes = originalRoster.map(player => player.tokenHash);
await payload(await replayRoom.fetch(makeRequest('/internal/action', 'POST', { type: 'reset_to_lobby' }, replayCreated.token)));
replayState = await replayRoom.loadRoom();
assert.equal(replayState.phase, 'lobby');
assert.equal(replayState.round, 0);
assert.equal(replayState.winner, null);
assert.equal(replayState.players.length, 6);
assert.deepEqual(replayState.players.map(player => player.id), originalIds);
assert.deepEqual(replayState.players.map(player => player.tokenHash), originalHashes);
assert.ok(replayState.players.every(player => player.role === null && player.alive && !player.hasDrawn));
const replayPlayerView = (await payload(await replayRoom.fetch(makeRequest('/internal/state', 'GET', undefined, replayTokens[0])))).state;
assert.equal(replayPlayerView.lobbyPlayers.length, 6);
assert.equal(replayPlayerView.players.length, 0, 'Lobby roster for players must not reveal roles.');
await payload(await replayRoom.fetch(makeRequest('/internal/action', 'POST', { type: 'start_game' }, replayCreated.token)));
assert.equal((await replayRoom.loadRoom()).phase, 'role_draw');
console.log('Werewolf persistent-room regression passed: reset returns the same players to the lobby and the next game starts in the same room.');



// Forced morning resolution must execute any Werewolf votes already submitted,
// even if one pack member has not completed an action.
const partialWolfRoom = new WerewolfRoom({ storage: new MemoryStorage(), getWebSockets: () => [] }, {});
const partialWolfCreated = await payload(await partialWolfRoom.fetch(makeRequest('/internal/create', 'POST', {
  code: 'WLFPT2', name: 'Partial Wolf Host'
})), 201);
const partialWolfTokens = [];
for (const name of ['Partial Wolf One', 'Partial Wolf Two', 'Partial Village']) {
  partialWolfTokens.push((await payload(await partialWolfRoom.fetch(
    makeRequest('/internal/join', 'POST', { name })
  ), 201)).token);
}
let partialWolfState = await partialWolfRoom.loadRoom();
partialWolfState.phase = 'role_draw';
partialWolfState.round = 1;
partialWolfState.activeModeratorMode = 'host';
const suspendedHost = partialWolfState.players.find(player => player.id === partialWolfState.hostId);
partialWolfState.activeModeratorId = suspendedHost.id;
partialWolfState.activeModeratorRosterIndex = 0;
partialWolfState.moderator = suspendedHost;
partialWolfState.players = partialWolfState.players.filter(player => player.id !== suspendedHost.id);
partialWolfState.players.forEach((player, index) => {
  player.role = ['wolf', 'wolf', 'villager'][index];
  player.alive = true;
  player.hasDrawn = true;
});
await partialWolfRoom.saveRoom(partialWolfState);
await payload(await partialWolfRoom.fetch(makeRequest('/internal/action', 'POST', {
  type: 'start_night'
}, partialWolfCreated.token)));
partialWolfState = await partialWolfRoom.loadRoom();
await payload(await partialWolfRoom.fetch(makeRequest('/internal/action', 'POST', {
  type: 'night_action', targetId: partialWolfState.players[2].id
}, partialWolfTokens[0])));
await payload(await partialWolfRoom.fetch(makeRequest('/internal/action', 'POST', {
  type: 'resolve_night'
}, partialWolfCreated.token)), 409);
await actionAfterDeadline(partialWolfRoom, partialWolfCreated.token, 'resolve_night', { force: true });
partialWolfState = await partialWolfRoom.loadRoom();
assert.equal(partialWolfState.phase, 'finished', 'The game must finish immediately when the resolved attack leaves Werewolf at parity.');
assert.equal(partialWolfState.winner, 'wolves');
assert.equal(partialWolfState.players[2].alive, false, 'A submitted wolf vote must execute even when another wolf has not voted.');
assert.ok(partialWolfState.lastResult.events.some(event => event.includes('Werewolf menyerang Partial Village')));
console.log('Werewolf forced-morning regression passed: submitted pack votes still execute when missing players are skipped.');


// Host-only kick must remove the selected player, invalidate their token, and close their sockets.
const kickSockets = [];
const kickRoom = new WerewolfRoom({
  storage: new MemoryStorage(),
  getWebSockets: () => kickSockets.filter(socket => !socket.closed)
}, {});
const kickCreated = await payload(await kickRoom.fetch(makeRequest('/internal/create', 'POST', {
  code: 'KCKR23', name: 'Kick Host'
})), 201);
const kickPlayerOne = await payload(await kickRoom.fetch(makeRequest('/internal/join', 'POST', {
  name: 'Kick Player One'
})), 201);
const kickPlayerTwo = await payload(await kickRoom.fetch(makeRequest('/internal/join', 'POST', {
  name: 'Kick Player Two'
})), 201);
const kickedPlayerId = (await kickRoom.loadRoom()).players.find(player => player.name === 'Kick Player One').id;
const fakeKickSocket = actorId => ({
  sent: [],
  closed: null,
  deserializeAttachment() { return { actorId, actorType: 'player' }; },
  send(message) { this.sent.push(JSON.parse(message)); },
  close(code, reason) { this.closed = { code, reason }; }
});
const kickedSocket = fakeKickSocket(kickedPlayerId);
const remainingSocket = fakeKickSocket(kickPlayerTwo.playerId);
kickSockets.push(kickedSocket, remainingSocket);
await payload(await kickRoom.fetch(makeRequest('/internal/action', 'POST', {
  type: 'kick_player', playerId: kickedPlayerId
}, kickPlayerTwo.token)), 403);
await payload(await kickRoom.fetch(makeRequest('/internal/action', 'POST', {
  type: 'kick_player', playerId: kickCreated.moderatorId
}, kickCreated.token)), 403);
await payload(await kickRoom.fetch(makeRequest('/internal/action', 'POST', {
  type: 'kick_player', playerId: kickedPlayerId
}, kickCreated.token)));
let kickState = await kickRoom.loadRoom();
assert.equal(kickState.players.length, 2);
assert.ok(!kickState.players.some(player => player.id === kickedPlayerId));
assert.equal(kickedSocket.sent[0]?.type, 'player_kicked');
assert.equal(kickedSocket.closed.code, 4002);
assert.equal(kickedSocket.closed.reason, 'Dikeluarkan host');
assert.equal(remainingSocket.sent.at(-1)?.type, 'state');
await payload(await kickRoom.fetch(makeRequest('/internal/state', 'GET', undefined, kickPlayerOne.token)), 401);
console.log('Werewolf kick regression passed: only the host or active moderator can kick, the host cannot kick itself, the removed session is invalidated, and the player socket closes.');

// The host can kick while playing as a normal player; the host roster must not reveal roles.
const activeKickRoom = new WerewolfRoom({ storage: new MemoryStorage(), getWebSockets: () => [] }, {});
const activeKickCreated = await payload(await activeKickRoom.fetch(makeRequest('/internal/create', 'POST', {
  code: 'HSTK24', name: 'System Host', settings: { moderatorMode: 'system' }
})), 201);
const activeKickJoined = [];
for (const name of ['Wolf One', 'Wolf Two', 'Seer One', 'Doctor One', 'Village One']) {
  activeKickJoined.push(await payload(await activeKickRoom.fetch(makeRequest('/internal/join', 'POST', { name })), 201));
}
let activeKickState = await activeKickRoom.loadRoom();
activeKickState.phase = 'voting';
activeKickState.round = 1;
activeKickState.activeModeratorMode = 'system';
activeKickState.activeModeratorId = null;
activeKickState.activeModeratorRosterIndex = null;
activeKickState.moderator = activeKickState.hostAccount;
const roleByName = {
  'System Host': 'villager',
  'Wolf One': 'wolf',
  'Wolf Two': 'wolf',
  'Seer One': 'seer',
  'Doctor One': 'doctor',
  'Village One': 'villager'
};
for (const player of activeKickState.players) {
  player.role = roleByName[player.name];
  player.alive = true;
  player.hasDrawn = true;
}
const activeVictim = activeKickState.players.find(player => player.name === 'Village One');
const activeHost = activeKickState.players.find(player => player.isHost);
const activeWolfOne = activeKickState.players.find(player => player.name === 'Wolf One');
const activeWolfTwo = activeKickState.players.find(player => player.name === 'Wolf Two');
const activeSeer = activeKickState.players.find(player => player.name === 'Seer One');
const activeDoctor = activeKickState.players.find(player => player.name === 'Doctor One');
activeKickState.votes = {
  [activeWolfOne.id]: activeVictim.id,
  [activeVictim.id]: activeHost.id,
  [activeSeer.id]: activeDoctor.id
};
activeKickState.nightActions = {
  [activeWolfOne.id]: { type: 'wolf_vote', targetId: activeVictim.id },
  [activeWolfTwo.id]: { type: 'wolf_vote', targetId: activeDoctor.id },
  [activeSeer.id]: { type: 'seer_inspect', targetId: activeVictim.id },
  [activeDoctor.id]: { type: 'doctor_protect', targetId: activeHost.id },
  [activeVictim.id]: { type: 'pass' }
};
activeKickState.seerResults = {
  [activeSeer.id]: { round: 1, playerName: activeVictim.name, result: 'not_wolf' },
  [activeVictim.id]: { round: 1, playerName: activeDoctor.name, result: 'not_wolf' }
};
activeKickState.villagerPrompts = {
  [activeVictim.id]: { id: 'kick-prompt', question: 'Question', options: ['A', 'B'], answer: 'A' }
};
activeKickState.witchPotions = { [activeVictim.id]: { heal: true, poison: true } };
activeKickState.guardianTargets = {
  [activeDoctor.id]: activeVictim.id,
  [activeVictim.id]: activeHost.id
};
activeKickState.bodyguardTargets = {
  [activeDoctor.id]: activeVictim.id,
  [activeVictim.id]: activeHost.id
};
activeKickState.lovers = [activeVictim.id, activeHost.id];
activeKickState.additionalWinners = [activeVictim.id, activeDoctor.id];
activeKickState.chat = [{ id: 'kick-chat', playerId: activeVictim.id, name: activeVictim.name, text: 'Hello', at: Date.now() }];
activeKickState.wolfChat = [{ id: 'kick-wolf-chat', playerId: activeVictim.id, name: activeVictim.name, text: 'Hello', at: Date.now() }];
await activeKickRoom.saveRoom(activeKickState);
const hostPlayerView = (await payload(await activeKickRoom.fetch(
  makeRequest('/internal/state', 'GET', undefined, activeKickCreated.token)
))).state;
assert.equal(hostPlayerView.self.isHost, true);
assert.equal(hostPlayerView.self.isModerator, false);
assert.equal(hostPlayerView.players.length, 6);
assert.ok(hostPlayerView.players.every(player => !Object.prototype.hasOwnProperty.call(player, 'role')));
await payload(await activeKickRoom.fetch(makeRequest('/internal/action', 'POST', {
  type: 'kick_player', playerId: activeVictim.id
}, activeKickCreated.token)));
activeKickState = await activeKickRoom.loadRoom();
assert.equal(activeKickState.phase, 'voting');
assert.equal(activeKickState.winner, null);
assert.equal(activeKickState.players.length, 5);
assert.deepEqual(activeKickState.votes, { [activeSeer.id]: activeDoctor.id });
assert.deepEqual(activeKickState.nightActions, {
  [activeWolfTwo.id]: { type: 'wolf_vote', targetId: activeDoctor.id },
  [activeDoctor.id]: { type: 'doctor_protect', targetId: activeHost.id }
});
assert.deepEqual(activeKickState.seerResults, {});
assert.deepEqual(activeKickState.villagerPrompts, {});
assert.deepEqual(activeKickState.witchPotions, {});
assert.deepEqual(activeKickState.guardianTargets, {});
assert.deepEqual(activeKickState.bodyguardTargets, {});
assert.equal(activeKickState.lovers, null);
assert.deepEqual(activeKickState.additionalWinners, [activeDoctor.id]);
assert.deepEqual(activeKickState.chat, []);
assert.deepEqual(activeKickState.wolfChat, []);
await payload(await activeKickRoom.fetch(makeRequest('/internal/state', 'GET', undefined, activeKickJoined[4].token)), 401);
console.log('Werewolf active-game kick regression passed: host can kick outside moderator mode, private roles stay hidden, and stale action/vote references are cleared.');


// An active non-host moderator can also kick players, while the host remains in the roster.
const moderatorKickRoom = new WerewolfRoom({ storage: new MemoryStorage(), getWebSockets: () => [] }, {});
const moderatorKickCreated = await payload(await moderatorKickRoom.fetch(makeRequest('/internal/create', 'POST', {
  code: 'MDK724', name: 'Moderator Kick Host'
})), 201);
const moderatorKickPlayers = [];
for (const name of ['Mod One', 'Wolf One', 'Wolf Two', 'Village One']) {
  moderatorKickPlayers.push(await payload(await moderatorKickRoom.fetch(makeRequest('/internal/join', 'POST', { name })), 201));
}
let moderatorKickState = await moderatorKickRoom.loadRoom();
const selectedModerator = moderatorKickState.players.find(player => player.name === 'Mod One');
const moderatorVictim = moderatorKickState.players.find(player => player.name === 'Village One');
moderatorKickState.phase = 'discussion';
moderatorKickState.round = 1;
moderatorKickState.activeModeratorMode = 'random';
moderatorKickState.activeModeratorId = selectedModerator.id;
moderatorKickState.activeModeratorRosterIndex = moderatorKickState.players.findIndex(player => player.id === selectedModerator.id);
moderatorKickState.moderator = selectedModerator;
moderatorKickState.players = moderatorKickState.players.filter(player => player.id !== selectedModerator.id);
const moderatorRoleByName = {
  'Moderator Kick Host': 'villager',
  'Wolf One': 'wolf',
  'Wolf Two': 'wolf',
  'Village One': 'villager'
};
for (const player of moderatorKickState.players) {
  player.role = moderatorRoleByName[player.name];
  player.alive = true;
  player.hasDrawn = true;
}
await moderatorKickRoom.saveRoom(moderatorKickState);
await payload(await moderatorKickRoom.fetch(makeRequest('/internal/action', 'POST', {
  type: 'kick_player', playerId: moderatorVictim.id
}, moderatorKickPlayers[0].token)));
moderatorKickState = await moderatorKickRoom.loadRoom();
assert.ok(!moderatorKickState.players.some(player => player.id === moderatorVictim.id));
assert.ok(moderatorKickState.players.some(player => player.id === moderatorKickCreated.moderatorId),
  'Kicking by a non-host moderator must not remove the host player.');
await payload(await moderatorKickRoom.fetch(makeRequest('/internal/state', 'GET', undefined, moderatorKickPlayers[3].token)), 401);
console.log('Werewolf moderator kick regression passed: an active non-host moderator can remove a participant without removing the host.');


// Replay is private during play, public after victory, and retained in the room archive after restart.
const productionReplayRoom = new WerewolfRoom({ storage: new MemoryStorage(), getWebSockets: () => [] }, {});
const productionReplayCreated = await payload(await productionReplayRoom.fetch(makeRequest('/internal/create', 'POST', {
  code: 'RPLY26', name: 'Replay Host'
})), 201);
const replayWolf = await payload(await productionReplayRoom.fetch(makeRequest('/internal/join', 'POST', { name: 'Replay Wolf' })), 201);
const replayVillager = await payload(await productionReplayRoom.fetch(makeRequest('/internal/join', 'POST', { name: 'Replay Villager' })), 201);
const productionReplaySettings = {
  ...roleSettings,
  moderatorMode: 'host',
  roleCounts: { ...roleSettings.roleCounts, seer: 0, doctor: 0, villager: 1, moderator: 0 }
};
await payload(await productionReplayRoom.fetch(makeRequest('/internal/action', 'POST', {
  type: 'update_settings', settings: productionReplaySettings
}, productionReplayCreated.token)));
await payload(await productionReplayRoom.fetch(makeRequest('/internal/action', 'POST', { type: 'start_game' }, productionReplayCreated.token)));
let productionReplayState = await productionReplayRoom.loadRoom();
const productionReplayWolfPlayer = productionReplayState.players.find(player => player.name === 'Replay Wolf');
const productionReplayVillagerPlayer = productionReplayState.players.find(player => player.name === 'Replay Villager');
assert.ok(productionReplayWolfPlayer && productionReplayVillagerPlayer);
productionReplayWolfPlayer.role = 'wolf';
productionReplayVillagerPlayer.role = 'villager';
productionReplayWolfPlayer.hasDrawn = true;
productionReplayVillagerPlayer.hasDrawn = true;
await productionReplayRoom.saveRoom(productionReplayState);
await payload(await productionReplayRoom.fetch(makeRequest('/internal/action', 'POST', { type: 'start_night' }, productionReplayCreated.token)));
const productionHiddenReplay = (await payload(await productionReplayRoom.fetch(
  makeRequest('/internal/state', 'GET', undefined, replayWolf.token)
))).state;
assert.equal(productionHiddenReplay.room.gameHistory.length, 0, 'Private action history must remain hidden from players during the game.');
assert.equal(productionHiddenReplay.room.lastResult, null, 'Moderator-only results must remain private during the game.');
await payload(await productionReplayRoom.fetch(makeRequest('/internal/action', 'POST', {
  type: 'night_action', targetId: productionReplayVillagerPlayer.id
}, replayWolf.token)));
await actionAfterDeadline(productionReplayRoom, productionReplayCreated.token, 'resolve_night', { force: true });
productionReplayState = await productionReplayRoom.loadRoom();
assert.equal(productionReplayState.phase, 'finished');
assert.equal(productionReplayState.winner, 'wolves');
const productionPublicReplay = (await payload(await productionReplayRoom.fetch(
  makeRequest('/internal/state', 'GET', undefined, replayVillager.token)
))).state;
assert.ok(productionPublicReplay.room.gameHistory.some(event => event.kind === 'night_result'));
assert.ok(productionPublicReplay.room.gameHistory.some(event => event.kind === 'game_over'));
assert.equal(productionPublicReplay.room.finalPlayers.length, 2);
assert.ok(productionPublicReplay.room.finalPlayers.find(player => player.role === 'wolf').isWinner);
assert.equal(productionPublicReplay.room.lastResult, null, 'Private live result object must not be sent to a player even after the game.');
await payload(await productionReplayRoom.fetch(makeRequest('/internal/action', 'POST', {
  type: 'reset_to_lobby'
}, productionReplayCreated.token)));
const productionArchivedReplay = (await payload(await productionReplayRoom.fetch(
  makeRequest('/internal/state', 'GET', undefined, productionReplayCreated.token)
))).state;
assert.equal(productionArchivedReplay.room.gameArchive.length, 1);
assert.equal(productionArchivedReplay.room.gameArchive[0].winner, 'wolves');
assert.ok(productionArchivedReplay.room.gameArchive[0].events.some(event => event.kind === 'night_result'));
assert.equal(productionArchivedReplay.room.gameHistory.length, 0, 'A new lobby must not show the previous game as the current replay.');
const productionHiddenArchive = (await payload(await productionReplayRoom.fetch(
  makeRequest('/internal/state', 'GET', undefined, replayWolf.token)
))).state;
assert.equal(productionHiddenArchive.room.gameArchive.length, 0, 'Archived private game history is visible only to the moderator in the lobby.');
console.log('Werewolf replay regression passed: action history stays private during play, is shared after victory, and is archived across restarts.');


// A Seer who is killed by the night attack still receives their private inspection result.
const seerDeathStorage = new MemoryStorage();
const seerDeathRoom = new WerewolfRoom({ storage: seerDeathStorage, getWebSockets: () => [] }, {});
const seerDeathSettings = {
  ...roleSettings,
  roleCounts: { ...roleSettings.roleCounts, villager: 1 }
};
const seerDeathCreated = await payload(await seerDeathRoom.fetch(makeRequest('/internal/create', 'POST', {
  code: 'SEER23', name: 'Seer Death Host', settings: seerDeathSettings
})), 201);
const seerDeathTokens = [];
for (const name of ['Alpha', 'Bima', 'Citra', 'Doni']) {
  const joined = await payload(await seerDeathRoom.fetch(makeRequest('/internal/join', 'POST', { name })), 201);
  seerDeathTokens.push(joined.token);
}
await payload(await seerDeathRoom.fetch(makeRequest('/internal/action', 'POST', {
  type: 'start_game'
}, seerDeathCreated.token)));
let seerDeathState = await seerDeathRoom.loadRoom();
assert.equal(seerDeathState.players.length, 4);
['wolf', 'seer', 'doctor', 'villager'].forEach((role, index) => {
  seerDeathState.players[index].role = role;
  seerDeathState.players[index].hasDrawn = true;
  seerDeathState.players[index].alive = true;
});
await seerDeathRoom.saveRoom(seerDeathState);
await payload(await seerDeathRoom.fetch(makeRequest('/internal/action', 'POST', {
  type: 'start_night'
}, seerDeathCreated.token)));
await payload(await seerDeathRoom.fetch(makeRequest('/internal/action', 'POST', {
  type: 'night_action', targetId: seerDeathState.players[1].id
}, seerDeathTokens[0])));
await payload(await seerDeathRoom.fetch(makeRequest('/internal/action', 'POST', {
  type: 'night_action', targetId: seerDeathState.players[0].id
}, seerDeathTokens[1])));
await payload(await seerDeathRoom.fetch(makeRequest('/internal/action', 'POST', {
  type: 'night_action', targetId: seerDeathState.players[3].id
}, seerDeathTokens[2])));
await submitVillagerMath(seerDeathRoom, seerDeathTokens[3]);
seerDeathState = await seerDeathRoom.loadRoom();
assert.ok(seerDeathState.nightEndsAt);
await actionAfterDeadline(seerDeathRoom, seerDeathCreated.token, 'resolve_night');
seerDeathState = await seerDeathRoom.loadRoom();
assert.equal(seerDeathState.phase, 'morning');
assert.equal(seerDeathState.players[1].alive, false);
const deadSeerView = (await payload(await seerDeathRoom.fetch(
  makeRequest('/internal/state', 'GET', undefined, seerDeathTokens[1])
))).state;
assert.equal(deadSeerView.self.seerResult.playerName, 'Alpha');
assert.equal(deadSeerView.self.seerResult.result, 'wolf');
assert.ok(seerDeathState.lastResult.actionReport.some(item => item.role === 'Seer'),
  'The moderator report must retain the Seer action even after the Seer is eliminated.');
console.log('Werewolf Seer death regression passed: private reading remains visible after night elimination.');

// Role assignment is randomized independently from lobby/player order on every new game.
const roleShuffleStorage = new MemoryStorage();
const roleShuffleRoom = new WerewolfRoom({ storage: roleShuffleStorage, getWebSockets: () => [] }, {});
const roleShuffleCreated = await payload(await roleShuffleRoom.fetch(makeRequest('/internal/create', 'POST', {
  code: 'RND234', name: 'Shuffle Host', settings: roleSettings
})), 201);
const roleShuffleToken = roleShuffleCreated.token;
for (const name of ['Rani', 'Seno', 'Tika', 'Udin', 'Vera']) {
  await payload(await roleShuffleRoom.fetch(makeRequest('/internal/join', 'POST', { name })), 201);
}
const roleShuffleSignatures = new Set();
for (let round = 0; round < 12; round += 1) {
  await payload(await roleShuffleRoom.fetch(makeRequest('/internal/action', 'POST', { type: 'start_game' }, roleShuffleToken)));
  const state = await roleShuffleRoom.loadRoom();
  const counts = state.players.reduce((result, player) => {
    result[player.role] = (result[player.role] || 0) + 1;
    return result;
  }, {});
  assert.deepEqual(counts, { wolf: 1, seer: 1, doctor: 1, villager: 2 });
  roleShuffleSignatures.add(state.players.map(player => player.id + ':' + player.role).sort().join('|'));
  await payload(await roleShuffleRoom.fetch(makeRequest('/internal/action', 'POST', {
    type: 'reset_to_lobby'
  }, roleShuffleToken)));
}
assert.ok(roleShuffleSignatures.size > 1,
  'Repeated games with the same players and role counts must produce different player-to-role assignments.');
console.log('Werewolf role randomization regression passed: every role count is preserved and player-role assignment changes across games.');

// Voice mode belongs to each player: online sends audio; offline receives audio only.
const voiceSockets = [];
const voiceStorage = new MemoryStorage();
const voiceRoom = new WerewolfRoom({ storage: voiceStorage, getWebSockets: () => voiceSockets }, {});
const voiceCreated = await payload(await voiceRoom.fetch(makeRequest('/internal/create', 'POST', {
  code: 'VWXY23', name: 'Voice Host'
})), 201);
const voicePlayers = [];
voicePlayers.push(await payload(await voiceRoom.fetch(makeRequest('/internal/join', 'POST', {
  name: 'Voice Online', voiceMode: 'online'
})), 201));
voicePlayers.push(await payload(await voiceRoom.fetch(makeRequest('/internal/join', 'POST', {
  name: 'Voice Offline', voiceMode: 'offline'
})), 201));
assert.equal(voicePlayers[0].voiceMode, 'online');
assert.equal(voicePlayers[1].voiceMode, 'offline');
assert.equal(voicePlayers[0].isWaiting, false);
let voiceState = await voiceRoom.loadRoom();
assert.equal(voiceState.players[1].voiceMode, 'online');
assert.equal(voiceState.players[2].voiceMode, 'offline');
const voiceHostSocket = new FakeSocket(voiceState.hostId, 'moderator');
const voiceOneSocket = new FakeSocket(voicePlayers[0].playerId);
const voiceTwoSocket = new FakeSocket(voicePlayers[1].playerId);
voiceSockets.push(voiceHostSocket, voiceOneSocket, voiceTwoSocket);
const lobbyVoiceSnapshot = voiceRoom.snapshot(voiceState, voicePlayers[0].playerId);
assert.equal(lobbyVoiceSnapshot.voicePeers.length, 3, 'Online and offline players both join the audio room.');
assert.ok(lobbyVoiceSnapshot.voicePeers.some(peer =>
  peer.id === voicePlayers[1].playerId && peer.voiceMode === 'offline'),
  'Offline participants remain available as receive-only voice peers.');
await voiceRoom.webSocketMessage(voiceOneSocket, JSON.stringify({
  type: 'voice_signal', targetId: voicePlayers[1].playerId,
  signalKind: 'offer', payload: { type: 'offer', sdp: 'lobby-sdp' }
}));
assert.ok(voiceTwoSocket.messages.map(message => {
  try { return JSON.parse(message); } catch { return null; }
}).some(message => message?.type === 'voice_signal' && message.payload?.sdp === 'lobby-sdp'),
  'Online players may offer an audio connection to offline listeners.');
const beforeOfflineOffer = voiceOneSocket.messages.length;
await voiceRoom.webSocketMessage(voiceTwoSocket, JSON.stringify({
  type: 'voice_signal', targetId: voicePlayers[0].playerId,
  signalKind: 'offer', payload: { type: 'offer', sdp: 'offline-mic-must-not-offer' }
}));
assert.equal(voiceOneSocket.messages.length, beforeOfflineOffer,
  'Offline players must not be allowed to publish an audio offer.');
await voiceRoom.webSocketMessage(voiceTwoSocket, JSON.stringify({
  type: 'voice_signal', targetId: voicePlayers[0].playerId,
  signalKind: 'answer', payload: {
    type: 'answer',
    sdp: 'v=0\r\no=- 0 0 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\na=recvonly\r\n'
  }
}));
assert.ok(voiceOneSocket.messages.map(message => {
  try { return JSON.parse(message); } catch { return null; }
}).some(message => message?.type === 'voice_signal' && /a=recvonly/.test(message.payload?.sdp || '')),
  'Offline players may answer with receive-only SDP so they can hear online players.');
const beforeOfflineSendAnswer = voiceOneSocket.messages.length;
await voiceRoom.webSocketMessage(voiceTwoSocket, JSON.stringify({
  type: 'voice_signal', targetId: voicePlayers[0].playerId,
  signalKind: 'answer', payload: {
    type: 'answer',
    sdp: 'v=0\r\no=- 0 0 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\na=sendonly\r\n'
  }
}));
assert.equal(voiceOneSocket.messages.length, beforeOfflineSendAnswer,
  'Offline players must not send microphone audio in an SDP answer.');
voiceState.phase = 'morning';
voiceState.activeModeratorId = voiceState.hostId;
voiceState.players = voiceState.players.filter(player => player.id !== voiceState.hostId);
await voiceRoom.saveRoom(voiceState);
const voiceSnapshot = voiceRoom.snapshot(voiceState, voicePlayers[0].playerId);
assert.equal(voiceSnapshot.voicePeers.length, 3);
assert.ok(voiceSnapshot.voicePeers.some(peer => peer.id === voiceState.hostId && peer.isModerator));
assert.ok(voiceSnapshot.voicePeers.some(peer => peer.id === voicePlayers[1].playerId && peer.voiceMode === 'offline'));
await voiceRoom.webSocketMessage(voiceOneSocket, JSON.stringify({
  type: 'voice_signal',
  targetId: voicePlayers[1].playerId,
  signalKind: 'offer',
  payload: { type: 'offer', sdp: 'test-sdp' }
}));
const relayedSignal = voiceTwoSocket.messages.map(message => {
  try { return JSON.parse(message); } catch { return null; }
}).find(message => message?.type === 'voice_signal' && message.payload?.sdp === 'test-sdp');
assert.ok(relayedSignal, 'A valid online voice offer must be relayed to an offline listener.');
assert.equal(relayedSignal.fromId, voicePlayers[0].playerId);
assert.equal(relayedSignal.signalKind, 'offer');
assert.equal(relayedSignal.payload.sdp, 'test-sdp');
await voiceRoom.webSocketMessage(voiceOneSocket, JSON.stringify({
  type: 'voice_signal',
  targetId: voiceState.hostId,
  signalKind: 'candidate',
  payload: { candidate: 'test-candidate' }
}));
const relayedToModerator = voiceHostSocket.messages.map(message => {
  try { return JSON.parse(message); } catch { return null; }
}).find(message => message?.type === 'voice_signal');
assert.ok(relayedToModerator, 'The moderator may join the discussion voice room.');
voiceState = await voiceRoom.loadRoom();
for (const phase of ['role_draw', 'night', 'discussion', 'voting', 'result', 'finished']) {
  voiceState.phase = phase;
  await voiceRoom.saveRoom(voiceState);
  const messageCountBeforePhase = voiceTwoSocket.messages.length;
  await voiceRoom.webSocketMessage(voiceOneSocket, JSON.stringify({
    type: 'voice_signal', targetId: voicePlayers[1].playerId,
    signalKind: 'offer', payload: { type: 'offer', sdp: phase + '-sdp' }
  }));
  assert.ok(voiceTwoSocket.messages.length > messageCountBeforePhase,
    'Voice signalling must remain available during ' + phase + '.');
  voiceState = await voiceRoom.loadRoom();
}
voiceState = await voiceRoom.loadRoom();
voiceState.phase = 'discussion';
const voiceControlledPlayer = voiceState.players.find(player => player.id === voicePlayers[0].playerId);
voiceControlledPlayer.isBotControlled = true;
await voiceRoom.saveRoom(voiceState);
const controlledVoiceSnapshot = voiceRoom.snapshot(voiceState, voicePlayers[1].playerId);
assert.ok(!controlledVoiceSnapshot.voicePeers.some(peer => peer.id === voicePlayers[0].playerId),
  'A player temporarily controlled by BOT must not appear as a voice peer.');
const beforeControlledSender = voiceTwoSocket.messages.length;
await voiceRoom.webSocketMessage(voiceOneSocket, JSON.stringify({
  type: 'voice_signal', targetId: voicePlayers[1].playerId,
  signalKind: 'offer', payload: { type: 'offer', sdp: 'bot-controlled-sender' }
}));
assert.equal(voiceTwoSocket.messages.length, beforeControlledSender,
  'A BOT-controlled player must not send voice signals.');
voiceControlledPlayer.isBotControlled = false;
voiceState.players.find(player => player.id === voicePlayers[1].playerId).isBotControlled = true;
await voiceRoom.saveRoom(voiceState);
const beforeControlledTarget = voiceTwoSocket.messages.length;
await voiceRoom.webSocketMessage(voiceOneSocket, JSON.stringify({
  type: 'voice_signal', targetId: voicePlayers[1].playerId,
  signalKind: 'offer', payload: { type: 'offer', sdp: 'bot-controlled-target' }
}));
assert.equal(voiceTwoSocket.messages.length, beforeControlledTarget,
  'A BOT-controlled player must not receive voice signals.');
voiceState = await voiceRoom.loadRoom();
voiceState.players.forEach(player => { player.isBotControlled = false; });
await voiceRoom.saveRoom(voiceState);
await payload(await voiceRoom.fetch(makeRequest('/internal/action', 'POST', {
  type: 'send_discussion_chat', text: 'Chat teks tetap aktif untuk mode offline.'
}, voicePlayers[1].token)));
const offlineChatView = (await payload(await voiceRoom.fetch(
  makeRequest('/internal/state', 'GET', undefined, voicePlayers[1].token)
))).state;
assert.ok(offlineChatView.chat.some(message => message.text === 'Chat teks tetap aktif untuk mode offline.'));
console.log('Werewolf voice regression passed: online sends audio, offline receives audio without microphone, and both keep text chat.');

// Joining an active game creates a waiting player, excluded from the current round.
const waitlistStorage = new MemoryStorage();
const waitlistSockets = [];
const waitlistRoom = new WerewolfRoom({ storage: waitlistStorage, getWebSockets: () => waitlistSockets }, {});
const waitlistCreated = await payload(await waitlistRoom.fetch(makeRequest('/internal/create', 'POST', {
  code: 'WQAT23', name: 'Wait Host'
})), 201);
await payload(await waitlistRoom.fetch(makeRequest('/internal/join', 'POST', {
  name: 'Active One', voiceMode: 'online'
})), 201);
await payload(await waitlistRoom.fetch(makeRequest('/internal/join', 'POST', {
  name: 'Active Two', voiceMode: 'offline'
})), 201);
let waitlistState = await waitlistRoom.loadRoom();
waitlistState.phase = 'discussion';
waitlistState.round = 2;
waitlistState.activeModeratorId = waitlistState.hostId;
waitlistState.players = waitlistState.players.filter(player => player.id !== waitlistState.hostId);
await waitlistRoom.saveRoom(waitlistState);
const lateJoin = await payload(await waitlistRoom.fetch(makeRequest('/internal/join', 'POST', {
  name: 'Late Player', voiceMode: 'offline'
})), 201);
assert.equal(lateJoin.isWaiting, true);
assert.equal(lateJoin.voiceMode, 'offline');
waitlistState = await waitlistRoom.loadRoom();
assert.equal(waitlistState.players.length, 2, 'A late joiner must not increase the current game roster.');
assert.equal(waitlistState.waitingPlayers.length, 1);
const lateJoinSnapshot = (await payload(await waitlistRoom.fetch(
  makeRequest('/internal/state', 'GET', undefined, lateJoin.token)
))).state;
assert.equal(lateJoinSnapshot.self.isWaiting, true);
assert.equal(lateJoinSnapshot.self.role, null);
assert.equal(lateJoinSnapshot.self.alive, false);
assert.deepEqual(lateJoinSnapshot.targets, []);
assert.ok(!lateJoinSnapshot.voicePeers.some(peer => peer.id === lateJoin.playerId),
  'A queued player does not enter the active game voice room.');
await payload(await waitlistRoom.fetch(makeRequest('/internal/action', 'POST', {
  type: 'send_discussion_chat', text: 'I am waiting.'
}, lateJoin.token)), 403);
await payload(await waitlistRoom.fetch(makeRequest('/internal/action', 'POST', {
  type: 'leave_room'
}, lateJoin.token)));
assert.equal((await waitlistRoom.loadRoom()).waitingPlayers.length, 0,
  'A queued player can leave without affecting active players.');
const nextGameJoin = await payload(await waitlistRoom.fetch(makeRequest('/internal/join', 'POST', {
  name: 'Next Game Player', voiceMode: 'online'
})), 201);
assert.equal(nextGameJoin.isWaiting, true);
await payload(await waitlistRoom.fetch(makeRequest('/internal/action', 'POST', {
  type: 'reset_to_lobby'
}, waitlistCreated.token)));
waitlistState = await waitlistRoom.loadRoom();
assert.equal(waitlistState.phase, 'lobby');
assert.equal(waitlistState.waitingPlayers.length, 0);
assert.ok(waitlistState.players.some(player => player.id === nextGameJoin.playerId),
  'Queued players are promoted into the next lobby when the host restarts the room.');
const promotedSnapshot = (await payload(await waitlistRoom.fetch(
  makeRequest('/internal/state', 'GET', undefined, nextGameJoin.token)
))).state;
assert.equal(promotedSnapshot.self.isWaiting, false);
assert.equal(promotedSnapshot.self.alive, true);
assert.equal(promotedSnapshot.self.hasDrawn, false);
// Living-player visibility and calculation challenges for roles without a night ability.
const mathRoom = new WerewolfRoom({ storage: new MemoryStorage(), getWebSockets: () => [] }, {});
const mathSettings = {
  ...roleSettings,
  moderatorMode: 'host',
  roleCounts: {
    ...roleSettings.roleCounts,
    wolf: 1, alpha_wolf: 0, seer: 1, doctor: 0, bodyguard: 0,
    witch: 0, hunter: 1, cupid: 0, guardian_angel: 0, detective: 0,
    mayor: 1, jester: 0, villager: 1, moderator: 0
  }
};
const mathCreated = await payload(await mathRoom.fetch(makeRequest('/internal/create', 'POST', {
  code: 'MATH23', name: 'Math Host', settings: mathSettings
})), 201);
const mathTokens = [];
for (const name of ['Satu', 'Dua', 'Tiga', 'Empat', 'Lima']) {
  const joined = await payload(await mathRoom.fetch(makeRequest('/internal/join', 'POST', { name })), 201);
  mathTokens.push(joined.token);
}
await payload(await mathRoom.fetch(makeRequest('/internal/action', 'POST', {
  type: 'start_game'
}, mathCreated.token)));
let mathState = await mathRoom.loadRoom();
['wolf', 'seer', 'hunter', 'mayor', 'villager'].forEach((role, index) => {
  mathState.players[index].role = role;
  mathState.players[index].hasDrawn = true;
  mathState.players[index].alive = true;
});
await mathRoom.saveRoom(mathState);
await payload(await mathRoom.fetch(makeRequest('/internal/action', 'POST', {
  type: 'start_night'
}, mathCreated.token)));
mathState = await mathRoom.loadRoom();
assert.equal(mathState.nightActions[mathState.players[2].id], undefined,
  'Hunter must not be automatically passed; the player must answer a calculation.');
assert.equal(mathState.nightActions[mathState.players[3].id], undefined,
  'Mayor must not be automatically passed; the player must answer a calculation.');
const mathModeratorView = (await payload(await mathRoom.fetch(
  makeRequest('/internal/state', 'GET', undefined, mathCreated.token)
))).state;
assert.equal(mathModeratorView.room.nightActionsSubmitted, 0);
assert.equal(mathModeratorView.room.nightActionsRequired, 5);
assert.equal(mathModeratorView.room.nightActionsAutoPassed, undefined);
const publicLivingView = (await payload(await mathRoom.fetch(
  makeRequest('/internal/state', 'GET', undefined, mathTokens[0])
))).state;
assert.deepEqual(publicLivingView.livingPlayers.map(player => player.name), ['Satu', 'Dua', 'Tiga', 'Empat', 'Lima']);
assert.ok(publicLivingView.livingPlayers.every(player => !Object.hasOwn(player, 'role')),
  'Players may see who is alive but must not see anyone else’s role.');
const hunterMathView = (await payload(await mathRoom.fetch(
  makeRequest('/internal/state', 'GET', undefined, mathTokens[2])
))).state;
assert.equal(hunterMathView.self.nightActionMode, 'math');
assert.ok(hunterMathView.self.villagerPrompt, 'Hunter must receive a calculation prompt when alive at night.');
await payload(await mathRoom.fetch(makeRequest('/internal/action', 'POST', {
  type: 'night_action', targetId: mathState.players[4].id
}, mathTokens[0])));
await payload(await mathRoom.fetch(makeRequest('/internal/action', 'POST', {
  type: 'night_action', targetId: mathState.players[0].id
}, mathTokens[1])));
await submitVillagerMath(mathRoom, mathTokens[2]);
await submitVillagerMath(mathRoom, mathTokens[3]);
await submitVillagerMath(mathRoom, mathTokens[4]);
mathState = await mathRoom.loadRoom();
assert.equal(mathState.nightActions[mathState.players[2].id].type, 'villager_math');
assert.equal(mathState.nightActions[mathState.players[3].id].type, 'villager_math');
assert.ok(mathState.nightEndsAt, 'The night timer remains active after all choices are submitted so players can revise them.');
await actionAfterDeadline(mathRoom, mathCreated.token, 'resolve_night');
mathState = await mathRoom.loadRoom();
assert.equal(mathState.phase, 'morning');
const mathReport = mathState.lastResult.actionReport;
for (const role of ['Hunter', 'Mayor', 'Warga Desa']) {
  assert.ok(mathReport.some(item => item.role === role), 'Moderator report must list the calculation action for ' + role + '.');
}
assert.ok(!mathReport.some(item => item.role === 'Otomatis dihitung' || item.role === 'Aksi dilewati'));
console.log('Werewolf living-player and night-calculation regressions passed.');

// New Village roles: Priest protection, Vigilante shot, and Mason private knowledge.
const newRoleRoom = new WerewolfRoom({ storage: new MemoryStorage(), getWebSockets: () => [] }, {});
const newRoleSettings = {
  ...roleSettings,
  moderatorMode: 'host',
  roleCounts: {
    ...roleSettings.roleCounts,
    wolf: 1, alpha_wolf: 0, seer: 1, doctor: 0, bodyguard: 0,
    witch: 0, hunter: 0, cupid: 0, guardian_angel: 0, detective: 0,
    mayor: 1, priest: 1, vigilante: 1, mason: 2, jester: 0, villager: 1, moderator: 0
  }
};
const newRoleCreated = await payload(await newRoleRoom.fetch(makeRequest('/internal/create', 'POST', {
  code: 'NEWRL2', name: 'New Role Host', settings: newRoleSettings
})), 201);
const newRoleTokens = [];
for (const name of ['Wolf One', 'Seer One', 'Priest One', 'Vigilante One', 'Mason One', 'Mason Two', 'Mayor One', 'Villager One']) {
  const joined = await payload(await newRoleRoom.fetch(makeRequest('/internal/join', 'POST', { name })), 201);
  newRoleTokens.push(joined.token);
}
await payload(await newRoleRoom.fetch(makeRequest('/internal/action', 'POST', {
  type: 'start_game'
}, newRoleCreated.token)));
let newRoleState = await newRoleRoom.loadRoom();
['wolf', 'seer', 'priest', 'vigilante', 'mason', 'mason', 'mayor', 'villager'].forEach((role, index) => {
  newRoleState.players[index].role = role;
  newRoleState.players[index].hasDrawn = true;
  newRoleState.players[index].alive = true;
});
await newRoleRoom.saveRoom(newRoleState);
await payload(await newRoleRoom.fetch(makeRequest('/internal/action', 'POST', {
  type: 'start_night'
}, newRoleCreated.token)));
const masonView = (await payload(await newRoleRoom.fetch(
  makeRequest('/internal/state', 'GET', undefined, newRoleTokens[4])
))).state;
assert.deepEqual(masonView.self.masonNames, ['Mason Two'],
  'Mason may privately see the names of other living Masons, without their role cards.');
await payload(await newRoleRoom.fetch(makeRequest('/internal/action', 'POST', {
  type: 'night_action', targetId: newRoleState.players[4].id
}, newRoleTokens[0])));
await payload(await newRoleRoom.fetch(makeRequest('/internal/action', 'POST', {
  type: 'night_action', targetId: newRoleState.players[0].id
}, newRoleTokens[1])));
await payload(await newRoleRoom.fetch(makeRequest('/internal/action', 'POST', {
  type: 'night_action', targetId: newRoleState.players[4].id
}, newRoleTokens[2])));
await payload(await newRoleRoom.fetch(makeRequest('/internal/action', 'POST', {
  type: 'night_action', targetId: newRoleState.players[6].id
}, newRoleTokens[3])));
for (const token of [newRoleTokens[4], newRoleTokens[5], newRoleTokens[6], newRoleTokens[7]]) {
  await submitVillagerMath(newRoleRoom, token);
}
newRoleState = await newRoleRoom.loadRoom();
assert.equal(newRoleState.nightActions[newRoleState.players[2].id].type, 'priest_protect');
assert.equal(newRoleState.nightActions[newRoleState.players[3].id].type, 'vigilante_shot');
assert.ok(newRoleState.nightEndsAt);
await actionAfterDeadline(newRoleRoom, newRoleCreated.token, 'resolve_night', { force: true });
newRoleState = await newRoleRoom.loadRoom();
assert.equal(newRoleState.phase, 'morning');
assert.equal(newRoleState.players[4].alive, true, 'Priest must protect its selected player from the wolf attack.');
assert.equal(newRoleState.players[6].alive, false, 'Vigilante must eliminate its selected target.');
assert.equal(newRoleState.players[2].priestUsed, true);
assert.equal(newRoleState.players[3].vigilanteUsed, true);
assert.ok(newRoleState.lastResult.actionReport.some(item => item.role === 'Priest'));
assert.ok(newRoleState.lastResult.actionReport.some(item => item.role === 'Vigilante'));
assert.ok(newRoleState.lastResult.actionReport.some(item => item.role === 'Mason'));
newRoleState.phase = 'night';
newRoleState.round = 2;
newRoleState.nightActions = {};
newRoleState.nightEndsAt = Date.now() + 60000;
newRoleRoom.prepareVillagerPrompts(newRoleState);
await newRoleRoom.saveRoom(newRoleState);
for (const token of [newRoleTokens[2], newRoleTokens[3]]) {
  const usedRoleView = (await payload(await newRoleRoom.fetch(
    makeRequest('/internal/state', 'GET', undefined, token)
  ))).state;
  assert.equal(usedRoleView.self.nightActionMode, 'math',
    'Used one-shot roles must switch to the calculation challenge on later nights.');
  assert.ok(usedRoleView.self.villagerPrompt);
}
console.log('Werewolf Priest, Vigilante, and Mason role regressions passed.');




// Strict majority includes abstentions and non-submitted ballots.
const onlineThresholdRoom = new WerewolfRoom({ storage: new MemoryStorage(), getWebSockets: () => [] }, {});
const onlineMakeVoteState = votes => ({
  phase: 'voting', round: 1, winner: null, additionalWinners: [], lovers: [],
  players: [
    { id: 'w', name: 'Wolf', role: 'wolf', alive: true },
    { id: 't', name: 'Target', role: 'villager', alive: true },
    { id: 'b', name: 'Blue', role: 'villager', alive: true },
    { id: 'g', name: 'Green', role: 'villager', alive: true }
  ],
  votes, settings: { abilities: {} }, guardianTargets: {}, gameHistory: [],
  gameHistoryTruncated: 0, gameFinishedRecorded: false, gameArchive: [],
  gameId: 'threshold-test', gameStartedAt: Date.now(), votingEndsAt: Date.now() + 15000,
  nightActions: {}, seerResults: {}, witchPotions: {}, bodyguardTargets: {}, villagerPrompts: {}
});
const onlineExactlyHalf = onlineMakeVoteState({ w: 't', b: 't', g: null });
onlineThresholdRoom.finishVote(onlineExactlyHalf, Date.now());
assert.equal(onlineExactlyHalf.players.find(player => player.id === 't').alive, true);
assert.match(onlineExactlyHalf.lastResult.message, /lebih dari 50%/);
assert.equal(onlineExactlyHalf.lastResult.voteTotalWeight, 4);
assert.equal(onlineExactlyHalf.lastResult.abstainCount, 2);
const onlineClearMajority = onlineMakeVoteState({ w: 't', b: 't', g: 't' });
onlineThresholdRoom.finishVote(onlineClearMajority, Date.now());
assert.equal(onlineClearMajority.players.find(player => player.id === 't').alive, false);

const handoffBotRoom = new WerewolfRoom({ storage: new MemoryStorage(), getWebSockets: () => [] }, {});
const handoffBotCreated = await payload(await handoffBotRoom.fetch(makeRequest('/internal/create', 'POST', {
  code: 'BRTC24', name: 'Bot Host', settings: roleSettings
})), 201);
const handoffBotTokens = [];
for (const name of ['Bot Wolf', 'Bot Seer', 'Bot Doctor', 'Bot Village', 'Bot Idle']) {
  handoffBotTokens.push(await payload(await handoffBotRoom.fetch(makeRequest('/internal/join', 'POST', { name })), 201));
}
await payload(await handoffBotRoom.fetch(makeRequest('/internal/action', 'POST', { type: 'start_game' }, handoffBotCreated.token)));
let handoffBotState = await handoffBotRoom.loadRoom();
const handoffBotRoleSet = ['wolf', 'seer', 'doctor', 'villager', 'villager'];
handoffBotState.players.forEach((player, index) => { player.role = handoffBotRoleSet[index]; player.hasDrawn = false; });
const handoffBotPlayerId = handoffBotState.players[4].id;
await handoffBotRoom.saveRoom(handoffBotState);
await payload(await handoffBotRoom.fetch(makeRequest('/internal/action', 'POST', {
  type: 'replace_with_bot', playerId: handoffBotPlayerId
}, handoffBotCreated.token)));
handoffBotState = await handoffBotRoom.loadRoom();
assert.equal(handoffBotState.players.find(player => player.id === handoffBotPlayerId).isBotControlled, true);
assert.equal(handoffBotState.players.find(player => player.id === handoffBotPlayerId).hasDrawn, true);
const controlledView = (await payload(await handoffBotRoom.fetch(
  makeRequest('/internal/state', 'GET', undefined, handoffBotTokens[4].token)
))).state;
assert.equal(controlledView.self.isBotControlled, true);
await payload(await handoffBotRoom.fetch(makeRequest('/internal/action', 'POST', { type: 'draw_card' }, handoffBotTokens[4].token)), 403);
for (let index = 0; index < handoffBotTokens.length - 1; index += 1) {
  await payload(await handoffBotRoom.fetch(makeRequest('/internal/action', 'POST', { type: 'draw_card' }, handoffBotTokens[index].token)));
}
await payload(await handoffBotRoom.fetch(makeRequest('/internal/action', 'POST', { type: 'start_night' }, handoffBotCreated.token)));
handoffBotState = await handoffBotRoom.loadRoom();
assert.ok(handoffBotState.nightActions[handoffBotPlayerId]);
await payload(await handoffBotRoom.fetch(makeRequest('/internal/action', 'POST', {
  type: 'night_action', mode: 'villager_math', promptId: 'not-allowed', choiceIndex: 0
}, handoffBotTokens[4].token)), 403);
await payload(await handoffBotRoom.fetch(makeRequest('/internal/action', 'POST', {
  type: 'restore_player_control', playerId: handoffBotPlayerId
}, handoffBotTokens[4].token)));
handoffBotState = await handoffBotRoom.loadRoom();
assert.equal(handoffBotState.players.find(player => player.id === handoffBotPlayerId).isBotControlled, false);
assert.equal(handoffBotState.players.find(player => player.id === handoffBotPlayerId).isBot, false);
await payload(await handoffBotRoom.fetch(makeRequest('/internal/action', 'POST', {
  type: 'replace_with_bot', playerId: handoffBotPlayerId
}, handoffBotCreated.token)));
await payload(await handoffBotRoom.fetch(makeRequest('/internal/action', 'POST', {
  type: 'leave_room'
}, handoffBotTokens[4].token)));
handoffBotState = await handoffBotRoom.loadRoom();
assert.equal(handoffBotState.players.find(player => player.id === handoffBotPlayerId).alive, false,
  'A player whose seat is controlled by BOT must still be able to leave from the takeover dialog.');
assert.equal(handoffBotState.players.find(player => player.id === handoffBotPlayerId).connected, false);

const skipPhaseRoom = new WerewolfRoom({ storage: new MemoryStorage(), getWebSockets: () => [] }, {});
const skipPhaseCreated = await payload(await skipPhaseRoom.fetch(makeRequest('/internal/create', 'POST', {
  code: 'SKAP24', name: 'Skip Host', settings: roleSettings
})), 201);
const skipPhaseTokens = [];
for (const name of ['Skip Wolf', 'Skip Seer', 'Skip Doctor', 'Skip Village', 'Skip Idle']) {
  skipPhaseTokens.push(await payload(await skipPhaseRoom.fetch(makeRequest('/internal/join', 'POST', { name })), 201));
}
await payload(await skipPhaseRoom.fetch(makeRequest('/internal/action', 'POST', { type: 'start_game' }, skipPhaseCreated.token)));
let skipPhaseState = await skipPhaseRoom.loadRoom();
const skipPhaseRoleSet = ['wolf', 'seer', 'doctor', 'villager', 'villager'];
skipPhaseState.players.forEach((player, index) => { player.role = skipPhaseRoleSet[index]; player.hasDrawn = true; });
const skipPhaseTargetId = skipPhaseState.players[3].id;
await skipPhaseRoom.saveRoom(skipPhaseState);
await payload(await skipPhaseRoom.fetch(makeRequest('/internal/action', 'POST', { type: 'start_night' }, skipPhaseCreated.token)));
await payload(await skipPhaseRoom.fetch(makeRequest('/internal/action', 'POST', {
  type: 'night_action', targetId: skipPhaseTargetId
}, skipPhaseTokens[0].token)));
await payload(await skipPhaseRoom.fetch(makeRequest('/internal/action', 'POST', {
  type: 'night_action', targetId: skipPhaseState.players[0].id
}, skipPhaseTokens[1].token)));
await payload(await skipPhaseRoom.fetch(makeRequest('/internal/action', 'POST', { type: 'skip_missing_night' }, skipPhaseCreated.token)));
skipPhaseState = await skipPhaseRoom.loadRoom();
assert.equal(skipPhaseState.nightSkippedPlayerIds.length, 3);
assert.ok(skipPhaseState.nightEndsAt > Date.now());
const skipPhaseSeerView = (await payload(await skipPhaseRoom.fetch(
  makeRequest('/internal/state', 'GET', undefined, skipPhaseTokens[1].token)
))).state;
assert.equal(skipPhaseSeerView.self.seerResult, null, 'Skipped players do not trigger early private reveal.');
await actionAfterDeadline(skipPhaseRoom, skipPhaseCreated.token, 'resolve_night', { force: true });
skipPhaseState = await skipPhaseRoom.loadRoom();
assert.equal(skipPhaseState.phase, 'morning');
assert.ok(skipPhaseState.lastResult.actionReport.some(item => item.role === 'Aksi belum masuk'));
assert.equal(skipPhaseState.nightSkippedPlayerIds.length, 0);
const roleDrawTimeoutRoom = new WerewolfRoom({ storage: new MemoryStorage(), getWebSockets: () => [] }, {});
const roleDrawTimeoutCreated = await payload(await roleDrawTimeoutRoom.fetch(makeRequest('/internal/create', 'POST', {
  code: 'CARD28', name: 'Card Timeout Host',
  settings: { moderatorMode: 'host', roleCounts: {
    wolf: 1, alpha_wolf: 0, seer: 0, doctor: 0, bodyguard: 0, witch: 0,
    hunter: 0, cupid: 0, guardian_angel: 0, detective: 0, mayor: 0,
    priest: 0, vigilante: 0, mason: 0, jester: 0, villager: 1, moderator: 0
  } }
})), 201);
const roleDrawTimeoutPlayer = await payload(await roleDrawTimeoutRoom.fetch(
  makeRequest('/internal/join', 'POST', { name: 'Late Card Player' })
), 201);
await payload(await roleDrawTimeoutRoom.fetch(makeRequest('/internal/join', 'POST', {
  name: 'Second Card Player'
})), 201);
await payload(await roleDrawTimeoutRoom.fetch(makeRequest('/internal/action', 'POST', {
  type: 'start_game'
}, roleDrawTimeoutCreated.token)));
let roleDrawTimeoutState = await roleDrawTimeoutRoom.loadRoom();
assert.equal(roleDrawTimeoutState.phase, 'role_draw');
assert.ok(roleDrawTimeoutState.roleDrawEndsAt >= Date.now() + 19000
  && roleDrawTimeoutState.roleDrawEndsAt <= Date.now() + 20000,
  'Role cards must have a 20-second reveal window.');
const privateUnopenedCard = (await payload(await roleDrawTimeoutRoom.fetch(
  makeRequest('/internal/state', 'GET', undefined, roleDrawTimeoutPlayer.token)
))).state;
assert.equal(privateUnopenedCard.self.hasRole, true);
assert.equal(privateUnopenedCard.self.hasDrawn, false);
assert.equal(privateUnopenedCard.self.role, null, 'An unopened card must remain private.');
roleDrawTimeoutState.roleDrawEndsAt = Date.now() - 1;
await roleDrawTimeoutRoom.saveRoom(roleDrawTimeoutState);
const realNowForRoleDraw = Date.now;
try { Date.now = () => roleDrawTimeoutState.roleDrawEndsAt + 1; await roleDrawTimeoutRoom.alarm(); }
finally { Date.now = realNowForRoleDraw; }
roleDrawTimeoutState = await roleDrawTimeoutRoom.loadRoom();
assert.equal(roleDrawTimeoutState.phase, 'night',
  'The game must automatically enter night after the 20-second role reveal deadline.');
assert.equal(roleDrawTimeoutState.roleDrawEndsAt, null);
const lateCardOpened = await payload(await roleDrawTimeoutRoom.fetch(makeRequest('/internal/action', 'POST', {
  type: 'draw_card'
}, roleDrawTimeoutPlayer.token)));
const lateCardView = (await payload(await roleDrawTimeoutRoom.fetch(
  makeRequest('/internal/state', 'GET', undefined, roleDrawTimeoutPlayer.token)
))).state;
assert.equal(lateCardView.self.hasDrawn, true);
assert.ok(lateCardView.self.role, 'A player may privately reveal their own card after the night has begun.');
console.log('Werewolf role-card deadline passed: 20-second timeout, automatic night start and late private card reveal.');

// Dawn trigger regressions: Hunter can revise a last shot; Reviver can restore a night victim.
const hunterDawnRoom = new WerewolfRoom({ storage: new MemoryStorage(), getWebSockets: () => [] }, {});
const hunterDawnCreated = await payload(await hunterDawnRoom.fetch(makeRequest('/internal/create', 'POST', {
  code: 'HUNTD2', name: 'Hunter Dawn Host',
  settings: { moderatorMode: 'host', roleCounts: {
    wolf: 1, alpha_wolf: 0, seer: 0, doctor: 0, bodyguard: 0, witch: 0,
    hunter: 1, reviver: 0, cupid: 0, guardian_angel: 0, detective: 0, mayor: 0,
    jester: 0, priest: 0, vigilante: 0, mason: 0, moderator: 0, villager: 3
  }, abilities: { hunterShot: true, reviverOnce: true } }
})), 201);
const hunterDawnTokens = [];
for (const name of ['Wolf Dawn', 'Hunter Dawn', 'Village Dawn A', 'Village Dawn B', 'Village Dawn C']) {
  hunterDawnTokens.push((await payload(await hunterDawnRoom.fetch(makeRequest('/internal/join', 'POST', { name })), 201)).token);
}
await payload(await hunterDawnRoom.fetch(makeRequest('/internal/action', 'POST', { type: 'start_game' }, hunterDawnCreated.token)));
let hunterDawnState = await hunterDawnRoom.loadRoom();
hunterDawnState.players.forEach((player, index) => {
  player.role = ['wolf', 'hunter', 'villager', 'villager', 'villager'][index];
  player.alive = true;
  player.hasDrawn = true;
  player.hunterUsed = false;
  player.reviverUsed = false;
});
hunterDawnRoom.prepareVillagerPrompts(hunterDawnState);
await hunterDawnRoom.saveRoom(hunterDawnState);
await payload(await hunterDawnRoom.fetch(makeRequest('/internal/action', 'POST', { type: 'start_night' }, hunterDawnCreated.token)));
hunterDawnState = await hunterDawnRoom.loadRoom();
await payload(await hunterDawnRoom.fetch(makeRequest('/internal/action', 'POST', {
  type: 'night_action', targetId: hunterDawnState.players[1].id
}, hunterDawnTokens[0])));
for (const token of hunterDawnTokens.slice(1)) await submitVillagerMath(hunterDawnRoom, token);
await actionAfterDeadline(hunterDawnRoom, hunterDawnCreated.token, 'resolve_night');
hunterDawnState = await hunterDawnRoom.loadRoom();
assert.equal(hunterDawnState.phase, 'dawn', 'A Hunter killed at night must open the dawn trigger phase.');
const hunterDawnActionState = (await payload(await hunterDawnRoom.fetch(
  makeRequest('/internal/state', 'GET', undefined, hunterDawnTokens[1])
))).state;
assert.equal(hunterDawnActionState.room.dawnActionsRequired, 1);
await payload(await hunterDawnRoom.fetch(makeRequest('/internal/action', 'POST', {
  type: 'dawn_action', targetId: hunterDawnState.players[2].id
}, hunterDawnTokens[1])));
await payload(await hunterDawnRoom.fetch(makeRequest('/internal/action', 'POST', {
  type: 'dawn_action', targetId: hunterDawnState.players[3].id
}, hunterDawnTokens[1])));
const hunterDawnView = (await payload(await hunterDawnRoom.fetch(
  makeRequest('/internal/state', 'GET', undefined, hunterDawnTokens[1])
))).state;
assert.equal(hunterDawnView.self.dawnActionTargetId, hunterDawnState.players[3].id,
  'Hunter must be able to replace a dawn shot before the phase timer expires.');
await actionAfterDeadline(hunterDawnRoom, hunterDawnCreated.token, 'resolve_dawn');
hunterDawnState = await hunterDawnRoom.loadRoom();
assert.equal(hunterDawnState.phase, 'morning');
assert.equal(hunterDawnState.players[1].hunterUsed, true);
assert.equal(hunterDawnState.players[2].alive, true);
assert.equal(hunterDawnState.players[3].alive, false,
  'Only the Hunter’s latest selected target should be eliminated.');

const reviverDawnRoom = new WerewolfRoom({ storage: new MemoryStorage(), getWebSockets: () => [] }, {});
const reviverDawnCreated = await payload(await reviverDawnRoom.fetch(makeRequest('/internal/create', 'POST', {
  code: 'REVV23', name: 'Reviver Dawn Host',
  settings: { moderatorMode: 'host', roleCounts: {
    wolf: 1, alpha_wolf: 0, seer: 0, doctor: 0, bodyguard: 0, witch: 0,
    hunter: 0, reviver: 1, cupid: 0, guardian_angel: 0, detective: 0, mayor: 0,
    jester: 0, priest: 0, vigilante: 0, mason: 0, moderator: 0, villager: 3
  }, abilities: { hunterShot: true, reviverOnce: true } }
})), 201);
const reviverDawnTokens = [];
for (const name of ['Wolf Revive', 'Reviver', 'Village Revive A', 'Village Revive B', 'Village Revive C']) {
  reviverDawnTokens.push((await payload(await reviverDawnRoom.fetch(makeRequest('/internal/join', 'POST', { name })), 201)).token);
}
await payload(await reviverDawnRoom.fetch(makeRequest('/internal/action', 'POST', { type: 'start_game' }, reviverDawnCreated.token)));
let reviverDawnState = await reviverDawnRoom.loadRoom();
reviverDawnState.players.forEach((player, index) => {
  player.role = ['wolf', 'reviver', 'villager', 'villager', 'villager'][index];
  player.alive = true;
  player.hasDrawn = true;
  player.reviverUsed = false;
});
reviverDawnRoom.prepareVillagerPrompts(reviverDawnState);
await reviverDawnRoom.saveRoom(reviverDawnState);
await payload(await reviverDawnRoom.fetch(makeRequest('/internal/action', 'POST', { type: 'start_night' }, reviverDawnCreated.token)));
reviverDawnState = await reviverDawnRoom.loadRoom();
await payload(await reviverDawnRoom.fetch(makeRequest('/internal/action', 'POST', {
  type: 'night_action', targetId: reviverDawnState.players[4].id
}, reviverDawnTokens[0])));
for (const token of reviverDawnTokens.slice(1)) await submitVillagerMath(reviverDawnRoom, token);
await actionAfterDeadline(reviverDawnRoom, reviverDawnCreated.token, 'resolve_night');
reviverDawnState = await reviverDawnRoom.loadRoom();
assert.equal(reviverDawnState.phase, 'dawn', 'A living Reviver with a night victim must receive a dawn action window.');
const reviverDawnActionState = (await payload(await reviverDawnRoom.fetch(
  makeRequest('/internal/state', 'GET', undefined, reviverDawnTokens[1])
))).state;
assert.equal(reviverDawnActionState.room.dawnActionsRequired, 1);
await payload(await reviverDawnRoom.fetch(makeRequest('/internal/action', 'POST', {
  type: 'dawn_action', targetId: reviverDawnState.players[4].id
}, reviverDawnTokens[1])));
await actionAfterDeadline(reviverDawnRoom, reviverDawnCreated.token, 'resolve_dawn');
reviverDawnState = await reviverDawnRoom.loadRoom();
assert.equal(reviverDawnState.phase, 'morning');
assert.equal(reviverDawnState.players[4].alive, true, 'Reviver must restore a victim from the same night.');
assert.equal(reviverDawnState.players[1].reviverUsed, true, 'Reviver can only use the ability once per game.');

console.log('Werewolf online enhancements passed: strict majority, bot handoff and automatic morning after skipped actions.');


// Bot discussion must disclose each living bot's own night action, not just three selected speakers.
const botReportEngine = new WerewolfRoom({ storage: new MemoryStorage(), getWebSockets: () => [] }, {});
const botReportPlayers = Array.from({ length: 5 }, (_, index) => ({
  id: 'bot-report-' + index,
  name: 'Bot Report ' + index,
  role: 'villager',
  alive: true,
  isBot: true,
  personality: 'assertive'
}));
const botReportFixture = {
  players: botReportPlayers,
  round: 1,
  botDiscussionRound: null,
  botNightReports: Object.fromEntries(botReportPlayers.map((bot, index) => [
    bot.id, { round: 1, text: 'Aksi malam bot ' + index + ': aku menyelesaikan tugas malam.' }
  ])),
  seerResults: {},
  lastResult: { kind: 'night', eliminatedId: null },
  chat: []
};
botReportEngine.seedBotDiscussion(botReportFixture, Date.now());
assert.equal(botReportFixture.chat.length, 5,
  'Every living bot with a night-action report must speak during the discussion.');
assert.ok(botReportFixture.chat.every(message => message.isNightReport === true),
  'Bot night-action messages must be marked for the discussion UI.');
assert.ok(botReportFixture.chat.every(message => /Aksi malam bot/.test(message.text)));
botReportEngine.seedBotDiscussion(botReportFixture, Date.now());
assert.equal(botReportFixture.chat.length, 5,
  'Bot discussion reports must not be duplicated within the same round.');
console.log('Werewolf bot discussion reports passed: every living bot action is disclosed once per round.');

// Online System moderator must pass through a triggered dawn phase without any host phase controls.
const autoDawnCycleRoom = new WerewolfRoom({ storage: new MemoryStorage(), getWebSockets: () => [] }, {});
const autoDawnCycleCreated = await payload(await autoDawnCycleRoom.fetch(makeRequest('/internal/create', 'POST', {
  code: 'SYSDWN',
  name: 'System Dawn Host',
  settings: {
    moderatorMode: 'system',
    roleCounts: {
      wolf: 1, alpha_wolf: 0, seer: 0, doctor: 0, bodyguard: 0, witch: 0,
      hunter: 1, reviver: 0, cupid: 0, guardian_angel: 0, detective: 0,
      mayor: 0, jester: 0, priest: 0, vigilante: 0, mason: 0, villager: 2, moderator: 0
    },
    timers: {
      roleDrawSeconds: 5, nightSeconds: 10, dawnSeconds: 5,
      discussionSeconds: 5, votingSeconds: 5, resultSeconds: 3
    }
  }
})), 201);
const autoDawnCycleTokens = [autoDawnCycleCreated.token];
for (const name of ['System Wolf', 'System Hunter', 'System Villager']) {
  const joined = await payload(await autoDawnCycleRoom.fetch(makeRequest('/internal/join', 'POST', { name })), 201);
  autoDawnCycleTokens.push(joined.token);
}
await payload(await autoDawnCycleRoom.fetch(makeRequest('/internal/action', 'POST', {
  type: 'start_game'
}, autoDawnCycleCreated.token)));
let autoDawnCycleState = await autoDawnCycleRoom.loadRoom();
autoDawnCycleState.players.forEach((player, index) => {
  player.role = ['villager', 'wolf', 'hunter', 'villager'][index];
  player.alive = true;
  player.hasDrawn = false;
  player.hunterUsed = false;
  player.reviverUsed = false;
});
await autoDawnCycleRoom.saveRoom(autoDawnCycleState);

// Leave the host's card closed to verify that the server starts night at the card deadline.
for (const token of autoDawnCycleTokens.slice(1)) {
  await payload(await autoDawnCycleRoom.fetch(makeRequest('/internal/action', 'POST', {
    type: 'draw_card'
  }, token)));
}
autoDawnCycleState = await autoDawnCycleRoom.loadRoom();
assert.equal(autoDawnCycleState.phase, 'role_draw');
const autoDawnCycleCardDeadline = autoDawnCycleState.roleDrawEndsAt;
const realNowForAutoDawnCards = Date.now;
try { Date.now = () => autoDawnCycleCardDeadline + 1; await autoDawnCycleRoom.alarm(); }
finally { Date.now = realNowForAutoDawnCards; }
autoDawnCycleState = await autoDawnCycleRoom.loadRoom();
assert.equal(autoDawnCycleState.phase, 'night',
  'System moderator must start night automatically when the card timer expires.');
await payload(await autoDawnCycleRoom.fetch(makeRequest('/internal/action', 'POST', {
  type: 'draw_card'
}, autoDawnCycleTokens[0])));

autoDawnCycleState = await autoDawnCycleRoom.loadRoom();
const autoDawnCycleHunterId = autoDawnCycleState.players[2].id;
await payload(await autoDawnCycleRoom.fetch(makeRequest('/internal/action', 'POST', {
  type: 'night_action', targetId: autoDawnCycleHunterId
}, autoDawnCycleTokens[1])));
await submitVillagerMath(autoDawnCycleRoom, autoDawnCycleTokens[0]);
await submitVillagerMath(autoDawnCycleRoom, autoDawnCycleTokens[2]);
await submitVillagerMath(autoDawnCycleRoom, autoDawnCycleTokens[3]);
autoDawnCycleState = await autoDawnCycleRoom.loadRoom();
const autoDawnCycleNightDeadline = autoDawnCycleState.nightEndsAt;
const realNowForAutoDawnNight = Date.now;
try { Date.now = () => autoDawnCycleNightDeadline + 1; await autoDawnCycleRoom.alarm(); }
finally { Date.now = realNowForAutoDawnNight; }
autoDawnCycleState = await autoDawnCycleRoom.loadRoom();
assert.equal(autoDawnCycleState.phase, 'dawn',
  'A Hunter killed at night must open the dawn phase in System mode.');
assert.equal(autoDawnCycleState.players[2].alive, false);
const autoDawnCycleView = (await payload(await autoDawnCycleRoom.fetch(
  makeRequest('/internal/state', 'GET', undefined, autoDawnCycleTokens[2])
))).state;
assert.equal(autoDawnCycleView.room.dawnActionsRequired, 1);

const autoDawnCycleDeadline = autoDawnCycleState.dawnEndsAt;
const realNowForAutoDawnTrigger = Date.now;
try { Date.now = () => autoDawnCycleDeadline + 1; await autoDawnCycleRoom.alarm(); }
finally { Date.now = realNowForAutoDawnTrigger; }
autoDawnCycleState = await autoDawnCycleRoom.loadRoom();
assert.equal(autoDawnCycleState.phase, 'morning',
  'System moderator must resolve the dawn trigger window automatically.');

const autoDawnCycleDiscussionDeadline = autoDawnCycleState.discussionEndsAt;
const realNowForAutoDawnMorning = Date.now;
try { Date.now = () => autoDawnCycleDiscussionDeadline + 1; await autoDawnCycleRoom.alarm(); }
finally { Date.now = realNowForAutoDawnMorning; }
autoDawnCycleState = await autoDawnCycleRoom.loadRoom();
assert.equal(autoDawnCycleState.phase, 'voting',
  'System moderator must open afternoon voting automatically after morning discussion.');

const autoDawnCycleVotingDeadline = autoDawnCycleState.votingEndsAt;
const realNowForAutoDawnVoting = Date.now;
try { Date.now = () => autoDawnCycleVotingDeadline + 1; await autoDawnCycleRoom.alarm(); }
finally { Date.now = realNowForAutoDawnVoting; }
autoDawnCycleState = await autoDawnCycleRoom.loadRoom();
assert.equal(autoDawnCycleState.phase, 'result',
  'System moderator must close voting and publish the result automatically.');

const autoDawnCycleResultDeadline = autoDawnCycleState.resultEndsAt;
const realNowForAutoDawnResult = Date.now;
try { Date.now = () => autoDawnCycleResultDeadline + 1; await autoDawnCycleRoom.alarm(); }
finally { Date.now = realNowForAutoDawnResult; }
autoDawnCycleState = await autoDawnCycleRoom.loadRoom();
assert.equal(autoDawnCycleState.phase, 'night');
assert.equal(autoDawnCycleState.round, 2,
  'System moderator must automatically start the next night after the result window.');

  
// Werewolf parity counts every living non-Werewolf, including neutral players.
const parityRoom = new WerewolfRoom({ storage: new MemoryStorage(), getWebSockets: () => [] }, {});
const parityState = {
  players: [
    { id: 'parity-wolf-1', role: 'wolf', alive: true },
    { id: 'parity-wolf-2', role: 'alpha_wolf', alive: true },
    { id: 'parity-village-1', role: 'villager', alive: true },
    { id: 'parity-village-2', role: 'jester', alive: true },
    { id: 'parity-neutral', role: 'guardian_angel', alive: true }
  ],
  lovers: [], winner: null, settings: { abilities: {} }, guardianTargets: {}
};
assert.equal(parityRoom.checkWinner(parityState), null,
  'Two Werewolves must not win while three non-Werewolf players remain, including a neutral player.');
parityState.players.find(player => player.id === 'parity-village-2').alive = false;
assert.equal(parityRoom.checkWinner(parityState), 'wolves',
  'Werewolves win at parity once only two non-Werewolf players remain.');
console.log('Werewolf parity regression passed: neutral players count toward the remaining opposition.');

// Jester is a Village faction role but wins alone when voted out by an absolute majority.
const jesterRoom = new WerewolfRoom({ storage: new MemoryStorage(), getWebSockets: () => [] }, {});
const jesterState = {
  code: 'JEST23', phase: 'voting', round: 3,
  players: [
    { id: 'jester-wolf', name: 'Red Player', role: 'wolf', alive: true },
    { id: 'jester-target', name: 'Odd Villager', role: 'jester', alive: true },
    { id: 'jester-village', name: 'Blue Player', role: 'villager', alive: true }
  ],
  votes: { 'jester-wolf': 'jester-target', 'jester-target': 'jester-wolf', 'jester-village': 'jester-target' },
  settings: { abilities: { jesterSoloWin: true }, timers: { resultSeconds: 8 } },
  lovers: [], additionalWinners: [], guardianTargets: {}, nightActions: {}, dawnActions: {},
  resultActions: {}, seerResults: {}, seerHistory: {}, gameHistory: [], gameArchive: [],
  winner: null, gameFinishedRecorded: false, round: 3
};
jesterRoom.finishVote(jesterState, Date.now());
assert.equal(jesterState.winner, 'jester');
assert.equal(jesterState.phase, 'finished');
assert.equal(jesterState.players.find(player => player.role === 'jester').alive, false);
jesterRoom.archiveCompletedGame(jesterState, Date.now());
const jesterArchivePlayer = jesterState.gameArchive[0].players.find(player => player.role === 'jester');
assert.equal(jesterArchivePlayer.faction, 'village');
assert.equal(jesterArchivePlayer.isWinner, true);
assert.equal(jesterArchivePlayer.winReason, 'Pemenang utama');
console.log('Werewolf Penduduk Aneh regression passed: Jester is Village-aligned and wins alone when voted out.');

// Trapper saves the attacked target and catches one Werewolf attacker.
const trapperRoom = new WerewolfRoom({ storage: new MemoryStorage(), getWebSockets: () => [] }, {});
const trapperCreated = await payload(await trapperRoom.fetch(makeRequest('/internal/create', 'POST', {
  code: 'TRAP23', name: 'Trapper Moderator',
  settings: { roleCounts: { wolf: 1, trapper: 1, villager: 2 } }
})), 201);
const trapperTokens = [];
for (const name of ['Trapper Wolf', 'Village Trapper', 'Village One', 'Village Two']) {
  trapperTokens.push((await payload(await trapperRoom.fetch(makeRequest('/internal/join', 'POST', { name })), 201)).token);
}
await payload(await trapperRoom.fetch(makeRequest('/internal/action', 'POST', {
  type: 'start_game'
}, trapperCreated.token)));
let trapperState = await trapperRoom.loadRoom();
trapperState.players.forEach((player, index) => {
  player.role = ['wolf', 'trapper', 'villager', 'villager'][index];
  player.alive = true;
  player.hasDrawn = true;
});
await trapperRoom.saveRoom(trapperState);
await payload(await trapperRoom.fetch(makeRequest('/internal/action', 'POST', {
  type: 'start_night'
}, trapperCreated.token)));
trapperState = await trapperRoom.loadRoom();
const trapperTargetId = trapperState.players[2].id;
await payload(await trapperRoom.fetch(makeRequest('/internal/action', 'POST', {
  type: 'night_action', targetId: trapperTargetId
}, trapperTokens[0])));
await payload(await trapperRoom.fetch(makeRequest('/internal/action', 'POST', {
  type: 'night_action', targetId: trapperTargetId
}, trapperTokens[1])));
await submitVillagerMath(trapperRoom, trapperTokens[2]);
await submitVillagerMath(trapperRoom, trapperTokens[3]);
await actionAfterDeadline(trapperRoom, trapperCreated.token, 'resolve_night', { force: true });
trapperState = await trapperRoom.loadRoom();
assert.equal(trapperState.players.find(player => player.role === 'wolf').alive, false,
  'The Werewolf who selected the trapped target must be caught.');
assert.equal(trapperState.players.find(player => player.role === 'villager' && player.id === trapperTargetId).alive, true,
  'The trapped target must survive the pack attack.');
assert.equal(trapperState.lastResult.eliminations.find(item => item.role === 'wolf')?.cause, 'trapper_capture');
assert.ok(trapperState.lastResult.events.some(event => /Perangkap Trapper menangkap/.test(event)),
  'The public night report must explain that the trap caught the attacker and saved the target.');
assert.ok(trapperState.lastResult.actionReport.some(item => item.role === 'Trapper' && /Perangkap aktif/.test(item.outcome)));
console.log('Werewolf Trapper regression passed: a successful trap saves the target and eliminates an attacker.');

// Wolf Seer joins the pack attack and privately learns one target's exact role.
const wolfSeerRoom = new WerewolfRoom({ storage: new MemoryStorage(), getWebSockets: () => [] }, {});
const wolfSeerCreated = await payload(await wolfSeerRoom.fetch(makeRequest('/internal/create', 'POST', {
  code: 'WSEA23', name: 'Wolf Seer Moderator',
  settings: { roleCounts: { wolf: 1, wolf_seer: 1, villager: 2 } }
})), 201);
const wolfSeerTokens = [];
for (const name of ['Wolf Seer', 'Wolf Mate', 'Attack Target', 'Intel Target']) {
  wolfSeerTokens.push((await payload(await wolfSeerRoom.fetch(makeRequest('/internal/join', 'POST', { name })), 201)).token);
}
await payload(await wolfSeerRoom.fetch(makeRequest('/internal/action', 'POST', {
  type: 'start_game'
}, wolfSeerCreated.token)));
let wolfSeerState = await wolfSeerRoom.loadRoom();
wolfSeerState.players.forEach((player, index) => {
  player.role = ['wolf_seer', 'wolf', 'villager', 'villager'][index];
  player.alive = true;
  player.hasDrawn = true;
});
await wolfSeerRoom.saveRoom(wolfSeerState);
await payload(await wolfSeerRoom.fetch(makeRequest('/internal/action', 'POST', {
  type: 'start_night'
}, wolfSeerCreated.token)));
wolfSeerState = await wolfSeerRoom.loadRoom();
await payload(await wolfSeerRoom.fetch(makeRequest('/internal/action', 'POST', {
  type: 'night_action',
  targetId: wolfSeerState.players[2].id,
  inspectTargetId: wolfSeerState.players[3].id
}, wolfSeerTokens[0])));
await payload(await wolfSeerRoom.fetch(makeRequest('/internal/action', 'POST', {
  type: 'night_action', targetId: wolfSeerState.players[2].id
}, wolfSeerTokens[1])));
const wolfSeerNightView = (await payload(await wolfSeerRoom.fetch(
  makeRequest('/internal/state', 'GET', undefined, wolfSeerTokens[0])
))).state;
assert.equal(wolfSeerNightView.self.wolfSeerInspectTargetId, wolfSeerState.players[3].id,
  'The Wolf Seer inspection choice must be visible to its owner while night actions remain open.');
await submitVillagerMath(wolfSeerRoom, wolfSeerTokens[2]);
await submitVillagerMath(wolfSeerRoom, wolfSeerTokens[3]);
await actionAfterDeadline(wolfSeerRoom, wolfSeerCreated.token, 'resolve_night', { force: true });
wolfSeerState = await wolfSeerRoom.loadRoom();
const wolfSeerPrivateView = (await payload(await wolfSeerRoom.fetch(
  makeRequest('/internal/state', 'GET', undefined, wolfSeerTokens[0])
))).state;
assert.equal(wolfSeerPrivateView.self.seerResult.targetRole, 'villager');
assert.equal(wolfSeerPrivateView.self.seerHistory.length, 1);
const wolfMatePrivateView = (await payload(await wolfSeerRoom.fetch(
  makeRequest('/internal/state', 'GET', undefined, wolfSeerTokens[1])
))).state;
assert.equal(wolfMatePrivateView.self.seerResult, null,
  'The exact role inspection must remain private to the Wolf Seer.');
assert.deepEqual(wolfMatePrivateView.self.seerHistory, []);

assert.ok(wolfSeerState.lastResult.actionReport.some(item => item.role === 'Wolf Seer'));
console.log('Werewolf Wolf Seer regression passed: combined pack vote, exact private inspection, and role secrecy.');

const soloWolfSeerRoom = new WerewolfRoom({ storage: new MemoryStorage(), getWebSockets: () => [] }, {});
const soloWolfSeerCreated = await payload(await soloWolfSeerRoom.fetch(makeRequest('/internal/create', 'POST', {
  code: 'WSXL23', name: 'Solo Wolf Seer Host',
  settings: { roleCounts: { wolf_seer: 1, villager: 3 } }
})), 201);
for (const name of ['Solo Seer', 'Village A', 'Village B', 'Village C']) {
  await payload(await soloWolfSeerRoom.fetch(makeRequest('/internal/join', 'POST', { name })), 201);
}
await payload(await soloWolfSeerRoom.fetch(makeRequest('/internal/action', 'POST', {
  type: 'start_game'
}, soloWolfSeerCreated.token)));
const soloWolfSeerState = await soloWolfSeerRoom.loadRoom();
assert.equal(soloWolfSeerState.phase, 'role_draw');
assert.equal(soloWolfSeerState.players.filter(player => player.role === 'wolf_seer').length, 1,
  'Wolf Seer alone must satisfy the minimum Werewolf faction requirement.');


// Bots must perform the new roles' special actions rather than fall back to arithmetic.
const newRoleBotRoom = new WerewolfRoom({ storage: new MemoryStorage(), getWebSockets: () => [] }, {});
const botWolfSeer = newRoleBotRoom.makeBot({ players: [] });
botWolfSeer.role = 'wolf_seer';
const botTrapper = newRoleBotRoom.makeBot({ players: [botWolfSeer] });
botTrapper.role = 'trapper';
const botPracticeVillager = { id: 'bot-practice-villager', name: 'Practice Villager', role: 'villager', alive: true };
const newRoleBotState = {
  players: [botWolfSeer, botTrapper, botPracticeVillager],
  nightActions: {}, seerHistory: {}, seerResults: {}, witchPotions: {},
  guardianTargets: {}, villagerPrompts: {}, round: 1, settings: { abilities: {} }
};
newRoleBotRoom.runBotNightActions(newRoleBotState);
assert.equal(newRoleBotState.nightActions[botWolfSeer.id].type, 'wolf_vote');
assert.ok(newRoleBotState.nightActions[botWolfSeer.id].targetId);
assert.ok(newRoleBotState.nightActions[botWolfSeer.id].inspectTargetId);
assert.equal(newRoleBotState.nightActions[botTrapper.id].type, 'trapper_set');
assert.ok(newRoleBotState.nightActions[botTrapper.id].targetId);
console.log('Werewolf new-role bot regression passed: Wolf Seer and Trapper use their special abilities.');

  
// Public role board reveals deck composition and dead roles without exposing living identities.
const publicBoardRoom = new WerewolfRoom({ storage: new MemoryStorage(), getWebSockets: () => [] }, {});
const publicBoardState = {
  code: 'PUB123', phase: 'voting', round: 2, hostId: 'pub-wolf',
  activeModeratorId: 'pub-mod', moderator: { id: 'pub-mod', name: 'Moderator' },
  settings: { abilities: {}, timers: {}, revealRoleOnDeath: true, roleCounts: {} },
  players: [
    { id: 'pub-wolf', name: 'Red Player', role: 'wolf', alive: true, hasDrawn: true, isBot: false, isBotControlled: false, voiceMode: 'online' },
    { id: 'pub-jester', name: 'Blue Player', role: 'jester', alive: true, hasDrawn: true, isBot: false, isBotControlled: false, voiceMode: 'online' },
    { id: 'pub-dead', name: 'Fallen Seer', role: 'seer', alive: false, hasDrawn: true, isBot: false, isBotControlled: false, voiceMode: 'online' }
  ],
  waitingPlayers: [], votes: { 'pub-wolf': 'pub-jester', 'pub-jester': null },
  nightActions: {}, dawnActions: {}, resultActions: {}, lovers: [], additionalWinners: [],
  guardianTargets: {}, seerHistory: {}, seerResults: {}, gameHistory: [], gameArchive: [],
  gameHistoryTruncated: 0, winner: null, lastResult: { kind: 'phase', message: 'Voting berjalan.' },
  gameFinishedRecorded: false, expiresAt: Date.now() + 60000
};
const publicBoard = publicBoardRoom.snapshot(publicBoardState, 'pub-wolf');
assert.equal(publicBoard.publicPlayers.find(item => item.id === 'pub-wolf').revealedRole, null);
assert.equal(publicBoard.publicPlayers.find(item => item.id === 'pub-dead').revealedRole, 'seer');
assert.equal(publicBoard.publicRoles.find(item => item.role === 'jester').faction, 'village');
assert.deepEqual(publicBoard.publicVotes.map(item => item.status), ['Memilih Blue Player', 'Golput']);
publicBoardState.settings.revealRoleOnDeath = false;
const hiddenDeathRoleBoard = publicBoardRoom.snapshot(publicBoardState, 'pub-wolf');
assert.equal(hiddenDeathRoleBoard.publicPlayers.find(item => item.id === 'pub-dead').revealedRole, null);
assert.deepEqual(hiddenDeathRoleBoard.publicRoles.find(item => item.role === 'seer').deceasedNames, []);
console.log('Werewolf public board regression passed: role composition, death reveal option, and public ballots.');

// The BOT takes over when a player misses the card reveal or night action deadline.
const inactivityRoom = new WerewolfRoom({ storage: new MemoryStorage(), getWebSockets: () => [] }, {});
const inactivityNow = Date.now();
const unopenedCardPlayer = {
  id: 'inactive-card', name: 'Missed Card', role: 'villager', alive: true,
  hasDrawn: false, isBot: false, isBotControlled: false
};
const cardTakeoverState = {
  phase: 'role_draw', round: 1, players: [unopenedCardPlayer], gameHistory: [], gameHistoryTruncated: 0
};
inactivityRoom.takeOverInactivePlayers(cardTakeoverState, [unopenedCardPlayer], 'role_draw', inactivityNow);
assert.equal(unopenedCardPlayer.isBot, true);
assert.equal(unopenedCardPlayer.isBotControlled, true);
assert.equal(unopenedCardPlayer.hasDrawn, true);
const inactiveNightPlayer = {
  id: 'inactive-night', name: 'Missed Night Action', role: 'villager', alive: true,
  isBot: false, isBotControlled: false
};
const nightTakeoverState = {
  phase: 'night', round: 1, players: [inactiveNightPlayer], nightActions: {},
  villagerPrompts: { 'inactive-night': { id: 'math-1', options: [1, 2, 3, 4], answer: 3 } },
  seerHistory: {}, seerResults: {}, witchPotions: {}, guardianTargets: {},
  settings: { abilities: {} }, gameHistory: [], gameHistoryTruncated: 0
};
inactivityRoom.takeOverInactivePlayers(nightTakeoverState, [inactiveNightPlayer], 'night', inactivityNow);
inactivityRoom.runBotNightActions(nightTakeoverState);
assert.equal(nightTakeoverState.nightActions['inactive-night'].type, 'villager_math');
console.log('Werewolf inactivity regression passed: BOT takes over missed card reveals and night actions.');

// Voting deadline takeover creates a ballot and keeps the complete public vote record.
const voteTakeoverRoom = new WerewolfRoom({ storage: new MemoryStorage(), getWebSockets: () => [] }, {});
const voteTakeoverState = {
  code: 'BOTV23', phase: 'voting', round: 1, hostId: 'vote-wolf',
  players: [
    { id: 'vote-wolf', name: 'Red Player', role: 'wolf', alive: true, isBot: false, isBotControlled: false },
    { id: 'vote-village-a', name: 'Blue A', role: 'villager', alive: true, isBot: false, isBotControlled: false },
    { id: 'vote-village-b', name: 'Blue B', role: 'villager', alive: true, isBot: false, isBotControlled: false },
    { id: 'vote-village-c', name: 'Blue C', role: 'villager', alive: true, isBot: false, isBotControlled: false }
  ],
  votes: { 'vote-wolf': 'vote-village-a', 'vote-village-a': null, 'vote-village-c': null },
  nightActions: {}, dawnActions: {}, resultActions: {}, lovers: [], additionalWinners: [],
  guardianTargets: {}, seerResults: {}, seerHistory: {}, settings: { abilities: {}, timers: { resultSeconds: 8 } },
  gameHistory: [], gameArchive: [], gameHistoryTruncated: 0, gameFinishedRecorded: false,
  gameId: 'vote-takeover-test', expiresAt: Date.now() + 60000, winner: null
};
voteTakeoverRoom.finishVote(voteTakeoverState, inactivityNow);
const botVoter = voteTakeoverState.players.find(item => item.id === 'vote-village-b');
assert.equal(botVoter.isBotControlled, true);
assert.equal(botVoter.isBot, true);
assert.ok(Object.prototype.hasOwnProperty.call(voteTakeoverState.votes, botVoter.id));
assert.equal(voteTakeoverState.lastResult.publicVotes.length, 4);
assert.ok(voteTakeoverState.lastResult.publicVotes.find(item => item.voterId === botVoter.id).hasVoted);
console.log('Werewolf voting takeover regression passed: missed voters are replaced and ballots stay public.');

  
// A player can choose "Kembali Bermain" and regain their own account without moderator intervention.
const selfRestoreRoom = new WerewolfRoom({ storage: new MemoryStorage(), getWebSockets: () => [] }, {});
const selfRestoreCreated = await payload(await selfRestoreRoom.fetch(makeRequest('/internal/create', 'POST', {
  code: 'SELF23', name: 'Restore Host'
})), 201);
const selfRestoreOne = await payload(await selfRestoreRoom.fetch(makeRequest('/internal/join', 'POST', { name: 'Returning Player' })), 201);
const selfRestoreTwo = await payload(await selfRestoreRoom.fetch(makeRequest('/internal/join', 'POST', { name: 'Other Player' })), 201);
let selfRestoreState = await selfRestoreRoom.loadRoom();
const returningPlayer = selfRestoreState.players.find(item => item.id === selfRestoreOne.playerId);
const otherPlayer = selfRestoreState.players.find(item => item.id === selfRestoreTwo.playerId);
returningPlayer.role = 'villager';
returningPlayer.alive = true;
returningPlayer.hasDrawn = true;
returningPlayer.isBot = true;
returningPlayer.isBotControlled = true;
selfRestoreState.phase = 'voting';
selfRestoreState.votingEndsAt = Date.now() + 30000;
selfRestoreState.votes = { [returningPlayer.id]: otherPlayer.id };
selfRestoreState.gameHistory = selfRestoreState.gameHistory || [];
selfRestoreState.gameHistoryTruncated = Number(selfRestoreState.gameHistoryTruncated) || 0;
await selfRestoreRoom.saveRoom(selfRestoreState);
const returningToken = selfRestoreOne.token;
await payload(await selfRestoreRoom.fetch(makeRequest('/internal/action', 'POST', {
  type: 'restore_player_control'
}, returningToken)), 200);
selfRestoreState = await selfRestoreRoom.loadRoom();
const restoredPlayer = selfRestoreState.players.find(item => item.id === returningPlayer.id);
assert.equal(restoredPlayer.isBotControlled, false);
assert.equal(restoredPlayer.isBot, false);
assert.equal(Object.prototype.hasOwnProperty.call(selfRestoreState.votes, returningPlayer.id), false,
  'A restored player must be allowed to replace the BOT vote before the voting deadline.');
console.log('Werewolf player restore regression passed: self-service takeover recovery restores the player and removes the BOT ballot.');



  
// Manual moderator rooms also run the inactivity handoff alarm without advancing the phase.
const manualTakeoverRoom = new WerewolfRoom({ storage: new MemoryStorage(), getWebSockets: () => [] }, {});
const manualTakeoverCreated = await payload(await manualTakeoverRoom.fetch(makeRequest('/internal/create', 'POST', {
  code: 'MANU23', name: 'Manual Host',
  settings: { moderatorMode: 'host', roleCounts: { wolf: 1, villager: 2 }, timers: { nightSeconds: 10 } }
})), 201);
const manualTakeoverTokens = [];
for (const name of ['Manual Wolf', 'Manual Blue A', 'Manual Blue B']) {
  manualTakeoverTokens.push((await payload(await manualTakeoverRoom.fetch(
    makeRequest('/internal/join', 'POST', { name })
  ), 201)).token);
}
await payload(await manualTakeoverRoom.fetch(makeRequest('/internal/action', 'POST', {
  type: 'start_game'
}, manualTakeoverCreated.token)));
let manualTakeoverState = await manualTakeoverRoom.loadRoom();
manualTakeoverState.players.forEach((player, index) => {
  player.role = ['wolf', 'villager', 'villager'][index];
  player.alive = true;
  player.hasDrawn = true;
});
await manualTakeoverRoom.saveRoom(manualTakeoverState);
await payload(await manualTakeoverRoom.fetch(makeRequest('/internal/action', 'POST', {
  type: 'start_night'
}, manualTakeoverCreated.token)));
manualTakeoverState = await manualTakeoverRoom.loadRoom();
manualTakeoverState.nightEndsAt = Date.now() - 1;
await manualTakeoverRoom.saveRoom(manualTakeoverState);
const realNowForManualTakeover = Date.now;
try {
  Date.now = () => manualTakeoverState.nightEndsAt + 1;
  await manualTakeoverRoom.alarm();
} finally {
  Date.now = realNowForManualTakeover;
}
manualTakeoverState = await manualTakeoverRoom.loadRoom();
assert.equal(manualTakeoverState.phase, 'night',
  'Manual moderator mode keeps control of phase progression after the deadline.');
assert.ok(manualTakeoverState.players.every(player => player.isBotControlled),
  'Every player who missed the night deadline must be handed to BOT.');
assert.ok(manualTakeoverState.players.every(player => manualTakeoverState.nightActions[player.id]),
  'BOT must complete every missed night action before the moderator advances.');
console.log('Werewolf manual-mode takeover regression passed: timer handoff runs BOT actions without advancing the moderator phase.');

// The voting deadline automatically replaces non-voters and preserves every public ballot.
const voteTakeoverRoom = new WerewolfRoom({ storage: new MemoryStorage(), getWebSockets: () => [] }, {});
const voteTakeoverState = {
  code: 'BOTV23', phase: 'voting', round: 1, hostId: 'vote-wolf',
  players: [
    { id: 'vote-wolf', name: 'Red Player', role: 'wolf', alive: true, isBot: false, isBotControlled: false },
    { id: 'vote-village-a', name: 'Blue A', role: 'villager', alive: true, isBot: false, isBotControlled: false },
    { id: 'vote-village-b', name: 'Blue B', role: 'villager', alive: true, isBot: false, isBotControlled: false },
    { id: 'vote-village-c', name: 'Blue C', role: 'villager', alive: true, isBot: false, isBotControlled: false }
  ],
  votes: { 'vote-wolf': 'vote-village-a', 'vote-village-a': null, 'vote-village-c': null },
  nightActions: {}, dawnActions: {}, resultActions: {}, lovers: [], additionalWinners: [],
  guardianTargets: {}, seerResults: {}, seerHistory: {}, settings: { abilities: {}, timers: { resultSeconds: 8 } },
  gameHistory: [], gameArchive: [], gameHistoryTruncated: 0, gameFinishedRecorded: false,
  gameId: 'vote-takeover-test', expiresAt: Date.now() + 60000, winner: null
};
voteTakeoverRoom.finishVote(voteTakeoverState, inactivityNow);
const botVoter = voteTakeoverState.players.find(item => item.id === 'vote-village-b');
assert.equal(botVoter.isBotControlled, true);
assert.equal(botVoter.isBot, true);
assert.ok(Object.prototype.hasOwnProperty.call(voteTakeoverState.votes, botVoter.id));
assert.equal(voteTakeoverState.lastResult.publicVotes.length, 4);
assert.ok(voteTakeoverState.lastResult.publicVotes.find(item => item.voterId === botVoter.id).hasVoted);
console.log('Werewolf voting takeover regression passed: missed voters are replaced and their ballots remain visible.');


console.log('Werewolf System automation passed: card reveal, night, triggered dawn, morning discussion, afternoon voting and next round.');
