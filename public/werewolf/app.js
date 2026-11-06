import { qrMatrix, qrSvg } from './qr.js';
const $ = id => document.getElementById(id);
const isProductionHost = ['irvan1609.github.io', 'www.irvan1609.github.io'].includes(location.hostname);
const API_BASE = isProductionHost
  ? 'https://werewolf-room-api.andyirvan1609.workers.dev'
  : 'https://werewolf-room-api-dev.andyirvan1609.workers.dev';
const SESSION_PREFIX = 'werewolf.session.';
const PLAYER_NAME_KEY = 'werewolf.lastPlayerName';
const ROLE_INFO = {
  wolf: ['Werewolf', 'Menentukan korban bersama kawanan.', 'Setiap malam pilih 1 pemain hidup di luar kubu Werewolf.'],
  alpha_wolf: ['Alpha Wolf', 'Suara serangan bernilai 2.', 'Setiap malam pilih 1 target bersama kawanan; tidak bisa memilih Werewolf.'],
  wolf_seer: ['Wolf Seer', 'Membaca role pemain sambil tetap ikut serangan kawanan.', 'Setiap malam pilih target serangan Werewolf dan intai satu pemain. Hasil role hanya terlihat olehmu. Kamu tetap ikut memilih target serangan.'],
  villager: ['Warga Desa', 'Mengandalkan deduksi dan voting untuk menang bersama Desa.', 'Malam: jawab soal penjumlahan. Siang: diskusi dan pilih 1 pemain.'],
  seer: ['Seer', 'Mengungkap role asli pemain yang diperiksa.', 'Setiap malam periksa 1 pemain lain; role target tampil privat dan target diberi tanda warna.'],
  doctor: ['Doctor', 'Mencegah target tewas oleh serangan Werewolf.', 'Setiap malam lindungi 1 pemain hidup; boleh diri sendiri. Tidak menahan racun Witch.'],
  bodyguard: ['Bodyguard', 'Mengalihkan serangan dari target kepadamu.', 'Setiap malam jaga 1 pemain lain; jika diserang Werewolf, kamu gugur menggantikannya.'],
  witch: ['Witch', 'Memiliki 1 ramuan penyembuh dan 1 racun.', 'Heal: selamatkan target serangan. Poison: racuni 1 pemain lain. Tiap ramuan sekali; 1 aksi per malam. Jika tidak memakai ramuan atau keduanya habis, jawab perhitungan malam.'],
  hunter: ['Hunter', 'Mendapat 1 tembakan setelah gugur.', 'Jika gugur pada malam hari, pilih 1 pemain hidup saat subuh. Sekali per game. Jika gugur saat voting, tembakan tersedia pada hasil voting.'],
  reviver: ['Reviver', 'Menghidupkan kembali satu korban malam.', 'Saat subuh, pilih 1 pemain yang gugur pada malam itu. Hanya sekali per game; tidak dapat membangkitkan korban voting.'],
  cupid: ['Cupid', 'Mengikat dua pemain sebagai Lovers.', 'Malam 1 pilih 2 pemain berbeda selain dirimu. Malam berikutnya jawab perhitungan. Jika satu pasangan gugur, pasangannya ikut gugur.'],
  guardian_angel: ['Guardian Angel', 'Melindungi target dan berpeluang menang bonus.', 'Setiap malam pilih 1 pemain lain. Bonus jika kamu hidup dan target terakhir tetap hidup saat game berakhir.'],
  detective: ['Detective', 'Mengungkap kubu: Desa, Werewolf, atau Netral.', 'Setiap malam periksa 1 pemain lain; hasil muncul setelah aksi diproses.'],
  mayor: ['Mayor', 'Suara voting bernilai 2.', 'Malam: jawab perhitungan seperti Warga Desa. Voting: suaramu bernilai 2.'],
  jester: ['Penduduk Aneh (Jester)', 'Berada di kubu Desa, tetapi menang sendiri jika dipilih melalui voting.', 'Malam: jawab perhitungan seperti Warga Desa. Jika memperoleh mayoritas mutlak dan tereliminasi melalui voting, Penduduk Aneh langsung menang sendiri. Tidak menang jika gugur karena serangan malam atau tembakan.'],
  trapper: ['Trapper', 'Memasang perangkap untuk menangkap penyerang Werewolf.', 'Setiap malam pilih satu pemain lain. Jika Werewolf menyerang target itu, target selamat dan satu Werewolf yang ikut menyerang tereliminasi. Perangkap diperbarui setiap malam.'],
  priest: ['Priest', 'Memiliki satu berkah perlindungan untuk satu pemain.', 'Sekali per game, lindungi satu pemain dari serangan Werewolf. Boleh melindungi diri sendiri. Jika berkah sudah dipakai, jawab perhitungan pada malam berikutnya.'],
  vigilante: ['Vigilante', 'Memiliki satu tembakan untuk mengeliminasi pemain lain.', 'Sekali per game, tembak satu pemain hidup pada malam hari. Tidak dapat menargetkan diri sendiri. Jika tembakan sudah dipakai, jawab perhitungan pada malam berikutnya.'],
  mason: ['Mason', 'Mengenali anggota Mason lain yang masih hidup.', 'Mason dapat melihat nama sesama Mason. Tidak memiliki aksi khusus malam; jawab perhitungan seperti Warga Desa.'],
  moderator: ['Moderator', 'Mengendalikan fase dan hasil permainan.', 'Mode Host/Acak: moderator tidak menerima kartu. Mode Sistem: host tetap bermain.']
};
const EXTRA_ROLE_OPTIONS = [
  ['alphaWolf', 'Alpha Wolf', 'Role Werewolf khusus; kemampuan suara serangan ganda dapat diatur moderator.'],
  ['wolfSeer', 'Wolf Seer', 'Menyelidiki role pemain sambil tetap ikut memilih serangan kawanan.'],
  ['trapper', 'Trapper', 'Menangkap satu Werewolf jika target perangkap diserang kawanan.'],
  ['bodyguard', 'Bodyguard', 'Mengorbankan diri untuk menyelamatkan target dari serangan.'],
  ['witch', 'Witch', 'Satu ramuan penyembuh dan satu racun, masing-masing sekali.'],
  ['hunter', 'Hunter', 'Dapat menembak satu pemain setelah tereliminasi.'],
  ['reviver', 'Reviver', 'Membangkitkan satu korban malam saat subuh; sekali per game.'],
  ['cupid', 'Cupid', 'Menghubungkan dua pemain pada malam pertama.'],
  ['guardianAngel', 'Guardian Angel', 'Melindungi satu pemain setiap malam; mendapat kemenangan tambahan jika target selamat.'],
  ['detective', 'Detective', 'Memeriksa kubu pemain setiap malam.'],
  ['mayor', 'Mayor', 'Memiliki dua bobot suara dalam voting.'],
  ['jester', 'Penduduk Aneh', 'Berada di kubu Desa dan menang sendiri jika tereliminasi melalui voting.'],
  ['priest', 'Priest', 'Sekali per game melindungi satu pemain dari serangan Werewolf.'],
  ['vigilante', 'Vigilante', 'Sekali per game menembak satu pemain pada malam hari.'],
  ['mason', 'Mason', 'Mengenali sesama Mason; malam tanpa aksi khusus diisi perhitungan.']
];
const ROLE_CONFIG_GROUPS = [
  { key: 'wolves', label: 'KUBU WEREWOLF', roles: [
    ['wolf', 'Werewolf'], ['alpha_wolf', 'Alpha Wolf'], ['wolf_seer', 'Wolf Seer']
  ]},
  { key: 'village', label: 'KUBU DESA', roles: [
    ['seer', 'Seer'], ['doctor', 'Doctor'], ['bodyguard', 'Bodyguard'], ['trapper', 'Trapper'],
    ['witch', 'Witch'], ['hunter', 'Hunter'], ['reviver', 'Reviver'], ['cupid', 'Cupid'],
    ['detective', 'Detective'], ['mayor', 'Mayor'], ['priest', 'Priest'],
    ['vigilante', 'Vigilante'], ['mason', 'Mason'], ['jester', 'Penduduk Aneh'], ['villager', 'Warga Desa']
  ]},
  { key: 'neutral', label: 'KUBU NETRAL', roles: [
    ['guardian_angel', 'Guardian Angel']
  ]}
];
const ROLE_COUNT_DEFAULTS = {
  wolf: 1, alpha_wolf: 0, wolf_seer: 0, seer: 1, doctor: 1, bodyguard: 0, trapper: 0, witch: 0,
  hunter: 0, reviver: 0, cupid: 0, guardian_angel: 0, detective: 0, mayor: 0,
  priest: 0, vigilante: 0, mason: 0, jester: 0, villager: 2,
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
let wolfChatDraft = '';
let cupidDraft = null;
let pendingConfirmationResolver = null;
let qrScannerStream = null;
let qrScannerFrame = 0;
let qrScannerActive = false;
let qrScannerLastScan = 0;
let qrScannerDecoderPromise = null;
let voiceLocalStream = null;
const voicePeerConnections = new Map();
const voiceRemoteAudio = new Map();
const voicePendingCandidates = new Map();
let voiceStartPromise = null;
let voiceGeneration = 0;
let voiceAutoAttemptKey = '';
let voiceStatus = 'Voice chat otomatis aktif di semua fase pada mode online.';
let voiceMuted = false;
let voiceNeedsAudioGesture = false;
let voiceOutbox = [];

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

function playGameStartBell() {
  withGameAudio(context => {
    playAudioCurve(context, [1046, 1318, 1568, 1318], 0.34, 0, 'sine', 0.11, 3200);
    playAudioCurve(context, [1318, 1568, 2093, 1760], 0.42, 0.38, 'triangle', 0.095, 3600);
    playAudioCurve(context, [1568, 2093, 2349, 2093, 1760], 0.62, 0.86, 'sine', 0.1, 3800);
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

function askConfirmation({ title, message, confirmLabel = 'Lanjutkan', danger = true }) {
  const dialog = $('confirmDialog');
  if (!dialog) return Promise.resolve(false);
  if (pendingConfirmationResolver) closeConfirmation(false);
  $('confirmDialogTitle').textContent = title;
  $('confirmDialogMessage').textContent = message;
  const accept = $('confirmDialogAccept');
  accept.textContent = confirmLabel;
  accept.classList.toggle('danger', Boolean(danger));
  return new Promise(resolve => {
    pendingConfirmationResolver = resolve;
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
    accept.focus({ preventScroll: true });
  });
}

function closeConfirmation(accepted = false) {
  const dialog = $('confirmDialog');
  if (dialog?.open && typeof dialog.close === 'function') dialog.close();
  else dialog?.removeAttribute('open');
  const resolve = pendingConfirmationResolver;
  pendingConfirmationResolver = null;
  if (resolve) resolve(Boolean(accepted));
}

function setConnection(connected, statusText = '') {
  const target = $('connectionStatus');
  if (!target) return;
  const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
  target.textContent = connected ? 'Realtime aktif'
    : statusText || (offline ? 'Internet terputus' : 'Menyambungkan ulang');
  target.classList.toggle('muted', !connected);
  target.classList.toggle('offline', !connected);
  const retry = $('reconnectButton');
  if (retry) {
    retry.classList.toggle('hidden', Boolean(connected || !session));
    retry.disabled = offline;
    retry.textContent = offline ? 'Menunggu internet' : 'Hubungkan ulang';
  }
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
  stopDiscussionVoice();
}

function clearInvalidSession(
  activeSession,
  message = 'Sesi tidak valid atau room sudah kedaluwarsa. Silakan bergabung kembali.',
  isError = true
) {
  if (session !== activeSession) return;
  stopRealtime();
  localStorage.removeItem(SESSION_PREFIX + activeSession.code);
  if (localStorage.getItem('werewolf.lastRoom') === activeSession.code) localStorage.removeItem('werewolf.lastRoom');
  session = null;
  roomState = null;
  lastNarrationKey = '';
  roleDraft = null;
  wolfChatDraft = '';
  cupidDraft = null;
  $('roomPanel').classList.add('hidden');
  $('entryPanel').classList.remove('hidden');
  const url = new URL(location.href);
  url.searchParams.delete('room');
  history.replaceState({}, '', url);
  showMessage(message, isError);
}

async function enterRoom(nextSession) {
  stopRealtime();
  session = nextSession;
  roomState = null;
  lastNarrationKey = '';
  cupidDraft = null;
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
      // Refresh the authoritative snapshot after reconnecting to recover missed events.
      refreshState().catch(() => {});
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      heartbeatTimer = setInterval(() => {
        if (socket === nextSocket && nextSocket.readyState === WebSocket.OPEN) {
          try { nextSocket.send('ping'); } catch {}
        }
      }, 25000);
      flushVoiceSignalOutbox();
      syncDiscussionVoice();
    };
    nextSocket.onmessage = event => {
      if (session !== activeSession || generation !== realtimeGeneration || socket !== nextSocket) return;
      if (event.data === 'pong') return;
      try {
        const message = JSON.parse(event.data);
        if (message.type === 'room_disbanded') {
          clearInvalidSession(activeSession, message.message || 'Host membubarkan room. Kamu telah dikeluarkan dari room.', false);
          return;
        }
        if (message.type === 'player_kicked') {
          clearInvalidSession(activeSession, message.message || 'Kamu dikeluarkan dari room oleh host atau moderator. Sesi ini sudah tidak berlaku.', false);
          return;
        }
        if (message.type === 'voice_signal') {
          handleVoiceSignal(message).catch(() => {});
          return;
        }
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
        stopDiscussionVoice();
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

async function reconnectNow() {
  const activeSession = session;
  if (!activeSession) return;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    setConnection(false, 'Internet terputus');
    return;
  }
  if (reconnectTimer) clearTimeout(reconnectTimer);
  reconnectTimer = null;
  reconnectDelay = 1200;
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  heartbeatTimer = null;
  if (socket) {
    socket.onclose = null;
    socket.onerror = null;
    try { socket.close(); } catch {}
  }
  socket = null;
  setConnection(false, 'Menghubungkan...');
  try {
    await refreshState();
  } catch (error) {
    if (session === activeSession) showMessage('Koneksi belum pulih. Sistem akan mencoba kembali: ' + error.message, true);
  }
  if (session === activeSession) connectRealtime();
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
  if (!sameRoom || (phaseChanged && nextState.room.phase !== 'night')) wolfChatDraft = '';
  if (!sameRoom || (phaseChanged && (nextState.room.phase !== 'night' || previous.room.round !== nextState.room.round))) cupidDraft = null;
  if (roleDraft && roleDraft.code !== nextState.room.code) roleDraft = null;
  if (phaseChanged && nextState.room.phase === 'role_draw') playGameStartBell();
  if (phaseChanged && nextState.room.phase === 'night') playWolfHowl();
  if (phaseChanged && nextState.room.phase === 'morning') playRoosterCrow();
  const narrationKey = [nextState.room.code, nextState.room.phase, nextState.room.round,
    nextState.room.lastResult?.at || nextState.room.publicResult?.at || ''].join(':');
  if (narrationKey !== lastNarrationKey) {
    const narration = systemNarrationText(nextState.room);
    if (narration) speakSystemNarration(narration);
  }
  lastNarrationKey = narrationKey;
  roomState = nextState;
  renderRoom();
  syncDiscussionVoice();
}

function discussionVoiceListeningAllowed(state = roomState) {
  return Boolean(state?.room && !state.self?.isWaiting && !state.self?.isBotControlled
    && (state.room.phase === 'lobby' || state.room.phase === 'finished'
      || state.self?.isModerator || state.self?.alive));
}

function discussionVoiceAllowed(state = roomState) {
  return Boolean(discussionVoiceListeningAllowed(state)
    && (state.self?.voiceMode || 'online') === 'online');
}

function refreshVoiceUI() {
  const status = $('voiceStatus');
  if (status) status.textContent = voiceStatus;
  const count = $('voicePeerCount');
  if (count) {
    const peers = (roomState?.voicePeers || []).filter(item => item.id !== roomState?.self?.id);
    count.textContent = peers.length + ' pemain terhubung';
  }
  const mic = $('voiceMicToggle');
  if (mic) {
    mic.textContent = voiceLocalStream
      ? (voiceMuted ? 'Nyalakan Mikrofon' : 'Matikan Mikrofon')
      : voiceStartPromise ? 'Meminta Izin Mikrofon…' : 'Aktifkan Mikrofon';
    mic.disabled = Boolean(voiceStartPromise) || !discussionVoiceAllowed();
  }
  const audio = $('voiceAudioUnlock');
  if (audio) audio.classList.toggle('hidden', !voiceNeedsAudioGesture);
}

function updateRemoteVoiceVolume() {
  const volume = voiceLocalStream && !voiceMuted ? 0.26 : 0.38;
  for (const audio of voiceRemoteAudio.values()) audio.volume = volume;
}

function closeVoicePeer(peerId) {
  const connection = voicePeerConnections.get(peerId);
  if (connection) {
    connection.onicecandidate = null;
    connection.ontrack = null;
    connection.onconnectionstatechange = null;
    try { connection.close(); } catch {}
    voicePeerConnections.delete(peerId);
  }
  const audio = voiceRemoteAudio.get(peerId);
  if (audio) {
    try { audio.pause(); } catch {}
    audio.srcObject = null;
    audio.remove();
    voiceRemoteAudio.delete(peerId);
  }
  voicePendingCandidates.delete(peerId);
}

function stopDiscussionVoice() {
  voiceGeneration += 1;
  if (voiceLocalStream) {
    voiceLocalStream.getTracks().forEach(track => {
      try { track.stop(); } catch {}
    });
  }
  voiceLocalStream = null;
  for (const peerId of [...voicePeerConnections.keys()]) closeVoicePeer(peerId);
  for (const audio of voiceRemoteAudio.values()) {
    try { audio.pause(); } catch {}
    audio.srcObject = null;
    audio.remove();
  }
  voiceRemoteAudio.clear();
  voicePendingCandidates.clear();
  voiceOutbox = [];
  voiceStartPromise = null;
  voiceAutoAttemptKey = '';
  voiceMuted = false;
  voiceNeedsAudioGesture = false;
  voiceStatus = 'Voice chat otomatis aktif di semua fase pada mode online.';
}

function sendVoiceSignal(targetId, signalKind, payload) {
  const message = { type: 'voice_signal', targetId, signalKind, payload };
  if (socket?.readyState === WebSocket.OPEN) {
    try { socket.send(JSON.stringify(message)); return true; } catch {}
  }
  voiceOutbox.push(message);
  if (voiceOutbox.length > 80) voiceOutbox.splice(0, voiceOutbox.length - 80);
  return false;
}

function flushVoiceSignalOutbox() {
  if (socket?.readyState !== WebSocket.OPEN || !voiceOutbox.length) return;
  const pending = voiceOutbox.splice(0);
  for (const message of pending) {
    try { socket.send(JSON.stringify(message)); }
    catch { voiceOutbox.unshift(message); break; }
  }
}

async function flushVoiceCandidates(peerId, connection) {
  const pending = voicePendingCandidates.get(peerId) || [];
  voicePendingCandidates.delete(peerId);
  for (const candidate of pending) {
    try { await connection.addIceCandidate(candidate); } catch {}
  }
}

async function createVoicePeer(peer, shouldOffer = false) {
  const peerId = peer.id;
  if (!discussionVoiceListeningAllowed() || !peerId || peerId === roomState?.self?.id) return null;
  const existing = voicePeerConnections.get(peerId);
  if (existing) return existing;
  if (typeof RTCPeerConnection !== 'function') {
    voiceStatus = 'Browser ini belum mendukung voice chat WebRTC.';
    refreshVoiceUI();
    return null;
  }
  const connection = new RTCPeerConnection({
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun.cloudflare.com:3478' }
    ]
  });
  voicePeerConnections.set(peerId, connection);
  const localAudioTracks = voiceLocalStream?.getAudioTracks() || [];
  if (localAudioTracks.length) {
    for (const track of localAudioTracks) connection.addTrack(track, voiceLocalStream);
  } else {
    connection.addTransceiver('audio', { direction: 'recvonly' });
  }
  connection.onicecandidate = event => {
    if (event.candidate) sendVoiceSignal(peerId, 'candidate',
      typeof event.candidate.toJSON === 'function' ? event.candidate.toJSON() : event.candidate);
  };
  connection.ontrack = event => {
    let audio = voiceRemoteAudio.get(peerId);
    if (!audio) {
      audio = document.createElement('audio');
      audio.autoplay = true;
      audio.playsInline = true;
      audio.volume = voiceLocalStream && !voiceMuted ? 0.26 : 0.38;
      audio.className = 'voice-audio';
      audio.dataset.peerId = peerId;
      document.body.append(audio);
      voiceRemoteAudio.set(peerId, audio);
    }
    audio.srcObject = event.streams?.[0] || new MediaStream([event.track]);
    audio.play().then(() => {
      voiceNeedsAudioGesture = false;
      refreshVoiceUI();
    }).catch(() => {
      voiceNeedsAudioGesture = true;
      voiceStatus = 'Ketuk Aktifkan Audio agar suara pemain lain terdengar.';
      refreshVoiceUI();
    });
  };
  connection.onconnectionstatechange = () => {
    if (connection.connectionState === 'failed') {
      voiceStatus = 'Koneksi suara ke ' + (peer.name || 'pemain') + ' gagal. Coba jaringan lain.';
    } else {
      const connected = [...voicePeerConnections.values()]
        .filter(item => item.connectionState === 'connected').length;
      if (connected) {
        if (roomState?.self?.voiceMode === 'offline') {
          voiceStatus = 'Audio pemain online tersambung · mikrofon tetap mati.';
        } else if (!voiceLocalStream || voiceMuted) {
          voiceStatus = 'Audio pemain lain tersambung · mikrofon ' + (voiceMuted ? 'dimatikan.' : 'belum aktif.');
        } else {
          voiceStatus = 'Voice chat aktif · ' + connected + ' koneksi suara.';
        }
      }
    }
    refreshVoiceUI();
  };
  if (shouldOffer) {
    const offer = await connection.createOffer();
    await connection.setLocalDescription(offer);
    sendVoiceSignal(peerId, 'offer', connection.localDescription);
  }
  return connection;
}

async function reconcileVoiceConnections() {
  if (!discussionVoiceListeningAllowed()) return;
  const peers = (roomState.voicePeers || []).filter(item => item.id && item.id !== roomState.self.id);
  const allowedIds = new Set(peers.map(item => item.id));
  for (const peerId of [...voicePeerConnections.keys()]) {
    if (!allowedIds.has(peerId)) closeVoicePeer(peerId);
  }
  for (const peer of peers) {
    if (voicePeerConnections.has(peer.id)) continue;
    const peerOnline = peer.isModerator || peer.voiceMode !== 'offline';
    const shouldOffer = discussionVoiceAllowed()
      && (!peerOnline || String(roomState.self.id).localeCompare(String(peer.id)) < 0);
    try { await createVoicePeer(peer, shouldOffer); } catch {
      closeVoicePeer(peer.id);
      voiceStatus = 'Tidak berhasil menghubungkan suara dengan ' + peer.name + '.';
      refreshVoiceUI();
    }
  }
  flushVoiceSignalOutbox();
}

async function startDiscussionVoice(manual = false) {
  if (!discussionVoiceAllowed()) return false;
  if (voiceLocalStream) {
    await reconcileVoiceConnections();
    return true;
  }
  if (voiceStartPromise) return voiceStartPromise;
  const generation = voiceGeneration;
  voiceStatus = 'Meminta izin mikrofon…';
  refreshVoiceUI();
  let pending;
  pending = (async () => {
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('Akses mikrofon tidak tersedia. Gunakan browser HTTPS yang mendukung mikrofon.');
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: { ideal: 'all' },
          noiseSuppression: { ideal: true },
          autoGainControl: { ideal: false },
          channelCount: { ideal: 1 },
          sampleRate: { ideal: 48000 }
        },
        video: false
      });
      if (generation !== voiceGeneration || !discussionVoiceAllowed()) {
        stream.getTracks().forEach(track => track.stop());
        return false;
      }
      voiceLocalStream = stream;
      voiceMuted = false;
      for (const track of stream.getAudioTracks()) track.enabled = true;
      updateRemoteVoiceVolume();
      voiceStatus = 'Mikrofon aktif · menghubungkan pemain diskusi…';
      refreshVoiceUI();
      for (const peerId of [...voicePeerConnections.keys()]) closeVoicePeer(peerId);
      await reconcileVoiceConnections();
      return true;
    } catch (error) {
      voiceStatus = error?.name === 'NotAllowedError' || error?.name === 'PermissionDeniedError'
        ? 'Izin mikrofon belum diberikan. Izinkan mikrofon, lalu coba lagi.'
        : error?.message || 'Mikrofon tidak dapat diaktifkan.';
      refreshVoiceUI();
      return false;
    } finally {
      if (voiceStartPromise === pending) voiceStartPromise = null;
      refreshVoiceUI();
    }
  })();
  voiceStartPromise = pending;
  return pending;
}

