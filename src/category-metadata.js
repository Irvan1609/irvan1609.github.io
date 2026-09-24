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
export function categoryDatasetKey(datasetName){
  return clean(datasetName)||'dataset';
}
export function readCategoryMetadata(datasetName,columnName){
  const all=readAll(),dataset=all[categoryDatasetKey(datasetName)]||{},value=dataset[clean(columnName)];
  return value&&typeof value==='object'?value:{levels:{}};
}
export function saveCategoryLevel(datasetName,columnName,level,{value='',unit=''}={}){
  const datasetKey=categoryDatasetKey(datasetName),columnKey=clean(columnName),levelKey=clean(level);
  if(!columnKey||!levelKey)return false;
  const all=readAll(),dataset={...(all[datasetKey]||{})},current=dataset[columnKey]&&typeof dataset[columnKey]==='object'?dataset[columnKey]:{levels:{}};
  const levels={...(current.levels||{})},entry={value:clean(value),unit:clean(unit)};
  if(!entry.value&&!entry.unit)delete levels[levelKey];
  else levels[levelKey]=entry;
  if(Object.keys(levels).length)dataset[columnKey]={...current,levels};
  else delete dataset[columnKey];
  if(Object.keys(dataset).length)all[datasetKey]=dataset;
  else delete all[datasetKey];
  return writeAll(all);
}
export function categoryLevelDescription(entry){
  const value=clean(entry?.value),unit=clean(entry?.unit);
  if(!value&&!unit)return '';
  return [value,unit].filter(Boolean).join(' ');
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
