import assert from 'node:assert/strict';
import worker, { WerewolfRoom, recommendedRoleCounts } from '../cloudflare/werewolf-worker/src/index.js';

class MemoryStorage {
  constructor() { this.values = new Map(); }
  async get(key) { return this.values.get(key); }
  async put(key, value) { this.values.set(key, structuredClone(value)); }
  async delete(key) { return this.values.delete(key); }
  async setAlarm(value) { this.alarmAt = value; }
  async deleteAll() { this.values.clear(); }
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
assert.equal(saved.players.length, 0);
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
assert.equal((await room.loadRoom()).players.length, 5);

const moderatorBeforeStart = (await payload(await room.fetch(
  makeRequest('/internal/state', 'GET', undefined, moderatorToken)
))).state;
assert.equal(moderatorBeforeStart.self.isModerator, true);
assert.equal(moderatorBeforeStart.players.length, 5);
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
await payload(await room.fetch(makeRequest('/internal/action', 'POST', { type: 'resolve_night' }, moderatorToken)));
saved = await room.loadRoom();
assert.equal(saved.phase, 'morning');
assert.equal(saved.players[3].alive, true); // Doctor protected the selected target.
const morningModerator = (await payload(await room.fetch(
  makeRequest('/internal/state', 'GET', undefined, moderatorToken)
))).state;
assert.match(morningModerator.room.lastResult.message, /perlindungan/);
assert.equal(morningModerator.players[0].role, 'wolf');
const morningPlayer = (await payload(await room.fetch(
  makeRequest('/internal/state', 'GET', undefined, playerTokens[3])
))).state;
assert.equal(morningPlayer.room.lastResult, null);
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

await payload(await room.fetch(makeRequest('/internal/action', 'POST', { type: 'start_discussion' }, moderatorToken)));
saved = await room.loadRoom();
assert.equal(saved.phase, 'discussion');
assert.equal(saved.discussionEndsAt, null);
assert.equal(saved.discussionMode, 'offline');
assert.equal(saved.callUrl, '');
await payload(await room.fetch(makeRequest('/internal/action', 'POST', {
  type: 'set_discussion', mode: 'online', callUrl: 'https://meet.google.com/test-room'
}, moderatorToken)), 400);
await payload(await room.fetch(makeRequest('/internal/action', 'POST', {
  type: 'set_discussion', mode: 'offline'
}, playerTokens[0])), 403);
await payload(await room.fetch(makeRequest('/internal/action', 'POST', {
  type: 'set_discussion', mode: 'offline'
}, moderatorToken)));
const offlineDiscussion = (await payload(await room.fetch(
  makeRequest('/internal/state', 'GET', undefined, playerTokens[0])
))).state;
assert.equal(offlineDiscussion.room.discussionMode, 'offline');
assert.equal(offlineDiscussion.room.callUrl, '');
await payload(await room.fetch(makeRequest('/internal/action', 'POST', { type: 'start_voting' }, playerTokens[0])), 403);
await payload(await room.fetch(makeRequest('/internal/action', 'POST', { type: 'start_voting' }, moderatorToken)));
saved = await room.loadRoom();
assert.equal(saved.phase, 'voting');

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
await payload(await room.fetch(makeRequest('/internal/action', 'POST', { type: 'resolve_vote' }, moderatorToken)));
saved = await room.loadRoom();
assert.equal(saved.phase, 'result');
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
assert.equal(soloState.players.length, 5);
assert.ok(soloState.players.every(player => player.isBot && !player.tokenHash));
await payload(await soloRoom.fetch(makeRequest('/internal/action', 'POST', { type: 'start_game' }, soloToken)));
soloState = await soloRoom.loadRoom();
assert.ok(soloState.players.every(player => player.hasDrawn));
await payload(await soloRoom.fetch(makeRequest('/internal/action', 'POST', { type: 'start_night' }, soloToken)));
soloState = await soloRoom.loadRoom();
assert.equal(Object.keys(soloState.nightActions).length, 5);
await payload(await soloRoom.fetch(makeRequest('/internal/action', 'POST', { type: 'resolve_night' }, soloToken)));
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
      mayor: 0, jester: 0, villager: 2, moderator: 1
    }
  }
})), 201);
const systemToken = systemCreated.token;
const systemTokens = [];
for (const name of ['Ari', 'Bela', 'Caca', 'Dika', 'Evan']) {
  const joined = await payload(await systemRoom.fetch(makeRequest('/internal/join', 'POST', { name })), 201);
  systemTokens.push(joined.token);
}
await payload(await systemRoom.fetch(makeRequest('/internal/action', 'POST', { type: 'start_game' }, systemToken)));
let systemState = await systemRoom.loadRoom();
assert.equal(systemState.settings.roleCounts.moderator, 1);
assert.equal(systemState.players.length, 5, 'Moderator mode must not consume a player role slot.');
systemState.players.forEach((player, index) => {
  player.role = ['wolf', 'seer', 'doctor', 'villager', 'villager'][index];
  player.hasDrawn = false;
});
await systemRoom.saveRoom(systemState);
for (const token of systemTokens) {
  await payload(await systemRoom.fetch(makeRequest('/internal/action', 'POST', { type: 'draw_card' }, token)));
}
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
systemState = await systemRoom.loadRoom();
assert.equal(systemState.phase, 'morning', 'System moderator resolves night after all active roles and Villager challenges finish.');
assert.match(systemState.lastResult.message, /perlindungan/);
await payload(await systemRoom.fetch(makeRequest('/internal/action', 'POST', { type: 'start_discussion' }, systemToken)));
systemState = await systemRoom.loadRoom();
assert.equal(systemState.discussionMode, 'offline');
await payload(await systemRoom.fetch(makeRequest('/internal/action', 'POST', { type: 'start_voting' }, systemToken)));
systemState = await systemRoom.loadRoom();
assert.equal(systemState.phase, 'voting');
for (let index = 0; index < systemTokens.length; index += 1) {
  const targetId = index === 3 ? systemState.players[4].id : systemState.players[3].id;
  await payload(await systemRoom.fetch(makeRequest('/internal/action', 'POST', {
    type: 'cast_vote', targetId
  }, systemTokens[index])));
}
systemState = await systemRoom.loadRoom();
assert.equal(systemState.phase, 'result', 'System moderator counts votes automatically after all living players vote.');
assert.equal(systemState.players[3].alive, false);
console.log('Werewolf system moderator checks passed: automatic night start, passive-role passes, automatic night resolution, offline discussion, and automatic vote tally.');

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
await payload(await witchRoom.fetch(makeRequest('/internal/action', 'POST', { type: 'resolve_night' }, witchCreated.token)));
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
assert.deepEqual(privateVoteView.wolfTeam, [witchNames[0]]);
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
assert.equal(largeState.players.length, 50);
assert.equal(largeState.players.filter(player => player.isBot).length, 25);
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
await payload(await tieRoom.fetch(makeRequest('/internal/action', 'POST', { type: 'resolve_night' }, tieCreated.token)));
tieState = await tieRoom.loadRoom();
assert.equal(tieState.phase, 'morning');
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
assert.equal((await leaveRoom.loadRoom()).players.length, 0);
await payload(await leaveRoom.fetch(makeRequest('/internal/join', 'POST', { name: 'Rejoin Me' })), 201);
assert.equal((await leaveRoom.loadRoom()).players.length, 1);
await payload(await leaveRoom.fetch(makeRequest('/internal/action', 'POST', { type: 'leave_room' }, leaveCreated.token)), 403);
console.log('Werewolf leave-room regression passed: lobby departures remove the player and release the name.');

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
await payload(await replayRoom.fetch(makeRequest('/internal/action', 'POST', { type: 'start_game' }, replayCreated.token)));
let replayState = await replayRoom.loadRoom();
assert.ok(['host', 'system'].includes(replayState.activeModeratorMode));
replayState.phase = 'finished';
replayState.winner = 'villagers';
replayState.lastResult = { kind: 'vote', message: 'Game selesai.' };
replayState.players.forEach(player => { player.role = 'villager'; player.alive = false; player.hasDrawn = true; });
await replayRoom.saveRoom(replayState);
const originalIds = replayState.players.map(player => player.id);
const originalHashes = replayState.players.map(player => player.tokenHash);
await payload(await replayRoom.fetch(makeRequest('/internal/action', 'POST', { type: 'reset_to_lobby' }, replayCreated.token)));
replayState = await replayRoom.loadRoom();
assert.equal(replayState.phase, 'lobby');
assert.equal(replayState.round, 0);
assert.equal(replayState.winner, null);
assert.equal(replayState.players.length, 5);
assert.deepEqual(replayState.players.map(player => player.id), originalIds);
assert.deepEqual(replayState.players.map(player => player.tokenHash), originalHashes);
assert.ok(replayState.players.every(player => player.role === null && player.alive && !player.hasDrawn));
const replayPlayerView = (await payload(await replayRoom.fetch(makeRequest('/internal/state', 'GET', undefined, replayTokens[0])))).state;
assert.equal(replayPlayerView.lobbyPlayers.length, 5);
assert.equal(replayPlayerView.players.length, 0, 'Lobby roster for players must not reveal roles.');
await payload(await replayRoom.fetch(makeRequest('/internal/action', 'POST', { type: 'start_game' }, replayCreated.token)));
assert.equal((await replayRoom.loadRoom()).phase, 'role_draw');
console.log('Werewolf persistent-room regression passed: reset returns the same players to the lobby and the next game starts in the same room.');

