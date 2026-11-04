const $ = id => document.getElementById(id);
const API_BASE = location.hostname === 'irvan1609.github.io'
  ? 'https://werewolf-room-api.andyirvan1609.workers.dev'
  : 'https://werewolf-room-api-dev.andyirvan1609.workers.dev';
const SESSION_PREFIX = 'werewolf.session.';
const ROLE_INFO = {
  wolf: ['Werewolf', 'Kamu bagian dari kawanan Werewolf. Pilih satu warga untuk diserang setiap malam.'],
  villager: ['Warga Desa', 'Kamu tidak memiliki aksi malam. Gunakan diskusi dan voting untuk menemukan Werewolf.'],
  seer: ['Seer', 'Setiap malam, periksa satu pemain. Hasil pemeriksaan hanya terlihat olehmu.'],
  doctor: ['Doctor', 'Setiap malam, lindungi satu pemain dari serangan Werewolf.']
};
let session = null;
let roomState = null;
let socket = null;
let reconnectTimer = null;
let pollTimer = null;
let clockTimer = null;
let reconnectDelay = 1200;
let polling = false;

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
  if (options.auth !== false && session?.token) headers.Authorization = 'Bearer ' + session.token;
  const response = await fetch(API_BASE + path, {
    method: options.method || 'GET',
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    cache: 'no-store'
  });
  let data = {};
  try { data = await response.json(); } catch {}
  if (!response.ok) throw new Error(data.error || 'Permintaan gagal (' + response.status + ').');
  return data;
}

function saveSession() {
  if (!session) return;
  localStorage.setItem(SESSION_PREFIX + session.code, JSON.stringify(session));
  localStorage.setItem('werewolf.lastRoom', session.code);
}

function stopRealtime() {
  if (reconnectTimer) clearTimeout(reconnectTimer);
  if (pollTimer) clearInterval(pollTimer);
  if (clockTimer) clearInterval(clockTimer);
  reconnectTimer = null;
  pollTimer = null;
  clockTimer = null;
  if (socket) {
    socket.onclose = null;
    try { socket.close(); } catch {}
  }
  socket = null;
}

async function enterRoom(nextSession) {
  stopRealtime();
  session = nextSession;
  saveSession();
  $('entryPanel').classList.add('hidden');
  $('roomPanel').classList.remove('hidden');
  $('roomCodeLabel').textContent = session.code;
  setConnection(false);
  const invite = new URL(location.href);
  invite.searchParams.set('room', session.code);
  history.replaceState({}, '', invite);
  try { await refreshState(); }
  catch (error) { showMessage('Sesi tersimpan, tetapi data room belum dapat dimuat: ' + error.message, true); }
  connectRealtime();
  pollTimer = setInterval(() => {
    if (!socket || socket.readyState !== WebSocket.OPEN) refreshState().catch(() => {});
  }, 5000);
}

async function refreshState() {
  if (!session) return;
  if (polling) return;
  polling = true;
  try {
    const result = await request('/rooms/' + session.code + '/state');
    applyState(result.state);
  } finally {
    polling = false;
  }
}

async function connectRealtime() {
  if (!session) return;
  try {
    const result = await request('/rooms/' + session.code + '/ticket', { method: 'POST', body: {} });
    const wsBase = API_BASE.replace(/^https:/, 'wss:').replace(/^http:/, 'ws:');
    const nextSocket = new WebSocket(wsBase + '/rooms/' + session.code + '/ws?ticket=' + encodeURIComponent(result.ticket));
    socket = nextSocket;
    nextSocket.onopen = () => {
      reconnectDelay = 1200;
      setConnection(true);
    };
    nextSocket.onmessage = event => {
      if (event.data === 'pong') return;
      try {
        const message = JSON.parse(event.data);
        if (message.type === 'state') applyState(message.state);
        if (message.type === 'error') showMessage(message.error, true);
      } catch {}
    };
    nextSocket.onclose = () => {
      if (socket === nextSocket) {
        socket = null;
        setConnection(false);
        scheduleReconnect();
      }
    };
    nextSocket.onerror = () => {
      try { nextSocket.close(); } catch {}
    };
  } catch {
    setConnection(false);
    scheduleReconnect();
  }
}

