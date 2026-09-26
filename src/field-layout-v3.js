import './field-layout.css';

const STORE='statistical_web_field_layout_v1';
const HANDOFF_KEY='agrotik_field_handoff_v1';
const MAX_HISTORY=60;
const $=selector=>document.querySelector(selector);
const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const clone=value=>{try{return structuredClone(value);}catch{return JSON.parse(JSON.stringify(value));}};
const uid=()=>globalThis.crypto?.randomUUID?.()||('plot-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2));
const now=()=>new Date().toISOString();
let current=null,config=null,selectedRow=null,dirty=false,multiMode=false,layoutEditMode=false,fieldMode=false,dragRow=null,applyingHistory=false;
const selectedRows=new Set(),undoStack=[],redoStack=[],photoUrls=new Set();

function api(){return globalThis.StatisticalWebData||null;}
function dataset(){const value=api()?.readActiveDataset?.();return value&&Array.isArray(value.headers)&&Array.isArray(value.rows)?value:{name:'Dataset',fileName:'dataset',headers:[],rows:[]};}
function keyFor(data){return String(data.fileName||data.name||'dataset');}
function readStore(){try{const value=JSON.parse(localStorage.getItem(STORE)||'{}');return value&&typeof value==='object'?value:{};}catch{return {};}}
function writeConfig(data,next=config){try{const store=readStore();next.updatedAt=now();store[keyFor(data)]=next;localStorage.setItem(STORE,JSON.stringify(store));}catch{}}
function same(a,b){try{return JSON.stringify(a)===JSON.stringify(b);}catch{return false;}}
function findColumn(headers,patterns,fallback=null){for(const pattern of patterns){const index=headers.findIndex(header=>pattern.test(String(header||'')));if(index>=0)return index;}return fallback;}
function structuralHeader(header){return /(petak|plot|unit|kode|(^|\b)id(\b|$)|ulangan|replicate|rep\b|kelompok|blok|block|perlakuan|treatment|faktor\s*[ab]|kombinasi|petak utama|main\s*plot|subplot|sub plot|varietas|genotip)/i.test(String(header||''));}
function measurementColumns(data=current){return (data?.headers||[]).map((header,index)=>({header,index})).filter(item=>!structuralHeader(item.header));}
function sampleNumeric(data,index){const values=data.rows.map(row=>String(row[index]??'').trim()).filter(Boolean).slice(0,50);return values.length>0&&values.every(value=>Number.isFinite(Number(value.replace(',','.'))));}
function numberOf(value){const n=Number(String(value??'').trim().replace(',','.'));return Number.isFinite(n)?n:null;}
function defaultConfig(data){
  const headers=data.headers||[],id=findColumn(headers,[/^petak$/i,/plot/i,/unit/i,/kode/i,/^id$/i],0),group=findColumn(headers,[/kelompok/i,/blok|block/i,/ulangan|rep/i],-1);
  const color=findColumn(headers,[/^perlakuan$/i,/kombinasi/i,/faktor\s*a/i,/varietas/i,/genotip/i,/treatment/i],id),factorB=findColumn(headers,[/faktor\s*b/i,/subplot/i,/sub plot/i],-1),mainPlot=findColumn(headers,[/petak utama/i,/main\s*plot/i],-1);
  const columns=Math.max(2,Math.min(10,Math.ceil(Math.sqrt(Math.max(1,data.rows.length))))),measure=measurementColumns(data)[0]?.index??-1;
  return {version:3,id,group,color,factorB,mainPlot,columns:Math.min(columns,6),serpentine:true,size:'medium',north:'N',roadEvery:0,colorMode:'treatment',heatmap:measure,heatmapMode:'raw',missingMode:'separate',filter:'all',order:{},plotUids:[],uidIdentity:{},statuses:{},notes:{},timestamps:{},gps:{},samples:{},harvests:{},sessions:[],activeSessionId:'',activeParameter:measure,observer:'',zoom:1,flipX:false,flipY:false,spacers:{},versions:[],backupMeta:true,highlightA:'',highlightB:''};
}
function ensurePlotUids(data,base){
  const existing=Array.isArray(base.plotUids)?base.plotUids.filter(x=>typeof x==='string'):[],oldIdentity=base.uidIdentity&&typeof base.uidIdentity==='object'?base.uidIdentity:{},identityToUid=new Map();
  for(const [u,identity] of Object.entries(oldIdentity))if(identity&&!identityToUid.has(identity))identityToUid.set(identity,u);
  const next=[],identityMap={};
  for(let i=0;i<data.rows.length;i++){
    const identity=identityForRow(data,i,base),preserved=identityToUid.get(identity)||existing[i],u=preserved||uid();next.push(u);identityMap[u]=identity;
  }
  base.plotUids=next;base.uidIdentity=identityMap;
}
function identityForRow(data,index,cfg=config){const row=data.rows[index]||[],id=String(row[cfg?.id??0]??'').trim(),group=(cfg?.group??-1)>=0?String(row[cfg.group]??'').trim():'';return `${group}::${id}`;}
function normalizeConfig(data,saved){
  const base={...defaultConfig(data),...(saved||{})},max=Math.max(0,data.headers.length-1),safeIndex=(value,fallback)=>Number.isInteger(Number(value))&&Number(value)>=-1&&Number(value)<=max?Number(value):fallback;
  base.version=3;base.id=safeIndex(base.id,0);base.group=safeIndex(base.group,-1);base.color=safeIndex(base.color,base.id);base.factorB=safeIndex(base.factorB,-1);base.mainPlot=safeIndex(base.mainPlot,-1);
  base.columns=Math.max(2,Math.min(16,Number(base.columns)||6));base.serpentine=base.serpentine!==false;base.size=['small','medium','large'].includes(base.size)?base.size:'medium';base.north=['N','E','S','W'].includes(base.north)?base.north:'N';base.roadEvery=Math.max(0,Math.min(12,Number(base.roadEvery)||0));
  base.colorMode=['treatment','completion','parameter'].includes(base.colorMode)?base.colorMode:'treatment';base.heatmap=safeIndex(base.heatmap,-1);base.heatmapMode=['raw','mean','residual','zscore','percentile'].includes(base.heatmapMode)?base.heatmapMode:'raw';base.missingMode=['exclude','zero','separate'].includes(base.missingMode)?base.missingMode:'separate';
  const filters=['all','empty','partial','complete','normal','missing','dead','lodged','pest','disease','flooded','damaged','harvested','border'];base.filter=filters.includes(base.filter)?base.filter:'all';
  for(const key of ['order','statuses','notes','timestamps','gps','samples','harvests','spacers','uidIdentity'])base[key]=base[key]&&typeof base[key]==='object'?base[key]:{};
  base.sessions=Array.isArray(base.sessions)?base.sessions:[];base.versions=Array.isArray(base.versions)?base.versions.slice(-10):[];base.activeSessionId=String(base.activeSessionId||'');base.observer=String(base.observer||'');base.zoom=Math.max(.35,Math.min(1.8,Number(base.zoom)||1));base.flipX=Boolean(base.flipX);base.flipY=Boolean(base.flipY);base.backupMeta=base.backupMeta!==false;base.highlightA=String(base.highlightA||'');base.highlightB=String(base.highlightB||'');
  ensurePlotUids(data,base);
  // Migrate metadata from Field Workspace v2 keys (group::id or numeric row) to immutable plot_uid.
  for(let i=0;i<data.rows.length;i++){const u=base.plotUids[i],legacy=identityForRow(data,i,base);for(const key of ['statuses','notes']){const bag=base[key];if(bag?.[u]===undefined){if(bag?.[legacy]!==undefined)bag[u]=bag[legacy];else if(bag?.[i]!==undefined)bag[u]=bag[i];}}}
  const measures=measurementColumns(data).map(x=>x.index);base.activeParameter=measures.includes(Number(base.activeParameter))?Number(base.activeParameter):(measures[0]??-1);if(base.heatmap<0&&base.activeParameter>=0)base.heatmap=base.activeParameter;
  return base;
}
function plotUid(index){return String(config?.plotUids?.[index]||'');}
function rowByUid(target){return config?.plotUids?.findIndex(value=>value===target)??-1;}
function activeSession(){return config.sessions.find(item=>item.id===config.activeSessionId)||null;}
function activeColumn(){const session=activeSession(),idx=Number(session?.parameterIndex??config.activeParameter);return idx>=0&&idx<current.headers.length?idx:-1;}
function activeSessionKey(){return activeSession()?.id||`parameter-${activeColumn()}`;}
function activeParameterName(){const idx=activeColumn();return idx>=0?current.headers[idx]:'Parameter belum dipilih';}
function rowProgress(data,row){const measures=measurementColumns(data);if(!measures.length)return {filled:0,total:0,status:'structure'};const filled=measures.filter(item=>String(row[item.index]??'').trim()!=='').length;return {filled,total:measures.length,status:filled===0?'empty':filled===measures.length?'complete':'partial'};}
function activeFilled(row){const col=activeColumn();return col>=0&&String(row?.[col]??'').trim()!=='';}
function hashHue(value){let hash=0;for(const char of String(value??''))hash=(Math.imul(hash,31)+char.charCodeAt(0))|0;return Math.abs(hash)%360;}
function colorLabel(data,row){return config.color>=0?String(row[config.color]??'').trim():'';}
function factorBLabel(row){return config.factorB>=0?String(row[config.factorB]??'').trim():'';}
function plotLabel(data,row,index){const id=String(row[config.id]??'').trim()||String(index+1),secondary=colorLabel(data,row);return {id,secondary:secondary&&secondary!==id?secondary:''};}
function plotStatus(index){return String(config.statuses?.[plotUid(index)]||'normal');}
function plotNote(index){return String(config.notes?.[plotUid(index)]||'');}
function groupLabelForRow(index){const row=current?.rows?.[index];if(!row)return '';return config.group>=0?String(row[config.group]??'').trim()||'Tanpa kelompok':'Semua petak';}
function mainPlotLabel(row){return config.mainPlot>=0?String(row[config.mainPlot]??'').trim()||'Petak utama':'Semua subplot';}
function passesFilter(entry){if(config.filter==='all')return true;const status=plotStatus(entry.index),progress=rowProgress(current,entry.row);if(['empty','partial','complete'].includes(config.filter))return progress.status===config.filter;return status===config.filter;}
function matchingSearch(entry,data,query){if(!query)return true;return data.headers.some((_,i)=>String(entry.row[i]??'').toLocaleLowerCase('id-ID').includes(query));}
function highlightMatch(entry){const a=config.highlightA,b=config.highlightB;if(!a&&!b)return true;const av=colorLabel(current,entry.row),bv=factorBLabel(entry.row);return (!a||av===a)&&(!b||bv===b);}
function options(headers,selected,allowNone=false,label='Tidak dikelompokkan'){return (allowNone?`<option value="-1">${label}</option>`:'')+headers.map((header,index)=>`<option value="${index}" ${index===selected?'selected':''}>${esc(header)}</option>`).join('');}
function physicalOrder(entries){
  const chunks=[];for(let start=0;start<entries.length;start+=config.columns){let chunk=entries.slice(start,start+config.columns);if(config.serpentine&&Math.floor(start/config.columns)%2)chunk.reverse();if(config.flipX)chunk.reverse();chunks.push(chunk);}if(config.flipY)chunks.reverse();return chunks.flat();
}
function groupEntries(data=current){
  const groups=new Map();data.rows.forEach((row,index)=>{const label=groupLabelForRow(index);if(!groups.has(label))groups.set(label,[]);groups.get(label).push({row,index});});
  return [...groups.entries()].map(([label,entries])=>{const order=Array.isArray(config.order?.[label])?config.order[label]:[];if(order.length){const rank=new Map(order.map((key,index)=>[String(key),index]));entries.sort((a,b)=>(rank.get(plotUid(a.index))??rank.get(legacyPlotKey(a.index))??1e9)-(rank.get(plotUid(b.index))??rank.get(legacyPlotKey(b.index))??1e9)||a.index-b.index);}return [label,entries];});
}
function legacyPlotKey(index){const row=current?.rows?.[index]||[],id=String(row[config.id]??'').trim()||'#'+index,group=config.group>=0?String(row[config.group]??'').trim():'all';return group+'::'+id;}
function rawGroupOrder(label){const rows=[];current.rows.forEach((_,index)=>{if(groupLabelForRow(index)===label)rows.push(index);});const saved=Array.isArray(config.order?.[label])?config.order[label].map(String):[],byUid=new Map(rows.map(index=>[plotUid(index),index])),byLegacy=new Map(rows.map(index=>[legacyPlotKey(index),index]));const ranked=saved.map(key=>byUid.get(key)??byLegacy.get(key)).filter(Number.isInteger);return [...ranked,...rows.filter(index=>!ranked.includes(index))];}
function layoutSnapshot(cfg=config){return {columns:cfg.columns,serpentine:cfg.serpentine,size:cfg.size,north:cfg.north,roadEvery:cfg.roadEvery,order:clone(cfg.order),flipX:cfg.flipX,flipY:cfg.flipY,spacers:clone(cfg.spacers),mainPlot:cfg.mainPlot};}
function addLayoutVersion(reason,before){const versions=Array.isArray(config.versions)?config.versions.slice(-9):[];versions.push({id:uid(),at:now(),reason,snapshot:layoutSnapshot(before)});config.versions=versions;}
function captureRows(indexes=[]){return [...new Set(indexes)].filter(i=>Number.isInteger(i)&&current?.rows?.[i]).map(i=>({index:i,values:[...current.rows[i]]}));}
function pushHistory(label,beforeConfig,beforeRows=[],afterConfig=config,afterRows=[]){if(applyingHistory)return;undoStack.push({label,beforeConfig:clone(beforeConfig),beforeRows:clone(beforeRows),afterConfig:clone(afterConfig),afterRows:clone(afterRows)});while(undoStack.length>MAX_HISTORY)undoStack.shift();redoStack.length=0;updateUndoButtons();}
async function applyHistory(action,side){if(!action)return;applyingHistory=true;try{const cfg=clone(side==='before'?action.beforeConfig:action.afterConfig),rows=side==='before'?action.beforeRows:action.afterRows;for(const item of rows)api()?.replaceRow?.(item.index,item.values,`undo denah: ${action.label}`);current=dataset();config=normalizeConfig(current,cfg);writeConfig(current,config);refreshData(false);renderControls();renderMap();if(Number.isInteger(selectedRow)&&selectedRow<current.rows.length)renderEditor(selectedRow);}finally{applyingHistory=false;updateUndoButtons();}}
async function undoLayout(){const action=undoStack.pop();if(!action)return;redoStack.push(action);await applyHistory(action,'before');}
async function redoLayout(){const action=redoStack.pop();if(!action)return;undoStack.push(action);await applyHistory(action,'after');}
function updateUndoButtons(){const u=$('#fieldUndo'),r=$('#fieldRedo');if(u)u.disabled=!undoStack.length;if(r)r.disabled=!redoStack.length;}
function commitConfig(label,before,{version=false}={}){if(same(before,config))return;if(version)addLayoutVersion(label,before);writeConfig(current,config);pushHistory(label,before,[],config,[]);}

function heatmapValues(){
  const index=Number(config.heatmap>=0?config.heatmap:activeColumn());if(config.colorMode!=='parameter'||index<0)return null;const raw=current.rows.map(row=>numberOf(row[index])),present=raw.filter(Number.isFinite);if(!present.length&&config.missingMode!=='zero')return null;
  const values=raw.map(v=>v===null&&config.missingMode==='zero'?0:v),finite=values.filter(Number.isFinite),grand=finite.reduce((a,b)=>a+b,0)/Math.max(1,finite.length),sd=Math.sqrt(finite.reduce((s,v)=>s+(v-grand)**2,0)/Math.max(1,finite.length-1));
  const treatmentMeans=new Map(),blockMeans=new Map();
  current.rows.forEach((row,i)=>{const v=values[i];if(!Number.isFinite(v))return;const a=colorLabel(current,row)||'_',b=groupLabelForRow(i)||'_';for(const [map,key] of [[treatmentMeans,a],[blockMeans,b]]){const x=map.get(key)||{sum:0,n:0};x.sum+=v;x.n++;map.set(key,x);}});
  const derived=values.map((v,i)=>{if(!Number.isFinite(v))return null;if(config.heatmapMode==='mean'){const x=treatmentMeans.get(colorLabel(current,current.rows[i])||'_');return 