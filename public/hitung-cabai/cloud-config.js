export const CHILI_CLOUD_CONFIG={
  enabled:false,
  endpoint:'',
  turnstileSiteKey:'',
  modelVersion:'heuristic-color-v1',
  maxUploadBytes:850000
};

export function cloudContributionReady(){
  return Boolean(
    CHILI_CLOUD_CONFIG.enabled &&
    /^https:\/\//i.test(CHILI_CLOUD_CONFIG.endpoint) &&
    CHILI_CLOUD_CONFIG.turnstileSiteKey
  );
}
