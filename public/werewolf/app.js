const $ = id => document.getElementById(id);
const API_BASE = location.hostname === 'irvan1609.github.io'
  ? 'https://werewolf-room-api.andyirvan1609.workers.dev'
  : 'https://werewolf-room-api-dev.andyirvan1609.workers.dev';
const SESSION_PREFIX = 'werewolf.session.';
const PLAYER_NAME_KEY = 'werewolf.lastPlayerName';
const ROLE_INFO = {
  wolf: ['Werewolf', 'Serang satu pemain setiap malam bersama kawanan.'],
  alpha_wolf: ['Alpha Wolf', 'Pemimpin kawanan. Suara serangan malam bernilai dua.'],
  villager: ['Warga Desa', 'Tidak memiliki kemampuan khusus, tetapi mengerjakan tantangan penjumlahan rahasia setiap malam.'],
  seer: ['Seer', 'Periksa satu pemain setiap malam untuk mengetahui apakah ia Werewolf.'],
  doctor: ['Doctor', 'Lindungi satu pemain dari serangan setiap malam.'],
  bodyguard: ['Bodyguard', 'Jaga satu pemain setiap malam. Jika target diserang, kamu yang menerima serangan.'],
  witch: ['Witch', 'Mengetahui target serangan Werewolf setelah kawanan memilih. Memiliki satu ramuan penyembuh dan satu racun, masing-masing sekali.'],
  hunter: ['Hunter', 'Jika tereliminasi, pilih satu pemain hidup untuk ditembak.'],
  cupid: ['Cupid', 'Pada malam pertama, hubungkan dua pemain. Jika salah satu tereliminasi, pasangannya ikut tereliminasi.'],
  guardian_angel: ['Guardian Angel', 'Pilih satu pemain untuk dilindungi setiap malam. Mendapat kemenangan tambahan jika target pilihan terakhir masih hidup saat permainan berakhir.'],
  detective: ['Detective', 'Periksa satu pemain setiap malam untuk mengetahui kubunya: Desa, Werewolf, atau Netral.'],
  mayor: ['Mayor', 'Suara voting bernilai dua. Tidak memiliki aksi malam.'],
  jester: ['Jester', 'Menang sendiri jika berhasil dieliminasi melalui voting. Tidak memiliki aksi malam.'],
  moderator: ['Moderator', 'Mengatur alur permainan melalui host, sistem otomatis, atau mode acak sesuai pengaturan room.']
};
const EXTRA_ROLE_OPTIONS = [
  ['alphaWolf', 'Alpha Wolf', 'Role Werewolf khusus; kemampuan suara serangan ganda dapat diatur moderator.'],
  ['bodyguard', 'Bodyguard', 'Mengorbankan diri untuk menyelamatkan target dari serangan.'],
  ['witch', 'Witch', 'Satu ramuan penyembuh dan satu racun, masing-masing sekali.'],
  ['hunter', 'Hunter', 'Dapat menembak satu pemain setelah tereliminasi.'],
  ['cupid', 'Cupid', 'Menghubungkan dua pemain pada malam pertama.'],
  ['guardianAngel', 'Guardian Angel', 'Melindungi satu pemain setiap malam; mendapat kemenangan tambahan jika target selamat.'],
  ['detective', 'Detective', 'Memeriksa kubu pemain setiap malam.'],
  ['mayor', 'Mayor', 'Memiliki dua bobot suara dalam voting.'],
  ['jester', 'Jester', 'Menang jika tereliminasi melalui voting.']
];
const ROLE_CONFIG_GROUPS = [
  { key: 'wolves', label: 'KUBU WEREWOLF', roles: [
    ['wolf', 'Werewolf'], ['alpha_wolf', 'Alpha Wolf']
  ]},
  { key: 'village', label: 'KUBU DESA', roles: [
    ['seer', 'Seer'], ['doctor', 'Doctor'], ['bodyguard', 'Bodyguard'],
    ['witch', 'Witch'], ['hunter', 'Hunter'], ['cupid', 'Cupid'],
    ['detective', 'Detective'], ['mayor', 'Mayor'], ['villager', 'Warga Desa']
  ]},
  { key: 'neutral', label: 'KUBU NETRAL', roles: [
    ['guardian_angel', 'Guardian Angel'], ['jester', 'Jester']
  ]}
];
const ROLE_COUNT_DEFAULTS = {
  wolf: 1, alpha_wolf: 0, seer: 1, doctor: 1, bodyguard: 0, witch: 0,
  hunter: 0, cupid: 0, guardian_angel: 0, detective: 0, mayor: 0, jester: 0, villager: 2,
  moderator: 0
};
let session = null;
let roomState = null;
let socket = null;
let reconnectTimer = null;
let pollTimer = null;
let clockTimer = null;
let reconnectDelay = 1200;
let heartbeatTimer = null;
let realtimeGeneration = 0;
let connectingGeneration = null;
let pollingSession = null;
let gameAudioContext = null;
let lastNarrationKey = '';
let roleDraft = null;

function node(tag, className, text) {
  const item = document.createElement(tag);
  if (className) item.className = className;
  if (text !== undefined && text !== null) item.textContent = String(text);
  return item;
}

function button(text, className, onClick, disabled = false) {
  const item = node('button', className, text);
  item.type = 'button';
  item.disabled = Boolean(disabled);
  item.addEventListener('click', onClick);
  return item;
}


function unlockGameAudio() {
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    gameAudioContext ||= new AudioContextClass();
    if (gameAudioContext.state === 'suspended') gameAudioContext.resume().catch(() => {});
  } catch {}
}

function withGameAudio(play) {
  const context = gameAudioContext;
  if (!context) return;
  const run = () => {
    if (gameAudioContext !== context || context.state !== 'running') return;
    try { play(context); } catch {}
  };
  if (context.state === 'suspended') context.resume().then(run).catch(() => {});
  else run();
}

function playAudioCurve(context, frequencies, duration, delay, wave, volume, cutoff) {
  const start = context.currentTime + delay;
  const oscillator = context.createOscillator();
  const filter = context.createBiquadFilter();
  const gain = context.createGain();
  oscillator.type = wave;
  oscillator.frequency.setValueCurveAtTime(Float32Array.from(frequencies), start, duration);
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(cutoff, start);
  filter.Q.setValueAtTime(0.7, start);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.linearRampToValueAtTime(volume, start + Math.min(0.045, duration / 4));
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  oscillator.connect(filter);
  filter.connect(gain);
  gain.connect(context.destination);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.025);
}

function playWolfHowl() {
  withGameAudio(context => {
    playAudioCurve(context, [390, 430, 480, 520, 500, 455, 405, 360, 325, 300, 320, 350, 330, 285], 1.75, 0, 'sine', 0.075, 1200);
    playAudioCurve(context, [780, 860, 960, 1040, 1000, 910, 810, 720, 650, 600, 640, 700, 660, 570], 1.75, 0.025, 'triangle', 0.018, 1900);
  });
}

function playRoosterCrow() {
  withGameAudio(context => {
    playAudioCurve(context, [920, 1240, 880, 1080, 720], 0.2, 0, 'sawtooth', 0.035, 2600);
    playAudioCurve(context, [820, 1180, 850, 1040, 660], 0.22, 0.22, 'sawtooth', 0.038, 2500);
    playAudioCurve(context, [740, 980, 1240, 900, 700, 520, 430], 0.62, 0.48, 'triangle', 0.045, 2300);
  });
}

function showMessage(message, isError = false) {
  for (const id of ['entryMessage', 'roomMessage']) {
    const target = $(id);
    if (!target) continue;
    target.textContent = message || '';
    target.classList.toggle('error', Boolean(isError));
  }
}

function setConnection(connected) {
  const target = $('connectionStatus');
  if (!target) return;
  target.textContent = connected ? 'Realtime terhubung' : 'Menyambungkan ulang';
  target.classList.toggle('muted', !connected);
  target.classList.toggle('offline', !connected);
}

async function request(path, options = {}) {
  const headers = {};
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  const authSession = options.session || session;
  if (options.auth !== false && authSession?.token) headers.Authorization = 'Bearer ' + authSession.token;
  const response = await fetch(API_BASE + path, {
    method: options.method || 'GET',
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    cache: 'no-store'
  });
  let data = {};
  try { data = await response.json(); } catch {}
  if (!response.ok) {
    const error = new Error(data.error || 'Permintaan gagal (' + response.status + ').');
    error.status = response.status;
    throw error;
  }
  return data;
}

function saveSession() {
  if (!session) return;
  localStorage.setItem(SESSION_PREFIX + session.code, JSON.stringify(session));
  localStorage.setItem('werewolf.lastRoom', session.code);
}

function stopRealtime() {
  realtimeGeneration += 1;
  connectingGeneration = null;
  if (reconnectTimer) clearTimeout(reconnectTimer);
  if (pollTimer) clearInterval(pollTimer);
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  if (clockTimer) clearInterval(clockTimer);
  reconnectTimer = null;
  pollTimer = null;
  heartbeatTimer = null;
  clockTimer = null;
  if (socket) {
    socket.onclose = null;
    try { socket.close(); } catch {}
  }
  socket = null;
}