function scheduleReconnect() {
  if (!session || reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connectRealtime();
  }, reconnectDelay);
  reconnectDelay = Math.min(reconnectDelay * 1.7, 12000);
}

async function sendAction(type, payload = {}) {
  try {
    const result = await request('/rooms/' + session.code + '/action', {
      method: 'POST',
      body: { type, ...payload }
    });
    applyState(result.state);
    showMessage('');
  } catch (error) {
    showMessage(error.message, true);
  }
}

function applyState(nextState) {
  if (!nextState || !nextState.room) return;
  roomState = nextState;
  renderRoom();
}

function roleLabel(role) {
  return ROLE_INFO[role]?.[0] || 'Belum diketahui';
}

function isHost() {
  return Boolean(roomState && session && roomState.room.hostId === roomState.self?.id);
}

function addText(parent, tag, className, text) {
  const item = node(tag, className, text);
  parent.append(item);
  return item;
}

function renderPlayers() {
  const list = $('playersList');
  list.replaceChildren();
  const players = roomState.players || [];
  $('playerCount').textContent = players.length + ' / 20 pemain';
  for (const player of players) {
    const chip = node('div', 'player-chip' + (player.alive ? '' : ' dead') + (player.isBot ? ' bot' : ''));
    const avatar = node('span', 'player-avatar', (player.name || '?').slice(0, 1).toUpperCase());
    const name = node('span', 'player-name', player.name);
    if (player.isHost) name.append(node('span', 'host-mark', ' HOST'));
    if (player.isBot) name.append(node('span', 'bot-mark', ' BOT'));
    const status = node('span', 'player-meta', !player.alive
      ? 'Tereliminasi' + (player.role ? ' · ' + roleLabel(player.role) : '')
      : player.isBot ? 'Bot otomatis' : (player.connected ? 'Online' : 'Terputus') + (player.hasDrawn ? ' · Kartu diambil' : ''));
    chip.append(avatar, name, status);
    list.append(chip);
  }
}

function updatePhaseTracker(phase) {
  const tracker = $('phaseTracker');
  if (!tracker) return;
  const steps = ['lobby', 'role_draw', 'night', 'discussion', 'voting', 'result'];
  const activeIndex = phase === 'finished' ? steps.length - 1 : Math.max(0, steps.indexOf(phase));
  for (const item of tracker.querySelectorAll('[data-step]')) {
    const index = steps.indexOf(item.dataset.step);
    item.classList.toggle('active', index === activeIndex);
    item.classList.toggle('done', phase === 'finished' || index < activeIndex);
  }
}

