const $ = id => document.getElementById(id);
const API_BASE = location.hostname === 'irvan1609.github.io'
  ? 'https://werewolf-room-api.andyirvan1609.workers.dev'
  : 'https://werewolf-room-api-dev.andyirvan1609.workers.dev';
const SESSION_PREFIX = 'werewolf.session.';
const ROLE_INFO = {
  wolf: ['Werewolf', 'Serang satu pemain setiap malam bersama kawanan.'],
  alpha_wolf: ['Alpha Wolf', 'Pemimpin kawanan. Suara serangan malam bernilai dua.'],
  villager: ['Warga Desa', 'Tidak memiliki aksi malam. Gunakan diskusi dan voting untuk menemukan Werewolf.'],
  seer: ['Seer', 'Periksa satu pemain setiap malam untuk mengetahui apakah ia Werewolf.'],
  doctor: ['Doctor', 'Lindungi satu pemain dari serangan setiap malam.'],
  bodyguard: ['Bodyguard', 'Jaga satu pemain setiap malam. Jika target diserang, kamu yang menerima serangan.'],
  witch: ['Witch', 'Mengetahui target serangan Werewolf setelah kawanan memilih. Memiliki satu ramuan penyembuh dan satu racun, masing-masing sekali.'],
  hunter: ['Hunter', 'Jika tereliminasi, pilih satu pemain hidup untuk ditembak.'],
  cupid: ['Cupid', 'Pada malam pertama, hubungkan dua pemain. Jika salah satu tereliminasi, pasangannya ikut tereliminasi.'],
  guardian_angel: ['Guardian Angel', 'Pilih satu pemain untuk dilindungi setiap malam. Mendapat kemenangan tambahan jika target pilihan terakhir masih hidup saat permainan berakhir.'],
  detective: ['Detective', 'Periksa satu pemain setiap malam untuk mengetahui kubunya: Desa, Werewolf, atau Netral.'],
  mayor: ['Mayor', 'Suara voting bernilai dua. Tidak memiliki aksi malam.'],
  jester: ['Jester', 'Menang sendiri jika berhasil dieliminasi melalui voting. Tidak memiliki aksi malam.']
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
const ABILITY_OPTIONS = [
  ['alphaDoubleVote', 'Alpha Wolf: suara serangan dua kali lipat'],
  ['seerInspection', 'Seer: pemeriksaan identitas'],
  ['doctorProtection', 'Doctor: perlindungan malam'],
  ['bodyguardSacrifice', 'Bodyguard: mengorbankan diri untuk target'],
  ['witchHeal', 'Witch: ramuan penyembuh'],
  ['witchPoison', 'Witch: ramuan racun'],
  ['hunterShot', 'Hunter: tembakan setelah tereliminasi'],
  ['cupidBond', 'Cupid: menghubungkan dua pemain'],
  ['guardianProtection', 'Guardian Angel: perlindungan target'],
  ['guardianBonus', 'Guardian Angel: kemenangan tambahan'],
  ['detectiveInspection', 'Detective: pemeriksaan kubu'],
  ['mayorDoubleVote', 'Mayor: bobot suara dua kali lipat'],
  ['jesterSoloWin', 'Jester: kemenangan solo melalui voting']
];
const ROLE_COUNT_DEFAULTS = {
  wolf: 1, alpha_wolf: 0, seer: 1, doctor: 1, bodyguard: 0, witch: 0,
  hunter: 0, cupid: 0, guardian_angel: 0, detective: 0, mayor: 0, jester: 0, villager: 2
};
const ABILITY_DEFAULTS = Object.fromEntries(ABILITY_OPTIONS.map(([key]) => [key, true]));
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
  return Boolean(roomState?.self?.isModerator);
}

function abilityOn(key) {
  return roomState?.room?.settings?.abilities?.[key] !== false;
}

function addText(parent, tag, className, text) {
  const item = node(tag, className, text);
  parent.append(item);
  return item;
}