function syncDiscussionVoice() {
  if (!discussionVoiceListeningAllowed()) {
    if (voiceLocalStream || voicePeerConnections.size || voiceStartPromise) stopDiscussionVoice();
    return;
  }
  const key = roomState.room.code + ':' + roomState.room.round;
  if (discussionVoiceAllowed()) {
    if (voiceLocalStream) {
      voiceAutoAttemptKey = key;
      reconcileVoiceConnections().catch(() => {});
      return;
    }
    if (voiceStartPromise || voiceAutoAttemptKey === key) return;
    voiceAutoAttemptKey = key;
    startDiscussionVoice(false).then(active => {
      if (!active && discussionVoiceListeningAllowed()) {
        voiceStatus = 'Mikrofon belum diizinkan · ketuk Mic untuk mencoba lagi; kamu tetap dapat mendengar pemain online.';
        reconcileVoiceConnections().catch(() => {});
        refreshVoiceUI();
      }
    }).catch(() => {});
    return;
  }

  if (voiceLocalStream) {
    for (const track of voiceLocalStream.getTracks()) {
      try { track.stop(); } catch {}
    }
    voiceLocalStream = null;
    for (const peerId of [...voicePeerConnections.keys()]) closeVoicePeer(peerId);
  }
  voiceAutoAttemptKey = key;
  voiceMuted = true;
  voiceStatus = 'Mode offline · mikrofon mati, suara pemain online tetap terdengar.';
  reconcileVoiceConnections().catch(() => {});
  refreshVoiceUI();
}

function toggleVoiceMic() {
  if (!voiceLocalStream) {
    startDiscussionVoice(true).catch(() => {});
    return;
  }
  voiceMuted = !voiceMuted;
  for (const track of voiceLocalStream.getAudioTracks()) track.enabled = !voiceMuted;
  updateRemoteVoiceVolume();
  voiceStatus = voiceMuted ? 'Mikrofon dimatikan.' : 'Mikrofon aktif.';
  refreshVoiceUI();
}

async function unlockRemoteAudio() {
  let failed = false;
  for (const audio of voiceRemoteAudio.values()) {
    try { await audio.play(); } catch { failed = true; }
  }
  voiceNeedsAudioGesture = failed;
  if (!failed) voiceStatus = 'Audio pemain lain aktif.';
  refreshVoiceUI();
}

async function handleVoiceSignal(message) {
  if (!discussionVoiceListeningAllowed() || !message?.fromId) return;
  const peer = (roomState.voicePeers || []).find(item => item.id === message.fromId)
    || { id: message.fromId, name: message.fromName || 'Pemain' };
  let connection = voicePeerConnections.get(peer.id);
  if (!connection) connection = await createVoicePeer(peer, false);
  if (!connection) return;

  if (message.signalKind === 'offer') {
    await connection.setRemoteDescription(message.payload);
    await flushVoiceCandidates(peer.id, connection);
    const answer = await connection.createAnswer();
    await connection.setLocalDescription(answer);
    sendVoiceSignal(peer.id, 'answer', connection.localDescription);
  } else if (message.signalKind === 'answer') {
    await connection.setRemoteDescription(message.payload);
    await flushVoiceCandidates(peer.id, connection);
  } else if (message.signalKind === 'candidate') {
    if (connection.remoteDescription) {
      try { await connection.addIceCandidate(message.payload); } catch {}
    } else {
      const pending = voicePendingCandidates.get(peer.id) || [];
      pending.push(message.payload);
      voicePendingCandidates.set(peer.id, pending.slice(-40));
    }
  }
}

function roleLabel(role) {
  return ROLE_INFO[role]?.[0] || 'Belum diketahui';
}

function isHost() {
  // Host permissions remain separate from the temporary moderator assignment.
  return Boolean(roomState?.self?.isHost || session?.isHost || session?.isModerator);
}

function isRoomModerator() {
  if (typeof roomState?.self?.isModerator === 'boolean') return roomState.self.isModerator;
  return Boolean(roomState?.room?.phase === 'lobby' && isHost());
}

