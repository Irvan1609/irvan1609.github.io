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

function definition(language,code,name,unit='',aliases=[],category=''){
  return Object.freeze({language,code,name,unit,category,aliases:Object.freeze([...aliases])});
}

export const BUILTIN_AGRONOMIC_PARAMETERS=Object.freeze([
  // Bahasa Indonesia
  definition('id','TT','Tinggi Tanaman','cm',['tt','tinggi tanaman'],'Pertumbuhan vegetatif'),
  definition('id','DB','Diameter Batang','mm',['db','diameter batang'],'Pertumbuhan vegetatif'),
  definition('id','JD','Jumlah Daun','helai',['jd','jumlah daun'],'Pertumbuhan vegetatif'),
  definition('id','LD','Luas Daun','cm²',['ld','luas daun'],'Pertumbuhan vegetatif'),
  definition('id','ILD','Indeks Luas Daun','',['ild','indeks luas daun'],'Pertumbuhan vegetatif'),
  definition('id','BK','Bobot Kering','g',['bk','bobot kering'],'Biomassa'),
  definition('id','B100','Bobot 100 Biji','g',['b100','bobot 100 biji','berat 100 biji'],'Komponen hasil'),
  definition('id','B1000','Bobot 1000 Biji','g',['b1000','bobot 1000 biji','berat 1000 biji'],'Komponen hasil'),
  definition('id','PROD','Produktivitas','t ha⁻¹',['prod','produktivitas'],'Hasil'),
  definition('id','KA','Kadar Air','%',['ka','kadar air'],'Mutu hasil'),
  definition('id','ASI','Interval Antesis–Silking','hari',['asi','interval antesis silking','interval anthesis silking'],'Fenologi jagung'),
  definition('id','UA','Umur Antesis','HST',['ua','umur antesis','umur berbunga jantan'],'Fenologi jagung'),
  definition('id','US','Umur Silking','HST',['us','umur silking','umur keluar rambut'],'Fenologi jagung'),
  definition('id','TTG','Tinggi Tongkol','cm',['ttg','tinggi tongkol'],'Morfologi jagung'),
  definition('id','PT','Panjang Tongkol','cm',['pt','panjang tongkol'],'Komponen hasil jagung'),
  definition('id','DT','Diameter Tongkol','mm',['dt','diameter tongkol'],'Komponen hasil jagung'),
  definition('id','JBB','Jumlah Baris Biji','baris',['jbb','jumlah baris biji','jumlah baris per tongkol'],'Komponen hasil jagung'),
  definition('id','JBPB','Jumlah Biji per Baris','biji',['jbpb','jumlah biji per baris'],'Komponen hasil jagung'),
  definition('id','PB','Panjang Buah','mm',['pb','panjang buah'],'Komponen hasil'),
  definition('id','DBU','Diameter Buah','mm',['dbu','diameter buah'],'Komponen hasil'),
  definition('id','SPAD','Nilai SPAD','',['spad','nilai spad'],'Fisiologi'),
  definition('id','gs','Konduktansi Stomata','mol m⁻² s⁻¹',['gs','konduktansi stomata'],'Fisiologi'),
  definition('id','Pn','Laju Fotosintesis Bersih','µmol CO₂ m⁻² s⁻¹',['pn','laju fotosintesis','laju fotosintesis bersih'],'Fisiologi'),
  definition('id','KAR','Kadar Air Relatif','%',['kar','kadar air relatif'],'Fisiologi'),
  definition('id','LDS','Luas Daun Spesifik','cm² g⁻¹',['lds','luas daun spesifik'],'Fisiologi'),
  definition('id','EPA','Efisiensi Penggunaan Air','',['epa','efisiensi penggunaan air'],'Efisiensi sumber daya'),
  definition('id','EPN','Efisiensi Penggunaan Nitrogen','',['epn','efisiensi penggunaan nitrogen'],'Efisiensi sumber daya'),
  definition('id','IP','Indeks Panen','',['ip','indeks panen'],'Alokasi biomassa'),

  // English — deliberately separate from Indonesian entries
  definition('en','PH','Plant Height','cm',['ph','plant height'],'Vegetative growth'),
  definition('en','SD','Stem Diameter','mm',['sd','stem diameter'],'Vegetative growth'),
  definition('en','LN','Leaf Number','leaves',['ln','leaf number','number of leaves'],'Vegetative growth'),
  definition('en','LA','Leaf Area','cm²',['la','leaf area'],'Vegetative growth'),
  definition('en','LAI','Leaf Area Index','',['lai','leaf area index'],'Vegetative growth'),
  definition('en','DW','Dry Weight','g',['dw','dry weight','dry biomass'],'Biomass'),
  definition('en','HSW','Hundred Seed Weight','g',['hsw','hundred seed weight','100 seed weight'],'Yield component'),
  definition('en','TSW','Thousand Seed Weight','g',['tsw','thousand seed weight','1000 seed weight'],'Yield component'),
  definition('en','YLD','Yield','t ha⁻¹',['yld','yield','yield per hectare'],'Yield'),
  definition('en','MC','Moisture Content','%',['mc','moisture content'],'Product quality'),
  definition('en','ASI','Anthesis–Silking Interval','days',['asi','anthesis silking interval','anthesis-silking interval'],'Maize phenology'),
  definition('en','AD','Anthesis Date','DAP',['ad','anthesis date'],'Maize phenology'),
  definition('en','SDATE','Silking Date','DAP',['sdate','silking date'],'Maize phenology'),
  definition('en','EH','Ear Height','cm',['eh','ear height'],'Maize morphology'),
  definition('en','EL','Ear Length','cm',['el','ear length','cob length'],'Maize yield component'),
  definition('en','ED','Ear Diameter','mm',['ed','ear diameter','cob diameter'],'Maize yield component'),
  definition('en','KRE','Kernel Rows per Ear','rows',['kre','kernel rows per ear'],'Maize yield component'),
  definition('en','KPR','Kernels per Row','kernels',['kpr','kernels per row'],'Maize yield component'),
  definition('en','FL','Fruit Length','mm',['fl','fruit length'],'Yield component'),
  definition('en','FD','Fruit Diameter','mm',['fd','fruit diameter'],'Yield component'),
  definition('en','SPAD','SPAD Value','',['spad','spad value','chlorophyll meter reading'],'Physiology'),
  definition('en','gs','Stomatal Conductance','mol m⁻² s⁻¹',['gs','stomatal conductance'],'Physiology'),
  definition('en','Pn','Net Photosynthetic Rate','µmol CO₂ m⁻² s⁻¹',['pn','net photosynthetic rate','photosynthetic rate'],'Physiology'),
  definition('en','RWC','Relative Water Content','%',['rwc','relative water content'],'Physiology'),
  definition('en','SLA','Specific Leaf Area','cm² g⁻¹',['sla','specific leaf area'],'Physiology'),
  definition('en','WUE','Water Use Efficiency','',['wue','water use efficiency'],'Resource-use efficiency'),
  definition('en','NUE','Nitrogen Use Efficiency','',['nue','nitrogen use efficiency'],'Resource-use efficiency'),
  definition('en','HI','Harvest Index','',['hi','harvest index'],'Biomass allocation')
]);

