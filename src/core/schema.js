export const CORE_SCHEMA_VERSION=1;
export const DATASET_SCHEMA_VERSION=1;
export const ANALYSIS_SCHEMA_VERSION=1;
export const HISTORY_SCHEMA_VERSION=1;
export const SYNC_SCHEMA_VERSION=1;

export const SCHEMAS=Object.freeze({
  core:CORE_SCHEMA_VERSION,
  dataset:DATASET_SCHEMA_VERSION,
  analysis:ANALYSIS_SCHEMA_VERSION,
  history:HISTORY_SCHEMA_VERSION,
  sync:SYNC_SCHEMA_VERSION
});

export function versioned(type,data,version=SCHEMAS[type]||1){
  return {schema:String(type),schemaVersion:Number(version)||1,data};
}
