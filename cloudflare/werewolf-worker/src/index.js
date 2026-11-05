const ROOM_TTL_MS = 12 * 60 * 60 * 1000;
const MAX_BOT_BATCH = 500;
const MAX_CHAT_MESSAGES = 100;
const MAX_WOLF_CHAT_MESSAGES = 60;
const BOT_NAMES = ['Aruna', 'Bima', 'Citra', 'Damar', 'Elang', 'Farah', 'Genta', 'Hana', 'Indra', 'Jihan', 'Kirana', 'Laras', 'Mahesa', 'Nadia', 'Raka', 'Salsa', 'Tara', 'Umar', 'Vina'];
const BOT_PERSONALITIES = ['calm', 'analytical', 'assertive', 'cautious'];
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers }
  });
}

function randomBytes(length) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

function randomToken(length = 32) {
  return Array.from(randomBytes(length), byte => byte.toString(16).padStart(2, '0')).join('');
}

function randomInt(max) {
  const limit = Math.floor(0x100000000 / max) * max;
  const value = new Uint32Array(1);
  do { crypto.getRandomValues(value); } while (value[0] >= limit);
  return value[0] % max;
}

function makeRoomCode() {
  let code = '';
  for (let i = 0; i < 6; i += 1) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return code;
}

function shuffle(items) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = randomInt(i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function createVillagerPrompt() {
  const left = randomInt(19) + 1;
  const right = randomInt(19) + 1;
  const answer = left + right;
  const distractors = new Set();
  for (const offset of shuffle([-3, -2, -1, 1, 2, 3, 4])) {
    const candidate = answer + offset;
    if (candidate >= 0 && candidate !== answer) distractors.add(candidate);
    if (distractors.size === 3) break;
  }
  while (distractors.size < 3) {
    const candidate = randomInt(39);
    if (candidate !== answer) distractors.add(candidate);
  }
  return { id: crypto.randomUUID(), question: left + ' + ' + right, answer, options: shuffle([answer, ...distractors]) };
}

async function digest(value) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
}

function validCode(code) {
  return /^[A-HJ-NP-Z2-9]{6}$/.test(String(code || '').toUpperCase());
}

function validName(value) {
  const name = String(value || '').trim().replace(/\s+/g, ' ');
  if (name.length < 2 || name.length > 20) throw new HttpError(400, 'Nama harus terdiri dari 2–20 karakter.');
  if (/[<>]/.test(name)) throw new HttpError(400, 'Nama mengandung karakter yang tidak diizinkan.');
  return name;
}

const EXTRA_ROLE_KEYS = [
  'alphaWolf', 'bodyguard', 'witch', 'hunter', 'reviver', 'cupid',
  'guardianAngel', 'detective', 'mayor', 'jester', 'priest', 'vigilante', 'mason'
];
const WOLF_ROLES = new Set(['wolf', 'alpha_wolf']);
const NEUTRAL_ROLES = new Set(['jester', 'guardian_angel']);
const VILLAGE_ROLES = new Set([
  'seer', 'doctor', 'bodyguard', 'witch', 'hunter', 'reviver', 'cupid',
  'detective', 'mayor', 'priest', 'vigilante', 'mason', 'villager'
]);
const ROLE_COUNT_KEYS = [
  'wolf', 'alpha_wolf', 'seer', 'doctor', 'bodyguard', 'witch',
  'hunter', 'reviver', 'cupid', 'guardian_angel', 'detective', 'mayor',
  'priest', 'vigilante', 'mason', 'jester', 'villager'
];
const DEFAULT_ROLE_COUNTS = {
  wolf: 1, alpha_wolf: 0, seer: 1, doctor: 1, bodyguard: 0, witch: 0,
  hunter: 0, reviver: 0, cupid: 0, guardian_angel: 0, detective: 0, mayor: 0,
  priest: 0, vigilante: 0, mason: 0, jester: 0, villager: 2, moderator: 0
};
const ABILITY_KEYS = [
  'alphaDoubleVote', 'seerInspection', 'doctorProtection', 'bodyguardSacrifice',
  'witchHeal', 'witchPoison', 'hunterShot', 'cupidBond', 'guardianProtection',
  'guardianBonus', 'detectiveInspection', 'mayorDoubleVote', 'jesterSoloWin',
  'priestBlessing', 'vigilanteShot', 'reviverOnce'
];

function abilityEnabled(room, key) {
  return room.settings?.abilities?.[key] !== false;
}

function normalizeSettings(input = {}) {
  input = input && typeof input === 'object' ? input : {};
  const hasExplicitCounts = input.roleCounts && typeof input.roleCounts === 'object';
  const legacyModeratorCount = Number(input.roleCounts?.moderator ?? 0);
  if (hasExplicitCounts && Object.prototype.hasOwnProperty.call(input.roleCounts, 'moderator')
    && (!Number.isSafeInteger(legacyModeratorCount) || (legacyModeratorCount !== 0 && legacyModeratorCount !== 1))) {
    throw new HttpError(400, 'Mode moderator lama hanya dapat diatur menjadi 0 atau 1.');
  }
  const moderatorMode = ['host', 'system', 'random'].includes(String(input.moderatorMode || ''))
    ? String(input.moderatorMode)
    : legacyModeratorCount === 1 ? 'system' : 'host';
  const roleCounts = hasExplicitCounts ? {} : null;
  if (roleCounts) {
    for (const key of ROLE_COUNT_KEYS) {
      const count = Number(input.roleCounts[key] ?? 0);
      if (!Number.isSafeInteger(count) || count < 0) {
        throw new HttpError(400, 'Jumlah role ' + key + ' harus berupa bilangan bulat non-negatif.');
      }
      roleCounts[key] = count;
    }
    roleCounts.moderator = moderatorMode === 'system' ? 1 : 0;
  }
  const wolves = Number(input.wolves ?? 1);
  if (!Number.isSafeInteger(wolves) || wolves < 1) throw new HttpError(400, 'Jumlah Werewolf harus berupa bilangan bulat positif.');
  const extraRoles = {};
  for (const key of EXTRA_ROLE_KEYS) extraRoles[key] = input.extraRoles?.[key] === true;
  const abilities = {};
  for (const key of ABILITY_KEYS) abilities[key] = input.abilities?.[key] !== false;
  const timers = {
    roleDrawSeconds: Number(input.timers?.roleDrawSeconds ?? 20),
    nightSeconds: Number(input.timers?.nightSeconds ?? 60),
    dawnSeconds: Number(input.timers?.dawnSeconds ?? 20),
    discussionSeconds: Number(input.timers?.discussionSeconds ?? 30),
    votingSeconds: Number(input.timers?.votingSeconds ?? 15),
    resultSeconds: Number(input.timers?.resultSeconds ?? 8)
  };
  const timerLimits = {
    roleDrawSeconds: [5, 60, 'pembukaan kartu'], nightSeconds: [10, 300, 'tengah malam'],
    dawnSeconds: [5, 120, 'subuh'], discussionSeconds: [5, 300, 'diskusi'],
    votingSeconds: [5, 180, 'voting'], resultSeconds: [3, 60, 'hasil voting']
  };
  for (const [key, [minimum, maximum, label]] of Object.entries(timerLimits)) {
    if (!Number.isSafeInteger(timers[key]) || timers[key] < minimum || timers[key] > maximum) {
      throw new HttpError(400, 'Durasi ' + label + ' harus ' + minimum + '–' + maximum + ' detik.');
    }
  }
  const gameMode = input.gameMode === 'online' ? 'online' : 'offline';
  return {
    gameMode,
    wolves, seer: input.seer !== false, doctor: input.doctor !== false,
    extraRoles, roleCounts, abilities, moderatorMode,
    timers
  };
}

function recommendedRoleCounts(playerCount) {
  const counts = Object.fromEntries(ROLE_COUNT_KEYS.map(key => [key, 0]));
  if (!Number.isSafeInteger(playerCount) || playerCount < 2) return counts;

  const wolfCount = Math.min(playerCount - 1, Math.max(1, Math.floor(playerCount / 4)));
  if (playerCount >= 12 && wolfCount >= 3) {
    counts.alpha_wolf = 1;
    counts.wolf = wolfCount - 1;
  } else counts.wolf = wolfCount;

  const nonWolfPlayers = playerCount - wolfCount;
  const villagerCount = Math.min(
    Math.max(1, nonWolfPlayers - 1),
    Math.max(2, Math.floor(playerCount * 0.2))
  );
  const specialSlots = nonWolfPlayers - villagerCount;
  // Unlock a different special role as the room grows from 4 to 17 players.
  // This gives every room size in the 4–25 range a deliberate role mix.
  const roleSchedule = [
    ['seer', 3], ['doctor', 4], ['bodyguard', 6], ['witch', 7],
    ['hunter', 9], ['cupid', 10], ['detective', 11], ['mayor', 13],
    ['guardian_angel', 14], ['jester', 17]
  ];
  let assignedSpecials = 0;
  for (const [role, minimumPlayers] of roleSchedule) {
    if (playerCount >= minimumPlayers && assignedSpecials < specialSlots) {
      counts[role] += 1;
      assignedSpecials += 1;
    }
  }

  // Fill the remaining special slots with repeatable roles. Cupid and Jester
  // stay unique because Cupid's bond is room-wide and Jester is a solo-win role.
  const scalableRoles = [
    'bodyguard', 'witch', 'hunter', 'detective', 'mayor', 'guardian_angel',
    'seer', 'doctor', 'priest', 'vigilante', 'mason'
  ];
  let extraRoleIndex = 0;
  while (assignedSpecials < specialSlots) {
    const role = scalableRoles[extraRoleIndex % scalableRoles.length];
    counts[role] += 1;
    assignedSpecials += 1;
    extraRoleIndex += 1;
  }

  counts.villager = villagerCount;
  return counts;
}

function roleDeck(settings, playerCount) {
  if (!Number.isSafeInteger(playerCount) || playerCount < 2) {
    throw new HttpError(409, 'Minimal 2 pemain diperlukan agar kubu Werewolf dan Desa dapat bermain.');
  }
  const counts = settings.roleCounts || recommendedRoleCounts(playerCount, settings);
  const total = ROLE_COUNT_KEYS.reduce((sum, key) => sum + counts[key], 0);
  if (!Number.isSafeInteger(total)) throw new HttpError(400, 'Total jumlah role terlalu besar.');
  if (total !== playerCount) {
    throw new HttpError(409, 'Jumlah role (' + total + ') harus sama dengan jumlah pemain (' + playerCount + '). Sesuaikan komposisi role di lobby.');
  }
  if (counts.wolf + counts.alpha_wolf < 1) {
    throw new HttpError(409, 'Komposisi harus memiliki minimal satu Werewolf atau Alpha Wolf.');
  }
  const villageCount = ROLE_COUNT_KEYS.filter(key => VILLAGE_ROLES.has(key))
    .reduce((sum, key) => sum + counts[key], 0);
  if (villageCount < 1) throw new HttpError(409, 'Komposisi harus memiliki minimal satu anggota kubu Desa.');
  const roles = [];
  for (const key of ROLE_COUNT_KEYS) {
    for (let i = 0; i < counts[key]; i += 1) roles.push(key);
  }
  return shuffle(roles);
}

function isWolf(role) {
  return WOLF_ROLES.has(role);
}

function hasSpecialNightAction(room, player) {
  if (!player?.alive) return false;
  const alive = room.players.filter(item => item.alive);
  const others = alive.filter(item => item.id !== player.id);
  switch (player.role) {
    case 'wolf':
    case 'alpha_wolf':
      return alive.some(item => !isWolf(item.role));
    case 'seer':
      return abilityEnabled(room, 'seerInspection') && others.length > 0;
    case 'doctor':
      return abilityEnabled(room, 'doctorProtection') && alive.length > 0;
    case 'bodyguard':
      return abilityEnabled(room, 'bodyguardSacrifice') && others.length > 0;
    case 'witch': {
      const potions = room.witchPotions?.[player.id] || {
        heal: abilityEnabled(room, 'witchHeal'),
        poison: abilityEnabled(room, 'witchPoison')
      };
      return Boolean((potions.heal || potions.poison) && others.length > 0);
    }
    case 'cupid':
      return abilityEnabled(room, 'cupidBond')
        && room.round === 1 && !room.cupidUsed && others.length >= 2;
    case 'guardian_angel':
      return (abilityEnabled(room, 'guardianProtection') || abilityEnabled(room, 'guardianBonus'))
        && others.length > 0;
    case 'detective':
      return abilityEnabled(room, 'detectiveInspection') && others.length > 0;
    case 'priest':
      return abilityEnabled(room, 'priestBlessing') && !player.priestUsed && others.length > 0;
    case 'vigilante':
      return abilityEnabled(room, 'vigilanteShot') && !player.vigilanteUsed && others.length > 0;
    default:
      return false;
  }
}

function canAnswerNightMath(room, player) {
  return !hasSpecialNightAction(room, player)
    || ['witch', 'priest', 'vigilante'].includes(player?.role);
}

function wolfAttackSummary(room, allowPartial = false) {
  const wolves = room.players.filter(player => player.alive && isWolf(player.role));
  if (!wolves.length) return { ready: true, targetId: null, tied: false };
  const actions = wolves.map(player => room.nightActions?.[player.id]);
  if (!allowPartial && actions.some(action => action?.type !== 'wolf_vote')) {
    return { ready: false, targetId: null, tied: false };
  }
  const tally = {};
  const firstVoteAt = {};
  for (const wolf of wolves) {
    const action = room.nightActions?.[wolf.id];
    if (action?.type !== 'wolf_vote' || !action.targetId) continue;
    const weight = wolf.role === 'alpha_wolf' && abilityEnabled(room, 'alphaDoubleVote') ? 2 : 1;
    tally[action.targetId] = (tally[action.targetId] || 0) + weight;
    const submittedAt = Number(action.submittedAt) || Number.MAX_SAFE_INTEGER;
    firstVoteAt[action.targetId] = Math.min(firstVoteAt[action.targetId] ?? Number.MAX_SAFE_INTEGER, submittedAt);
  }
  const highest = Math.max(0, ...Object.values(tally));
  const leaders = Object.keys(tally).filter(id => tally[id] === highest);
  const roomOrder = id => room.players.findIndex(player => player.id === id);
  leaders.sort((left, right) => (firstVoteAt[left] - firstVoteAt[right]) || (roomOrder(left) - roomOrder(right)));
  return {
    ready: true,
    targetId: highest > 0 ? leaders[0] : null,
    tied: highest > 0 && leaders.length > 1
  };
}


async function readJson(request, maxBytes = 8192) {
  const length = Number(request.headers.get('Content-Length') || 0);
  if (length > maxBytes) throw new HttpError(413, 'Permintaan terlalu besar.');
  const text = await request.text();
  if (text.length > maxBytes) throw new HttpError(413, 'Permintaan terlalu besar.');
  try { return text ? JSON.parse(text) : {}; }
  catch { throw new HttpError(400, 'Format JSON tidak valid.'); }
}

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function allowedOrigins(env) {
  return new Set(String(env.ALLOWED_ORIGINS || 'https://irvan1609.github.io,http://localhost:5173,http://127.0.0.1:5173')
    .split(',').map(value => value.trim()).filter(Boolean));
}

function originAllowed(origin, env) {
  return !origin || allowedOrigins(env).has(origin);
}

function corsHeaders(request, env) {
  const origin = request.headers.get('Origin') || '';
  const headers = {
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin'
  };
  if (originAllowed(origin, env) && origin) headers['Access-Control-Allow-Origin'] = origin;
  return headers;
}

function withCors(response, request, env) {
  if (response.status === 101) return response;
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(corsHeaders(request, env))) headers.set(key, value);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function bearer(request) {
  const value = request.headers.get('Authorization') || '';
  return value.startsWith('Bearer ') ? value.slice(7).trim() : '';
}

async function callRoom(env, code, path, request) {
  if (!env.ROOMS) return json({ error: 'Layanan room belum dikonfigurasi.' }, 503);
  const id = env.ROOMS.idFromName(code);
  const stub = env.ROOMS.get(id);
  const url = new URL(request.url);
  const target = 'https://room.internal' + path + url.search;
  const forwarded = new Request(target, request);
  return stub.fetch(forwarded);
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    if (!originAllowed(origin, env)) return json({ error: 'Origin tidak diizinkan.' }, 403);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(request, env) });

    const url = new URL(request.url);
    if (url.pathname === '/health' && request.method === 'GET') {
      return withCors(json({ ok: true, service: 'werewolf-room-api', realtime: true, storage: 'durable-objects' }), request, env);
    }

    try {
      if (url.pathname === '/rooms' && request.method === 'POST') {
        const createLimiter = env.ROOM_CREATE_LIMITER;
        if (createLimiter?.limit) {
          const limit = await createLimiter.limit({ key: request.headers.get('CF-Connecting-IP') || 'unknown' });
          if (!limit.success) return withCors(json({ error: 'Terlalu banyak membuat room. Coba lagi sebentar.' }, 429), request, env);
        }
        const body = await readJson(request);
        const name = validName(body.name);
        const settings = normalizeSettings(body.settings);
        for (let attempt = 0; attempt < 8; attempt += 1) {
          const code = makeRoomCode();
          const internal = new Request('https://room.internal/internal/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code, name, settings })
          });
          const response = await env.ROOMS.get(env.ROOMS.idFromName(code)).fetch(internal);
          if (response.status === 409) continue;
          return withCors(response, request, env);
        }
        return withCors(json({ error: 'Tidak berhasil membuat kode room. Coba lagi.' }, 503), request, env);
      }

      const match = url.pathname.match(/^\/rooms\/([A-HJ-NP-Z2-9]{6})(?:\/(join|ticket|state|action|ws))?$/);
      if (!match) {
        if (request.method === 'GET' && env.ASSETS) return env.ASSETS.fetch(request);
        return withCors(json({ error: 'Endpoint tidak ditemukan.' }, 404), request, env);
      }
      const code = match[1].toUpperCase();
      const route = match[2] || '';
      if (route === 'join' && request.method === 'POST') {
        const joinLimiter = env.ROOM_JOIN_LIMITER;
        if (joinLimiter?.limit) {
          const limit = await joinLimiter.limit({ key: (request.headers.get('CF-Connecting-IP') || 'unknown') + ':' + code });
          if (!limit.success) return withCors(json({ error: 'Terlalu banyak percobaan bergabung. Coba lagi sebentar.' }, 429), request, env);
        }
        const body = await readJson(request);
        const name = validName(body.name);
        return withCors(await callRoom(env, code, '/internal/join', new Request(request.url, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name })
        })), request, env);
      }
      if (route === 'ticket' && request.method === 'POST') {
        return withCors(await callRoom(env, code, '/internal/ticket', new Request(request.url, {
          method: 'POST', headers: { Authorization: 'Bearer ' + bearer(request) }
        })), request, env);
      }
      if (route === 'state' && request.method === 'GET') {
        return withCors(await callRoom(env, code, '/internal/state', new Request(request.url, {
          method: 'GET', headers: { Authorization: 'Bearer ' + bearer(request) }
        })), request, env);
      }
      if (route === 'action' && request.method === 'POST') {
        const body = await readJson(request, 4096);
        return withCors(await callRoom(env, code, '/internal/action', new Request(request.url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + bearer(request) },
          body: JSON.stringify(body)
        })), request, env);
      }
      if (route === 'ws' && request.method === 'GET') {
        if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
          return withCors(json({ error: 'WebSocket upgrade diperlukan.' }, 426), request, env);
        }
        return await env.ROOMS.get(env.ROOMS.idFromName(code)).fetch(request);
      }
      return withCors(json({ error: 'Metode tidak didukung.' }, 405), request, env);
    } catch (error) {
      const status = error instanceof HttpError ? error.status : 500;
      return withCors(json({ error: status === 500 ? 'Terjadi kesalahan server.' : error.message }, status), request, env);
    }
  }
};

