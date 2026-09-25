import './payment-gate.css';
import { PAYMENT_CONFIG } from './payment-config.js';
import { ANALYSIS_TARGETS, formatIdr, isPaymentConfigured, normalizeApiBaseUrl } from './payment-core.js';

const CREDIT_KEY = 'statistical_web_analysis_credit_v1';
const LAST_ORDER_KEY = 'statistical_web_last_payment_order_v1';
let pollTimer = null;
let pollStartedAt = 0;
let pendingButton = null;
let activeObserver = null;

function includedAnalysisAccess(){
  return Boolean(window.IrvanAccount?.authenticated&&window.IrvanAccount?.user?.features?.analysisIncluded);
}
function includedAccessLabel(){
  const user=window.IrvanAccount?.user;
  return user?.role==='admin'?'Admin · Analisis bebas':(user?.membership?.active?'Membership · Analisis bebas':'');
}

function readSession(key) {
  try { return sessionStorage.getItem(key); } catch { return null; }
}
function writeSession(key, value) {
  try { sessionStorage.setItem(key, value); return true; } catch { return false; }
}
function removeSession(key) {
  try { sessionStorage.removeItem(key); } catch { /* ignore storage restrictions */ }
}
function readCredit() {
  try {
    const value = JSON.parse(readSession(CREDIT_KEY) || 'null');
    return value?.orderId && value?.token ? value : null;
  } catch { return null; }
}
function saveCredit(credit) {
  writeSession(CREDIT_KEY, JSON.stringify(credit));
  writeSession(LAST_ORDER_KEY, credit.orderId);
  updateCreditButton();
  document.addEventListener('accountchange',updateCreditButton);
}
function clearCredit() {
  removeSession(CREDIT_KEY);
  updateCreditButton();
}
function apiUrl(path) {
  return normalizeApiBaseUrl(PAYMENT_CONFIG.apiBaseUrl) + path;
}
function paymentRequest(path, options = {}) {
  return fetch(apiUrl(path), {
    credentials: 'omit',
    cache: 'no-store',
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }
  });
}
function modal() { return document.querySelector('#paymentModal'); }
function message(text, type = '') {
  const el = document.querySelector('#paymentMessage');
  if (!el) return;
  el.className = `payment-message${type ? ` ${type}` : ''}`;
  el.textContent = text;
}
function stopPolling() {
  if (pollTimer) clearTimeout(pollTimer);
  pollTimer = null;
  pollStartedAt = 0;
}
function closePayment() {
  stopPolling();
  modal()?.classList.remove('open');
  pendingButton = null;
}
function updateCreditButton() {
  const button = document.querySelector('#paymentCreditStatus');
  if (!button) return;
  const included=includedAccessLabel();
  button.textContent = included || (readCredit() ? 'Kredit analisis: 1' : 'Kredit analisis: 0');
}
function resetPaymentView() {
  const qr = document.querySelector('#paymentQr');
  const order = document.querySelector('#paymentOrder');
  if (qr) { qr.hidden = true; qr.removeAttribute('src'); }
  if (order) order.textContent = '';
  const recover = document.querySelector('#paymentRecover');
  if (recover) recover.hidden = !readSession(LAST_ORDER_KEY);
  message(isPaymentConfigured(PAYMENT_CONFIG)
    ? `${PAYMENT_CONFIG.mode === 'sandbox' ? 'Mode Sandbox. ' : ''}Satu pembayaran membuka satu kali analisis.`
    : 'Pembayaran belum diaktifkan oleh pemilik situs.');
}
function openPayment(button = null) {
  if(includedAnalysisAccess()){
    const status=document.querySelector('#status');
    if(status)status.textContent='✓ Akses analisis termasuk dalam akun Anda.';
    return;
  }
  pendingButton = button;
  resetPaymentView();
  modal()?.classList.add('open');
}
async function parseJson(response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.message || `Server pembayaran merespons ${response.status}.`);
  return data;
}
async function createPayment() {
  if (!isPaymentConfigured(PAYMENT_CONFIG)) {
    message('Backend pembayaran belum dikonfigurasi.', 'error');
    return;
  }
  const button = document.querySelector('#paymentCreate');
  button.disabled = true;
  message('Membuat QRIS…');
  try {
    const data = await parseJson(await paymentRequest('/payments/create', { method: 'POST', body: '{}' }));
    if (!data.orderId || !data.qrUrl) throw new Error('Respons pembayaran tidak berisi QRIS yang valid.');
    writeSession(LAST_ORDER_KEY, data.orderId);
    const qr = document.querySelector('#paymentQr');
    qr.src = data.qrUrl;
    qr.alt = `QRIS untuk pembayaran ${formatIdr(PAYMENT_CONFIG.priceIdr)}`;
    qr.hidden = false;
    document.querySelector('#paymentOrder').textContent = `ID transaksi: ${data.orderId}`;
    document.querySelector('#paymentRecover').hidden = false;
    message(`Pindai QRIS ${formatIdr(PAYMENT_CONFIG.priceIdr)}. Status akan diperiksa otomatis.`);
    startPolling(data.orderId);
  } catch (error) {
    message(error.message || 'QRIS tidak dapat dibuat.', 'error');
  } finally {
    button.disabled = false;
  }
}
function startPolling(orderId) {
  stopPolling();
  pollStartedAt = Date.now();
  const tick = async () => {
    if (Date.now() - pollStartedAt > PAYMENT_CONFIG.pollTimeoutMs) {
      message('Waktu pemeriksaan pembayaran habis. Gunakan “Pulihkan pembayaran terakhir” bila Anda sudah membayar.', 'error');
      stopPolling();
      return;
    }
    try {
      const data = await parseJson(await paymentRequest(`/payments/status?order_id=${encodeURIComponent(orderId)}`, { method: 'GET', headers: {} }));
      if (data.paid && data.token) {
        stopPolling();
        saveCredit({ orderId, token: data.token });
        message('Pembayaran terverifikasi. Satu kredit analisis tersedia.', 'success');
        const target = pendingButton;
        setTimeout(() => {
          modal()?.classList.remove('open');
          pendingButton = null;
          if (target?.isConnected) target.click();
        }, 350);
        return;
      }
      if (data.used) {
        stopPolling();
        clearCredit();
        message('Kredit dari transaksi ini sudah digunakan.', 'error');
        return;
      }
      if (['expire', 'deny', 'cancel'].includes(data.status)) {
        stopPolling();
        message(`Transaksi berstatus ${data.status}. Buat QRIS baru untuk melanjutkan.`, 'error');
        return;
      }
    } catch (error) {
      message(`${error.message || 'Status pembayaran tidak dapat diperiksa.'} Mencoba lagi…`, 'error');
    }
    pollTimer = setTimeout(tick, PAYMENT_CONFIG.pollIntervalMs);
  };
  void tick();
}
function recoverLastPayment() {
  const orderId = readSession(LAST_ORDER_KEY);
  if (!orderId) return message('Belum ada transaksi yang dapat dipulihkan.', 'error');
  message('Memeriksa pembayaran terakhir…');
  startPolling(orderId);
}
async function consumeCredit(credit) {
  clearCredit();
  try {
    const data = await parseJson(await paymentRequest('/credits/consume', {
      method: 'POST',
      body: JSON.stringify({ orderId: credit.orderId, token: credit.token })
    }));
    if (!data.consumed) throw new Error('Kredit tidak dapat dikonfirmasi.');
    const status = document.querySelector('#status');
    if (status) status.textContent = '✓ Analisis selesai. Kredit pembayaran telah digunakan.';
  } catch (error) {
    console.error('Gagal mengonfirmasi pemakaian kredit.', error);
    const status = document.querySelector('#status');
    if (status) status.textContent = '⚠ Analisis selesai, tetapi status kredit tidak dapat dikonfirmasi. Jangan membayar ulang sebelum memeriksa transaksi terakhir.';
  }
}
function armCreditConsumption(button, credit) {
  const target = ANALYSIS_TARGETS[button.id];
  const result = target ? document.querySelector(target.result) : null;
  if (!result || typeof MutationObserver === 'undefined') return;
  if (activeObserver) activeObserver.disconnect();
  let finished = false;
  const release = () => {
    if (finished) return;
    finished = true;
    activeObserver?.disconnect();
    activeObserver = null;
  };
  activeObserver = new MutationObserver(records => {
    if (!records.length || !result.textContent.trim()) return;
    release();
    void consumeCredit(credit);
  });
  activeObserver.observe(result, { childList: true, subtree: true, characterData: true });
  setTimeout(() => {
    if (finished) return;
    if (!button.disabled && !result.textContent.trim()) release();
  }, 150);
  setTimeout(release, Math.max(60_000, PAYMENT_CONFIG.pollTimeoutMs));
}
function interceptAnalysis(event) {
  const button = event.target.closest?.('button');
  if (!button || !ANALYSIS_TARGETS[button.id] || !PAYMENT_CONFIG.enabled) return;
  if(includedAnalysisAccess())return;
  if (!isPaymentConfigured(PAYMENT_CONFIG)) {
    event.preventDefault();
    event.stopImmediatePropagation();
    openPayment(button);
    return;
  }
  const credit = readCredit();
  if (!credit) {
    event.preventDefault();
    event.stopImmediatePropagation();
    openPayment(button);
    return;
  }
  armCreditConsumption(button, credit);
}
function injectPaymentUi() {
  document.body.insertAdjacentHTML('beforeend', `<div id="paymentModal" class="modal-backdrop"><div class="modal payment-dialog" role="dialog" aria-modal="true" aria-labelledby="paymentTitle"><div class="modal-head"><strong id="paymentTitle">Bayar analisis dengan QRIS</strong><button id="paymentCloseX" type="button" aria-label="Tutup pembayaran">✕</button></div><div class="modal-body"><p class="payment-price">1 kali analisis = <strong>${formatIdr(PAYMENT_CONFIG.priceIdr)}</strong></p><p id="paymentMessage" class="payment-message" role="status"></p><img id="paymentQr" class="payment-qr" alt="QRIS pembayaran" hidden><p id="paymentOrder" class="payment-order"></p><p class="form-help">Kredit baru dipakai setelah hasil analisis berhasil dibuat. Jangan bagikan token atau konfigurasi backend pembayaran.</p></div><div class="modal-foot"><button id="paymentRecover" type="button" hidden>Pulihkan pembayaran terakhir</button><button id="paymentCreate" type="button" class="primary">Buat QRIS${PAYMENT_CONFIG.mode === 'sandbox' ? ' Sandbox' : ''}</button><button id="paymentClose" type="button">Tutup</button></div></div></div>`);
  const nav = document.querySelector('.nav');
  if (nav) {
    const button = document.createElement('button');
    button.id = 'paymentCreditStatus';
    button.type = 'button';
    button.title = 'Pembayaran dan kredit analisis';
    button.addEventListener('click', () => openPayment());
    nav.append(button);
  }
  document.querySelector('#paymentClose').onclick = closePayment;
  document.querySelector('#paymentCloseX').onclick = closePayment;
  document.querySelector('#paymentCreate').onclick = createPayment;
  document.querySelector('#paymentRecover').onclick = recoverLastPayment;
  modal().addEventListener('click', event => { if (event.target === modal()) closePayment(); });
  updateCreditButton();
}

export function installPaymentGate() {
  if (!PAYMENT_CONFIG.enabled) return;
  injectPaymentUi();
  document.addEventListener('click', interceptAnalysis, true);
}
