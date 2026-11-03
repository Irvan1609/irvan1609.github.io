const ROOM_TTL_MS = 12 * 60 * 60 * 1000;
const MIN_PLAYERS = 5;
const MAX_PLAYERS = 20;
const MAX_CHAT_MESSAGES = 100;
const BOT_NAMES = ['Aruna', 'Bima', 'Citra', 'Damar', 'Elang', 'Farah', 'Genta', 'Hana', 'Indra', 'Jihan', 'Kirana', 'Laras', 'Mahesa', 'Nadia', 'Raka', 'Salsa', 'Tara', 'Umar', 'Vina'];
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

function normalizeSettings(input = {}) {
  input = input && typeof input === 'object' ? input : {};
  const wolves = Number(input.wolves ?? 1);
  if (!Number.isInteger(wolves) || wolves < 1 || wolves > 4) throw new HttpError(400, 'Jumlah Werewolf harus 1–4.');
  return { wolves, seer: input.seer !== false, doctor: input.doctor !== false };
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
    return room.players.find(player => player.tokenHash === tokenHash) || null;
  }

  snapshot(room, playerId) {
    const self = room.players.find(player => player.id === playerId);
    const canReveal = room.phase === 'finished';
    const players = room.players.map(player => {
      const item = {
        id: player.id,
        name: player.name,
        alive: player.alive,
        connected: Boolean(player.connected),
        isHost: player.id === room.hostId,
        isBot: Boolean(player.isBot),
        hasDrawn: Boolean(player.hasDrawn),
        hasVoted: Boolean(room.votes && Object.prototype.hasOwnProperty.call(room.votes, player.id))
      };
      if (!player.alive || canReveal) item.role = player.role;
      if (self && self.hasDrawn && self.role === 'wolf') item.isWolf = player.role === 'wolf';
      return item;
    });
    const nightActionsRequired = room.players.filter(player => player.alive && ['wolf', 'seer', 'doctor'].includes(player.role)).length;
    const nightActionsSubmitted = Object.keys(room.nightActions || {}).length;
    const votesRequired = room.players.filter(player => player.alive).length;
    const votesSubmitted = Object.keys(room.votes || {}).length;
    return {
      room: {
        code: room.code,
        phase: room.phase,
        round: room.round,
        hostId: room.hostId,
        settings: room.settings,
        discussionMode: room.discussionMode,
        discussionEndsAt: room.discussionEndsAt,
        callUrl: room.callUrl,
        lastResult: room.lastResult,
        winner: room.winner,
        nightActionsRequired,
        nightActionsSubmitted,
        votesRequired,
        votesSubmitted
      },
      players,
      self: self ? {
        id: self.id,
        name: self.name,
        role: self.hasDrawn ? self.role : null,
        hasDrawn: Boolean(self.hasDrawn),
        hasActed: Boolean(room.nightActions && room.nightActions[self.id]),
        hasVoted: Boolean(room.votes && Object.prototype.hasOwnProperty.call(room.votes, self.id)),
        seerResult: room.seerResults ? room.seerResults[self.id] || null : null
      } : null,
      chat: room.discussionMode === 'online' ? (room.chat || []).slice(-MAX_CHAT_MESSAGES) : []
    };
  }

  async broadcast(room) {
    const sockets = this.state.getWebSockets ? this.state.getWebSockets() : [];
    for (const socket of sockets) {
      try {
        const attachment = socket.deserializeAttachment();
        if (attachment && attachment.playerId) {
          socket.send(JSON.stringify({ type: 'state', state: this.snapshot(room, attachment.playerId) }));
        }
      } catch { /* A closed socket is removed by the runtime. */ }
    }
  }

  async makePlayer(name, isHost = false) {
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
        isHost
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
      isBot: true
    };
  }

  runBotNightActions(room) {
    const alive = room.players.filter(player => player.alive);
    for (const bot of alive.filter(player => player.isBot && ['wolf', 'seer', 'doctor'].includes(player.role))) {
      if (room.nightActions[bot.id]) continue;
      let selected = null;
      let type = '';
      if (bot.role === 'wolf') {
        type = 'wolf_vote';
        const coordinated = Object.entries(room.nightActions).find(([playerId, action]) =>
          action.type === 'wolf_vote' && room.players.some(player => player.id === playerId && player.role === 'wolf'));
        selected = coordinated
          ? alive.find(player => player.id === coordinated[1].targetId && player.role !== 'wolf')
          : null;
        if (!selected) {
          const candidates = alive.filter(player => player.role !== 'wolf');
          selected = candidates.length ? candidates[randomInt(candidates.length)] : null;
        }
      } else if (bot.role === 'seer') {
        type = 'seer_inspect';
        const candidates = alive.filter(player => player.id !== bot.id);
        selected = candidates.length ? candidates[randomInt(candidates.length)] : null;
      } else {
        type = 'doctor_protect';
        selected = alive.length ? alive[randomInt(alive.length)] : null;
      }
      if (selected) room.nightActions[bot.id] = { type, targetId: selected.id };
    }
  }

  runBotVotes(room, now) {
    const alive = room.players.filter(player => player.alive);
    for (const bot of alive.filter(player => player.isBot)) {
      if (Object.prototype.hasOwnProperty.call(room.votes, bot.id)) continue;
      let selected = null;
      if (bot.role === 'wolf') {
        const coordinated = Object.entries(room.votes).find(([playerId, targetId]) =>
          room.players.some(player => player.id === playerId && player.role === 'wolf')
          && alive.some(player => player.id === targetId && player.role !== 'wolf'));
        selected = coordinated ? alive.find(player => player.id === coordinated[1]) : null;
      } else {
        const clue = room.seerResults?.[bot.id];
        if (clue?.result === 'wolf') {
          selected = alive.find(player => player.name === clue.playerName && player.role === 'wolf');
        }
      }
      if (!selected) {
        const candidates = alive.filter(player => player.id !== bot.id && (bot.role !== 'wolf' || player.role !== 'wolf'));
        selected = candidates.length ? candidates[randomInt(candidates.length)] : null;
      }
      if (selected) room.votes[bot.id] = selected.id;
    }
    if (alive.length && alive.every(player => Object.prototype.hasOwnProperty.call(room.votes, player.id))) {
      this.finishVote(room, now);
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
        const host = await this.makePlayer(validName(body.name), true);
        const room = {
          code: String(body.code || '').toUpperCase(),
          phase: 'lobby',
          round: 0,
          hostId: host.player.id,
          players: [host.player],
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
        return json({ code: room.code, playerId: host.player.id, token: host.token, phase: room.phase }, 201);
      }

      if (url.pathname === '/internal/join' && request.method === 'POST') {
        const room = await this.loadRoom();
        if (!room || room.expiresAt <= Date.now()) throw new HttpError(404, 'Room tidak ditemukan atau sudah kedaluwarsa.');
        if (room.phase !== 'lobby') throw new HttpError(409, 'Permainan sudah dimulai. Room tidak menerima pemain baru.');
        if (room.players.length >= MAX_PLAYERS) throw new HttpError(409, 'Room sudah penuh.');
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
        await this.state.storage.put('ticket:' + ticketHash, { playerId: player.id, expiresAt: Date.now() + 30000 });
        return json({ ticket, expiresIn: 30 });
      }

      if (url.pathname === '/internal/state' && request.method === 'GET') {
        const room = await this.loadRoom();
        if (!room || room.expiresAt <= Date.now()) throw new HttpError(404, 'Room tidak ditemukan.');
        const player = await this.authenticate(request, room);
        if (!player) throw new HttpError(401, 'Sesi tidak valid.');
        return json({ state: this.snapshot(room, player.id) });
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
        return json({ state: this.snapshot(room, player.id) });
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
        const player = room.players.find(item => item.id === ticketRecord.playerId);
        if (!player) throw new HttpError(401, 'Pemain tidak ditemukan.');
        const pair = new WebSocketPair();
        const client = pair[0];
        const server = pair[1];
        this.state.acceptWebSocket(server);
        server.serializeAttachment({ playerId: player.id });
        player.connected = true;
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

  finishVote(room, now) {
    const tally = {};
    for (const targetId of Object.values(room.votes || {})) tally[targetId] = (tally[targetId] || 0) + 1;
    const highestVote = Math.max(0, ...Object.values(tally));
    const winners = Object.keys(tally).filter(id => tally[id] === highestVote);
    let message = 'Voting seri atau belum ada suara. Tidak ada pemain yang dieliminasi.';
    let eliminatedId = null;
    if (winners.length === 1) {
      const eliminated = room.players.find(item => item.id === winners[0] && item.alive);
      if (eliminated) {
        eliminated.alive = false;
        eliminatedId = eliminated.id;
        message = eliminated.name + ' tereliminasi melalui voting.';
      }
    }
    room.lastResult = { kind: 'vote', message, eliminatedId, at: now, round: room.round };
    const alive = room.players.filter(item => item.alive);
    const wolves = alive.filter(item => item.role === 'wolf').length;
    const villagers = alive.length - wolves;
    if (wolves === 0) room.winner = 'villagers';
    else if (wolves >= villagers) room.winner = 'wolves';
    if (room.winner) room.phase = 'finished';
    else room.phase = 'result';
  }

  async applyAction(room, player, body) {
    const type = String(body.type || '');
    const now = Date.now();
    const isHost = player.id === room.hostId;
    const requireHost = () => { if (!isHost) throw new HttpError(403, 'Hanya host yang dapat melakukan tindakan ini.'); };
    const requirePhase = phase => { if (room.phase !== phase) throw new HttpError(409, 'Aksi tidak sesuai dengan fase permainan.'); };
    const target = id => room.players.find(item => item.id === String(id || '') && item.alive);
    const checkWinner = () => {
      const alive = room.players.filter(item => item.alive);
      const wolves = alive.filter(item => item.role === 'wolf').length;
      const villagers = alive.length - wolves;
      if (wolves === 0) room.winner = 'villagers';
      else if (wolves >= villagers) room.winner = 'wolves';
      if (room.winner) room.phase = 'finished';
    };

    if (type === 'add_bots') {
      requireHost();
      requirePhase('lobby');
      const count = Number(body.count ?? 4);
      if (!Number.isInteger(count) || count < 1 || count > 19) throw new HttpError(400, 'Jumlah bot harus 1–19.');
      if (room.players.length + count > MAX_PLAYERS) throw new HttpError(409, 'Jumlah pemain maksimal 20 termasuk host dan bot.');
      for (let index = 0; index < count; index += 1) room.players.push(this.makeBot(room));
      return;
    }

    if (type === 'start_game') {
      requireHost();
      requirePhase('lobby');
      if (room.players.length < MIN_PLAYERS) throw new HttpError(409, 'Minimal 5 pemain untuk memulai.');
      const roles = Array(room.settings.wolves).fill('wolf');
      if (room.settings.seer) roles.push('seer');
      if (room.settings.doctor) roles.push('doctor');
      if (roles.length >= room.players.length) throw new HttpError(409, 'Jumlah peran khusus terlalu banyak. Sisakan minimal satu Warga Desa.');
      while (roles.length < room.players.length) roles.push('villager');
      const deck = shuffle(roles);
      room.players.forEach((item, index) => {
        item.role = deck[index];
        item.alive = true;
        item.hasDrawn = Boolean(item.isBot);
      });
      room.round = 1;
      room.phase = 'role_draw';
      room.nightActions = {};
      room.votes = {};
      room.seerResults = {};
      room.chat = [];
      room.lastResult = null;
      room.winner = null;
      return;
    }

    if (type === 'draw_card') {
      requirePhase('role_draw');
      if (player.hasDrawn) throw new HttpError(409, 'Kartu sudah diambil.');
      player.hasDrawn = true;
      return;
    }

    if (type === 'start_night') {
      requireHost();
      requirePhase('role_draw');
      if (room.players.some(item => !item.hasDrawn)) throw new HttpError(409, 'Tunggu semua pemain mengambil kartu.');
      room.phase = 'night';
      room.nightActions = {};
      room.lastResult = { kind: 'phase', message: 'Malam ' + room.round + ' dimulai.', at: now };
      this.runBotNightActions(room);
      return;
    }

    if (type === 'night_action') {
      requirePhase('night');
      if (!player.alive) throw new HttpError(403, 'Pemain yang tereliminasi tidak dapat melakukan aksi.');
      if (room.nightActions[player.id]) throw new HttpError(409, 'Aksi malam sudah dikirim.');
      const selected = target(body.targetId);
      if (!selected) throw new HttpError(400, 'Target tidak ditemukan atau sudah tereliminasi.');
      if (player.role === 'wolf') {
        if (selected.role === 'wolf' || selected.id === player.id) throw new HttpError(400, 'Werewolf tidak dapat memilih anggota kawanan sendiri.');
        room.nightActions[player.id] = { type: 'wolf_vote', targetId: selected.id };
      } else if (player.role === 'doctor') {
        room.nightActions[player.id] = { type: 'doctor_protect', targetId: selected.id };
      } else if (player.role === 'seer') {
        if (selected.id === player.id) throw new HttpError(400, 'Seer tidak dapat memeriksa dirinya sendiri.');
        room.nightActions[player.id] = { type: 'seer_inspect', targetId: selected.id };
      } else {
        throw new HttpError(403, 'Peran ini tidak memiliki aksi malam.');
      }
      return;
    }

    if (type === 'resolve_night') {
      requireHost();
      requirePhase('night');
      const actors = room.players.filter(item => item.alive && ['wolf', 'seer', 'doctor'].includes(item.role));
      const missing = actors.filter(item => !room.nightActions[item.id]);
      if (missing.length && body.force !== true) throw new HttpError(409, 'Belum semua peran aktif mengirim aksi.');
      const wolfVotes = {};
      let protectedId = null;
      for (const actor of actors) {
        const action = room.nightActions[actor.id];
        if (!action) continue;
        if (action.type === 'wolf_vote') wolfVotes[action.targetId] = (wolfVotes[action.targetId] || 0) + 1;
        if (action.type === 'doctor_protect') protectedId = action.targetId;
        if (action.type === 'seer_inspect') {
          const inspected = room.players.find(item => item.id === action.targetId);
          room.seerResults[actor.id] = {
            round: room.round,
            playerName: inspected ? inspected.name : 'Pemain tidak ditemukan',
            result: inspected && inspected.role === 'wolf' ? 'wolf' : 'not_wolf'
          };
        }
      }
      const highest = Math.max(0, ...Object.values(wolfVotes));
      const candidates = Object.keys(wolfVotes).filter(id => wolfVotes[id] === highest);
      const victimId = candidates.length === 1 ? candidates[0] : null;
      let message = 'Malam berlalu tanpa korban.';
      let eliminatedId = null;
      if (victimId && victimId !== protectedId) {
        const victim = room.players.find(item => item.id === victimId && item.alive);
        if (victim) {
          victim.alive = false;
          eliminatedId = victim.id;
          message = victim.name + ' tereliminasi pada malam hari.';
        }
      } else if (victimId && victimId === protectedId) {
        message = 'Serangan Werewolf berhasil digagalkan Doctor.';
      } else if (highest > 0) {
        message = 'Pilihan Werewolf seri. Tidak ada korban malam ini.';
      }
      room.lastResult = { kind: 'night', message, eliminatedId, at: now, round: room.round };
      room.nightActions = {};
      checkWinner();
      if (!room.winner) {
        room.phase = 'discussion';
        room.discussionMode = null;
        room.discussionEndsAt = null;
        room.callUrl = '';
        room.chat = [];
      }
      return;
    }

    if (type === 'set_discussion') {
      requireHost();
      requirePhase('discussion');
      const mode = body.mode === 'online' ? 'online' : body.mode === 'offline' ? 'offline' : '';
      if (!mode) throw new HttpError(400, 'Pilih diskusi offline atau online.');
      const duration = Number(body.durationMinutes || 5);
      if (!Number.isInteger(duration) || duration < 1 || duration > 20) throw new HttpError(400, 'Durasi diskusi harus 1–20 menit.');
      room.discussionMode = mode;
      room.discussionEndsAt = now + duration * 60 * 1000;
      room.callUrl = mode === 'online' ? cleanCallUrl(body.callUrl) : '';
      room.chat = [];
      if (mode === 'online') {
        const botLines = [
          'Aku belum punya bukti kuat. Jangan terburu-buru menentukan siapa yang bersalah.',
          'Coba perhatikan siapa yang paling diuntungkan dari kejadian malam tadi.',
          'Aku ingin mendengar alasan semua orang sebelum memberikan suara.'
        ];
        room.players.filter(player => player.isBot && player.alive).slice(0, 3).forEach((bot, index) => {
          room.chat.push({
            id: crypto.randomUUID(),
            playerId: bot.id,
            name: bot.name,
            text: botLines[index],
            at: now + index
          });
        });
      }
      return;
    }

    if (type === 'send_chat') {
      requirePhase('discussion');
      if (!player.alive) throw new HttpError(403, 'Pemain yang tereliminasi tidak dapat mengirim pesan.');
      if (room.discussionMode !== 'online') throw new HttpError(409, 'Chat hanya aktif pada diskusi online.');
      const text = String(body.text || '').trim();
      if (!text || text.length > 500) throw new HttpError(400, 'Pesan harus terdiri dari 1–500 karakter.');
      const rateKey = 'chat-rate:' + player.id;
      const rate = await this.state.storage.get(rateKey) || { start: now, count: 0 };
      if (now - rate.start >= 10000) { rate.start = now; rate.count = 0; }
      if (rate.count >= 5) throw new HttpError(429, 'Terlalu banyak pesan. Tunggu beberapa detik.');
      rate.count += 1;
      await this.state.storage.put(rateKey, rate);
      room.chat.push({ id: crypto.randomUUID(), playerId: player.id, name: player.name, text, at: now });
      if (room.chat.length > MAX_CHAT_MESSAGES) room.chat.splice(0, room.chat.length - MAX_CHAT_MESSAGES);
      return;
    }

    if (type === 'start_voting') {
      requireHost();
      requirePhase('discussion');
      if (!room.discussionMode) throw new HttpError(409, 'Host harus memilih metode diskusi terlebih dahulu.');
      if (room.discussionEndsAt && now < room.discussionEndsAt && body.force !== true) {
        throw new HttpError(409, 'Waktu diskusi belum selesai.');
      }
      room.phase = 'voting';
      room.votes = {};
      this.runBotVotes(room, now);
      return;
    }

    if (type === 'cast_vote') {
      requirePhase('voting');
      if (!player.alive) throw new HttpError(403, 'Pemain yang tereliminasi tidak dapat melakukan voting.');
      if (Object.prototype.hasOwnProperty.call(room.votes, player.id)) throw new HttpError(409, 'Suara sudah dikirim.');
      const selected = target(body.targetId);
      if (!selected || selected.id === player.id) throw new HttpError(400, 'Pilih pemain lain yang masih hidup.');
      room.votes[player.id] = selected.id;
      const alivePlayers = room.players.filter(item => item.alive);
      if (alivePlayers.every(item => Object.prototype.hasOwnProperty.call(room.votes, item.id))) {
        this.finishVote(room, now);
      }
      return;
    }

    if (type === 'resolve_vote') {
      requireHost();
      requirePhase('voting');
      const alivePlayers = room.players.filter(item => item.alive);
      const missing = alivePlayers.filter(item => !Object.prototype.hasOwnProperty.call(room.votes, item.id));
      if (missing.length && body.force !== true) throw new HttpError(409, 'Belum semua pemain memberikan suara.');
      this.finishVote(room, now);
      return;
    }

    if (type === 'next_round') {
      requireHost();
      requirePhase('result');
      room.round += 1;
      room.phase = 'night';
      room.nightActions = {};
      room.votes = {};
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
      if (!room || !attachment?.playerId) return;
      const otherSocket = (this.state.getWebSockets ? this.state.getWebSockets() : [])
        .some(item => item !== socket && item.deserializeAttachment()?.playerId === attachment.playerId);
      if (!otherSocket) {
        const player = room.players.find(item => item.id === attachment.playerId);
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