// Durable Objects keep authoritative room state and broadcast private player snapshots over WebSocket.
export class WerewolfRoom {
  constructor(state, env) {
    this.state = state;
    this.env = env || {};
    this.mutationQueue = Promise.resolve();
  }

  async runExclusive(operation) {
    const previous = this.mutationQueue;
    let release;
    this.mutationQueue = new Promise(resolve => { release = resolve; });
    await previous;
    try { return await operation(); }
    finally { release(); }
  }

  async loadRoom() {
    const room = await this.state.storage.get('room') || null;
    if (!room) return null;
    let migrated = false;
    if (!Array.isArray(room.players)) {
      room.players = [];
      migrated = true;
    }
    for (const [key, fallback] of Object.entries({
      nightEndsAt: null, dawnEndsAt: null, resultEndsAt: null,
      dawnActions: {}, resultActions: {}, resultResolved: false, seerHistory: {}, botNightReports: {}
    })) {
      if (room[key] === undefined || room[key] === null && fallback && typeof fallback === 'object') {
        room[key] = fallback;
        migrated = true;
      }
    }
    if (!Array.isArray(room.gameHistory)) { room.gameHistory = []; migrated = true; }
    if (!Array.isArray(room.gameArchive)) { room.gameArchive = []; migrated = true; }
    if (!Number.isSafeInteger(room.gameHistoryTruncated)) { room.gameHistoryTruncated = 0; migrated = true; }
    if (typeof room.gameFinishedRecorded !== 'boolean') { room.gameFinishedRecorded = false; migrated = true; }
    if (!room.hostAccount && room.moderator && room.hostId) {
      room.hostAccount = {
        id: room.hostId,
        name: room.moderator.name,
        tokenHash: room.moderator.tokenHash
      };
      migrated = true;
    }
    const hostInRoster = room.players.some(player => player.id === room.hostId);
    if (room.phase === 'lobby' && !hostInRoster && room.hostAccount?.tokenHash) {
      room.players.unshift({
        ...room.hostAccount,
        role: null,
        alive: true,
        connected: false,
        hasDrawn: false,
        joinedAt: room.createdAt || Date.now(),
        isHost: true
      });
      migrated = true;
    } else if (room.phase !== 'lobby' && room.activeModeratorId === undefined) {
      room.activeModeratorId = !hostInRoster && room.moderator?.id ? room.moderator.id : null;
      migrated = true;
    }
    if (room.activeModeratorRosterIndex === undefined) {
      room.activeModeratorRosterIndex = null;
      migrated = true;
    }
    if (migrated) await this.state.storage.put('room', room);
    return room;
  }

  isCurrentModerator(room, actorId) {
    return room.phase === 'lobby'
      ? actorId === room.hostId
      : Boolean(room.activeModeratorId && actorId === room.activeModeratorId);
  }

  async scheduleRoomAlarm(room) {
    if (!this.state.storage.setAlarm) return;
    const now = Date.now();
    const deadlines = [Number(room.expiresAt) || now + ROOM_TTL_MS];
    const system = this.isSystemModerator(room);
    if (room.phase === 'role_draw' && Number(room.roleDrawEndsAt) > 0) deadlines.push(Number(room.roleDrawEndsAt));
    if (system && room.phase === 'night' && Number(room.nightEndsAt) > 0) deadlines.push(Number(room.nightEndsAt));
    if (system && room.phase === 'dawn' && Number(room.dawnEndsAt) > 0) deadlines.push(Number(room.dawnEndsAt));
    if (system && room.phase === 'morning' && Number(room.discussionEndsAt) > 0) deadlines.push(Number(room.discussionEndsAt));
    if (room.phase === 'voting' && Number(room.votingEndsAt) > 0) deadlines.push(Number(room.votingEndsAt));
    if (system && room.phase === 'result' && Number(room.resultEndsAt) > 0) deadlines.push(Number(room.resultEndsAt));
    const nextAlarm = Math.min(...deadlines.filter(value => Number.isFinite(value) && value > 0));
    await this.state.storage.setAlarm(Math.max(now + 50, nextAlarm));
  }

  async saveRoom(room) {
    room.revision = Math.max(0, Number(room.revision) || 0) + 1;
    room.expiresAt = Date.now() + ROOM_TTL_MS;
    await this.state.storage.put('room', room);
    await this.scheduleRoomAlarm(room);
  }

  recordGameEvent(room, event = {}) {
    const clean = (value, max = 320) => String(value ?? '').slice(0, max);
    const entry = {
      id: crypto.randomUUID(),
      at: Number(event.at) || Date.now(),
      round: Number(event.round ?? room.round) || 0,
      phase: clean(event.phase || room.phase || 'unknown', 24),
      kind: clean(event.kind || 'event', 32),
      title: clean(event.title || 'Peristiwa permainan', 100),
      message: clean(event.message || '', 700)
    };
    if (Array.isArray(event.events) && event.events.length) {
      entry.events = event.events.slice(0, 40).map(item => clean(item, 320));
      entry.eventsTotal = event.events.length;
    }
    if (Array.isArray(event.eliminations) && event.eliminations.length) {
      entry.eliminations = event.eliminations.slice(0, 80).map(item => ({
        name: clean(item.name || 'Pemain', 40),
        role: clean(item.role || 'unknown', 32),
        cause: clean(item.cause || 'unknown', 32)
      }));
      entry.eliminationsTotal = event.eliminations.length;
    }
    if (Array.isArray(event.actionReport) && event.actionReport.length) {
      entry.actionReport = event.actionReport.slice(0, 120).map(item => ({
        order: Number(item.order) || 0,
        role: clean(item.role || 'Role', 32),
        actor: clean(item.actor || 'Pemain', 100),
        action: clean(item.action || '', 240),
        outcome: clean(item.outcome || '', 240)
      }));
      entry.actionReportTotal = event.actionReport.length;
    }
    if (Array.isArray(event.voteTally) && event.voteTally.length) {
      entry.voteTally = event.voteTally.slice(0, 100).map(item => ({
        name: clean(item.name || 'Pemain', 40),
        votes: Math.max(0, Number(item.votes) || 0)
      }));
      entry.voteTallyTotal = event.voteTally.length;
    }
    const history = Array.isArray(room.gameHistory) ? room.gameHistory : [];
    history.push(entry);
    if (history.length > 120) {
      const removed = history.length - 120;
      history.splice(0, removed);
      room.gameHistoryTruncated = (Number(room.gameHistoryTruncated) || 0) + removed;
    }
    room.gameHistory = history;
    return entry;
  }

  recordGameFinished(room, now = Date.now()) {
    if (!room.winner || room.gameFinishedRecorded) return;
    const labels = {
      wolves: 'Kubu Werewolf menang',
      villagers: 'Kubu Desa menang',
      jester: 'Jester menang sendiri',
      lovers: 'Pasangan Lovers menang'
    };
    room.gameFinishedRecorded = true;
    this.recordGameEvent(room, {
      kind: 'game_over', phase: 'finished', title: 'Pemenang ditentukan',
      message: labels[room.winner] || 'Permainan selesai.', at: now, round: room.round
    });
  }

  archiveCompletedGame(room, now = Date.now()) {
    if (room.phase !== 'finished' || !room.winner || !Array.isArray(room.gameHistory) || !room.gameHistory.length) return;
    const lovers = Array.isArray(room.lovers) ? room.lovers : [];
    const bonusWinners = Array.isArray(room.additionalWinners) ? room.additionalWinners : [];
    const players = room.players.map(player => {
      const faction = isWolf(player.role) ? 'wolves'
        : NEUTRAL_ROLES.has(player.role) ? 'neutral' : 'village';
      const mainWinner = room.winner === 'wolves' && faction === 'wolves'
        || room.winner === 'villagers' && faction === 'village'
        || room.winner === 'jester' && player.role === 'jester'
        || room.winner === 'lovers' && lovers.includes(player.id);
      const bonusWinner = bonusWinners.includes(player.id);
      return {
        id: player.id, name: player.name, role: player.role, faction,
        alive: Boolean(player.alive), isWinner: Boolean(mainWinner || bonusWinner),
        winReason: bonusWinner ? 'Pemenang bonus Guardian Angel' : mainWinner ? 'Pemenang utama' : null
      };
    });
    const archive = {
      id: room.gameId || crypto.randomUUID(),
      startedAt: Number(room.gameStartedAt) || room.createdAt || now,
      completedAt: now,
      round: Number(room.round) || 0,
      winner: room.winner,
      moderatorName: room.moderator?.name || 'Moderator',
      players,
      events: JSON.parse(JSON.stringify(room.gameHistory.slice(-120))),
      truncated: Number(room.gameHistoryTruncated) || 0
    };
    const archives = Array.isArray(room.gameArchive) ? room.gameArchive : [];
    archives.unshift(archive);
    room.gameArchive = archives.slice(0, 3);
  }

  async authenticate(request, room) {
    const token = bearer(request);
    if (!token) return null;
    const tokenHash = await digest(token);
    const player = room.players.find(item => item.tokenHash === tokenHash);
    if (player) return player;
    if (room.moderator?.tokenHash === tokenHash && this.isCurrentModerator(room, room.moderator.id)) {
      return room.moderator;
    }
    return null;
  }