function rolePlayerCount(mode = roleSettingsForUI(roomState?.room?.settings || {}).moderatorMode) {
  const registered = roomState?.players?.length || 0;
  return Math.max(0, registered - (mode === 'system' ? 0 : 1));
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
  const scalableRoles = ['bodyguard', 'witch', 'hunter', 'detective', 'mayor', 'guardian_angel', 'seer', 'doctor'];
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

function roleSettingsForUI(settings = {}) {
  const draft = roleDraft?.code === roomState?.room?.code ? roleDraft : null;
  const storedMode = settings.moderatorMode
    || (Number(settings.roleCounts?.moderator ?? 0) === 1 ? 'system' : 'host');
  if (draft) return {
    roleCounts: { ...ROLE_COUNT_DEFAULTS, ...draft.roleCounts },
    moderatorMode: draft.moderatorMode,
    revealRoleOnDeath: draft.revealRoleOnDeath !== false,
    timers: { roleDrawSeconds: 20, nightSeconds: 60, dawnSeconds: 20, discussionSeconds: 30, votingSeconds: 15, resultSeconds: 8, ...(draft.timers || {}) }
  };
  return {
    roleCounts: settings.roleCounts
      ? { ...ROLE_COUNT_DEFAULTS, ...settings.roleCounts }
      : recommendedRoleCounts(Math.max(0, (roomState?.players?.length || 0) - (storedMode === 'system' ? 0 : 1))),
    moderatorMode: storedMode,
    revealRoleOnDeath: settings.revealRoleOnDeath !== false,
    timers: {
      roleDrawSeconds: Number(settings.timers?.roleDrawSeconds ?? 20),
      nightSeconds: Number(settings.timers?.nightSeconds ?? 60),
      dawnSeconds: Number(settings.timers?.dawnSeconds ?? 20),
      discussionSeconds: Number(settings.timers?.discussionSeconds ?? 30),
      votingSeconds: Number(settings.timers?.votingSeconds ?? 15),
      resultSeconds: Number(settings.timers?.resultSeconds ?? 8)
    }
  };
}

function roleConfigTotals(roleCounts = {}) {
  const sum = keys => keys.reduce((total, key) => total + Number(roleCounts[key] || 0), 0);
  return {
    total: sum(ROLE_CONFIG_GROUPS.flatMap(group => group.roles.map(([key]) => key))),
    wolves: sum(['wolf', 'alpha_wolf', 'wolf_seer']),
    village: sum(ROLE_CONFIG_GROUPS.find(group => group.key === 'village').roles.map(([key]) => key)),
    neutral: sum(['guardian_angel'])
  };
}

function updateRoleConfigSummary(container) {
  const summary = container.querySelector('[data-role-summary]');
  if (!summary) return;
  const roleCounts = {};
  for (const input of container.querySelectorAll('[data-role-count]')) roleCounts[input.dataset.roleCount] = Math.max(0, Number(input.value) || 0);
  const totals = roleConfigTotals(roleCounts);
  const moderatorMode = container.querySelector('[data-moderator-mode]')?.value || roleDraft?.moderatorMode || 'host';
  const activePlayers = rolePlayerCount(moderatorMode);
  const exact = totals.total === activePlayers;
  const ready = activePlayers >= 2 && exact && totals.wolves >= 1 && totals.village >= 1;
  summary.replaceChildren();
  addText(summary, 'div', 'eyebrow-small', 'KOMPOSISI KUBU');
  const grid = node('div', 'role-team-summary');
  for (const [label, value] of [
    ['Werewolf', totals.wolves], ['Desa', totals.village],
    ['Netral', totals.neutral], ['Total role', totals.total + ' / ' + activePlayers]
  ]) {
    const item = node('div', 'role-team-summary-item');
    addText(item, 'b', '', String(value));
    addText(item, 'span', '', label);
    grid.append(item);
  }
  summary.append(grid);
  addText(summary, 'p', ready ? 'hint' : 'notice warning',
    activePlayers < 2 ? 'Minimal 2 pemain aktif diperlukan.'
      : !exact ? 'Komposisi kurang ' + Math.max(0, activePlayers - totals.total)
        + ' atau kelebihan ' + Math.max(0, totals.total - activePlayers) + ' role.'
        : totals.wolves < 1 || totals.village < 1
          ? 'Harus ada minimal satu Werewolf dan satu anggota Desa.'
          : 'Komposisi tepat. Permainan siap dimulai.');
  const startButton = $('startGameButton');
  if (startButton) startButton.disabled = !ready;
}

function captureRoleDraft(container, event) {
  const roleCounts = {};
  for (const input of container.querySelectorAll('[data-role-count]')) {
    roleCounts[input.dataset.roleCount] = Math.max(0, Number(input.value) || 0);
  }
  const changedKey = event?.target?.dataset?.roleCount;
  const moderatorMode = container.querySelector('[data-moderator-mode]')?.value || 'host';
  const modeChanged = Boolean(event?.target?.hasAttribute?.('data-moderator-mode'));
  if ((changedKey && changedKey !== 'villager') || modeChanged) {
    const total = roleConfigTotals(roleCounts).total;
    const delta = rolePlayerCount(moderatorMode) - total;
    roleCounts.villager = Math.max(0, (roleCounts.villager || 0) + delta);
    const villagerInput = container.querySelector('[data-role-count="villager"]');
    if (villagerInput) villagerInput.value = String(roleCounts.villager);
  }
  const timers = {};
  for (const input of container.querySelectorAll('[data-phase-duration]')) {
    timers[input.dataset.phaseDuration] = Math.max(3, Number(input.value) || 3);
  }
  roleDraft = {
    code: roomState?.room?.code, roleCounts, moderatorMode, timers,
    revealRoleOnDeath: container.querySelector('[data-reveal-role-on-death]')?.checked !== false
  };
  updateRoleConfigSummary(container);
}

function clearAllRoleCounts(container) {
  const roleCounts = {};
  for (const input of container.querySelectorAll('[data-role-count]')) {
    input.value = '0';
    roleCounts[input.dataset.roleCount] = 0;
  }
  const moderatorMode = container.querySelector('[data-moderator-mode]')?.value || 'host';
  const timers = {};
  for (const input of container.querySelectorAll('[data-phase-duration]')) {
    timers[input.dataset.phaseDuration] = Math.max(3, Number(input.value) || 3);
  }
  roleDraft = {
    code: roomState?.room?.code, roleCounts, moderatorMode, timers,
    revealRoleOnDeath: container.querySelector('[data-reveal-role-on-death]')?.checked !== false
  };
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
  addText(moderatorSection, 'p', 'hint', 'Host: host menjadi moderator dan tidak menerima kartu. Sistem: host tetap bermain; semua fase berjalan otomatis sesuai timer. Acak: satu pemain menjadi moderator dan tidak menerima kartu.');
  const moderatorInfo = node('details', 'role-config-info-disclosure moderator-info-disclosure');
  moderatorInfo.append(node('summary', '', 'Kekuatan & aturan moderator'));
  appendRoleDetails(moderatorInfo, ROLE_INFO.moderator, 'role-config-info');
  moderatorSection.append(moderatorInfo);
  const roleActions = node('div', 'role-config-actions');
  const clearRolesButton = button('Jadikan Semua Role 0', 'secondary role-zero-button', () => clearAllRoleCounts(container));
  clearRolesButton.dataset.clearAllRoles = 'true';
  roleActions.append(clearRolesButton);
  addText(roleActions, 'p', 'hint', 'Kosongkan semua jumlah role pemain untuk menyusun komposisi secara manual. Mode moderator tidak berubah.');
  moderatorSection.append(roleActions);
  container.append(moderatorSection);

  const informationSection = node('section', 'role-config-team role-information-config');
  addText(informationSection, 'div', 'role-section-label', 'INFORMASI PERMAINAN');
  const revealLabel = node('label', 'role-death-reveal-setting');
  const revealInput = node('input');
  revealInput.type = 'checkbox';
  revealInput.checked = config.revealRoleOnDeath !== false;
  revealInput.dataset.revealRoleOnDeath = 'true';
  addText(revealLabel, 'span', '', 'Perlihatkan role pemain saat mati');
  revealLabel.prepend(revealInput);
  informationSection.append(revealLabel);
  addText(informationSection, 'p', 'hint', 'Aktif secara default. Jika dimatikan, nama role tetap terlihat sebagai komposisi permainan, tetapi role pemain yang mati tidak dibuka.');
  container.append(informationSection);

  for (const group of ROLE_CONFIG_GROUPS) {
    const section = node('section', 'role-config-team role-team-' + group.key);
    addText(section, 'div', 'role-section-label', group.label);
    const grid = node('div', 'role-count-grid');
    for (const [key, label] of group.roles) {
      const item = node('div', 'role-count-item');
      const field = node('div', 'role-count-field');
      addText(field, 'span', '', label);
      const stepper = node('div', 'role-count-stepper');
      const minus = node('button', 'role-count-step', '−');
      minus.type = 'button';
      minus.dataset.roleStep = '-1';
      minus.dataset.roleKey = key;
      minus.setAttribute('aria-label', 'Kurangi ' + label);
      const input = node('input', 'role-count-input');
      input.type = 'number';
      input.min = '0';
      input.step = '1';
      input.inputMode = 'numeric';
      input.value = String(config.roleCounts[key] ?? 0);
      input.dataset.roleCount = key;
      input.setAttribute('aria-label', label);
      const plus = node('button', 'role-count-step', '+');
      plus.type = 'button';
      plus.dataset.roleStep = '1';
      plus.dataset.roleKey = key;
      plus.setAttribute('aria-label', 'Tambah ' + label);
      stepper.append(minus, input, plus);
      field.append(stepper);
      item.append(field);
      const info = ROLE_INFO[key] || ['Peran', 'Belum ada kemampuan.', 'Ikuti arahan moderator.'];
      const disclosure = node('details', 'role-config-info-disclosure');
      disclosure.append(node('summary', '', 'Kekuatan & aturan pakai'));
      appendRoleDetails(disclosure, info, 'role-config-info');
      item.append(disclosure);
      grid.append(item);
    }
    section.append(grid);
    container.append(section);
  }
  const timerSection = node('section', 'role-config-team phase-duration-config');
  addText(timerSection, 'div', 'role-section-label', 'DURASI PERMAINAN');
  const timerGrid = node('div', 'phase-duration-grid');
  for (const [key, label, min, max] of [
    ['roleDrawSeconds', 'Buka kartu (detik)', 5, 60],
    ['nightSeconds', 'Tengah malam (detik)', 10, 300],
    ['dawnSeconds', 'Subuh (detik)', 5, 120],
    ['discussionSeconds', 'Pagi · Diskusi (detik)', 5, 300],
    ['votingSeconds', 'Sore · Voting (detik)', 5, 180],
    ['resultSeconds', 'Hasil voting / Hunter (detik)', 3, 60]
  ]) {
    const field = node('label', 'phase-duration-field');
    addText(field, 'span', '', label);
    const input = node('input', 'phase-duration-input');
    input.type = 'number';
    input.min = String(min);
    input.max = String(max);
    input.step = '1';
    input.inputMode = 'numeric';
    input.value = String(config.timers[key]);
    input.dataset.phaseDuration = key;
    field.append(input);
    timerGrid.append(field);
  }
  timerSection.append(timerGrid);
  addText(timerSection, 'p', 'hint', 'Mode Sistem: server memindahkan fase otomatis. Aksi dan suara bisa diubah sampai timer habis.');
  container.append(timerSection);

  const summary = node('div', 'role-config-summary');
  summary.dataset.roleSummary = 'true';
  container.append(summary);
  container.addEventListener('input', event => captureRoleDraft(container, event));
  container.addEventListener('change', event => captureRoleDraft(container, event));
  container.addEventListener('click', event => {
    const control = event.target.closest('[data-role-step]');
    if (!control) return;
    const input = container.querySelector('[data-role-count="' + control.dataset.roleKey + '"]');
    if (!input) return;
    input.value = String(Math.max(0, (Number(input.value) || 0) + Number(control.dataset.roleStep)));
    captureRoleDraft(container, { target: input });
  });
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
  const timers = {};
  const timerLimits = {
    roleDrawSeconds: [5, 60], nightSeconds: [10, 300], dawnSeconds: [5, 120],
    discussionSeconds: [5, 300], votingSeconds: [5, 180], resultSeconds: [3, 60]
  };
  for (const input of container.querySelectorAll('[data-phase-duration]')) {
    const seconds = Number(input.value);
    const [minimum, maximum] = timerLimits[input.dataset.phaseDuration] || [5, 300];
    if (!Number.isSafeInteger(seconds) || seconds < minimum || seconds > maximum) {
      throw new Error('Durasi harus berupa bilangan bulat ' + minimum + '–' + maximum + ' detik.');
    }
    timers[input.dataset.phaseDuration] = seconds;
  }
  return {
    roleCounts, moderatorMode, timers,
    revealRoleOnDeath: container.querySelector('[data-reveal-role-on-death]')?.checked !== false
  };
}

function renderModeratorDashboard(parent) {
  const room = roomState.room;
  const players = roomState.players || [];
  const total = Number(room.roleCardsRequired) || players.length;
  const alive = Number(room.playersAliveCount ?? players.filter(player => player.alive).length);
  const online = Number(room.playersOnlineCount ?? players.filter(player => player.connected).length);
  let task = '';
  let done = 0;
  let required = 0;
  if (room.phase === 'role_draw') {
    task = 'Kartu dibuka';
    done = Number(room.roleCardsDrawn) || players.filter(player => player.hasDrawn).length;
    required = Number(room.roleCardsRequired) || total;
  } else if (room.phase === 'night') {
    task = 'Aksi tengah malam';
    done = Number(room.nightActionsSubmitted) || 0;
    required = Number(room.nightActionsRequired) || alive;
  } else if (room.phase === 'dawn') {
    task = 'Aksi subuh';
    done = Number(room.dawnActionsSubmitted) || 0;
    required = Number(room.dawnActionsRequired) || 0;
  } else if (room.phase === 'voting') {
    task = 'Voting';
    done = Number(room.votesSubmitted) || 0;
    required = Number(room.votesRequired) || alive;
  }
  const panel = node('section', 'moderator-dashboard');
  const stats = node('div', 'moderator-dashboard-stats');
  for (const [label, value, tone] of [
    ['Pemain', total, ''], ['Online', online, 'online'], ['Hidup', alive, 'alive']
  ]) {
    const item = node('div', 'moderator-dashboard-stat');
    addText(item, 'span', 'moderator-dashboard-label', label);
    addText(item, 'b', 'moderator-dashboard-value ' + tone, String(value));
    stats.append(item);
  }
  panel.append(stats);
  if (task && required > 0) {
    const progress = node('div', 'moderator-dashboard-progress');
    const heading = node('div', 'moderator-dashboard-progress-heading');
    addText(heading, 'b', '', task);
    addText(heading, 'span', '', done + ' / ' + required + ' selesai');
    const track = node('div', 'moderator-progress-track');
    track.setAttribute('role', 'progressbar');
    track.setAttribute('aria-valuemin', '0');
    track.setAttribute('aria-valuemax', String(required));
    track.setAttribute('aria-valuenow', String(Math.min(done, required)));
    const fill = node('span', 'moderator-progress-fill');
    fill.style.width = Math.min(100, Math.round(done / required * 100)) + '%';
    track.append(fill);
    addText(progress, 'div', 'moderator-dashboard-waiting', Math.max(0, required - done) + ' pemain menunggu');
    progress.prepend(heading, track);
    panel.append(progress);
  }
  parent.prepend(panel);
}

function renderPlayers() {
  const list = $('playersList');
  list.replaceChildren();
  const players = roomState.players || [];
  const moderator = isRoomModerator();
  const host = isHost();
  const canMonitor = moderator || host;
  const phase = roomState.room.phase;
  const waitingPlayers = roomState.waitingPlayers || [];
  $('playerCount').textContent = players.length + ' pemain'
    + (waitingPlayers.length ? ' · ' + waitingPlayers.length + ' menunggu ronde berikutnya' : '');
  for (const player of players) {
    const chip = node('div', 'player-chip' + (player.alive ? '' : ' dead') + (player.isBot ? ' bot' : ''));
    const identity = node('div', 'player-identity');
    const avatar = node('span', 'player-avatar', (player.name || '?').slice(0, 1).toUpperCase());
    const name = node('span', 'player-name', player.name);
    if (player.isBotControlled) name.append(node('span', 'bot-mark', ' BOT SEMENTARA'));
    else if (player.isBot) name.append(node('span', 'bot-mark', ' BOT'));
    identity.append(avatar, name);
    const details = [];
    if (moderator && player.role) details.push(ROLE_INFO[player.role]?.[0] || player.role);
    details.push(player.voiceMode === 'offline' ? 'Offline · hanya mendengar' : 'Online · mikrofon');
    if (moderator && player.nightActionPartner) details.push('Pasangan: ' + player.nightActionPartner);
    if (!player.alive) details.push('Tereliminasi');
    else if (canMonitor && phase === 'role_draw') details.push(player.hasDrawn ? 'Kartu dibuka' : 'Belum membuka kartu');
    else if (canMonitor && phase === 'night') {
      details.push(player.actionSkipped ? 'Dilewati · belum beraksi'
        : player.hasActed
          ? (player.nightActionType === 'villager_math' ? 'Perhitungan selesai' : 'Aksi selesai')
            + (moderator && player.nightActionTarget ? ' · ' + player.nightActionTarget : '')
          : 'Belum melakukan aksi');
    } else if (canMonitor && phase === 'voting') {
      details.push(player.hasVoted
        ? player.voteAbstain ? 'Abstain' : moderator && player.voteTarget ? 'Memilih ' + player.voteTarget : 'Sudah voting'
        : 'Belum voting');
    } else details.push(player.isBotControlled ? 'BOT mengambil alih' : player.connected ? 'Online' : 'Menunggu');
    chip.append(identity, node('span', 'player-meta', details.join(' · ')));
    if (canMonitor && !player.isHost && player.id !== roomState.self?.id) {
      const actions = node('div', 'player-management-actions');
      actions.append(button('Kick', 'kick-player-button', () => kickPlayer(player)));
      if (player.isBotControlled) actions.append(button('Kembalikan', 'restore-bot-button', () => restorePlayerControl(player)));
      else if (!player.isBot) actions.append(button('Ganti BOT', 'bot-player-button', () => replacePlayerWithBot(player)));
      chip.append(actions);
    }
    list.append(chip);
  }
  if (waitingPlayers.length) {
    const queue = node('section', 'waiting-room-roster');
    addText(queue, 'div', 'waiting-room-count', waitingPlayers.length + ' pemain menunggu ronde berikutnya');
    const queueList = node('div', 'waiting-room-list');
    for (const player of waitingPlayers) {
      const item = node('div', 'waiting-room-player');
      addText(item, 'b', '', player.name);
      addText(item, 'span', 'player-meta', player.voiceMode === 'offline' ? 'Offline · dengar' : 'Online · mic');
      item.append(button('Kick', 'kick-player-button', () => kickPlayer(player)));
      queueList.append(item);
    }
    queue.append(queueList);
    list.append(queue);
  }
}

async function kickPlayer(player) {
  if ((!isHost() && !isRoomModerator()) || !player?.id || player.isHost || player.id === roomState?.self?.id) return;
  const name = String(player.name || 'Pemain');
  const accepted = await askConfirmation({
    title: 'Keluarkan pemain?',
    message: name + ' akan dikeluarkan dari room dan sesi lamanya tidak dapat digunakan lagi.',
    confirmLabel: 'Keluarkan pemain'
  });
  if (!accepted) return;
  if (await sendAction('kick_player', { playerId: player.id })) showMessage(name + ' berhasil dikeluarkan dari room.');
}

async function replacePlayerWithBot(player) {
  if ((!isHost() && !isRoomModerator()) || !player?.id || player.isHost || player.isBot) return;
  const name = String(player.name || 'Pemain');
  const accepted = await askConfirmation({
    title: 'Alihkan ke BOT?',
    message: 'BOT akan mengambil alih role dan aksi ' + name + ' sampai kendalinya dikembalikan.',
    confirmLabel: 'Alihkan ke BOT'
  });
  if (!accepted) return;
  if (await sendAction('replace_with_bot', { playerId: player.id })) showMessage('BOT sementara mengambil alih ' + name + '.');
}

async function restorePlayerControl(player) {
  if ((!isHost() && !isRoomModerator()) || !player?.id || !player.isBotControlled) return;
  if (await sendAction('restore_player_control', { playerId: player.id })) showMessage('Kendali pemain ' + player.name + ' berhasil dikembalikan.');
}

function updatePhaseTracker(phase) {
  const tracker = $('phaseTracker');
  if (!tracker) return;
  const steps = ['role_draw', 'night', 'dawn', 'morning', 'voting'];
  const mappedPhase = phase === 'discussion' ? 'morning' : phase === 'result' ? 'voting' : phase;
  const activeIndex = phase === 'finished' ? steps.length : phase === 'lobby' ? -1 : Math.max(0, steps.indexOf(mappedPhase));
  for (const item of tracker.querySelectorAll('[data-step]')) {
    const index = steps.indexOf(item.dataset.step);
    item.classList.toggle('active', index === activeIndex);
    item.classList.toggle('done', phase === 'finished' || index < activeIndex);
  }
}

function syncBotTakeoverDialog() {
  const dialog = $('botTakeoverDialog');
  if (!dialog) return;
  const controlled = Boolean(roomState?.self?.isBotControlled && !roomState?.self?.isWaiting);
  if (controlled && !dialog.open) {
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
  } else if (!controlled && dialog.open) {
    if (typeof dialog.close === 'function') dialog.close();
    else dialog.removeAttribute('open');
  }
}

function renderRoom() {
  if (!roomState) return;
  const room = roomState.room;
  const moderator = isRoomModerator();
  const host = isHost();
  const labels = {
    lobby: 'Lobby · Menunggu pemain',
    role_draw: 'Buka kartu',
    night: 'Tengah Malam · Ronde ' + room.round,
    dawn: 'Subuh',
    morning: 'Pagi · Diskusi',
    discussion: 'Pagi · Diskusi',
    voting: 'Sore · Voting',
    result: 'Sore · Hasil',
    finished: 'Permainan selesai'
  };
  $('phaseLabel').textContent = moderator ? (labels[room.phase] || room.phase) : '';
  $('roundLabel').textContent = moderator ? (room.round ? 'Ronde ' + room.round : 'Lobby') : '';
  $('roomCodeLabel').textContent = room.code;
  $('phaseTracker').classList.toggle('hidden', !moderator);
  const resetButton = $('resetRoom');
  if (resetButton) {
    // Keep the control visible at all times; only the host can activate it.
    resetButton.classList.remove('hidden');
    resetButton.classList.toggle('restart-button', host);
    resetButton.disabled = !host;
    resetButton.setAttribute('aria-disabled', String(!host));
    resetButton.textContent = 'Restart Permainan';
    resetButton.title = host
      ? 'Mulai ulang permainan dan kembalikan semua pemain ke ruang tunggu tanpa mengeluarkan pemain'
      : 'Hanya host yang dapat memulai ulang permainan';
  }
  const leaveButton = $('leaveRoom');
  if (leaveButton) {
    leaveButton.textContent = host ? 'Bubarkan Room' : moderator ? 'Moderator Aktif' : 'Keluar';
    leaveButton.title = host
      ? 'Bubarkan room dan keluarkan semua pemain'
      : moderator ? 'Moderator tidak dapat keluar selama permainan berlangsung' : 'Keluar dari room';
    leaveButton.disabled = moderator && !host;
    leaveButton.classList.toggle('disband-button', host);
  }
  const canManagePlayers = moderator || host;
  $('playersSection').classList.toggle('hidden', !canManagePlayers);
  $('roomIdentity').classList.toggle('hidden', !moderator && !host);
  $('roomMeta').classList.toggle('hidden', !moderator);
  const playersHint = $('playersSection').querySelector('.hint-inline');
  if (playersHint) playersHint.textContent = moderator
    ? 'Moderator dapat melihat status dan peran pemain.'
    : 'Host dapat mengeluarkan pemain tanpa melihat role mereka.';
  if (moderator) updatePhaseTracker(room.phase);
  if (canManagePlayers) renderPlayers();
  else $('playersList').replaceChildren();
  const activeElement = document.activeElement;
  const activeId = activeElement && activeElement.id ? activeElement.id : '';
  const activeValue = activeElement && 'value' in activeElement ? activeElement.value : undefined;
  const phasePanel = $('phasePanel');
  if (phasePanel) phasePanel.dataset.phase = room.phase;
  const content = $('phaseContent');
  content.replaceChildren();
  if (moderator) renderModeratorPhase(content);
  else renderPlayerPhase(content);
  if (!roomState.self?.isWaiting && room.phase !== 'lobby') renderLivingPlayers(content);
  renderDiscussionTools(content);
  syncBotTakeoverDialog();
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
  startPhaseClock();
}

function appendPhaseCountdown(parent, label, deadline) {
  if (!Number(deadline)) return;
  const panel = node('div', 'phase-countdown');
  addText(panel, 'span', 'phase-countdown-label', label);
  const timer = addText(panel, 'strong', 'timer', '00:00');
  timer.id = 'phaseCountdown';
  timer.dataset.deadline = String(deadline);
  parent.append(panel);
}

function updatePhaseClock() {
  const timer = $('phaseCountdown');
  if (!timer) return;
  const deadline = Number(timer.dataset.deadline) || 0;
  const seconds = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  timer.textContent = String(minutes).padStart(2, '0') + ':' + String(remainder).padStart(2, '0');
  const activePhase = roomState?.room?.phase;
  if (seconds === 0 && ['night', 'dawn', 'voting', 'result'].includes(activePhase)) {
    for (const control of document.querySelectorAll('#phaseContent .action-button, #phaseContent .phase-timed-action')) {
      control.disabled = true;
    }
  }
  const votingButton = $('startVotingButton');
  if (votingButton) {
    votingButton.disabled = seconds > 0;
    votingButton.textContent = seconds > 0 ? 'Diskusi · ' + seconds + ' detik' : 'Voting';
  }
  const startNightButton = $('startNightAfterDrawButton');
  if (startNightButton) {
    const cardsComplete = roomState?.room?.roleCardsDrawn >= roomState?.room?.roleCardsRequired;
    startNightButton.disabled = !cardsComplete && seconds > 0;
  }
  const nightButton = $('advanceNightButton');
  if (nightButton) {
    const room = roomState?.room || {};
    const pending = Math.max(0, Number(room.nightActionsRequired) - Number(room.nightActionsSubmitted));
    nightButton.disabled = pending > 0 && seconds > 0;
    nightButton.textContent = pending > 0 && seconds > 0 ? 'Menunggu aksi · ' + seconds + ' detik' : 'Lanjut ke Subuh';
  }
  const dawnButton = $('advanceDawnButton');
  if (dawnButton) {
    const room = roomState?.room || {};
    const pending = Math.max(0, Number(room.dawnActionsRequired) - Number(room.dawnActionsSubmitted));
    dawnButton.disabled = pending > 0 && seconds > 0;
    dawnButton.textContent = pending > 0 && seconds > 0 ? 'Menunggu aksi pemicu · ' + seconds + ' detik' : 'Lanjut ke Pagi';
  }
  const resolveResultButton = $('resolveResultButton');
  if (resolveResultButton) {
    resolveResultButton.disabled = seconds > 0;
    resolveResultButton.textContent = seconds > 0 ? 'Tembakan ditutup · ' + seconds + ' detik' : 'Proses aksi Hunter';
  }
  const nextRoundButton = $('nextRoundButton');
  if (nextRoundButton) {
    nextRoundButton.disabled = seconds > 0;
    nextRoundButton.textContent = seconds > 0 ? 'Ronde berikutnya · ' + seconds + ' detik' : 'Lanjut ke Malam ' + ((roomState?.room?.round || 0) + 1);
  }
}

function startPhaseClock() {
  if (clockTimer) clearInterval(clockTimer);
  clockTimer = null;
  if (!$('phaseCountdown')) return;
  updatePhaseClock();
  clockTimer = setInterval(updatePhaseClock, 250);
}

function phaseHeader(parent, kicker, title, description) {
  const head = node('div', 'phase-title');
  const left = node('div');
  addText(left, 'div', 'eyebrow-small', kicker);
  addText(left, 'h2', '', title);
  head.append(left);
  parent.append(head);
}

function appendRoleDetails(parent, info, prefix) {
  const details = node('span', prefix + '-details');
  for (const [label, value] of [['KEKUATAN', info[1]], ['ATURAN PAKAI', info[2]]]) {
    const row = node('span', prefix + '-detail');
    addText(row, 'span', prefix + '-detail-label', label);
    addText(row, 'span', prefix + '-detail-text', value);
    details.append(row);
  }
  parent.append(details);
}

function renderFactionBadge(parent, role) {
  const faction = factionForRole(role);
  const label = faction === 'moderator' ? 'PENGATUR PERMAINAN' : factionLabel(faction);
  addText(parent, 'span', 'role-faction-badge faction-' + faction, label);
}

function renderRoleCard(parent, role, eyebrow = 'KARTU RAHASIA KAMU') {
  const info = ROLE_INFO[role] || ['Peran', 'Belum ada kemampuan.', 'Ikuti arahan moderator.'];
  const card = node('div', 'role-card');
  card.dataset.role = role;
  renderFactionBadge(card, role);
  const art = node('div', 'role-art');
  const image = node('img');
  image.src = './assets/illustrations/role-' + (ROLE_INFO[role] ? role : 'villager') + '.svg';
  image.alt = 'Potret ' + info[0];
  image.loading = 'eager';
  image.onerror = () => {
    image.onerror = null;
    image.src = './assets/illustrations/role-villager.svg';
  };
  art.append(image);
  card.append(art);
  addText(card, 'div', 'eyebrow-small', eyebrow);
  addText(card, 'div', 'role-name', info[0]);
  appendRoleDetails(card, info, 'role-card');
  parent.append(card);
}

function renderPlayerRoleReminder(parent) {
  const role = roomState.self?.role;
  if (!role && !roomState.self?.hasRole) return;
  if (!roomState.self.hasDrawn) {
    const pending = node('section', 'pending-role-card');
    addText(pending, 'div', 'eyebrow-small', 'KARTU RAHASIA BELUM DIBUKA');
    addText(pending, 'p', 'pending-role-copy', 'Permainan sudah berjalan. Buka kartu untuk melihat role dan mengikuti aksi.');
    pending.append(button('Buka kartu saya sekarang', 'primary wide', () => sendAction('draw_card')));
    parent.append(pending);
    return;
  }
  const info = ROLE_INFO[role] || ['Peran', 'Belum ada kemampuan.', 'Ikuti arahan moderator.'];
  const card = node('button', 'role-flip-card');
  card.type = 'button';
  card.setAttribute('aria-label', 'Kartu tertutup. Tekan untuk melihat role.');
  card.setAttribute('aria-pressed', 'false');
  const inner = node('span', 'role-flip-inner');
  const back = node('span', 'role-flip-face role-flip-back');
  addText(back, 'span', 'role-flip-title', 'THE VILLAGE');
  addText(back, 'span', 'role-flip-subtitle', 'TEKAN UNTUK MELIHAT ROLE');
  const front = node('span', 'role-flip-face role-flip-front');
  renderFactionBadge(front, role);
  const art = node('span', 'role-flip-art');
  const image = node('img');
  image.src = './assets/illustrations/role-' + (ROLE_INFO[role] ? role : 'villager') + '.svg';
  image.alt = 'Potret ' + info[0];
  image.loading = 'eager';
  image.onerror = () => {
    image.onerror = null;
    image.src = './assets/illustrations/role-villager.svg';
  };
  art.append(image);
  front.append(art);
  addText(front, 'span', 'role-flip-eyebrow', 'KARTU RAHASIA KAMU');
  addText(front, 'span', 'role-flip-name', info[0]);
  appendRoleDetails(front, info, 'role-flip');
  inner.append(back, front);
  card.append(inner);
  card.addEventListener('click', () => {
    const flipped = card.classList.toggle('is-flipped');
    card.setAttribute('aria-pressed', String(flipped));
    card.setAttribute('aria-label', flipped ? 'Role terlihat. Tekan untuk menutup kartu.' : 'Kartu tertutup. Tekan untuk melihat role.');
  });
  parent.append(card);
}

function renderWolfNightRoom(parent) {
  const self = roomState.self;
  if (!['wolf', 'alpha_wolf'].includes(self?.role) || !self.alive || roomState.room.phase !== 'night') return;
  const panel = node('section', 'wolf-night-room');
  addText(panel, 'div', 'eyebrow-small', 'RUANG RAHASIA KAWANAN');
  addText(panel, 'h3', '', 'Koordinasi Werewolf');
  addText(panel, 'p', 'hint', 'Ruang ini hanya terlihat oleh Werewolf selama malam. Pilihan serangan setiap anggota diperbarui secara realtime. Semua aksi diproses ketika moderator melanjutkan ke pagi.');

  const team = node('div', 'wolf-team-members');
  for (const name of roomState.wolfTeam || []) addText(team, 'span', 'wolf-team-member', name);
  panel.append(team);

  const board = node('section', 'wolf-selection-board');
  addText(board, 'div', 'eyebrow-small', 'PILIHAN SERANGAN KAWANAN');
  for (const selection of roomState.wolfSelections || []) {
    const row = node('div', 'wolf-selection-row');
    const identity = node('b', '', selection.name + (selection.isSelf ? ' · Kamu' : ''));
    const choice = node('span', selection.hasChosen ? 'wolf-choice-made' : 'wolf-choice-pending',
      selection.hasChosen ? 'Memilih: ' + selection.targetName : 'Belum memilih');
    row.append(identity, choice);
    board.append(row);
  }
  if (!(roomState.wolfSelections || []).length) addText(board, 'p', 'hint', 'Belum ada data pilihan kawanan.');
  panel.append(board);

  const chat = node('section', 'wolf-private-chat');
  addText(chat, 'div', 'eyebrow-small', 'CHAT PRIVAT WEREWOLF');
  const messages = node('div', 'wolf-chat-messages');
  messages.setAttribute('role', 'log');
  messages.setAttribute('aria-live', 'polite');
  const chatItems = Array.isArray(roomState.wolfChat) ? roomState.wolfChat : [];
  if (!chatItems.length) addText(messages, 'p', 'wolf-chat-empty', 'Belum ada pesan. Koordinasikan pilihan di sini.');
  for (const message of chatItems) {
    const item = node('article', 'wolf-chat-message');
    const header = node('div', 'wolf-chat-message-header');
    addText(header, 'b', '', message.name || 'Werewolf');
    if (Number.isFinite(Number(message.at))) {
      addText(header, 'time', '', new Date(Number(message.at)).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }));
    }
    addText(item, 'p', '', message.text || '');
    item.prepend(header);
    messages.append(item);
  }
  chat.append(messages);

  const form = node('form', 'wolf-chat-form');
  const input = node('input', 'wolf-chat-input');
  input.id = 'wolfChatInput';
  input.type = 'text';
  input.maxLength = 280;
  input.autocomplete = 'off';
  input.placeholder = 'Pesan untuk kawanan...';
  input.setAttribute('aria-label', 'Pesan chat Werewolf');
  input.value = wolfChatDraft;
  input.addEventListener('input', () => { wolfChatDraft = input.value; });
  const submit = node('button', 'secondary', 'Kirim');
  submit.type = 'submit';
  form.append(input, submit);
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const text = wolfChatDraft.trim();
    if (!text) return;
    const sent = await sendAction('wolf_chat', { text });
    if (sent && wolfChatDraft === text) {
      wolfChatDraft = '';
      const currentInput = $('wolfChatInput');
      if (currentInput) currentInput.value = '';
    } else if (!sent) {
      renderRoom();
    }
  });
  chat.append(form);
  panel.append(chat);
  parent.append(panel);
  messages.scrollTop = messages.scrollHeight;
}

