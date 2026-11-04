const ROOM_TTL_MS = 12 * 60 * 60 * 1000;
const MAX_BOT_BATCH = 500;
const MAX_CHAT_MESSAGES = 100;
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
  'alphaWolf', 'bodyguard', 'witch', 'hunter', 'cupid',
  'guardianAngel', 'detective', 'mayor', 'jester'
];
const WOLF_ROLES = new Set(['wolf', 'alpha_wolf']);
const NEUTRAL_ROLES = new Set(['jester', 'guardian_angel']);
const VILLAGE_ROLES = new Set([
  'seer', 'doctor', 'bodyguard', 'witch', 'hunter', 'cupid',
  'detective', 'mayor', 'villager'
]);
const ROLE_COUNT_KEYS = [
  'wolf', 'alpha_wolf', 'seer', 'doctor', 'bodyguard', 'witch',
  'hunter', 'cupid', 'guardian_angel', 'detective', 'mayor', 'jester', 'villager'
];
const DEFAULT_ROLE_COUNTS = {
  wolf: 1, alpha_wolf: 0, seer: 1, doctor: 1, bodyguard: 0, witch: 0,
  hunter: 0, cupid: 0, guardian_angel: 0, detective: 0, mayor: 0, jester: 0, villager: 2
};
const ABILITY_KEYS = [
  'alphaDoubleVote', 'seerInspection', 'doctorProtection', 'bodyguardSacrifice',
  'witchHeal', 'witchPoison', 'hunterShot', 'cupidBond', 'guardianProtection',
  'guardianBonus', 'detectiveInspection', 'mayorDoubleVote', 'jesterSoloWin'
];

function abilityEnabled(room, key) {
  return room.settings?.abilities?.[key] !== false;
}

function normalizeSettings(input = {}) {
  input = input && typeof input === 'object' ? input : {};
  const hasExplicitCounts = input.roleCounts && typeof input.roleCounts === 'object';
  const roleCounts = hasExplicitCounts ? {} : null;
  if (roleCounts) {
    for (const key of ROLE_COUNT_KEYS) {
      const count = Number(input.roleCounts[key] ?? 0);
      if (!Number.isSafeInteger(count) || count < 0) {
        throw new HttpError(400, 'Jumlah role ' + key + ' harus berupa bilangan bulat non-negatif.');
      }
      roleCounts[key] = count;
    }
  }
  const wolves = Number(input.wolves ?? 1);
  if (!Number.isSafeInteger(wolves) || wolves < 1) throw new HttpError(400, 'Jumlah Werewolf harus berupa bilangan bulat positif.');
  const extraRoles = {};
  for (const key of EXTRA_ROLE_KEYS) extraRoles[key] = input.extraRoles?.[key] === true;
  const abilities = {};
  for (const key of ABILITY_KEYS) abilities[key] = input.abilities?.[key] !== false;
  return { wolves, seer: input.seer !== false, doctor: input.doctor !== false, extraRoles, roleCounts, abilities };
}