  snapshot(room, actorId) {
    const isModerator = this.isCurrentModerator(room, actorId);
    const self = isModerator ? room.moderator : room.players.find(player => player.id === actorId);
    const alive = room.players.filter(player => player.alive);
    const skippedNightIds = new Set(room.nightSkippedPlayerIds || []);
    const nightActionsSubmitted = alive.filter(player =>
      Boolean(room.nightActions?.[player.id]) && !skippedNightIds.has(player.id)
    ).length;
    const nightActionsSkipped = alive.filter(player => skippedNightIds.has(player.id)).length;
    const nightDeadIds = new Set(room.lastResult?.kind === 'night'
      ? (room.lastResult.eliminations || []).map(item => item.id) : []);
    const reviveAvailable = nightDeadIds.size > 0;
    const dawnCandidates = room.phase === 'dawn' ? room.players.filter(player =>
      player.role === 'hunter' && !player.alive && nightDeadIds.has(player.id)
        && !player.hunterUsed && abilityEnabled(room, 'hunterShot')
      || player.role === 'reviver' && player.alive && !player.reviverUsed
        && abilityEnabled(room, 'reviverOnce') && reviveAvailable
    ) : [];
    const dawnActionsSubmitted = dawnCandidates.filter(player => Boolean(room.dawnActions?.[player.id])).length;
    const votesSubmitted = alive.filter(player =>
      Object.prototype.hasOwnProperty.call(room.votes || {}, player.id)
    ).length;
    const canMonitorPlayers = isModerator || self?.id === room.hostId;
    const players = canMonitorPlayers ? room.players.map(player => {
      const nightAction = room.nightActions?.[player.id] || null;
      const voteSubmitted = Object.prototype.hasOwnProperty.call(room.votes || {}, player.id);
      const voteTargetId = voteSubmitted ? room.votes[player.id] : null;
      const actionTarget = nightAction?.targetId ? room.players.find(item => item.id === nightAction.targetId) : null;
      const actionPartner = nightAction?.partnerId ? room.players.find(item => item.id === nightAction.partnerId) : null;
      const voteTarget = voteTargetId ? room.players.find(item => item.id === voteTargetId) : null;
      const base = {
        id: player.id, name: player.name, isHost: player.id === room.hostId,
        alive: Boolean(player.alive), connected: Boolean(player.connected),
        isBot: Boolean(player.isBot), isBotControlled: Boolean(player.isBotControlled),
        hasDrawn: Boolean(player.hasDrawn),
        hasActed: Boolean(nightAction) && !skippedNightIds.has(player.id),
        actionSkipped: skippedNightIds.has(player.id),
        dawnActionType: room.dawnActions?.[player.id]?.type || null,
        dawnActionTarget: room.dawnActions?.[player.id]?.targetId
          ? room.players.find(item => item.id === room.dawnActions[player.id].targetId)?.name || null : null,
        hasVoted: voteSubmitted, voteAbstain: voteSubmitted && !voteTargetId
      };
      return isModerator ? {
        ...base, role: player.role,
        nightActionType: nightAction?.type || null,
        nightActionTarget: actionTarget?.name || null,
        nightActionPartner: actionPartner?.name || null,
        voteTarget: voteTarget?.name || null
      } : base;
    }) : [];
    const targets = !isModerator && self
      ? alive.map(player => ({ id: player.id, name: player.name }))
      : [];
    const reviveTargets = !isModerator && self?.role === 'reviver' && self.alive && !self.reviverUsed && room.phase === 'dawn'
      ? (room.lastResult?.kind === 'night' ? (room.lastResult.eliminations || []) : [])
        .filter(item => room.players.some(player => player.id === item.id && !player.alive))
        .map(item => ({ id: item.id, name: item.name }))
      : [];
    const canSeeCurrentHistory = isModerator || room.phase === 'finished';
    const canSeeGameArchive = isModerator || (room.phase === 'lobby' && actorId === room.hostId);
    const status = !self || isModerator ? 'moderator'
      : ['morning', 'discussion', 'voting', 'result', 'finished'].includes(room.phase)
        ? (self.alive ? 'survived' : 'eliminated')
        : self.alive ? 'alive' : 'eliminated';
    const witchAttack = !isModerator && self?.role === 'witch' && room.phase === 'night'
      ? wolfAttackSummary(room)
      : null;
    const canSeeWolfRoom = !isModerator && room.phase === 'night' && Boolean(self?.alive) && isWolf(self?.role);
    const wolfSelections = canSeeWolfRoom
      ? room.players.filter(item => item.alive && isWolf(item.role)).map(wolf => {
        const action = room.nightActions?.[wolf.id];
        const selected = action?.type === 'wolf_vote'
          ? room.players.find(item => item.id === action.targetId)
          : null;
        return {
          playerId: wolf.id,
          name: wolf.name,
          hasChosen: Boolean(selected),
          targetName: selected?.name || null,
          isSelf: wolf.id === self.id
        };
      })
      : [];
    const loverIds = Array.isArray(room.lovers) ? room.lovers : [];
    const canSeeLovers = !isModerator && self && (self.role === 'cupid' || loverIds.includes(self.id));
    const loverNames = canSeeLovers
      ? loverIds.map(id => room.players.find(player => player.id === id)?.name).filter(Boolean)
      : [];
    const connectedAttachments = (this.state.getWebSockets ? this.state.getWebSockets() : [])
      .map(item => {
        try { return item.deserializeAttachment(); } catch { return null; }
      }).filter(item => item?.actorId);
    const connectedIds = new Set(connectedAttachments.map(item => item.actorId));
    const onlineRoom = room.settings?.gameMode === 'online';
    const includeEliminatedVoice = ['lobby', 'finished'].includes(room.phase);
    const voicePeers = onlineRoom ? [
      ...room.players.filter(item => !item.isBot && !item.isBotControlled && connectedIds.has(item.id)
        && (includeEliminatedVoice || item.alive)).map(item => ({
        id: item.id, name: item.name, isModerator: false
      })),
      ...(room.activeModeratorId && connectedIds.has(room.activeModeratorId)
        ? [{ id: room.moderator.id, name: room.moderator.name, isModerator: true }]
        : [])
    ].filter((item, index, all) => all.findIndex(other => other.id === item.id) === index) : [];
    const publicResult = !['lobby', 'role_draw', 'night', 'dawn'].includes(room.phase)
      && room.lastResult && room.lastResult.kind !== 'phase'
      ? {
        kind: room.lastResult.kind,
        message: String(room.lastResult.message || ''),
        round: Number(room.lastResult.round) || room.round,
         at: room.lastResult.at || null,
        eliminatedPlayers: (Array.isArray(room.lastResult.eliminations) ? room.lastResult.eliminations : [])
          .map(item => ({
            name: String(item.name || 'Pemain'),
            cause: item.cause === 'vote' ? 'Voting'
              : item.cause === 'werewolf_attack' ? 'Serangan Werewolf'
                : ['hunter', 'vigilante_shot'].includes(item.cause) ? 'Tembakan'
                  : item.cause === 'witch_poison' ? 'Racun'
                    : item.cause === 'bodyguard_sacrifice' ? 'Pengorbanan'
                      : item.cause === 'cupid_bond' ? 'Ikatan pasangan'
                        : item.cause === 'left_room' ? 'Keluar dari permainan' : 'Aksi malam'
          }))
      }
      : null;
    const finalPlayers = room.phase === 'finished'
      ? room.players.map(player => {
        const faction = isWolf(player.role) ? 'wolves'
          : NEUTRAL_ROLES.has(player.role) ? 'neutral' : 'village';
        const bonusWinner = (room.additionalWinners || []).includes(player.id);
        const mainWinner = room.winner === 'wolves' && faction === 'wolves'
          || room.winner === 'villagers' && faction === 'village'
          || room.winner === 'jester' && player.role === 'jester'
          || room.winner === 'lovers' && loverIds.includes(player.id);
        return {
          id: player.id,
          name: player.name,
          role: player.role,
          faction,
          alive: Boolean(player.alive),
          isWinner: Boolean(mainWinner || bonusWinner),
          winReason: bonusWinner ? 'Pemenang bonus Guardian Angel'
            : mainWinner ? 'Pemenang utama' : null
        };
      })
      : [];
    return {
      room: {
        code: room.code,
        revision: Number(room.revision) || 0,
        phase: room.phase,
        round: room.round,
        hostId: room.hostId,
        settings: room.settings,
        moderatorMode: room.settings?.moderatorMode || (Number(room.settings?.roleCounts?.moderator ?? 0) === 1 ? 'system' : 'host'),
        activeModeratorMode: room.activeModeratorMode || null,
        discussionMode: room.phase === 'discussion' ? room.discussionMode || null : null,
        discussionEndsAt: Number(room.discussionEndsAt) || null,
        roleDrawEndsAt: Number(room.roleDrawEndsAt) || null,
        nightEndsAt: Number(room.nightEndsAt) || null,
        dawnEndsAt: Number(room.dawnEndsAt) || null,
        votingEndsAt: Number(room.votingEndsAt) || null,
        resultEndsAt: Number(room.resultEndsAt) || null,
        resultResolved: Boolean(room.resultResolved),
        villageName: String(room.villageName || 'Desa Waringin'),
        callUrl: '',
        nightActionsRequired: alive.length,
        nightActionsSubmitted,
        nightActionsSkipped,
        dawnActionsRequired: dawnCandidates.length,
        dawnActionsSubmitted,
        votesRequired: alive.length,
        votesSubmitted,
        playersAliveCount: alive.length,
        playersOnlineCount: room.players.filter(player => player.connected && !player.isBotControlled).length,
        roleCardsDrawn: room.players.filter(player => player.hasDrawn).length,
        roleCardsRequired: room.players.length,
        gameHistory: canSeeCurrentHistory ? (room.gameHistory || []) : [],
        gameHistoryTruncated: canSeeCurrentHistory ? (Number(room.gameHistoryTruncated) || 0) : 0,
        gameArchive: canSeeGameArchive ? (room.gameArchive || []).slice(0, 3) : [],
        lastResult: isModerator ? room.lastResult : null,
        publicResult,
        winner: isModerator || room.phase === 'finished' ? room.winner : null,
        additionalWinners: isModerator || room.phase === 'finished' ? (room.additionalWinners || []) : [],
        lovers: isModerator || room.phase === 'finished'
          ? loverIds.map(id => room.players.find(player => player.id === id)?.name).filter(Boolean)
          : [],
        finalPlayers,
        gameOver: room.phase === 'finished'
      },
      lobbyPlayers: room.phase === 'lobby' ? room.players.map(player => ({
        id: player.id, name: player.name, connected: Boolean(player.connected),
        isBot: Boolean(player.isBot), isBotControlled: Boolean(player.isBotControlled),
        isHost: player.id === room.hostId
      })) : [],
      players,
      livingPlayers: alive.map(player => ({ id: player.id, name: player.name })),
      targets,
      reviveTargets,
      wolfTeam: canSeeWolfRoom
        ? room.players.filter(player => player.alive && isWolf(player.role)).map(player => player.name)
        : [],
      wolfSelections,
      wolfChat: canSeeWolfRoom
        ? (Array.isArray(room.wolfChat) ? room.wolfChat : []).slice(-MAX_WOLF_CHAT_MESSAGES).map(message => ({
          id: message.id,
          name: message.name,
          text: message.text,
          at: message.at
        }))
        : [],
      voicePeers,
      self: self ? {
        id: self.id,
        name: self.name,
        isModerator,
        isHost: self.id === room.hostId,
        isBot: Boolean(self.isBot),
        isBotControlled: Boolean(self.isBotControlled),
        role: isModerator ? null : (self.hasDrawn ? self.role : null),
        alive: isModerator ? true : Boolean(self.alive),
        status,
        hasRole: Boolean(!isModerator && self.role),
        hasDrawn: Boolean(self.hasDrawn),
        hasActed: Boolean(room.nightActions && room.nightActions[self.id]),
        nightActionType: room.nightActions?.[self.id]?.type || null,
        nightActionTargetId: room.nightActions?.[self.id]?.targetId || null,
        nightActionPartnerId: room.nightActions?.[self.id]?.partnerId || null,
        nightActionChoiceIndex: Number.isSafeInteger(room.nightActions?.[self.id]?.choiceIndex)
          ? room.nightActions[self.id].choiceIndex : null,
        nightActionMode: room.phase === 'night' && !hasSpecialNightAction(room, self) ? 'math' : 'special',
        dawnActionType: room.dawnActions?.[self.id]?.type || null,
        dawnActionTargetId: room.dawnActions?.[self.id]?.targetId || null,
        dawnActionTargetName: room.dawnActions?.[self.id]?.targetId
          ? room.players.find(item => item.id === room.dawnActions[self.id].targetId)?.name || null : null,
        wolfTargetName: canSeeWolfRoom && room.nightActions?.[self.id]?.type === 'wolf_vote'
          ? room.players.find(item => item.id === room.nightActions[self.id].targetId)?.name || null
          : null,
        hasVoted: Boolean(room.votes && Object.prototype.hasOwnProperty.call(room.votes, self.id)),
        voteTargetId: Object.prototype.hasOwnProperty.call(room.votes || {}, self.id) ? room.votes[self.id] : null,
        voteAbstain: Object.prototype.hasOwnProperty.call(room.votes || {}, self.id) && !room.votes[self.id],
        resultActionTargetId: room.resultActions?.[self.id]?.targetId || null,
        seerResult: !isModerator && ['seer', 'detective'].includes(self.role) && room.seerResults
          ? room.seerResults[self.id] || null
          : null,
        seerHistory: !isModerator && ['seer', 'detective'].includes(self.role)
          ? (room.seerHistory?.[self.id] || []).map(item => ({ ...item })) : [],
        witchAttack: witchAttack ? {
          ready: witchAttack.ready,
          targetName: witchAttack.targetId
            ? room.players.find(player => player.id === witchAttack.targetId)?.name || null
            : null,
          tied: witchAttack.tied
        } : null,
        loverNames,
        hunterUsed: Boolean(self.hunterUsed),
        reviverUsed: Boolean(self.reviverUsed),
        priestUsed: Boolean(self.priestUsed),
        vigilanteUsed: Boolean(self.vigilanteUsed),
        masonNames: !isModerator && self.role === 'mason'
          ? room.players.filter(item => item.alive && item.role === 'mason' && item.id !== self.id).map(item => item.name)
          : [],
        cupidUsed: !isModerator && self.role === 'cupid' ? Boolean(room.cupidUsed) : false,
        guardianTargetName: room.guardianTargets?.[self.id]
          ? room.players.find(item => item.id === room.guardianTargets[self.id])?.name || null
          : null,
        witchPotions: !isModerator ? room.witchPotions?.[self.id] || null : null,
        villagerPrompt: !isModerator && room.phase === 'night'
          && (canAnswerNightMath(room, self) || ['witch', 'priest', 'vigilante'].includes(self.role))
          ? (() => {
            const prompt = room.villagerPrompts?.[self.id];
            return prompt ? { id: prompt.id, question: prompt.question, options: prompt.options } : null;
          })()
          : null
      } : null,
      chat: (room.chat || []).slice(-MAX_CHAT_MESSAGES).map(message => ({
          id: message.id,
          playerId: message.playerId,
          name: message.name,
          text: message.text,
          at: message.at,
          isBot: Boolean(message.isBot
            || room.players.some(player => player.id === message.playerId && player.isBot)),
          isModerator: Boolean(message.isModerator)
        }))
    };
  }

  async broadcast(room) {
    const sockets = this.state.getWebSockets ? this.state.getWebSockets() : [];
    for (const socket of sockets) {
      try {
        const attachment = socket.deserializeAttachment();
        if (attachment && attachment.actorId) {
          socket.send(JSON.stringify({
            type: 'state',
            state: this.snapshot(room, attachment.actorId)
          }));
        }
      } catch { /* A closed socket is removed by the runtime. */ }
    }
  }

  async disbandRoom(message = 'Room dibubarkan oleh host.') {
    const sockets = this.state.getWebSockets ? this.state.getWebSockets() : [];
    for (const socket of sockets) {
      try {
        socket.send(JSON.stringify({ type: 'room_disbanded', message }));
      } catch { /* A disconnected participant no longer needs the notification. */ }
    }
    for (const socket of sockets) {
      try { socket.close(4001, 'Room dibubarkan oleh host'); } catch {}
    }
    if (this.state.storage.deleteAlarm) await this.state.storage.deleteAlarm();
    if (this.state.storage.deleteAll) await this.state.storage.deleteAll();
    else if (this.state.storage.delete) await this.state.storage.delete('room');
  }

  closeKickedPlayerSockets(playerId) {
    const sockets = this.state.getWebSockets ? this.state.getWebSockets() : [];
    for (const socket of sockets) {
      try {
        const attachment = socket.deserializeAttachment();
        if (attachment?.actorId !== playerId || attachment.actorType === 'moderator') continue;
        socket.send(JSON.stringify({
          type: 'player_kicked',
          message: 'Kamu dikeluarkan dari room oleh host atau moderator. Sesi ini sudah tidak berlaku.'
        }));
        socket.close(4002, 'Dikeluarkan host');
      } catch { /* A disconnected participant no longer needs the notification. */ }
    }
  }

  async makePlayer(name) {
    const token = randomToken(32);
    return {
      player: {
        id: crypto.randomUUID(),
        name,
        tokenHash: await digest(token),
        role: null,
        alive: true,
        connected: false,
        hasDrawn: false,
        joinedAt: Date.now(),
        isHost: false
      },
      token
    };
  }

  async makeModerator(name) {
    const token = randomToken(32);
    return {
      moderator: {
        id: crypto.randomUUID(),
        name,
        tokenHash: await digest(token)
      },
      token
    };
  }

  makeBot(room) {
    const used = new Set(room.players.map(player => player.name.toLowerCase()));
    let name = 'Bot ' + (BOT_NAMES.find(candidate => !used.has(('Bot ' + candidate).toLowerCase())) || '');
    if (name === 'Bot ') {
      let suffix = room.players.length + 1;
      do { name = 'Bot ' + suffix; suffix += 1; } while (used.has(name.toLowerCase()));
    }
    return {
      id: crypto.randomUUID(),
      name,
      role: null,
      alive: true,
      connected: false,
      hasDrawn: false,
      joinedAt: Date.now(),
      isHost: false,
      isBot: true,
      personality: BOT_PERSONALITIES[randomInt(BOT_PERSONALITIES.length)],
      suspicionTargetId: null
    };
  }

  seedBotDiscussion(room, now) {
    if (Number(room.botDiscussionRound) === Number(room.round)) return;
    room.botDiscussionRound = Number(room.round) || 0;
    const alive = room.players.filter(player => player.alive);
    const speakers = alive.filter(player => player.isBot)
      .sort((left, right) => Number(right.role === 'seer') - Number(left.role === 'seer'))
      .slice(0, 3);
    room.botReplyCursor = 0;
    for (const [index, bot] of speakers.entries()) {
      const clue = room.seerResults?.[bot.id];
      const wolfClue = clue?.result === 'wolf' || clue?.result === 'wolf_team';
      let candidates = alive.filter(player => player.id !== bot.id && (!isWolf(bot.role) || !isWolf(player.role)));
      if (clue && ['not_wolf', 'village'].includes(clue.result)) {
        candidates = candidates.filter(player => player.name !== clue.playerName);
      }
      const suspected = wolfClue
        ? alive.find(player => player.name === clue.playerName && isWolf(player.role))
        : candidates.length ? candidates[randomInt(candidates.length)] : null;
      bot.suspicionTargetId = suspected?.id || null;

      let text;
      const actionReport = room.botNightReports?.[bot.id];
      if (actionReport?.round === room.round) text = actionReport.text;
      else if (['seer', 'detective'].includes(bot.role) && clue) {
        const faction = bot.role === 'detective'
          ? (clue.result === 'wolf_team' ? 'kubu Werewolf' : clue.result === 'neutral' ? 'kubu Netral' : 'kubu Desa')
          : (clue.result === 'wolf' ? 'Werewolf' : 'bukan Werewolf');
        text = 'Aku memeriksa ' + clue.playerName + ' tadi malam. Hasilnya menunjukkan ' + faction + '. Kita perlu mempertimbangkan temuan ini.';
      } else if (room.lastResult?.kind === 'night' && !room.lastResult.eliminatedId) {
        text = bot.personality === 'assertive'
          ? 'Tidak ada korban malam ini. Jangan lengah; kita tetap harus menemukan siapa yang menyerang.'
          : 'Tidak ada korban malam ini. Doctor mungkin berhasil melindungi seseorang. Mari periksa informasi yang kita punya.';
      } else if (room.lastResult?.kind === 'night' && room.lastResult.eliminatedId) {
        const eliminated = room.players.find(player => player.id === room.lastResult.eliminatedId);
        text = eliminated
          ? 'Kita kehilangan ' + eliminated.name + ' semalam. Aku ingin mendengar alasan sebelum kita menuduh siapa pun.'
          : 'Kejadian semalam harus kita bahas dengan tenang. Jangan terburu-buru menuduh.';
      } else if (suspected) {
        text = bot.personality === 'assertive'
          ? 'Aku ingin mengawasi ' + suspected.name + '. Ada baiknya kita meminta penjelasan sebelum voting.'
          : 'Untuk sementara aku memperhatikan ' + suspected.name + ', tetapi aku masih terbuka pada bukti lain.';
      } else {
        text = 'Aku belum punya petunjuk yang cukup. Mari dengarkan pendapat semua pemain.';
      }
      room.chat.push({ id: crypto.randomUUID(), playerId: bot.id, name: bot.name, text, at: now + index });
    }
    if (room.chat.length > MAX_CHAT_MESSAGES) room.chat.splice(0, room.chat.length - MAX_CHAT_MESSAGES);
  }

  respondToSoloChat(room, message, now) {
    const humans = room.players.filter(player => !player.isBot);
    const bots = room.players.filter(player => player.isBot && player.alive);
    if (humans.length !== 1 || !bots.length) return;
    const cursor = Number(room.botReplyCursor || 0);
    const bot = bots[cursor % bots.length];
    room.botReplyCursor = cursor + 1;
    const lower = message.toLowerCase();
    const clue = bot.role === 'seer' ? room.seerResults?.[bot.id] : null;
    let reply;
    if (clue?.result === 'wolf' || clue?.result === 'wolf_team') {
      reply = 'Aku sudah menyampaikan hasil pemeriksaanku: ' + clue.playerName + ' terindikasi Werewolf. Menurutku informasi itu perlu kita tindak lanjuti.';
    } else if (/bukti|alasan|yakin/.test(lower)) {
      reply = 'Setuju, kita sebaiknya tidak hanya menebak. Cocokkan cerita dan petunjuk sebelum menentukan suara.';
    } else if (/curiga|duga|tersangka|suspect/.test(lower)) {
      reply = 'Aku paham kecurigaanmu. Coba jelaskan petunjuk yang kamu lihat supaya kita bisa menilainya bersama.';
    } else if (/siapa|pilih|vote|voting/.test(lower)) {
      reply = 'Aku masih menimbang pilihan. Perhatikan siapa yang punya alasan paling kuat dan siapa yang justru menghindari pertanyaan.';
    } else {
      reply = bot.personality === 'assertive'
        ? 'Kita harus tetap fokus. Sampaikan alasanmu, lalu kita tentukan pilihan berdasarkan petunjuk.'
        : 'Menarik. Aku akan mempertimbangkan pendapatmu, tetapi jangan lupakan informasi dari malam tadi.';
    }
    room.chat.push({ id: crypto.randomUUID(), playerId: bot.id, name: bot.name, text: reply, at: now + 1 });
    if (room.chat.length > MAX_CHAT_MESSAGES) room.chat.splice(0, room.chat.length - MAX_CHAT_MESSAGES);
  }

  prepareVillagerPrompts(room) {
    room.villagerPrompts = {};
    for (const player of room.players.filter(item => item.alive)) {
      room.villagerPrompts[player.id] = createVillagerPrompt();
    }
  }

