const JSON_HEADERS = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };

export function isSuccessfulPayment(status) {
  return status?.transaction_status === 'settlement' && (!status.fraud_status || status.fraud_status === 'accept');
}

function envPrice(env) {
  const value = Number(env.ANALYSIS_PRICE_IDR || 5000);
  return Number.isInteger(value) && value > 0 ? value : 5000;
}
function midtransBase(env) {
  return env.MIDTRANS_ENV === 'production' ? 'https://api.midtrans.com' : 'https://api.sandbox.midtrans.com';
}
function authHeader(env) {
  if (!env.MIDTRANS_SERVER_KEY) throw new Error('MIDTRANS_SERVER_KEY belum dikonfigurasi.');
  return `Basic ${btoa(`${env.MIDTRANS_SERVER_KEY}:`)}`;
}
function allowedOrigin(env) {
  return String(env.ALLOWED_ORIGIN || 'https://irvan1609.github.io').replace(/\/$/, '');
}
function corsHeaders(request, env) {
  const origin = request.headers.get('Origin');
  const allowed = allowedOrigin(env);
  return {
    'Access-Control-Allow-Origin': origin === allowed ? origin : allowed,
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin'
  };
}
function json(request, env, data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...JSON_HEADERS, ...corsHeaders(request, env) } });
}
function browserOriginAllowed(request, env) {
  const origin = request.headers.get('Origin');
  return !origin || origin === allowedOrigin(env);
}
function randomId(bytes = 16) {
  const data = new Uint8Array(bytes);
  crypto.getRandomValues(data);
  return [...data].map(value => value.toString(16).padStart(2, '0')).join('');
}
async function sha256(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}
async function midtransRequest(env, path, options = {}) {
  const response = await fetch(`${midtransBase(env)}${path}`, {
    ...options,
    headers: {
      Accept: 'application/json',
      Authorization: authHeader(env),
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {})
    }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = payload?.status_message || payload?.message || `Midtrans HTTP ${response.status}`;
    throw new Error(message);
  }
  return payload;
}
async function findPayment(env, orderId) {
  return env.DB.prepare('SELECT order_id, amount, status, credit_hash, used_at FROM payments WHERE order_id = ?').bind(orderId).first();
}
function safeOrderId(value) {
  const orderId = String(value || '');
  return /^stat-[0-9]{10,}-[a-f0-9]{16,64}$/.test(orderId) ? orderId : '';
}
async function syncMidtransStatus(env, payment) {
  const status = await midtransRequest(env, `/v2/${encodeURIComponent(payment.order_id)}/status`, { method: 'GET' });
  const gross = Number(status.gross_amount);
  if (!Number.isFinite(gross) || Math.round(gross) !== Number(payment.amount)) throw new Error('Nominal transaksi Midtrans tidak sesuai.');
  const nextStatus = String(status.transaction_status || 'unknown');
  await env.DB.prepare(`UPDATE payments
    SET status = ?, paid_at = CASE WHEN ? = 'settlement' THEN COALESCE(paid_at, CURRENT_TIMESTAMP) ELSE paid_at END,
        updated_at = CURRENT_TIMESTAMP
    WHERE order_id = ?`).bind(nextStatus, nextStatus, payment.order_id).run();
  return status;
}
async function createPayment(request, env) {
  const amount = envPrice(env);
  const orderId = `stat-${Date.now()}-${randomId(12)}`;
  const headers = {};
  if (env.PUBLIC_BASE_URL) headers['X-Override-Notification'] = `${String(env.PUBLIC_BASE_URL).replace(/\/$/, '')}/midtrans/webhook`;
  const charge = await midtransRequest(env, '/v2/charge', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      payment_type: 'qris',
      transaction_details: { order_id: orderId, gross_amount: amount },
      item_details: [{ id: 'analysis-credit-1', price: amount, quantity: 1, name: '1 kredit analisis statistik' }],
      qris: { acquirer: 'gopay' }
    })
  });
  const qr = (charge.actions || []).find(action => action.name === 'generate-qr-code-v2')
    || (charge.actions || []).find(action => action.name === 'generate-qr-code');
  if (!qr?.url) throw new Error('Midtrans tidak mengembalikan URL QRIS.');
  await env.DB.prepare('INSERT INTO payments (order_id, amount, status) VALUES (?, ?, ?)')
    .bind(orderId, amount, String(charge.transaction_status || 'pending')).run();
  return json(request, env, { orderId, amount, qrUrl: qr.url, status: charge.transaction_status || 'pending' }, 201);
}
async function paymentStatus(request, env, url) {
  const orderId = safeOrderId(url.searchParams.get('order_id'));
  if (!orderId) return json(request, env, { message: 'order_id tidak valid.' }, 400);
  const payment = await findPayment(env, orderId);
  if (!payment) return json(request, env, { message: 'Transaksi tidak ditemukan.' }, 404);
  if (payment.used_at) return json(request, env, { orderId, paid: true, used: true, status: payment.status });
  const status = await syncMidtransStatus(env, payment);
  if (!isSuccessfulPayment(status)) return json(request, env, { orderId, paid: false, used: false, status: status.transaction_status || payment.status });
  const token = randomId(32);
  const hash = await sha256(token);
  await env.DB.prepare(`UPDATE payments SET status = 'settlement', credit_hash = ?, paid_at = COALESCE(paid_at, CURRENT_TIMESTAMP), updated_at = CURRENT_TIMESTAMP
    WHERE order_id = ? AND used_at IS NULL`).bind(hash, orderId).run();
  return json(request, env, { orderId, paid: true, used: false, status: 'settlement', token });
}
async function consumeCredit(request, env) {
  const body = await request.json().catch(() => ({}));
  const orderId = safeOrderId(body.orderId);
  const token = String(body.token || '');
  if (!orderId || !/^[a-f0-9]{64}$/.test(token)) return json(request, env, { message: 'Kredit tidak valid.', consumed: false }, 400);
  const hash = await sha256(token);
  const result = await env.DB.prepare(`UPDATE payments SET used_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
    WHERE order_id = ? AND status = 'settlement' AND used_at IS NULL AND credit_hash = ?`).bind(orderId, hash).run();
  const consumed = Number(result?.meta?.changes || 0) === 1;
  return json(request, env, { consumed }, consumed ? 200 : 409);
}
async function handleWebhook(request, env) {
  const body = await request.json().catch(() => ({}));
  const orderId = safeOrderId(body.order_id);
  if (!orderId) return json(request, env, { received: true, ignored: true });
  const payment = await findPayment(env, orderId);
  if (!payment) return json(request, env, { received: true, ignored: true });
  await syncMidtransStatus(env, payment);
  return json(request, env, { received: true });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(request, env) });
    try {
      if (url.pathname === '/health' && request.method === 'GET') {
        return json(request, env, { ok: true, environment: env.MIDTRANS_ENV === 'production' ? 'production' : 'sandbox', priceIdr: envPrice(env) });
      }
      if (url.pathname === '/midtrans/webhook' && request.method === 'POST') return await handleWebhook(request, env);
      if (!browserOriginAllowed(request, env)) return json(request, env, { message: 'Origin tidak diizinkan.' }, 403);
      if (url.pathname === '/payments/create' && request.method === 'POST') return await createPayment(request, env);
      if (url.pathname === '/payments/status' && request.method === 'GET') return await paymentStatus(request, env, url);
      if (url.pathname === '/credits/consume' && request.method === 'POST') return await consumeCredit(request, env);
      return json(request, env, { message: 'Endpoint tidak ditemukan.' }, 404);
    } catch (error) {
      console.error(error);
      return json(request, env, { message: 'Layanan pembayaran sedang bermasalah.' }, 500);
    }
  }
};