function roleSettingsForUI(settings = {}) {
  if (settings.roleCounts) {
    return {
      roleCounts: { ...ROLE_COUNT_DEFAULTS, ...settings.roleCounts },
      abilities: { ...ABILITY_DEFAULTS, ...(settings.abilities || {}) }
    };
  }
  const extras = settings.extraRoles || {};
  const roleCounts = {
    ...ROLE_COUNT_DEFAULTS,
    wolf: Math.max(0, Number(settings.wolves || 1) - (extras.alphaWolf ? 1 : 0)),
    alpha_wolf: extras.alphaWolf ? 1 : 0,
    seer: settings.seer === false ? 0 : 1,
    doctor: settings.doctor === false ? 0 : 1,
    bodyguard: extras.bodyguard ? 1 : 0,
    witch: extras.witch ? 1 : 0,
    hunter: extras.hunter ? 1 : 0,
    cupid: extras.cupid ? 1 : 0,
    guardian_angel: extras.guardianAngel ? 1 : 0,
    detective: extras.detective ? 1 : 0,
    mayor: extras.mayor ? 1 : 0,
    jester: extras.jester ? 1 : 0
  };
  const assigned = Object.entries(roleCounts).filter(([key]) => key !== 'villager')
    .reduce((sum, [, value]) => sum + value, 0);
  roleCounts.villager = Math.max(0, (roomState?.players?.length || 5) - assigned);
  return { roleCounts, abilities: { ...ABILITY_DEFAULTS } };
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

function renderRoleConfigEditor(container, settings) {
  const config = roleSettingsForUI(settings);
  container.replaceChildren();
  container.classList.add('role-config-editor');
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
      input.max = '20';
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
  const abilities = node('section', 'ability-config');
  addText(abilities, 'div', 'role-section-label', 'PENGATURAN KEMAMPUAN');
  const abilityGrid = node('div', 'ability-toggle-grid');
  for (const [key, label] of ABILITY_OPTIONS) {
    const field = node('label', 'ability-toggle');
    const input = node('input');
    input.type = 'checkbox';
    input.checked = config.abilities[key] !== false;
    input.dataset.ability = key;
    const text = node('span', '', label);
    field.append(input, text);
    abilityGrid.append(field);
  }
  abilities.append(abilityGrid);
  container.append(abilities);
  const summary = node('div', 'role-config-summary');
  summary.dataset.roleSummary = 'true';
  container.append(summary);
  container.addEventListener('input', () => updateRoleConfigSummary(container));
  container.addEventListener('change', () => updateRoleConfigSummary(container));
  updateRoleConfigSummary(container);
}

function readRoleSettings(container) {
  const roleCounts = {};
  const abilities = {};
  for (const input of container.querySelectorAll('[data-role-count]')) {
    const count = Number(input.value);
    if (!Number.isInteger(count) || count < 0 || count > 20) {
      throw new Error('Jumlah setiap role harus berupa bilangan bulat antara 0 dan 20.');
    }
    roleCounts[input.dataset.roleCount] = count;
  }
  for (const input of container.querySelectorAll('[data-ability]')) {
    abilities[input.dataset.ability] = input.checked;
  }
  return { roleCounts, abilities };
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
}

function renderPlayerPhase(parent) {
  const loverNames = roomState.self?.loverNames || [];
  if (loverNames.length === 2) {
    const message = roomState.self.role === 'cupid'
      ? 'Pasangan yang kamu hubungkan: ' + loverNames.join(' & ') + '.'
      : 'Kamu terikat sebagai pasangan dengan ' + loverNames.filter(name => name !== roomState.self.name).join(' & ') + '. Jika salah satu tereliminasi, pasangannya ikut tereliminasi.';
    addText(parent, 'div', 'notice success', message);
  }
  switch (roomState.room.phase) {
    case 'lobby':
      addText(parent, 'div', 'notice', 'Menunggu moderator memulai permainan.');
      break;
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
  addText(parent, 'div', 'notice', 'Pemain bergabung: ' + roomState.players.length + ' / 20. Minimal 5 pemain. Jumlah role harus sama dengan jumlah pemain; moderator tidak dihitung.');
  const settings = roomState.room.settings || {};
  const configEditor = node('div', 'role-config-lobby');
  renderRoleConfigEditor(configEditor, settings);
  parent.append(configEditor);
  parent.append(button('Simpan pengaturan role', 'secondary wide', () => {
    try {
      sendAction('update_settings', { settings: readRoleSettings(configEditor) });
    } catch (error) {
      showMessage(error.message, true);
    }
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
  if (roomState.players.length < 5) addText(balance, 'p', 'hint', 'Tambahkan pemain hingga minimal 5 orang.');
  else if (!exact) addText(balance, 'p', 'notice warning', 'Jumlah role ' + totals.total + ' belum sama dengan ' + roomState.players.length + ' pemain. Sesuaikan angka role lalu simpan.');
  else if (totals.wolves < 1 || totals.village < 1) addText(balance, 'p', 'notice warning', 'Harus ada minimal satu anggota kubu Werewolf dan satu anggota kubu Desa.');
  else addText(balance, 'p', 'hint', 'Komposisi sudah sesuai dengan jumlah pemain.');
  parent.append(balance);

  const maxBots = Math.min(20, 20 - roomState.players.length);
  const botBox = node('div', 'bot-setup');
  addText(botBox, 'h3', '', 'Mode latihan vs bot');
  addText(botBox, 'p', 'hint', 'Bot otomatis membuka kartu, melakukan aksi malam, dan memberikan suara. Lima bot dapat digunakan untuk latihan dengan satu moderator.');
  const botLabel = node('label', 'bot-count-label');
  botLabel.append(node('span', '', 'Jumlah bot tambahan'));
  const botCount = node('select');
  botCount.id = 'botCount';
  const choices = [1, 2, 3, 4, 5, 8, 10, 15, 20].filter(value => value <= maxBots);
  if (maxBots > 0 && !choices.length) choices.push(maxBots);
  for (const value of choices) botCount.append(new Option(value + ' bot', String(value)));
  botCount.value = String(choices.includes(5) ? 5 : (choices[0] || 0));
  botLabel.append(botCount);
  botBox.append(botLabel);
  botBox.append(button('Tambahkan bot otomatis', 'secondary wide', () => sendAction('add_bots', { count: Number(botCount.value) }), maxBots < 1));
  if (maxBots < 1) addText(botBox, 'p', 'hint', 'Room sudah penuh.');
  parent.append(botBox);

  const canStart = roomState.players.length >= 5 && exact && totals.wolves >= 1 && totals.village >= 1;
  parent.append(button('Mulai Permainan & Bagikan Kartu', 'primary wide', () => sendAction('start_game'), !canStart));
  addText(parent, 'p', 'hint', 'Kartu dibagikan secara privat. Setiap pemain membukanya sendiri pada perangkat masing-masing.');
}

function renderModeratorRoleDraw(parent) {
  phaseHeader(parent, 'PEMBAGIAN KARTU', 'Tunggu semua pemain membuka kartu', 'Setiap pemain membuka kartu pada perangkatnya sendiri. Moderator tidak melihat kartu pemain melalui layar pemain, tetapi dapat memantau status pembukaan di sini.');
  const opened = roomState.players.filter(player => player.hasDrawn).length;
  addText(parent, 'div', 'notice', opened + ' / ' + roomState.players.length + ' pemain sudah membuka kartu.');
  const complete = roomState.players.length > 0 && opened === roomState.players.length;
  parent.append(button('Lanjut ke Malam 1', 'primary wide', () => sendAction('start_night'), !complete));
}

function renderModeratorNight(parent) {
  phaseHeader(parent, 'MALAM ' + roomState.room.round, 'Menunggu aksi malam', 'Pantau status aksi semua pemain. Target dan hasil setiap aksi hanya terlihat oleh moderator.');
  const room = roomState.room;
  addText(parent, 'div', 'notice', room.nightActionsSubmitted + ' / ' + room.nightActionsRequired + ' pemain sudah menyelesaikan aksi malam.');
  const complete = room.nightActionsSubmitted >= room.nightActionsRequired;
  parent.append(button('Lanjut ke Pagi', 'primary wide', () => sendAction('resolve_night'), !complete));
  if (!complete) parent.append(button('Lewati pemain yang belum beraksi', 'secondary wide', () => {
    if (confirm('Aksi pemain yang belum selesai akan dilewati. Lanjutkan ke pagi?')) sendAction('resolve_night', { force: true });
  }));
}

function renderModeratorMorning(parent) {
  phaseHeader(parent, 'PAGI HARI · RONDE ' + roomState.room.round, 'Hasil kejadian malam', 'Bacakan hasil ini kepada pemain. Layar pemain hanya menampilkan status pribadi: bertahan atau tereliminasi.');
  const result = roomState.room.lastResult;
  const card = node('div', 'result-card');
  addText(card, 'h3', '', result?.message || 'Malam telah berlalu.');
  if (result?.eliminatedId) {
    const eliminated = roomState.players.find(player => player.id === result.eliminatedId);
    if (eliminated) addText(card, 'p', '', 'Pemain: ' + eliminated.name + ' · Peran: ' + roleLabel(eliminated.role));
  }
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
  const room = roomState.room;
  phaseHeader(parent, 'FASE DISKUSI', 'Atur ruang diskusi', 'Pilih diskusi tatap muka atau online. Tidak ada hitung mundur; moderator menentukan sendiri kapan voting dimulai.');
  const panel = node('div', 'discussion-mode-panel');
  addText(panel, 'h3', '', 'Pilih mode diskusi');
  addText(panel, 'p', 'hint', 'Mode yang dipilih akan ditampilkan pada perangkat seluruh pemain.');
  const controls = node('div', 'discussion-mode-grid');
  controls.append(button('Diskusi offline', room.discussionMode === 'offline' ? 'action-button selected' : 'secondary', () => sendAction('set_discussion', { mode: 'offline' })));
  controls.append(button('Simpan diskusi online', room.discussionMode === 'online' ? 'action-button selected' : 'secondary', () => {
    const input = $('discussionCallUrl');
    sendAction('set_discussion', { mode: 'online', callUrl: input?.value.trim() || '' });
  }));
  panel.append(controls);
  const label = node('label', 'discussion-link-field');
  label.append(node('span', '', 'Tautan pertemuan online (HTTPS)'));
  const input = node('input', 'discussion-link-input');
  input.id = 'discussionCallUrl';
  input.type = 'url';
  input.placeholder = 'https://meet.google.com/...';
  input.autocomplete = 'url';
  input.value = room.callUrl || '';
  label.append(input);
  panel.append(label);
  if (room.discussionMode === 'offline') {
    addText(panel, 'div', 'notice success', 'Mode aktif: diskusi tatap muka. Pemain dapat berdiskusi secara langsung.');
  } else if (room.discussionMode === 'online') {
    addText(panel, 'div', 'notice success', 'Mode aktif: diskusi online. Tautan pertemuan dibagikan kepada pemain.');
    const link = node('a', 'call-link', 'Buka ruang diskusi online');
    link.href = room.callUrl;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    panel.append(link);
  } else {
    addText(panel, 'div', 'notice', 'Mode diskusi belum ditentukan. Pilih salah satu mode sebelum voting.');
  }
  parent.append(panel);

  const botMessages = Array.isArray(roomState.chat) ? roomState.chat : [];
  if (botMessages.length) {
    const log = node('section', 'bot-discussion-log');
    addText(log, 'div', 'eyebrow-small', 'SIMULASI DISKUSI BOT');
    addText(log, 'h3', '', 'Komentar bot (simulasi)');
    addText(log, 'p', 'hint', 'Komentar otomatis berbasis role dan petunjuk permainan, bukan percakapan AI. Tidak ada timer; moderator bebas melanjutkan kapan saja.');
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

  parent.append(button('Lanjut ke Voting', 'primary wide', () => sendAction('start_voting'), !room.discussionMode));
}

function renderModeratorVoting(parent) {
  phaseHeader(parent, 'FASE VOTING', 'Pantau suara pemain', 'Pilihan setiap pemain hanya terlihat oleh moderator. Hasil diumumkan setelah moderator menekan Lanjut.');
  const room = roomState.room;
  addText(parent, 'div', 'notice', room.votesSubmitted + ' / ' + room.votesRequired + ' suara sudah masuk.');
  const complete = room.votesSubmitted >= room.votesRequired;
  parent.append(button('Lanjut · Umumkan hasil voting', 'primary wide', () => sendAction('resolve_vote'), !complete));
  if (!complete) parent.append(button('Hitung suara yang sudah masuk', 'secondary wide', () => {
    if (confirm('Pemain yang belum memilih akan dilewati. Hitung suara sekarang?')) sendAction('resolve_vote', { force: true });
  }));
}

function renderModeratorResult(parent) {
  phaseHeader(parent, 'HASIL VOTING', 'Bacakan hasil voting', 'Moderator dapat melihat pemain yang tereliminasi beserta perannya. Pemain lain hanya melihat status pribadinya.');
  const result = roomState.room.lastResult;
  const card = node('div', 'result-card');
  addText(card, 'h3', '', result?.message || 'Hasil voting tersedia.');
  if (result?.eliminatedId) {
    const eliminated = roomState.players.find(player => player.id === result.eliminatedId);
    if (eliminated) addText(card, 'p', '', 'Pemain: ' + eliminated.name + ' · Peran: ' + roleLabel(eliminated.role));
  }
  parent.append(card);
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
  const card = node('div', 'result-card');
  for (const player of roomState.players) {
    card.append(node('p', '', player.name + ' — ' + roleLabel(player.role) + (player.alive ? ' · Hidup' : ' · Tereliminasi')));
  }
  parent.append(card);
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
  if (!self.role) {
    addText(parent, 'div', 'notice warning', 'Kartu belum dibuka. Hubungi moderator.');
    return;
  }
  renderRoleCard(parent, self.role);
  if (self.hasActed) {
    addText(parent, 'div', 'notice success', 'Aksimu sudah dikirim. Tunggu moderator.');
    if (['seer', 'detective'].includes(self.role) && self.seerResult) {
      const result = self.seerResult.result === 'wolf' || self.seerResult.result === 'wolf_team'
        ? (self.role === 'detective' ? 'kubu Werewolf' : 'Werewolf')
        : self.seerResult.result === 'neutral' ? 'kubu Netral'
          : self.role === 'detective' ? 'kubu Desa' : 'bukan Werewolf';
      addText(parent, 'div', 'notice', 'Hasil pemeriksaan: ' + self.seerResult.playerName + ' termasuk ' + result + '.');
    }
    return;
  }
  const roleAbility = {
    seer: 'seerInspection', doctor: 'doctorProtection', bodyguard: 'bodyguardSacrifice',
    cupid: 'cupidBond', detective: 'detectiveInspection'
  };
  if (['villager', 'hunter', 'mayor', 'jester'].includes(self.role)
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
    const grid = node('div', 'action-grid');
    for (const target of targets) grid.append(button(target.name, 'action-button', () => sendAction('night_action', { targetId: target.id })));
    parent.append(grid);
  } else if (['seer', 'detective', 'doctor', 'bodyguard', 'guardian_angel'].includes(self.role)) {
    const titles = {
      seer: 'Periksa identitas', detective: 'Periksa kubu', doctor: 'Lindungi pemain',
      bodyguard: 'Jaga pemain',
      guardian_angel: abilityOn('guardianProtection') ? 'Pilih target perlindungan' : 'Pilih target kemenangan tambahan'
    };
    addText(parent, 'h3', '', titles[self.role]);
    const grid = node('div', 'action-grid');
    for (const target of targets) grid.append(button(target.name, 'action-button', () => sendAction('night_action', { targetId: target.id })));
    parent.append(grid);
    if (self.role === 'guardian_angel' && self.guardianTargetName) addText(parent, 'p', 'hint', 'Target pilihan terakhir: ' + self.guardianTargetName);
  } else if (self.role === 'witch') {
    const potions = self.witchPotions || { heal: false, poison: false };
    const attack = self.witchAttack || { ready: false, targetName: null, tied: false };
    addText(parent, 'h3', '', 'Pilih ramuan');
    if (!attack.ready) {
      addText(parent, 'div', 'notice', 'Menunggu seluruh Werewolf menyelesaikan pilihan serangan. Target hanya terlihat oleh Witch.');
    } else if (attack.targetName) {
      addText(parent, 'div', 'notice warning', 'Target serangan Werewolf: ' + attack.targetName + '. Gunakan ramuan penyembuh untuk menyelamatkannya.');
    } else {
      addText(parent, 'div', 'notice', attack.tied ? 'Suara Werewolf seri. Tidak ada target untuk diselamatkan.' : 'Tidak ada target serangan Werewolf yang dapat diselamatkan.');
    }
    if (potions.heal) {
      parent.append(button('Gunakan ramuan penyembuh', 'secondary wide',
        () => sendAction('night_action', { mode: 'heal' }), !attack.ready || !attack.targetName));
    }
    if (potions.poison) {
      addText(parent, 'p', 'hint', 'Pilih target untuk ramuan racun:');
      const grid = node('div', 'action-grid');
      for (const target of targets) grid.append(button('Racun · ' + target.name, 'action-button', () => sendAction('night_action', { targetId: target.id, mode: 'poison' })));
      parent.append(grid);
    }
    parent.append(button('Lewati penggunaan ramuan', 'secondary wide', () => sendAction('night_pass')));
  } else if (self.role === 'cupid' && roomState.room.round === 1) {
    addText(parent, 'h3', '', 'Hubungkan dua pemain');
    const first = node('select', 'target-select');
    const second = node('select', 'target-select');
    first.id = 'cupidFirst';
    second.id = 'cupidSecond';
    first.append(new Option('Pemain pertama', ''));
    second.append(new Option('Pemain kedua', ''));
    for (const target of targets) {
      first.append(new Option(target.name, target.id));
      second.append(new Option(target.name, target.id));
    }
    parent.append(first, second);
    parent.append(button('Hubungkan pasangan', 'primary wide', () => {
      if (!first.value || !second.value || first.value === second.value) {
        showMessage('Pilih dua pemain yang berbeda.', true);
        return;
      }
      sendAction('night_action', { targetId: first.value, partnerId: second.value });
    }));
  }
}

function renderPlayerDiscussion(parent) {
  const room = roomState.room;
  if (room.discussionMode === 'offline') {
    addText(parent, 'div', 'notice success', 'Diskusi tatap muka sedang berlangsung. Ikuti arahan moderator dan berdiskusilah bersama pemain lain.');
  } else if (room.discussionMode === 'online') {
    addText(parent, 'div', 'notice success', 'Diskusi online sedang berlangsung. Buka tautan pertemuan untuk bergabung.');
    if (room.callUrl) {
      const link = node('a', 'call-link', 'Buka ruang diskusi online');
      link.href = room.callUrl;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      parent.append(link);
    }
  } else {
    addText(parent, 'div', 'notice', 'Menunggu moderator menentukan mode diskusi.');
  }
  if (roomState.self.role === 'hunter' && !roomState.self.alive) renderHunterShot(parent);
}

function renderPlayerMorning(parent) {
  addText(parent, 'div', roomState.self.status === 'eliminated' ? 'notice warning' : 'notice success',
    roomState.self.status === 'eliminated' ? 'Kamu tereliminasi.' : 'Kamu bertahan.');
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

function renderPlayerVoting(parent) {
  const self = roomState.self;
  if (!self.alive) {
    addText(parent, 'div', 'notice warning', 'Kamu sudah tereliminasi dan tidak dapat memberikan suara.');
    return;
  }
  if (self.hasVoted) {
    addText(parent, 'div', 'notice success', 'Suaramu sudah masuk. Tunggu moderator.');
    return;
  }
  addText(parent, 'h3', '', 'Pilih satu pemain');
  const grid = node('div', 'action-grid');
  for (const target of (roomState.targets || []).filter(item => item.id !== self.id)) {
    grid.append(button(target.name, 'action-button', () => {
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
  showMessage('Membuat room...');
  try {
    const result = await request('/rooms', {
      method: 'POST',
      auth: false,
      body: {
        name: $('createName').value.trim()
      }
    });
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