function recommendedRoleCounts(playerCount, settings = {}) {
  const counts = Object.fromEntries(ROLE_COUNT_KEYS.map(key => [key, 0]));
  if (!Number.isSafeInteger(playerCount) || playerCount < 2) return counts;

  const requestedWolves = Number(settings.wolves ?? 1);
  const wolfCount = Math.min(
    playerCount - 1,
    Math.max(1, Math.floor(playerCount / 4), Number.isSafeInteger(requestedWolves) ? requestedWolves : 1)
  );
  const extras = settings.extraRoles || {};
  counts.wolf = wolfCount;
  if (extras.alphaWolf) {
    counts.wolf -= 1;
    counts.alpha_wolf = 1;
  }

  let remaining = playerCount - wolfCount;
  const optionalRoles = [
    ['seer', settings.seer !== false],
    ['doctor', settings.doctor !== false],
    ['bodyguard', extras.bodyguard === true],
    ['witch', extras.witch === true],
    ['hunter', extras.hunter === true],
    ['cupid', extras.cupid === true],
    ['guardian_angel', extras.guardianAngel === true],
    ['detective', extras.detective === true],
    ['mayor', extras.mayor === true],
    ['jester', extras.jester === true]
  ];
  for (const [role, enabled] of optionalRoles) {
    if (enabled && remaining > 1) {
      counts[role] += 1;
      remaining -= 1;
    }
  }
  counts.villager = remaining;
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

function wolfAttackSummary(room) {
  const wolves = room.players.filter(player => player.alive && isWolf(player.role));
  if (!wolves.length) return { ready: true, targetId: null, tied: false };
  const actions = wolves.map(player => room.nightActions?.[player.id]);
  if (actions.some(action => action?.type !== 'wolf_vote')) {
    return { ready: false, targetId: null, tied: false };
  }
  const tally = {};
  for (const wolf of wolves) {
    const action = room.nightActions[wolf.id];
    if (!action?.targetId) continue;
    const weight = wolf.role === 'alpha_wolf' && abilityEnabled(room, 'alphaDoubleVote') ? 2 : 1;
    tally[action.targetId] = (tally[action.targetId] || 0) + weight;
  }
  const highest = Math.max(0, ...Object.values(tally));
  const leaders = Object.keys(tally).filter(id => tally[id] === highest);
  return {
    ready: true,
    targetId: highest > 0 && leaders.length === 1 ? leaders[0] : null,
    tied: highest > 0 && leaders.length > 1
  };
}

function cleanCallUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (raw.length > 500) throw new HttpError(400, 'Tautan diskusi terlalu panjang.');
  let url;
  try { url = new URL(raw); } catch { throw new HttpError(400, 'Tautan diskusi tidak valid.'); }
  if (url.protocol !== 'https:' || !url.hostname || url.username || url.password) {
    throw new HttpError(400, 'Tautan diskusi harus menggunakan HTTPS.');
  }
  return url.href;
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
  }

  async loadRoom() {
    return await this.state.storage.get('room') || null;
  }

  async saveRoom(room) {
    room.expiresAt = Date.now() + ROOM_TTL_MS;
    await this.state.storage.put('room', room);
    if (this.state.storage.setAlarm) await this.state.storage.setAlarm(Date.now() + ROOM_TTL_MS);
  }

  async authenticate(request, room) {
    const token = bearer(request);
    if (!token) return null;
    const tokenHash = await digest(token);
    if (room.moderator?.tokenHash === tokenHash) {
      return { id: room.moderator.id, name: room.moderator.name, isModerator: true };
    }
    const player = room.players.find(item => item.tokenHash === tokenHash);
    if (!player) return null;
    if (!room.moderator && player.id === room.hostId) player.isModerator = true;
    return player;
  }

  snapshot(room, actorId, actorType = 'player') {
    const isModerator = actorType === 'moderator' || room.moderator?.id === actorId;
    const self = isModerator ? room.moderator : room.players.find(player => player.id === actorId);
    const alive = room.players.filter(player => player.alive);
    const nightActionsSubmitted = alive.filter(player => room.nightActions?.[player.id]).length;
    const votesSubmitted = alive.filter(player => Object.prototype.hasOwnProperty.call(room.votes || {}, player.id)).length;
    const players = isModerator ? room.players.map(player => {
      const nightAction = room.nightActions?.[player.id] || null;
      const voteTargetId = room.votes?.[player.id] || null;
      const actionTarget = nightAction?.targetId ? room.players.find(item => item.id === nightAction.targetId) : null;
      const actionPartner = nightAction?.partnerId ? room.players.find(item => item.id === nightAction.partnerId) : null;
      const voteTarget = voteTargetId ? room.players.find(item => item.id === voteTargetId) : null;
      return {
        id: player.id,
        name: player.name,
        role: player.role,
        alive: player.alive,
        connected: Boolean(player.connected),
        isBot: Boolean(player.isBot),
        hasDrawn: Boolean(player.hasDrawn),
        hasActed: Boolean(nightAction),
        nightActionType: nightAction?.type || null,
        nightActionTarget: actionTarget?.name || null,
        nightActionPartner: actionPartner?.name || null,
        hasVoted: Boolean(voteTargetId),
        voteTarget: voteTarget?.name || null
      };
    }) : [];
    const targets = !isModerator && self
      ? alive.map(player => ({ id: player.id, name: player.name }))
      : [];
    const status = !self || isModerator ? 'moderator'
      : room.phase === 'morning'
        ? (room.lastResult?.eliminatedId === self.id ? 'eliminated' : self.alive ? 'survived' : 'eliminated')
        : self.alive ? 'alive' : 'eliminated';
    const witchAttack = !isModerator && self?.role === 'witch' && room.phase === 'night'
      ? wolfAttackSummary(room)
      : null;
    const loverIds = Array.isArray(room.lovers) ? room.lovers : [];
    const canSeeLovers = !isModerator && self && (self.role === 'cupid' || loverIds.includes(self.id));
    const loverNames = canSeeLovers
      ? loverIds.map(id => room.players.find(player => player.id === id)?.name).filter(Boolean)
      : [];
    return {
      room: {
        code: room.code,
        phase: room.phase,
        round: room.round,
        hostId: room.hostId,
        settings: room.settings,
        discussionMode: room.phase === 'discussion' ? room.discussionMode || null : null,
        callUrl: room.phase === 'discussion' && room.discussionMode === 'online' ? room.callUrl || '' : '',
        nightActionsRequired: alive.length,
        nightActionsSubmitted,
        votesRequired: alive.length,
        votesSubmitted,
        lastResult: isModerator ? room.lastResult : null,
        winner: isModerator ? room.winner : null,
        additionalWinners: isModerator ? (room.additionalWinners || []) : [],
        lovers: isModerator ? loverIds.map(id => room.players.find(player => player.id === id)?.name).filter(Boolean) : [],
        gameOver: room.phase === 'finished'
      },
      players,
      targets,
      wolfTeam: !isModerator && isWolf(self?.role)
        ? room.players.filter(player => player.alive && isWolf(player.role)).map(player => player.name)
        : [],
      self: self ? {
        id: self.id,
        name: self.name,
        isModerator,
        role: isModerator ? null : (self.hasDrawn ? self.role : null),
        alive: isModerator ? true : Boolean(self.alive),
        status,
        hasDrawn: Boolean(self.hasDrawn),
        hasActed: Boolean(room.nightActions && room.nightActions[self.id]),
        hasVoted: Boolean(room.votes && Object.prototype.hasOwnProperty.call(room.votes, self.id)),
        seerResult: !isModerator && ['seer', 'detective'].includes(self.role) && room.seerResults
          ? room.seerResults[self.id] || null
          : null,
        witchAttack: witchAttack ? {
          ready: witchAttack.ready,
          targetName: witchAttack.targetId
            ? room.players.find(player => player.id === witchAttack.targetId)?.name || null
            : null,
          tied: witchAttack.tied
        } : null,
        loverNames,
        hunterUsed: Boolean(self.hunterUsed),
        cupidUsed: !isModerator && self.role === 'cupid' ? Boolean(room.cupidUsed) : false,
        guardianTargetName: room.guardianTargets?.[self.id]
          ? room.players.find(item => item.id === room.guardianTargets[self.id])?.name || null
          : null,
        witchPotions: !isModerator ? room.witchPotions?.[self.id] || null : null
      } : null,
      chat: isModerator
        ? (room.chat || [])
          .filter(message => room.players.some(player => player.id === message.playerId && player.isBot))
          .map(message => ({
            id: message.id,
            name: message.name,
            text: message.text,
            at: message.at,
            isBot: true
          }))
        : []
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
            state: this.snapshot(room, attachment.actorId, attachment.actorType || 'player')
          }));
        }
      } catch { /* A closed socket is removed by the runtime. */ }
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
      if (['seer', 'detective'].includes(bot.role) && clue) {
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

  runBotNightActions(room) {
    const alive = room.players.filter(player => player.alive);
    const roleAbilities = {
      seer: 'seerInspection', doctor: 'doctorProtection', bodyguard: 'bodyguardSacrifice',
      cupid: 'cupidBond', detective: 'detectiveInspection'
    };
    for (const bot of alive.filter(player => player.isBot)
      .sort((left, right) => Number(left.role === 'witch') - Number(right.role === 'witch'))) {
      if (room.nightActions[bot.id]) continue;
      if (['villager', 'hunter', 'mayor', 'jester'].includes(bot.role)
        || (bot.role === 'cupid' && (room.round > 1 || !abilityEnabled(room, 'cupidBond')))
        || (roleAbilities[bot.role] && !abilityEnabled(room, roleAbilities[bot.role]))
        || (bot.role === 'guardian_angel' && !abilityEnabled(room, 'guardianProtection') && !abilityEnabled(room, 'guardianBonus'))) {
        room.nightActions[bot.id] = { type: 'pass' };
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
        const candidates = alive.filter(player => player.id !== bot.id);
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
          room.nightActions[bot.id] = { type: 'pass' };
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
      if (selected || type === 'witch_heal') room.nightActions[bot.id] = { type, ...(selected ? { targetId: selected.id } : {}) };
      else room.nightActions[bot.id] = { type: 'pass' };
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
        const host = await this.makeModerator(validName(body.name));
        const room = {
          code: String(body.code || '').toUpperCase(),
          phase: 'lobby',
          round: 0,
          hostId: host.moderator.id,
          moderator: host.moderator,
          players: [],
          settings: normalizeSettings(body.settings),
          discussionMode: null,
          discussionEndsAt: null,
          callUrl: '',
          nightActions: {},
          votes: {},
          seerResults: {},
          chat: [],
          lastResult: null,
          winner: null,
          createdAt: Date.now(),
          expiresAt: Date.now() + ROOM_TTL_MS
        };
        await this.saveRoom(room);
        return json({ code: room.code, moderatorId: host.moderator.id, token: host.token, phase: room.phase }, 201);
      }

      if (url.pathname === '/internal/join' && request.method === 'POST') {
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
      }

      if (url.pathname === '/internal/ticket' && request.method === 'POST') {
        const room = await this.loadRoom();
        if (!room || room.expiresAt <= Date.now()) throw new HttpError(404, 'Room tidak ditemukan.');
        const player = await this.authenticate(request, room);
        if (!player) throw new HttpError(401, 'Sesi tidak valid. Masuk kembali ke room.');
        const ticket = randomToken(24);
        const ticketHash = await digest(ticket);
        await this.state.storage.put('ticket:' + ticketHash, {
          actorId: player.id,
          actorType: player.isModerator ? 'moderator' : 'player',
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

      if (url.pathname === '/internal/action' && request.method === 'POST') {
        const room = await this.loadRoom();
        if (!room || room.expiresAt <= Date.now()) throw new HttpError(404, 'Room tidak ditemukan.');
        const player = await this.authenticate(request, room);
        if (!player) throw new HttpError(401, 'Sesi tidak valid.');
        const body = await readJson(request, 4096);
        await this.applyAction(room, player, body);
        room.expiresAt = Date.now() + ROOM_TTL_MS;
        await this.saveRoom(room);
        await this.broadcast(room);
        return json({ state: this.snapshot(room, player.id, player.isModerator ? 'moderator' : 'player') });
      }

      if ((url.pathname === '/internal/ws' || /^\/rooms\/[A-HJ-NP-Z2-9]{6}\/ws$/.test(url.pathname)) && request.method === 'GET') {
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
        const isModerator = ticketRecord.actorType === 'moderator';
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
        if (!isModerator) actor.connected = true;
        room.expiresAt = Date.now() + ROOM_TTL_MS;
        await this.saveRoom(room);
        await this.broadcast(room);
        return new Response(null, { status: 101, webSocket: client });
      }

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
    for (const [voterId, targetId] of Object.entries(room.votes || {})) {
      const voter = room.players.find(item => item.id === voterId);
      const weight = voter?.role === 'mayor' && abilityEnabled(room, 'mayorDoubleVote') ? 2 : 1;
      tally[targetId] = (tally[targetId] || 0) + weight;
    }
    const highestVote = Math.max(0, ...Object.values(tally));
    const winners = Object.keys(tally).filter(id => tally[id] === highestVote);
    let message = 'Voting seri atau belum ada suara. Tidak ada pemain yang tereliminasi.';
    let eliminatedId = null;
    let eliminatedIds = [];
    let eliminations = [];
    const events = [];
    if (winners.length === 1) {
      const targetPlayer = room.players.find(item => item.id === winners[0] && item.alive);
      if (targetPlayer) {
        const outcome = this.eliminatePlayer(room, targetPlayer.id, 'vote');
        eliminatedIds = outcome.players.map(item => item.id);
        eliminations = outcome.details;
        eliminatedId = targetPlayer.id;
        message = outcome.players.map(item => item.name).join(' dan ') + ' tereliminasi melalui voting.';
        events.push('Pemain dengan suara terbanyak: ' + targetPlayer.name + '.');
        if (targetPlayer.role === 'jester' && abilityEnabled(room, 'jesterSoloWin')) room.winner = 'jester';
      }
    } else {
      events.push('Voting seri atau tidak menghasilkan pilihan yang sah.');
    }
    room.lastResult = { kind: 'vote', message, eliminatedId, eliminatedIds, eliminations, events, at: now, round: room.round };
    if (!room.winner) this.checkWinner(room);
    room.phase = room.winner ? 'finished' : 'result';
  }

  async applyAction(room, player, body) {
    const type = String(body.type || '');
    const now = Date.now();
    const isModerator = Boolean(player.isModerator || player.id === room.moderator?.id);
    const requireModerator = () => {
      if (!isModerator) throw new HttpError(403, 'Hanya moderator yang dapat melakukan tindakan ini.');
    };
    const requirePlayer = () => {
      if (isModerator) throw new HttpError(403, 'Moderator tidak dapat melakukan aksi sebagai pemain.');
    };
    const requirePhase = phase => {
      if (room.phase !== phase) throw new HttpError(409, 'Aksi tidak sesuai dengan fase permainan.');
    };
    const target = id => room.players.find(item => item.id === String(id || '') && item.alive);
    const checkWinner = () => this.checkWinner(room);

    if (type === 'update_settings') {
      requireModerator();
      requirePhase('lobby');
      room.settings = normalizeSettings(body.settings);
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
      if (room.players.length < 2) {
        throw new HttpError(409, 'Minimal 2 pemain diperlukan agar kubu Werewolf dan Desa dapat bermain. Moderator tidak dihitung.');
      }
      const deck = roleDeck(room.settings, room.players.length);
      room.players.forEach((item, index) => {
        item.role = deck[index];
        item.alive = true;
        item.hasDrawn = Boolean(item.isBot);
        item.suspicionTargetId = null;
      });
      room.round = 1;
      room.phase = 'role_draw';
      room.nightActions = {};
      room.votes = {};
      room.seerResults = {};
      room.witchPotions = {};
      room.guardianTargets = {};
      room.lovers = null;
      room.cupidUsed = false;
      room.additionalWinners = [];
      room.players.forEach(item => {
        item.hunterUsed = false;
        if (item.role === 'witch') room.witchPotions[item.id] = {
          heal: abilityEnabled(room, 'witchHeal'),
          poison: abilityEnabled(room, 'witchPoison')
        };
      });
      room.chat = [];
      room.lastResult = null;
      room.winner = null;
      return;
    }

    if (type === 'draw_card') {
      requirePlayer();
      requirePhase('role_draw');
      if (player.hasDrawn) throw new HttpError(409, 'Kartu sudah dibuka.');
      player.hasDrawn = true;
      return;
    }

    if (type === 'start_night') {
      requireModerator();
      requirePhase('role_draw');
      if (room.players.some(item => !item.hasDrawn)) {
        throw new HttpError(409, 'Tunggu semua pemain membuka kartu.');
      }
      room.phase = 'night';
      room.nightActions = {};
      room.bodyguardTargets = {};
      room.lastResult = { kind: 'phase', message: 'Malam ' + room.round + ' dimulai.', at: now };
      this.runBotNightActions(room);
      return;
    }

    if (type === 'night_action') {
      requirePlayer();
      requirePhase('night');
      if (!player.alive) throw new HttpError(403, 'Pemain yang tereliminasi tidak dapat melakukan aksi.');
      if (room.nightActions[player.id]) throw new HttpError(409, 'Aksi malam sudah dikirim.');
      const selected = player.role === 'witch' && body.mode === 'heal' ? null : target(body.targetId);
      if (!selected && !(player.role === 'witch' && body.mode === 'heal')) {
        throw new HttpError(400, 'Target tidak ditemukan atau sudah tereliminasi.');
      }
      if (isWolf(player.role)) {
        if (isWolf(selected.role) || selected.id === player.id) {
          throw new HttpError(400, 'Werewolf tidak dapat memilih anggota kawanan sendiri.');
        }
        room.nightActions[player.id] = { type: 'wolf_vote', targetId: selected.id };
      } else if (player.role === 'doctor') {
        if (!abilityEnabled(room, 'doctorProtection')) throw new HttpError(403, 'Kemampuan Doctor dinonaktifkan.');
        room.nightActions[player.id] = { type: 'doctor_protect', targetId: selected.id };
      } else if (player.role === 'seer' || player.role === 'detective') {
        const ability = player.role === 'seer' ? 'seerInspection' : 'detectiveInspection';
        if (!abilityEnabled(room, ability)) throw new HttpError(403, 'Kemampuan pemeriksaan dinonaktifkan.');
        if (selected.id === player.id) throw new HttpError(400, 'Tidak dapat memeriksa diri sendiri.');
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
      if (!player.alive) throw new HttpError(403, 'Pemain yang tereliminasi tidak dapat melakukan aksi.');
      const roleAbilities = {
        seer: 'seerInspection', doctor: 'doctorProtection', bodyguard: 'bodyguardSacrifice',
        cupid: 'cupidBond', detective: 'detectiveInspection'
      };
      const canPass = ['villager', 'hunter', 'mayor', 'jester'].includes(player.role)
        || (roleAbilities[player.role] && !abilityEnabled(room, roleAbilities[player.role]))
        || (player.role === 'guardian_angel' && !abilityEnabled(room, 'guardianProtection') && !abilityEnabled(room, 'guardianBonus'))
        || (player.role === 'cupid' && (room.round > 1 || room.cupidUsed))
        || player.role === 'witch';
      if (!canPass) throw new HttpError(403, 'Peran ini harus menyelesaikan aksi malamnya.');
      if (room.nightActions[player.id]) throw new HttpError(409, 'Aksi malam sudah dikirim.');
      room.nightActions[player.id] = { type: 'pass' };
      this.runBotNightActions(room);
      return;
    }

    if (type === 'resolve_night') {
      requireModerator();
      requirePhase('night');
      const actors = room.players.filter(item => item.alive);
      const missing = actors.filter(item => !room.nightActions[item.id]);
      if (missing.length && body.force !== true) {
        throw new HttpError(409, 'Belum semua pemain yang hidup menyelesaikan aksi malam.');
      }
      const wolfVotes = {};
      const protectedIds = new Set();
      const poisonTargets = [];
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
        if (action.type === 'witch_poison') {
          poisonTargets.push(action.targetId);
          const potions = room.witchPotions[actor.id] || { heal: true, poison: true };
          potions.poison = false;
          room.witchPotions[actor.id] = potions;
        }
        if (action.type === 'seer_inspect' || action.type === 'detective_inspect') {
          const inspected = room.players.find(item => item.id === action.targetId);
          const wolf = inspected && isWolf(inspected.role);
          room.seerResults[actor.id] = {
            round: room.round,
            playerName: inspected ? inspected.name : 'Pemain tidak ditemukan',
            result: action.type === 'detective_inspect'
              ? (wolf ? 'wolf_team' : NEUTRAL_ROLES.has(inspected?.role) ? 'neutral' : 'village')
              : (wolf ? 'wolf' : 'not_wolf')
          };
        }
        if (action.type === 'cupid_link' && room.round === 1 && !room.cupidUsed) {
          room.lovers = [action.targetId, action.partnerId];
          room.cupidUsed = true;
        }
        if (action.type === 'guardian_protect' && !room.guardianTargets?.[actor.id]) {
          room.guardianTargets = { ...(room.guardianTargets || {}), [actor.id]: action.targetId };
        }
      }
      const events = [];
      if (!cupidWasUsed && room.cupidUsed && room.lovers?.length === 2) {
        const linkedNames = room.lovers.map(id => room.players.find(item => item.id === id)?.name).filter(Boolean);
        if (linkedNames.length === 2) events.push('Cupid mengikat ' + linkedNames.join(' dan ') + '.');
      }
      const highest = Math.max(0, ...Object.values(wolfVotes));
      const candidates = Object.keys(wolfVotes).filter(id => wolfVotes[id] === highest);
      victimId = candidates.length === 1 ? candidates[0] : null;
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
      for (const id of poisonTargets) {
        if (!deaths.some(item => item.id === id)) deaths.push({ id, cause: 'witch_poison' });
      }
      const eliminated = [];
      const eliminations = [];
      for (const death of deaths) {
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
        message = 'Pilihan Werewolf seri. Tidak ada korban dari serangan.';
        events.push('Pilihan serangan Werewolf seri; tidak ada target serangan.');
      } else if (!events.length) {
        events.push('Tidak ada aksi malam yang menyebabkan perubahan pada pemain.');
      }
      room.lastResult = {
        kind: 'night',
        message,
        eliminatedId,
        eliminatedIds: eliminated.map(item => item.id),
        eliminations,
        events,
        at: now,
        round: room.round
      };
      room.nightActions = {};
      checkWinner();
      room.phase = 'morning';
      room.discussionMode = null;
      room.discussionEndsAt = null;
      room.callUrl = '';
      room.chat = [];
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
      room.discussionMode = null;
      room.discussionEndsAt = null;
      room.callUrl = '';
      room.chat = [];
      this.seedBotDiscussion(room, now);
      return;
    }

    if (type === 'set_discussion') {
      requireModerator();
      requirePhase('discussion');
      const mode = String(body.mode || '');
      if (!['offline', 'online'].includes(mode)) throw new HttpError(400, 'Pilih mode diskusi offline atau online.');
      const callUrl = mode === 'online' ? cleanCallUrl(body.callUrl) : '';
      if (mode === 'online' && !callUrl) throw new HttpError(400, 'Tautan diskusi online wajib diisi.');
      room.discussionMode = mode;
      room.callUrl = callUrl;
      room.discussionEndsAt = null;
      return;
    }

    if (type === 'start_voting') {
      requireModerator();
      requirePhase('discussion');
      if (!['offline', 'online'].includes(room.discussionMode)) {
        throw new HttpError(409, 'Moderator harus menentukan mode diskusi sebelum membuka voting.');
      }
      room.phase = 'voting';
      room.votes = {};
      this.runBotVotes(room, now);
      return;
    }

    if (type === 'hunter_shot') {
      requirePlayer();
      if (!['morning', 'discussion', 'result'].includes(room.phase)) throw new HttpError(409, 'Hunter hanya dapat menembak setelah tereliminasi.');
      if (player.role !== 'hunter' || player.alive || player.hunterUsed || !abilityEnabled(room, 'hunterShot')) throw new HttpError(403, 'Kemampuan Hunter tidak tersedia.');
      const selected = target(body.targetId);
      if (!selected || selected.id === player.id) throw new HttpError(400, 'Pilih target yang masih hidup.');
      player.hunterUsed = true;
      const outcome = this.eliminatePlayer(room, selected.id, 'hunter');
      const eliminated = outcome.players;
      this.checkWinner(room);
      if (room.winner) room.phase = 'finished';
      room.lastResult = {
        kind: 'hunter',
        message: 'Hunter menembak ' + eliminated.map(item => item.name).join(' dan ') + '.',
        eliminatedId: selected.id,
        eliminatedIds: eliminated.map(item => item.id),
        eliminations: outcome.details,
        events: ['Hunter menembak ' + selected.name + '.'],
        at: now,
        round: room.round
      };
      return;
    }

    if (type === 'cast_vote') {
      requirePlayer();
      requirePhase('voting');
      if (!player.alive) throw new HttpError(403, 'Pemain yang tereliminasi tidak dapat melakukan voting.');
      if (Object.prototype.hasOwnProperty.call(room.votes, player.id)) {
        throw new HttpError(409, 'Suara sudah dikirim.');
      }
      const selected = target(body.targetId);
      if (!selected || selected.id === player.id) throw new HttpError(400, 'Pilih pemain lain yang masih hidup.');
      room.votes[player.id] = selected.id;
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

    if (type === 'next_round') {
      requireModerator();
      requirePhase('result');
      // No fixed night-round cap: the game ends only when a win condition is reached.
      room.round += 1;
      room.phase = 'night';
      room.nightActions = {};
      room.votes = {};
      room.bodyguardTargets = {};
      room.discussionMode = null;
      room.discussionEndsAt = null;
      room.callUrl = '';
      room.chat = [];
      room.lastResult = { kind: 'phase', message: 'Malam ' + room.round + ' dimulai.', at: now };
      this.runBotNightActions(room);
      return;
    }

    throw new HttpError(400, 'Jenis aksi tidak dikenal.');
  }


  async webSocketMessage(socket, message) {
    if (String(message) === 'ping') {
      try { socket.send('pong'); } catch {}
    }
  }

  async webSocketClose(socket) {
    try {
      const attachment = socket.deserializeAttachment();
      const room = await this.loadRoom();
      if (!room || !attachment?.actorId || attachment.actorType === 'moderator') return;
      const otherSocket = (this.state.getWebSockets ? this.state.getWebSockets() : [])
        .some(item => item !== socket && item.deserializeAttachment()?.actorId === attachment.actorId);
      if (!otherSocket) {
        const player = room.players.find(item => item.id === attachment.actorId);
        if (player) {
          player.connected = false;
          await this.saveRoom(room);
          await this.broadcast(room);
        }
      }
    } catch { /* A disconnected client must not block room cleanup. */ }
  }


  async webSocketError(socket) {
    await this.webSocketClose(socket);
  }

  async alarm() {
    const sockets = this.state.getWebSockets ? this.state.getWebSockets() : [];
    for (const socket of sockets) {
      try { socket.close(1001, 'Room kedaluwarsa'); } catch {}
    }
    if (this.state.storage.deleteAll) await this.state.storage.deleteAll();
  }
}