function renderPublicResult(parent) {
  const result = roomState.room.publicResult;
  if (!result) return;
  const titles = {
    night: 'HASIL AKSI MALAM',
    vote: 'HASIL VOTING',
    hunter: 'HASIL AKSI HUNTER',
    leave: 'PERUBAHAN PEMAIN'
  };
  const panel = node('section', 'public-result-card');
  addText(panel, 'div', 'eyebrow-small', titles[result.kind] || 'HASIL PERMAINAN');
  addText(panel, 'h3', '', result.message || 'Hasil aksi telah diproses.');
  const eliminated = Array.isArray(result.eliminatedPlayers) ? result.eliminatedPlayers : [];
  if (eliminated.length) {
    const list = node('div', 'public-result-list');
    for (const item of eliminated) {
      const row = node('div', 'public-result-player');
      addText(row, 'b', '', item.name || 'Pemain');
      addText(row, 'span', '', item.cause || 'Tereliminasi');
      list.append(row);
    }
    panel.append(list);
  } else {
    addText(panel, 'p', 'public-result-empty',
      result.kind === 'night' ? 'Tidak ada pemain yang tereliminasi malam ini.'
        : 'Tidak ada pemain yang tereliminasi pada hasil ini.');
  }
  parent.append(panel);
}

function renderModeratorEventReport(parent, result) {
  if (!result) return;
  const actionReport = Array.isArray(result.actionReport) ? result.actionReport : [];
  if (actionReport.length) {
    const events = node('section', 'moderator-event-report');
    addText(events, 'div', 'eyebrow-small', 'URUTAN AKSI DAN HASIL');
    actionReport.forEach((event, index) => {
      const row = node('article', 'moderator-event-item');
      const heading = node('div', 'moderator-event-heading');
      addText(heading, 'span', 'moderator-event-number', String(index + 1).padStart(2, '0'));
      addText(heading, 'b', 'moderator-event-title',
        [event.role, event.actor].filter(Boolean).join(' · ')
      );
      const action = node('div', 'moderator-event-action');
      addText(action, 'span', 'moderator-event-action-label', 'AKSI');
      addText(action, 'span', 'moderator-event-action-text', event.action || 'Aksi tidak tercatat.');
      const outcomeText = String(event.outcome || 'Hasil belum tersedia.');
      const normalized = outcomeText.toLowerCase();
      const tone = /berhasil|selamat|benar|terhubung|diterima|mengorbankan diri/.test(normalized)
        ? 'success'
        : /gagal|tidak ada|belum|salah|dilewati|tidak terpicu|nonaktif/.test(normalized)
          ? 'warning' : 'neutral';
      const outcome = node('div', 'moderator-event-outcome outcome-' + tone);
      addText(outcome, 'span', 'moderator-event-action-label', 'HASIL');
      addText(outcome, 'span', 'moderator-event-action-text', outcomeText);
      row.prepend(heading);
      row.append(action, outcome);
      events.append(row);
    });
    parent.append(events);
  } else if (Array.isArray(result.events) && result.events.length) {
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
      const row = node('div', 'moderator-elimination-row faction-' + factionForRole(elimination.role));
      addText(row, 'b', '', (elimination.name || 'Pemain') + ' · ' + roleLabel(elimination.role));
      addText(row, 'span', '', eliminationCauseLabel(elimination.cause));
      list.append(row);
    }
    parent.append(list);
  } else if (result.eliminatedId) {
    const player = roomState.players.find(item => item.id === result.eliminatedId);
    if (player) addText(parent, 'div', 'notice warning', player.name + ' · ' + roleLabel(player.role));
  } else if ((result.kind === 'night' || result.kind === 'vote') && !actionReport.length) {
    addText(parent, 'div', 'notice success', 'Tidak ada pemain yang tereliminasi.');
  }
}

function eliminationCauseLabel(cause) {
  return ({
    werewolf_attack: 'Serangan Werewolf',
    witch_poison: 'Racun Witch',
    bodyguard_sacrifice: 'Pengorbanan Bodyguard',
    cupid_bond: 'Efek ikatan Cupid',
    vote: 'Hasil voting',
    hunter: 'Tembakan Hunter',
    vigilante_shot: 'Tembakan Vigilante'
  })[cause] || 'Penyebab eliminasi';
}

function renderModeratorPhase(parent) {
  renderModeratorDashboard(parent);
  switch (roomState.room.phase) {
    case 'lobby': renderModeratorLobby(parent); break;
    case 'role_draw': renderModeratorRoleDraw(parent); break;
    case 'night': renderModeratorNight(parent); break;
    case 'dawn': renderModeratorDawn(parent); break;
    case 'morning': renderModeratorMorning(parent); break;
    case 'discussion': renderModeratorDiscussion(parent); break;
    case 'voting': renderModeratorVoting(parent); break;
    case 'result': renderModeratorResult(parent); break;
    case 'finished': renderModeratorFinished(parent); break;
    default: addText(parent, 'p', 'notice', 'Status permainan tidak dikenali.');
  }
}

function renderLivingPlayers(parent) {
  const players = Array.isArray(roomState.publicPlayers) ? roomState.publicPlayers : [];
  const roles = Array.isArray(roomState.publicRoles) ? roomState.publicRoles : [];
  const panel = node('section', 'public-game-board');

  const roleSection = node('section', 'public-role-board');
  const roleHeading = node('div', 'public-board-heading');
  addText(roleHeading, 'b', '', 'ROLE DALAM PERMAINAN');
  addText(roleHeading, 'span', '', roles.length + ' jenis role');
  roleSection.append(roleHeading);
  const roleGrid = node('div', 'public-role-grid');
  for (const entry of roles) {
    const card = node('article', 'public-role-card faction-' + entry.faction);
    const title = node('div', 'public-role-title');
    addText(title, 'b', '', roleLabel(entry.role));
    if (Array.isArray(entry.deceasedNames) && entry.deceasedNames.length) {
      addText(title, 'span', 'public-dead-name', ' | ' + entry.deceasedNames.join(', '));
    }
    addText(title, 'span', '', '×' + entry.count);
    card.append(title);
    roleGrid.append(card);
  }
  if (!roles.length) addText(roleGrid, 'span', 'hint', 'Komposisi role belum tersedia.');
  roleSection.append(roleGrid);
  panel.append(roleSection);

  const playerSection = node('section', 'public-player-board');
  const playerHeading = node('div', 'public-board-heading');
  addText(playerHeading, 'b', '', 'PEMAIN & STATUS');
  const living = players.filter(player => player.alive).length;
  addText(playerHeading, 'span', '', living + ' / ' + players.length + ' hidup');
  playerSection.append(playerHeading);
  const playerGrid = node('div', 'public-player-grid');
  const history = new Map((roomState.self?.seerHistory || []).map(item => [item.targetId, item]));
  for (const player of players) {
    const inspected = history.get(player.id);
    const result = inspected?.result;
    const isWolf = result === 'wolf' || result === 'wolf_team' || inspected?.targetFaction === 'wolves';
    const isNeutral = result === 'neutral' || inspected?.targetFaction === 'neutral';
    const row = node('article', 'public-player-row' + (player.alive ? ' is-alive' : ' is-dead'));
    const identity = node('div', 'public-player-identity');
    addText(identity, 'b', '', player.name);
    if (player.revealedRole) addText(identity, 'small', 'public-player-revealed-role', roleLabel(player.revealedRole));
    if (inspected && player.alive) {
      const label = roomState.self.role === 'detective'
        ? (isWolf ? 'Werewolf' : isNeutral ? 'Netral' : 'Desa')
        : (inspected.targetRole ? roleLabel(inspected.targetRole) : isWolf ? 'Werewolf' : 'Bukan Werewolf');
      addText(identity, 'small', 'seer-inspection-tag', label);
    }
    const statusText = player.isBotControlled
      ? 'BOT · ' + (player.phaseStatus || 'Mengambil alih')
      : player.phaseStatus || (player.alive ? 'Hidup' : 'Tereliminasi');
    addText(row, 'span', 'public-player-status', statusText);
    row.prepend(identity);
    playerGrid.append(row);
  }
  if (!players.length) addText(playerGrid, 'span', 'hint', 'Belum ada pemain.');
  playerSection.append(playerGrid);
  panel.append(playerSection);

  if (Array.isArray(roomState.publicVotes) && roomState.publicVotes.length) {
    const voting = node('section', 'public-vote-board');
    const voteHeading = node('div', 'public-board-heading');
    addText(voteHeading, 'b', '', 'VOTING TERBUKA');
    addText(voteHeading, 'span', '', roomState.publicVotes.filter(item => item.hasVoted).length
      + ' / ' + roomState.publicVotes.length + ' suara');
    voting.append(voteHeading);
    const voteList = node('div', 'public-vote-list');
    for (const ballot of roomState.publicVotes) {
      const row = node('div', 'public-vote-row' + (ballot.hasVoted ? ' vote-submitted' : ' vote-pending'));
      addText(row, 'b', '', ballot.voterName);
      addText(row, 'span', '', ballot.status || 'Belum memilih');
      voteList.append(row);
    }
    voting.append(voteList);
    panel.append(voting);
  }
  parent.append(panel);
}

function renderSystemHostPlayerContext(parent) {
  const self = roomState.self || {};
  const panel = node('section', 'system-host-player-context');
  addText(panel, 'div', 'eyebrow-small', 'HOST JUGA PEMAIN');
  if (self.role && self.hasDrawn) {
    const info = ROLE_INFO[self.role] || ['Peran', 'Belum ada kemampuan.', 'Ikuti arahan moderator.'];
    addText(panel, 'b', 'system-host-player-role', 'Role kamu: ' + info[0]);
    const disclosure = node('details', 'role-config-info-disclosure system-host-role-disclosure');
    disclosure.append(node('summary', '', 'Lihat kekuatan & aturan pakai role kamu'));
    appendRoleDetails(disclosure, info, 'role-config-info');
    panel.append(disclosure);
  } else {
    addText(panel, 'p', 'system-host-player-role', 'Kartu rahasia dan aksi pribadimu sama seperti pemain lain. Buka kartu saat diminta.');
  }
  addText(panel, 'p', 'system-host-player-note',
    'Komposisi role dan status aksi pemain terlihat bersama. Role pemain yang masih hidup tetap rahasia.');
  parent.append(panel);
}

