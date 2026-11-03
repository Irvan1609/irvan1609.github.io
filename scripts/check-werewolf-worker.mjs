import assert from 'node:assert/strict';
import { WerewolfRoom } from '../cloudflare/werewolf-worker/src/index.js';

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

if (afterNight.phase === 'discussion') {
  await payload(await room.fetch(makeRequest('/internal/action', 'POST', {
    type: 'set_discussion', mode: 'online', durationMinutes: 1, callUrl: 'https://meet.example.com/werewolf'
  }, tokens[0])));
  const chatPlayerIndex = current.players.findIndex(player => player.alive && player.id !== current.hostId);
  await payload(await room.fetch(makeRequest('/internal/action', 'POST', {
    type: 'send_chat', text: 'Diskusi dimulai.'
  }, tokens[chatPlayerIndex])));
  assert.equal((await room.loadRoom()).chat.length, 1);
  const current = await room.loadRoom();
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