  runBotNightActions(room) {
    const alive = room.players.filter(player => player.alive);
    const submitMath = bot => {
      const prompt = room.villagerPrompts?.[bot.id];
      if (!prompt) return false;
      const correctIndex = prompt.options.indexOf(prompt.answer);
      const choiceIndex = randomInt(4) < 3 ? correctIndex : randomInt(4);
      room.nightActions[bot.id] = {
        type: 'villager_math', promptId: prompt.id, choiceIndex,
        correct: choiceIndex === correctIndex
      };
      return true;
    };
    for (const bot of alive.filter(player => player.isBot)
      .sort((left, right) => Number(left.role === 'witch') - Number(right.role === 'witch'))) {
      if (room.nightActions[bot.id]) continue;
      if (!hasSpecialNightAction(room, bot)) {
        submitMath(bot);
        continue;
      }
      let selected = null;
      let type = '';
      if (isWolf(bot.role)) {
        type = 'wolf_vote';
        const coordinated = Object.entries(room.nightActions).find(([playerId, action]) =>
          action.type === 'wolf_vote' && room.players.some(player => player.id === playerId && isWolf(player.role)));
        selected = coordinated
          ? alive.find(player => player.id === coordinated[1].targetId && !isWolf(player.role))
          : null;
        if (!selected) {
          const candidates = alive.filter(player => !isWolf(player.role));
          selected = candidates.length ? candidates[randomInt(candidates.length)] : null;
        }
      } else if (bot.role === 'seer' || bot.role === 'detective') {
        type = bot.role === 'seer' ? 'seer_inspect' : 'detective_inspect';
        const inspectedBefore = new Set((room.seerHistory?.[bot.id] || []).map(item => item.targetId));
        const candidates = alive.filter(player => player.id !== bot.id && !inspectedBefore.has(player.id));
        selected = candidates.length ? candidates[randomInt(candidates.length)] : null;
      } else if (bot.role === 'doctor' || bot.role === 'bodyguard') {
        type = bot.role === 'doctor' ? 'doctor_protect' : 'bodyguard_protect';
        const candidates = alive.filter(player => player.id !== bot.id);
        selected = candidates.length ? candidates[randomInt(candidates.length)] : null;
      } else if (bot.role === 'guardian_angel') {
        type = 'guardian_protect';
        const fixed = room.guardianTargets?.[bot.id];
        selected = fixed ? alive.find(player => player.id === fixed) : null;
        if (!selected) {
          const candidates = alive.filter(player => player.id !== bot.id);
          selected = candidates.length ? candidates[randomInt(candidates.length)] : null;
        }
        if (selected) room.guardianTargets[bot.id] = selected.id;
      } else if (bot.role === 'priest') {
        type = 'priest_protect';
        selected = alive[randomInt(alive.length)] || null;

      } else if (bot.role === 'vigilante') {
        type = 'vigilante_shot';
        const candidates = alive.filter(player => player.id !== bot.id);
        selected = candidates.length ? candidates[randomInt(candidates.length)] : null;

      } else if (bot.role === 'witch') {
        const potions = room.witchPotions?.[bot.id] || { heal: false, poison: false };
        const attack = wolfAttackSummary(room);
        if (!attack.ready) continue;
        if (attack.targetId && potions.heal) type = 'witch_heal';
        else if (potions.poison) {
          type = 'witch_poison';
          const candidates = alive.filter(player => player.id !== bot.id && !isWolf(player.role));
          selected = candidates.length ? candidates[randomInt(candidates.length)] : null;
        } else {
          submitMath(bot);
          continue;
        }
      } else if (bot.role === 'cupid') {
        type = 'cupid_link';
        const candidates = alive.filter(player => player.id !== bot.id);
        if (candidates.length) {
          selected = candidates[randomInt(candidates.length)];
          const partners = candidates.filter(player => player.id !== selected.id);
          const partner = partners.length ? partners[randomInt(partners.length)] : null;
          if (partner) room.nightActions[bot.id] = { type, targetId: selected.id, partnerId: partner.id };
          continue;
        }
      }
      if (selected || type === 'witch_heal') room.nightActions[bot.id] = {
        type, ...(selected ? { targetId: selected.id } : {}),
        ...(type === 'wolf_vote' ? { submittedAt: Date.now() } : {})
      };
      else submitMath(bot);
    }
  }


  runBotDawnActions(room) {
    const nightDeadIds = new Set(room.lastResult?.kind === 'night'
      ? (room.lastResult.eliminations || []).map(item => item.id) : []);
    if (!nightDeadIds.size) return;
    room.dawnActions = room.dawnActions || {};
    const deadTargets = room.players.filter(player => nightDeadIds.has(player.id) && !player.alive);
    const livingTargets = room.players.filter(player => player.alive);
    for (const bot of room.players.filter(player => player.isBot)) {
      if (bot.role === 'reviver' && bot.alive && !bot.reviverUsed
        && abilityEnabled(room, 'reviverOnce') && deadTargets.length) {
        const preferred = deadTargets.filter(player => ['seer', 'doctor', 'detective'].includes(player.role));
        const candidates = preferred.length ? preferred : deadTargets;
        const selected = candidates[randomInt(candidates.length)];
        room.dawnActions[bot.id] = { type: 'revive_player', targetId: selected.id };
      } else if (bot.role === 'hunter' && !bot.alive && nightDeadIds.has(bot.id)
        && !bot.hunterUsed && abilityEnabled(room, 'hunterShot')) {
        const wolfTargets = livingTargets.filter(player => isWolf(player.role));
        const candidates = wolfTargets.length ? wolfTargets : livingTargets;
        const selected = candidates.length ? candidates[randomInt(candidates.length)] : null;
        if (selected) room.dawnActions[bot.id] = { type: 'hunter_shot', targetId: selected.id };
      }
    }
  }

  runBotResultActions(room) {
    room.resultActions = room.resultActions || {};
    const living = room.players.filter(player => player.alive);
    const wolfTargets = living.filter(player => isWolf(player.role));
    for (const bot of room.players.filter(player => player.isBot && player.role === 'hunter' && !player.alive && !player.hunterUsed)) {
      const candidates = wolfTargets.length ? wolfTargets : living;
      const selected = candidates.length ? candidates[randomInt(candidates.length)] : null;
      if (selected) room.resultActions[bot.id] = { type: 'hunter_shot', targetId: selected.id };
    }
  }

  runBotVotes(room, now) {
    const alive = room.players.filter(player => player.alive);
    for (const bot of alive.filter(player => player.isBot)) {
      if (Object.prototype.hasOwnProperty.call(room.votes, bot.id)) continue;
      let selected = null;
      if (isWolf(bot.role)) {
        const coordinated = Object.entries(room.votes).find(([playerId, targetId]) =>
          room.players.some(player => player.id === playerId && isWolf(player.role))
          && alive.some(player => player.id === targetId && !isWolf(player.role)));
        selected = coordinated ? alive.find(player => player.id === coordinated[1]) : null;
      } else {
        const clue = room.seerResults?.[bot.id];
        if (clue?.result === 'wolf' || clue?.result === 'wolf_team') {
          selected = alive.find(player => player.name === clue.playerName && isWolf(player.role));
        }
        if (!selected && bot.suspicionTargetId) {
          selected = alive.find(player => player.id === bot.suspicionTargetId && player.id !== bot.id);
        }
      }
      if (!selected) {
        const candidates = alive.filter(player => player.id !== bot.id && (!isWolf(bot.role) || !isWolf(player.role)));
        selected = candidates.length ? candidates[randomInt(candidates.length)] : null;
      }
      if (selected) room.votes[bot.id] = selected.id;
    }
  }

  async fetch(request) {
    const url = new URL(request.url);
    try {
      if (url.pathname === '/internal/create' && request.method === 'POST') {
        const body = await readJson(request);
        const existing = await this.loadRoom();
        if (!validCode(body.code)) throw new HttpError(400, 'Kode room tidak valid.');
        if (existing && existing.expiresAt > Date.now()) return json({ error: 'Kode room sudah digunakan.' }, 409);
        const host = await this.makePlayer(validName(body.name));
        host.player.isHost = true;
        const hostAccount = {
          id: host.player.id,
          name: host.player.name,
          tokenHash: host.player.tokenHash
        };
        const room = {
          code: String(body.code || '').toUpperCase(),
          phase: 'lobby',
          round: 0,
          hostId: host.player.id,
          hostAccount,
          moderator: { ...hostAccount },
          players: [host.player],
          settings: normalizeSettings(body.settings),
          discussionMode: null,
          discussionEndsAt: null,
          roleDrawEndsAt: null,
          nightEndsAt: null,
          dawnEndsAt: null,
          votingEndsAt: null,
          resultEndsAt: null,
          dawnActions: {},
          resultActions: {},
          resultResolved: false,
          seerHistory: {},
          botNightReports: {},
          villageName: null,
          callUrl: '',
          nightActions: {},
          nightSkippedPlayerIds: [],
          votes: {},
          seerResults: {},
          villagerPrompts: {},
          activeModeratorMode: null,
          activeModeratorId: null,
          activeModeratorRosterIndex: null,
          chat: [],
          chatRateLimit: {},
          wolfChat: [],
          lastResult: null,
          winner: null,
          gameId: null,
          gameStartedAt: null,
          gameHistory: [],
          gameHistoryTruncated: 0,
          gameFinishedRecorded: false,
          gameArchive: [],
          createdAt: Date.now(),
          expiresAt: Date.now() + ROOM_TTL_MS
        };
        await this.saveRoom(room);
        return json({ code: room.code, moderatorId: host.player.id, token: host.token, phase: room.phase }, 201);
      }

      if (url.pathname === '/internal/join' && request.method === 'POST') return await this.runExclusive(async () => {
        const room = await this.loadRoom();
        if (!room || room.expiresAt <= Date.now()) throw new HttpError(404, 'Room tidak ditemukan atau sudah kedaluwarsa.');
        if (room.phase !== 'lobby') throw new HttpError(409, 'Permainan sudah dimulai. Room tidak menerima pemain baru.');
        // No application-level room-size cap; platform storage and connection quotas still apply.
        const body = await readJson(request);
        const name = validName(body.name);
        if (room.players.some(player => player.name.toLowerCase() === name.toLowerCase())) {
          throw new HttpError(409, 'Nama tersebut sudah digunakan di room ini.');
        }
        const created = await this.makePlayer(name, false);
        room.players.push(created.player);
        await this.saveRoom(room);
        await this.broadcast(room);
        return json({ code: room.code, playerId: created.player.id, token: created.token, phase: room.phase }, 201);
      });

      if (url.pathname === '/internal/ticket' && request.method === 'POST') {
        const room = await this.loadRoom();
        if (!room || room.expiresAt <= Date.now()) throw new HttpError(404, 'Room tidak ditemukan.');
        const player = await this.authenticate(request, room);
        if (!player) throw new HttpError(401, 'Sesi tidak valid. Masuk kembali ke room.');
        const ticket = randomToken(24);
        const ticketHash = await digest(ticket);
        await this.state.storage.put('ticket:' + ticketHash, {
          actorId: player.id,
          actorType: this.isCurrentModerator(room, player.id) ? 'moderator' : 'player',
          expiresAt: Date.now() + 30000
        });
        return json({ ticket, expiresIn: 30 });
      }

      if (url.pathname === '/internal/state' && request.method === 'GET') {
        const room = await this.loadRoom();
        if (!room || room.expiresAt <= Date.now()) throw new HttpError(404, 'Room tidak ditemukan.');
        const player = await this.authenticate(request, room);
        if (!player) throw new HttpError(401, 'Sesi tidak valid.');
        return json({ state: this.snapshot(room, player.id, player.isModerator ? 'moderator' : 'player') });
      }

      if (url.pathname === '/internal/action' && request.method === 'POST') return await this.runExclusive(async () => {
        const room = await this.loadRoom();
        if (!room || room.expiresAt <= Date.now()) throw new HttpError(404, 'Room tidak ditemukan.');
        const player = await this.authenticate(request, room);
        if (!player) throw new HttpError(401, 'Sesi tidak valid.');
        const body = await readJson(request, 4096);
        if (body.type === 'disband_room') {
          if (player.id !== room.hostId) {
            throw new HttpError(403, 'Hanya host yang dapat membubarkan room.');
          }
          const message = 'Room dibubarkan oleh host. Kamu telah dikeluarkan dari room.';
          await this.disbandRoom(message);
          return json({ disbanded: true, message });
        }
        const actionResult = await this.applyAction(room, player, body);
        room.expiresAt = Date.now() + ROOM_TTL_MS;
        await this.saveRoom(room);
        if (actionResult?.kickedPlayerId) this.closeKickedPlayerSockets(actionResult.kickedPlayerId);
        await this.broadcast(room);
        return json({ state: this.snapshot(room, player.id, player.isModerator ? 'moderator' : 'player') });
      });

      if ((url.pathname === '/internal/ws' || /^\/rooms\/[A-HJ-NP-Z2-9]{6}\/ws$/.test(url.pathname)) && request.method === 'GET') return await this.runExclusive(async () => {
        if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') throw new HttpError(426, 'WebSocket upgrade diperlukan.');
        const origin = request.headers.get('Origin') || '';
        if (origin && !allowedOrigins(this.env).has(origin)) throw new HttpError(403, 'Origin tidak diizinkan.');
        const ticket = url.searchParams.get('ticket') || '';
        if (!ticket) throw new HttpError(401, 'Ticket WebSocket tidak tersedia.');
        const ticketHash = await digest(ticket);
        const ticketRecord = await this.state.storage.get('ticket:' + ticketHash);
        if (!ticketRecord || ticketRecord.expiresAt < Date.now()) throw new HttpError(401, 'Ticket WebSocket kedaluwarsa.');
        await this.state.storage.delete('ticket:' + ticketHash);
        const room = await this.loadRoom();
        if (!room || room.expiresAt <= Date.now()) throw new HttpError(404, 'Room tidak ditemukan.');
        const isModerator = this.isCurrentModerator(room, ticketRecord.actorId);
        const actor = isModerator
          ? room.moderator
          : room.players.find(item => item.id === ticketRecord.actorId);
        if (!actor) throw new HttpError(401, 'Akun room tidak ditemukan.');
        const pair = new WebSocketPair();
        const client = pair[0];
        const server = pair[1];
        this.state.acceptWebSocket(server);
        server.serializeAttachment({
          actorId: actor.id,
          actorType: isModerator ? 'moderator' : 'player'
        });
        const connectedPlayer = room.players.find(item => item.id === ticketRecord.actorId);
        if (connectedPlayer) connectedPlayer.connected = true;
        else if (!isModerator) actor.connected = true;
        room.expiresAt = Date.now() + ROOM_TTL_MS;
        await this.saveRoom(room);
        await this.broadcast(room);
        return new Response(null, { status: 101, webSocket: client });
      });

      return json({ error: 'Endpoint internal tidak ditemukan.' }, 404);
    } catch (error) {
      const status = error instanceof HttpError ? error.status : 500;
      return json({ error: status === 500 ? 'Terjadi kesalahan pada room.' : error.message }, status);
    }
  }

  eliminatePlayer(room, playerId, cause) {
    const eliminated = [];
    const details = [];
    const queue = [{ id: playerId, cause: cause || 'unknown' }];
    while (queue.length) {
      const current = queue.shift();
      const player = room.players.find(item => item.id === current.id && item.alive);
      if (!player) continue;
      player.alive = false;
      if (room.nightActions) delete room.nightActions[player.id];
      if (room.dawnActions) delete room.dawnActions[player.id];
      if (room.resultActions) delete room.resultActions[player.id];
      if (room.votes) delete room.votes[player.id];
      eliminated.push(player);
      details.push({
        id: player.id,
        name: player.name,
        role: player.role,
        cause: current.cause
      });
      if (room.lovers?.includes(current.id)) {
        const partnerId = room.lovers.find(value => value !== current.id);
        if (partnerId) queue.push({ id: partnerId, cause: 'cupid_bond' });
      }
    }
    return { players: eliminated, details };
  }

  checkWinner(room) {
    const alive = room.players.filter(item => item.alive);
    const wolves = alive.filter(item => isWolf(item.role)).length;
    const town = alive.filter(item => !isWolf(item.role) && !NEUTRAL_ROLES.has(item.role)).length;
    const lovers = room.lovers || [];
    if (lovers.length === 2 && alive.length === 2 && lovers.every(id => alive.some(item => item.id === id))) {
      room.winner = 'lovers';
    } else if (wolves === 0) {
      room.winner = 'villagers';
    } else if (wolves >= town) {
      room.winner = 'wolves';
    }
    if (room.winner) {
      room.additionalWinners = alive
        .filter(item => abilityEnabled(room, 'guardianBonus') && item.role === 'guardian_angel' && room.guardianTargets?.[item.id]
          && alive.some(target => target.id === room.guardianTargets[item.id]))
        .map(item => item.id);
    }
    return room.winner;
  }