function renderPlayerPhase(parent) {
  const phase = roomState.room.phase;
  const self = roomState.self || {};
  if (self.isWaiting) {
    phaseHeader(parent, 'DAFTAR TUNGGU', 'Kamu masuk saat permainan berlangsung',
      'Kamu sudah terdaftar untuk permainan berikutnya. Permainan saat ini tetap berjalan tanpa melibatkanmu.');
    addText(parent, 'div', 'notice success', 'Kartu role belum dibagikan. Kamu tidak ikut aksi malam, diskusi, voting, atau perhitungan ronde ini.');
    addText(parent, 'div', 'notice', 'Host akan memasukkanmu otomatis ke ruang tunggu aktif saat permainan di-restart untuk ronde berikutnya.');
    const queue = node('section', 'waiting-room-roster');
    addText(queue, 'div', 'waiting-room-count', (roomState.waitingPlayers || []).length + ' pemain menunggu ronde berikutnya');
    const queueList = node('div', 'waiting-room-list');
    for (const player of (roomState.waitingPlayers || [])) {
      const item = node('div', 'waiting-room-player');
      addText(item, 'b', '', player.name);
      addText(item, 'span', player.voiceMode === 'offline' ? 'offline' : 'online',
        player.voiceMode === 'offline' ? 'Offline' : 'Online');
      queueList.append(item);
    }
    queue.append(queueList);
    parent.append(queue);
    return;
  }
  if (phase === 'lobby') {
    phaseHeader(parent, 'RUANG TUNGGU', 'Menunggu permainan dimulai',
      'Kamu sudah berada di room yang sama dengan pemain lainnya. Host akan memulai permainan setelah semua siap.');
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
    return;
  }

  if (!(phase === 'role_draw' && !self.hasDrawn)) renderPlayerRoleReminder(parent);
  if (systemModeratorEnabled() && isHost()) {
    addText(parent, 'div', 'notice', 'Sistem mengatur semua fase otomatis. Host tetap bermain sesuai role kartunya.');
  }
  renderMasonCircle(parent);
  const loverNames = self.loverNames || [];
  if (loverNames.length === 2) {
    const message = self.role === 'cupid'
      ? 'Pasangan yang kamu hubungkan: ' + loverNames.join(' & ') + '. Role pasangan tetap rahasia.'
      : 'Kamu terikat sebagai pasangan dengan ' + loverNames.filter(name => name !== self.name).join(' & ') + '. Jika salah satu tereliminasi, pasangannya ikut tereliminasi. Role pasangan tetap rahasia.';
    addText(parent, 'div', 'notice success', message);
  }
  renderPrivateInspectionResult(parent);

  if (self.isBotControlled) {
    addText(parent, 'div', 'notice warning',
      'BOT sementara menjalankan role dan aksimu. Pilih Kembali Bermain untuk mengambil kendali lagi atau Keluar Room untuk meninggalkan permainan.');
    if (phase === 'finished') renderVictoryScreen(parent, false);
    return;
  }

  switch (phase) {
    case 'role_draw': renderPlayerRoleDraw(parent); break;
    case 'night': renderPlayerNight(parent); break;
    case 'dawn': renderPlayerDawn(parent); break;
    case 'morning': renderPlayerMorning(parent); break;
    case 'discussion': renderPlayerDiscussion(parent); break;
    case 'voting': renderPlayerVoting(parent); break;
    case 'result':
      if (systemModeratorEnabled()) renderSystemModeratorVoteResult(parent);
      else renderPlayerVoteResult(parent);
      break;
    case 'finished': renderVictoryScreen(parent, false); break;
    default: addText(parent, 'p', 'notice', 'Menunggu moderator.');
  }
}

function renderModeratorLobby(parent) {
  phaseHeader(parent, 'PANEL MODERATOR', 'Atur role setelah pemain bergabung', 'Tentukan role dan jumlahnya di sini. Pengaturan ini dapat diubah selama room masih berada di lobby.');
  const settings = roomState.room.settings || {};
  const mode = roleSettingsForUI(settings).moderatorMode;
  const roleSlots = rolePlayerCount(mode);
  const onlinePlayers = (roomState.players || []).filter(player => player.voiceMode !== 'offline' && !player.isBot).length;
  const offlinePlayers = (roomState.players || []).filter(player => player.voiceMode === 'offline' && !player.isBot).length;
  addText(parent, 'div', 'notice success',
    'Voice pemain: ' + onlinePlayers + ' online (mikrofon aktif otomatis) · '
      + offlinePlayers + ' offline (mikrofon mati, tetap mendengar).');
  addText(parent, 'div', 'notice', 'Pemain aktif: ' + roomState.players.length + '. Menunggu ronde berikutnya: '
    + (roomState.waitingPlayers || []).length + '. Pemain yang menerima role: ' + roleSlots
    + '. Moderator sementara tidak dihitung sebagai pemain aktif.');
  addText(parent, 'div', mode === 'system' ? 'notice success' : 'notice', mode === 'system'
    ? 'Moderator sistem aktif. Seluruh fase berjalan otomatis sesuai durasi, tanpa host perlu menekan tombol perpindahan.'
    : mode === 'random' ? 'Mode acak aktif. Satu pemain manusia akan dipilih sebagai moderator dan sementara dikeluarkan dari daftar pemain aktif.'
      : 'Moderator host aktif. Host akan dikeluarkan sementara dari daftar pemain aktif saat permainan dimulai.');
  addText(parent, 'p', 'hint', 'Untuk 4–25 pemain, sistem menyusun komposisi role bertahap pada setiap jumlah pemain. Warga Desa dijaga sekitar 20%; role khusus dan netral dibuka bergantian, lalu beberapa role dapat berulang. Pengaturan manual host tetap menjadi prioritas.');
  const configEditor = node('div', 'role-config-lobby');
  renderRoleConfigEditor(configEditor, settings);
  parent.append(configEditor);
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

  const startButton = button('Mulai Permainan & Bagikan Kartu', 'primary wide', async () => {
    try {
      const saved = await sendAction('update_settings', { settings: readRoleSettings(configEditor) });
      if (!saved) return;
      roleDraft = null;
      await sendAction('start_game');
    } catch (error) { showMessage(error.message, true); }
  });
  startButton.id = 'startGameButton';
  parent.append(startButton);
  updateRoleConfigSummary(configEditor);
  addText(parent, 'p', 'hint', 'Pengaturan role diterapkan otomatis saat permainan dimulai. Kartu dibagikan secara privat.');
  renderReplayArchive(parent);
}

function renderModeratorRoleDraw(parent) {
  const duration = roleSettingsForUI(roomState.room.settings || {}).timers.roleDrawSeconds;
  phaseHeader(parent, 'BUKA KARTU', 'Waktu membuka kartu · ' + duration + ' detik', 'Setiap pemain membuka kartu rahasianya sendiri. Setelah waktunya habis, permainan berlanjut ke tengah malam.');
  const opened = roomState.players.filter(player => player.hasDrawn).length;
  addText(parent, 'div', 'notice', opened + ' / ' + roomState.players.length + ' pemain sudah membuka kartu.');
  appendPhaseCountdown(parent, 'MALAM DIMULAI DALAM', roomState.room.roleDrawEndsAt);
  const complete = roomState.players.length > 0 && opened === roomState.players.length;
  if (systemModeratorEnabled()) {
    addText(parent, 'div', 'notice success', 'Sistem memulai tengah malam setelah semua kartu dibuka atau waktu habis.');
  } else {
    const next = button('Lanjut ke Malam 1', 'primary wide', () => sendAction('start_night'),
      !complete && Number(roomState.room.roleDrawEndsAt) > Date.now());
    next.id = 'startNightAfterDrawButton';
    parent.append(next);
    addText(parent, 'p', 'hint', 'Jika masih ada kartu tertutup, malam dimulai otomatis saat hitung mundur selesai.');
  }
}

function renderModeratorNight(parent) {
  const room = roomState.room;
  phaseHeader(parent, 'TENGAH MALAM · RONDE ' + room.round, 'Aksi rahasia berlangsung', 'Werewolf dan role khusus menjalankan kemampuan. Semua pilihan tetap dapat diubah sampai waktu tengah malam berakhir.');
  const pending = Math.max(0, Number(room.nightActionsRequired) - Number(room.nightActionsSubmitted));
  addText(parent, 'div', 'notice', room.nightActionsSubmitted + ' / ' + room.nightActionsRequired + ' aksi masuk.'
    + (pending ? ' ' + pending + ' pemain masih memilih.' : ' Semua pemain sudah memilih.'));
  appendPhaseCountdown(parent, 'SUBUH DALAM', room.nightEndsAt);
  const advance = button('Lanjut ke Subuh', 'primary wide', () =>
    sendAction('resolve_night', { force: Number(room.nightEndsAt) > 0 && room.nightEndsAt <= Date.now() }),
    pending > 0 && Number(room.nightEndsAt) > Date.now());
  advance.id = 'advanceNightButton';
  parent.append(advance);
}

function renderModeratorDawn(parent) {
  const room = roomState.room;
  phaseHeader(parent, 'SUBUH · RONDE ' + room.round, 'Aksi pemicu', 'Hunter yang gugur dapat menembak. Reviver dapat membangkitkan satu korban malam. Hasil baru diumumkan saat pagi tiba.');
  const pending = Math.max(0, Number(room.dawnActionsRequired) - Number(room.dawnActionsSubmitted));
  addText(parent, 'div', 'notice', room.dawnActionsSubmitted + ' / ' + room.dawnActionsRequired + ' aksi subuh masuk.'
    + (pending ? ' Menunggu ' + pending + ' aksi pemicu.' : ' Tidak ada aksi pemicu yang tertunda.'));
  appendPhaseCountdown(parent, 'PAGI DALAM', room.dawnEndsAt);
  const advance = button('Lanjut ke Pagi', 'primary wide', () =>
    sendAction('resolve_dawn', { force: Number(room.dawnEndsAt) > 0 && room.dawnEndsAt <= Date.now() }),
    pending > 0 && Number(room.dawnEndsAt) > Date.now());
  advance.id = 'advanceDawnButton';
  parent.append(advance);
}

function renderModeratorMorning(parent) {
  phaseHeader(parent, 'PAGI · RONDE ' + roomState.room.round, 'Warga mulai berdiskusi', 'Korban dan kejadian semalam telah diumumkan. Warga punya waktu untuk mengumpulkan petunjuk sebelum sore tiba.');
  const room = roomState.room;
  const result = room.lastResult;
  renderPublicResult(parent);
  const card = node('div', 'result-card');
  addText(card, 'h3', '', result?.message || 'Malam telah berlalu.');
  renderModeratorEventReport(card, result);
  parent.append(card);
  if (room.winner) {
    addText(parent, 'div', 'winner', winnerLabel(room.winner));
    return;
  }
  appendPhaseCountdown(parent, 'DISKUSI TERSISA', room.discussionEndsAt);
  const votingButton = button('Lanjut ke Sore · Voting', 'primary wide', () => sendAction('start_voting'),
    Boolean(room.discussionEndsAt && room.discussionEndsAt > Date.now()));
  votingButton.id = 'startVotingButton';
  parent.append(votingButton);
}

function renderModeratorDiscussion(parent) {
  phaseHeader(parent, 'FASE DISKUSI', 'Diskusi pemain', 'Chat dan voice chat tersedia di semua fase mode online. Moderator menentukan kapan voting dimulai.');
  parent.append(button('Lanjut ke Voting', 'primary wide', () => sendAction('start_voting')));
}

function renderModeratorVoting(parent) {
  phaseHeader(parent, 'SORE · RONDE ' + roomState.room.round, 'Voting eksekusi', 'Pantau pilihan setiap pemain secara terbuka. Sistem mengumumkan hasil saat timer berakhir.');
  const room = roomState.room;
  addText(parent, 'div', 'notice', room.votesSubmitted + ' / ' + room.votesRequired + ' suara sudah masuk.');
  appendPhaseCountdown(parent, 'VOTING TERSISA', room.votingEndsAt);
  addText(parent, 'div', 'notice success', systemModeratorEnabled()
    ? 'Sistem menutup voting saat timer habis. Pilihan tetap dapat diganti sampai detik terakhir.'
    : 'Voting ditutup otomatis setelah waktu habis. Pilihan pemain tetap dapat diganti sebelum timer selesai.');
}

function renderModeratorResult(parent) {
  phaseHeader(parent, 'HASIL VOTING', 'Bacakan hasil voting', 'Hasil eliminasi dapat dilihat semua pemain. Rincian pilihan suara tetap rahasia.');
  const result = roomState.room.lastResult;
  renderPublicResult(parent);
  const card = node('div', 'result-card');
  addText(card, 'h3', '', result?.message || 'Hasil voting tersedia.');
  renderModeratorEventReport(card, result);
  parent.append(card);
  addText(parent, 'p', 'hint', 'Tidak ada batas maksimal ronde. Permainan berlanjut sampai kondisi kemenangan terpenuhi.');
  appendPhaseCountdown(parent, 'RONDE BERIKUTNYA DALAM', roomState.room.resultEndsAt);
  if (systemModeratorEnabled()) {
    addText(parent, 'div', 'notice success', roomState.room.resultResolved
      ? 'Sistem akan memulai malam berikutnya setelah narasi hasil selesai.'
      : 'Jika Hunter gugur, sistem memberi waktu untuk memilih tembakan sebelum melanjutkan permainan.');
  } else if (!roomState.room.resultResolved) {
    const resolve = button('Proses aksi Hunter', 'primary wide', () => sendAction('resolve_result'),
      Boolean(roomState.room.resultEndsAt && roomState.room.resultEndsAt > Date.now()));
    resolve.id = 'resolveResultButton';
    parent.append(resolve);
  } else {
    const next = button('Lanjut ke Malam ' + (roomState.room.round + 1), 'primary wide', () => sendAction('next_round'),
      Boolean(roomState.room.resultEndsAt && roomState.room.resultEndsAt > Date.now()));
    next.id = 'nextRoundButton';
    parent.append(next);
  }
}

function renderModeratorFinished(parent) {
  renderVictoryScreen(parent, true);
}

function renderPlayerRoleDraw(parent) {
  phaseHeader(parent, 'BUKA KARTU', 'Pembagian kartu rahasia',
    'Buka kartu untuk melihat role. Setelah timer habis, permainan masuk ke tengah malam.');
  if (!roomState.self.hasDrawn) {
    const card = node('div', 'card-back');
    const label = node('div');
    label.append(node('div', '', 'WEREWOLF'));
    label.append(node('span', '', 'TEKAN UNTUK MEMBUKA KARTU'));
    card.append(label);
    parent.append(card);
    parent.append(button('Buka kartu saya', 'primary wide', () => sendAction('draw_card')));
  } else {
    addText(parent, 'div', 'notice success', 'Kartu sudah dibuka. Simpan peranmu sebagai rahasia.');
  }
  appendPhaseCountdown(parent, 'TENGAH MALAM DIMULAI DALAM', roomState.room.roleDrawEndsAt);
}

function renderNightMath(parent, title = 'Perhitungan malam') {
  const prompt = roomState.self?.villagerPrompt;
  addText(parent, 'h3', '', title);
  if (!prompt || !Array.isArray(prompt.options) || prompt.options.length !== 4) {
    addText(parent, 'div', 'notice warning', 'Soal perhitungan belum tersedia. Tunggu sinkronisasi room.');
    return;
  }
  addText(parent, 'p', 'hint', 'Jawab satu soal untuk menyelesaikan giliran malam. Hasil jawaban tidak mengubah role atau voting.');
  addText(parent, 'div', 'villager-math-question', prompt.question + ' = ?');
  const answers = node('div', 'action-grid villager-math-options');
  prompt.options.forEach((value, index) => {
    const selected = roomState.self?.nightActionType === 'villager_math'
      && roomState.self?.nightActionChoiceIndex === index;
    answers.append(button(String.fromCharCode(65 + index) + ' · ' + value,
      'action-button' + (selected ? ' selected' : ''), () =>
        sendAction('night_action', { mode: 'villager_math', promptId: prompt.id, choiceIndex: index })
    ));
  });
  parent.append(answers);
}

function renderMasonCircle(parent) {
  if (roomState.self?.role !== 'mason' || !roomState.self.alive) return;
  const names = Array.isArray(roomState.self.masonNames) ? roomState.self.masonNames : [];
  const panel = node('section', 'mason-circle-panel');
  addText(panel, 'b', '', 'LINGKARAN MASON');
  addText(panel, 'p', '', names.length
    ? 'Sesama Mason yang masih hidup: ' + names.join(', ')
    : 'Kamu satu-satunya Mason yang masih hidup.');
  parent.append(panel);
}