function renderRoom() {
  if (!roomState) return;
  clearInterval(clockTimer);
  const room = roomState.room;
  const labels = {
    lobby: 'Lobby · Menunggu pemain',
    role_draw: 'Pembagian kartu',
    night: 'Malam · Aksi rahasia',
    discussion: 'Diskusi',
    voting: 'Voting',
    result: 'Hasil ronde',
    finished: 'Permainan selesai'
  };
  $('phaseLabel').textContent = labels[room.phase] || room.phase;
  $('roundLabel').textContent = room.round ? 'Ronde ' + room.round : 'Lobby';
  $('roomCodeLabel').textContent = room.code;
  updatePhaseTracker(room.phase);
  renderPlayers();
  const activeElement = document.activeElement;
  const activeId = activeElement && activeElement.id ? activeElement.id : '';
  const activeValue = activeElement && 'value' in activeElement ? activeElement.value : undefined;
  const phasePanel = $('phasePanel');
  if (phasePanel) phasePanel.dataset.phase = room.phase;
  const content = $('phaseContent');
  content.replaceChildren();
  switch (room.phase) {
    case 'lobby': renderLobby(content); break;
    case 'role_draw': renderRoleDraw(content); break;
    case 'night': renderNight(content); break;
    case 'discussion': renderDiscussion(content); break;
    case 'voting': renderVoting(content); break;
    case 'result': renderResult(content); break;
    case 'finished': renderFinished(content); break;
    default: addText(content, 'p', 'notice', 'Status permainan tidak dikenali.');
  }
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

function renderLobby(parent) {
  phaseHeader(parent, 'LOBBY ROOM', 'Menunggu pemain bergabung', 'Bagikan kode room kepada teman. Setiap pemain sebaiknya menggunakan HP sendiri agar kartu dan aksinya tidak terlihat orang lain.');
  addText(parent, 'div', 'notice', 'Permainan dimulai setelah minimal 5 pemain masuk. Maksimal 20 pemain.');
  const settings = roomState.room.settings || {};
  const roleCounts = [
    ['Werewolf', Number(settings.wolves || 1)],
    ['Seer', settings.seer ? 1 : 0],
    ['Doctor', settings.doctor ? 1 : 0]
  ];
  const specialRoles = roleCounts.reduce((sum, item) => sum + item[1], 0);
  const villagers = roomState.players.length - specialRoles;
  const balance = node('div', 'role-balance');
  addText(balance, 'div', 'eyebrow-small', 'KOMPOSISI PERAN');
  const balanceGrid = node('div', 'role-balance-grid');
  for (const [label, count] of [...roleCounts, ['Warga Desa', Math.max(0, villagers)]]) {
    const item = node('div', 'role-balance-item');
    addText(item, 'b', '', String(count));
    addText(item, 'span', '', label);
    balanceGrid.append(item);
  }
  balance.append(balanceGrid);
  if (roomState.players.length < 5) addText(balance, 'p', 'hint', 'Tambahkan pemain hingga minimal 5 orang untuk memulai.');
  else if (villagers < 1) addText(balance, 'p', 'notice warning', 'Peran khusus terlalu banyak. Kurangi Werewolf atau nonaktifkan Seer/Doctor agar tersisa minimal satu Warga Desa.');
  else addText(balance, 'p', 'hint', villagers + ' Warga Desa akan melengkapi komposisi permainan.');
  parent.append(balance);
  if (isHost()) {
    const maxBots = Math.min(19, 20 - roomState.players.length);
    const botBox = node('div', 'bot-setup');
    addText(botBox, 'h3', '', 'Mode latihan vs bot');
    addText(botBox, 'p', 'hint', 'Bot mengambil kartu, menjalankan aksi malam, berdiskusi, membalas chat saat mode solo, dan melakukan voting otomatis. Empat bot cocok untuk satu pemain.');
    const botLabel = node('label', 'bot-count-label');
    botLabel.append(node('span', '', 'Jumlah bot tambahan'));
    const botCount = node('select');
    botCount.id = 'botCount';
    const choices = [1, 2, 3, 4, 5, 8, 10, 15, 19].filter(value => value <= maxBots);
    if (maxBots > 0 && !choices.length) choices.push(maxBots);
    for (const value of choices) botCount.append(new Option(value + ' bot', String(value)));
    botCount.value = String(choices.includes(4) ? 4 : (choices[0] || 0));
    botLabel.append(botCount);
    botBox.append(botLabel);
    botBox.append(button('Tambahkan bot otomatis', 'secondary wide', () => sendAction('add_bots', { count: Number(botCount.value) }), maxBots < 1));
    if (maxBots < 1) addText(botBox, 'p', 'hint', 'Room sudah penuh.');
    parent.append(botBox);

    const canStart = roomState.players.length >= 5 && villagers >= 1;
    const start = button('Mulai permainan & acak kartu', 'primary wide', () => sendAction('start_game'), !canStart);
    parent.append(start);
  } else {
    addText(parent, 'div', 'notice warning', 'Tunggu host memulai permainan. Pengaturan peran ditentukan oleh host.');
  }
}

function renderRoleCard(parent, role) {
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
  addText(card, 'div', 'eyebrow-small', 'KARTU RAHASIA KAMU');
  addText(card, 'div', 'role-name', info[0]);
  addText(card, 'p', '', info[1]);
  parent.append(card);
}

function renderRoleDraw(parent) {
  phaseHeader(parent, 'PEMBAGIAN KARTU', 'Ambil kartu peranmu', 'Kartu hanya ditampilkan pada perangkat pemain yang mengambilnya. Jangan tunjukkan layar kepada pemain lain.');
  if (!roomState.self.hasDrawn) {
    const card = node('div', 'card-back');
    const label = node('div');
    label.append(node('div', '', 'WEREWOLF'));
    label.append(node('span', '', 'TEKAN UNTUK MEMBUKA KARTU'));
    card.append(label);
    parent.append(card);
    parent.append(button('Ambil kartu rahasia', 'primary wide', () => sendAction('draw_card')));
  } else {
    renderRoleCard(parent, roomState.self.role);
    addText(parent, 'div', 'notice success', 'Kartu berhasil diambil. Peranmu sudah tersimpan secara rahasia di room.');
  }
  const allDrawn = roomState.players.every(player => player.hasDrawn);
  if (roomState.players.some(player => player.isBot)) addText(parent, 'div', 'notice success', 'Bot sudah mengambil kartu secara otomatis.');
  if (isHost()) {
    parent.append(button('Mulai malam pertama', 'primary wide', () => sendAction('start_night'), !allDrawn));
    if (!allDrawn) addText(parent, 'p', 'hint', 'Host dapat memulai setelah semua pemain mengambil kartu.');
  } else {
    addText(parent, 'p', 'hint', 'Setelah semua kartu diambil, host akan memulai malam pertama.');
  }
}

function renderNight(parent) {
  phaseHeader(parent, 'MALAM ' + roomState.room.round, 'Waktunya aksi rahasia', 'Lakukan aksi sesuai peran. Target dan hasil aksi tidak ditampilkan kepada pemain lain.');
  const self = roomState.self;
  if (!self.role) {
    addText(parent, 'div', 'notice warning', 'Kartu belum diambil pada perangkat ini. Hubungi host.');
    return;
  }
  renderRoleCard(parent, self.role);
  if (!roomState.players.find(player => player.id === self.id)?.alive) {
    addText(parent, 'div', 'notice warning', 'Kamu sudah tereliminasi. Tunggu hasil ronde berikutnya.');
  } else if (['wolf', 'seer', 'doctor'].includes(self.role)) {
    if (self.hasActed) {
      addText(parent, 'div', 'notice success', 'Aksimu sudah dikirim secara rahasia. Tunggu pemain lain.');
    } else {
      const title = self.role === 'wolf' ? 'Pilih target serangan' : self.role === 'seer' ? 'Pilih pemain untuk diperiksa' : 'Pilih pemain untuk dilindungi';
      addText(parent, 'h3', '', title);
      const grid = node('div', 'action-grid');
      const targets = roomState.players.filter(player => player.alive
        && (self.role === 'doctor' || player.id !== self.id)
        && (self.role !== 'wolf' || !player.isWolf));
      if (self.role === 'doctor') addText(parent, 'p', 'hint', 'Doctor juga dapat melindungi dirinya sendiri.');
      for (const target of targets) {
        grid.append(button(target.name, 'action-button', () => sendAction('night_action', { targetId: target.id })));
      }
      parent.append(grid);
      if (!targets.length) addText(parent, 'div', 'notice', 'Tidak ada target yang tersedia.');
    }
  } else {
    addText(parent, 'div', 'notice', 'Sebagai Warga Desa, kamu tidak memiliki aksi malam. Tunggu sampai pagi.');
  }
  const progress = roomState.room.nightActionsSubmitted + ' / ' + roomState.room.nightActionsRequired + ' aksi malam terkirim';
  addText(parent, 'div', 'notice', progress);
  if (isHost()) {
    const complete = roomState.room.nightActionsSubmitted >= roomState.room.nightActionsRequired;
    parent.append(button('Selesaikan malam & umumkan hasil', 'primary wide',
      () => sendAction('resolve_night'), !complete));
    if (!complete) parent.append(button('Paksa selesaikan malam (lewati aksi yang belum masuk)', 'secondary wide',
      () => { if (confirm('Aksi pemain yang belum mengirim akan dilewati. Lanjutkan?')) sendAction('resolve_night', { force: true }); }));
  } else {
    addText(parent, 'p', 'hint', 'Host akan menyelesaikan fase malam setelah semua peran aktif mengirim aksi.');
  }
  if (self.seerResult) {
    const result = self.seerResult.result === 'wolf' ? 'terindikasi Werewolf' : 'bukan Werewolf';
    addText(parent, 'div', 'notice success', 'Hasil pemeriksaan ronde ' + self.seerResult.round + ': ' + self.seerResult.playerName + ' ' + result + '.');
  }
}

function renderDiscussion(parent) {
  phaseHeader(parent, 'FASE DISKUSI', 'Diskusikan kecurigaan', 'Pilih cara berdiskusi. Semua pemain tetap berada di room yang sama dan voting berikutnya dilakukan melalui web.');
  const room = roomState.room;
  if (room.lastResult?.kind === 'night') addText(parent, 'div', 'notice success', room.lastResult.message);
  if (!room.discussionMode) {
    if (isHost()) {
      const form = node('form', 'discussion-form');
      const modeLabel = node('label', '');
      modeLabel.append(node('span', '', 'Metode diskusi'));
      const mode = node('select');
      mode.id = 'discussionMode';
      mode.append(new Option('Offline · Tatap muka', 'offline'), new Option('Online · Chat / Voice / Video Call', 'online'));
      modeLabel.append(mode);
      const durationLabel = node('label', '');
      durationLabel.append(node('span', '', 'Durasi diskusi'));
      const duration = node('select');
      duration.id = 'discussionDuration';
      for (const value of [3, 5, 7, 10, 15, 20]) duration.append(new Option(value + ' menit', String(value)));
      duration.value = '5';
      durationLabel.append(duration);
      const callLabel = node('label', '');
      callLabel.append(node('span', '', 'Tautan voice / video call (opsional)'));
      const call = node('input');
      call.id = 'discussionCallUrl';
      call.type = 'url';
      call.placeholder = 'https://meet.google.com/...';
      callLabel.append(call);
      const help = addText(form, 'p', 'hint', 'Mode offline untuk diskusi satu tempat. Mode online mengaktifkan chat room dan dapat memakai tautan panggilan eksternal.');
      form.append(modeLabel, durationLabel, callLabel);
      form.append(button('Mulai diskusi', 'primary wide', () => {
        sendAction('set_discussion', {
          mode: mode.value,
          durationMinutes: Number(duration.value),
          callUrl: call.value.trim()
        });
      }));
      parent.append(form);
    } else {
      addText(parent, 'div', 'notice warning', 'Host sedang memilih diskusi offline atau online.');
    }
    return;
  }

  const botCount = roomState.players.filter(player => player.isBot).length;
  const soloBotMode = botCount > 0 && roomState.players.filter(player => !player.isBot).length === 1;
  if (botCount) addText(parent, 'div', soloBotMode ? 'notice success' : 'notice', soloBotMode
    ? 'Mode solo aktif: bot sudah mengirim pendapat, akan membalas chat, dan memilih secara otomatis. Baca diskusi lalu lanjutkan ke voting kapan saja.'
    : botCount + ' bot aktif. Bot mengikuti aksi malam dan voting otomatis; komentar bot muncul saat diskusi online.');
  if (roomState.self.role === 'seer' && roomState.self.seerResult) {
    const privateResult = roomState.self.seerResult.result === 'wolf' ? 'terindikasi Werewolf' : 'bukan Werewolf';
    addText(parent, 'div', 'notice success', 'Hasil pemeriksaan rahasia: ' + roomState.self.seerResult.playerName + ' ' + privateResult + '.');
  }
  const timer = addText(parent, 'div', 'timer', '--:--');
  addText(parent, 'p', 'hint', room.discussionMode === 'offline'
    ? 'Mode offline aktif: silakan berdiskusi langsung. Gunakan perangkat masing-masing hanya untuk melihat status dan melakukan voting.'
    : 'Mode online aktif: gunakan chat room di bawah atau tautan voice/video call yang dibagikan host.');
  if (room.discussionMode === 'online') {
    if (room.callUrl) {
      const link = node('a', 'call-link', 'Buka voice / video call ↗');
      link.href = room.callUrl;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      parent.append(link);
    }
    renderChat(parent);
  } else {
    addText(parent, 'div', 'notice', 'Diskusi tatap muka berlangsung. Jangan membagikan kartu rahasia atau membuka layar peran kepada pemain lain.');
  }
  if (isHost()) {
    const startVote = button('Mulai voting', 'primary wide', () => sendAction('start_voting'), true);
    startVote.id = 'startVoting';
    parent.append(startVote);
    if (botCount) parent.append(button('Lewati diskusi & lanjut voting', 'secondary wide', () => sendAction('start_voting', { force: true })));
    clockTimer = setInterval(() => updateDiscussionClock(timer, startVote, room.discussionEndsAt), 1000);
    updateDiscussionClock(timer, startVote, room.discussionEndsAt);
  } else {
    clockTimer = setInterval(() => updateDiscussionClock(timer, null, room.discussionEndsAt), 1000);
    updateDiscussionClock(timer, null, room.discussionEndsAt);
    addText(parent, 'p', 'hint', 'Voting akan dibuka setelah waktu diskusi berakhir dan host memulainya.');
  }
}

function updateDiscussionClock(timer, startButton, endAt) {
  const remaining = Math.max(0, Number(endAt || 0) - Date.now());
  const seconds = Math.ceil(remaining / 1000);
  timer.textContent = String(Math.floor(seconds / 60)).padStart(2, '0') + ':' + String(seconds % 60).padStart(2, '0');
  if (startButton) startButton.disabled = remaining > 0;
}

function renderChat(parent) {
  const box = node('div', 'chat-box');
  const list = node('div', 'chat-list');
  list.setAttribute('aria-live', 'polite');
  for (const message of roomState.chat || []) {
    const item = node('div', 'chat-message');
    const heading = node('div');
    heading.append(node('b', '', message.name));
    const speaker = roomState.players.find(player => player.id === message.playerId);
    if (speaker?.isBot) heading.append(node('span', 'chat-bot-badge', 'BOT'));
    const time = node('time', '', new Date(message.at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }));
    heading.append(time);
    item.append(heading, node('p', '', message.text));
    list.append(item);
  }
  if (!roomState.chat?.length) addText(list, 'p', 'hint', 'Belum ada pesan. Mulai diskusi dengan sopan dan jangan membagikan peran rahasia.');
  box.append(list);
  const form = node('form', 'chat-form');
  const input = node('input');
  input.id = 'chatInput';
  input.maxLength = 500;
  const soloBotMode = roomState.players.some(player => player.isBot) && roomState.players.filter(player => !player.isBot).length === 1;
  input.placeholder = soloBotMode ? 'Tulis pendapat atau tanyakan sesuatu kepada bot...' : 'Tulis pesan diskusi...';
  input.autocomplete = 'off';
  input.required = true;
  const submit = node('button', 'primary', 'Kirim');
  submit.type = 'submit';
  form.append(input, submit);
  form.addEventListener('submit', event => {
    event.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    sendAction('send_chat', { text });
    input.value = '';
  });
  box.append(form);
  parent.append(box);
  list.scrollTop = list.scrollHeight;
}