function clearInvalidSession(activeSession) {
  if (session !== activeSession) return;
  stopRealtime();
  localStorage.removeItem(SESSION_PREFIX + activeSession.code);
  if (localStorage.getItem('werewolf.lastRoom') === activeSession.code) localStorage.removeItem('werewolf.lastRoom');
  session = null;
  roomState = null;
  lastNarrationKey = '';
  $('roomPanel').classList.add('hidden');
  $('entryPanel').classList.remove('hidden');
  const url = new URL(location.href);
  url.searchParams.delete('room');
  history.replaceState({}, '', url);
  showMessage('Sesi tidak valid atau room sudah kedaluwarsa. Silakan bergabung kembali.', true);
}

async function enterRoom(nextSession) {
  stopRealtime();
  session = nextSession;
  roomState = null;
  lastNarrationKey = '';
  saveSession();
  $('entryPanel').classList.add('hidden');
  $('roomPanel').classList.remove('hidden');
  $('roomCodeLabel').textContent = session.code;
  setConnection(false);
  const invite = new URL(location.href);
  invite.searchParams.set('room', session.code);
  history.replaceState({}, '', invite);
  try {
    await refreshState();
  } catch (error) {
    if (session !== nextSession) return false;
    if (error.status === 401 || error.status === 404) {
      clearInvalidSession(nextSession);
      return false;
    }
    showMessage('Koneksi belum stabil. Sesi tetap disimpan dan sistem akan mencoba menyambungkan ulang: ' + error.message, true);
  }
  if (session !== nextSession) return false;
  connectRealtime();
  const activeSession = nextSession;
  pollTimer = setInterval(() => {
    if (session === activeSession && (!socket || socket.readyState !== WebSocket.OPEN)) refreshState().catch(() => {});
  }, 5000);
  return true;
}

async function refreshState() {
  const activeSession = session;
  if (!activeSession || pollingSession === activeSession) return;
  pollingSession = activeSession;
  try {
    const result = await request('/rooms/' + activeSession.code + '/state', { session: activeSession });
    if (session === activeSession) applyState(result.state, activeSession);
  } catch (error) {
    if (session === activeSession && (error.status === 401 || error.status === 404)) clearInvalidSession(activeSession);
    throw error;
  } finally {
    if (pollingSession === activeSession) pollingSession = null;
  }
}

async function connectRealtime() {
  const activeSession = session;
  const generation = realtimeGeneration;
  if (!activeSession) return;
  if (socket && (socket.readyState === WebSocket.CONNECTING || socket.readyState === WebSocket.OPEN)) return;
  if (connectingGeneration === generation) return;
  connectingGeneration = generation;
  try {
    const result = await request('/rooms/' + activeSession.code + '/ticket', { method: 'POST', body: {}, session: activeSession });
    if (session !== activeSession || generation !== realtimeGeneration) return;
    const wsBase = API_BASE.replace(/^https:/, 'wss:').replace(/^http:/, 'ws:');
    const nextSocket = new WebSocket(wsBase + '/rooms/' + activeSession.code + '/ws?ticket=' + encodeURIComponent(result.ticket));
    socket = nextSocket;
    nextSocket.onopen = () => {
      if (session !== activeSession || generation !== realtimeGeneration || socket !== nextSocket) {
        try { nextSocket.close(); } catch {}
        return;
      }
      reconnectDelay = 1200;
      setConnection(true);
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      heartbeatTimer = setInterval(() => {
        if (socket === nextSocket && nextSocket.readyState === WebSocket.OPEN) {
          try { nextSocket.send('ping'); } catch {}
        }
      }, 25000);
    };
    nextSocket.onmessage = event => {
      if (session !== activeSession || generation !== realtimeGeneration || socket !== nextSocket) return;
      if (event.data === 'pong') return;
      try {
        const message = JSON.parse(event.data);
        if (message.type === 'state') applyState(message.state, activeSession);
        if (message.type === 'error') showMessage(message.error, true);
      } catch {}
    };
    nextSocket.onclose = () => {
      if (socket === nextSocket) {
        socket = null;
        if (heartbeatTimer) clearInterval(heartbeatTimer);
        heartbeatTimer = null;
        setConnection(false);
        scheduleReconnect(generation);
      }
    };
    nextSocket.onerror = () => { try { nextSocket.close(); } catch {} };
  } catch (error) {
    if (session === activeSession && generation === realtimeGeneration) {
      setConnection(false);
      if (error.status === 401 || error.status === 404) {
        refreshState().catch(() => {}).finally(() => {
          if (session === activeSession && generation === realtimeGeneration) scheduleReconnect(generation);
        });
      } else scheduleReconnect(generation);
    }
  } finally {
    if (connectingGeneration === generation) connectingGeneration = null;
  }
}

function scheduleReconnect(generation = realtimeGeneration) {
  if (!session || generation !== realtimeGeneration || reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    if (generation === realtimeGeneration) connectRealtime();
  }, reconnectDelay);
  reconnectDelay = Math.min(reconnectDelay * 1.7, 12000);
}

async function sendAction(type, payload = {}) {
  const activeSession = session;
  if (!activeSession) return;
  try {
    const result = await request('/rooms/' + activeSession.code + '/action', {
      method: 'POST', body: { type, ...payload }, session: activeSession
    });
    if (session !== activeSession) return false;
    applyState(result.state, activeSession);
    showMessage('');
    return true;
  } catch (error) {
    if (session === activeSession) {
      showMessage(error.message, true);
      if ([401, 404, 409].includes(error.status)) refreshState().catch(() => {});
    }
    return false;
  }
}

function applyState(nextState, expectedSession = session) {
  if (!nextState || !nextState.room || (expectedSession && session !== expectedSession)) return;
  if (session && nextState.room.code !== session.code) return;
  const previous = roomState;
  const sameRoom = previous?.room?.code === nextState.room.code;
  const nextRevision = Number(nextState.room.revision) || 0;
  const previousRevision = Number(previous?.room?.revision) || 0;
  if (sameRoom && nextRevision && previousRevision && nextRevision < previousRevision) return;
  const phaseChanged = sameRoom && (
    previous.room.phase !== nextState.room.phase || previous.room.round !== nextState.room.round
  );
  if (sameRoom && previous.room.phase !== 'lobby' && nextState.room.phase === 'lobby') roleDraft = null;
  if (roleDraft && roleDraft.code !== nextState.room.code) roleDraft = null;
  if (phaseChanged && nextState.room.phase === 'night') playWolfHowl();
  if (phaseChanged && nextState.room.phase === 'morning') playRoosterCrow();
  const narrationKey = [nextState.room.code, nextState.room.phase, nextState.room.round, nextState.room.lastResult?.at || ''].join(':');
  if (previous && nextState.self?.isModerator && systemModeratorEnabled(nextState) && narrationKey !== lastNarrationKey) {
    const narration = systemNarrationText(nextState.room);
    if (narration) speakSystemNarration(narration);
  }
  lastNarrationKey = narrationKey;
  roomState = nextState;
  renderRoom();
}

function roleLabel(role) {
  return ROLE_INFO[role]?.[0] || 'Belum diketahui';
}

function isHost() {
  return Boolean(roomState?.self?.isModerator);
}

function systemModeratorEnabled(state = roomState) {
  const room = state?.room;
  const mode = room?.activeModeratorMode || room?.moderatorMode || room?.settings?.moderatorMode;
  return mode ? mode === 'system' : Number(room?.settings?.roleCounts?.moderator ?? 0) === 1;
}

function abilityOn(key) {
  return roomState?.room?.settings?.abilities?.[key] !== false;
}

function addText(parent, tag, className, text) {
  const item = node(tag, className, text);
  parent.append(item);
  return item;
}

function recommendedRoleCounts(playerCount) {
  const counts = Object.fromEntries(Object.keys(ROLE_COUNT_DEFAULTS).map(key => [key, 0]));
  if (!Number.isSafeInteger(playerCount) || playerCount < 2) return counts;
  const wolfCount = Math.min(playerCount - 1, Math.max(1, Math.floor(playerCount / 4)));
  if (playerCount >= 12 && wolfCount >= 3) {
    counts.alpha_wolf = 1;
    counts.wolf = wolfCount - 1;
  } else counts.wolf = wolfCount;
  let remaining = playerCount - wolfCount;
  const roleSchedule = [
    ['seer', 3], ['doctor', 4], ['bodyguard', 7], ['witch', 9],
    ['hunter', 11], ['cupid', 13], ['detective', 15], ['mayor', 17],
    ['guardian_angel', 19], ['jester', 21]
  ];
  for (const [role, minimumPlayers] of roleSchedule) {
    if (playerCount >= minimumPlayers && remaining > 1) {
      counts[role] += 1;
      remaining -= 1;
    }
  }
  counts.villager = remaining;
  return counts;
}