function renderPlayerNight(parent) {
  const self = roomState.self || {};
  const room = roomState.room || {};
  phaseHeader(parent, 'TENGAH MALAM · RONDE ' + room.round, 'Aksi malam',
    'Gunakan kemampuan role atau jawab perhitungan sebelum timer habis.');
  appendPhaseCountdown(parent, 'SUBUH DALAM', room.nightEndsAt);
  if (!self.alive) {
    addText(parent, 'div', 'notice warning', 'Kamu sudah tereliminasi. Menunggu hasil malam.');
    return;
  }
  if (!self.role) {
    addText(parent, 'div', 'notice warning', 'Kartu belum dibuka. Hubungi moderator.');
    return;
  }
  if (Number(room.nightEndsAt) > 0 && Date.now() >= Number(room.nightEndsAt)) {
    addText(parent, 'div', 'notice', 'Waktu aksi tengah malam berakhir. Pilihan sedang dikunci untuk diproses.');
    return;
  }
  if (['wolf', 'alpha_wolf', 'wolf_seer'].includes(self.role)) {
    renderWolfNightRoom(parent);
    addText(parent, 'h3', '', 'Pilih target serangan');
    addText(parent, 'p', 'hint', 'Pilihan kawanan diperbarui realtime. Kamu dapat mengganti target kapan saja sebelum tengah malam berakhir.');
    const teamNames = new Set(roomState.wolfTeam || []);
    const wolfTargets = (roomState.targets || []).filter(target => target.id !== self.id && !teamNames.has(target.name));
    const wolfGrid = node('div', 'action-grid');
    for (const target of wolfTargets) {
      wolfGrid.append(button('Serang · ' + target.name,
        'action-button' + (self.nightActionTargetId === target.id ? ' selected' : ''),
        () => sendAction('night_action', {
          targetId: target.id,
          ...(self.role === 'wolf_seer' && self.wolfSeerInspectTargetId
            ? { inspectTargetId: self.wolfSeerInspectTargetId } : {})
        })));
    }
    if (!wolfTargets.length) addText(parent, 'div', 'notice warning', 'Tidak ada target serangan yang tersedia.');
    else parent.append(wolfGrid);
    if (self.role === 'wolf_seer' && abilityOn('wolfSeerInspection')) {
      const inspectedIds = new Set((self.seerHistory || []).map(item => item.targetId));
      const inspectTargets = (roomState.targets || []).filter(target =>
        target.id !== self.id && !inspectedIds.has(target.id));
      addText(parent, 'h3', '', 'Intai role pemain');
      addText(parent, 'p', 'hint', 'Pilih satu pemain untuk mengetahui role aslinya. Hasil hanya terlihat oleh Wolf Seer. Pilihan dapat diganti sampai tengah malam berakhir.');
      const inspectGrid = node('div', 'action-grid');
      for (const target of inspectTargets) {
        inspectGrid.append(button('Intai · ' + target.name,
          'action-button' + (self.wolfSeerInspectTargetId === target.id ? ' selected' : ''),
          () => sendAction('night_action', {
            ...(self.nightActionTargetId ? { targetId: self.nightActionTargetId } : {}),
            inspectTargetId: target.id
          })));
      }
      if (!inspectTargets.length) addText(parent, 'div', 'notice', 'Semua pemain hidup sudah pernah kamu intai.');
      else parent.append(inspectGrid);
    }
    return;
  }

  if (self.nightActionMode === 'math') {
    renderNightMath(parent);
    return;
  }

  const inspectedIds = new Set((self.seerHistory || []).map(item => item.targetId));
  const targets = (roomState.targets || []).filter(target => {
    if (target.id === self.id && !['doctor', 'priest'].includes(self.role)) return false;
    if (['seer', 'detective'].includes(self.role) && inspectedIds.has(target.id)) return false;
    return true;
  });

  if (['seer', 'detective', 'doctor', 'bodyguard', 'guardian_angel', 'priest', 'vigilante', 'trapper'].includes(self.role)) {
    const titles = {
      seer: 'Periksa identitas', detective: 'Periksa kubu', doctor: 'Lindungi pemain',
      bodyguard: 'Jaga pemain',
      guardian_angel: abilityOn('guardianProtection') ? 'Pilih target perlindungan' : 'Pilih target kemenangan tambahan',
      priest: 'Gunakan berkah perlindungan', vigilante: 'Gunakan tembakan',
      trapper: 'Pasang perangkap'
    };
    addText(parent, 'h3', '', titles[self.role]);
    addText(parent, 'p', 'hint', self.role === 'seer' || self.role === 'detective'
      ? 'Pemain yang sudah diperiksa akan diberi tanda. Pilih nama yang belum pernah kamu periksa.'
      : 'Pilih satu nama. Pilihan masih dapat diganti sampai timer tengah malam berakhir.');
    const actionVerb = self.role === 'seer' || self.role === 'detective' ? 'Periksa'
      : self.role === 'doctor' || self.role === 'priest' ? 'Lindungi'
        : self.role === 'bodyguard' ? 'Jaga'
          : self.role === 'vigilante' ? 'Tembak'
            : self.role === 'trapper' ? 'Perangkap' : 'Pilih';
    const grid = node('div', 'action-grid');
    for (const target of targets) {
      grid.append(button(actionVerb + ' · ' + target.name,
        'action-button' + (self.nightActionTargetId === target.id ? ' selected' : ''),
        () => sendAction('night_action', { targetId: target.id })));
    }
    if (!targets.length) addText(parent, 'div', 'notice', 'Tidak ada target baru yang dapat diperiksa.');
    else parent.append(grid);
    if (self.role === 'guardian_angel' && self.guardianTargetName) addText(parent, 'p', 'hint', 'Target pilihan terakhir: ' + self.guardianTargetName);
    if (['priest', 'vigilante'].includes(self.role) && self.villagerPrompt) {
      renderNightMath(parent, 'Simpan kemampuan · jawab perhitungan');
    }
  } else if (self.role === 'witch') {
    const potions = self.witchPotions || { heal: false, poison: false };
    const attack = self.witchAttack || { ready: false, targetName: null, tied: false };
    addText(parent, 'h3', '', 'Pilih ramuan');
    if (!attack.ready) {
      addText(parent, 'div', 'notice', 'Menunggu pilihan kawanan. Target serangan hanya terlihat oleh Witch.');
    } else if (attack.targetName) {
      addText(parent, 'div', 'notice warning', 'Target serangan Werewolf: ' + attack.targetName + '. Kamu dapat menyelamatkannya jika ramuan tersedia.');
    } else {
      addText(parent, 'div', 'notice', attack.tied ? 'Suara kawanan seri. Tidak ada target untuk diselamatkan.' : 'Tidak ada target serangan Werewolf yang dapat diselamatkan.');
    }
    if (potions.heal) {
      const heal = button('Gunakan ramuan penyembuh', 'secondary wide phase-timed-action',
        () => sendAction('night_action', { mode: 'heal' }), !attack.ready || !attack.targetName);
      heal.classList.toggle('selected', self.nightActionType === 'witch_heal');
      parent.append(heal);
    }
    if (potions.poison) {
      addText(parent, 'p', 'hint', 'Pilih satu target untuk mengirim ramuan racun:');
      const grid = node('div', 'action-grid');
      for (const target of targets) {
        grid.append(button('Racun · ' + target.name,
          'action-button' + (self.nightActionType === 'witch_poison' && self.nightActionTargetId === target.id ? ' selected' : ''),
          () => sendAction('night_action', { targetId: target.id, mode: 'poison' })));
      }
      parent.append(grid);
    }
    if (self.villagerPrompt) renderNightMath(parent, 'Tidak memakai ramuan · jawab perhitungan');
  } else if (self.role === 'cupid' && room.round === 1) {
    addText(parent, 'h3', '', 'Hubungkan dua pemain');
    addText(parent, 'p', 'hint', 'Pilih dua nama berbeda. Ikatan tersimpan otomatis dan masih dapat diubah sampai tengah malam berakhir.');
    const draftKey = room.code + ':' + room.round;
    if (!cupidDraft || cupidDraft.key !== draftKey) {
      cupidDraft = {
        key: draftKey,
        firstId: self.nightActionTargetId || '',
        secondId: self.nightActionPartnerId || '',
        savedPair: self.nightActionTargetId && self.nightActionPartnerId
          ? self.nightActionTargetId + ':' + self.nightActionPartnerId : ''
      };
    }
    let { firstId, secondId } = cupidDraft;
    const summary = node('div', 'cupid-selection-summary');
    const grid = node('div', 'action-grid');
    const refreshChoices = () => {
      cupidDraft.firstId = firstId;
      cupidDraft.secondId = secondId;
      const first = targets.find(item => item.id === firstId);
      const second = targets.find(item => item.id === secondId);
      summary.textContent = 'Pemain 1: ' + (first?.name || 'belum dipilih')
        + ' · Pemain 2: ' + (second?.name || 'belum dipilih');
      grid.replaceChildren();
      for (const target of targets) {
        const index = target.id === firstId ? '1' : target.id === secondId ? '2' : '';
        grid.append(button((index ? index + ' · ' : '') + target.name,
          index ? 'action-button selected' : 'action-button', () => {
            if (target.id === firstId) firstId = '';
            else if (target.id === secondId) secondId = '';
            else if (!firstId) firstId = target.id;
            else if (!secondId) secondId = target.id;
            else { firstId = secondId; secondId = target.id; }
            refreshChoices();
          }));
      }
      const complete = Boolean(firstId && secondId && firstId !== secondId);
      const pairKey = complete ? firstId + ':' + secondId : '';
      if (complete && pairKey !== cupidDraft.savedPair) {
        cupidDraft.savedPair = pairKey;
        sendAction('night_action', { targetId: firstId, partnerId: secondId });
      } else if (!complete && cupidDraft.savedPair) {
        cupidDraft.savedPair = '';
        sendAction('night_action', { mode: 'cupid_clear' });
      }
    };
    parent.append(summary, grid);
    refreshChoices();
  }
}

function renderPlayerDiscussion(parent) {
  renderPublicResult(parent);
  addText(parent, 'div', 'notice success',
    'Voice chat mengikuti pilihan saat bergabung: Online berbicara dengan mikrofon aktif, Offline mendengarkan tanpa mengaktifkan mikrofon.');
  appendPhaseCountdown(parent, 'DISKUSI TERSISA', roomState.room.discussionEndsAt);
}

function renderDiscussionTools(parent) {
  const self = roomState.self || {};
  const phase = roomState.room.phase;
  const voiceListen = discussionVoiceListeningAllowed();
  const onlineMode = discussionVoiceAllowed();
  const canSpeak = !self.isWaiting && !self.isBotControlled
    && Boolean(self.isModerator || self.alive || phase === 'lobby' || phase === 'finished');
  const section = node('section', 'discussion-tools');
  const chat = node('section', 'discussion-chat-panel');
  const heading = node('div', 'discussion-chat-heading');
  addText(heading, 'div', 'eyebrow-small', 'CHAT DISKUSI');
  if (voiceListen) {
    const voiceMeta = node('div', 'chat-voice-meta');
    const statusText = self.voiceMode === 'offline'
      ? 'Offline · mikrofon mati, tetap mendengar'
      : voiceStatus;
    const status = addText(voiceMeta, 'span', 'voice-status', statusText);
    status.id = 'voiceStatus';
    const count = addText(voiceMeta, 'span', 'voice-peer-count', '0 pemain terhubung');
    count.id = 'voicePeerCount';
    addText(voiceMeta, 'small', 'voice-feedback-note',
      'Jika beberapa pemain satu ruangan, gunakan headset. Peredam gema aktif otomatis.');
    heading.append(voiceMeta);
  } else {
    addText(heading, 'span', 'chat-mode-note', 'Voice tidak aktif');
  }
  chat.append(heading);

  const list = node('div', 'chat-list discussion-chat-list');
  list.id = 'discussionChatList';
  list.setAttribute('role', 'log');
  list.setAttribute('aria-live', 'polite');
  const messages = Array.isArray(roomState.chat) ? roomState.chat : [];
  if (!messages.length) addText(list, 'p', 'hint', 'Belum ada pesan. Gunakan chat untuk berdiskusi dengan pemain lain.');
  for (const message of messages) {
    const item = node('article', 'chat-message');
    const author = node('b', '', message.name || 'Pemain');
    if (message.isBot) {
      author.append(node('span', 'chat-bot-badge', 'BOT'));
      if (message.isNightReport) author.append(node('span', 'chat-night-report-badge', 'AKSI MALAM'));
    } else if (message.isModerator) author.append(node('span', 'chat-bot-badge moderator-chat-badge', 'MOD'));
    item.append(author);
    item.append(node('time', '', message.at
      ? new Date(message.at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : ''));
    item.append(node('p', '', message.text || ''));
    list.append(item);
  }
  chat.append(list);
  if (canSpeak) {
    const form = node('form', 'chat-form discussion-chat-form');
    form.id = 'discussionChatForm';
    const input = node('input');
    input.id = 'discussionChatInput';
    input.type = 'text';
    input.maxLength = 280;
    input.autocomplete = 'off';
    input.placeholder = 'Tulis pesan…';
    input.setAttribute('aria-label', 'Pesan chat room');

    const actions = node('div', 'discussion-chat-actions');
    if (onlineMode) {
      const mic = button(
        voiceLocalStream ? (voiceMuted ? 'Mic Mati' : 'Mic Aktif') : 'Mic',
        'secondary voice-inline-control', toggleVoiceMic, Boolean(voiceStartPromise)
      );
      mic.id = 'voiceMicToggle';
      mic.setAttribute('aria-label', voiceLocalStream
        ? (voiceMuted ? 'Nyalakan mikrofon' : 'Matikan mikrofon') : 'Aktifkan mikrofon');
      actions.append(mic);
    }
    if (voiceListen) {
      const audio = button('Audio', 'secondary voice-inline-control', unlockRemoteAudio, !voiceNeedsAudioGesture);
      audio.id = 'voiceAudioUnlock';
      audio.setAttribute('aria-label', 'Aktifkan audio pemain lain');
      if (!voiceNeedsAudioGesture) audio.classList.add('hidden');
      actions.append(audio);
    }

    const submit = node('button', 'primary', 'Kirim');
    submit.type = 'submit';
    actions.append(submit);
    if (phase !== 'lobby') {
      const repeat = button('Narasi ↻', 'secondary repeat-narration-button', () => {
        const narration = systemNarrationText(roomState.room);
        if (narration) speakSystemNarration(narration);
      });
      repeat.setAttribute('aria-label', 'Ulangi narasi desa');
      repeat.title = 'Ulangi narasi desa';
      actions.append(repeat);
    }
    form.append(input, actions);
    form.addEventListener('submit', async event => {
      event.preventDefault();
      const text = input.value.trim();
      if (!text) return;
      const sent = await sendAction('send_discussion_chat', { text });
      if (sent) {
        const current = $('discussionChatInput');
        if (current) { current.value = ''; current.focus(); }
      }
    });
    chat.append(form);
  } else {
    addText(chat, 'p', 'hint', self.isWaiting
      ? 'Chat dan voice permainan tersedia setelah kamu masuk pada ronde berikutnya.'
      : self.isBotControlled
        ? 'Chat dinonaktifkan selama BOT mengambil alih.'
        : 'Kamu sudah tereliminasi. Chat hanya dapat dibaca sampai permainan selesai.');
  }
  section.append(chat);
  parent.append(section);
  list.scrollTop = list.scrollHeight;
  if (voiceListen) refreshVoiceUI();
}

function renderPrivateInspectionResult(parent) {
  const self = roomState.self || {};
  const history = Array.isArray(self.seerHistory) ? self.seerHistory : [];
  if (!['seer', 'detective', 'wolf_seer'].includes(self.role) || !history.length) return;
  const panel = node('section', 'private-inspection-panel');
  addText(panel, 'div', 'eyebrow-small', self.role === 'wolf_seer' ? 'INTEL KAWANAN · RAHASIA' : 'HASIL PENERAWANGAN PRIBADI');
  for (const result of history.slice().sort((a, b) => a.round - b.round)) {
    const isWolf = result.result === 'wolf' || result.result === 'wolf_team'
      || result.targetFaction === 'wolves';
    const isNeutral = result.result === 'neutral' || result.targetFaction === 'neutral';
    const faction = self.role === 'detective'
      ? (isWolf ? 'Kubu Werewolf' : isNeutral ? 'Kubu Netral' : 'Kubu Desa')
      : self.role === 'wolf_seer'
        ? (result.targetRole ? roleLabel(result.targetRole) : isWolf ? 'Werewolf' : 'Bukan Werewolf')
        : (result.targetRole ? roleLabel(result.targetRole) : isWolf ? 'Werewolf' : 'Bukan Werewolf');
    const row = node('div', 'private-inspection-item ' + (isWolf ? 'seer-result-wolf' : isNeutral ? 'seer-result-neutral' : 'seer-result-safe'));
    addText(row, 'span', 'private-inspection-round', 'R' + result.round);
    addText(row, 'b', '', result.playerName || 'Pemain');
    addText(row, 'span', 'private-inspection-result', faction);
    panel.append(row);
  }
  addText(panel, 'p', 'hint', self.role === 'wolf_seer'
    ? 'Informasi role ini hanya terlihat oleh Wolf Seer. Gunakan untuk koordinasi kawanan.'
    : 'Pemain yang sudah diperiksa diberi tanda pada daftar pemain hidup. Hasil ini hanya terlihat olehmu.');
  parent.append(panel);
}

function renderSystemModeratorMorning(parent) {
  const round = Number(roomState.room.round) || 1;
  phaseHeader(parent, 'PAGI HARI · RONDE ' + round, 'Hasil kejadian malam',
    'Hasil malam diumumkan kepada seluruh pemain. Diskusi berlangsung sebelum voting otomatis dimulai.');
  const result = roomState.room.publicResult;
  renderPublicResult(parent);
  const card = node('div', 'result-card');
  addText(card, 'h3', '', result?.message || 'Malam telah berlalu.');
  parent.append(card);
  addText(parent, 'div', roomState.self.status === 'eliminated' ? 'notice warning' : 'notice success',
    roomState.self.status === 'eliminated' ? 'Kamu tereliminasi.' : 'Kamu bertahan.');
  renderPrivateInspectionResult(parent);
  appendPhaseCountdown(parent, 'DISKUSI TERSISA', roomState.room.discussionEndsAt);
}

function renderSystemModeratorVoteResult(parent) {
  phaseHeader(parent, 'HASIL SORE', 'Keputusan warga diumumkan',
    'Suara telah ditutup. Jika Hunter gugur, ia masih punya kesempatan menentukan satu tembakan sebelum malam berikutnya.');
  const result = roomState.room.publicResult;
  renderPublicResult(parent);
  const card = node('div', 'result-card');
  addText(card, 'h3', '', result?.message || 'Hasil voting tersedia.');
  parent.append(card);
  addText(parent, 'div', roomState.self.alive ? 'notice success' : 'notice warning',
    roomState.self.alive ? 'Kamu bertahan.' : 'Kamu tereliminasi.');
  if (roomState.self.role === 'hunter' && !roomState.self.alive && !roomState.room.resultResolved) renderHunterShot(parent);
  appendPhaseCountdown(parent, 'MALAM BERIKUTNYA DALAM', roomState.room.resultEndsAt);
}

function renderPlayerDawn(parent) {
  const self = roomState.self || {};
  const room = roomState.room || {};
  phaseHeader(parent, 'SUBUH · RONDE ' + room.round, 'Fajar belum sepenuhnya tiba',
    'Sebelum warga berkumpul, beberapa kemampuan terakhir masih dapat mengubah nasib korban malam.');
  appendPhaseCountdown(parent, 'PAGI TIBA DALAM', room.dawnEndsAt);
  if (Number(room.dawnEndsAt) > 0 && Date.now() >= Number(room.dawnEndsAt)) {
    addText(parent, 'div', 'notice', 'Waktu subuh berakhir. Semua aksi pemicu sedang diproses.');
    return;
  }
  if (self.role === 'hunter' && !self.alive && !self.hunterUsed) {
    addText(parent, 'div', 'notice warning', 'Kamu gugur saat malam. Sebelum pergi, kamu masih dapat melepaskan satu tembakan.');
    const grid = node('div', 'action-grid');
    for (const target of roomState.targets || []) {
      grid.append(button('Tembak · ' + target.name,
        'action-button' + (self.dawnActionTargetId === target.id ? ' selected' : ''),
        () => sendAction('dawn_action', { targetId: target.id })));
    }
    parent.append(grid);
    return;
  }
  if (self.role === 'reviver' && self.alive && !self.reviverUsed && abilityOn('reviverOnce')) {
    const targets = roomState.reviveTargets || [];
    addText(parent, 'h3', '', 'Pilih satu korban untuk dibangkitkan');
    addText(parent, 'p', 'hint', 'Hanya korban yang gugur pada malam ini yang dapat dihidupkan kembali. Kemampuan hanya dapat digunakan sekali.');
    const grid = node('div', 'action-grid');
    for (const target of targets) {
      grid.append(button('Bangkitkan · ' + target.name,
        'action-button' + (self.dawnActionTargetId === target.id ? ' selected' : ''),
        () => sendAction('dawn_action', { targetId: target.id })));
    }
    if (!targets.length) addText(parent, 'div', 'notice', 'Tidak ada korban malam yang dapat dibangkitkan.');
    else parent.append(grid);
    return;
  }
  if (self.role === 'reviver' && self.reviverUsed) {
    addText(parent, 'div', 'notice', 'Kemampuan Reviver sudah digunakan pada ronde sebelumnya.');
  } else if (self.alive) {
    addText(parent, 'div', 'notice success', 'Kamu tidak memiliki aksi pemicu saat subuh. Tunggu warga berkumpul di pagi hari.');
  } else {
    addText(parent, 'div', 'notice warning', 'Kamu telah gugur. Menunggu pengumuman pagi.');
  }
}

function renderPlayerMorning(parent) {
  phaseHeader(parent, 'PAGI · RONDE ' + roomState.room.round,
    'Warga berkumpul di alun-alun', 'Lihat siapa yang gugur, kumpulkan petunjuk, lalu tentukan siapa yang akan dibawa ke tiang eksekusi sore nanti.');
  renderPublicResult(parent);
  addText(parent, 'div', roomState.self.status === 'eliminated' ? 'notice warning' : 'notice success',
    roomState.self.status === 'eliminated' ? 'Kamu telah gugur. Kamu masih dapat menyimak diskusi.' : 'Kamu masih bertahan. Sampaikan kecurigaanmu.');
  addText(parent, 'div', 'notice success', 'Diskusi pagi sedang berlangsung. Pilihan voting akan dibuka setelah hitung mundur selesai.');
  appendPhaseCountdown(parent, 'SORE TIBA DALAM', roomState.room.discussionEndsAt);
}

function renderHunterShot(parent) {
  if (!abilityOn('hunterShot')) {
    addText(parent, 'div', 'notice', 'Kemampuan tembakan Hunter dinonaktifkan oleh moderator.');
    return;
  }
  if (roomState.self.hunterUsed || roomState.room.resultResolved) {
    addText(parent, 'div', 'notice', 'Waktu tembakan Hunter telah ditutup.');
    return;
  }
  addText(parent, 'h3', '', 'Kesempatan terakhir Hunter');
  addText(parent, 'p', 'hint', 'Pilih pemain hidup untuk ditembak. Ketuk nama lain untuk mengganti pilihan sebelum timer berakhir.');
  const grid = node('div', 'action-grid');
  for (const target of roomState.targets || []) {
    grid.append(button('Tembak · ' + target.name,
      'action-button phase-timed-action' + (roomState.self.resultActionTargetId === target.id ? ' selected' : ''),
      () => sendAction('hunter_shot', { targetId: target.id })
    ));
  }
  parent.append(grid);
}

function factionForRole(role) {
  if (role === 'moderator') return 'moderator';
  if (['wolf', 'alpha_wolf', 'wolf_seer'].includes(role)) return 'wolves';
  if (role === 'guardian_angel') return 'neutral';
  return 'village';
}

function factionLabel(faction) {
  return ({
    wolves: 'KUBU WEREWOLF',
    village: 'PENDUDUK DESA',
    neutral: 'KUBU NETRAL',
    moderator: 'PENGATUR PERMAINAN'
  })[faction] || 'KUBU TIDAK DIKETAHUI';
}

function renderReplayEvents(parent, events, truncated = 0) {
  const items = Array.isArray(events) ? events : [];
  if (truncated > 0) addText(parent, 'p', 'replay-truncated-note',
    truncated + ' kejadian paling lama tidak ditampilkan agar replay tetap ringan.');
  const timeline = node('div', 'replay-timeline');
  for (const event of items) {
    const card = node('article', 'replay-event');
    const heading = node('div', 'replay-event-heading');
    addText(heading, 'span', 'replay-event-round', event.round ? 'RONDE ' + event.round : 'AWAL GAME');
    addText(heading, 'b', 'replay-event-title', event.title || 'Peristiwa permainan');
    if (event.at) addText(heading, 'time', 'replay-event-time',
      new Date(event.at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }));
    card.append(heading);
    if (event.message) addText(card, 'p', 'replay-event-message', event.message);
    if (Array.isArray(event.events) && event.events.length) {
      const notes = node('ul', 'replay-event-notes');
      for (const note of event.events) addText(notes, 'li', '', note);
      card.append(notes);
      if ((event.eventsTotal || 0) > event.events.length) addText(card, 'p', 'replay-truncated-note',
        'Menampilkan ' + event.events.length + ' dari ' + event.eventsTotal + ' catatan.');
    }
    if (Array.isArray(event.eliminations) && event.eliminations.length) {
      const deaths = node('div', 'replay-eliminations');
      for (const item of event.eliminations) {
        const line = node('div', 'replay-elimination');
        addText(line, 'b', '', item.name || 'Pemain');
        addText(line, 'span', '', roleLabel(item.role) + ' · ' + eliminationCauseLabel(item.cause));
        deaths.append(line);
      }
      card.append(deaths);
    }
    if (Array.isArray(event.voteTally) && event.voteTally.length) {
      const tally = node('div', 'replay-vote-tally');
      addText(tally, 'b', 'replay-subheading', 'Perolehan suara');
      for (const item of event.voteTally) {
        const line = node('div', 'replay-vote-row');
        addText(line, 'span', '', item.name);
        addText(line, 'b', '', String(item.votes) + ' suara');
        tally.append(line);
      }
      card.append(tally);
      if ((event.voteTallyTotal || 0) > event.voteTally.length) addText(card, 'p', 'replay-truncated-note',
        'Menampilkan ' + event.voteTally.length + ' dari ' + event.voteTallyTotal + ' target.');
    }
    if (Array.isArray(event.actionReport) && event.actionReport.length) {
      const details = node('details', 'replay-action-details');
      addText(details, 'summary', '', 'Lihat ' + event.actionReport.length + ' rincian aksi');
      const report = node('div', 'replay-action-list');
      for (const action of event.actionReport) {
        const row = node('article', 'replay-action-item');
        addText(row, 'b', 'replay-action-role', [action.role, action.actor].filter(Boolean).join(' · '));
        addText(row, 'span', 'replay-action-action', action.action || 'Aksi tidak tercatat.');
        addText(row, 'span', 'replay-action-outcome', action.outcome || 'Hasil tidak tercatat.');
        report.append(row);
      }
      if ((event.actionReportTotal || 0) > event.actionReport.length) addText(report, 'p', 'replay-truncated-note',
        'Menampilkan ' + event.actionReport.length + ' dari ' + event.actionReportTotal + ' aksi.');
      details.append(report);
      card.append(details);
    }
    timeline.append(card);
  }
  parent.append(timeline);
}

