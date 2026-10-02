export const ERROR_CODES=Object.freeze({
  CORE_STORAGE_UNAVAILABLE:'CORE-STORAGE-001',
  CORE_SCHEMA_MIGRATION:'CORE-SCHEMA-001',
  CORE_MODULE_LOAD:'CORE-MODULE-001',
  DATASET_NOT_FOUND:'DATASET-001',
  DATASET_INVALID:'DATASET-002',
  ANALYSIS_INVALID:'ANALYSIS-001',
  ANALYSIS_ENGINE:'ANALYSIS-002',
  SYNC_CONFLICT:'SYNC-001',
  SYNC_UNAVAILABLE:'SYNC-002'
});

export class AgrotikError extends Error{
  constructor(code,message,options={}){
    super(String(message||code),options.cause?{cause:options.cause}:undefined);
    this.name='AgrotikError';
    this.code=String(code||'CORE-UNKNOWN');
    this.detail=options.detail??null;
  }
}
export function normalizeError(error,fallbackCode='CORE-UNKNOWN'){
  if(error instanceof AgrotikError)return error;
  return new AgrotikError(fallbackCode,error?.message||String(error||'Unknown error'),{cause:error});
}