function roleSettingsForUI(settings = {}) {
  const draft = roleDraft?.code === roomState?.room?.code ? roleDraft : null;
  const storedMode = settings.moderatorMode
    || (Number(settings.roleCounts?.moderator ?? 0) === 1 ? 'system' : 'host');
  if (draft) return {
    roleCounts: { ...ROLE_COUNT_DEFAULTS, ...draft.roleCounts },
    moderatorMode: draft.moderatorMode
  };
  return {
    roleCounts: settings.roleCounts
      ? { ...ROLE_COUNT_DEFAULTS, ...settings.roleCounts }
      : recommendedRoleCounts(roomState?.players?.length || 0),
    moderatorMode: storedMode
  };
}

function roleConfigTotals(roleCounts = {}) {
  const sum = keys => keys.reduce((total, key) => total + Number(roleCounts[key] || 0), 0);
  return {
    total: sum(ROLE_CONFIG_GROUPS.flatMap(group => group.roles.map(([key]) => key))),
    wolves: sum(['wolf', 'alpha_wolf']),
    village: sum(ROLE_CONFIG_GROUPS.find(group => group.key === 'village').roles.map(([key]) => key)),
    neutral: sum(['guardian_angel', 'jester'])
  };
}

function updateRoleConfigSummary(container) {
  const summary = container.querySelector('[data-role-summary]');
  if (!summary) return;
  const roleCounts = {};
  for (const input of container.querySelectorAll('[data-role-count]')) roleCounts[input.dataset.roleCount] = Math.max(0, Number(input.value) || 0);
  const totals = roleConfigTotals(roleCounts);
  summary.replaceChildren();
  const grid = node('div', 'role-team-summary');
  for (const [label, value] of [
    ['Total role', totals.total], ['Werewolf', totals.wolves],
    ['Desa', totals.village], ['Netral', totals.neutral]
  ]) {
    const item = node('div', 'role-team-summary-item');
    addText(item, 'b', '', String(value));
    addText(item, 'span', '', label);
    grid.append(item);
  }
  summary.append(grid);
}

function captureRoleDraft(container, event) {
  const roleCounts = {};
  for (const input of container.querySelectorAll('[data-role-count]')) {
    roleCounts[input.dataset.roleCount] = Math.max(0, Number(input.value) || 0);
  }
  const changedKey = event?.target?.dataset?.roleCount;
  if (changedKey && changedKey !== 'villager') {
    const total = roleConfigTotals(roleCounts).total;
    const delta = (roomState?.players?.length || 0) - total;
    roleCounts.villager = Math.max(0, (roleCounts.villager || 0) + delta);
    const villagerInput = container.querySelector('[data-role-count="villager"]');
    if (villagerInput) villagerInput.value = String(roleCounts.villager);
  }
  const moderatorMode = container.querySelector('[data-moderator-mode]')?.value || 'host';
  roleDraft = { code: roomState?.room?.code, roleCounts, moderatorMode };
  updateRoleConfigSummary(container);
}

function renderRoleConfigEditor(container, settings) {
  const config = roleSettingsForUI(settings);
  container.replaceChildren();
  container.classList.add('role-config-editor');
  const moderatorSection = node('section', 'role-config-team moderator-role-config');
  addText(moderatorSection, 'div', 'role-section-label', 'ROLE MODERATOR · PENGATUR JALANNYA PERMAINAN');
  const moderatorRow = node('div', 'moderator-mode-row');
  const moderatorCard = node('div', 'moderator-role-chip');
  addText(moderatorCard, 'b', '', 'MODERATOR');
  addText(moderatorCard, 'span', '', 'Menjalankan alur permainan');
  moderatorRow.append(moderatorCard);
  const moderatorField = node('label', 'moderator-mode-field');
  addText(moderatorField, 'span', '', 'Mode moderator');
  const moderatorSelect = node('select', 'moderator-mode-select');
  moderatorSelect.dataset.moderatorMode = 'true';
  for (const [value, label] of [['host', 'Host'], ['system', 'Sistem'], ['random', 'Acak']]) {
    const option = node('option', '', label);
    option.value = value;
    moderatorSelect.append(option);
  }
  moderatorSelect.value = config.moderatorMode;
  moderatorField.append(moderatorSelect);
  moderatorRow.append(moderatorField);
  moderatorSection.append(moderatorRow);
  addText(moderatorSection, 'p', 'hint', 'Host: perpindahan fase dikendalikan host. Sistem: fase otomatis setelah semua aksi selesai. Acak: sistem memilih salah satu mode setiap permainan.');
  container.append(moderatorSection);
  for (const group of ROLE_CONFIG_GROUPS) {
    const section = node('section', 'role-config-team role-team-' + group.key);
    addText(section, 'div', 'role-section-label', group.label);
    const grid = node('div', 'role-count-grid');
    for (const [key, label] of group.roles) {
      const field = node('label', 'role-count-field');
      addText(field, 'span', '', label);
      const input = node('input', 'role-count-input');
      input.type = 'number';
      input.min = '0';
      input.step = '1';
      input.inputMode = 'numeric';
      input.value = String(config.roleCounts[key] ?? 0);
      input.dataset.roleCount = key;
      field.append(input);
      grid.append(field);
    }
    section.append(grid);
    container.append(section);
  }
  const summary = node('div', 'role-config-summary');
  summary.dataset.roleSummary = 'true';
  container.append(summary);
  container.addEventListener('input', event => captureRoleDraft(container, event));
  container.addEventListener('change', event => captureRoleDraft(container, event));
  updateRoleConfigSummary(container);
}

function readRoleSettings(container) {
  const roleCounts = {};
  for (const input of container.querySelectorAll('[data-role-count]')) {
    const count = Number(input.value);
    if (!Number.isSafeInteger(count) || count < 0) throw new Error('Jumlah setiap role harus berupa bilangan bulat non-negatif.');
    roleCounts[input.dataset.roleCount] = count;
  }
  const moderatorMode = container.querySelector('[data-moderator-mode]')?.value || 'host';
  if (!['host', 'system', 'random'].includes(moderatorMode)) throw new Error('Mode moderator tidak valid.');
  return { roleCounts, moderatorMode };
}

function renderPlayers() {
  const list = $('playersList');
  list.replaceChildren();
  const players = roomState.players || [];
  $('playerCount').textContent = players.length + ' pemain';
  for (const player of players) {
    const chip = node('div', 'player-chip' + (player.alive ? '' : ' dead') + (player.isBot ? ' bot' : ''));
    const avatar = node('span', 'player-avatar', (player.name || '?').slice(0, 1).toUpperCase());
    const name = node('span', 'player-name', player.name);
    if (player.isBot) name.append(node('span', 'bot-mark', ' BOT'));
    const details = [];
    if (player.role) details.push(roleLabel(player.role));
    if (player.nightActionPartner) details.push('Pasangan: ' + player.nightActionPartner);
    if (!player.alive) details.push('Tereliminasi');
    else if (roomState.room.phase === 'role_draw') details.push(player.hasDrawn ? 'Kartu dibuka' : 'Belum membuka kartu');
    else if (roomState.room.phase === 'night') {
      details.push(player.hasActed
        ? 'Aksi selesai' + (player.nightActionTarget ? ' · ' + player.nightActionTarget : '')
        : 'Menunggu aksi');
    } else if (roomState.room.phase === 'voting') {
      details.push(player.hasVoted ? 'Memilih ' + (player.voteTarget || 'pemain') : 'Belum voting');
    } else if (player.connected) details.push('Online');
    chip.append(avatar, name, node('span', 'player-meta', details.join(' · ') || (player.connected ? 'Online' : 'Menunggu')));
    list.append(chip);
  }
}

function updatePhaseTracker(phase) {
  const tracker = $('phaseTracker');
  if (!tracker) return;
  const steps = ['lobby', 'role_draw', 'night', 'morning', 'discussion', 'voting', 'result'];
  const activeIndex = phase === 'finished' ? steps.length : Math.max(0, steps.indexOf(phase));
  for (const item of tracker.querySelectorAll('[data-step]')) {
    const index = steps.indexOf(item.dataset.step);
    item.classList.toggle('active', index === activeIndex);
    item.classList.toggle('done', phase === 'finished' || index < activeIndex);
  }
}