function renderReplayTimeline(parent, events, title = 'Replay permainan', truncated = 0) {
  if (!Array.isArray(events) || !events.length) return;
  const details = node('details', 'replay-panel');
  const summary = node('summary', 'replay-summary');
  addText(summary, 'b', '', title);
  addText(summary, 'span', '', events.length + ' kejadian');
  details.append(summary);
  renderReplayEvents(details, events, truncated);
  parent.append(details);
}

function renderReplayArchive(parent) {
  const archives = Array.isArray(roomState.room.gameArchive) ? roomState.room.gameArchive : [];
  if (!archives.length) return;
  const section = node('section', 'replay-archive');
  addText(section, 'div', 'eyebrow-small', 'ARSIP PERMAINAN');
  addText(section, 'h3', '', 'Replay sebelumnya');
  for (const archive of archives) {
    const details = node('details', 'replay-archive-item');
    const summary = node('summary', 'replay-archive-summary');
    const meta = node('span', 'replay-archive-meta');
    addText(meta, 'b', '', winnerLabel(archive.winner));
    addText(meta, 'span', '', (archive.round || 0) + ' ronde · ' + (archive.events?.length || 0) + ' kejadian');
    addText(summary, 'span', 'replay-archive-date',
      archive.completedAt ? new Date(archive.completedAt).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }) : 'Riwayat permainan');
    summary.append(meta);
    details.append(summary);
    const roster = node('div', 'replay-archive-roster');
    addText(roster, 'b', 'replay-subheading', 'Daftar role');
    for (const player of archive.players || []) {
      const row = node('div', 'replay-archive-player faction-' + (player.faction || 'neutral'));
      addText(row, 'span', '', player.name);
      addText(row, 'span', '', roleLabel(player.role) + (player.isWinner ? ' · Menang' : ''));
      roster.append(row);
    }
    details.append(roster);
    renderReplayEvents(details, archive.events, archive.truncated);
    section.append(details);
  }
  parent.append(section);
}

function winnerLabel(winner) {
  return ({
    wolves: 'KUBU WEREWOLF MENANG',
    villagers: 'KUBU DESA MENANG',
    jester: 'PENDUDUK ANEH MENANG SENDIRI',
    lovers: 'PASANGAN LOVERS MENANG'
  })[winner] || 'PERMAINAN SELESAI';
}

function renderVictoryScreen(parent, moderatorView = false) {
  const room = roomState.room;
  const theme = room.winner === 'wolves' ? 'wolves'
    : ['villagers', 'jester'].includes(room.winner) ? 'village' : 'neutral';
  const screen = node('section', 'victory-screen victory-' + theme);
  const confetti = node('div', 'victory-confetti');
  confetti.setAttribute('aria-hidden', 'true');
  screen.append(confetti);
  addText(screen, 'div', 'victory-kicker', '✦ HASIL AKHIR PERMAINAN ✦');
  addText(screen, 'div', 'victory-trophy', '🏆');
  addText(screen, 'h2', 'victory-title', winnerLabel(room.winner));
  addText(screen, 'p', 'victory-subtitle', 'Permainan telah berakhir. Seluruh pemain dapat melihat pemenang dan hasil akhir.');
  const finalPlayers = Array.isArray(room.finalPlayers) ? room.finalPlayers : [];
  const winners = finalPlayers.filter(player => player.isWinner);
  const mainWinners = winners.filter(player => player.winReason === 'Pemenang utama');
  const bonusWinners = winners.filter(player => player.winReason === 'Pemenang bonus Guardian Angel');
  if (mainWinners.length) {
    const winnerBox = node('div', 'victory-winner-box');
    addText(winnerBox, 'div', 'victory-winner-label', room.winner === 'lovers' ? 'PASANGAN PEMENANG' : 'PEMENANG UTAMA');
    addText(winnerBox, 'div', 'victory-winner-names', mainWinners.map(player => player.name).join(' · '));
    screen.append(winnerBox);
  }
  if (bonusWinners.length) {
    const bonus = node('div', 'victory-bonus-box');
    addText(bonus, 'b', '', 'Kemenangan bonus Guardian Angel');
    addText(bonus, 'p', '', bonusWinners.map(player => player.name).join(' · '));
    screen.append(bonus);
  }
  if (room.lovers?.length === 2 && room.winner !== 'lovers') {
    addText(screen, 'p', 'victory-special-note', 'Pasangan Cupid: ' + room.lovers.join(' & '));
  }
  if (room.publicResult) renderPublicResult(screen);
  renderPrivateInspectionResult(screen);
  if (moderatorView && room.lastResult) renderModeratorEventReport(screen, room.lastResult);

  const roster = node('section', 'final-roster');
  addText(roster, 'div', 'final-roster-heading', 'DAFTAR PEMAIN DAN ROLE');
  const ordered = [...finalPlayers].sort((a, b) => Number(b.isWinner) - Number(a.isWinner));
  for (const player of ordered) {
    const faction = player.faction || factionForRole(player.role);
    const row = node('article', 'final-player-card faction-' + faction + (player.isWinner ? ' is-winner' : ''));
    const main = node('div', 'final-player-main');
    addText(main, 'b', 'final-player-name', player.name);
    addText(main, 'span', 'final-faction-label', factionLabel(faction));
    const detail = node('div', 'final-player-detail');
    addText(detail, 'span', 'final-player-role', roleLabel(player.role));
    addText(detail, 'span', player.isWinner ? 'final-player-status winner-status' : 'final-player-status',
      player.winReason || (player.alive ? 'Bertahan' : 'Tereliminasi'));
    row.append(main, detail);
    roster.append(row);
  }
  screen.append(roster);
  renderReplayTimeline(screen, room.gameHistory, 'Replay permainan', room.gameHistoryTruncated);
  parent.append(screen);

  const canRestart = moderatorView || (systemModeratorEnabled() && isHost());
  if (canRestart) {
    parent.append(button('Main Lagi · Kembali ke Ruang Tunggu', 'primary wide', async () => {
      const accepted = await askConfirmation({
        title: 'Mulai permainan baru?',
        message: 'Semua pemain kembali ke ruang tunggu. Daftar pemain dan kode room tetap dipertahankan.',
        confirmLabel: 'Mulai lagi'
      });
      if (accepted) sendAction('reset_to_lobby');
    }));
  }
}


function narrationChoice(room, lines) {
  const key = [room.code, room.round, room.phase, room.lastResult?.at || room.publicResult?.at || ''].join('|');
  let hash = 0;
  for (let index = 0; index < key.length; index += 1) hash = (hash * 31 + key.charCodeAt(index)) >>> 0;
  return lines[hash % lines.length];
}

function systemNarrationText(room) {
  const village = room.villageName || 'Desa Waringin';
  const result = room.lastResult || room.publicResult || {};
  const victims = Array.isArray(result.eliminations) ? result.eliminations
    : Array.isArray(result.eliminatedPlayers) ? result.eliminatedPlayers : [];
  const victimNames = victims.map(item => item.name || item.playerName).filter(Boolean);
  const biteVictim = victims.find(item => item.cause === 'werewolf_attack' || item.cause === 'Serangan Werewolf');
  const shotVictim = victims.find(item => ['hunter', 'vigilante_shot'].includes(item.cause) || item.cause === 'Tembakan');
  const poisonVictim = victims.find(item => item.cause === 'witch_poison' || item.cause === 'Racun');
  const describeVictim = item => {
    const name = String(item.name || item.playerName || 'Seorang warga');
    const cause = String(item.cause || '');
    if (cause === 'werewolf_attack' || cause === 'Serangan Werewolf') {
      return name + ' ditemukan dengan bekas gigitan di leher. Jejak kaki besar menghilang ke arah hutan.';
    }
    if (['hunter', 'vigilante_shot', 'Tembakan'].includes(cause)) {
      return name + ' ditemukan dengan luka tembak. Selongsong peluru masih tergeletak di tanah.';
    }
    if (cause === 'witch_poison' || cause === 'Racun') {
      return name + ' tergeletak di dekat gelas pecah dan botol kecil. Racun telah bekerja sebelum fajar.';
    }
    if (cause === 'bodyguard_sacrifice') {
      return name + ' ditemukan gugur setelah berdiri menghadang serangan demi melindungi orang lain.';
    }
    if (cause === 'cupid_bond') {
      return name + ' ikut gugur karena ikatan cinta yang menghubungkannya dengan korban lain.';
    }
    return name + ' ditemukan tak bernyawa. Malam menyimpan rahasia tentang bagaimana ia gugur.';
  };

  switch (room.phase) {
    case 'role_draw':
      return narrationChoice(room, [
        'Kita berada di ' + village + ', desa kecil yang selama ini hidup tenang. Namun malam ini, sesuatu mengintai di balik jendela. Kartu telah dibagikan. Jaga rahasiamu.',
        'Di antara hutan dan jalan berkabut, berdirilah ' + village + '. Malam panjang akan segera dimulai. Bukalah kartu kalian, dan jangan biarkan siapa pun membaca rahasiamu.',
        'Selamat datang di ' + village + '. Desa ini tampak damai, tetapi satu di antara kita menyimpan niat gelap. Takdir setiap warga kini berada di balik kartu.',
        'Di ujung jalan, lonceng tua berdentang menyambut kalian di ' + village + '. Mulai malam ini, jangan mudah percaya pada wajah yang paling dikenal.'
      ]);
    case 'night':
      return narrationChoice(room, [
        'Malam turun di ' + village + '. Lentera dipadamkan, pintu-pintu dikunci. Di balik gelap, beberapa langkah mulai terdengar.',
        'Kabut menelan jalanan ' + village + '. Warga memejamkan mata. Namun di luar sana, ada yang sedang memburu mangsanya.',
        'Tengah malam tiba. Angin melewati jendela dan anjing-anjing menggonggong dari kejauhan. Biarkan desa tertidur, sementara rahasia bergerak.',
        'Jam tua berdentang dua belas kali. Di ' + village + ', ada pintu yang terbuka perlahan dan langkah yang tak seharusnya terdengar.'
      ]);
    case 'dawn':
      return narrationChoice(room, [
        'Langit mulai memucat. Subuh datang, tetapi nasib mereka yang gugur belum sepenuhnya ditentukan. Masih ada satu kesempatan sebelum desa terbangun.',
        'Ayam jantan belum berkokok. Di antara gelap dan terang, keputusan terakhir masih bisa mengubah nasib seseorang.',
        'Cahaya pertama menyentuh atap rumah. Desa menahan napas; sebelum pagi tiba, masih ada urusan yang harus diselesaikan.',
        'Kabut tipis menggantung di atas sumur desa. Beberapa warga belum pulang, dan fajar membawa satu kesempatan terakhir.'
      ]);
    case 'morning': {
      if (!victimNames.length) return narrationChoice(room, [
        'Pagi menyingsing di ' + village + '. Pintu-pintu terbuka satu demi satu. Aneh, tak seorang pun ditemukan gugur. Namun desa belum tentu aman.',
        'Matahari muncul dari balik bukit. Tidak ada tubuh yang ditemukan pagi ini. Keheningan justru membuat warga semakin curiga.',
        'Pagi datang tanpa kabar duka. Untuk sesaat desa bernapas lega, tetapi ancaman masih bersembunyi di antara warga.'
      ]);
      if (victims.length > 1) {
        const details = victims.map(describeVictim).join(' Sementara itu, ');
        return 'Fajar menyingsing di ' + village + '. Pintu-pintu rumah terbuka, lalu warga menemukan lebih dari satu korban. '
          + details + ' Alun-alun mendadak sunyi; tak seorang pun tahu siapa yang masih dapat dipercaya.';
      }
      const name = victimNames[0];
      const detail = describeVictim(victims[0] || {});
      if (biteVictim) return 'Matahari baru saja terbit di ' + village + '. ' + detail + ' Warga saling berpandangan, menyadari bahwa pemburu itu masih berada di antara mereka.';
      if (shotVictim) return 'Suara tembakan semalam masih terngiang di telinga warga ' + village + '. ' + detail + ' Tak seorang pun berani mendekat.';
      if (poisonVictim) return 'Pagi ini, warga menemukan ' + name + ' di sudut rumah. ' + detail + ' Siapa yang membawa racun ke desa?';
      return 'Fajar menyibak kabut di ' + village + '. ' + detail + ' Tak ada yang tahu apa yang sebenarnya terjadi di balik gelap semalam.';
    }
    case 'discussion':
      return narrationChoice(room, [
        'Warga berkumpul di alun-alun ' + village + '. Setiap tatapan menyimpan kecurigaan. Dengarkan cerita mereka, sebelum waktu memilih habis.',
        'Kabar duka menyebar dari rumah ke rumah. Kini semua mata tertuju pada satu sama lain. Siapa yang menyembunyikan sesuatu?',
        'Di tengah alun-alun, suara warga saling bersahutan. Kebenaran harus ditemukan sebelum sore membawa keputusan.',
        'Tak ada yang berani berdiri terlalu dekat dengan siapa pun. Warga membentuk lingkaran di alun-alun, menunggu seseorang membuka suara.'
      ]);
    case 'voting':
      return narrationChoice(room, [
        'Sore tiba. Tiang eksekusi berdiri di tengah alun-alun. Warga harus menentukan satu nama sebelum matahari tenggelam.',
        'Bayangan mulai memanjang di jalan desa. Waktunya memilih. Satu suara dapat menyelamatkan, atau mengakhiri, sebuah nyawa.',
        'Perdebatan berhenti. Satu per satu suara dijatuhkan. Siapa yang akan dibawa ke tiang eksekusi sore ini?',
        'Matahari menyentuh garis pepohonan. Penjaga tiang eksekusi menunggu keputusan terakhir dari warga.'
      ]);
    case 'result': {
      const names = victimNames.length ? victimNames.join(' dan ') : '';
      return names
        ? 'Keputusan telah dijatuhkan. ' + names + ' dibawa ke tiang eksekusi. Warga menunggu apakah pilihan mereka menyelamatkan desa atau justru membuka jalan bagi kegelapan.'
        : narrationChoice(room, [
          'Suara telah dihitung, tetapi tak ada nama yang cukup kuat untuk dijatuhkan. Desa kembali menunggu malam.',
          'Perhitungan suara berakhir tanpa eksekusi. Ketegangan belum berakhir; malam berikutnya akan membawa jawaban.'
        ]);
    }
    case 'finished': {
      const ending = ({
        wolves: 'Kawanan Werewolf akhirnya menguasai desa.',
        villagers: 'Warga berhasil mengusir kegelapan dan menyelamatkan desa.',
        jester: 'Jester tertawa paling akhir. Seluruh desa telah masuk ke dalam jebakannya.',
        lovers: 'Dua hati bertahan melewati kekacauan dan memenangkan permainan.'
      })[room.winner] || 'Malam panjang akhirnya berakhir.';
      return 'Kisah ' + village + ' mencapai akhirnya. ' + ending;
    }
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
    utterance.rate = 0.9;
    utterance.pitch = 0.9;
    utterance.volume = 0.92;
    const voice = window.speechSynthesis.getVoices().find(item => /^id([_-]|$)/i.test(item.lang));
    if (voice) utterance.voice = voice;
    window.speechSynthesis.speak(utterance);
  } catch {}
}

