export const CHILI_CLOUD_CONFIG={
  enabled:true,
  endpoint:'https://hitung-cabai-api.andyirvan1609.workers.dev',
  turnstileSiteKey:'0x4AAAAAAFDFL_8dHZY6bCV6',
  modelVersion:'heuristic-color-v1',
  maxUploadBytes:850000
};

export function cloudContributionReady(){
  return Boolean(
    CHILI_CLOUD_CONFIG.enabled &&
    /^https:\/\/\/?/i.test(CHILI_CLOUD_CONFIG.endpoint) &&
    CHILI_CLOUD_CONFIG.turnstileSiteKey
  );
}