function renderRoom() {
  if (!roomState) return;
  const room = roomState.room;
  const moderator = isHost();
  const labels = {
    lobby: 'Lobby · Menunggu pemain',
    role_draw: 'Pembagian kartu',
    night: 'Malam ' + room.round,
    morning: 'Pagi · Pengumuman moderator',
    discussion: 'Diskusi',
    voting: 'Voting',
    result: 'Hasil voting',
    finished: 'Permainan selesai'
  };
  $('phaseLabel').textContent = moderator ? (labels[room.phase] || room.phase) : '';
  $('roundLabel').textContent = moderator ? (room.round ? 'Ronde ' + room.round : 'Lobby') : '';
  $('roomCodeLabel').textContent = room.code;
  $('phaseTracker').classList.toggle('hidden', !moderator);
  const resetButton = $('resetRoom');
  if (resetButton) {
    resetButton.classList.toggle('hidden', !moderator || room.phase === 'lobby' || room.phase === 'finished');
    resetButton.textContent = 'Reset ke Ruang Tunggu';
  }
  $('playersSection').classList.toggle('hidden', !moderator);
  $('roomIdentity').classList.toggle('hidden', !moderator);
  $('roomMeta').classList.toggle('hidden', !moderator);
  if (moderator) {
    updatePhaseTracker(room.phase);
    renderPlayers();
  } else {
    $('playersList').replaceChildren();
  }
  const activeElement = document.activeElement;
  const activeId = activeElement && activeElement.id ? activeElement.id : '';
  const activeValue = activeElement && 'value' in activeElement ? activeElement.value : undefined;
  const phasePanel = $('phasePanel');
  if (phasePanel) phasePanel.dataset.phase = room.phase;
  const content = $('phaseContent');
  content.replaceChildren();
  if (moderator) renderModeratorPhase(content);
  else renderPlayerPhase(content);
  if (activeId) {
    const replacement = document.getElementById(activeId);
    if (replacement && activeValue !== undefined) {
      replacement.value = activeValue;
      replacement.focus({ preventScroll: true });
      if (typeof replacement.setSelectionRange === 'function') {
        try { replacement.setSelectionRange(activeValue.length, activeValue.length); } catch {}
      }
    }
  }
}

function phaseHeader(parent, kicker, title, description) {
  const head = node('div', 'phase-title');
  const left = node('div');
  addText(left, 'div', 'eyebrow-small', kicker);
  addText(left, 'h2', '', title);
  if (description) addText(left, 'p', '', description);
  head.append(left);
  parent.append(head);
}

function renderRoleCard(parent, role, eyebrow = 'KARTU RAHASIA KAMU') {
  const info = ROLE_INFO[role] || ['Peran', ''];
  const card = node('div', 'role-card');
  card.dataset.role = role;
  const art = node('div', 'role-art');
  const image = node('img');
  image.src = './assets/illustrations/role-' + (ROLE_INFO[role] ? role : 'villager') + '.svg';
  image.alt = 'Ilustrasi peran ' + info[0];
  image.loading = 'eager';
  art.append(image);
  card.append(art);
  addText(card, 'div', 'eyebrow-small', eyebrow);
  addText(card, 'div', 'role-name', info[0]);
  addText(card, 'p', '', info[1]);
  parent.append(card);
}

function renderPlayerRoleReminder(parent) {
  const role = roomState.self?.role;
  if (!role || !roomState.self.hasDrawn) return;
  const info = ROLE_INFO[role] || ['Peran', ''];
  const card = node('button', 'role-flip-card');
  card.type = 'button';
  card.setAttribute('aria-label', 'Kartu tertutup. Tekan untuk melihat role.');
  card.setAttribute('aria-pressed', 'false');
  const inner = node('span', 'role-flip-inner');
  const back = node('span', 'role-flip-face role-flip-back');
  addText(back, 'span', 'role-flip-title', 'THE VILLAGE');
  addText(back, 'span', 'role-flip-subtitle', 'TEKAN UNTUK MELIHAT ROLE');
  const front = node('span', 'role-flip-face role-flip-front');
  const art = node('span', 'role-flip-art');
  const image = node('img');
  image.src = './assets/illustrations/role-' + (ROLE_INFO[role] ? role : 'villager') + '.svg';
  image.alt = '';
  image.loading = 'eager';
  art.append(image);
  front.append(art);
  addText(front, 'span', 'role-flip-eyebrow', 'KARTU RAHASIA KAMU');
  addText(front, 'span', 'role-flip-name', info[0]);
  addText(front, 'span', 'role-flip-description', info[1]);
  inner.append(back, front);
  card.append(inner);
  card.addEventListener('click', () => {
    const flipped = card.classList.toggle('is-flipped');
    card.setAttribute('aria-pressed', String(flipped));
    card.setAttribute('aria-label', flipped ? 'Role terlihat. Tekan untuk menutup kartu.' : 'Kartu tertutup. Tekan untuk melihat role.');
  });
  parent.append(card);
  addText(parent, 'p', 'hint role-flip-hint', 'Tekan kartu untuk melihat role. Tekan sekali lagi untuk menutupnya.');
}

function renderWolfTeamPanel(parent) {
  if (!['wolf', 'alpha_wolf'].includes(roomState.self?.role) || !roomState.self.alive) return;
  const names = roomState.wolfTeam || [];
  if (!names.length) return;
  const panel = node('div', 'wolf-team-panel');
  addText(panel, 'div', 'eyebrow-small', 'KAWANAN WEREWOLF');
  addText(panel, 'p', '', 'Anggota kawanan: ' + names.join(', ') + '. Kamu tidak dapat menyerang sesama Werewolf.');
  parent.append(panel);
}

function renderModeratorEventReport(parent, result) {
  if (!result) return;
  if (Array.isArray(result.events) && result.events.length) {
    const events = node('section', 'moderator-event-report');
    addText(events, 'div', 'eyebrow-small', 'RINGKASAN KEJADIAN');
    for (const event of result.events) addText(events, 'p', 'moderator-event-item', event);
    parent.append(events);
  }
  const eliminations = Array.isArray(result.eliminations) ? result.eliminations : [];
  if (eliminations.length) {
    const list = node('section', 'moderator-elimination-report');
    addText(list, 'div', 'eyebrow-small', 'PEMAIN TERELIMINASI');
    for (const elimination of eliminations) {
      const row = node('div', 'moderator-elimination-row');
      addText(row, 'b', '', (elimination.name || 'Pemain') + ' · ' + roleLabel(elimination.role));
      addText(row, 'span', '', eliminationCauseLabel(elimination.cause));
      list.append(row);
    }
    parent.append(list);
  } else if (result.eliminatedId) {
    const player = roomState.players.find(item => item.id === result.eliminatedId);
    if (player) addText(parent, 'p', 'hint', player.name + ' · ' + roleLabel(player.role));
  } else if (result.kind === 'night' || result.kind === 'vote') {
    addText(parent, 'p', 'hint', 'Tidak ada pemain yang tereliminasi.');
  }
}

function eliminationCauseLabel(cause) {
  return ({
    werewolf_attack: 'Serangan Werewolf',
    witch_poison: 'Racun Witch',
    bodyguard_sacrifice: 'Pengorbanan Bodyguard',
    cupid_bond: 'Efek ikatan Cupid',
    vote: 'Hasil voting',
    hunter: 'Tembakan Hunter'
  })[cause] || 'Penyebab eliminasi';
}

function renderModeratorPhase(parent) {
  switch (roomState.room.phase) {
    case 'lobby': renderModeratorLobby(parent); break;
    case 'role_draw': renderModeratorRoleDraw(parent); break;
    case 'night': renderModeratorNight(parent); break;
    case 'morning': renderModeratorMorning(parent); break;
    case 'discussion': renderModeratorDiscussion(parent); break;
    case 'voting': renderModeratorVoting(parent); break;
    case 'result': renderModeratorResult(parent); break;
    case 'finished': renderModeratorFinished(parent); break;
    default: addText(parent, 'p', 'notice', 'Status permainan tidak dikenali.');
  }
  if (systemModeratorEnabled()) renderSystemNarrator(parent);
}

function renderPlayerPhase(parent) {
  const loverNames = roomState.self?.loverNames || [];
  if (loverNames.length === 2) {
    const message = roomState.self.role === 'cupid'
      ? 'Pasangan yang kamu hubungkan: ' + loverNames.join(' & ') + '. Role pasangan tetap rahasia.'
      : 'Kamu terikat sebagai pasangan dengan ' + loverNames.filter(name => name !== roomState.self.name).join(' & ') + '. Jika salah satu tereliminasi, pasangannya ikut tereliminasi. Role pasangan tetap rahasia.';
    addText(parent, 'div', 'notice success', message);
  }
  if (!['lobby', 'role_draw'].includes(roomState.room.phase)) renderPlayerRoleReminder(parent);
  renderWolfTeamPanel(parent);
  switch (roomState.room.phase) {
    case 'lobby': {
      phaseHeader(parent, 'RUANG TUNGGU', 'Menunggu permainan dimulai', 'Kamu sudah berada di room yang sama dengan pemain lainnya. Host akan memulai permainan setelah semua siap.');
      const roster = node('div', 'waiting-room-roster');
      const lobbyPlayers = roomState.lobbyPlayers || [];
      addText(roster, 'div', 'waiting-room-count', lobbyPlayers.length + ' pemain di ruang tunggu');
      const list = node('div', 'waiting-room-list');
      for (const player of lobbyPlayers) {
        const item = node('div', 'waiting-room-player');
        addText(item, 'b', '', player.name);
        addText(item, 'span', player.connected ? 'online' : 'offline', player.connected ? 'Online' : 'Menunggu');
        list.append(item);
      }
      roster.append(list);
      parent.append(roster);
      break;
    }
    case 'role_draw': renderPlayerRoleDraw(parent); break;
    case 'night': renderPlayerNight(parent); break;
    case 'morning': renderPlayerMorning(parent); break;
    case 'discussion': renderPlayerDiscussion(parent); break;
    case 'voting': renderPlayerVoting(parent); break;
    case 'result': renderPlayerVoteResult(parent); break;
    case 'finished':
      addText(parent, 'div', 'notice success', 'Permainan selesai. Tunggu pengumuman moderator.');
      break;
    default: addText(parent, 'p', 'notice', 'Menunggu moderator.');
  }
}

