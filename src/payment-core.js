export const ANALYSIS_TARGETS = Object.freeze({
  runRal: { result: '#ralResult' },
  runRak: { result: '#rakResult' },
  runScience: { result: '#scienceResults' },
  runAssociation: { result: '#assocResult' },
  runAdvanced: { result: '#advancedResult' },
  runNextGen: { result: '#nextGenResult' },
  runMixed: { result: '#mixedResult' },
  runNested: { result: '#nestedResult' },
  runRepeated: { result: '#repeatedResult' },
  runNonparametric: { result: '#npResult' },
  runPower: { result: '#powerResult' },
  runStabilityIndices: { result: '#siResult' }
});

export function normalizeApiBaseUrl(value) {
  return String(value || '').trim().replace(/\/+$/, '');
}

export function isPaymentConfigured(config) {
  return Boolean(config?.enabled && normalizeApiBaseUrl(config.apiBaseUrl) && Number(config.priceIdr) > 0);
}

export function formatIdr(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return 'Rp0';
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(amount);
}
