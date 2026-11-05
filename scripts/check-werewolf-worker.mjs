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
assert.ok(nightProgress.room.nightRevealEndsAt > Date.now());
const seerNightReveal = (await payload(await room.fetch(
  makeRequest('/internal/state', 'GET', undefined, playerTokens[1])
))).state;
assert.equal(seerNightReveal.room.phase, 'night');
assert.equal(seerNightReveal.self.seerResult.playerName, 'Alya');
assert.equal(seerNightReveal.self.seerResult.result, 'wolf',
  'Seer must receive the private result as soon as all night actions are complete.');
const nonSeerNightView = (await payload(await room.fetch(
  makeRequest('/internal/state', 'GET', undefined, playerTokens[3])
))).state;
assert.equal(nonSeerNightView.self.seerResult, null, 'Seer inspection must stay private.');
const realNowAfterNight = Date.now;
try {
  Date.now = () => nightProgress.room.nightRevealEndsAt + 1;
  await room.alarm();
} finally {
  Date.now = realNowAfterNight;
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
assert.equal(seerMorning.self.seerResult.playerName, 'Alya');
assert.equal(seerMorning.self.seerResult.result, 'wolf');
assert.equal(seerMorning.self.seerResult.round, 1);
assert.ok(seerMorning.room.revision > 0);

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
  const targetIndex = i === 4 ? 3 : 4;
  await payload(await room.fetch(makeRequest('/internal/action', 'POST', {
    type: 'cast_vote', targetId: saved.players[targetIndex].id
  }, playerTokens[i])));
}
saved = await room.loadRoom();
assert.equal(saved.phase, 'voting'); // Votes never advance the phase automatically.
assert.equal(Object.keys(saved.votes).length, 5);
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
const voteResultPlayer = (await payload(await room.fetch(
  makeRequest('/internal/state', 'GET', undefined, playerTokens[4])
))).state;
assert.equal(voteResultPlayer.room.lastResult, null);
assert.equal(voteResultPlayer.self.status, 'eliminated');

await payload(await room.fetch(makeRequest('/internal/action', 'POST', { type: 'next_round' }, moderatorToken)));
assert.equal((await room.loadRoom()).phase, 'night');

// Repeated moderator-controlled rounds must not stop at an arbitrary night limit.
for (let expectedRound = 3; expectedRound <= 250; expectedRound += 1) {
  const current = await room.loadRoom();
  current.phase = 'result';
  current.winner = null;
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
await payload(await soloRoom.fetch(makeRequest('/internal/action', 'POST', { type: 'resolve_night', force: true }, soloToken)));
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
soloState.lastResult = {
  kind: 'night',
  message: 'Malam berlalu tanpa korban.',
  eliminatedId: null,
  at: Date.now(),
  round: 1
};
await soloRoom.saveRoom(soloState);
await payload(await soloRoom.fetch(makeRequest('/internal/action', 'POST', { type: 'start_discussion' }, soloToken)));
soloState = await soloRoom.loadRoom();
assert.equal(soloState.phase, 'discussion');
assert.equal(soloState.discussionMode, 'offline');
assert.equal(soloState.callUrl, '');
assert.equal(soloState.chat.length, 3);
assert.ok(soloState.chat.every(message =>
  soloState.players.some(player => player.id === message.playerId && player.isBot)
));
assert.ok(soloState.chat[0].text.includes(soloState.players[0].name));
const soloModeratorView = (await payload(await soloRoom.fetch(
  makeRequest('/internal/state', 'GET', undefined, soloToken)
))).state;
assert.equal(soloModeratorView.chat.length, 3);
assert.ok(soloModeratorView.chat.every(message => message.isBot));
const soloPlayerView = soloRoom.snapshot(soloState, soloState.players[0].id, 'player');
assert.deepEqual(soloPlayerView.chat, []);
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
assert.equal(systemState.phase, 'night', 'System moderator waits for the private Seer reveal window before morning.');
assert.ok(systemState.nightRevealEndsAt);
const realNowAfterSystemNight = Date.now;
try {
  Date.now = () => systemState.nightRevealEndsAt + 1;
  await systemRoom.alarm();
} finally {
  Date.now = realNowAfterSystemNight;
}
systemState = await systemRoom.loadRoom();
assert.equal(systemState.phase, 'morning', 'System moderator moves to morning automatically after the 10-second Seer reveal.');
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
assert.equal(systemState.phase, 'result', 'System moderator counts votes automatically after all living players vote.');
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
console.log('Werewolf system moderator checks passed: automatic night start, passive-role passes, automatic night resolution, public result parity, offline discussion, and automatic vote tally.');

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
await payload(await witchRoom.fetch(makeRequest('/internal/action', 'POST', { type: 'resolve_night', force: true }, witchCreated.token)));
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

await payload(await cupidNightRoom.fetch(makeRequest('/internal/action', 'POST', {
  type: 'resolve_night'
}, cupidNightCreated.token)));
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
await payload(await disabledRoom.fetch(makeRequest('/internal/action', 'POST', { type: 'night_pass' }, disabledTokens[1])));
assert.equal((await disabledRoom.loadRoom()).nightActions[disabledState.players[1].id].type, 'pass');
console.log('Werewolf configurable-role checks passed: role counts are validated and disabled abilities cannot be used.');

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
  seer: 3, doctor: 3, bodyguard: 4, witch: 4, hunter: 3,
  cupid: 1, detective: 3, mayor: 3, guardian_angel: 3, jester: 1
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
await payload(await tieRoom.fetch(makeRequest('/internal/action', 'POST', { type: 'resolve_night', force: true }, tieCreated.token)));
tieState = await tieRoom.loadRoom();
assert.equal(tieState.phase, 'finished', 'The winning faction must be announced immediately after night resolution.');
assert.equal(tieState.winner, 'wolves');
assert.equal([tieState.players[2], tieState.players[3]].filter(player => !player.alive).length, 1);
assert.match(tieState.lastResult.message, /tereliminasi pada malam hari/);
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
await payload(await partialWolfRoom.fetch(makeRequest('/internal/action', 'POST', {
  type: 'resolve_night', force: true
}, partialWolfCreated.token)));
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
await payload(await productionReplayRoom.fetch(makeRequest('/internal/action', 'POST', {
  type: 'resolve_night', force: true
}, productionReplayCreated.token)));
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
