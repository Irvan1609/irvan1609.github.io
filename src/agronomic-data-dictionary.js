const USER_STORE='statistical_web_parameter_dictionary_v1';
const PROJECT_STORE='statistical_web_parameter_project_dictionary_v1';

const clean=value=>String(value??'').normalize('NFKC').trim();
const structuralAliases=new Set([
  'perlakuan','treatment','ulangan','replicate','replication','blok','block',
  'genotipe','genotype','varietas','variety','galur','line','plot','petak',
  'unit','sampel','sample','tanaman','plant','lokasi','location','musim','season'
]);

export function normalizeAgronomicAlias(value){
  return clean(value)
    .toLocaleLowerCase('id-ID')
    .replace(/[‐‑‒–—−_/\\]+/g,' ')
    .replace(/[.,;:]+/g,' ')
    .replace(/\s+/g,' ')
    .trim();
}

function definition(code,name,unit='',aliases=[],category=''){
  return Object.freeze({code,name,unit,category,aliases:Object.freeze([...aliases])});
}

export const BUILTIN_AGRONOMIC_PARAMETERS=Object.freeze([
  definition('TT','Tinggi Tanaman','cm',['tt','tinggi tanaman','plant height'],'Pertumbuhan vegetatif'),
  definition('DB','Diameter Batang','mm',['db','diameter batang','stem diameter'],'Pertumbuhan vegetatif'),
  definition('JD','Jumlah Daun','helai',['jd','jumlah daun','leaf number','number of leaves'],'Pertumbuhan vegetatif'),
  definition('LD','Luas Daun','cm²',['ld','luas daun','leaf area'],'Pertumbuhan vegetatif'),
  definition('ILD','Indeks Luas Daun','',['ild','indeks luas daun','leaf area index','lai'],'Pertumbuhan vegetatif'),
  definition('BK','Bobot Kering','g',['bk','bobot kering','dry weight','dry biomass'],'Biomassa'),
  definition('B100','Bobot 100 Biji','g',['b100','bobot 100 biji','berat 100 biji','100 seed weight'],'Komponen hasil'),
  definition('B1000','Bobot 1000 Biji','g',['b1000','bobot 1000 biji','berat 1000 biji','1000 seed weight','thousand seed weight'],'Komponen hasil'),
  definition('PROD','Produktivitas','t ha⁻¹',['prod','produktivitas','productivity','yield per hectare'],'Hasil'),
  definition('KA','Kadar Air','%',['ka','kadar air','moisture content'],'Mutu hasil'),
  definition('ASI','Anthesis–Silking Interval','hari',['asi','anthesis silking interval','anthesis-silking interval'],'Fenologi jagung'),
  definition('AD','Umur Anthesis','HST',['ad','anthesis date','umur anthesis','umur berbunga jantan'],'Fenologi jagung'),
  definition('SD','Umur Silking','HST',['sd','silking date','umur silking','umur keluar rambut'],'Fenologi jagung'),
  definition('TTG','Tinggi Tongkol','cm',['ttg','tinggi tongkol','ear height'],'Morfologi jagung'),
  definition('PT','Panjang Tongkol','cm',['pt','panjang tongkol','ear length','cob length'],'Komponen hasil jagung'),
  definition('DT','Diameter Tongkol','mm',['dt','diameter tongkol','ear diameter','cob diameter'],'Komponen hasil jagung'),
  definition('JBB','Jumlah Baris Biji','baris',['jbb','jumlah baris biji','jumlah baris per tongkol','kernel rows per ear'],'Komponen hasil jagung'),
  definition('JBPB','Jumlah Biji per Baris','biji',['jbpb','jumlah biji per baris','kernels per row'],'Komponen hasil jagung'),
  definition('PB','Panjang Buah','mm',['pb','panjang buah','fruit length'],'Komponen hasil'),
  definition('DBU','Diameter Buah','mm',['dbu','diameter buah','fruit diameter'],'Komponen hasil'),
  definition('SPAD','Indeks SPAD','',['spad','nilai spad','spad value','chlorophyll meter reading'],'Fisiologi'),
  definition('gs','Konduktansi Stomata','mol m⁻² s⁻¹',['gs','konduktansi stomata','stomatal conductance'],'Fisiologi'),
  definition('Pn','Laju Fotosintesis Bersih','µmol CO₂ m⁻² s⁻¹',['pn','laju fotosintesis','laju fotosintesis bersih','net photosynthetic rate'],'Fisiologi'),
  definition('RWC','Kadar Air Relatif','%',['rwc','kadar air relatif','relative water content'],'Fisiologi'),
  definition('SLA','Luas Daun Spesifik','cm² g⁻¹',['sla','luas daun spesifik','specific leaf area'],'Fisiologi'),
  definition('WUE','Efisiensi Penggunaan Air','',['wue','efisiensi penggunaan air','water use efficiency'],'Efisiensi sumber daya'),
  definition('NUE','Efisiensi Penggunaan Nitrogen','',['nue','efisiensi penggunaan nitrogen','nitrogen use efficiency'],'Efisiensi sumber daya'),
  definition('HI','Indeks Panen','',['hi','indeks panen','harvest index'],'Alokasi biomassa')
]);