function renderPlayerVoting(parent) {
  const self = roomState.self || {};
  const room = roomState.room || {};
  phaseHeader(parent, 'SORE · RONDE ' + room.round, 'Voting eksekusi',
    'Pilih pemain untuk eksekusi. Semua suara terlihat dan dapat diganti sampai timer habis.');
  appendPhaseCountdown(parent, 'VOTING TERSISA', room.votingEndsAt);
  if (!self.alive) {
    addText(parent, 'div', 'notice warning', 'Kamu sudah tereliminasi dan tidak dapat memberikan suara.');
    return;
  }
  if (Number(room.votingEndsAt) > 0 && Date.now() >= Number(room.votingEndsAt)) {
    addText(parent, 'div', 'notice', 'Waktu voting berakhir. Suara sedang dihitung.');
    return;
  }
  addText(parent, 'h3', '', 'Tentukan pilihanmu');
  addText(parent, 'p', 'hint', 'Voting terbuka: semua pemain dapat melihat siapa memilih siapa, siapa yang abstain, dan siapa yang belum memilih. Pilihan dapat diganti sampai timer habis.');
  parent.append(button('Abstain · Tidak memilih siapa pun',
    'secondary wide phase-timed-action' + (self.voteAbstain ? ' selected' : ''),
    () => sendAction('cast_vote', { abstain: true })));
  const grid = node('div', 'action-grid');
  for (const target of (roomState.targets || []).filter(item => item.id !== self.id)) {
    grid.append(button('Pilih · ' + target.name,
      'action-button' + (self.voteTargetId === target.id ? ' selected' : ''),
      () => sendAction('cast_vote', { targetId: target.id })));
  }
  parent.append(grid);
}

function renderPlayerVoteResult(parent) {
  renderPublicResult(parent);
  addText(parent, 'div', roomState.self.alive ? 'notice success' : 'notice warning',
    roomState.self.alive ? 'Kamu bertahan.' : 'Kamu tereliminasi.');
  if (roomState.self.role === 'hunter' && !roomState.self.alive && !roomState.room.resultResolved) renderHunterShot(parent);
  appendPhaseCountdown(parent, 'MALAM BERIKUTNYA DALAM', roomState.room.resultEndsAt);
}


async function leaveCurrentRoom() {
  if (!session || isRoomModerator()) return;
  const activeSession = session;
  const wasWaiting = Boolean(roomState?.self?.isWaiting);
  try {
    await request('/rooms/' + activeSession.code + '/action', {
      method: 'POST', body: { type: 'leave_room' }, session: activeSession
    });
    if (session !== activeSession) return;
    const takeoverDialog = $('botTakeoverDialog');
    if (takeoverDialog?.open) takeoverDialog.close();
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
    showMessage(wasWaiting
      ? 'Kamu keluar dari daftar tunggu.'
      : 'Kamu sudah keluar dari room. Jika permainan sedang berlangsung, karaktermu dihitung tereliminasi.');
  } catch (error) {
    if (session === activeSession && (error.status === 401 || error.status === 404)) clearInvalidSession(activeSession);
    else if (session === activeSession) showMessage(error.message, true);
  }
}

async function disbandCurrentRoom() {
  const activeSession = session;
  if (!activeSession || !isHost()) return;
  try {
    const result = await request('/rooms/' + activeSession.code + '/action', {
      method: 'POST', body: { type: 'disband_room' }, session: activeSession
    });
    if (session !== activeSession) return;
    clearInvalidSession(
      activeSession,
      result.message || 'Room berhasil dibubarkan. Semua pemain telah dikeluarkan.',
      false
    );
  } catch (error) {
    if (session !== activeSession) return;
    if (error.status === 401 || error.status === 404) clearInvalidSession(activeSession);
    else showMessage(error.message, true);
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
      body: { name: $('createName').value.trim() }
    });
    rememberPlayerName($('createName').value);
    await enterRoom({
      code: result.code,
      token: result.token,
      playerId: result.moderatorId,
      name: $('createName').value.trim(),
      isModerator: true,
      isHost: true
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
      body: {
        name: $('joinName').value.trim(),
        voiceMode: $('joinVoiceMode').value === 'offline' ? 'offline' : 'online'
      }
    });
    rememberPlayerName($('joinName').value);
    await enterRoom({ code: result.code, token: result.token, playerId: result.playerId, name: $('joinName').value.trim() });
    if (result.isWaiting) showMessage('Kamu masuk daftar tunggu. Kamu otomatis bergabung saat permainan berikutnya dimulai.');
  } catch (error) {
    showMessage(error.message, true);
  } finally {
    buttonElement.disabled = false;
  }
});

$('joinCode').addEventListener('input', event => {
  event.target.value = event.target.value.toUpperCase().replace(/[^A-HJ-NP-Z2-9]/g, '').slice(0, 6);
});

function stopQrScanner() {
  qrScannerActive = false;
  if (qrScannerFrame) cancelAnimationFrame(qrScannerFrame);
  qrScannerFrame = 0;
  if (qrScannerStream) {
    qrScannerStream.getTracks().forEach(track => track.stop());
    qrScannerStream = null;
  }
  const video = $('qrScannerVideo');
  if (video) {
    video.pause();
    video.srcObject = null;
  }
}

function closeQrScanner() {
  stopQrScanner();
  const dialog = $('scanQrDialog');
  if (dialog?.open && typeof dialog.close === 'function') dialog.close();
  else dialog?.removeAttribute('open');
}

function parseRoomCodeFromQr(value) {
  const raw = String(value || '').trim();
  const valid = code => /^[A-HJ-NP-Z2-9]{6}$/.test(code);
  const direct = raw.toUpperCase();
  if (valid(direct)) return direct;
  try {
    const parsed = new URL(raw, location.origin);
    const fromUrl = (
      parsed.searchParams.get('room') ||
      new URLSearchParams(parsed.hash.replace(/^#\??/, '')).get('room') ||
      ''
    ).trim().toUpperCase();
    if (valid(fromUrl)) return fromUrl;
  } catch {}
  const match = raw.match(/(?:[?&#]|^)room=([A-HJ-NP-Z2-9]{6})(?:[&#\s]|$)/i);
  return match ? match[1].toUpperCase() : '';
}

function acceptScannedRoomQr(value) {
  const code = parseRoomCodeFromQr(value);
  if (!code) {
    $('qrScannerStatus').textContent = 'QR ini bukan undangan Werewolf. Arahkan kamera ke QR undangan room.';
    return false;
  }
  closeQrScanner();
  $('joinCode').value = code;
  $('joinName').focus();
  showMessage('QR berhasil dibaca. Masukkan nama, lalu tekan Gabung Room (' + code + ').');
  return true;
}

function scanQrFrame(timestamp = 0) {
  if (!qrScannerActive) return;
  const video = $('qrScannerVideo');
  if (video && video.readyState >= 2 && video.videoWidth && timestamp - qrScannerLastScan >= 140) {
    qrScannerLastScan = timestamp;
    const canvas = $('qrScannerCanvas');
    const width = Math.min(video.videoWidth, 720);
    const height = Math.max(1, Math.round(video.videoHeight * width / video.videoWidth));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    try {
      const context = canvas.getContext('2d', { willReadFrequently: true });
      context.drawImage(video, 0, 0, width, height);
      const frame = context.getImageData(0, 0, width, height);
      const decoded = window.jsQR?.(frame.data, width, height, { inversionAttempts: 'attemptBoth' });
      if (decoded?.data && acceptScannedRoomQr(decoded.data)) return;
    } catch {}
  }
  if (qrScannerActive) qrScannerFrame = requestAnimationFrame(scanQrFrame);
}

async function openQrScanner() {
  const dialog = $('scanQrDialog');
  const status = $('qrScannerStatus');
  status.textContent = 'Memuat pemindai dan meminta izin kamera...';
  if (typeof dialog.showModal === 'function') dialog.showModal();
  else dialog.setAttribute('open', '');
  try {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('Akses kamera tidak tersedia. Masukkan kode room secara manual.');
    }
    qrScannerDecoderPromise ||= import('./vendor/jsQR.js');
    await qrScannerDecoderPromise;
    if (!window.jsQR) throw new Error('Pemindai QR gagal dimuat. Masukkan kode room secara manual.');
    if (!dialog.open && !dialog.hasAttribute('open')) return;
    qrScannerStream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: { ideal: 'environment' },
        width: { ideal: 1280 },
        height: { ideal: 720 }
      }
    });
    if (!dialog.open && !dialog.hasAttribute('open')) {
      stopQrScanner();
      return;
    }
    const video = $('qrScannerVideo');
    video.srcObject = qrScannerStream;
    video.muted = true;
    video.playsInline = true;
    await video.play();
    qrScannerLastScan = 0;
    qrScannerActive = true;
    status.textContent = 'Arahkan kamera ke QR undangan Werewolf.';
    qrScannerFrame = requestAnimationFrame(scanQrFrame);
  } catch (error) {
    stopQrScanner();
    status.textContent = error.name === 'NotAllowedError'
      ? 'Izin kamera ditolak. Aktifkan izin kamera atau masukkan kode room manual.'
      : (error.message || 'Kamera tidak dapat dibuka. Masukkan kode room manual.');
  }
}

function buildInviteUrl() {
  if (!session?.code) throw new Error('Room belum tersedia.');
  const invite = new URL(location.href);
  invite.search = '';
  invite.hash = '';
  invite.searchParams.set('room', session.code);
  return invite.href;
}

async function copyInviteLink() {
  const inviteUrl = buildInviteUrl();
  try {
    await navigator.clipboard.writeText(inviteUrl);
    showMessage('Tautan undangan berhasil disalin.');
  } catch {
    window.prompt('Salin tautan undangan ini:', inviteUrl);
  }
}

function openInviteDialog() {
  if (!session?.code) return;
  const dialog = $('inviteDialog');
  $('inviteQrCode').textContent = session.code;
  $('inviteQrImage').innerHTML = qrSvg(buildInviteUrl(), {
    moduleSize: 6,
    margin: 4,
    title: 'QR undangan Werewolf room ' + session.code
  });
  const svg = $('inviteQrImage').querySelector('svg');
  if (svg) {
    svg.removeAttribute('width');
    svg.removeAttribute('height');
    svg.setAttribute('focusable', 'false');
  }
  if (typeof dialog.showModal === 'function') dialog.showModal();
  else dialog.setAttribute('open', '');
}

async function createInviteQrPng() {
  const matrix = qrMatrix(buildInviteUrl());
  const moduleSize = 8;
  const margin = 4;
  const total = (matrix.length + margin * 2) * moduleSize;
  const canvas = document.createElement('canvas');
  canvas.width = total;
  canvas.height = total;
  const context = canvas.getContext('2d', { alpha: false });
  if (!context) throw new Error('Browser tidak mendukung pembuatan gambar QR.');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, total, total);
  context.fillStyle = '#000000';
  for (let row = 0; row < matrix.length; row += 1) {
    for (let col = 0; col < matrix.length; col += 1) {
      if (matrix[row][col]) context.fillRect((col + margin) * moduleSize, (row + margin) * moduleSize, moduleSize, moduleSize);
    }
  }
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Gambar QR gagal dibuat.')), 'image/png');
  });
}

$('copyInvite').addEventListener('click', copyInviteLink);
$('showInviteQr').addEventListener('click', openInviteDialog);
$('scanQrButton').addEventListener('click', openQrScanner);
$('closeQrScanner').addEventListener('click', closeQrScanner);
$('scanQrDialog').addEventListener('click', event => {
  if (event.target === $('scanQrDialog')) closeQrScanner();
});
$('scanQrDialog').addEventListener('close', stopQrScanner);
$('closeInviteDialog').addEventListener('click', () => {
  const dialog = $('inviteDialog');
  if (typeof dialog.close === 'function') dialog.close();
  else dialog.removeAttribute('open');
});
$('inviteDialog').addEventListener('click', event => {
  if (event.target !== $('inviteDialog')) return;
  const dialog = $('inviteDialog');
  if (typeof dialog.close === 'function') dialog.close();
  else dialog.removeAttribute('open');
});
$('copyInviteFromQr').addEventListener('click', copyInviteLink);
$('saveInviteQr').addEventListener('click', async () => {
  if (!session) return;
  try {
    const blob = await createInviteQrPng();
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = 'undangan-werewolf-' + session.code + '.png';
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1500);
    showMessage('QR undangan berhasil disimpan.');
  } catch (error) {
    showMessage(error.message, true);
  }
});
$('shareInviteQr').addEventListener('click', async () => {
  if (!session) return;
  const code = session.code;
  try {
    const inviteUrl = buildInviteUrl();
    const blob = await createInviteQrPng();
    const file = new File([blob], 'undangan-werewolf-' + code + '.png', { type: 'image/png' });
    const shareText = 'Scan QR ini untuk bergabung ke room Werewolf ' + code + '. Tautan: ' + inviteUrl;
    if (navigator.share && navigator.canShare?.({ files: [file] })) {
      await navigator.share({ title: 'Undangan Werewolf ' + code, text: shareText, files: [file] });
    } else if (navigator.share) {
      await navigator.share({ title: 'Undangan Werewolf ' + code, text: shareText, url: inviteUrl });
    } else {
      await copyInviteLink();
    }
  } catch (error) {
    if (error.name !== 'AbortError') showMessage(error.message || 'Undangan tidak dapat dibagikan.', true);
  }
});

$('resetRoom').addEventListener('click', async () => {
  if (!isHost()) {
    showMessage('Hanya host yang dapat memulai ulang permainan.', true);
    return;
  }
  if (roomState.room.phase === 'lobby') {
    showMessage('Room sudah berada di lobby. Mulai permainan terlebih dahulu untuk menggunakan restart.');
    return;
  }
  const accepted = await askConfirmation({
    title: 'Restart permainan?',
    message: 'Semua pemain kembali ke ruang tunggu. Kode room, nama, dan koneksi tetap dipertahankan.',
    confirmLabel: 'Restart permainan'
  });
  if (accepted) sendAction('reset_to_lobby');
});


$('botTakeoverReturn').addEventListener('click', async () => {
  const restored = await sendAction('restore_player_control');
  if (restored) showMessage('Kendali pemain kembali kepadamu.');
});
$('botTakeoverLeave').addEventListener('click', () => {
  leaveCurrentRoom();
});
$('botTakeoverDialog').addEventListener('cancel', event => event.preventDefault());

$('leaveRoom').addEventListener('click', async () => {
  if (isHost()) {
    const code = roomState.room.code;
    const accepted = await askConfirmation({
      title: 'Bubarkan room?',
      message: 'Room ' + code + ' akan dihapus. Semua pemain dikeluarkan dan koneksi ditutup. Tindakan ini tidak dapat dibatalkan.',
      confirmLabel: 'Bubarkan room'
    });
    if (accepted) disbandCurrentRoom();
    return;
  }
  if (isRoomModerator()) {
    showMessage('Kamu sedang bertugas sebagai moderator dan tidak dapat keluar dari room.');
    return;
  }
  const accepted = await askConfirmation({
    title: 'Keluar dari room?',
    message: roomState.room.phase === 'lobby'
      ? 'Namamu akan dihapus dari daftar pemain.'
      : 'Karaktermu akan dianggap tereliminasi dari permainan.',
    confirmLabel: 'Keluar dari room'
  });
  if (accepted) leaveCurrentRoom();
});

$('confirmDialogCancel').addEventListener('click', () => closeConfirmation(false));
$('confirmDialogAccept').addEventListener('click', () => closeConfirmation(true));
$('confirmDialog').addEventListener('cancel', event => {
  event.preventDefault();
  closeConfirmation(false);
});
$('confirmDialog').addEventListener('click', event => {
  if (event.target === $('confirmDialog')) closeConfirmation(false);
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
  const inviteCode = (params.get('room') || '').toUpperCase();
  const code = (inviteCode || localStorage.getItem('werewolf.lastRoom') || '').toUpperCase();
  if (!/^[A-HJ-NP-Z2-9]{6}$/.test(code)) return;
  $('joinCode').value = code;
  const saved = localStorage.getItem(SESSION_PREFIX + code);
  if (!saved) {
    if (inviteCode) showMessage('Undangan room ' + code + ' ditemukan. Masukkan nama untuk bergabung.');
    return;
  }
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
window.addEventListener('pagehide', stopQrScanner);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' || !qrScannerActive) return;
  stopQrScanner();
  $('qrScannerStatus').textContent = 'Kamera dihentikan karena halaman tidak aktif. Tutup lalu scan ulang.';
});
$('reconnectButton')?.addEventListener('click', reconnectNow);
window.addEventListener('online', reconnectNow);
window.addEventListener('offline', () => setConnection(false, 'Internet terputus'));
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible' || !session) return;
  refreshState().catch(() => {});
  if (!socket || socket.readyState === WebSocket.CLOSED) connectRealtime();
});
prefillPlayerName();
checkApi();
restoreSession();