function renderModeratorLobby(parent) {
  phaseHeader(parent, 'PANEL MODERATOR', 'Atur role setelah pemain bergabung', 'Tentukan role dan jumlahnya di sini. Pengaturan ini dapat diubah selama room masih berada di lobby.');
  addText(parent, 'div', 'notice', 'Pemain bergabung: ' + roomState.players.length + '. Minimal 2 pemain; tidak ada batas jumlah pemain tetap dari aplikasi. Jumlah role harus sama dengan jumlah pemain; moderator tidak dihitung.');
  const settings = roomState.room.settings || {};
  const mode = roleSettingsForUI(settings).moderatorMode;
  addText(parent, 'div', mode === 'system' ? 'notice success' : 'notice', mode === 'system'
    ? 'Moderator sistem aktif. Narasi, malam, dan voting diproses otomatis setelah semua aksi selesai.'
    : mode === 'random' ? 'Mode acak aktif. Host atau sistem akan dipilih saat permainan dimulai.'
      : 'Moderator host aktif. Host mengatur perpindahan fase secara manual.');
  addText(parent, 'p', 'hint', 'Komposisi awal dibuat otomatis dan memakai kombinasi role yang bervariasi. Jika host mengubah jumlah role, pilihan tersebut disimpan; jumlah Warga Desa otomatis menyeimbangkan sisa pemain.');
  const configEditor = node('div', 'role-config-lobby');
  renderRoleConfigEditor(configEditor, settings);
  parent.append(configEditor);
  parent.append(button('Simpan pengaturan role', 'secondary wide', async () => {
    try {
      const saved = await sendAction('update_settings', { settings: readRoleSettings(configEditor) });
      if (saved) {
        roleDraft = null;
        renderRoom();
        showMessage('Pengaturan role berhasil disimpan. Pilihan host akan dipertahankan.');
      }
    } catch (error) { showMessage(error.message, true); }
  }));

  const config = roleSettingsForUI(settings);
  const totals = roleConfigTotals(config.roleCounts);
  const exact = totals.total === roomState.players.length;
  const balance = node('div', 'role-balance');
  addText(balance, 'div', 'eyebrow-small', 'KOMPOSISI KUBU');
  const balanceGrid = node('div', 'role-balance-grid');
  for (const [label, count] of [
    ['Werewolf', totals.wolves], ['Desa', totals.village], ['Netral', totals.neutral], ['Total role', totals.total]
  ]) {
    const item = node('div', 'role-balance-item');
    addText(item, 'b', '', String(count));
    addText(item, 'span', '', label);
    balanceGrid.append(item);
  }
  balance.append(balanceGrid);
  if (roomState.players.length < 2) addText(balance, 'p', 'hint', 'Minimal 2 pemain diperlukan agar kubu Werewolf dan Desa dapat bermain.');
  else if (!exact) addText(balance, 'p', 'notice warning', 'Jumlah role ' + totals.total + ' belum sama dengan ' + roomState.players.length + ' pemain. Sesuaikan angka role lalu simpan.');
  else if (totals.wolves < 1 || totals.village < 1) addText(balance, 'p', 'notice warning', 'Harus ada minimal satu anggota kubu Werewolf dan satu anggota kubu Desa.');
  else addText(balance, 'p', 'hint', 'Komposisi sudah sesuai dengan jumlah pemain.');
  parent.append(balance);

  const maxBotsPerBatch = 500;
  const botBox = node('div', 'bot-setup');
  addText(botBox, 'h3', '', 'Mode latihan vs bot');
  addText(botBox, 'p', 'hint', 'Bot otomatis membuka kartu, melakukan aksi malam, dan memberikan suara. Jumlah total pemain room tidak dibatasi angka tetap; bot dapat ditambahkan bertahap.');
  const botLabel = node('label', 'bot-count-label');
  botLabel.append(node('span', '', 'Jumlah bot tambahan'));
  const botCount = node('input');
  botCount.id = 'botCount';
  botCount.type = 'number';
  botCount.min = '1';
  botCount.max = String(maxBotsPerBatch);
  botCount.step = '1';
  botCount.inputMode = 'numeric';
  botCount.value = '5';
  botLabel.append(botCount);
  botBox.append(botLabel);
  botBox.append(button('Tambahkan bot otomatis', 'secondary wide', () => {
    const count = Number(botCount.value);
    if (!Number.isSafeInteger(count) || count < 1 || count > maxBotsPerBatch) {
      showMessage('Jumlah bot per penambahan harus 1–' + maxBotsPerBatch + '.', true);
      return;
    }
    sendAction('add_bots', { count });
  }));
  addText(botBox, 'p', 'hint', 'Maksimal 500 bot dalam satu penambahan. Untuk jumlah lebih besar, lakukan beberapa kali.');
  parent.append(botBox);

  const canStart = roomState.players.length >= 2 && exact && totals.wolves >= 1 && totals.village >= 1;
  parent.append(button('Mulai Permainan & Bagikan Kartu', 'primary wide', async () => {
    try {
      const saved = await sendAction('update_settings', { settings: readRoleSettings(configEditor) });
      if (!saved) return;
      roleDraft = null;
      await sendAction('start_game');
    } catch (error) { showMessage(error.message, true); }
  }, !canStart));
  addText(parent, 'p', 'hint', 'Kartu dibagikan secara privat. Setiap pemain membukanya sendiri pada perangkat masing-masing.');
}

function renderModeratorRoleDraw(parent) {
  phaseHeader(parent, 'PEMBAGIAN KARTU', 'Tunggu semua pemain membuka kartu', 'Setiap pemain membuka kartu pada perangkatnya sendiri. Moderator tidak melihat kartu pemain melalui layar pemain, tetapi dapat memantau status pembukaan di sini.');
  const opened = roomState.players.filter(player => player.hasDrawn).length;
  addText(parent, 'div', 'notice', opened + ' / ' + roomState.players.length + ' pemain sudah membuka kartu.');
  const complete = roomState.players.length > 0 && opened === roomState.players.length;
  if (systemModeratorEnabled()) {
    addText(parent, 'div', 'notice success', 'Sistem akan memulai malam secara otomatis setelah semua pemain membuka kartu.');
  } else {
    parent.append(button('Lanjut ke Malam 1', 'primary wide', () => sendAction('start_night'), !complete));
  }
}

function renderModeratorNight(parent) {
  phaseHeader(parent, 'MALAM ' + roomState.room.round, 'Menunggu aksi malam', 'Tidak ada hitung mundur malam. Target dan hasil setiap aksi hanya terlihat oleh moderator.');
  const room = roomState.room;
  addText(parent, 'div', 'notice', room.nightActionsSubmitted + ' / ' + room.nightActionsRequired + ' pemain sudah menyelesaikan aksi malam.');
  const complete = room.nightActionsSubmitted >= room.nightActionsRequired;
  if (systemModeratorEnabled()) {
    addText(parent, 'div', 'notice success', 'Sistem akan mengumumkan pagi otomatis setelah seluruh aksi peran aktif selesai.');
    if (!complete) parent.append(button('Paksa lanjut ke Pagi', 'secondary wide', () => {
      if (confirm('Aksi malam yang belum masuk akan dilewati. Lanjutkan ke pagi?')) sendAction('resolve_night', { force: true });
    }));
  } else {
    parent.append(button('Lanjut ke Pagi', 'primary wide', () => sendAction('resolve_night'), !complete));
    if (!complete) parent.append(button('Lewati pemain yang belum beraksi', 'secondary wide', () => {
      if (confirm('Aksi pemain yang belum selesai akan dilewati. Lanjutkan ke pagi?')) sendAction('resolve_night', { force: true });
    }));
  }
}

function renderModeratorMorning(parent) {
  phaseHeader(parent, 'PAGI HARI · RONDE ' + roomState.room.round, 'Hasil kejadian malam', 'Bacakan hasil ini kepada pemain. Layar pemain hanya menampilkan status pribadi: bertahan atau tereliminasi.');
  const result = roomState.room.lastResult;
  const card = node('div', 'result-card');
  addText(card, 'h3', '', result?.message || 'Malam telah berlalu.');
  renderModeratorEventReport(card, result);
  parent.append(card);
  if (roomState.room.lovers?.length === 2) {
    addText(parent, 'div', 'notice', 'Pasangan Cupid: ' + roomState.room.lovers.join(' & '));
  }
  if (roomState.room.winner) {
    addText(parent, 'div', 'winner', winnerLabel(roomState.room.winner));
    parent.append(button('Umumkan pemenang', 'primary wide', () => sendAction('start_discussion')));
  } else {
    parent.append(button('Lanjut ke Diskusi', 'primary wide', () => sendAction('start_discussion')));
  }
}