function renderVoting(parent) {
  phaseHeader(parent, 'FASE VOTING', 'Pilih satu pemain', 'Setiap pemain hidup memiliki satu suara. Pilihanmu dirahasiakan sampai seluruh suara masuk.');
  const room = roomState.room;
  const progress = room.votesSubmitted + ' / ' + room.votesRequired + ' suara masuk';
  addText(parent, 'div', 'notice', progress);
  if (roomState.players.some(player => player.isBot)) addText(parent, 'p', 'hint', 'Bot telah memberikan suara secara otomatis. Pilihan tetap dirahasiakan sampai voting selesai.');
  const bar = node('div', 'progress');
  const fill = node('span');
  fill.style.width = (room.votesRequired ? Math.min(100, room.votesSubmitted / room.votesRequired * 100) : 0) + '%';
  bar.append(fill);
  parent.append(bar);
  if (isHost()) {
    const allVotesIn = room.votesSubmitted >= room.votesRequired;
    parent.append(button('Selesaikan voting', 'secondary wide', () => sendAction('resolve_vote'), !allVotesIn));
    if (!allVotesIn) parent.append(button('Paksa hitung suara yang sudah masuk', 'secondary wide',
      () => { if (confirm('Pemain yang belum memilih akan dilewati. Lanjutkan?')) sendAction('resolve_vote', { force: true }); }));
  }
  if (!roomState.players.find(player => player.id === roomState.self.id)?.alive) {
    addText(parent, 'div', 'notice warning', 'Kamu sudah tereliminasi dan tidak dapat memberikan suara.');
    return;
  }
  if (roomState.self.hasVoted) {
    addText(parent, 'div', 'notice success', 'Suaramu sudah tersimpan. Tunggu pemain lain menyelesaikan voting.');
    return;
  }
  const grid = node('div', 'action-grid');
  for (const player of roomState.players.filter(item => item.alive && item.id !== roomState.self.id)) {
    grid.append(button(player.name, 'action-button', () => {
      if (confirm('Pilih ' + player.name + ' untuk dieliminasi?')) sendAction('cast_vote', { targetId: player.id });
    }));
  }
  parent.append(grid);
}

