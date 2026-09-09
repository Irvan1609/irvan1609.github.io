const KEY = 'statistical_web_decimal_separator';

function detectedSeparator() {
  try {
    const decimal = new Intl.NumberFormat().formatToParts(1.1).find(part => part.type === 'decimal')?.value;
    return decimal === ',' ? ',' : '.';
  } catch {
    return '.';
  }
}

const detected = detectedSeparator();
let separator = detected;
try {
  const saved = localStorage.getItem(KEY);
  if (saved === ',' || saved === '.') separator = saved;
} catch {}

export function getDecimalSeparator() {
  return separator;
}

export function parseNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : NaN;
  const text = String(value ?? '').trim();
  const pattern = separator === ','
    ? /^[+-]?(?:\d+(?:,\d*)?|,\d+)(?:[eE][+-]?\d+)?$/
    : /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;
  return pattern.test(text) ? Number(text.replace(',', '.')) : NaN;
}

export function formatNumber(value, digits = 3) {
  if (value === Infinity) return '∞';
  if (!Number.isFinite(value)) return '—';
  return value.toLocaleString(separator === ',' ? 'id-ID' : 'en-US', {
    useGrouping: false,
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  });
}

export function initNumberSettings() {
  if (document.querySelector('#numberSettings')) return;
  const panel = document.createElement('details');
  panel.id = 'numberSettings';
  panel.className = 'number-settings';
  const detectedText = detected === ',' ? 'koma (,)' : 'titik (.)';
  panel.innerHTML = `<summary>⚙ Pengaturan format angka</summary>
    <div class="number-settings-body">
      <div class="number-detected">Terdeteksi dari browser/laptop: <b>${detectedText}</b></div>
      <label for="decimalSeparator">Angka pada data Anda menggunakan pemisah desimal:</label>
      <select id="decimalSeparator">
        <option value=".">Titik (.) — contoh: 23.47</option>
        <option value=",">Koma (,) — contoh: 23,47</option>
      </select>
      <p>Pilih sesuai format angka yang Anda salin dari Excel. Jangan gunakan pemisah ribuan. Pengaturan ini digunakan untuk membaca data dan menampilkan seluruh hasil analisis.</p>
    </div>`;
  const toolbar = document.querySelector('.toolbar');
  (toolbar || document.querySelector('main')).before(panel);
  const select = panel.querySelector('select');
  select.value = separator;
  select.addEventListener('change', () => {
    separator = select.value;
    try { localStorage.setItem(KEY, separator); } catch {}
    document.querySelectorAll('#ralResult, #rakResult').forEach(el => { el.innerHTML = ''; });
    const status = document.querySelector('#status');
    const text = separator === ',' ? 'koma (,)' : 'titik (.)';
    if (status) status.textContent = `✓ Format angka diubah menjadi ${text}. Jalankan kembali analisis.`;
  });
}