function renderModeratorDiscussion(parent) {
  phaseHeader(parent, 'FASE DISKUSI', 'Diskusi tatap muka', 'Diskusi berlangsung offline tanpa batas waktu. Moderator menentukan sendiri kapan voting dimulai.');
  const panel = node('div', 'discussion-mode-panel');
  addText(panel, 'h3', '', 'Diskusi offline');
  addText(panel, 'div', 'notice success', 'Mode aktif: diskusi tatap muka. Tidak ada tautan meeting dan tidak ada hitung mundur.');
  parent.append(panel);

  const botMessages = Array.isArray(roomState.chat) ? roomState.chat : [];
  if (botMessages.length) {
    const log = node('section', 'bot-discussion-log');
    addText(log, 'div', 'eyebrow-small', 'SIMULASI DISKUSI BOT');
    addText(log, 'h3', '', 'Komentar bot (simulasi)');
    addText(log, 'p', 'hint', 'Komentar otomatis berbasis role dan petunjuk permainan. Tidak ada timer; moderator bebas melanjutkan kapan saja.');
    const box = node('div', 'chat-box');
    const list = node('div', 'chat-list');
    list.setAttribute('role', 'log');
    list.setAttribute('aria-live', 'polite');
    for (const message of botMessages) {
      const item = node('article', 'chat-message');
      const author = node('b', '', message.name || 'Bot');
      author.append(node('span', 'chat-bot-badge', 'BOT'));
      item.append(author);
      item.append(node('p', '', message.text || ''));
      list.append(item);
    }
    box.append(list);
    log.append(box);
    parent.append(log);
  }

  parent.append(button('Lanjut ke Voting', 'primary wide', () => sendAction('start_voting')));
}

function renderModeratorVoting(parent) {
  phaseHeader(parent, 'FASE VOTING', 'Pantau suara pemain', 'Pilihan setiap pemain hanya terlihat oleh moderator. Hasil voting tetap rahasia sampai diumumkan.');
  const room = roomState.room;
  addText(parent, 'div', 'notice', room.votesSubmitted + ' / ' + room.votesRequired + ' suara sudah masuk.');
  const complete = room.votesSubmitted >= room.votesRequired;
  if (systemModeratorEnabled()) {
    addText(parent, 'div', 'notice success', 'Sistem akan menghitung dan mengumumkan hasil otomatis setelah semua pemain hidup memberikan suara.');
    if (!complete) parent.append(button('Akhiri voting sekarang', 'secondary wide', () => {
      if (confirm('Pemain yang belum memilih akan dilewati. Hitung suara sekarang?')) sendAction('resolve_vote', { force: true });
    }));
  } else {
    parent.append(button('Lanjut · Umumkan hasil voting', 'primary wide', () => sendAction('resolve_vote'), !complete));
    if (!complete) parent.append(button('Hitung suara yang sudah masuk', 'secondary wide', () => {
      if (confirm('Pemain yang belum memilih akan dilewati. Hitung suara sekarang?')) sendAction('resolve_vote', { force: true });
    }));
  }
}

function renderModeratorResult(parent) {
  phaseHeader(parent, 'HASIL VOTING', 'Bacakan hasil voting', 'Moderator dapat melihat pemain yang tereliminasi beserta perannya. Pemain lain hanya melihat status pribadinya.');
  const result = roomState.room.lastResult;
  const card = node('div', 'result-card');
  addText(card, 'h3', '', result?.message || 'Hasil voting tersedia.');
  renderModeratorEventReport(card, result);
  parent.append(card);
  addText(parent, 'p', 'hint', 'Tidak ada batas maksimal ronde malam. Permainan berlanjut sampai kondisi kemenangan terpenuhi.');
  parent.append(button('Lanjut ke Malam ' + (roomState.room.round + 1), 'primary wide', () => sendAction('next_round')));
}

function renderModeratorFinished(parent) {
  phaseHeader(parent, 'GAME OVER', 'Permainan selesai', 'Hasil akhir dan seluruh peran hanya ditampilkan pada panel moderator.');
  addText(parent, 'div', 'winner', winnerLabel(roomState.room.winner));
  if (roomState.room.lovers?.length === 2) {
    addText(parent, 'div', 'notice', 'Pasangan Cupid: ' + roomState.room.lovers.join(' & '));
  }
  if (roomState.room.additionalWinners?.length) {
    const names = roomState.players.filter(player => roomState.room.additionalWinners.includes(player.id)).map(player => player.name);
    addText(parent, 'div', 'notice success', 'Kemenangan tambahan Guardian Angel: ' + names.join(', '));
  }
  if (roomState.room.lastResult?.message) addText(parent, 'div', 'notice success', roomState.room.lastResult.message);
  renderModeratorEventReport(parent, roomState.room.lastResult);
  const card = node('div', 'result-card');
  for (const player of roomState.players) {
    card.append(node('p', '', player.name + ' — ' + roleLabel(player.role) + (player.alive ? ' · Hidup' : ' · Tereliminasi')));
  }
  parent.append(card);
  parent.append(button('Main Lagi · Kembali ke Ruang Tunggu', 'primary wide', () => {
    if (confirm('Kembalikan semua pemain ke ruang tunggu? Daftar pemain dan kode room tetap dipertahankan.')) sendAction('reset_to_lobby');
  }));
}

function renderPlayerRoleDraw(parent) {
  if (!roomState.self.hasDrawn) {
    const card = node('div', 'card-back');
    const label = node('div');
    label.append(node('div', '', 'WEREWOLF'));
    label.append(node('span', '', 'TEKAN UNTUK MEMBUKA KARTU'));
    card.append(label);
    parent.append(card);
    parent.append(button('Buka kartu saya', 'primary wide', () => sendAction('draw_card')));
  } else {
    renderRoleCard(parent, roomState.self.role);
    addText(parent, 'div', 'notice success', 'Kartu sudah dibuka. Rahasiakan peranmu.');
  }
}

