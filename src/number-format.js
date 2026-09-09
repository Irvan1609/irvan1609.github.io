const KEY = 'statistical_web_decimal_separator';
let separator = '.';
try { separator = localStorage.getItem(KEY) === ',' ? ',' : '.'; } catch {}

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
    useGrouping: false, minimumFractionDigits: digits, maximumFractionDigits: digits
  });
}

export function initNumberSettings() {
  const panel = document.createElement('details');
  panel.className = 'number-settings';
  panel.innerHTML = '<summary>Pengaturan angka</summary><div class="number-settings-body"><label for="decimalSeparator">Pemisah desimal pada data Excel Anda</label><select id="decimalSeparator"><option value=".">Titik (.) — contoh: 13.50</option><option value=",">Koma (,) — contoh: 13,50</option></select><p>Pilih sesuai format angka pada laptop Anda. Masukkan angka tanpa pemisah ribuan. Pilihan ini berlaku untuk pembacaan data dan tampilan hasil.</p></div>';
  const toolbar = document.querySelector('.toolbar');
  (toolbar || document.querySelector('main')).before(panel);
  const select = panel.querySelector('select');
  select.value = separator;
  select.addEventListener('change', () => {
    separator = select.value;
    try { localStorage.setItem(KEY, separator); } catch {}
    document.querySelectorAll('#ralResult, #rakResult').forEach(el => { el.innerHTML = ''; });
    const status = document.querySelector('#status');
    if (status) status.textContent = 'Format angka diperbarui. Jalankan kembali analisis untuk melihat hasil.';
  });
}