function buildBuiltinIndex(){
  const index={};
  for(const item of BUILTIN_AGRONOMIC_PARAMETERS){
    const aliases=[item.code,item.name,...item.aliases];
    for(const alias of aliases){
      const key=normalizeAgronomicAlias(alias);
      if(!key)continue;
      if(!index[key])index[key]=[];
      if(!index[key].includes(item))index[key].push(item);
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
  const code=clean(source.code),name=clean(source.name),unit=clean(source.unit),category=clean(source.category),language=clean(source.language)||'custom';
  if(!code||!name)return null;
  return {code,name,unit,category,language};
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
  const withoutTrailingUnit=key.replace(/\s+(?:cm2|cm²|cm|mm|meter|m|gram|g|kg|persen|%|days?|hari|leaves|helai|rows?|baris|kernels?|biji)$/i,'').trim();
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
    language:def.language||'custom',
    source,
    matchedAlias,
    observationTime:time
  };
}

function uniqueSuggestions(items){
  const seen=new Set();
  return items.filter(item=>{
    const key=[item.language,item.code,item.name,item.unit].join('|');
    if(seen.has(key))return false;
    seen.add(key);return true;
  });
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

export function suggestAgronomicParameters(value,{datasetName='',language=''}={}){
  const raw=clean(value);
  if(!raw)return [];
  const {base,observationTime}=observationParts(raw),keys=candidateKeys(base),wanted=clean(language).toLowerCase();
  const suggestions=[];
  const user=readStore(USER_STORE);
  for(const key of keys){
    const def=normalizedDefinition(user[key]);
    if(def&&(!wanted||def.language===wanted))suggestions.push(decorate(def,'user',key,observationTime));
  }
  const projectAll=readStore(PROJECT_STORE),project=datasetName?projectAll[clean(datasetName)]||{}:{};
  for(const key of keys){
    const def=normalizedDefinition(project[key]);
    if(def&&(!wanted||def.language===wanted))suggestions.push(decorate(def,'project',key,observationTime));
  }
  for(const key of keys){
    for(const def of BUILTIN_INDEX[key]||[]){
      if(!wanted||def.language===wanted)suggestions.push(decorate(def,'builtin',key,observationTime));
    }
  }
  return uniqueSuggestions(suggestions);
}

export function resolveAgronomicParameter(value,options={}){
  return suggestAgronomicParameters(value,options)[0]||null;
}

export function recognizedAgronomicHeaders(headers,{datasetName=''}={}){
  return (Array.isArray(headers)?headers:[]).map(header=>({
    header:String(header??''),
    suggestions:suggestAgronomicParameters(header,{datasetName})
  })).filter(item=>item.suggestions.length);
}

export function getBuiltInAgronomicDictionary({language=''}={}){
  const wanted=clean(language).toLowerCase();
  return BUILTIN_AGRONOMIC_PARAMETERS
    .filter(item=>!wanted||item.language===wanted)
    .map(item=>({
      language:item.language,code:item.code,name:item.name,unit:item.unit,category:item.category,aliases:[...item.aliases]
    }));
}
