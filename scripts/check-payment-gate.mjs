import assert from 'node:assert/strict';
import { PAYMENT_CONFIG } from '../src/payment-config.js';
import { ANALYSIS_TARGETS, isPaymentConfigured, normalizeApiBaseUrl } from '../src/payment-core.js';
import { isSuccessfulPayment } from '../payment-worker/src/index.js';

assert.equal(PAYMENT_CONFIG.priceIdr, 5000, 'Harga awal harus Rp5.000 per analisis');
assert.equal(PAYMENT_CONFIG.enabled, false, 'Gate pembayaran harus nonaktif sampai backend Sandbox dikonfigurasi');
assert.equal(isPaymentConfigured(PAYMENT_CONFIG), false);
assert.equal(normalizeApiBaseUrl('https://example.workers.dev///'), 'https://example.workers.dev');

for (const id of ['runRal','runRak','runScience','runAssociation','runAdvanced','runNextGen','runMixed','runNested','runRepeated','runNonparametric','runPower','runStabilityIndices']) {
  assert.ok(ANALYSIS_TARGETS[id]?.result, `Target hasil pembayaran belum mencakup ${id}`);
}
assert.equal(isSuccessfulPayment({ transaction_status: 'settlement', fraud_status: 'accept' }), true);
assert.equal(isSuccessfulPayment({ transaction_status: 'pending', fraud_status: 'accept' }), false);
assert.equal(isSuccessfulPayment({ transaction_status: 'settlement', fraud_status: 'deny' }), false);

console.log('Payment gate and Midtrans sandbox contract checks passed.');