  finishVote(room, now) {
    const tally = {};
    const alive = room.players.filter(item => item.alive);
    const totalVoteWeight = alive.reduce((total, voter) =>
      total + (voter.role === 'mayor' && abilityEnabled(room, 'mayorDoubleVote') ? 2 : 1), 0);
    let abstainCount = 0;
    for (const voter of alive) {
      const hasBallot = Object.prototype.hasOwnProperty.call(room.votes || {}, voter.id);
      if (!hasBallot) { abstainCount += 1; continue; }
      const targetId = room.votes[voter.id];
      const target = targetId ? room.players.find(item => item.id === targetId && item.alive) : null;
      const weight = voter.role === 'mayor' && abilityEnabled(room, 'mayorDoubleVote') ? 2 : 1;
      if (!target || voter.id === target.id) { abstainCount += 1; continue; }
      tally[targetId] = (tally[targetId] || 0) + weight;
    }
    const highestVote = Math.max(0, ...Object.values(tally));
    const winners = Object.keys(tally).filter(id => tally[id] === highestVote);
    let message = 'Tidak ada kandidat yang memperoleh lebih dari 50% suara. Tidak ada pemain yang tereliminasi.';
    let eliminatedId = null;
    let eliminatedIds = [];
    let eliminations = [];
    const events = [];
    if (winners.length === 1 && highestVote > totalVoteWeight / 2) {
      const targetPlayer = room.players.find(item => item.id === winners[0] && item.alive);
      if (targetPlayer) {
        const outcome = this.eliminatePlayer(room, targetPlayer.id, 'vote');
        eliminatedIds = outcome.players.map(item => item.id);
        eliminations = outcome.details;
        eliminatedId = targetPlayer.id;
        message = outcome.players.map(item => item.name).join(' dan ') + ' tereliminasi melalui voting.';
        events.push('Pemain dengan mayoritas mutlak: ' + targetPlayer.name + ' (' + highestVote + '/' + totalVoteWeight + ' suara).');
        if (targetPlayer.role === 'jester' && abilityEnabled(room, 'jesterSoloWin')) room.winner = 'jester';
      }
    } else if (winners.length > 1) {
      message = 'Voting seri. Tidak ada pemain yang tereliminasi.';
      events.push('Suara tertinggi sama pada beberapa kandidat.');
    } else {
      events.push('Suara tertinggi ' + highestVote + '/' + totalVoteWeight + '; kandidat harus memperoleh lebih dari 50% suara.');
    }
    const voteTally = Object.entries(tally).map(([playerId, votes]) => ({
      name: room.players.find(item => item.id === playerId)?.name || 'Pemain', votes
    })).sort((left, right) => right.votes - left.votes || left.name.localeCompare(right.name, 'id'));
    room.lastResult = {
      kind: 'vote', message, eliminatedId, eliminatedIds, eliminations, events, voteTally,
      voteTotalWeight: totalVoteWeight, abstainCount,
      majorityVotesRequired: Math.floor(totalVoteWeight / 2) + 1,
      at: now, round: room.round
    };
    const hunterTriggerPending = !room.winner && room.players.some(item =>
      item.role === 'hunter' && !item.alive && !item.hunterUsed && eliminatedIds.includes(item.id)
    );
    if (!room.winner && !hunterTriggerPending) this.checkWinner(room);
    room.resultActions = {};
    room.resultResolved = !hunterTriggerPending;
    if (hunterTriggerPending) this.runBotResultActions(room);
    room.votingEndsAt = null;
    room.discussionEndsAt = null;
    room.resultEndsAt = room.winner ? null
      : now + Number(room.settings?.timers?.resultSeconds ?? 8) * 1000;
    room.phase = room.winner ? 'finished' : 'result';
    this.recordGameEvent(room, {
      kind: 'vote_result', phase: room.phase, title: 'Hasil voting ronde ' + room.round,
      message, events, eliminations, voteTally, at: now, round: room.round
    });
    this.recordGameFinished(room, now);
  }

  isSystemModerator(room) {
    const mode = room.activeModeratorMode || room.settings?.moderatorMode;
    return mode ? mode === 'system' : Number(room.settings?.roleCounts?.moderator ?? 0) === 1;
  }

  resolveSystemVoteIfReady(room, now) {
    if (!this.isSystemModerator(room) || room.phase !== 'voting') return;
    if (Number(room.votingEndsAt) > 0 && room.votingEndsAt <= now) this.finishVote(room, now);
  }