function renderResult(parent) {
  phaseHeader(parent, 'HASIL RONDE', 'Hasil voting', 'Periksa hasil ronde sebelum host melanjutkan permainan.');
  const result = roomState.room.lastResult;
  const card = node('div', 'result-card');
  addText(card, 'h3', '', result?.message || 'Ronde selesai.');
  addText(card, 'p', '', 'Pemain yang tereliminasi akan ditampilkan bersama perannya. Peran pemain yang masih hidup tetap rahasia.');
  parent.append(card);
  if (isHost()) parent.append(button('Mulai malam berikutnya', 'primary wide', () => sendAction('next_round')));
  else addText(parent, 'p', 'hint', 'Tunggu host memulai ronde berikutnya.');
}

function renderFinished(parent) {
  phaseHeader(parent, 'GAME OVER', 'Permainan selesai', 'Seluruh peran kini dibuka dan hasil akhir dapat dilihat semua pemain.');
  addText(parent, 'div', 'winner', roomState.room.winner === 'wolves' ? 'Werewolf menang' : 'Warga desa menang');
  if (roomState.room.lastResult?.message) addText(parent, 'div', 'notice success', roomState.room.lastResult.message);
  const card = node('div', 'result-card');
  for (const player of roomState.players) {
    const line = node('p', '', player.name + ' — ' + roleLabel(player.role) + (player.alive ? ' · Hidup' : ' · Tereliminasi'));
    card.append(line);
  }
  parent.append(card);
  if (isHost()) parent.append(button('Tutup room', 'secondary wide', () => leaveCurrentRoom()));
}

