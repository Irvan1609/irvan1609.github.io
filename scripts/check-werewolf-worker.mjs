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
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  });
}

async function payload(response) {
  const data = await response.json();
  assert.ok(response.status < 400, data.error || 'Unexpected response status ' + response.status);
  return data;
}

const storage = new MemoryStorage();
const state = { storage, getWebSockets: () => [] };
const room = new WerewolfRoom(state, { ALLOWED_ORIGINS: 'https://irvan1609.github.io' });

const created = await payload(await room.fetch(makeRequest('/internal/create', 'POST', {
  code: 'WALF23',
  name: 'Host',
  settings: { wolves: 1, seer: true, doctor: true }
})));
const tokens = [created.token];
const names = ['Alya', 'Bima', 'Citra', 'Doni'];
for (const name of names) {
  const joined = await payload(await room.fetch(makeRequest('/internal/join', 'POST', { name })));
  tokens.push(joined.token);
}
assert.equal((await room.loadRoom()).players.length, 5);

await payload(await room.fetch(makeRequest('/internal/action', 'POST', { type: 'start_game' }, tokens[0])));
const afterStart = await room.loadRoom();
assert.equal(afterStart.phase, 'role_draw');
assert.equal(afterStart.players.every(player => player.role), true);
for (const token of tokens) {
  const privateBeforeDraw = (await payload(await room.fetch(makeRequest('/internal/state', 'GET', undefined, token)))).state;
  assert.equal(privateBeforeDraw.self.role, null);
  assert.ok(privateBeforeDraw.players.every(player => !Object.prototype.hasOwnProperty.call(player, 'isWolf')));
  assert.ok(privateBeforeDraw.players.every(player => !Object.prototype.hasOwnProperty.call(player, 'hasActed')));
}

for (const token of tokens) await payload(await room.fetch(makeRequest('/internal/action', 'POST', { type: 'draw_card' }, token)));
await payload(await room.fetch(makeRequest('/internal/action', 'POST', { type: 'start_night' }, tokens[0])));
assert.equal((await room.loadRoom()).phase, 'night');

const stateByToken = [];
for (const token of tokens) {
  const response = await room.fetch(makeRequest('/internal/state', 'GET', undefined, token));
  stateByToken.push((await payload(response)).state);
}
assert.equal(stateByToken.every(snapshot => snapshot.players.every(player => !player.role || !player.alive || snapshot.room.phase === 'finished')), true);
assert.equal(stateByToken.every(snapshot => snapshot.self.role), true);
assert.ok(stateByToken.every(snapshot => snapshot.players.every(player => !Object.prototype.hasOwnProperty.call(player, 'hasActed'))));
for (const snapshot of stateByToken) {
  if (snapshot.self.role === 'wolf') assert.ok(snapshot.players.some(player => player.isWolf === true));
  else assert.ok(snapshot.players.every(player => !Object.prototype.hasOwnProperty.call(player, 'isWolf')));
}

const liveRoom = await room.loadRoom();
const actorIndexes = liveRoom.players.map((player, index) => ({ player, index }))
  .filter(item => ['wolf', 'seer', 'doctor'].includes(item.player.role));
for (const item of actorIndexes) {
  const target = liveRoom.players.find(candidate => candidate.alive && candidate.id !== item.player.id
    && (item.player.role !== 'wolf' || candidate.role !== 'wolf'));
  await payload(await room.fetch(makeRequest('/internal/action', 'POST', {
    type: 'night_action', targetId: target.id
  }, tokens[item.index])));
}
await payload(await room.fetch(makeRequest('/internal/action', 'POST', { type: 'resolve_night' }, tokens[0])));
const afterNight = await room.loadRoom();
assert.ok(['discussion', 'finished'].includes(afterNight.phase));
const seerIndex = afterNight.players.findIndex(player => player.role === 'seer');
if (seerIndex >= 0) {
  const seerSnapshot = (await payload(await room.fetch(makeRequest('/internal/state', 'GET', undefined, tokens[seerIndex])))).state;
  assert.ok(seerSnapshot.self.seerResult);
  for (let index = 0; index < tokens.length; index += 1) {
    if (index === seerIndex) continue;
    const otherSnapshot = (await payload(await room.fetch(makeRequest('/internal/state', 'GET', undefined, tokens[index])))).state;
    assert.equal(otherSnapshot.self.seerResult, null);
  }
}

