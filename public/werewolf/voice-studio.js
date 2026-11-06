const DEVELOPER_EMAILS = new Set([
  'irvan1609@gmail.com',
  'achmad.kautsar@gmail.com'
]);
const PHASES = [
  ['role_draw', 'Pembukaan kartu'],
  ['night', 'Tengah malam'],
  ['dawn', 'Subuh'],
  ['morning', 'Pagi dan diskusi'],
  ['voting', 'Voting'],
  ['finished', 'Akhir permainan']
];
const DB_NAME = 'werewolf-voice-studio';
const STORE_NAME = 'clips';
let dbPromise;
let clips = new Map();
let activeAudio = null;
let recorder = null;
let recorderChunks = [];
let recorderPhase = '';

function currentEmail() {
  return String(window.IrvanAccount?.user?.email || '').trim().toLowerCase();
}

function isDeveloper() {
  return DEVELOPER_EMAILS.has(currentEmail());
}

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME, { keyPath: 'phase' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return dbPromise;
}

async function readClips() {
  try {
    const db = await openDb();
    const rows = await new Promise((resolve, reject) => {
      const request = db.transaction(STORE_NAME).objectStore(STORE_NAME).getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
    clips = new Map(rows.map(row => [row.phase, row]));
  } catch {
    clips = new Map();
  }
}

async function putClip(phase, blob, name) {
  const db = await openDb();
  const row = { phase, blob, name: name || 'Rekaman narator', updatedAt: new Date().toISOString() };
  await new Promise((resolve, reject) => {
    const request = db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).put(row);
    request.onsuccess = resolve;
    request.onerror = () => reject(request.error);
  });
  clips.set(phase, row);
  updateRows();
}

async function deleteClip(phase) {
  const db = await openDb();
  await new Promise((resolve, reject) => {
    const request = db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).delete(phase);
    request.onsuccess = resolve;
    request.onerror = () => reject(request.error);
  });
  clips.delete(phase);
  updateRows();
}

function stopAudio() {
  if (!activeAudio) return;
  activeAudio.pause();
  activeAudio.currentTime = 0;
  activeAudio = null;
}

function playClip(phase) {
  const row = clips.get(phase);
  if (!row?.blob) return false;
  try {
    stopAudio();
    activeAudio = new Audio(URL.createObjectURL(row.blob));
    activeAudio.volume = 0.92;
    activeAudio.addEventListener('ended', () => {
      if (activeAudio) activeAudio = null;
    }, { once: true });
    void activeAudio.play().catch(() => {});
    return true;
  } catch {
    return false;
  }
}

function phaseLabel(phase) {
  return PHASES.find(item => item[0] === phase)?.[1] || phase;
}

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[character]));
}

function renderPanel() {
  if (document.getElementById('developerVoicePanel') || !isDeveloper()) return;
  const panel = document.createElement('section');
  panel.id = 'developerVoicePanel';
  panel.className = 'panel developer-voice-panel';
  panel.innerHTML = \`
    <div class="section-heading">
      <div><small>DEVELOPER VOICE STUDIO</small><h2>Suara narator Werewolf</h2></div>
      <span class="status-pill" data-voice-developer>Developer</span>
    </div>
    <p class="hint">Masukkan rekaman suara temanmu untuk setiap fase. File disimpan di browser ini dan otomatis dipakai sebagai narator saat fase berubah. Jika belum ada rekaman, game tetap memakai suara bawaan browser.</p>
    <div class="developer-voice-rows"></div>
    <p class="developer-voice-note">Akun developer aktif: <b data-voice-email></b>. Rekaman tidak dikirim ke server.</p>
  \`;
  panel.querySelector('[data-voice-email]').textContent = currentEmail();
  const rows = panel.querySelector('.developer-voice-rows');
  for (const [phase, label] of PHASES) {
    const row = document.createElement('div');
    row.className = 'developer-voice-row';
    row.dataset.phase = phase;
    row.innerHTML = \`
      <div><strong>\${escapeHtml(label)}</strong><small data-voice-name>Belum ada suara</small></div>
      <div class="developer-voice-actions">
        <label class="voice-file-button">Pilih audio<input type="file" accept="audio/*" data-voice-file></label>
        <button type="button" class="secondary" data-voice-record>Rekam</button>
        <button type="button" class="secondary" data-voice-play disabled>Putar</button>
        <button type="button" class="text-button" data-voice-clear disabled>Hapus</button>
      </div>
    \`;
    const file = row.querySelector('[data-voice-file]');
    file.addEventListener('change', async () => {
      const selected = file.files?.[0];
      if (!selected) return;
      await putClip(phase, selected, selected.name);
      file.value = '';
    });
    row.querySelector('[data-voice-record]').addEventListener('click', () => toggleRecording(phase, row));
    row.querySelector('[data-voice-play]').addEventListener('click', () => playClip(phase));
    row.querySelector('[data-voice-clear]').addEventListener('click', () => deleteClip(phase));
    rows.append(row);
  }
  document.getElementById('entryPanel')?.after(panel);
  updateRows();
}

function updateRows() {
  const panel = document.getElementById('developerVoicePanel');
  if (!panel) return;
  for (const [phase] of PHASES) {
    const row = panel.querySelector('[data-phase="' + phase + '"]');
    if (!row) continue;
    const clip = clips.get(phase);
    row.querySelector('[data-voice-name]').textContent = clip
      ? clip.name + ' · ' + new Date(clip.updatedAt).toLocaleString('id-ID')
      : 'Belum ada suara';
    row.querySelector('[data-voice-play]').disabled = !clip;
    row.querySelector('[data-voice-clear]').disabled = !clip;
    const record = row.querySelector('[data-voice-record]');
    if (record) record.textContent = recorderPhase === phase ? 'Berhenti merekam' : 'Rekam';
  }
}

async function toggleRecording(phase, row) {
  if (recorderPhase === phase) {
    recorder?.stop();
    return;
  }
  if (recorder) recorder.stop();
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
    window.alert('Browser ini belum mendukung perekaman suara. Pilih file audio sebagai gantinya.');
    return;
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    recorderChunks = [];
    recorderPhase = phase;
    const mimeType = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg'].find(type => MediaRecorder.isTypeSupported(type)) || '';
    recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    recorder.ondataavailable = event => {
      if (event.data.size) recorderChunks.push(event.data);
    };
    recorder.onstop = async () => {
      stream.getTracks().forEach(track => track.stop());
      const blob = new Blob(recorderChunks, { type: recorder.mimeType || 'audio/webm' });
      const recordedPhase = recorderPhase;
      recorder = null;
      recorderPhase = '';
      recorderChunks = [];
      if (blob.size) await putClip(recordedPhase, blob, 'Rekaman ' + phaseLabel(recordedPhase));
      updateRows();
    };
    recorder.start();
    updateRows();
  } catch (error) {
    recorder = null;
    recorderPhase = '';
    window.alert(error?.name === 'NotAllowedError'
      ? 'Izin mikrofon ditolak. Aktifkan izin mikrofon atau pilih file audio.'
      : 'Perekaman suara tidak dapat dimulai.');
  }
}

async function init() {
  await readClips();
  if (!window.IrvanAccount?.ready) return;
  await window.IrvanAccount.ready();
  renderPanel();
}

window.WerewolfVoiceStudio = {
  play: playClip,
  isDeveloper
};

void init();