  async applyAction(room, player, body) {
    const type = String(body.type || '');
    const now = Date.now();
    const isModerator = Boolean(player === room.moderator || this.isCurrentModerator(room, player.id));
    const isHost = player.id === room.hostId;
    const canModerate = isModerator || (isHost && this.isSystemModerator(room));
    const requireModerator = () => {
      if (!canModerate) throw new HttpError(403, 'Hanya moderator yang dapat melakukan tindakan ini.');
    };
    const requirePlayer = () => {
      if (isModerator) throw new HttpError(403, 'Moderator tidak dapat melakukan aksi sebagai pemain.');
      if (player.isBotControlled) throw new HttpError(403, 'Aksi sedang dikendalikan BOT. Minta moderator mengembalikan kendali.');
    };
    const requirePhase = phase => {
      if (room.phase !== phase) throw new HttpError(409, 'Aksi tidak sesuai dengan fase permainan.');
    };
    const target = id => room.players.find(item => item.id === String(id || '') && item.alive);
    const checkWinner = () => this.checkWinner(room);

    if (type === 'kick_player') {
      if (!isHost && !isModerator) throw new HttpError(403, 'Hanya host atau moderator yang dapat mengeluarkan pemain.');
      const playerId = String(body.playerId || '').trim();
      if (!playerId) throw new HttpError(400, 'Pilih pemain yang akan dikeluarkan.');
      const playerIndex = room.players.findIndex(item => item.id === playerId);
      if (playerIndex < 0) throw new HttpError(404, 'Pemain tidak ditemukan di room.');
      const removed = room.players[playerIndex];
      if (removed.id === room.hostId || removed.isHost) {
        throw new HttpError(403, 'Host room tidak dapat dikeluarkan.');
      }

      const phaseBeforeKick = room.phase;
      room.players.splice(playerIndex, 1);
      const withoutPlayerReferences = (source, keep) => Object.fromEntries(
        Object.entries(source || {}).filter(([key, value]) => keep(key, value))
      );
      room.nightActions = withoutPlayerReferences(room.nightActions, (actorId, action) =>
        actorId !== playerId && action?.targetId !== playerId && action?.partnerId !== playerId
      );
      room.votes = withoutPlayerReferences(room.votes, (voterId, targetId) =>
        voterId !== playerId && targetId !== playerId
      );
      room.seerResults = withoutPlayerReferences(room.seerResults, (seerId, result) =>
        seerId !== playerId && result?.playerName !== removed.name
      );
      room.seerHistory = withoutPlayerReferences(room.seerHistory, (seerId, history) =>
        seerId !== playerId && !(history || []).some(item => item.targetId === playerId)
      );
      room.dawnActions = withoutPlayerReferences(room.dawnActions, (actorId, action) =>
        actorId !== playerId && action?.targetId !== playerId
      );
      room.botNightReports = withoutPlayerReferences(room.botNightReports, botId => botId !== playerId);
      room.villagerPrompts = withoutPlayerReferences(room.villagerPrompts, actorId => actorId !== playerId);
      room.witchPotions = withoutPlayerReferences(room.witchPotions, witchId => witchId !== playerId);
      room.guardianTargets = withoutPlayerReferences(room.guardianTargets, (guardianId, targetId) =>
        guardianId !== playerId && targetId !== playerId
      );
      room.bodyguardTargets = withoutPlayerReferences(room.bodyguardTargets, (guardId, targetId) =>
        guardId !== playerId && targetId !== playerId
      );
      room.nightSkippedPlayerIds = (room.nightSkippedPlayerIds || []).filter(id => id !== playerId);
      if (Array.isArray(room.lovers) && room.lovers.includes(playerId)) room.lovers = null;
      room.additionalWinners = (room.additionalWinners || []).filter(id => id !== playerId);
      room.chat = (room.chat || []).filter(message => message.playerId !== playerId);
      room.wolfChat = (room.wolfChat || []).filter(message => message.playerId !== playerId);

      if (phaseBeforeKick !== 'lobby' && phaseBeforeKick !== 'finished') {
        this.recordGameEvent(room, {
          kind: 'player_removed', phase: phaseBeforeKick, title: 'Pemain dikeluarkan',
          message: removed.name + ' dikeluarkan dari permainan oleh moderator.',
          eliminations: [{ name: removed.name, role: removed.role, cause: 'kick' }],
          at: now, round: room.round
        });
        if (phaseBeforeKick !== 'dawn' && checkWinner()) {
          room.phase = 'finished';
          this.recordGameFinished(room, now);
        } else if (phaseBeforeKick === 'role_draw' && this.isSystemModerator(room)
          && room.players.every(item => item.hasDrawn)) {
          await this.applyAction(room, room.moderator, { type: 'start_night' });
        } else if (phaseBeforeKick === 'night') {
          this.runBotNightActions(room);
        } else if (phaseBeforeKick === 'dawn') {
          this.runBotDawnActions(room);
        } else if (phaseBeforeKick === 'voting') {
          this.runBotVotes(room, now);
          this.resolveSystemVoteIfReady(room, now);
        }
      }
      return { kickedPlayerId: playerId };
    }

    if (type === 'replace_with_bot') {
      if (!isHost && !isModerator) throw new HttpError(403, 'Hanya host atau moderator yang dapat mengganti pemain dengan BOT.');
      if (room.phase === 'finished') throw new HttpError(409, 'Permainan sudah selesai.');
      if (room.phase === 'night' && Number(room.nightEndsAt) > 0 && now >= Number(room.nightEndsAt)) {
        throw new HttpError(409, 'Waktu tengah malam sudah berakhir.');
      }
      const playerId = String(body.playerId || '').trim();
      const selected = room.players.find(item => item.id === playerId);
      if (!selected) throw new HttpError(404, 'Pemain tidak ditemukan di room.');
      if (selected.id === room.hostId || selected.isHost) throw new HttpError(403, 'Host tidak dapat digantikan BOT.');
      if (selected.isBot) throw new HttpError(409, 'Pemain tersebut sudah dikendalikan BOT.');
      selected.isBot = true;
      selected.isBotControlled = true;
      selected.hasDrawn = true;
      selected.botControlledAt = now;
      this.recordGameEvent(room, {
        kind: 'player_bot_replaced', phase: room.phase, title: 'BOT mengambil alih pemain',
        message: selected.name + ' sementara digantikan BOT.', at: now, round: room.round
      });
      if (room.phase === 'role_draw' && this.isSystemModerator(room)
        && room.players.every(item => item.hasDrawn)) {
        await this.applyAction(room, room.moderator, { type: 'start_night' });
      } else if (room.phase === 'night') {
        this.runBotNightActions(room);
      } else if (room.phase === 'dawn') {
        this.runBotDawnActions(room);
      } else if (room.phase === 'voting') {
        this.runBotVotes(room, now);
      }
      return;
    }

    if (type === 'restore_player_control') {
      if (!isHost && !isModerator) throw new HttpError(403, 'Hanya host atau moderator yang dapat mengembalikan kendali pemain.');
      const playerId = String(body.playerId || '').trim();
      const selected = room.players.find(item => item.id === playerId);
      if (!selected || !selected.isBotControlled) throw new HttpError(404, 'Pemain yang dikendalikan BOT tidak ditemukan.');
      selected.isBot = false;
      selected.isBotControlled = false;
      delete selected.botControlledAt;
      this.recordGameEvent(room, {
        kind: 'player_control_restored', phase: room.phase, title: 'Kendali pemain dikembalikan',
        message: 'Kendali ' + selected.name + ' dikembalikan kepada pemain.', at: now, round: room.round
      });
      return;
    }

    if (type === 'update_settings') {
      requireModerator();
      requirePhase('lobby');
      room.settings = normalizeSettings(body.settings);
      return;
    }

    if (type === 'reset_to_lobby') {
      if (!isModerator && !isHost) throw new HttpError(403, 'Hanya host atau moderator yang dapat memulai ulang permainan.');
      if (room.phase === 'lobby') return;
      this.archiveCompletedGame(room, now);
      if (room.activeModeratorId && room.moderator
        && !room.players.some(item => item.id === room.activeModeratorId)) {
        const restored = { ...room.moderator };
        restored.role = null;
        restored.alive = true;
        restored.hasDrawn = false;
        restored.suspicionTargetId = null;
        restored.hunterUsed = false;
        restored.isHost = restored.id === room.hostId;
        const index = Number.isSafeInteger(room.activeModeratorRosterIndex)
          ? Math.max(0, Math.min(room.activeModeratorRosterIndex, room.players.length))
          : room.players.length;
        room.players.splice(index, 0, restored);
      }
      room.moderator = room.hostAccount || room.moderator;
      room.activeModeratorId = null;
      room.activeModeratorRosterIndex = null;
      room.phase = 'lobby';
      room.round = 0;
      room.botDiscussionRound = null;
      room.nightRevealEndsAt = null;
      room.roleDrawEndsAt = null;
      room.nightEndsAt = null;
      room.dawnEndsAt = null;
      room.resultEndsAt = null;
      room.dawnActions = {};
      room.resultActions = {};
      room.resultResolved = false;
      room.villageName = null;
      room.discussionEndsAt = null;
      room.votingEndsAt = null;
      room.activeModeratorMode = null;
      for (const item of room.players) {
        if (item.isBotControlled) {
          item.isBot = false;
          item.isBotControlled = false;
          delete item.botControlledAt;
        }
        item.role = null;
        item.alive = true;
        item.hasDrawn = false;
        item.suspicionTargetId = null;
        item.hunterUsed = false;
        item.reviverUsed = false;
        item.priestUsed = false;
        item.vigilanteUsed = false;
      }
      room.nightActions = {};
      room.nightSkippedPlayerIds = [];
      room.votes = {};
      room.seerResults = {};
      room.seerHistory = {};
      room.botNightReports = {};
      room.villagerPrompts = {};
      room.witchPotions = {};
      room.guardianTargets = {};
      room.bodyguardTargets = {};
      room.lovers = null;
      room.cupidUsed = false;
      room.additionalWinners = [];
      room.discussionMode = null;
      room.discussionEndsAt = null;
      room.roleDrawEndsAt = null;
      room.nightEndsAt = null;
      room.dawnEndsAt = null;
      room.votingEndsAt = null;
      room.resultEndsAt = null;
      room.dawnActions = {};
      room.resultActions = {};
      room.resultResolved = false;
      room.seerHistory = {};
      room.botNightReports = {};
      room.villageName = null;
      room.callUrl = '';
      room.chatRateLimit = {};
      room.wolfChat = [];
      room.lastResult = null;
      room.winner = null;
      room.gameId = null;
      room.gameStartedAt = null;
      room.gameHistory = [];
      room.gameHistoryTruncated = 0;
      room.gameFinishedRecorded = false;
      return;
    }

    if (type === 'leave_room') {
      requirePlayer();
      const leavingPlayer = room.players.find(item => item.id === player.id);
      if (!leavingPlayer) throw new HttpError(404, 'Pemain tidak ditemukan di room.');
      if (player.id === room.hostId) {
        throw new HttpError(403, 'Host tidak dapat keluar sendiri. Gunakan Bubarkan Room jika ingin menutup room.');
      }
      if (room.phase === 'lobby') {
        room.players = room.players.filter(item => item.id !== player.id);
        return;
      }
      if (room.phase === 'finished' || !leavingPlayer.alive) {
        leavingPlayer.connected = false;
        leavingPlayer.tokenHash = null;
        return;
      }
      const phaseBeforeLeave = room.phase;
      if (phaseBeforeLeave === 'role_draw') leavingPlayer.hasDrawn = true;
      const outcome = this.eliminatePlayer(room, leavingPlayer.id, 'left_room');
      leavingPlayer.connected = false;
      leavingPlayer.tokenHash = null;
      room.lastResult = {
        kind: 'leave',
        message: leavingPlayer.name + ' meninggalkan permainan dan tereliminasi.',
        eliminatedId: leavingPlayer.id,
        eliminatedIds: outcome.players.map(item => item.id),
        eliminations: outcome.details,
        events: [leavingPlayer.name + ' keluar dari room.'], at: now, round: room.round
      };
      this.recordGameEvent(room, {
        kind: 'player_left', phase: phaseBeforeLeave, title: 'Pemain keluar',
        message: room.lastResult.message, events: room.lastResult.events,
        eliminations: room.lastResult.eliminations, at: now, round: room.round
      });
      if (phaseBeforeLeave !== 'dawn' && checkWinner()) {
        room.phase = 'finished';
        this.recordGameFinished(room, now);
      }
      else if (phaseBeforeLeave === 'role_draw' && this.isSystemModerator(room) && room.players.every(item => item.hasDrawn)) {
        await this.applyAction(room, room.moderator, { type: 'start_night' });
      } else if (phaseBeforeLeave === 'night') this.runBotNightActions(room);
      else if (phaseBeforeLeave === 'dawn') this.runBotDawnActions(room);
      else if (phaseBeforeLeave === 'voting') this.resolveSystemVoteIfReady(room, now);
      return;
    }

    if (type === 'add_bots') {
      requireModerator();
      requirePhase('lobby');
      const count = Number(body.count ?? 5);
      if (!Number.isSafeInteger(count) || count < 1 || count > MAX_BOT_BATCH) {
        throw new HttpError(400, 'Jumlah bot per penambahan harus 1–' + MAX_BOT_BATCH + '. Tambahkan bot dalam beberapa tahap.');
      }
      for (let index = 0; index < count; index += 1) room.players.push(this.makeBot(room));
      return;
    }

    if (type === 'start_game') {
      requireModerator();
      requirePhase('lobby');
      const configuredModeratorMode = room.settings?.moderatorMode
        || (Number(room.settings?.roleCounts?.moderator ?? 0) === 1 ? 'system' : 'host');
      let selectedModerator = null;
      if (configuredModeratorMode === 'host') {
        selectedModerator = room.players.find(item => item.id === room.hostId) || null;
        if (!selectedModerator) throw new HttpError(409, 'Akun host tidak ditemukan dalam daftar pemain.');
      } else if (configuredModeratorMode === 'random') {
        const candidates = room.players.filter(item => !item.isBot && item.tokenHash);
        if (!candidates.length) throw new HttpError(409, 'Tidak ada pemain manusia yang dapat dipilih sebagai moderator.');
        selectedModerator = candidates[randomInt(candidates.length)];
      }
      const activePlayers = selectedModerator
        ? room.players.filter(item => item.id !== selectedModerator.id)
        : room.players;
      if (activePlayers.length < 2) {
        throw new HttpError(409, 'Minimal 2 pemain aktif diperlukan. Moderator tidak dihitung sebagai pemain.');
      }
      const deck = roleDeck(room.settings, activePlayers.length);
      // Randomize both the deck and the player slots independently so role assignment
      // never depends on join order or the visible player-list order.
      const randomizedSlots = shuffle(activePlayers);
      const roleAssignments = new Map(randomizedSlots.map((item, index) => [item.id, deck[index]]));
      if (selectedModerator) {
        room.activeModeratorRosterIndex = room.players.findIndex(item => item.id === selectedModerator.id);
        room.players = activePlayers;
        room.moderator = selectedModerator;
        room.activeModeratorId = selectedModerator.id;
      } else {
        room.moderator = room.hostAccount || room.moderator;
        room.activeModeratorId = null;
        room.activeModeratorRosterIndex = null;
      }
      room.activeModeratorMode = configuredModeratorMode;
      room.players.forEach(item => {
        item.role = roleAssignments.get(item.id);
        item.alive = true;
        item.hasDrawn = Boolean(item.isBot);
        item.suspicionTargetId = null;
        item.hunterUsed = false;
        item.reviverUsed = false;
        item.priestUsed = false;
        item.vigilanteUsed = false;
      });
      room.round = 1;
      room.botDiscussionRound = null;
      room.nightSkippedPlayerIds = [];
      room.phase = 'role_draw';
      room.roleDrawEndsAt = now + Number(room.settings?.timers?.roleDrawSeconds ?? 20) * 1000;
      room.nightEndsAt = null;
      room.dawnEndsAt = null;
      room.resultEndsAt = null;
      room.dawnActions = {};
      room.resultActions = {};
      room.resultResolved = false;
      room.seerHistory = {};
      room.botNightReports = {};
      const villageNames = ['Desa Waringin', 'Desa Rembulan', 'Desa Kabut', 'Desa Lembah Sunyi', 'Desa Purnama'];
      room.villageName = villageNames[randomInt(villageNames.length)];
      room.nightActions = {};
      room.nightSkippedPlayerIds = [];
      room.votes = {};
      room.seerResults = {};
      room.villagerPrompts = {};
      room.witchPotions = {};
      room.guardianTargets = {};
      room.lovers = null;
      room.cupidUsed = false;
      room.additionalWinners = [];
      room.players.forEach(item => {
        item.hunterUsed = false;
        item.reviverUsed = false;
        item.priestUsed = false;
        item.vigilanteUsed = false;
        if (item.role === 'witch') room.witchPotions[item.id] = {
          heal: abilityEnabled(room, 'witchHeal'),
          poison: abilityEnabled(room, 'witchPoison')
        };
      });
      room.chatRateLimit = {};
      room.wolfChat = [];
      room.lastResult = null;
      room.winner = null;
      room.gameId = crypto.randomUUID();
      room.gameStartedAt = now;
      room.gameHistory = [];
      room.gameHistoryTruncated = 0;
      room.gameFinishedRecorded = false;
      this.recordGameEvent(room, {
        kind: 'game_started', phase: 'role_draw', title: 'Permainan dimulai',
        message: 'Kartu dibagikan kepada ' + room.players.length + ' pemain.',
        at: now, round: room.round
      });
      if (this.isSystemModerator(room) && room.players.every(item => item.hasDrawn)) {
        await this.applyAction(room, room.moderator, { type: 'start_night' });
      }
      return;
    }

    if (type === 'draw_card') {
      requirePlayer();
      if (room.phase === 'lobby' || room.phase === 'finished') {
        throw new HttpError(409, 'Kartu hanya dapat dibuka setelah permainan dimulai.');
      }
      if (player.hasDrawn) throw new HttpError(409, 'Kartu sudah dibuka.');
      player.hasDrawn = true;
      if (room.phase === 'role_draw' && this.isSystemModerator(room)
        && room.players.every(item => item.hasDrawn)) {
        await this.applyAction(room, room.moderator, { type: 'start_night' });
      }
      return;
    }

    if (type === 'start_night') {
      requireModerator();
      requirePhase('role_draw');
      const cardsRemain = room.players.some(item => !item.hasDrawn);
      const cardDeadlinePassed = Number(room.roleDrawEndsAt) > 0 && room.roleDrawEndsAt <= now;
      if (cardsRemain && !cardDeadlinePassed) {
        throw new HttpError(409, 'Beri pemain waktu membuka kartu atau tunggu hitung mundur selesai.');
      }
      room.roleDrawEndsAt = null;
      room.phase = 'night';
      room.nightActions = {};
      room.nightSkippedPlayerIds = [];
      room.seerResults = {};
      room.nightEndsAt = now + Number(room.settings?.timers?.nightSeconds ?? 60) * 1000;
      room.dawnEndsAt = null;
      room.dawnActions = {};
      room.nightRevealEndsAt = null;
      room.discussionEndsAt = null;
      room.votingEndsAt = null;
      room.resultEndsAt = null;
      room.wolfChat = [];
      this.prepareVillagerPrompts(room);
      room.bodyguardTargets = {};
      room.lastResult = { kind: 'phase', message: 'Malam ' + room.round + ' dimulai.', at: now };
      this.recordGameEvent(room, {
        kind: 'night_started', phase: 'night', title: 'Malam ' + room.round + ' dimulai',
        message: 'Pemain menjalankan kemampuan malam.', at: now, round: room.round
      });
      this.runBotNightActions(room);
      return;
    }

    if (type === 'wolf_chat') {
      requirePlayer();
      requirePhase('night');
      if (!player.alive || !isWolf(player.role)) {
        throw new HttpError(403, 'Chat kawanan hanya tersedia untuk Werewolf yang masih hidup pada malam hari.');
      }
      const text = String(body.text || '').trim();
      if (!text) throw new HttpError(400, 'Pesan chat tidak boleh kosong.');
      if (text.length > 280) throw new HttpError(400, 'Pesan chat maksimal 280 karakter.');
      room.wolfChat = Array.isArray(room.wolfChat) ? room.wolfChat : [];
      room.wolfChat.push({
        id: crypto.randomUUID(),
        playerId: player.id,
        name: player.name,
        text,
        at: now
      });
      if (room.wolfChat.length > MAX_WOLF_CHAT_MESSAGES) {
        room.wolfChat.splice(0, room.wolfChat.length - MAX_WOLF_CHAT_MESSAGES);
      }
      return;
    }

    if (type === 'night_action') {
      requirePlayer();
      requirePhase('night');
      if (!player.alive) throw new HttpError(403, 'Pemain yang tereliminasi tidak dapat melakukan aksi.');
      if (Number(room.nightEndsAt) > 0 && now >= Number(room.nightEndsAt)) {
        throw new HttpError(409, 'Waktu aksi tengah malam sudah berakhir.');
      }
      if ((room.nightSkippedPlayerIds || []).includes(player.id)) {
        throw new HttpError(409, 'Aksi pemain ini telah dilewati moderator.');
      }
      if (body.mode === 'villager_math') {
        if (!canAnswerNightMath(room, player)) {
          throw new HttpError(403, 'Selesaikan kemampuan khusus role terlebih dahulu.');
        }
        const prompt = room.villagerPrompts?.[player.id];
        const choiceIndex = Number(body.choiceIndex);
        if (!prompt || prompt.id !== String(body.promptId || '')
          || !Number.isSafeInteger(choiceIndex) || choiceIndex < 0 || choiceIndex >= prompt.options.length) {
          throw new HttpError(400, 'Soal malam tidak valid atau sudah kedaluwarsa.');
        }
        const correctIndex = prompt.options.indexOf(prompt.answer);
        room.nightActions[player.id] = { type: 'villager_math', promptId: prompt.id, choiceIndex, correct: choiceIndex === correctIndex };
        this.runBotNightActions(room);
        return;
      }
      const selected = player.role === 'witch' && body.mode === 'heal' ? null : target(body.targetId);
      if (!selected && !(player.role === 'witch' && body.mode === 'heal')) {
        throw new HttpError(400, 'Target tidak ditemukan atau sudah tereliminasi.');
      }
      if (isWolf(player.role)) {
        if (isWolf(selected.role) || selected.id === player.id) {
          throw new HttpError(400, 'Werewolf tidak dapat memilih anggota kawanan sendiri.');
        }
        room.nightActions[player.id] = { type: 'wolf_vote', targetId: selected.id, submittedAt: now };
      } else if (player.role === 'doctor') {
        if (!abilityEnabled(room, 'doctorProtection')) throw new HttpError(403, 'Kemampuan Doctor dinonaktifkan.');
        room.nightActions[player.id] = { type: 'doctor_protect', targetId: selected.id };
      } else if (player.role === 'seer' || player.role === 'detective') {
        const ability = player.role === 'seer' ? 'seerInspection' : 'detectiveInspection';
        if (!abilityEnabled(room, ability)) throw new HttpError(403, 'Kemampuan pemeriksaan dinonaktifkan.');
        if (selected.id === player.id) throw new HttpError(400, 'Tidak dapat memeriksa diri sendiri.');
        if ((room.seerHistory?.[player.id] || []).some(item => item.targetId === selected.id)) {
          throw new HttpError(409, 'Pemain ini sudah pernah kamu periksa. Pilih pemain lain.');
        }
        room.nightActions[player.id] = { type: player.role === 'seer' ? 'seer_inspect' : 'detective_inspect', targetId: selected.id };
      } else if (player.role === 'bodyguard') {
        if (!abilityEnabled(room, 'bodyguardSacrifice')) throw new HttpError(403, 'Kemampuan Bodyguard dinonaktifkan.');
        if (selected.id === player.id) throw new HttpError(400, 'Bodyguard harus melindungi pemain lain.');
        room.nightActions[player.id] = { type: 'bodyguard_protect', targetId: selected.id };
      } else if (player.role === 'guardian_angel') {
        if (!abilityEnabled(room, 'guardianProtection') && !abilityEnabled(room, 'guardianBonus')) {
          throw new HttpError(403, 'Kemampuan Guardian Angel dinonaktifkan.');
        }
        if (selected.id === player.id) throw new HttpError(400, 'Guardian Angel harus memilih pemain lain.');
        room.guardianTargets[player.id] = selected.id;
        room.nightActions[player.id] = { type: 'guardian_protect', targetId: selected.id };
      } else if (player.role === 'priest') {
        if (!abilityEnabled(room, 'priestBlessing') || player.priestUsed) {
          throw new HttpError(403, 'Berkah Priest sudah digunakan atau dinonaktifkan.');
        }
        room.nightActions[player.id] = { type: 'priest_protect', targetId: selected.id };
      } else if (player.role === 'vigilante') {
        if (!abilityEnabled(room, 'vigilanteShot') || player.vigilanteUsed) {
          throw new HttpError(403, 'Tembakan Vigilante sudah digunakan atau dinonaktifkan.');
        }
        if (selected.id === player.id) throw new HttpError(400, 'Vigilante harus memilih pemain lain.');
        room.nightActions[player.id] = { type: 'vigilante_shot', targetId: selected.id };
      } else if (player.role === 'witch') {
        const mode = String(body.mode || '');
        const potions = room.witchPotions?.[player.id] || { heal: true, poison: true };
        if (mode === 'heal' && potions.heal) {
          const attack = wolfAttackSummary(room);
          if (!attack.ready) throw new HttpError(409, 'Tunggu semua Werewolf menyelesaikan pilihan serangan.');
          if (!attack.targetId) throw new HttpError(409, 'Tidak ada target serangan Werewolf yang dapat diselamatkan.');
          room.nightActions[player.id] = { type: 'witch_heal', targetId: attack.targetId };
        } else if (mode === 'poison' && potions.poison && selected.id !== player.id) {
          room.nightActions[player.id] = { type: 'witch_poison', targetId: selected.id };
        } else throw new HttpError(400, 'Ramuan tidak tersedia atau pilihan tidak valid.');
      } else if (player.role === 'cupid' && room.round === 1 && !room.cupidUsed && abilityEnabled(room, 'cupidBond')) {
        const partner = target(body.partnerId);
        if (!partner || partner.id === selected.id || selected.id === player.id || partner.id === player.id) {
          throw new HttpError(400, 'Cupid harus memilih dua pemain berbeda selain dirinya.');
        }
        room.nightActions[player.id] = { type: 'cupid_link', targetId: selected.id, partnerId: partner.id };
      } else {
        throw new HttpError(403, 'Peran ini tidak memiliki aksi malam.');
      }
      this.runBotNightActions(room);
      return;
    }

    if (type === 'night_pass') {
      requirePlayer();
      requirePhase('night');
      throw new HttpError(409, 'Aksi malam tidak menggunakan Pass. Pilih kemampuan role atau jawab soal perhitungan.');
    }

    if (type === 'skip_missing_night') {
      requireModerator();
      requirePhase('night');
      if (Number(room.nightEndsAt) > 0 && now >= Number(room.nightEndsAt)) {
        throw new HttpError(409, 'Waktu tengah malam sudah berakhir.');
      }
      const skipped = new Set(room.nightSkippedPlayerIds || []);
      const missing = room.players.filter(item => item.alive
        && !room.nightActions?.[item.id] && !skipped.has(item.id));
      if (!missing.length) throw new HttpError(409, 'Semua pemain sudah menyelesaikan aksi malam.');
      room.nightSkippedPlayerIds = [...skipped, ...missing.map(item => item.id)];
      return;
    }

    if (type === 'resolve_night') {
      requireModerator();
      requirePhase('night');
      const actors = room.players.filter(item => item.alive);
      const resolvedNightActions = { ...(room.nightActions || {}) };
      const skipped = new Set(room.nightSkippedPlayerIds || []);
      const missing = actors.filter(item => !resolvedNightActions[item.id] || skipped.has(item.id));
      const pending = actors.filter(item => !resolvedNightActions[item.id] && !skipped.has(item.id));
      if (pending.length && body.force !== true) {
        throw new HttpError(409, 'Belum semua pemain yang hidup menyelesaikan aksi malam.');
      }
      const wolfVotes = {};
      const protectedIds = new Set();
      const poisonTargets = [];
      const vigilanteTargets = [];
      let victimId = null;
      const cupidWasUsed = Boolean(room.cupidUsed);
      for (const actor of actors) {
        const action = room.nightActions[actor.id];
        if (!action) continue;
        if (action.type === 'wolf_vote') {
          const weight = actor.role === 'alpha_wolf' && abilityEnabled(room, 'alphaDoubleVote') ? 2 : 1;
          wolfVotes[action.targetId] = (wolfVotes[action.targetId] || 0) + weight;
        }
        if (action.type === 'doctor_protect') protectedIds.add(action.targetId);
        if (action.type === 'priest_protect' && abilityEnabled(room, 'priestBlessing')) protectedIds.add(action.targetId);
        if (action.type === 'guardian_protect' && abilityEnabled(room, 'guardianProtection')) protectedIds.add(action.targetId);
        if (action.type === 'bodyguard_protect') {
          const guard = room.players.find(item => item.id === actor.id && item.alive);
          if (guard) room.bodyguardTargets = { ...(room.bodyguardTargets || {}), [guard.id]: action.targetId };
        }
        if (action.type === 'witch_heal') {
          const potions = room.witchPotions[actor.id] || { heal: true, poison: true };
          potions.heal = false;
          room.witchPotions[actor.id] = potions;
        }
        if (action.type === 'vigilante_shot') {
          vigilanteTargets.push(action.targetId);
          actor.vigilanteUsed = true;
        }
        if (action.type === 'priest_protect') actor.priestUsed = true;
        if (action.type === 'witch_poison') {
          poisonTargets.push(action.targetId);
          const potions = room.witchPotions[actor.id] || { heal: true, poison: true };
          potions.poison = false;
          room.witchPotions[actor.id] = potions;
        }
        if (action.type === 'seer_inspect' || action.type === 'detective_inspect') {
          const inspected = room.players.find(item => item.id === action.targetId);
          const wolf = inspected && isWolf(inspected.role);
          const inspection = {
            round: room.round,
            targetId: inspected?.id || action.targetId,
            playerName: inspected ? inspected.name : 'Pemain tidak ditemukan',
            result: action.type === 'detective_inspect'
              ? (wolf ? 'wolf_team' : NEUTRAL_ROLES.has(inspected?.role) ? 'neutral' : 'village')
              : (wolf ? 'wolf' : 'not_wolf')
          };
          room.seerResults[actor.id] = inspection;
          room.seerHistory = room.seerHistory || {};
          room.seerHistory[actor.id] = Array.isArray(room.seerHistory[actor.id]) ? room.seerHistory[actor.id] : [];
          if (!room.seerHistory[actor.id].some(item => item.targetId === inspection.targetId)) {
            room.seerHistory[actor.id].push(inspection);
          }
        }
        if (action.type === 'cupid_link' && room.round === 1 && !room.cupidUsed) {
          room.lovers = [action.targetId, action.partnerId];
          room.cupidUsed = true;
        }
        if (action.type === 'guardian_protect' && !room.guardianTargets?.[actor.id]) {
          room.guardianTargets = { ...(room.guardianTargets || {}), [actor.id]: action.targetId };
        }
      }
      const highest = Math.max(0, ...Object.values(wolfVotes));
      const wolfAttack = wolfAttackSummary(room, body.force === true);
      victimId = wolfAttack.targetId;
      const events = [];
      if (wolfAttack.tied && victimId) {
        events.push('Pilihan Werewolf terbagi sama kuat; target dengan suara terbanyak dipilih berdasarkan suara yang masuk lebih dahulu.');
      }
      if (!cupidWasUsed && room.cupidUsed && room.lovers?.length === 2) {
        const linkedNames = room.lovers.map(id => room.players.find(item => item.id === id)?.name).filter(Boolean);
        if (linkedNames.length === 2) events.push('Cupid mengikat ' + linkedNames.join(' dan ') + '.');
      }
      let message = 'Malam berlalu tanpa korban.';
      let eliminatedId = null;
      const doctorHeal = actors.some(actor => room.nightActions[actor.id]?.type === 'witch_heal');
      let bodyguardInterception = null;
      if (victimId && !protectedIds.has(victimId) && !doctorHeal) {
        const guard = Object.entries(room.bodyguardTargets || {}).find(([guardId, targetId]) => targetId === victimId
          && room.players.some(item => item.id === guardId && item.alive));
        if (guard) bodyguardInterception = guard[0];
      }
      const deaths = [];
      if (victimId && !protectedIds.has(victimId) && !doctorHeal) {
        if (bodyguardInterception) deaths.push({ id: bodyguardInterception, cause: 'bodyguard_sacrifice' });
        else deaths.push({ id: victimId, cause: 'werewolf_attack' });
      }
      for (const id of vigilanteTargets) {
        if (!deaths.some(item => item.id === id)) deaths.push({ id, cause: 'vigilante_shot' });
      }
      for (const id of poisonTargets) {
        if (!deaths.some(item => item.id === id)) deaths.push({ id, cause: 'witch_poison' });
      }
      const eliminated = [];
      const eliminations = [];
      for (const death of deaths) {
        if (!room.players.some(item => item.id === death.id && item.alive)) continue;
        const outcome = this.eliminatePlayer(room, death.id, death.cause);
        eliminated.push(...outcome.players);
        eliminations.push(...outcome.details);
      }

      const attackedPlayer = victimId ? room.players.find(item => item.id === victimId) : null;
      if (victimId && (protectedIds.has(victimId) || doctorHeal)) {
        events.push('Target serangan Werewolf: ' + (attackedPlayer?.name || 'tidak diketahui') + '; serangan berhasil digagalkan oleh perlindungan.');
      } else if (bodyguardInterception) {
        const guard = room.players.find(item => item.id === bodyguardInterception);
        events.push('Bodyguard ' + (guard?.name || 'tidak diketahui') + ' mengorbankan diri untuk melindungi ' + (attackedPlayer?.name || 'target') + '.');
      } else if (victimId) {
        events.push('Werewolf menyerang ' + (attackedPlayer?.name || 'target tidak diketahui') + '.');
      }
      for (const id of vigilanteTargets) {
        const shot = room.players.find(item => item.id === id);
        events.push('Vigilante menembak ' + (shot?.name || 'target tidak diketahui') + '.');
      }
      for (const id of poisonTargets) {
        const poisoned = room.players.find(item => item.id === id);
        events.push('Witch menggunakan racun kepada ' + (poisoned?.name || 'target tidak diketahui') + '.');
      }

      if (eliminated.length) {
        eliminatedId = eliminated[0].id;
        message = eliminated.map(item => item.name).join(' dan ') + ' tereliminasi pada malam hari.';
        events.push('Korban akhir: ' + eliminated.map(item => item.name).join(', ') + '.');
      } else if (victimId && (protectedIds.has(victimId) || doctorHeal)) {
        message = 'Serangan Werewolf berhasil digagalkan oleh perlindungan.';
      } else if (highest > 0 && !victimId) {
        message = 'Serangan Werewolf tidak menghasilkan target yang sah.';
        events.push('Tidak ada target serangan Werewolf yang sah.');
      } else if (!events.length) {
        events.push('Tidak ada aksi malam yang menyebabkan perubahan pada pemain.');
      }
      const actionReport = [];
      const reportTargetName = id => room.players.find(item => item.id === id)?.name || 'Pemain';
      const reportRoleName = role => ({
        wolf: 'Werewolf', alpha_wolf: 'Alpha Wolf', seer: 'Seer', doctor: 'Doctor',
        bodyguard: 'Bodyguard', witch: 'Witch', hunter: 'Hunter', cupid: 'Cupid',
        guardian_angel: 'Guardian Angel', detective: 'Detective', mayor: 'Mayor',
        priest: 'Priest', vigilante: 'Vigilante', mason: 'Mason', reviver: 'Reviver',
        jester: 'Jester', villager: 'Warga Desa'
      })[role] || 'Role';
      const addActionReport = (order, role, actor, action, outcome) => {
        actionReport.push({ order, role, actor, action, outcome });
      };

      // Moderator narration follows the game's night-call order.
      const cupidActor = actors.find(actor => resolvedNightActions[actor.id]?.type === 'cupid_link');
      if (cupidActor && room.lovers?.length === 2) {
        const linkedNames = room.lovers.map(reportTargetName);
        addActionReport(10, 'Cupid', cupidActor.name,
          'Mengikat ' + linkedNames.join(' dan '), 'Pasangan berhasil terhubung.');
      }

      const wolfActors = actors
        .filter(actor => resolvedNightActions[actor.id]?.type === 'wolf_vote')
        .sort((left, right) =>
          (Number(resolvedNightActions[left.id].submittedAt) || 0)
          - (Number(resolvedNightActions[right.id].submittedAt) || 0)
        );
      const wolfChoices = wolfActors.map(actor => {
        const action = resolvedNightActions[actor.id];
        const weight = actor.role === 'alpha_wolf' && abilityEnabled(room, 'alphaDoubleVote') ? 2 : 1;
        return actor.name + ' → ' + reportTargetName(action.targetId) + (weight > 1 ? ' (' + weight + ' suara)' : '');
      });
      let wolfOutcome = victimId
        ? 'Target akhir: ' + reportTargetName(victimId) + ' (' + (wolfVotes[victimId] || 0) + ' suara).'
        : 'Tidak ada target serangan yang sah.';
      if (wolfAttack.tied) wolfOutcome += ' Suara seri; dipilih berdasarkan suara pertama.';
      addActionReport(20, 'Werewolf', wolfActors.map(actor => actor.name).join(', ') || 'Kawanan',
        wolfChoices.length ? 'Pilihan: ' + wolfChoices.join('; ') : 'Tidak ada pilihan serangan yang masuk.',
        wolfOutcome
      );

      for (const actor of actors) {
        const action = resolvedNightActions[actor.id];
        if (!action) continue;
        const targetName = action.targetId ? reportTargetName(action.targetId) : '';
        if (action.type === 'seer_inspect') {
          const result = room.seerResults?.[actor.id];
          const verdict = result?.result === 'wolf' ? 'Werewolf'
            : result?.result === 'not_wolf' ? 'bukan Werewolf' : 'belum diketahui';
          addActionReport(30, 'Seer', actor.name, 'Memeriksa ' + (result?.playerName || targetName),
            'Hasil: ' + verdict + '.');
        } else if (action.type === 'detective_inspect') {
          const result = room.seerResults?.[actor.id];
          const verdict = result?.result === 'wolf_team' ? 'kubu Werewolf'
            : result?.result === 'neutral' ? 'kubu Netral'
              : result?.result === 'village' ? 'kubu Desa' : 'belum diketahui';
          addActionReport(40, 'Detective', actor.name, 'Memeriksa ' + (result?.playerName || targetName),
            'Hasil: ' + verdict + '.');
        } else if (action.type === 'doctor_protect') {
          addActionReport(50, 'Doctor', actor.name, 'Melindungi ' + targetName,
            victimId === action.targetId ? 'Perlindungan berhasil; target selamat.' : 'Target tidak terkena serangan.');
        } else if (action.type === 'priest_protect') {
          addActionReport(55, 'Priest', actor.name, 'Memberkati ' + targetName,
            victimId === action.targetId ? 'Berkah menahan serangan Werewolf.' : 'Target tidak terkena serangan.');
        } else if (action.type === 'bodyguard_protect') {
          const outcome = bodyguardInterception === actor.id
            ? 'Bodyguard mengorbankan diri; target selamat.'
            : victimId === action.targetId && (protectedIds.has(action.targetId) || doctorHeal)
              ? 'Target selamat oleh perlindungan lain.'
              : 'Tidak terpicu malam ini.';
          addActionReport(60, 'Bodyguard', actor.name, 'Menjaga ' + targetName, outcome);
        } else if (action.type === 'guardian_protect') {
          const canProtect = abilityEnabled(room, 'guardianProtection');
          addActionReport(70, 'Guardian Angel', actor.name,
            (canProtect ? 'Melindungi ' : 'Menetapkan target bonus kemenangan: ') + targetName,
            !canProtect ? 'Perlindungan malam nonaktif.'
              : victimId === action.targetId ? 'Target terlindungi dari serangan.' : 'Target tidak terkena serangan.');
        } else if (action.type === 'witch_heal') {
          addActionReport(80, 'Witch', actor.name, 'Memakai ramuan penyembuh pada ' + targetName,
            victimId === action.targetId ? 'Target serangan berhasil diselamatkan.' : 'Tidak ada serangan pada target.');
        } else if (action.type === 'witch_poison') {
          const poisoned = eliminated.some(item => item.id === action.targetId);
          addActionReport(81, 'Witch', actor.name, 'Memakai racun pada ' + targetName,
            poisoned ? 'Target tereliminasi.' : 'Target tidak tereliminasi.');
        } else if (action.type === 'vigilante_shot') {
          const shot = eliminated.some(item => item.id === action.targetId);
          addActionReport(85, 'Vigilante', actor.name, 'Menembak ' + targetName,
            shot ? 'Target tereliminasi.' : 'Target sudah gugur atau tidak dapat ditembak.');
        } else if (action.type === 'villager_math') {
          const prompt = room.villagerPrompts?.[actor.id];
          addActionReport(90, reportRoleName(actor.role), actor.name,
            'Menjawab perhitungan ' + (prompt?.question || 'malam'),
            action.correct === true ? 'Jawaban benar.' : action.correct === false ? 'Jawaban salah.' : 'Jawaban diterima.'
          );
        }
      }
      if (missing.length) {
        addActionReport(105, 'Aksi belum masuk',
          missing.map(actor => actor.name + ' (' + reportRoleName(actor.role) + ')').join(', '),
          'Belum mengirim aksi.', 'Dilewati saat moderator memaksa pagi.'
        );
      }
      addActionReport(110, 'Hasil akhir', 'Moderator', 'Resolusi malam',
        eliminated.length
          ? 'Tereliminasi: ' + eliminated.map(item => item.name).join(', ') + '.'
          : 'Tidak ada korban malam ini.'
      );
      actionReport.sort((left, right) =>
        left.order - right.order || left.actor.localeCompare(right.actor, 'id')
      );

      room.lastResult = {
        kind: 'night',
        message,
        eliminatedId,
        eliminatedIds: eliminated.map(item => item.id),
        eliminations,
        events,
        actionReport,
        at: now,
        round: room.round
      };
      room.botNightReports = {};
      const reportName = id => room.players.find(item => item.id === id)?.name || 'pemain';
      for (const bot of room.players.filter(item => item.isBot)) {
        const action = resolvedNightActions[bot.id];
        const targetName = action?.targetId ? reportName(action.targetId) : '';
        let text = 'Aku menyelesaikan perhitungan malam tadi; belum ada petunjuk khusus yang bisa kubagikan.';
        if (action?.type === 'wolf_vote') text = 'Aku ikut menentukan sasaran malam tadi: ' + targetName + '. Menurutku kita perlu membahas mengapa dia menjadi sasaran.';
        else if (action?.type === 'seer_inspect') {
          const clue = room.seerResults?.[bot.id];
          text = 'Aku memeriksa ' + (clue?.playerName || targetName) + ' tadi malam. Hasilnya: '
            + (clue?.result === 'wolf' ? 'dia terdeteksi sebagai Werewolf.' : 'dia bukan Werewolf.');
        } else if (action?.type === 'detective_inspect') {
          const clue = room.seerResults?.[bot.id];
          const verdict = clue?.result === 'wolf_team' ? 'kubu Werewolf' : clue?.result === 'neutral' ? 'kubu Netral' : 'kubu Desa';
          text = 'Aku menyelidiki ' + (clue?.playerName || targetName) + ' tadi malam. Dia berada di ' + verdict + '.';
        } else if (action?.type === 'doctor_protect') text = 'Aku melindungi ' + targetName + ' tadi malam. Semoga perlindungan itu berguna.';
        else if (action?.type === 'bodyguard_protect') text = 'Aku berjaga untuk ' + targetName + ' tadi malam.';
        else if (action?.type === 'guardian_protect') text = 'Aku memilih menjaga ' + targetName + ' tadi malam.';
        else if (action?.type === 'priest_protect') text = 'Aku memberikan berkah perlindungan kepada ' + targetName + ' tadi malam.';
        else if (action?.type === 'vigilante_shot') text = 'Aku melepaskan tembakan ke arah ' + targetName + ' tadi malam.';
        else if (action?.type === 'witch_heal') text = 'Aku menggunakan ramuan penyembuh untuk menyelamatkan ' + targetName + ' tadi malam.';
        else if (action?.type === 'witch_poison') text = 'Aku menggunakan racun pada ' + targetName + ' tadi malam.';
        else if (action?.type === 'cupid_link') text = 'Aku mengikat ' + targetName + ' dan ' + reportName(action.partnerId) + ' sebagai pasangan.';
        room.botNightReports[bot.id] = { round: room.round, text };
      }
      room.nightActions = {};
      room.nightSkippedPlayerIds = [];
      room.wolfChat = [];
      room.nightRevealEndsAt = null;
      room.nightEndsAt = null;
      room.dawnActions = {};
      room.dawnEndsAt = now + Number(room.settings?.timers?.dawnSeconds ?? 20) * 1000;
      room.resultEndsAt = null;
      room.phase = 'dawn';
      room.discussionMode = null;
      room.discussionEndsAt = null;
      room.votingEndsAt = null;
      room.callUrl = '';
      this.runBotDawnActions(room);
      this.recordGameEvent(room, {
        kind: 'night_result', phase: 'dawn', title: 'Subuh · Hasil malam ' + room.round,
        message: room.lastResult.message, events: room.lastResult.events,
        eliminations: room.lastResult.eliminations, actionReport: room.lastResult.actionReport,
        at: now, round: room.round
      });
      return;
    }

    if (type === 'dawn_action') {
      requirePlayer();
      requirePhase('dawn');
      if (Number(room.dawnEndsAt) > 0 && now >= Number(room.dawnEndsAt)) {
        throw new HttpError(409, 'Waktu subuh sudah berakhir.');
      }
      const nightDeadIds = new Set(room.lastResult?.kind === 'night'
        ? (room.lastResult.eliminations || []).map(item => item.id) : []);
      if (player.role === 'hunter' && !player.alive && nightDeadIds.has(player.id)
        && !player.hunterUsed && abilityEnabled(room, 'hunterShot')) {
        const selected = target(body.targetId);
        if (!selected || selected.id === player.id) throw new HttpError(400, 'Pilih pemain hidup untuk ditembak.');
        room.dawnActions[player.id] = { type: 'hunter_shot', targetId: selected.id };
      } else if (player.role === 'reviver' && player.alive && !player.reviverUsed
        && abilityEnabled(room, 'reviverOnce')) {
        const selected = room.players.find(item => item.id === String(body.targetId || '')
          && nightDeadIds.has(item.id) && !item.alive);
        if (!selected) throw new HttpError(400, 'Pilih satu korban yang gugur pada malam ini.');
        room.dawnActions[player.id] = { type: 'revive_player', targetId: selected.id };
      } else {
        throw new HttpError(403, 'Tidak ada kemampuan subuh yang dapat digunakan.');
      }
      return;
    }

    if (type === 'resolve_dawn') {
      requireModerator();
      requirePhase('dawn');
      const nightDeadIds = new Set(room.lastResult?.kind === 'night'
        ? (room.lastResult.eliminations || []).map(item => item.id) : []);
      const eligible = room.players.filter(item =>
        item.role === 'hunter' && !item.alive && nightDeadIds.has(item.id)
          && !item.hunterUsed && abilityEnabled(room, 'hunterShot')
        || item.role === 'reviver' && item.alive && !item.reviverUsed
          && abilityEnabled(room, 'reviverOnce') && nightDeadIds.size > 0
      );
      const pending = eligible.filter(item => !room.dawnActions?.[item.id]);
      const deadlinePassed = Number(room.dawnEndsAt) > 0 && Number(room.dawnEndsAt) <= now;
      if (pending.length && body.force !== true && !deadlinePassed) {
        throw new HttpError(409, 'Tunggu aksi Hunter dan Reviver atau sampai waktu subuh berakhir.');
      }

      const events = [];
      const dawnEliminations = [];
      const dawnReport = [];
      const reportName = id => room.players.find(item => item.id === id)?.name || 'pemain';

      // Revive first, so a Hunter who is saved during dawn no longer fires.
      for (const actor of room.players.filter(item => item.role === 'reviver' && item.alive)) {
        const action = room.dawnActions?.[actor.id];
        if (action?.type !== 'revive_player' || actor.reviverUsed || !abilityEnabled(room, 'reviverOnce')) continue;
        const targetPlayer = room.players.find(item => item.id === action.targetId
          && nightDeadIds.has(item.id) && !item.alive);
        if (!targetPlayer) continue;
        targetPlayer.alive = true;
        actor.reviverUsed = true;
        events.push(targetPlayer.name + ' kembali hidup setelah dibangkitkan saat subuh.');
        dawnReport.push({
          order: 120, role: 'Reviver', actor: actor.name,
          action: 'Membangkitkan ' + targetPlayer.name,
          outcome: 'Berhasil; kemampuan Reviver telah digunakan.'
        });
      }

      for (const actor of room.players.filter(item => item.role === 'hunter' && !item.alive)) {
        const action = room.dawnActions?.[actor.id];
        if (action?.type !== 'hunter_shot' || actor.hunterUsed || !nightDeadIds.has(actor.id)
          || actor.alive || !abilityEnabled(room, 'hunterShot')) continue;
        const targetPlayer = room.players.find(item => item.id === action.targetId && item.alive);
        if (!targetPlayer) continue;
        actor.hunterUsed = true;
        const outcome = this.eliminatePlayer(room, targetPlayer.id, 'hunter');
        dawnEliminations.push(...outcome.details);
        events.push('Terdengar satu tembakan dari arah ' + actor.name + '. ' + outcome.players.map(item => item.name).join(' dan ') + ' gugur.');
        dawnReport.push({
          order: 130, role: 'Hunter', actor: actor.name,
          action: 'Menembak ' + targetPlayer.name,
          outcome: 'Tembakan dilepaskan saat subuh.'
        });
      }

      const originalEliminations = (room.lastResult?.eliminations || []).filter(item => {
        const current = room.players.find(player => player.id === item.id);
        return current && !current.alive;
      });
      const eliminations = [...originalEliminations, ...dawnEliminations];
      const eliminatedIds = [...new Set(eliminations.map(item => item.id))];
      room.lastResult = room.lastResult || { kind: 'night', events: [], actionReport: [] };
      room.lastResult.eliminations = eliminations;
      room.lastResult.eliminatedIds = eliminatedIds;
      room.lastResult.eliminatedId = eliminatedIds[0] || null;
      if (eliminations.length) {
        room.lastResult.message = eliminations.map(item => item.name).join(' dan ') + ' ditemukan gugur setelah malam berlalu.';
      } else if (events.some(item => /kembali hidup/.test(item))) {
        room.lastResult.message = 'Korban malam berhasil diselamatkan. Desa menyambut pagi tanpa kehilangan warga.';
      } else if (!room.lastResult.message || room.lastResult.message === 'Malam berlalu tanpa korban.') {
        room.lastResult.message = 'Tak seorang pun ditemukan gugur malam ini.';
      }
      room.lastResult.events = [...(room.lastResult.events || []), ...events];
      room.lastResult.actionReport = [...(room.lastResult.actionReport || []), ...dawnReport]
        .sort((left, right) => left.order - right.order || left.actor.localeCompare(right.actor, 'id'));
      room.lastResult.at = now;
      room.dawnActions = {};
      room.dawnEndsAt = null;
      room.nightEndsAt = null;
      room.resultEndsAt = null;
      room.votingEndsAt = null;
      room.callUrl = '';

      for (const bot of room.players.filter(item => item.isBot)) {
        const action = dawnReport.find(item => item.actor === bot.name);
        if (!action) continue;
        const report = room.botNightReports?.[bot.id];
        const extra = action.role === 'Reviver'
          ? 'Saat subuh, aku membangkitkan ' + action.action.replace('Membangkitkan ', '') + '.'
          : 'Saat subuh, aku menembak ' + action.action.replace('Menembak ', '') + '.';
        room.botNightReports[bot.id] = {
          round: room.round,
          text: (report?.round === room.round ? report.text + ' ' : '') + extra
        };
      }

      const hasWinner = this.checkWinner(room);
      room.phase = hasWinner ? 'finished' : 'morning';
      room.discussionMode = null;
      room.discussionEndsAt = hasWinner ? null
        : now + Number(room.settings?.timers?.discussionSeconds ?? 30) * 1000;
      if (!hasWinner) this.seedBotDiscussion(room, now);
      this.recordGameEvent(room, {
        kind: 'dawn_result', phase: room.phase, title: 'Hasil subuh ronde ' + room.round,
        message: room.lastResult.message, events: room.lastResult.events,
        eliminations: room.lastResult.eliminations, actionReport: room.lastResult.actionReport,
        at: now, round: room.round
      });
      this.recordGameFinished(room, now);
      return;
    }

    if (type === 'send_discussion_chat') {
      if (!isModerator && !player.alive && room.phase !== 'finished') {
        throw new HttpError(403, 'Pemain yang tereliminasi hanya dapat membaca chat sampai permainan selesai.');
      }
      if (!isModerator && player.isBotControlled) {
        throw new HttpError(403, 'Chat dinonaktifkan selama BOT mengambil alih pemain ini.');
      }
      const text = String(body.text || '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
      if (!text) throw new HttpError(400, 'Pesan chat tidak boleh kosong.');
      if (text.length > 280) throw new HttpError(400, 'Pesan maksimal 280 karakter.');
      room.chatRateLimit = room.chatRateLimit || {};
      const lastSentAt = Number(room.chatRateLimit[player.id]) || 0;
      if (now - lastSentAt < 500) throw new HttpError(429, 'Tunggu sebentar sebelum mengirim pesan lagi.');
      room.chatRateLimit[player.id] = now;
      room.chat = Array.isArray(room.chat) ? room.chat : [];
      room.chat.push({
        id: crypto.randomUUID(),
        playerId: player.id,
        name: player.name,
        text,
        at: now,
        isBot: false,
        isModerator
      });
      if (room.chat.length > MAX_CHAT_MESSAGES) room.chat.splice(0, room.chat.length - MAX_CHAT_MESSAGES);
      return;
    }

    if (type === 'start_discussion') {
      requireModerator();
      requirePhase('morning');
      if (room.winner) {
        room.phase = 'finished';
        return;
      }
      room.phase = 'discussion';
      room.discussionMode = room.settings?.gameMode === 'online' ? 'online' : 'offline';
      room.discussionEndsAt = null;
      room.votingEndsAt = null;
      room.callUrl = '';
      this.seedBotDiscussion(room, now);
      this.recordGameEvent(room, {
        kind: 'discussion_started', phase: 'discussion', title: 'Diskusi ronde ' + room.round,
        message: 'Fase diskusi dimulai.', at: now, round: room.round
      });
      return;
    }

    if (type === 'set_discussion') {
      requireModerator();
      requirePhase('discussion');
      if (String(body.mode || 'offline') !== 'offline') {
        throw new HttpError(400, 'Diskusi hanya tersedia secara offline.');
      }
      room.discussionMode = 'offline';
      room.callUrl = '';
      room.discussionEndsAt = null;
      return;
    }


    if (type === 'start_voting') {
      requireModerator();
      if (!['morning', 'discussion'].includes(room.phase)) {
        throw new HttpError(409, 'Voting hanya dapat dimulai setelah diskusi pagi.');
      }
      if (room.discussionEndsAt && now < room.discussionEndsAt) {
        throw new HttpError(409, 'Waktu diskusi belum selesai.');
      }
      room.discussionMode = room.settings?.gameMode === 'online' ? 'online' : 'offline';
      room.callUrl = '';
      room.discussionEndsAt = null;
      room.phase = 'voting';
      room.votingEndsAt = now + Number(room.settings?.timers?.votingSeconds ?? 15) * 1000;
      room.resultEndsAt = null;
      room.votes = {};
      this.recordGameEvent(room, {
        kind: 'voting_started', phase: 'voting', title: 'Voting ronde ' + room.round,
        message: 'Voting dimulai. Pilihan setiap pemain tetap rahasia.',
        at: now, round: room.round
      });
      this.runBotVotes(room, now);
      this.resolveSystemVoteIfReady(room, now);
      return;
    }

    if (type === 'hunter_shot') {
      requirePlayer();
      requirePhase('result');
      if (room.resultResolved || Number(room.resultEndsAt) > 0 && now >= Number(room.resultEndsAt)) {
        throw new HttpError(409, 'Waktu tembakan Hunter sudah berakhir.');
      }
      if (player.role !== 'hunter' || player.alive || player.hunterUsed || !abilityEnabled(room, 'hunterShot')) {
        throw new HttpError(403, 'Kemampuan Hunter tidak tersedia.');
      }
      const selected = target(body.targetId);
      if (!selected || selected.id === player.id) throw new HttpError(400, 'Pilih target yang masih hidup.');
      room.resultActions[player.id] = { type: 'hunter_shot', targetId: selected.id };
      return;
    }

    if (type === 'cast_vote') {
      requirePlayer();
      requirePhase('voting');
      if (!player.alive) throw new HttpError(403, 'Pemain yang tereliminasi tidak dapat melakukan voting.');
      if (room.votingEndsAt && now >= room.votingEndsAt) {
        this.finishVote(room, now);
        return;
      }
      if (body.abstain === true || body.targetId === 'abstain') room.votes[player.id] = null;
      else {
        const selected = target(body.targetId);
        if (!selected || selected.id === player.id) throw new HttpError(400, 'Pilih pemain lain yang masih hidup atau abstain.');
        room.votes[player.id] = selected.id;
      }
      this.resolveSystemVoteIfReady(room, now);
      return;
    }

    if (type === 'resolve_vote') {
      requireModerator();
      requirePhase('voting');
      const alivePlayers = room.players.filter(item => item.alive);
      const missing = alivePlayers.filter(item => !Object.prototype.hasOwnProperty.call(room.votes, item.id));
      if (missing.length && body.force !== true) {
        throw new HttpError(409, 'Belum semua pemain memberikan suara.');
      }
      this.finishVote(room, now);
      return;
    }

    if (type === 'resolve_result') {
      requireModerator();
      requirePhase('result');
      if (room.resultResolved) return;
      if (Number(room.resultEndsAt) > 0 && now < Number(room.resultEndsAt) && body.force !== true) {
        throw new HttpError(409, 'Tunggu waktu hasil voting selesai sebelum menutup aksi Hunter.');
      }
      const events = [];
      const eliminations = [];
      const actionReport = [];
      for (const actor of room.players.filter(item => item.role === 'hunter' && !item.alive)) {
        const action = room.resultActions?.[actor.id];
        if (action?.type !== 'hunter_shot' || actor.hunterUsed || !abilityEnabled(room, 'hunterShot')) continue;
        const selected = room.players.find(item => item.id === action.targetId && item.alive);
        if (!selected) continue;
        actor.hunterUsed = true;
        const outcome = this.eliminatePlayer(room, selected.id, 'hunter');
        eliminations.push(...outcome.details);
        events.push('Hunter ' + actor.name + ' melepaskan tembakan ke arah ' + selected.name + '.');
        actionReport.push({
          order: 130, role: 'Hunter', actor: actor.name,
          action: 'Menembak ' + selected.name,
          outcome: outcome.players.map(item => item.name).join(' dan ') + ' gugur.'
        });
      }
      room.resultActions = {};
      room.resultResolved = true;
      room.resultEndsAt = now + 5000;
      if (room.lastResult) {
        const current = room.lastResult.eliminations || [];
        const allEliminations = [...current, ...eliminations];
        room.lastResult.eliminations = allEliminations;
        room.lastResult.eliminatedIds = [...new Set(allEliminations.map(item => item.id))];
        room.lastResult.eliminatedId = room.lastResult.eliminatedIds[0] || null;
        room.lastResult.events = [...(room.lastResult.events || []), ...events];
        room.lastResult.actionReport = [...(room.lastResult.actionReport || []), ...actionReport];
        if (eliminations.length) {
          room.lastResult.message = room.lastResult.message + ' Tembakan Hunter menyusul; '
            + eliminations.map(item => item.name).join(' dan ') + ' turut gugur.';
        }
        if (eliminations.length) room.lastResult.at = now;
      }
      if (!room.winner) this.checkWinner(room);
      if (room.winner) {
        room.phase = 'finished';
        room.resultEndsAt = null;
      }
      this.recordGameEvent(room, {
        kind: 'hunter_result', phase: room.phase, title: 'Aksi pemicu setelah voting',
        message: room.lastResult?.message || 'Aksi Hunter telah ditutup.', events,
        eliminations: room.lastResult?.eliminations || [], actionReport,
        at: now, round: room.round
      });
      this.recordGameFinished(room, now);
      return;
    }

    if (type === 'next_round') {
      requireModerator();
      requirePhase('result');
      if (!room.resultResolved) throw new HttpError(409, 'Selesaikan dahulu aksi Hunter pada hasil voting.');
      if (Number(room.resultEndsAt) > 0 && now < Number(room.resultEndsAt)) {
        throw new HttpError(409, 'Tunggu narasi hasil voting selesai sebelum ronde berikutnya.');
      }
      if (!room.winner) this.checkWinner(room);
      if (room.winner) {
        room.phase = 'finished';
        room.resultEndsAt = null;
        this.recordGameFinished(room, now);
        return;
      }
      // No fixed night-round cap: the game ends only when a win condition is reached.
      room.round += 1;
      room.phase = 'night';
      room.nightActions = {};
      room.nightSkippedPlayerIds = [];
      room.seerResults = {};
      room.nightRevealEndsAt = null;
      room.nightEndsAt = now + Number(room.settings?.timers?.nightSeconds ?? 60) * 1000;
      room.dawnEndsAt = null;
      room.dawnActions = {};
      room.resultActions = {};
      room.resultResolved = false;
      room.resultEndsAt = null;
      room.discussionEndsAt = null;
      room.votingEndsAt = null;
      room.wolfChat = [];
      this.prepareVillagerPrompts(room);
      room.votes = {};
      room.bodyguardTargets = {};
      room.discussionMode = null;
      room.discussionEndsAt = null;
      room.callUrl = '';
      room.lastResult = { kind: 'phase', message: 'Malam ' + room.round + ' dimulai.', at: now };
      this.recordGameEvent(room, {
        kind: 'night_started', phase: 'night', title: 'Malam ' + room.round + ' dimulai',
        message: 'Pemain menjalankan kemampuan malam.', at: now, round: room.round
      });
      this.runBotNightActions(room);
      return;
    }

    throw new HttpError(400, 'Jenis aksi tidak dikenal.');
  }


  async webSocketMessage(socket, message) {
    const raw = typeof message === 'string'
      ? message
      : message instanceof ArrayBuffer ? new TextDecoder().decode(message)
        : String(message);
    if (raw === 'ping') {
      try { socket.send('pong'); } catch {}
      return;
    }
    if (raw.length > 16000) return;
    let data;
    try { data = JSON.parse(raw); } catch { return; }
    if (data?.type !== 'voice_signal') return;

    await this.runExclusive(async () => {
      const attachment = socket.deserializeAttachment();
      const room = await this.loadRoom();
      if (!room || !attachment?.actorId) return;
      if (room.settings?.gameMode !== 'online') return;
      const senderId = attachment.actorId;
      const includeEliminated = ['lobby', 'finished'].includes(room.phase);
      const senderIsModerator = this.isCurrentModerator(room, senderId);
      const sender = room.players.find(item => item.id === senderId && !item.isBot && !item.isBotControlled
        && (item.alive || includeEliminated));
      if (!senderIsModerator && !sender) return;
      const targetId = String(data.targetId || '');
      if (!targetId || targetId === senderId) return;
      const targetIsModerator = this.isCurrentModerator(room, targetId);
      const target = room.players.find(item => item.id === targetId && !item.isBot && !item.isBotControlled
        && (item.alive || includeEliminated));
      if (!targetIsModerator && !target) return;

      const signalKind = String(data.signalKind || '');
      if (!['offer', 'answer', 'candidate'].includes(signalKind)) return;
      if (!data.payload || typeof data.payload !== 'object' || Array.isArray(data.payload)) return;
      let payloadText;
      try { payloadText = JSON.stringify(data.payload); } catch { return; }
      if (payloadText.length > 12000) return;

      const outgoing = JSON.stringify({
        type: 'voice_signal',
        fromId: senderId,
        fromName: senderIsModerator ? room.moderator.name : sender.name,
        signalKind,
        payload: data.payload
      });
      const sockets = this.state.getWebSockets ? this.state.getWebSockets() : [];
      for (const recipient of sockets) {
        try {
          const recipientAttachment = recipient.deserializeAttachment();
          if (recipientAttachment?.actorId === targetId) recipient.send(outgoing);
        } catch { /* Ignore disconnected peers. */ }
      }
    });
  }

  async webSocketClose(socket) {
    try {
      await this.runExclusive(async () => {
        const attachment = socket.deserializeAttachment();
        const room = await this.loadRoom();
        if (!room || !attachment?.actorId) return;
        const otherSocket = (this.state.getWebSockets ? this.state.getWebSockets() : [])
          .some(item => item !== socket && item.deserializeAttachment()?.actorId === attachment.actorId);
        if (!otherSocket) {
          const player = room.players.find(item => item.id === attachment.actorId);
          if (player && player.connected) player.connected = false;
          await this.saveRoom(room);
          await this.broadcast(room);
        }
      });
    } catch { /* A disconnected client must not block room cleanup. */ }
  }


  async webSocketError(socket) {
    await this.webSocketClose(socket);
  }

  async alarm() {
    await this.runExclusive(async () => {
      const room = await this.loadRoom();
      if (!room) {
        if (this.state.storage.deleteAll) await this.state.storage.deleteAll();
        return;
      }
      const now = Date.now();
      if (Number(room.expiresAt) > 0 && room.expiresAt <= now) {
        const sockets = this.state.getWebSockets ? this.state.getWebSockets() : [];
        for (const socket of sockets) {
          try { socket.close(1001, 'Room kedaluwarsa'); } catch {}
        }
        if (this.state.storage.deleteAll) await this.state.storage.deleteAll();
        return;
      }

      let changed = false;
      if (room.phase === 'role_draw' && Number(room.roleDrawEndsAt) > 0 && room.roleDrawEndsAt <= now) {
        await this.applyAction(room, room.moderator, { type: 'start_night' });
        changed = true;
      } else if (room.phase === 'night' && this.isSystemModerator(room)
        && Number(room.nightEndsAt) > 0 && room.nightEndsAt <= now) {
        await this.applyAction(room, room.moderator, { type: 'resolve_night', force: true });
        changed = true;
      } else if (room.phase === 'dawn' && this.isSystemModerator(room)
        && Number(room.dawnEndsAt) > 0 && room.dawnEndsAt <= now) {
        await this.applyAction(room, room.moderator, { type: 'resolve_dawn', force: true });
        changed = true;
      } else if (room.phase === 'morning' && this.isSystemModerator(room)
        && Number(room.discussionEndsAt) > 0 && room.discussionEndsAt <= now) {
        await this.applyAction(room, room.moderator, { type: 'start_voting' });
        changed = true;
      } else if (room.phase === 'voting' && Number(room.votingEndsAt) > 0 && room.votingEndsAt <= now) {
        this.finishVote(room, now);
        changed = true;
      } else if (room.phase === 'result' && this.isSystemModerator(room)
        && Number(room.resultEndsAt) > 0 && room.resultEndsAt <= now) {
        await this.applyAction(room, room.moderator, room.resultResolved
          ? { type: 'next_round' } : { type: 'resolve_result', force: true });
        changed = true;
      }

      if (changed) {
        await this.saveRoom(room);
        await this.broadcast(room);
      } else {
        await this.scheduleRoomAlarm(room);
      }
    });
  }
}


export { recommendedRoleCounts };