function renderPlayerNight(parent) {
  const self = roomState.self;
  if (!self.alive) {
    addText(parent, 'div', 'notice warning', 'Kamu sudah tereliminasi.');
    return;
  }
  addText(parent, 'p', 'hint', systemModeratorEnabled()
    ? 'Fase malam tidak memakai hitung mundur. Sistem mengumumkan pagi setelah seluruh pemain menyelesaikan aksi malam.'
    : 'Fase malam tidak memakai hitung mundur. Selesaikan aksi dan tunggu moderator melanjutkan ke pagi.');
  if (!self.role) {
    addText(parent, 'div', 'notice warning', 'Kartu belum dibuka. Hubungi moderator.');
    return;
  }
  if (self.hasActed) {
    addText(parent, 'div', 'notice success', 'Aksimu sudah dikirim. Tunggu moderator.');
    renderPrivateInspectionResult(parent);
    return;
  }
  const roleAbility = {
    seer: 'seerInspection', doctor: 'doctorProtection', bodyguard: 'bodyguardSacrifice',
    cupid: 'cupidBond', detective: 'detectiveInspection'
  };
  if (self.role === 'villager') {
    const prompt = self.villagerPrompt;
    addText(parent, 'h3', '', 'Tantangan malam · Penjumlahan');
    if (!prompt || !Array.isArray(prompt.options) || prompt.options.length !== 4) {
      addText(parent, 'div', 'notice warning', 'Soal malam belum tersedia. Tunggu sinkronisasi room.');
      return;
    }
    addText(parent, 'p', 'hint', 'Selesaikan soal rahasia berikut. Pilih satu dari empat jawaban; hasilnya tidak memengaruhi kemenangan atau voting.');
    addText(parent, 'div', 'villager-math-question', prompt.question + ' = ?');
    const answers = node('div', 'action-grid villager-math-options');
    prompt.options.forEach((value, index) => {
      answers.append(button(String.fromCharCode(65 + index) + ' · ' + value, 'action-button', () =>
        sendAction('night_action', { mode: 'villager_math', promptId: prompt.id, choiceIndex: index })
      ));
    });
    parent.append(answers);
    return;
  }
  if (['hunter', 'mayor', 'jester'].includes(self.role)
    || (roleAbility[self.role] && !abilityOn(roleAbility[self.role]))
    || (self.role === 'guardian_angel' && !abilityOn('guardianProtection') && !abilityOn('guardianBonus'))
    || (self.role === 'cupid' && (roomState.room.round > 1 || !abilityOn('cupidBond') || self.cupidUsed))) {
    parent.append(button('Saya sudah siap', 'primary wide', () => sendAction('night_pass')));
    return;
  }
  const targets = (roomState.targets || []).filter(target => {
    if (target.id === self.id) return false;
    if (['wolf', 'alpha_wolf'].includes(self.role) && (roomState.wolfTeam || []).includes(target.name)) return false;
    return true;
  });
  if (['wolf', 'alpha_wolf'].includes(self.role)) {
    addText(parent, 'h3', '', 'Pilih target serangan');
    addText(parent, 'p', 'hint', 'Pilih satu nama untuk mengirim serangan kawanan. Nama anggota Werewolf tidak tersedia sebagai target.');
    const grid = node('div', 'action-grid');
    for (const target of targets) grid.append(button('Serang · ' + target.name, 'action-button', () => sendAction('night_action', { targetId: target.id })));
    parent.append(grid);
  } else if (['seer', 'detective', 'doctor', 'bodyguard', 'guardian_angel'].includes(self.role)) {
    const titles = {
      seer: 'Periksa identitas', detective: 'Periksa kubu', doctor: 'Lindungi pemain',
      bodyguard: 'Jaga pemain',
      guardian_angel: abilityOn('guardianProtection') ? 'Pilih target perlindungan' : 'Pilih target kemenangan tambahan'
    };
    addText(parent, 'h3', '', titles[self.role]);
    addText(parent, 'p', 'hint', 'Pilih nama pemain yang ingin kamu periksa atau lindungi. Aksi dikirim setelah satu pilihan ditekan.');
    const actionVerb = self.role === 'seer' || self.role === 'detective' ? 'Periksa' : self.role === 'doctor' ? 'Lindungi' : self.role === 'bodyguard' ? 'Jaga' : 'Pilih';
    const grid = node('div', 'action-grid');
    for (const target of targets) grid.append(button(actionVerb + ' · ' + target.name, 'action-button', () => sendAction('night_action', { targetId: target.id })));
    parent.append(grid);
    if (self.role === 'guardian_angel' && self.guardianTargetName) addText(parent, 'p', 'hint', 'Target pilihan terakhir: ' + self.guardianTargetName);
  } else if (self.role === 'witch') {
    const potions = self.witchPotions || { heal: false, poison: false };
    const attack = self.witchAttack || { ready: false, targetName: null, tied: false };
    addText(parent, 'h3', '', 'Pilih ramuan');
    if (!attack.ready) {
      addText(parent, 'div', 'notice', 'Menunggu seluruh Werewolf menyelesaikan pilihan serangan. Target hanya terlihat oleh Witch.');
    } else if (attack.targetName) {
      addText(parent, 'div', 'notice warning', 'Target serangan Werewolf: ' + attack.targetName + (attack.tied ? '. Suara seri; sistem memakai pilihan yang masuk lebih dahulu sebagai pemecah seri.' : '. Gunakan ramuan penyembuh untuk menyelamatkannya.'));
    } else {
      addText(parent, 'div', 'notice', attack.tied ? 'Suara Werewolf seri. Tidak ada target untuk diselamatkan.' : 'Tidak ada target serangan Werewolf yang dapat diselamatkan.');
    }
    if (potions.heal) {
      parent.append(button('Gunakan ramuan penyembuh', 'secondary wide',
        () => sendAction('night_action', { mode: 'heal' }), !attack.ready || !attack.targetName));
    }
    if (potions.poison) {
      addText(parent, 'p', 'hint', 'Pilih satu target untuk mengirim ramuan racun:');
      const grid = node('div', 'action-grid');
      for (const target of targets) grid.append(button('Racun · ' + target.name, 'action-button', () => sendAction('night_action', { targetId: target.id, mode: 'poison' })));
      parent.append(grid);
    }
    parent.append(button('Lewati penggunaan ramuan', 'secondary wide', () => sendAction('night_pass')));
  } else if (self.role === 'cupid' && roomState.room.round === 1) {
    addText(parent, 'h3', '', 'Hubungkan dua pemain');
    addText(parent, 'p', 'hint', 'Tekan dua nama yang berbeda. Cupid tidak dapat memilih dirinya sendiri; role kedua pemain tetap rahasia.');
    let firstId = '';
    let secondId = '';
    const summary = node('div', 'cupid-selection-summary', 'Pilih pemain pertama dan kedua.');
    const grid = node('div', 'action-grid');
    const confirmLink = button('Hubungkan pasangan', 'primary wide', () => {
      if (firstId && secondId && firstId !== secondId) {
        sendAction('night_action', { targetId: firstId, partnerId: secondId });
      }
    }, true);
    const refreshChoices = () => {
      const first = targets.find(item => item.id === firstId);
      const second = targets.find(item => item.id === secondId);
      summary.textContent = 'Pemain 1: ' + (first?.name || 'belum dipilih') + ' · Pemain 2: ' + (second?.name || 'belum dipilih');
      confirmLink.disabled = !(firstId && secondId && firstId !== secondId);
      grid.replaceChildren();
      for (const target of targets) {
        const index = target.id === firstId ? '1' : target.id === secondId ? '2' : '';
        const label = index ? index + ' · ' + target.name : target.name;
        grid.append(button(label, index ? 'action-button selected' : 'action-button', () => {
          if (target.id === firstId) firstId = '';
          else if (target.id === secondId) secondId = '';
          else if (!firstId) firstId = target.id;
          else if (!secondId) secondId = target.id;
          else {
            firstId = secondId;
            secondId = target.id;
          }
          refreshChoices();
        }));
      }
    };
    parent.append(summary, grid, confirmLink);
    refreshChoices();
  }
}

function renderPlayerDiscussion(parent) {
  addText(parent, 'div', 'notice success', 'Diskusi tatap muka sedang berlangsung. Ikuti arahan moderator dan berdiskusilah bersama pemain lain.');
  if (roomState.self.role === 'hunter' && !roomState.self.alive) renderHunterShot(parent);
}

function renderPrivateInspectionResult(parent) {
  const self = roomState.self;
  const result = self?.seerResult;
  if (!result || !['seer', 'detective'].includes(self.role)) return;
  const faction = result.result === 'wolf' || result.result === 'wolf_team'
    ? (self.role === 'detective' ? 'kubu Werewolf' : 'Werewolf')
    : result.result === 'neutral' ? 'kubu Netral'
      : self.role === 'detective' ? 'kubu Desa' : 'bukan Werewolf';
  addText(parent, 'div', 'notice success', 'Hasil penerawangan malam ' + result.round + ': ' + result.playerName + ' termasuk ' + faction + '. Hasil ini hanya terlihat olehmu.');
}

function renderPlayerMorning(parent) {
  addText(parent, 'div', roomState.self.status === 'eliminated' ? 'notice warning' : 'notice success',
    roomState.self.status === 'eliminated' ? 'Kamu tereliminasi.' : 'Kamu bertahan.');
  renderPrivateInspectionResult(parent);
  if (roomState.self.role === 'hunter' && !roomState.self.alive) renderHunterShot(parent);
}

function renderHunterShot(parent) {
  if (!abilityOn('hunterShot')) {
    addText(parent, 'div', 'notice', 'Kemampuan tembakan Hunter dinonaktifkan oleh moderator.');
    return;
  }
  if (roomState.self.hunterUsed) {
    addText(parent, 'div', 'notice', 'Kemampuan tembakan Hunter sudah digunakan.');
    return;
  }
  addText(parent, 'h3', '', 'Kemampuan terakhir Hunter');
  addText(parent, 'p', 'hint', 'Pilih satu pemain hidup untuk ditembak.');
  const grid = node('div', 'action-grid');
  for (const target of roomState.targets || []) {
    grid.append(button('Tembak ' + target.name, 'action-button', () => {
      if (confirm('Tembak ' + target.name + '?')) sendAction('hunter_shot', { targetId: target.id });
    }));
  }
  parent.append(grid);
}

function winnerLabel(winner) {
  return ({
    wolves: 'Kubu Werewolf menang',
    villagers: 'Kubu Desa menang',
    jester: 'Jester menang sendiri',
    lovers: 'Pasangan Lovers menang'
  })[winner] || 'Permainan selesai';
}


function systemNarrationText(room) {
  const resultMessage = String(room.lastResult?.message || '').trim();
  const round = Number(room.round) || 1;
  switch (room.phase) {
    case 'role_draw':
      return 'Kartu peran telah dibagikan. Silakan buka kartu masing-masing dan rahasiakan peran kalian.';
    case 'night':
      return 'Malam ke-' + round + ' telah tiba. Warga desa, silakan pejamkan mata. Werewolf dan pemilik peran khusus, silakan melakukan aksi malam. Sistem akan mengumumkan pagi setelah semua aksi selesai.';
    case 'morning':
      return 'Pagi telah tiba. ' + (resultMessage || 'Malam telah berlalu.') + ' Silakan dengarkan pengumuman sebelum diskusi dimulai.';
    case 'discussion':
      return 'Warga desa, sekarang waktunya berdiskusi secara langsung. Sampaikan petunjuk dan kecurigaan kalian. Tidak ada batas waktu; voting dimulai ketika moderator siap.';
    case 'voting':
      return 'Waktu voting telah tiba. Pilih satu pemain yang paling kalian curigai. Pilihan setiap pemain bersifat rahasia.';
    case 'result':
      return 'Hasil voting: ' + (resultMessage || 'Hasil telah dihitung.') + ' Moderator dapat melanjutkan ke malam berikutnya.';
    case 'finished':
      return 'Permainan selesai. ' + winnerLabel(room.winner) + '. Terima kasih telah bermain.';
    default:
      return '';
  }
}

