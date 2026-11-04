import assert from 'node:assert/strict';
import worker, { WerewolfRoom } from '../cloudflare/werewolf-worker/src/index.js';

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

const storage = new MemoryStorage();
const room = new WerewolfRoom({ storage, getWebSockets: () => [] }, {
  ALLOWED_ORIGINS: 'https://irvan1609.github.io'
});
const created = await payload(await room.fetch(makeRequest('/internal/create', 'POST', {
  code: 'WALF23', name: 'Moderator',
  settings: { wolves: 1, seer: true, doctor: true }
})), 201);
assert.ok(created.moderatorId);
let saved = await room.loadRoom();
assert.equal(saved.players.length, 0);
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
  { type: 'night_action', targetId: saved.players[3].id },
  { type: 'night_pass' },
  { type: 'night_pass' }
];
for (let i = 0; i < playerTokens.length; i += 1) {
  await payload(await room.fetch(makeRequest('/internal/action', 'POST', nightActions[i], playerTokens[i])));
}
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
assert.match(morningModerator.room.lastResult.message, /Doctor/);
assert.equal(morningModerator.players[0].role, 'wolf');
const morningPlayer = (await payload(await room.fetch(
  makeRequest('/internal/state', 'GET', undefined, playerTokens[3])
))).state;
assert.equal(morningPlayer.room.lastResult, null);
assert.equal(morningPlayer.players.length, 0);
assert.equal(morningPlayer.self.status, 'survived');
assert.ok(morningPlayer.targets.every(target => target.name && target.id));

await payload(await room.fetch(makeRequest('/internal/action', 'POST', { type: 'start_discussion' }, moderatorToken)));
saved = await room.loadRoom();
assert.equal(saved.phase, 'discussion');
assert.equal(saved.discussionEndsAt, null);
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
console.log('Werewolf moderator flow checks passed: separate moderator, private cards, manual night/morning/discussion/voting transitions, and player-only action snapshots.');

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
await payload(await soloRoom.fetch(makeRequest('/internal/action', 'POST', { type: 'start_discussion' }, soloToken)));
await payload(await soloRoom.fetch(makeRequest('/internal/action', 'POST', { type: 'start_voting' }, soloToken)));
soloState = await soloRoom.loadRoom();
assert.equal(soloState.phase, 'voting');
assert.equal(Object.keys(soloState.votes).length, 5);
await payload(await soloRoom.fetch(makeRequest('/internal/action', 'POST', { type: 'resolve_vote' }, soloToken)));
soloState = await soloRoom.loadRoom();
assert.ok(['result', 'finished'].includes(soloState.phase));
console.log('Werewolf solo-bot checks passed: bots auto-complete night actions and votes while moderator controls every transition.');

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
