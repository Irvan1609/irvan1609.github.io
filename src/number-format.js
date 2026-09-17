import {initDisplaySettings} from './display-settings.js';
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
  const precision = Number.isInteger(digits) && digits >= 0 ? digits : 3;
  // Values that round to zero should be displayed as +0, not “-0.000”.
  // This is display-only normalization; the underlying statistical value is unchanged.
  const roundedZeroThreshold = 0.5 * 10 ** (-precision);
  const displayValue = Math.abs(value) < roundedZeroThreshold ? 0 : value;
  return displayValue.toLocaleString(separator === ',' ? 'id-ID' : 'en-US', {
    useGrouping: false,
    minimumFractionDigits: precision,
    maximumFractionDigits: precision
  });
}

export function initNumberSettings() {
  initDisplaySettings();
  if (document.querySelector('#decimalSeparator')) return;
  const mount=document.querySelector('#numberSettingsMount');
  if(!mount)return;
  const section=document.createElement('section');
  section.className='settings-section';
  const detectedText = detected === ',' ? 'koma (,)' : 'titik (.)';
  section.innerHTML = `<div class="settings-detected">Terdeteksi dari browser/laptop: <b>${detectedText}</b></div>
    <label for="decimalSeparator">Pemisah desimal</label>
    <select id="decimalSeparator">
      <option value=".">Titik (.) — contoh: 23.47</option>
      <option value=",">Koma (,) — contoh: 23,47</option>
    </select>
    <p>Pilih sesuai format angka yang Anda salin dari Excel. Jangan gunakan pemisah ribuan.</p>`;
  mount.append(section);
  const select = section.querySelector('select');
  select.value = separator;
  const save=()=>{
    separator = select.value;
    try { localStorage.setItem(KEY, separator); } catch {}
    document.querySelectorAll('#ralResult, #rakResult, #scienceResults, #historyResult, #assocResult, #advancedResult, #nextgenResult, #mixedResult').forEach(el => { el.innerHTML = ''; });
    const status = document.querySelector('#status');
    const text = separator === ',' ? 'koma (,)' : 'titik (.)';
    if (status) status.textContent = `✓ Format angka diubah menjadi ${text}. Jalankan kembali analisis.`;
  };
  select.addEventListener('change',save);
  select.addEventListener('settings-save',save);
}