if (afterNight.phase === 'discussion') {
  await payload(await room.fetch(makeRequest('/internal/action', 'POST', {
    type: 'set_discussion', mode: 'online', durationMinutes: 1, callUrl: 'https://meet.example.com/werewolf'
  }, tokens[0])));
  const current = await room.loadRoom();
  const chatPlayerIndex = current.players.findIndex(player => player.alive && player.id !== current.hostId);
  await payload(await room.fetch(makeRequest('/internal/action', 'POST', {
    type: 'send_chat', text: 'Diskusi dimulai.'
  }, tokens[chatPlayerIndex])));
  assert.equal((await room.loadRoom()).chat.length, 1);
  current.discussionEndsAt = Date.now() - 1;
  await room.saveRoom(current);
  await payload(await room.fetch(makeRequest('/internal/action', 'POST', { type: 'start_voting' }, tokens[0])));
  const voteRoom = await room.loadRoom();
  const alive = voteRoom.players.filter(player => player.alive);
  for (let index = 0; index < alive.length; index += 1) {
    const voter = alive[index];
    const target = alive.find(candidate => candidate.id !== voter.id);
    const tokenIndex = voteRoom.players.findIndex(player => player.id === voter.id);
    await payload(await room.fetch(makeRequest('/internal/action', 'POST', {
      type: 'cast_vote', targetId: target.id
    }, tokens[tokenIndex])));
  }
  assert.ok(['result', 'finished'].includes((await room.loadRoom()).phase));
}

console.log('Werewolf Worker integration checks passed: room creation/join, private role draw, server-side night actions, hybrid discussion, online chat, voting and phase transitions.');

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


const soloStorage = new MemoryStorage();
const soloRoom = new WerewolfRoom({ storage: soloStorage, getWebSockets: () => [] }, {});
const soloCreated = await payload(await soloRoom.fetch(makeRequest('/internal/create', 'POST', {
  code: 'B7T234',
  name: 'Solo',
  settings: { wolves: 1, seer: true, doctor: true }
})));
const soloToken = soloCreated.token;
await payload(await soloRoom.fetch(makeRequest('/internal/action', 'POST', {
  type: 'add_bots', count: 4
}, soloToken)));
let soloState = await soloRoom.loadRoom();
assert.equal(soloState.players.length, 5);
assert.equal(soloState.players.filter(player => player.isBot).length, 4);
assert.ok(soloState.players.filter(player => player.isBot).every(player => !player.tokenHash));
await payload(await soloRoom.fetch(makeRequest('/internal/action', 'POST', { type: 'start_game' }, soloToken)));
soloState = await soloRoom.loadRoom();
assert.ok(soloState.players.filter(player => player.isBot).every(player => player.hasDrawn));
assert.equal(soloState.players.find(player => !player.isBot).hasDrawn, false);
await payload(await soloRoom.fetch(makeRequest('/internal/action', 'POST', { type: 'draw_card' }, soloToken)));
await payload(await soloRoom.fetch(makeRequest('/internal/action', 'POST', { type: 'start_night' }, soloToken)));
soloState = await soloRoom.loadRoom();
const soloHuman = soloState.players.find(player => !player.isBot);
if (['wolf', 'seer', 'doctor'].includes(soloHuman.role)) {
  const target = soloState.players.find(player => player.alive && player.id !== soloHuman.id
    && (soloHuman.role !== 'wolf' || player.role !== 'wolf'));
  await payload(await soloRoom.fetch(makeRequest('/internal/action', 'POST', {
    type: 'night_action', targetId: target.id
  }, soloToken)));
}
const soloActors = soloState.players.filter(player => player.alive && ['wolf', 'seer', 'doctor'].includes(player.role));
assert.equal(Object.keys((await soloRoom.loadRoom()).nightActions).length, soloActors.length);
await payload(await soloRoom.fetch(makeRequest('/internal/action', 'POST', { type: 'resolve_night' }, soloToken)));
soloState = await soloRoom.loadRoom();
assert.equal(soloState.phase, 'discussion');
await payload(await soloRoom.fetch(makeRequest('/internal/action', 'POST', {
  type: 'set_discussion', mode: 'online', durationMinutes: 1
}, soloToken)));
soloState = await soloRoom.loadRoom();
assert.ok(soloState.chat.length > 0);
assert.ok(soloState.chat.every(message => soloState.players.some(player => player.id === message.playerId && player.isBot)));
await payload(await soloRoom.fetch(makeRequest('/internal/action', 'POST', {
  type: 'start_voting', force: true
}, soloToken)));
soloState = await soloRoom.loadRoom();
const soloHost = soloState.players.find(player => player.id === soloState.hostId);
if (soloHost.alive && soloState.phase === 'voting') {
  const target = soloState.players.find(player => player.alive && player.id !== soloHost.id);
  await payload(await soloRoom.fetch(makeRequest('/internal/action', 'POST', {
    type: 'cast_vote', targetId: target.id
  }, soloToken)));
  soloState = await soloRoom.loadRoom();
}
assert.ok(['result', 'finished'].includes(soloState.phase));
assert.equal(Object.keys(soloState.votes).length, soloState.players.filter(player => player.alive).length);
console.log('Werewolf solo bot checks passed: bot lobby fill, automatic role draw, night actions, discussion messages, and voting.');