function speakSystemNarration(message) {
  if (!message || !('speechSynthesis' in window) || !('SpeechSynthesisUtterance' in window)) return;
  try {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(message);
    utterance.lang = 'id-ID';
    utterance.rate = 0.94;
    utterance.pitch = 0.96;
    utterance.volume = 0.92;
    const voice = window.speechSynthesis.getVoices().find(item => /^id([_-]|$)/i.test(item.lang));
    if (voice) utterance.voice = voice;
    window.speechSynthesis.speak(utterance);
  } catch {}
}

function renderSystemNarrator(parent) {
  const narration = systemNarrationText(roomState.room);
  if (!narration) return;
  const panel = node('section', 'system-narrator-panel');
  addText(panel, 'div', 'eyebrow-small', 'MODERATOR SISTEM');
  addText(panel, 'h3', '', 'Narasi otomatis');
  addText(panel, 'p', '', narration);
  panel.append(button('Putar ulang narasi', 'secondary wide', () => speakSystemNarration(narration)));
  parent.append(panel);
}

function renderPlayerVoting(parent) {
  const self = roomState.self;
  if (!self.alive) {
    addText(parent, 'div', 'notice warning', 'Kamu sudah tereliminasi dan tidak dapat memberikan suara.');
    return;
  }
  if (self.hasVoted) {
    addText(parent, 'div', 'notice success', systemModeratorEnabled()
      ? 'Suaramu sudah masuk. Sistem akan menghitung hasil setelah semua suara terkumpul.'
      : 'Suaramu sudah masuk. Tunggu moderator.');
    return;
  }
  addText(parent, 'h3', '', 'Pilih satu pemain');
  addText(parent, 'div', 'notice', 'Voting bersifat rahasia. Kamu hanya melihat nama pemain; role dan pilihan suara pemain lain tidak ditampilkan.');
  const grid = node('div', 'action-grid');
  for (const target of (roomState.targets || []).filter(item => item.id !== self.id)) {
    grid.append(button('Pilih · ' + target.name, 'action-button', () => {
      if (confirm('Berikan suara kepada ' + target.name + '?')) sendAction('cast_vote', { targetId: target.id });
    }));
  }
  parent.append(grid);
}

function renderPlayerVoteResult(parent) {
  addText(parent, 'div', roomState.self.alive ? 'notice success' : 'notice warning',
    roomState.self.alive ? 'Kamu bertahan.' : 'Kamu tereliminasi.');
  if (roomState.self.role === 'hunter' && !roomState.self.alive) renderHunterShot(parent);
}


async function leaveCurrentRoom() {
  if (!session) return;
  const activeSession = session;
  if (roomState?.self?.isModerator) {
    showMessage('Moderator tidak dapat keluar sebagai pemain. Tutup tab jika ingin berhenti memantau room.', true);
    return;
  }
  try {
    await request('/rooms/' + activeSession.code + '/action', {
      method: 'POST', body: { type: 'leave_room' }, session: activeSession
    });
    if (session !== activeSession) return;
    stopRealtime();
    localStorage.removeItem(SESSION_PREFIX + activeSession.code);
    if (localStorage.getItem('werewolf.lastRoom') === activeSession.code) localStorage.removeItem('werewolf.lastRoom');
    session = null;
    roomState = null;
    lastNarrationKey = '';
    $('roomPanel').classList.add('hidden');
    $('entryPanel').classList.remove('hidden');
    const url = new URL(location.href);
    url.searchParams.delete('room');
    history.replaceState({}, '', url);
    showMessage('Kamu sudah keluar dari room. Jika permainan sedang berlangsung, karaktermu dihitung tereliminasi.');
  } catch (error) {
    if (session === activeSession && (error.status === 401 || error.status === 404)) clearInvalidSession(activeSession);
    else if (session === activeSession) showMessage(error.message, true);
  }
}

$('createForm').addEventListener('submit', async event => {
  event.preventDefault();
  const buttonElement = $('createButton');
  buttonElement.disabled = true;
  showMessage('Membuat room...');
  try {
    unlockGameAudio();
    const result = await request('/rooms', {
      method: 'POST',
      auth: false,
      body: {
        name: $('createName').value.trim()
      }
    });
    rememberPlayerName($('createName').value);
    await enterRoom({
      code: result.code,
      token: result.token,
      playerId: result.moderatorId,
      name: $('createName').value.trim(),
      isModerator: true
    });
    showMessage('Room berhasil dibuat. Bagikan kode room kepada pemain.');
  } catch (error) {
    showMessage(error.message, true);
  } finally {
    buttonElement.disabled = false;
  }
});

$('joinForm').addEventListener('submit', async event => {
  event.preventDefault();
  const buttonElement = $('joinButton');
  buttonElement.disabled = true;
  showMessage('Menggabungkan ke room...');
  try {
    unlockGameAudio();
    const code = $('joinCode').value.trim().toUpperCase();
    const result = await request('/rooms/' + code + '/join', {
      method: 'POST',
      auth: false,
      body: { name: $('joinName').value.trim() }
    });
    rememberPlayerName($('joinName').value);
    await enterRoom({ code: result.code, token: result.token, playerId: result.playerId, name: $('joinName').value.trim() });
  } catch (error) {
    showMessage(error.message, true);
  } finally {
    buttonElement.disabled = false;
  }
});

$('joinCode').addEventListener('input', event => {
  event.target.value = event.target.value.toUpperCase().replace(/[^A-HJ-NP-Z2-9]/g, '').slice(0, 6);
});

$('copyInvite').addEventListener('click', async () => {
  if (!session) return;
  const invite = new URL(location.href);
  invite.searchParams.set('room', session.code);
  try {
    await navigator.clipboard.writeText(invite.href);
    showMessage('Tautan undangan berhasil disalin.');
  } catch {
    window.prompt('Salin tautan undangan ini:', invite.href);
  }
});

$('resetRoom').addEventListener('click', () => {
  if (!roomState?.self?.isModerator || roomState.room.phase === 'lobby') return;
  if (confirm('Reset permainan dan kembalikan semua pemain ke ruang tunggu? Kode room, nama, dan koneksi pemain tetap dipertahankan.')) sendAction('reset_to_lobby');
});

$('leaveRoom').addEventListener('click', () => {
  if (roomState?.self?.isModerator) {
    showMessage('Moderator tidak dapat keluar sebagai pemain. Tutup tab jika ingin berhenti memantau room.', true);
    return;
  }
  if (confirm('Keluar dari room? Di lobby namamu akan dihapus. Jika permainan sudah dimulai, karaktermu akan tereliminasi.')) leaveCurrentRoom();
});

function prefillPlayerName() {
  const savedName = localStorage.getItem(PLAYER_NAME_KEY) || '';
  if (savedName) {
    if (!$('joinName').value) $('joinName').value = savedName;
    if (!$('createName').value) $('createName').value = savedName;
  }
}

function rememberPlayerName(name) {
  const cleanName = String(name || '').trim();
  if (cleanName) localStorage.setItem(PLAYER_NAME_KEY, cleanName);
}

async function restoreSession() {
  const params = new URLSearchParams(location.search);
  const code = (params.get('room') || localStorage.getItem('werewolf.lastRoom') || '').toUpperCase();
  if (!/^[A-HJ-NP-Z2-9]{6}$/.test(code)) return;
  $('joinCode').value = code;
  const saved = localStorage.getItem(SESSION_PREFIX + code);
  if (!saved) return;
  try {
    const stored = JSON.parse(saved);
    if (!stored.token || stored.code !== code) return;
    if (stored.name) rememberPlayerName(stored.name);
    await enterRoom(stored);
  } catch (error) {
    localStorage.removeItem(SESSION_PREFIX + code);
    showMessage('Sesi sebelumnya tidak dapat dipulihkan. Masuk kembali menggunakan kode room.', true);
  }
}

async function checkApi() {
  try {
    const response = await fetch(API_BASE + '/health', { cache: 'no-store' });
    const data = await response.json();
    $('apiStatus').textContent = data.ok ? 'Layanan room siap' : 'Layanan tidak tersedia';
    $('apiStatus').classList.toggle('muted', !data.ok);
  } catch {
    $('apiStatus').textContent = 'Menunggu deployment backend';
    $('apiStatus').classList.add('muted');
  }
}

document.addEventListener('pointerdown', unlockGameAudio, { once: true });
prefillPlayerName();
checkApi();
restoreSession();
