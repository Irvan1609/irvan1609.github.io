const STORE='statistical_web_category_metadata_v1';
const clean=value=>String(value??'').trim();

function readAll(){
  try{
    const parsed=JSON.parse(localStorage.getItem(STORE)||'{}');
    return parsed&&typeof parsed==='object'?parsed:{};
  }catch{return {};}
}
function writeAll(all){
  try{localStorage.setItem(STORE,JSON.stringify(all));return true;}catch{return false;}
}
function normalize(raw){
  const source=raw&&typeof raw==='object'?raw:{},levels={},legacyUnits=[];
  for(const [level,entry] of Object.entries(source.levels||{})){
    const value=entry&&typeof entry==='object'?clean(entry.value):clean(entry);
    const legacyUnit=entry&&typeof entry==='object'?clean(entry.unit):'';
    if(value)levels[clean(level)]={value};
    if(legacyUnit)legacyUnits.push(legacyUnit);
  }
  const unit=clean(source.unit)||legacyUnits[0]||'';
  return {unit,levels};
}
export function categoryDatasetKey(datasetName){
  return clean(datasetName)||'dataset';
}
export function readCategoryMetadata(datasetName,columnName){
  const all=readAll(),dataset=all[categoryDatasetKey(datasetName)]||{},value=dataset[clean(columnName)];
  return normalize(value);
}
export function saveCategoryMetadata(datasetName,columnName,{unit='',levels={}}={}){
  const datasetKey=categoryDatasetKey(datasetName),columnKey=clean(columnName);
  if(!columnKey)return false;
  const all=readAll(),dataset={...(all[datasetKey]||{})},cleanLevels={};
  for(const [level,entry] of Object.entries(levels||{})){
    const value=entry&&typeof entry==='object'?clean(entry.value):clean(entry);
    if(value)cleanLevels[clean(level)]={value};
  }
  const normalized={unit:clean(unit),levels:cleanLevels};
  if(normalized.unit||Object.keys(cleanLevels).length)dataset[columnKey]=normalized;
  else delete dataset[columnKey];
  if(Object.keys(dataset).length)all[datasetKey]=dataset;
  else delete all[datasetKey];
  return writeAll(all);
}
export function saveCategoryLevel(datasetName,columnName,level,{value='',unit=''}={}){
  const current=readCategoryMetadata(datasetName,columnName),levels={...current.levels},levelKey=clean(level),cleanValue=clean(value);
  if(!levelKey)return false;
  if(cleanValue)levels[levelKey]={value:cleanValue};
  else delete levels[levelKey];
  return saveCategoryMetadata(datasetName,columnName,{unit:clean(unit)||current.unit,levels});
}
export function categoryLevelDescription(entry,unit=''){
  const value=entry&&typeof entry==='object'?clean(entry.value):clean(entry),sharedUnit=clean(unit)||(entry&&typeof entry==='object'?clean(entry.unit):'');
  if(!value)return '';
  return [value,sharedUnit].filter(Boolean).join(' ');
}
export function moveCategoryDataset(oldName,newName){
  const oldKey=categoryDatasetKey(oldName),newKey=categoryDatasetKey(newName);
  if(oldKey===newKey)return true;
  const all=readAll();
  if(!all[oldKey])return true;
  all[newKey]={...(all[newKey]||{}),...all[oldKey]};
  delete all[oldKey];
  return writeAll(all);
}
export function copyCategoryDataset(oldName,newName){
  const oldKey=categoryDatasetKey(oldName),newKey=categoryDatasetKey(newName),all=readAll();
  if(!all[oldKey])return true;
  all[newKey]=JSON.parse(JSON.stringify(all[oldKey]));
  return writeAll(all);
}
export function removeCategoryDataset(datasetName){
  const all=readAll(),key=categoryDatasetKey(datasetName);
  if(!(key in all))return true;
  delete all[key];
  return writeAll(all);
}
export function moveCategoryColumn(datasetName,oldColumn,newColumn){
  const all=readAll(),datasetKey=categoryDatasetKey(datasetName),dataset={...(all[datasetKey]||{})},oldKey=clean(oldColumn),newKey=clean(newColumn);
  if(!oldKey||!newKey||oldKey===newKey||!dataset[oldKey])return true;
  dataset[newKey]=dataset[oldKey];
  delete dataset[oldKey];
  all[datasetKey]=dataset;
  return writeAll(all);
}
export function removeCategoryColumn(datasetName,columnName){
  const all=readAll(),datasetKey=categoryDatasetKey(datasetName),dataset={...(all[datasetKey]||{})},columnKey=clean(columnName);
  if(!(columnKey in dataset))return true;
  delete dataset[columnKey];
  if(Object.keys(dataset).length)all[datasetKey]=dataset;
  else delete all[datasetKey];
  return writeAll(all);
}