function buildBuiltinIndex(){
  const index={};
  for(const item of BUILTIN_AGRONOMIC_PARAMETERS){
    const aliases=[item.code,item.name,...item.aliases];
    for(const alias of aliases){
      const key=normalizeAgronomicAlias(alias);
      if(key&&!index[key])index[key]=item;
    }
  }
  return index;
}
const BUILTIN_INDEX=buildBuiltinIndex();

function readStore(key){
  if(typeof globalThis==='undefined'||!globalThis.localStorage)return {};
  try{
    const parsed=JSON.parse(globalThis.localStorage.getItem(key)||'{}');
    return parsed&&typeof parsed==='object'&&!Array.isArray(parsed)?parsed:{};
  }catch{return {};}
}

function writeStore(key,value){
  if(typeof globalThis==='undefined'||!globalThis.localStorage)return false;
  try{globalThis.localStorage.setItem(key,JSON.stringify(value));return true;}catch{return false;}
}

function normalizedDefinition(value){
  const source=value&&typeof value==='object'?value:{};
  const code=clean(source.code),name=clean(source.name),unit=clean(source.unit),category=clean(source.category);
  if(!code||!name)return null;
  return {code,name,unit,category};
}

function safeAlias(alias){
  const key=normalizeAgronomicAlias(alias);
  if(!key||key.length<2||structuralAliases.has(key)||/^variable\s*\d+$/.test(key)||/^\d+$/.test(key))return '';
  return key;
}

function observationParts(value){
  const raw=clean(value);
  const match=raw.match(/(?:^|[\s_.-])(?:umur\s*)?(\d{1,3})\s*(hst|das|dap|dat)\b/i);
  if(!match)return {base:raw,observationTime:''};
  const observationTime=`${match[1]} ${match[2].toUpperCase()}`;
  const before=raw.slice(0,match.index);
  const after=raw.slice(match.index+match[0].length);
  const base=`${before} ${after}`.replace(/[\s_.-]+/g,' ').trim();
  return {base,observationTime};
}

function candidateKeys(value){
  const key=normalizeAgronomicAlias(value),keys=[key];
  const withoutTrailingUnit=key.replace(/\s+(?:cm2|cm²|cm|mm|meter|m|gram|g|kg|persen|%)$/i,'').trim();
  if(withoutTrailingUnit&&withoutTrailingUnit!==key)keys.push(withoutTrailingUnit);
  return [...new Set(keys.filter(Boolean))];
}

function decorate(def,source,matchedAlias,observationTime=''){
  if(!def)return null;
  const time=clean(observationTime);
  return {
    code:time?`${def.code}_${time.replace(/\s+/g,'')}`:def.code,
    name:time?`${def.name} ${time}`:def.name,
    unit:def.unit||'',
    category:def.category||'',
    source,
    matchedAlias,
    observationTime:time
  };
}

export function readUserParameterDictionary(){
  return readStore(USER_STORE);
}

export function saveUserParameterAlias(alias,metadata){
  const key=safeAlias(alias),def=normalizedDefinition(metadata);
  if(!key||!def)return false;
  const all=readStore(USER_STORE);
  all[key]={...def,updatedAt:new Date().toISOString()};
  return writeStore(USER_STORE,all);
}

export function removeUserParameterAlias(alias){
  const key=normalizeAgronomicAlias(alias),all=readStore(USER_STORE);
  if(!key||!Object.prototype.hasOwnProperty.call(all,key))return true;
  delete all[key];
  return writeStore(USER_STORE,all);
}

export function saveProjectParameterAlias(datasetName,alias,metadata){
  const datasetKey=clean(datasetName),key=safeAlias(alias),def=normalizedDefinition(metadata);
  if(!datasetKey||!key||!def)return false;
  const all=readStore(PROJECT_STORE),project={...(all[datasetKey]||{})};
  project[key]={...def,updatedAt:new Date().toISOString()};
  all[datasetKey]=project;
  return writeStore(PROJECT_STORE,all);
}

export function resolveAgronomicParameter(value,{datasetName=''}={}){
  const raw=clean(value);
  if(!raw)return null;
  const {base,observationTime}=observationParts(raw),keys=candidateKeys(base);
  const user=readStore(USER_STORE);
  for(const key of keys){
    const def=normalizedDefinition(user[key]);
    if(def)return decorate(def,'user',key,observationTime);
  }
  const projectAll=readStore(PROJECT_STORE),project=datasetName?projectAll[clean(datasetName)]||{}:{};
  for(const key of keys){
    const def=normalizedDefinition(project[key]);
    if(def)return decorate(def,'project',key,observationTime);
  }
  for(const key of keys){
    if(BUILTIN_INDEX[key])return decorate(BUILTIN_INDEX[key],'builtin',key,observationTime);
  }
  return null;
}

export function recognizedAgronomicHeaders(headers,{datasetName=''}={}){
  return (Array.isArray(headers)?headers:[]).map(header=>({
    header:String(header??''),
    metadata:resolveAgronomicParameter(header,{datasetName})
  })).filter(item=>item.metadata);
}

export function getBuiltInAgronomicDictionary(){
  return BUILTIN_AGRONOMIC_PARAMETERS.map(item=>({
    code:item.code,name:item.name,unit:item.unit,category:item.category,aliases:[...item.aliases]
  }));
}
