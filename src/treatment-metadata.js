const STORE='statistical_web_treatment_metadata_v1';

const clean=value=>String(value??'').trim();
export function treatmentMetadataKey(datasetName,factorA,factorB=''){
  return [clean(datasetName)||'dataset',clean(factorA),clean(factorB)].join('::');
}
export function readTreatmentMetadata(key){
  try{
    const all=JSON.parse(localStorage.getItem(STORE)||'{}');
    const value=all?.[key];
    return value&&typeof value==='object'?value:null;
  }catch{return null;}
}
export function saveTreatmentMetadata(key,value){
  try{
    const all=JSON.parse(localStorage.getItem(STORE)||'{}');
    all[key]=value;
    localStorage.setItem(STORE,JSON.stringify(all));
    return true;
  }catch{return false;}
}
function rewriteDatasetKeys(oldName,newName,{copy=false}={}){
  try{
    const all=JSON.parse(localStorage.getItem(STORE)||'{}'),oldPrefix=clean(oldName)+'::',newPrefix=clean(newName)+'::';
    let changed=false;
    for(const [key,value] of Object.entries({...all})){
      if(!key.startsWith(oldPrefix))continue;
      all[newPrefix+key.slice(oldPrefix.length)]=JSON.parse(JSON.stringify(value));
      if(!copy)delete all[key];
      changed=true;
    }
    if(changed)localStorage.setItem(STORE,JSON.stringify(all));
    return true;
  }catch{return false;}
}
export function moveTreatmentMetadataDataset(oldName,newName){return rewriteDatasetKeys(oldName,newName,{copy:false});}
export function copyTreatmentMetadataDataset(oldName,newName){return rewriteDatasetKeys(oldName,newName,{copy:true});}
export function removeTreatmentMetadataDataset(datasetName){
  try{
    const all=JSON.parse(localStorage.getItem(STORE)||'{}'),prefix=clean(datasetName)+'::';
    let changed=false;
    for(const key of Object.keys(all))if(key.startsWith(prefix)){delete all[key];changed=true;}
    if(changed)localStorage.setItem(STORE,JSON.stringify(all));
    return true;
  }catch{return false;}
}
export function metadataLevel(report,axis,code){
  const value=report?.treatmentMeta?.levels?.[axis]?.[code];
  return clean(value);
}
export function metadataFactor(report,axis,fallback){
  return clean(report?.treatmentMeta?.factorLabels?.[axis])||clean(report?.factorLabels?.[axis])||fallback;
}
export function describeLevel(report,axis,code,{withCode=true}={}){
  const raw=clean(code),description=metadataLevel(report,axis,raw);
  if(!description)return raw;
  if(!withCode||description===raw)return description;
  return `${description} (${raw})`;
}
export function describeCombination(report,a,b){
  const aText=describeLevel(report,'a',a),bText=describeLevel(report,'b',b);
  return [aText,bText].filter(Boolean).join(' dan ');
}