async function leaveCurrentRoom() {
  if (!session) return;
  const code = session.code;
  stopRealtime();
  localStorage.removeItem(SESSION_PREFIX + code);
  session = null;
  roomState = null;
  $('roomPanel').classList.add('hidden');
  $('entryPanel').classList.remove('hidden');
  const url = new URL(location.href);
  url.searchParams.delete('room');
  history.replaceState({}, '', url);
  showMessage('Kamu keluar dari room. Room akan kedaluwarsa otomatis setelah tidak aktif.');
}

$('createForm').addEventListener('submit', async event => {
  event.preventDefault();
  const buttonElement = $('createButton');
  buttonElement.disabled = true;
  const soloMode = $('soloMode').checked;
  showMessage('Membuat room...');
  try {
    const result = await request('/rooms', {
      method: 'POST',
      auth: false,
      body: {
        name: $('createName').value.trim(),
        settings: {
          wolves: Number($('wolfCount').value),
          seer: $('includeSeer').checked,
          doctor: $('includeDoctor').checked
        }
      }
    });
    await enterRoom({ code: result.code, token: result.token, playerId: result.playerId, name: $('createName').value.trim() });
    if (soloMode) await sendAction('add_bots', { count: 4 });
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
    const code = $('joinCode').value.trim().toUpperCase();
    const result = await request('/rooms/' + code + '/join', {
      method: 'POST',
      auth: false,
      body: { name: $('joinName').value.trim() }
    });
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

$('leaveRoom').addEventListener('click', () => {
  if (confirm('Keluar dari room? Kamu dapat bergabung kembali menggunakan kode dan perangkat yang sama.')) leaveCurrentRoom();
});

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

checkApi();
restoreSession();
