import './field-layout.css';
import {saveFieldPhoto,listFieldPhotos,deleteFieldPhoto} from './field-media.js';
import {qrSvg} from './qr-lite.js';

const STORE='statistical_web_field_layout_v1';
const $=selector=>document.querySelector(selector);
const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
let current=null,config=null,selectedRow=null,dirty=false,multiMode=false,layoutEditMode=false,dragRow=null,autoSaveTimer=0;
const selectedRows=new Set(),layoutUndo=[],layoutRedo=[];

function api(){return globalThis.StatisticalWebData||null;}
function dataset(){
  const value=api()?.readActiveDataset?.();
  return value&&Array.isArray(value.headers)&&Array.isArray(value.rows)?value:{name:'Dataset',fileName:'dataset',headers:[],rows:[]};
}
function keyFor(data){return String(data.fileName||data.name||'dataset');}
function readStore(){try{const value=JSON.parse(localStorage.getItem(STORE)||'{}');return value&&typeof value==='object'?value:{};}catch{return {};}}
function writeConfig(data,next){
  try{const store=readStore();store[keyFor(data)]=next;localStorage.setItem(STORE,JSON.stringify(store));}catch{}
}
function cloneConfig(value=config){try{return structuredClone(value);}catch{return JSON.parse(JSON.stringify(value));}}
function pushLayoutHistory(reason='ubah denah'){
  if(!config)return;
  layoutUndo.push({config:cloneConfig(),reason});while(layoutUndo.length>40)layoutUndo.shift();layoutRedo.length=0;
}
function applyConfigSnapshot(snapshot){
  if(!snapshot?.config)return;
  config=normalizeConfig(current,cloneConfig(snapshot.config));writeConfig(current,config);renderControls();renderMap();
  if(multiMode)renderBatchEditor();else if(Number.isInteger(selectedRow))renderEditor(selectedRow);
}
function undoLayout(){
  const item=layoutUndo.pop();if(!item)return;
  layoutRedo.push({config:cloneConfig(),reason:item.reason});applyConfigSnapshot(item);
}
function redoLayout(){
  const item=layoutRedo.pop();if(!item)return;
  layoutUndo.push({config:cloneConfig(),reason:item.reason});applyConfigSnapshot(item);
}

function findColumn(headers,patterns,fallback=null){
  for(const pattern of patterns){const index=headers.findIndex(header=>pattern.test(String(header||'')));if(index>=0)return index;}
  return fallback;
}
function defaultConfig(data){
  const headers=data.headers||[];
  const id=findColumn(headers,[/^petak$/i,/plot/i,/unit/i,/kode/i,/^id$/i],0);
  const group=findColumn(headers,[/kelompok/i,/blok|block/i,/ulangan|rep/i],-1);
  const color=findColumn(headers,[/^perlakuan$/i,/kombinasi/i,/faktor\s*a/i,/varietas/i,/genotip/i,/treatment/i],id);
  const columns=Math.max(2,Math.min(10,Math.ceil(Math.sqrt(Math.max(1,data.rows.length)))));
  return {id,group,color,columns:Math.min(columns,6),serpentine:true,size:'medium',north:'N',roadEvery:0,colorMode:'treatment',heatmap:-1,filter:'all',order:{},statuses:{},notes:{},uids:[],observer:'',session:{label:'',parameter:-1,date:''},fieldMode:false,flipX:false,flipY:false,zoom:1,heatTransform:'raw',roadAfter:{},objects:[],plotMeta:{},sampleGroups:[]};
}
function normalizeConfig(data,saved){
  const base={...defaultConfig(data),...(saved||{})},max=Math.max(0,data.headers.length-1);
  const safeIndex=(value,fallback)=>Number.isInteger(Number(value))&&Number(value)>=-1&&Number(value)<=max?Number(value):fallback;
  base.id=safeIndex(base.id,0);base.group=safeIndex(base.group,-1);base.color=safeIndex(base.color,base.id);
  base.columns=Math.max(2,Math.min(12,Number(base.columns)||6));
  base.serpentine=base.serpentine!==false;
  base.size=['small','medium','large'].includes(base.size)?base.size:'medium';
  base.north=['N','E','S','W'].includes(base.north)?base.north:'N';
  base.roadEvery=Math.max(0,Math.min(8,Number(base.roadEvery)||0));
  base.colorMode=['treatment','completion','parameter'].includes(base.colorMode)?base.colorMode:'treatment';
  base.heatmap=safeIndex(base.heatmap,-1);
  base.filter=['all','empty','partial','complete','normal','missing','dead','damaged','harvested','border'].includes(base.filter)?base.filter:'all';
  base.order=base.order&&typeof base.order==='object'?base.order:{};
  base.statuses=base.statuses&&typeof base.statuses==='object'?base.statuses:{};
  base.notes=base.notes&&typeof base.notes==='object'?base.notes:{};
  base.uids=Array.isArray(base.uids)?base.uids.map(String):[];
  while(base.uids.length<data.rows.length)base.uids.push(crypto.randomUUID());
  if(base.uids.length>data.rows.length)base.uids.length=data.rows.length;
  base.observer=String(base.observer||'');
  base.session=base.session&&typeof base.session==='object'?{label:String(base.session.label||''),parameter:safeIndex(base.session.parameter,-1),date:String(base.session.date||'')}:{label:'',parameter:-1,date:''};
  base.fieldMode=base.fieldMode===true;base.flipX=base.flipX===true;base.flipY=base.flipY===true;base.zoom=Math.max(.45,Math.min(1.8,Number(base.zoom)||1));base.heatTransform=['raw','zscore','percentile','residual'].includes(base.heatTransform)?base.heatTransform:'raw';
  base.roadAfter=base.roadAfter&&typeof base.roadAfter==='object'?base.roadAfter:{};
  base.objects=Array.isArray(base.objects)?base.objects.filter(item=>item&&typeof item==='object').slice(0,100):[];
  base.plotMeta=base.plotMeta&&typeof base.plotMeta==='object'?base.plotMeta:{};
  base.sampleGroups=Array.isArray(base.sampleGroups)?base.sampleGroups.filter(group=>group&&Array.isArray(group.members)&&group.meanHeader):[];
  return base;
}
function structuralHeader(header){
  return /(petak|plot|unit|kode|(^|\b)id(\b|$)|ulangan|replicate|rep\b|kelompok|blok|block|perlakuan|treatment|faktor\s*[ab]|kombinasi|petak utama|subplot|sub plot|varietas|genotip)/i.test(String(header||''));
}
function sampleNumeric(data,index){
  const values=data.rows.map(row=>String(row[index]??'').trim()).filter(Boolean).slice(0,50);
  return values.length>0&&values.every(value=>Number.isFinite(Number(value.replace(',','.'))));
}
function measurementColumns(data){
  return data.headers.map((header,index)=>({header,index})).filter(item=>!structuralHeader(item.header));
}
function rowProgress(data,row){
  const measures=measurementColumns(data);
  if(!measures.length)return {filled:0,total:0,status:'structure'};
  const filled=measures.filter(item=>String(row[item.index]??'').trim()!=='').length;
  return {filled,total:measures.length,status:filled===0?'empty':filled===measures.length?'complete':'partial'};
}
function hashHue(value){
  let hash=0;for(const char of String(value??'')){hash=(Math.imul(hash,31)+char.charCodeAt(0))|0;}
  return Math.abs(hash)%360;
}
function orderedEntries(entries,columns,serpentine){
  if(!serpentine)return entries;
  const out=[];
  for(let start=0;start<entries.length;start+=columns){
    const chunk=entries.slice(start,start+columns);
    if(Math.floor(start/columns)%2)chunk.reverse();
    out.push(...chunk);
  }
  return out;
}
function groupEntries(data){
  const groups=new Map();
  data.rows.forEach((row,index)=>{
    const label=config.group>=0?String(row[config.group]??'').trim()||'Tanpa kelompok':'Semua petak';
    if(!groups.has(label))groups.set(label,[]);
    groups.get(label).push({row,index});
  });
  return [...groups.entries()].map(([label,entries])=>{
    const order=Array.isArray(config.order?.[label])?config.order[label]:[];
    if(order.length){const rank=new Map(order.map((key,index)=>[String(key),index]));entries.sort((a,b)=>(rank.get(plotKey(a.index))??1e9)-(rank.get(plotKey(b.index))??1e9)||a.index-b.index);}
    return [label,entries];
  });
}
function colorLabel(data,row){return config.color>=0?String(row[config.color]??'').trim():'';}
function plotLabel(data,row,index){
  const id=String(row[config.id]??'').trim()||String(index+1);
  const secondary=colorLabel(data,row);
  return {id,secondary:secondary&&secondary!==id?secondary:''};
}
function plotKey(index){return String(config?.uids?.[index]||('#'+index));}
function plotUid(index){return plotKey(index);}
function plotStatus(index){return String(config.statuses?.[plotKey(index)]||config.statuses?.[index]||'normal');}
function plotNote(index){return String(config.notes?.[plotKey(index)]||config.notes?.[index]||'');}
function passesFilter(entry){
  if(config.filter==='all')return true;
  const status=plotStatus(entry.index),progress=rowProgress(current,entry.row);
  if(['empty','partial','complete'].includes(config.filter))return progress.status===config.filter;
  return status===config.filter;
}
function latestResidualValues(parameterName){
  try{
    const history=JSON.parse(localStorage.getItem('statistical_web_analysis_history_v1')||'[]');
    const datasetName=String(current.name||'').replace(/\.(csv|txt)$/i,'');
    const entry=(Array.isArray(history)?history:[]).find(item=>String(item.dataset||'').replace(/\.(csv|txt)$/i,'')===datasetName&&Array.isArray(item.reports)&&item.reports.some(report=>report.name===parameterName));
    const report=entry?.reports?.find(item=>item.name===parameterName);if(!report||!Array.isArray(report.residuals))return null;
    const values=new Map();
    report.residuals.forEach((value,index)=>{
      const row=Number(report.observations?.[index]?.row);
      const rowIndex=Number.isInteger(row)&&row>0?row-1:(report.residuals.length===current.rows.length?index:-1);
      if(rowIndex>=0&&Number.isFinite(Number(value)))values.set(rowIndex,Number(value));
    });
    return values.size?values:null;
  }catch{return null;}
}
function heatmapScale(){
  const index=Number(config.heatmap);
  if(config.colorMode!=='parameter'||index<0)return null;
  const raw=new Map();
  current.rows.forEach((row,rowIndex)=>{const value=Number(String(row[index]??'').replace(',','.'));if(Number.isFinite(value))raw.set(rowIndex,value);});
  let values=raw,label=String(current.headers[index]||'Parameter');
  if(config.heatTransform==='residual'){
    values=latestResidualValues(label)||new Map();label='Residual · '+label;
  }else if(config.heatTransform==='zscore'&&raw.size){
    const list=[...raw.values()],mean=list.reduce((a,b)=>a+b,0)/list.length,sd=Math.sqrt(list.reduce((sum,value)=>sum+(value-mean)**2,0)/Math.max(1,list.length-1))||1;
    values=new Map([...raw].map(([row,value])=>[row,(value-mean)/sd]));label='Z-score · '+label;
  }else if(config.heatTransform==='percentile'&&raw.size){
    const sorted=[...raw.values()].sort((a,b)=>a-b);
    values=new Map([...raw].map(([row,value])=>{const rank=sorted.findLastIndex(x=>x<=value)+1;return [row,rank/sorted.length*100];}));label='Persentil · '+label;
  }
  const list=[...values.values()].filter(Number.isFinite);if(!list.length)return null;
  return {index,min:Math.min(...list),max:Math.max(...list),values,label,transform:config.heatTransform};
}
function visualForPlot(entry,scale){
  const progress=rowProgress(current,entry.row),status=plotStatus(entry.index),color=colorLabel(current,entry.row);
  if(config.colorMode==='completion'){
    const hue=progress.status==='complete'?135:progress.status==='partial'?42:0;
    return {hue,heat:false,label:progress.total?progress.filled+'/'+progress.total:'struktur'};
  }
  if(config.colorMode==='parameter'&&scale){
    const value=scale.values.get(entry.index);
    if(Number.isFinite(value)){
      const ratio=scale.max===scale.min?0.5:Math.max(0,Math.min(1,(value-scale.min)/(scale.max-scale.min)));
      const label=scale.transform==='percentile'?Math.round(value)+'%':Number(value).toLocaleString('id-ID',{maximumFractionDigits:3});
      return {hue:220-(ratio*220),heat:true,label};
    }
  }
  return {hue:hashHue(color),heat:false,label:progress.total?progress.filled+'/'+progress.total:'struktur',status};
}
function matchingSearch(entry,data,query){
  if(!query)return true;
  return data.headers.some((_,i)=>String(entry.row[i]??'').toLocaleLowerCase('id-ID').includes(query));
}
function options(headers,selected,allowNone=false){
  return (allowNone?'<option value="-1">Tidak dikelompokkan</option>':'')+headers.map((header,index)=>`<option value="${index}" ${index===selected?'selected':''}>${esc(header)}</option>`).join('');
}
function ensureModal(){
  if($('#fieldLayoutModal'))return;
  document.body.insertAdjacentHTML('beforeend',`
    <div id="fieldLayoutModal" class="field-layout-modal" role="dialog" aria-modal="true" aria-labelledby="fieldLayoutTitle">
      <header class="field-layout-head">
        <div class="field-layout-title"><strong id="fieldLayoutTitle">Denah lahan</strong><span id="fieldLayoutDataset"></span></div>
        <div class="field-layout-head-actions">
          <button id="fieldUndo" type="button" title="Undo denah" aria-label="Undo denah">↶</button>
          <button id="fieldRedo" type="button" title="Redo denah" aria-label="Redo denah">↷</button>
          <button id="fieldModeToggle" type="button" aria-pressed="false">Lapangan</button>
          <button id="fieldZoomOut" type="button" aria-label="Perkecil denah">−</button>
          <button id="fieldFit" type="button">Fit</button>
          <button id="fieldZoomIn" type="button" aria-label="Perbesar denah">+</button>
          <button id="fieldLayoutEdit" type="button" aria-pressed="false">Susun</button>
          <button id="fieldMultiToggle" type="button" aria-pressed="false">Multi</button>
          <button id="fieldAddParameter" type="button">+ Parameter</button>
          <button id="fieldOpenTable" type="button">Tabel</button>
          <details class="field-layout-more"><summary>Lainnya</summary><div>
            <button id="fieldValidateBlocks" type="button">Periksa blok</button>
            <button id="fieldCreateSessionColumn" type="button">Parameter waktu</button>
            <button id="fieldSamplePlants" type="button">Sampel tanaman</button>
            <button id="fieldFlipX" type="button">Balik kiri-kanan</button>
            <button id="fieldFlipY" type="button">Balik atas-bawah</button>
            <button id="fieldAddObject" type="button">Objek lahan</button>
            <button id="fieldPrintQr" type="button">Cetak QR plot</button>
            <button id="fieldPrint" type="button">Cetak</button>
            <button id="fieldExportLayout" type="button">Ekspor denah</button>
            <button id="fieldImportLayout" type="button">Impor denah</button>
            <button id="fieldResetLayout" type="button">Reset susunan</button>
          </div></details>
          <button id="closeFieldLayout" type="button" aria-label="Tutup denah lahan">✕</button>
        </div>
      </header>
      <div class="field-layout-controls">
        <label>Pengamat<input id="fieldObserver" type="text" placeholder="Nama / inisial" autocomplete="off"></label>
        <label>Sesi<input id="fieldSessionLabel" type="text" placeholder="mis. 28 HST" autocomplete="off"></label>
        <label>Parameter aktif<select id="fieldActiveParameter"></select></label>
        <label>ID plot<select id="fieldIdColumn"></select></label>
        <label>Kelompok<select id="fieldGroupColumn"></select></label>
        <label>Warna<select id="fieldColorColumn"></select></label>
        <label>Mode warna<select id="fieldColorMode"><option value="treatment">Perlakuan</option><option value="completion">Kelengkapan</option><option value="parameter">Heatmap</option></select></label>
        <label id="fieldHeatmapWrap">Parameter<select id="fieldHeatmapColumn"></select></label>
        <label id="fieldHeatTransformWrap">Heatmap<select id="fieldHeatTransform"><option value="raw">Nilai mentah</option><option value="zscore">Z-score</option><option value="percentile">Persentil</option><option value="residual">Residual terakhir</option></select></label>
        <label>Filter<select id="fieldFilter"><option value="all">Semua</option><option value="empty">Data kosong</option><option value="partial">Sebagian</option><option value="complete">Lengkap</option><option value="normal">Normal</option><option value="missing">Petak kosong</option><option value="dead">Tanaman mati</option><option value="damaged">Rusak</option><option value="harvested">Panen</option><option value="border">Border</option></select></label>
        <label>Kolom<input id="fieldColumns" type="number" min="2" max="12" inputmode="numeric"></label>
        <label>Jalan / baris<input id="fieldRoadEvery" type="number" min="0" max="8" inputmode="numeric"></label>
        <label>Utara<select id="fieldNorth"><option value="N">↑ N</option><option value="E">→ N</option><option value="S">↓ N</option><option value="W">← N</option></select></label>
        <label>Ukuran<select id="fieldPlotSize"><option value="small">Kecil</option><option value="medium">Sedang</option><option value="large">Besar</option></select></label>
        <label class="field-switch"><input id="fieldSerpentine" type="checkbox"><span>Zig-zag</span></label>
        <input id="fieldSearch" type="search" placeholder="Cari plot…" aria-label="Cari plot">
      </div>
      <div class="field-layout-stats" id="fieldLayoutStats"></div>
      <main class="field-layout-workspace">
        <section class="field-map-pane">
          <div id="fieldNorthArrow" class="field-north-arrow" aria-label="Arah utara">↑<span>N</span></div>
          <div id="fieldHeatLegend" class="field-heat-legend" hidden></div>
          <div id="fieldMap" class="field-map"></div>
        </section>
        <aside id="fieldPlotEditor" class="field-plot-editor" aria-live="polite">
          <div class="field-editor-empty">Klik satu plot untuk mengisi data.</div>
        </aside>
      </main>
    </div><input id="fieldLayoutImportInput" type="file" accept=".json,application/json" hidden><input id="fieldPhotoInput" type="file" accept="image/*" capture="environment" hidden>`);
  $('#closeFieldLayout').onclick=closeFieldLayout;
  $('#fieldOpenTable').onclick=()=>{
    const row=selectedRow;
    closeFieldLayout();
    if(Number.isInteger(row))api()?.focusCell?.(row,0);
  };
  $('#fieldAddParameter').onclick=addParameter;
  $('#fieldModeToggle').onclick=toggleFieldMode;
  $('#fieldZoomOut').onclick=()=>setZoom(config.zoom-.1);$('#fieldZoomIn').onclick=()=>setZoom(config.zoom+.1);$('#fieldFit').onclick=fitFieldMap;
  $('#fieldFlipX').onclick=()=>toggleFlip('flipX');$('#fieldFlipY').onclick=()=>toggleFlip('flipY');$('#fieldAddObject').onclick=addFieldObject;
  $('#fieldValidateBlocks').onclick=validateBlocks;
  $('#fieldCreateSessionColumn').onclick=createSessionColumn;
  $('#fieldSamplePlants').onclick=setupSamplePlants;
  $('#fieldUndo').onclick=undoLayout;$('#fieldRedo').onclick=redoLayout;
  $('#fieldLayoutEdit').onclick=()=>{layoutEditMode=!layoutEditMode;$('#fieldLayoutEdit').setAttribute('aria-pressed',String(layoutEditMode));renderMap();if(Number.isInteger(selectedRow))renderEditor(selectedRow);};
  $('#fieldMultiToggle').onclick=()=>{multiMode=!multiMode;selectedRows.clear();$('#fieldMultiToggle').setAttribute('aria-pressed',String(multiMode));renderMap();renderBatchEditor();};
  $('#fieldPrint').onclick=()=>window.print();$('#fieldPrintQr').onclick=printQrLabels;
  $('#fieldExportLayout').onclick=exportLayout;
  $('#fieldImportLayout').onclick=()=>$('#fieldLayoutImportInput').click();
  $('#fieldResetLayout').onclick=resetLayout;
  $('#fieldLayoutImportInput').onchange=importLayout;$('#fieldPhotoInput').onchange=saveSelectedPhoto;
  for(const id of ['fieldObserver','fieldSessionLabel','fieldActiveParameter','fieldIdColumn','fieldGroupColumn','fieldColorColumn','fieldColorMode','fieldHeatmapColumn','fieldHeatTransform','fieldFilter','fieldColumns','fieldRoadEvery','fieldNorth','fieldPlotSize','fieldSerpentine']){
    $('#'+id).addEventListener('change',readControls);
  }
  $('#fieldSearch').addEventListener('input',renderMap);
  $('#fieldMap').addEventListener('click',event=>{
    const removeObject=event.target.closest('[data-remove-field-object]');
    if(removeObject){pushLayoutHistory('hapus objek lahan');config={...config,objects:(config.objects||[]).filter(item=>String(item.id)!==removeObject.dataset.removeFieldObject)};writeConfig(current,config);renderMap();return;}
    const plot=event.target.closest('[data-field-row]');if(!plot)return;
    const row=Number(plot.dataset.fieldRow);
    if(multiMode){
      if(selectedRows.has(row))selectedRows.delete(row);else selectedRows.add(row);
      renderMap();renderBatchEditor();return;
    }
    selectRow(row);
  });
  $('#fieldMap').addEventListener('dragstart',event=>{
    const plot=event.target.closest('[data-field-row]');if(!layoutEditMode||!plot)return;
    dragRow=Number(plot.dataset.fieldRow);event.dataTransfer.effectAllowed='move';plot.classList.add('is-dragging');
  });
  $('#fieldMap').addEventListener('dragend',event=>{event.target.closest('[data-field-row]')?.classList.remove('is-dragging');dragRow=null;});
  $('#fieldMap').addEventListener('dragover',event=>{if(layoutEditMode&&event.target.closest('[data-field-row]'))event.preventDefault();});
  $('#fieldMap').addEventListener('drop',event=>{
    const target=event.target.closest('[data-field-row]');if(!layoutEditMode||!target||!Number.isInteger(dragRow))return;
    event.preventDefault();movePlotTo(dragRow,Number(target.dataset.fieldRow));dragRow=null;
  });
  $('#fieldPlotEditor').addEventListener('input',event=>{
    if(event.target.closest('[data-batch-editor]'))return;
    dirty=true;clearTimeout(autoSaveTimer);autoSaveTimer=setTimeout(()=>saveEditor({quiet:true,rerender:false}),650);
  });
  $('#fieldPlotEditor').addEventListener('click',event=>{
    if(event.target.closest('[data-field-save]'))saveEditor();
    if(event.target.closest('[data-field-prev]'))stepEditor(-1);
    if(event.target.closest('[data-field-next]'))stepEditor(1);
    if(event.target.closest('[data-field-next-incomplete]'))nextIncomplete();
    const score=event.target.closest('[data-quick-score]');if(score){const input=$('#fieldPlotEditor [data-field-active-input]');if(input){input.value=score.dataset.quickScore;input.dispatchEvent(new Event('input',{bubbles:true}));saveEditor({quiet:true,rerender:false});}}
    const quickStatus=event.target.closest('[data-field-status-quick]');if(quickStatus){const select=$('#fieldPlotEditor [data-field-status]');if(select){select.value=quickStatus.dataset.fieldStatusQuick;select.dispatchEvent(new Event('input',{bubbles:true}));saveEditor({quiet:true,rerender:true});}}
    const move=event.target.closest('[data-field-move]');if(move)moveSelectedPlot(Number(move.dataset.fieldMove));
    if(event.target.closest('[data-batch-apply]'))applyBatch();
    if(event.target.closest('[data-batch-select-visible]'))selectVisible();
    if(event.target.closest('[data-batch-clear]')){selectedRows.clear();renderMap();renderBatchEditor();}
    if(event.target.closest('[data-field-road-toggle]'))toggleRoadAfter(selectedRow);
    if(event.target.closest('[data-field-photo]'))$('#fieldPhotoInput')?.click();
    if(event.target.closest('[data-field-gps]'))captureGps();
    if(event.target.closest('[data-field-camera-measure]'))openCompanion('/kamera-pengukur/','camera');
    if(event.target.closest('[data-field-chili]'))openCompanion('/hitung-cabai/','chili');
    const deletePhotoButton=event.target.closest('[data-field-photo-delete]');if(deletePhotoButton)removeSelectedPhoto(deletePhotoButton.dataset.fieldPhotoDelete);
    if(event.target.closest('[data-field-open-row]')){
      const row=selectedRow;closeFieldLayout();if(Number.isInteger(row))api()?.focusCell?.(row,0);
    }
  });
  $('#fieldPlotEditor').addEventListener('keydown',event=>{
    if((event.ctrlKey||event.metaKey)&&event.key==='Enter'){event.preventDefault();saveEditor();}
  });
  document.addEventListener('keydown',event=>{
    const modal=$('#fieldLayoutModal');if(!modal?.classList.contains('open'))return;
    const inField=!!event.target.closest('input,select,textarea');
    const mod=event.ctrlKey||event.metaKey;
    if(mod&&event.key.toLowerCase()==='z'&&!event.shiftKey){event.preventDefault();event.stopImmediatePropagation();undoLayout();return;}
    if((mod&&event.key.toLowerCase()==='y')||(mod&&event.shiftKey&&event.key.toLowerCase()==='z')){event.preventDefault();event.stopImmediatePropagation();redoLayout();return;}
    if(event.key==='Escape'&&!inField){event.preventDefault();closeFieldLayout();return;}
    if(!inField&&event.key==='ArrowLeft'){event.preventDefault();stepEditor(-1);return;}
    if(!inField&&event.key==='ArrowRight'){event.preventDefault();stepEditor(1);return;}
    if(!inField&&(event.key==='s'||event.key==='S')){event.preventDefault();$('#fieldLayoutEdit')?.click();return;}
    if(!inField&&(event.key==='m'||event.key==='M')){event.preventDefault();$('#fieldMultiToggle')?.click();}
  },true);
  document.addEventListener('stat-dataset-changed',event=>{
    if(!$('#fieldLayoutModal')?.classList.contains('open'))return;
    const patch=event.detail?.patch;
    if(patch?.kind==='delete_row'&&Array.isArray(config?.uids)){
      const row=Number(patch.row);if(Number.isInteger(row)&&row>=0)config.uids.splice(row,1);
      writeConfig(current,config);
    }else if(patch?.kind==='append_row'&&Array.isArray(config?.uids)){
      config.uids.push(crypto.randomUUID());writeConfig(current,config);
    }
    if(dirty)return;
    const keep=selectedRow;refreshData();
    if(multiMode)renderBatchEditor();else if(Number.isInteger(keep)&&keep<current.rows.length){selectedRow=keep;renderEditor(keep);}
  });
}


function setZoom(value,{history=true}={}){
  if(!current)return;if(history)pushLayoutHistory('zoom denah');
  config={...config,zoom:Math.max(.45,Math.min(1.8,Number(value)||1))};writeConfig(current,config);
  applyZoom();
}
function applyZoom(){const map=$('#fieldMap');if(map)map.style.zoom=String(config.zoom||1);const label=$('#fieldFit');if(label)label.textContent=Math.round((config.zoom||1)*100)+'%';}
function fitFieldMap(){
  const pane=$('.field-map-pane'),map=$('#fieldMap');if(!pane||!map)return;
  map.style.zoom='1';const width=Math.max(1,map.scrollWidth),height=Math.max(1,map.scrollHeight),fit=Math.min(1.2,(pane.clientWidth-18)/width,(pane.clientHeight-18)/height);
  setZoom(Math.max(.45,fit));pane.scrollTo({left:0,top:0,behavior:'smooth'});
}
function toggleFlip(key){
  pushLayoutHistory(key==='flipX'?'balik kiri-kanan':'balik atas-bawah');config={...config,[key]:!config[key]};writeConfig(current,config);renderMap();
}
function orientEntries(entries){
  const rows=[];for(let start=0;start<entries.length;start+=config.columns)rows.push(entries.slice(start,start+config.columns));
  if(config.flipX)rows.forEach(row=>row.reverse());if(config.flipY)rows.reverse();return rows.flat();
}
function addFieldObject(){
  const type=prompt('Jenis objek: jalan, drainase, pematang, pohon, air, gudang, lainnya','drainase');if(!type)return;
  const label=prompt('Nama/keterangan objek:',type)||type;
  pushLayoutHistory('tambah objek lahan');
  config={...config,objects:[...(config.objects||[]),{id:crypto.randomUUID(),type:String(type).trim(),label:String(label).trim()}]};writeConfig(current,config);renderMap();
}
function toggleRoadAfter(index){
  const key=plotKey(index);pushLayoutHistory('jalan manual');const roadAfter={...config.roadAfter};
  if(roadAfter[key])delete roadAfter[key];else roadAfter[key]=true;
  config={...config,roadAfter};writeConfig(current,config);renderMap();if(Number.isInteger(selectedRow))renderEditor(selectedRow);
}

function groupLabelForRow(index){
  const row=current?.rows?.[index];if(!row)return '';
  return config.group>=0?String(row[config.group]??'').trim()||'Tanpa kelompok':'Semua petak';
}
function rawGroupOrder(label){
  const rows=[];current.rows.forEach((row,index)=>{if(groupLabelForRow(index)===label)rows.push(index);});
  const savedKeys=Array.isArray(config.order?.[label])?config.order[label].map(String):[];
  const byKey=new Map(rows.map(index=>[plotKey(index),index]));
  const saved=savedKeys.map(key=>byKey.get(key)).filter(index=>Number.isInteger(index));
  return [...saved,...rows.filter(index=>!saved.includes(index))];
}
function movePlotTo(source,target){
  const sourceGroup=groupLabelForRow(source),targetGroup=groupLabelForRow(target);
  if(!sourceGroup||sourceGroup!==targetGroup)return;
  const order=rawGroupOrder(sourceGroup),from=order.indexOf(source),to=order.indexOf(target);
  if(from<0||to<0||from===to)return;
  pushLayoutHistory('susun plot');order.splice(from,1);order.splice(to,0,source);
  config={...config,order:{...config.order,[sourceGroup]:order.map(plotKey)},serpentine:false};
  writeConfig(current,config);renderControls();renderMap();
}
function moveSelectedPlot(direction){
  if(!Number.isInteger(selectedRow))return;
  const group=groupLabelForRow(selectedRow),order=rawGroupOrder(group),from=order.indexOf(selectedRow),to=from+direction;
  if(from<0||to<0||to>=order.length)return;
  pushLayoutHistory('geser plot');[order[from],order[to]]=[order[to],order[from]];
  config={...config,order:{...config.order,[group]:order.map(plotKey)},serpentine:false};
  writeConfig(current,config);renderControls();renderMap();renderEditor(selectedRow);
}
function selectVisible(){
  selectedRows.clear();
  $('#fieldMap')?.querySelectorAll('[data-field-row]').forEach(plot=>selectedRows.add(Number(plot.dataset.fieldRow)));
  renderMap();renderBatchEditor();
}

function activeParameterIndex(){
  const index=Number(config?.session?.parameter);
  return Number.isInteger(index)&&index>=0&&index<current.headers.length&&!structuralHeader(current.headers[index])?index:-1;
}
function sampleGroupForIndex(index){
  const header=current.headers[index];if(!header)return null;
  return (config.sampleGroups||[]).find(group=>group.members.includes(header)||group.meanHeader===header)||null;
}
function observationIndices(){
  const active=activeParameterIndex();
  if(active<0)return measurementColumns(current).map(item=>item.index);
  const group=sampleGroupForIndex(active);
  if(!group)return [active];
  return group.members.map(header=>current.headers.indexOf(header)).filter(index=>index>=0);
}
function rowIncomplete(index){
  const row=current.rows[index];if(!row)return false;
  if(['missing','dead'].includes(plotStatus(index)))return false;
  const indices=observationIndices();
  if(!indices.length)return rowProgress(current,row).status!=='complete';
  return indices.some(col=>String(row[col]??'').trim()==='');
}
function nextIncomplete(){
  const route=[...($('#fieldMap')?.querySelectorAll('[data-field-row]')||[])].map(plot=>Number(plot.dataset.fieldRow)).filter(Number.isInteger);
  if(!route.length)return;
  const start=Math.max(-1,route.indexOf(selectedRow));
  for(let offset=1;offset<=route.length;offset++){
    const row=route[(start+offset+route.length)%route.length];
    if(rowIncomplete(row)){selectRow(row);return;}
  }
  const status=$('#fieldEditorStatus');if(status)status.textContent='✓ Semua plot pada tampilan ini sudah terisi.';
}
function toggleFieldMode(){
  pushLayoutHistory('mode lapangan');
  config={...config,fieldMode:!config.fieldMode};writeConfig(current,config);
  $('#fieldLayoutModal')?.classList.toggle('field-mode',config.fieldMode);
  $('#fieldModeToggle')?.setAttribute('aria-pressed',String(config.fieldMode));
  renderControls();renderMap();
  if(config.fieldMode&&!Number.isInteger(selectedRow))nextIncomplete();
  else if(Number.isInteger(selectedRow))renderEditor(selectedRow);
}
function validateBlocks(){
  const groups=groupEntries(current),lines=[];
  for(const [label,entries] of groups){
    const missing=entries.filter(entry=>rowIncomplete(entry.index));
    if(missing.length)lines.push(label+': '+missing.length+' belum lengkap — '+missing.slice(0,8).map(entry=>plotLabel(current,entry.row,entry.index).id).join(', ')+(missing.length>8?'…':''));
    else lines.push(label+': lengkap ✓');
  }
  alert(lines.join('\n'));
}
function createSessionColumn(){
  const active=activeParameterIndex(),label=String(config.session?.label||'').trim();
  if(active<0)return alert('Pilih Parameter aktif terlebih dahulu.');
  if(!label)return alert('Isi nama sesi, misalnya 28 HST.');
  const base=String(current.headers[active]),name=base+' '+label;
  const existing=current.headers.findIndex(header=>header.toLocaleLowerCase('id-ID')===name.toLocaleLowerCase('id-ID'));
  let index=existing;
  if(index<0){
    const result=api()?.appendColumn?.(name,'tambah parameter waktu dari denah');
    if(!result?.ok)return alert(result?.error||'Parameter waktu belum dapat dibuat.');
    index=result.index;refreshData(false);
  }
  pushLayoutHistory('parameter waktu');
  config={...config,session:{...config.session,label,parameter:index,date:new Date().toISOString().slice(0,10)}};writeConfig(current,config);
  renderControls();renderMap();if(Number.isInteger(selectedRow))renderEditor(selectedRow);
}
function setupSamplePlants(){
  const active=activeParameterIndex();if(active<0)return alert('Pilih Parameter aktif terlebih dahulu.');
  const count=Math.max(2,Math.min(20,Number(prompt('Jumlah tanaman sampel per plot:','5'))||0));if(!count)return;
  const base=String(current.headers[active]).replace(/\s+T\d+$/i,'').replace(/\s+Rerata$/i,'').trim();
  const members=[];
  for(let i=1;i<=count;i++){
    const name=base+' T'+i;
    let index=current.headers.findIndex(header=>header===name);
    if(index<0){const result=api()?.appendColumn?.(name,'tambah tanaman sampel');if(!result?.ok)return alert(result?.error||'Kolom sampel gagal dibuat.');refreshData(false);index=result.index;}
    members.push(name);
  }
  const meanHeader=base+' Rerata';
  let meanIndex=current.headers.findIndex(header=>header===meanHeader);
  if(meanIndex<0){const result=api()?.appendColumn?.(meanHeader,'tambah rerata sampel');if(!result?.ok)return alert(result?.error||'Kolom rerata gagal dibuat.');refreshData(false);meanIndex=result.index;}
  pushLayoutHistory('setup tanaman sampel');
  const others=(config.sampleGroups||[]).filter(group=>group.meanHeader!==meanHeader);
  config={...config,sampleGroups:[...others,{base,members,meanHeader}],session:{...config.session,parameter:current.headers.indexOf(members[0])}};writeConfig(current,config);
  renderControls();renderMap();if(Number.isInteger(selectedRow))renderEditor(selectedRow);
}
function applySampleMeans(values){
  for(const group of config.sampleGroups||[]){
    const memberIndexes=group.members.map(header=>current.headers.indexOf(header)).filter(index=>index>=0),meanIndex=current.headers.indexOf(group.meanHeader);
    if(meanIndex<0||!memberIndexes.length)continue;
    const nums=memberIndexes.map(index=>Number(String(values[index]??'').replace(',','.')));
    if(nums.every(Number.isFinite))values[meanIndex]=String(nums.reduce((a,b)=>a+b,0)/nums.length);
    else values[meanIndex]='';
  }
}


function companionContext(){
  if(!Number.isInteger(selectedRow))return null;
  const active=activeParameterIndex(),labels=plotLabel(current,current.rows[selectedRow],selectedRow);
  return {version:1,dataset:keyFor(current),datasetName:current.name,uid:plotUid(selectedRow),row:selectedRow,plot:labels.id,parameter:active>=0?current.headers[active]:'',observer:String(config.observer||''),session:String(config.session?.label||''),returnUrl:location.pathname};
}
function openCompanion(path,type){
  if(dirty)saveEditor({quiet:true,rerender:false});
  const context=companionContext();if(!context)return;
  try{sessionStorage.setItem('agrotik_field_context_v1',JSON.stringify({...context,type}));}catch{}
  location.href=path+'?field=1';
}
async function saveSelectedPhoto(event){
  const file=event.target.files?.[0];event.target.value='';if(!file||!Number.isInteger(selectedRow))return;
  const uid=plotUid(selectedRow),label=plotLabel(current,current.rows[selectedRow],selectedRow).id;
  try{
    await saveFieldPhoto({dataset:keyFor(current),uid,file,label,observer:config.observer,session:config.session?.label||''});
    const key=plotKey(selectedRow),meta={...config.plotMeta},previous=meta[key]||{};
    meta[key]={...previous,photoCount:Number(previous.photoCount||0)+1,updatedAt:new Date().toISOString(),observer:String(config.observer||'')};
    config={...config,plotMeta:meta};writeConfig(current,config);await renderMediaTimeline(selectedRow);renderMap();
  }catch(error){const status=$('#fieldEditorStatus');if(status)status.textContent=error.message||'Foto belum dapat disimpan.';}
}
function blobDataUrl(blob){return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(reader.error);reader.readAsDataURL(blob);});}
async function renderMediaTimeline(rowIndex){
  const host=$('#fieldMediaTimeline');if(!host||!Number.isInteger(rowIndex))return;
  host.innerHTML='<small>Memuat foto…</small>';
  try{
    const rows=await listFieldPhotos(keyFor(current),plotUid(rowIndex));
    if(!rows.length){host.innerHTML='<small>Belum ada foto plot.</small>';return;}
    const shown=rows.slice(0,8),parts=[];
    for(const item of shown){const src=await blobDataUrl(item.blob);parts.push(`<figure><img src="${src}" alt="Foto ${esc(item.label||'plot')}"><figcaption>${esc(new Date(item.createdAt).toLocaleDateString('id-ID'))}<button type="button" data-field-photo-delete="${esc(item.id)}">×</button></figcaption></figure>`);}
    host.innerHTML=parts.join('');
  }catch{host.innerHTML='<small>Foto lokal tidak dapat dibaca.</small>';}
}
async function removeSelectedPhoto(id){
  if(!id||!Number.isInteger(selectedRow)||!confirm('Hapus foto plot ini dari perangkat?'))return;
  try{
    await deleteFieldPhoto(id);const key=plotKey(selectedRow),meta={...config.plotMeta},previous=meta[key]||{};
    meta[key]={...previous,photoCount:Math.max(0,Number(previous.photoCount||1)-1)};config={...config,plotMeta:meta};writeConfig(current,config);await renderMediaTimeline(selectedRow);renderMap();
  }catch(error){const status=$('#fieldEditorStatus');if(status)status.textContent=error.message||'Foto belum dapat dihapus.';}
}
function captureGps(){
  if(!Number.isInteger(selectedRow))return;
  const status=$('#fieldEditorStatus');
  if(!navigator.geolocation){if(status)status.textContent='GPS tidak tersedia di browser ini.';return;}
  if(status)status.textContent='Membaca posisi GPS…';
  navigator.geolocation.getCurrentPosition(position=>{
    pushLayoutHistory('GPS plot');const key=plotKey(selectedRow),meta={...config.plotMeta},previous=meta[key]||{};
    meta[key]={...previous,gps:{lat:position.coords.latitude,long:position.coords.longitude,accuracy:position.coords.accuracy,at:new Date().toISOString()}};
    config={...config,plotMeta:meta};writeConfig(current,config);renderEditor(selectedRow);
  },error=>{if(status)status.textContent=error.code===1?'Izin lokasi tidak diberikan.':'Lokasi belum dapat dibaca.';},{enableHighAccuracy:true,timeout:12000,maximumAge:30000});
}

function statusOptions(selected='',includeKeep=false){
  const list=[['normal','Normal'],['missing','Petak kosong'],['dead','Tanaman mati'],['damaged','Rusak'],['harvested','Panen'],['border','Border']];
  return (includeKeep?'<option value="">Jangan ubah status</option>':'')+list.map(([value,label])=>`<option value="${value}" ${value===selected?'selected':''}>${label}</option>`).join('');
}
function renderBatchEditor(){
  if(!multiMode)return;
  const host=$('#fieldPlotEditor');if(!host)return;
  const measures=measurementColumns(current),count=selectedRows.size;
  host.innerHTML=`
    <div class="field-editor-head"><div><small>Mode massal</small><strong>${count} plot dipilih</strong><span>Klik plot untuk menambah/mengurangi pilihan</span></div></div>
    <div class="field-batch-toolbar"><button type="button" data-batch-select-visible>Pilih terlihat</button><button type="button" data-batch-clear>Kosongkan pilihan</button></div>
    <div class="field-batch-editor" data-batch-editor>
      <label>Parameter<select data-batch-column><option value="-1">Tanpa mengubah nilai</option>${measures.map(item=>`<option value="${item.index}">${esc(item.header)}</option>`).join('')}</select></label>
      <label>Nilai<input data-batch-value autocomplete="off" inputmode="decimal" placeholder="Nilai untuk semua plot"></label>
      <label>Status<select data-batch-status>${statusOptions('',true)}</select></label>
      <button type="button" class="primary" data-batch-apply ${count?'':'disabled'}>Terapkan ke ${count} plot</button>
      <p class="field-editor-status" id="fieldBatchStatus"></p>
    </div>`;
}
function applyBatch(){
  const rows=[...selectedRows].filter(index=>index>=0&&index<current.rows.length);
  if(!rows.length)return;
  const col=Number($('#fieldPlotEditor [data-batch-column]')?.value??-1);
  const value=String($('#fieldPlotEditor [data-batch-value]')?.value??'').trim();
  const status=String($('#fieldPlotEditor [data-batch-status]')?.value||'');
  const changes=col>=0?rows.map(row=>({row,col,value})):[];
  if(col>=0&&value===''&&!confirm(`Nilai kosong akan diterapkan ke ${rows.length} plot dan dapat menghapus data parameter terpilih. Lanjutkan?`))return;
  if((col>=0||status)&&rows.length>1&&!confirm(`Terapkan perubahan massal ke ${rows.length} plot?`))return;
  const result=changes.length?api()?.updateCells?.(changes,'isi massal dari denah lahan'):{ok:true,changed:false,count:0};
  if(!result?.ok){const out=$('#fieldBatchStatus');if(out)out.textContent=result?.error||'Perubahan massal gagal.';return;}
  if(status){
    pushLayoutHistory('status massal');const statuses={...config.statuses};for(const row of rows)statuses[plotKey(row)]=status;
    config={...config,statuses};writeConfig(current,config);
  }
  refreshData(false);renderMap();renderBatchEditor();
  const out=$('#fieldBatchStatus');if(out)out.textContent=`✓ ${rows.length} plot diperbarui.`;
}
function printQrLabels(){
  $('#fieldQrSheet')?.remove();
  const sheet=document.createElement('section');sheet.id='fieldQrSheet';sheet.className='field-qr-sheet';
  sheet.innerHTML='<header><b>Label QR Plot · '+esc(current.name||'Dataset')+'</b><span>Scan untuk membuka plot pada Denah Lahan</span></header><div class="field-qr-grid">'+current.rows.map((row,index)=>{
    const uid=plotUid(index),labels=plotLabel(current,row,index),group=groupLabelForRow(index),url=location.origin+'/stat/#p='+encodeURIComponent(uid.slice(0,12));
    return '<article><div class="field-qr-code">'+qrSvg(url,{moduleSize:3,margin:3})+'</div><b>'+esc(labels.id)+'</b><span>'+esc(group)+'</span><small>'+esc(uid.slice(0,12))+'</small></article>';
  }).join('')+'</div>';
  document.body.append(sheet);document.body.classList.add('field-qr-print');
  const cleanup=()=>{document.body.classList.remove('field-qr-print');sheet.remove();window.removeEventListener('afterprint',cleanup);};
  window.addEventListener('afterprint',cleanup);window.print();setTimeout(()=>{if(document.body.classList.contains('field-qr-print'))cleanup();},30000);
}

function exportLayout(){
  const payload={version:2,dataset:keyFor(current),rows:current.rows.length,headers:[...current.headers],config};
  const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),link=document.createElement('a');
  link.href=url;link.download=(String(current.name||'dataset').replace(/[^a-z0-9._-]+/gi,'-')||'dataset')+'-denah.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),10000);
}
async function importLayout(event){
  const file=event.target.files?.[0];event.target.value='';if(!file)return;
  try{
    const payload=JSON.parse(await file.text());
    if(!payload||typeof payload!=='object'||!payload.config)throw Error('File denah tidak valid.');
    if(Number(payload.rows)!==current.rows.length)throw Error(`Jumlah plot berbeda: file ${payload.rows}, dataset ${current.rows.length}.`);
    const incoming=Array.isArray(payload.headers)?payload.headers.map(String):[];
    if(incoming.length!==current.headers.length||incoming.some((header,index)=>header!==String(current.headers[index])))throw Error('Struktur kolom file denah berbeda dari dataset aktif.');
    if(payload.dataset&&String(payload.dataset)!==keyFor(current)&&!confirm('Nama dataset pada file denah berbeda. Struktur plot cocok. Tetap impor?'))return;
    pushLayoutHistory('impor denah');config=normalizeConfig(current,payload.config);writeConfig(current,config);renderControls();renderMap();
    if(Number.isInteger(selectedRow))renderEditor(selectedRow);
  }catch(error){alert(error.message||'File denah tidak dapat dibaca.');}
}
function resetLayout(){
  if(!confirm('Reset susunan fisik denah? Status dan catatan plot tetap dipertahankan.'))return;
  const base=defaultConfig(current);pushLayoutHistory('reset susunan');
  config={...config,columns:base.columns,serpentine:true,north:'N',roadEvery:0,order:{},roadAfter:{},flipX:false,flipY:false};
  writeConfig(current,config);layoutEditMode=false;$('#fieldLayoutEdit')?.setAttribute('aria-pressed','false');renderControls();renderMap();
}

function readControls(){
  if(!current)return;
  pushLayoutHistory('ubah pengaturan denah');config={...config,
    observer:String($('#fieldObserver').value||'').trim(),
    session:{...config.session,label:String($('#fieldSessionLabel').value||'').trim(),parameter:Number($('#fieldActiveParameter').value),date:config.session?.date||new Date().toISOString().slice(0,10)},
    id:Number($('#fieldIdColumn').value),
    group:Number($('#fieldGroupColumn').value),
    color:Number($('#fieldColorColumn').value),
    colorMode:$('#fieldColorMode').value,
    heatmap:Number($('#fieldHeatmapColumn').value),
    heatTransform:$('#fieldHeatTransform').value,
    filter:$('#fieldFilter').value,
    columns:Math.max(2,Math.min(12,Number($('#fieldColumns').value)||6)),
    roadEvery:Math.max(0,Math.min(8,Number($('#fieldRoadEvery').value)||0)),
    north:$('#fieldNorth').value,
    size:$('#fieldPlotSize').value,
    serpentine:$('#fieldSerpentine').checked
  };
  writeConfig(current,config);renderMap();
  if(Number.isInteger(selectedRow))renderEditor(selectedRow);
}
function renderControls(){
  $('#fieldObserver').value=String(config.observer||'');
  $('#fieldSessionLabel').value=String(config.session?.label||'');
  const measures=measurementColumns(current);
  $('#fieldActiveParameter').innerHTML='<option value="-1">Semua parameter</option>'+measures.map(item=>`<option value="${item.index}" ${item.index===Number(config.session?.parameter)?'selected':''}>${esc(item.header)}</option>`).join('');
  $('#fieldIdColumn').innerHTML=options(current.headers,config.id);
  $('#fieldGroupColumn').innerHTML=options(current.headers,config.group,true);
  $('#fieldColorColumn').innerHTML=options(current.headers,config.color);
  $('#fieldHeatmapColumn').innerHTML='<option value="-1">Pilih parameter</option>'+measures.map(item=>`<option value="${item.index}" ${item.index===config.heatmap?'selected':''}>${esc(item.header)}</option>`).join('');
  $('#fieldColorMode').value=config.colorMode;
  $('#fieldHeatTransform').value=config.heatTransform||'raw';
  $('#fieldFilter').value=config.filter;
  $('#fieldColumns').value=String(config.columns);
  $('#fieldRoadEvery').value=String(config.roadEvery||0);
  $('#fieldNorth').value=config.north;
  $('#fieldPlotSize').value=config.size;
  $('#fieldSerpentine').checked=config.serpentine;
  $('#fieldHeatmapWrap').hidden=config.colorMode!=='parameter';$('#fieldHeatTransformWrap').hidden=config.colorMode!=='parameter';
  $('#fieldLayoutModal')?.classList.toggle('field-mode',config.fieldMode===true);
  $('#fieldModeToggle')?.setAttribute('aria-pressed',String(config.fieldMode===true));
  if($('#fieldUndo'))$('#fieldUndo').disabled=!layoutUndo.length;if($('#fieldRedo'))$('#fieldRedo').disabled=!layoutRedo.length;
}
function renderStats(){
  const progress=current.rows.map(row=>rowProgress(current,row));
  const complete=progress.filter(item=>item.status==='complete').length;
  const partial=progress.filter(item=>item.status==='partial').length;
  const empty=progress.filter(item=>item.status==='empty').length;
  const flagged=current.rows.reduce((sum,_,index)=>sum+(plotStatus(index)!=='normal'?1:0),0);
  const measures=measurementColumns(current).length,active=activeParameterIndex(),chips=[];
  chips.push(`<span><b>${current.rows.length}</b> plot</span><span><b>${measures}</b> parameter</span>`);
  if(active>=0){
    const done=current.rows.reduce((sum,_,index)=>sum+(!rowIncomplete(index)?1:0),0);
    chips.push(`<span><b>${done}/${current.rows.length}</b> ${esc(current.headers[active])}</span>`);
    for(const [label,entries] of groupEntries(current)){
      const filled=entries.reduce((sum,entry)=>sum+(!rowIncomplete(entry.index)?1:0),0);
      chips.push(`<span><b>${filled}/${entries.length}</b> ${esc(label)}</span>`);
    }
  }else if(measures)chips.push(`<span><b>${complete}</b> lengkap</span><span><b>${partial}</b> sebagian</span><span><b>${empty}</b> kosong</span>`);
  else chips.push('<span>Tambahkan parameter untuk mulai pengamatan.</span>');
  chips.push(`<span><b>${flagged}</b> status khusus</span>`);
  if(multiMode)chips.push(`<span><b>${selectedRows.size}</b> dipilih</span>`);
  $('#fieldLayoutStats').innerHTML=chips.join('');
}
function renderMap(){
  if(!current)return;
  const query=String($('#fieldSearch')?.value||'').trim().toLocaleLowerCase('id-ID');
  const scale=heatmapScale(),map=$('#fieldMap');
  map.className=`field-map field-size-${config.size}${layoutEditMode?' field-layout-editing':''}${multiMode?' field-multi-mode':''}`;
  const arrow=$('#fieldNorthArrow');if(arrow)arrow.dataset.direction=config.north;
  const legend=$('#fieldHeatLegend');
  if(legend){
    if(scale){
      legend.hidden=false;legend.innerHTML=`<b>${esc(current.headers[scale.index])}</b><span>${esc(String(scale.min))}</span><i></i><span>${esc(String(scale.max))}</span>`;
    }else if(config.colorMode==='treatment'){
      const values=[...new Set(current.rows.map(row=>colorLabel(current,row)).filter(Boolean))].slice(0,8);
      legend.hidden=!values.length;legend.innerHTML=values.map(value=>`<span class="field-legend-chip" style="--legend-hue:${hashHue(value)}"><i></i>${esc(value)}</span>`).join('');
    }else if(config.colorMode==='completion'){
      legend.hidden=false;legend.innerHTML='<span class="field-legend-chip"><i style="--legend-hue:135"></i>Lengkap</span><span class="field-legend-chip"><i style="--legend-hue:42"></i>Sebagian</span><span class="field-legend-chip"><i style="--legend-hue:0"></i>Kosong</span>';
    }else legend.hidden=true;
  }
  const groups=groupEntries(current),objects=(config.objects||[]);
  let visible=0;
  const objectHtml=objects.length?`<div class="field-map-objects">${objects.map(item=>`<span data-field-object="${esc(item.id)}"><b>${esc(item.type)}</b>${esc(item.label)}<button type="button" data-remove-field-object="${esc(item.id)}" aria-label="Hapus objek">×</button></span>`).join('')}</div>`:'';
  const blocks=groups.map(([label,entries])=>{
    const ordered=orientEntries(orderedEntries(entries,config.columns,config.serpentine));
    if(!ordered.length)return '';
    const plots=ordered.map((entry,index)=>{
      const matches=matchingSearch(entry,current,query)&&passesFilter(entry);
      if(matches)visible++;
      if(!matches)return '<span class="field-plot-placeholder" aria-hidden="true"></span>';
      const labels=plotLabel(current,entry.row,entry.index),progress=rowProgress(current,entry.row),visual=visualForPlot(entry,scale),status=plotStatus(entry.index),note=plotNote(entry.index),meta=config.plotMeta?.[plotKey(entry.index)]||{};
      const selected=entry.index===selectedRow?' is-selected':'',multi=selectedRows.has(entry.index)?' is-multi-selected':'',special=status!=='normal'?` field-status-${status}`:'';
      const draggable=layoutEditMode?' draggable="true"':'';
      const statusLabel={missing:'Kosong',dead:'Mati',damaged:'Rusak',harvested:'Panen',border:'Border'}[status]||'';
      const plot=`<button type="button" class="field-plot field-plot-${progress.status}${selected}${multi}${special}${visual.heat?' is-heatmap':''}" data-field-row="${entry.index}" data-field-group="${esc(label)}" ${draggable} style="--plot-hue:${visual.hue}" title="Baris ${entry.index+1}${note?' · '+esc(note):''}">
        <b>${esc(labels.id)}</b>${labels.secondary?`<span>${esc(labels.secondary)}</span>`:'<span>Plot</span>'}<small>${esc(visual.label)}</small>${statusLabel?`<em>${statusLabel}</em>`:''}${meta.photoCount?'<i class="field-plot-photo">▣</i>':''}${meta.gps?'<i class="field-plot-gps">⌖</i>':''}
      </button>`;
      const automatic=config.roadEvery>0&&(index+1)%(config.columns*config.roadEvery)===0&&index<ordered.length-1,manual=!!config.roadAfter?.[plotKey(entry.index)];
      const road=(automatic||manual)?`<div class="field-road" role="separator"><span>${manual?'Jalan manual':'Jalan'}</span></div>`:'';
      return plot+road;
    }).join('');
    return `<section class="field-block"><div class="field-block-head"><b>${esc(label)}</b><span>${ordered.length} plot${layoutEditMode?' · tarik untuk susun':''}</span></div><div class="field-block-grid" style="--field-columns:${config.columns}">${plots}</div></section>`;
  }).join('');
  map.innerHTML=objectHtml+blocks;
  if(!visible&&!objects.length)map.innerHTML='<div class="field-map-empty">Tidak ada plot yang cocok dengan filter.</div>';
  applyZoom();renderStats();
}
function fieldInput(data,row,index,{active=false,readonly=false}={}){
  const header=data.headers[index],value=String(row[index]??''),numeric=sampleNumeric(data,index);
  return `<label class="field-editor-field${active?' is-active':''}"><span>${esc(header)}</span><input data-field-col="${index}" ${active?'data-field-active-input':''} value="${esc(value)}" ${numeric?'inputmode="decimal"':''} ${readonly?'readonly':''} autocomplete="off"></label>`;
}
function editorMeasures(){
  const measures=measurementColumns(current),active=activeParameterIndex();
  if(!config.fieldMode||active<0)return measures.map(item=>({...item,active:item.index===active,readonly:false}));
  const group=sampleGroupForIndex(active);
  if(!group)return [{header:current.headers[active],index:active,active:true,readonly:false}];
  const items=group.members.map(header=>({header,index:current.headers.indexOf(header),active:true,readonly:false})).filter(item=>item.index>=0);
  const meanIndex=current.headers.indexOf(group.meanHeader);if(meanIndex>=0)items.push({header:group.meanHeader,index:meanIndex,active:false,readonly:true});
  return items;
}
function renderEditor(rowIndex){
  const row=current.rows[rowIndex];if(!row)return;
  const labels=plotLabel(current,row,rowIndex),allMeasures=measurementColumns(current),measures=editorMeasures(),measureSet=new Set(allMeasures.map(item=>item.index));
  const structural=current.headers.map((header,index)=>({header,index})).filter(item=>!measureSet.has(item.index));
  const progress=rowProgress(current,row),active=activeParameterIndex(),activeHeader=active>=0?current.headers[active]:'',meta=config.plotMeta?.[plotKey(rowIndex)]||{};
  const quickScore=config.fieldMode&&active>=0&&/(skor|score|karat|penyakit|severity|rating)/i.test(activeHeader)?'<div class="field-quick-score">'+[0,1,2,3,4,5].map(value=>`<button type="button" data-quick-score="${value}">${value}</button>`).join('')+'</div>':'';
  const activeDone=!rowIncomplete(rowIndex);
  $('#fieldPlotEditor').innerHTML=`
    <div class="field-editor-head">
      <div><small>Plot ${rowIndex+1}${config.session?.label?' · '+esc(config.session.label):''}</small><strong>${esc(labels.id)}</strong>${labels.secondary?`<span>${esc(labels.secondary)}</span>`:''}</div>
      <span class="field-editor-progress">${active>=0?(activeDone?'Selesai ✓':'Belum diisi'):(progress.total?`${progress.filled}/${progress.total} terisi`:'Belum ada parameter')}</span>
    </div>
    <div class="field-editor-nav field-editor-nav-three"><button type="button" data-field-prev>‹ Sebelumnya</button><button type="button" data-field-next-incomplete>Belum diisi</button><button type="button" data-field-next>Berikutnya ›</button></div>
    ${layoutEditMode?'<div class="field-layout-move"><button type="button" data-field-move="-1">← Geser</button><button type="button" data-field-move="1">Geser →</button></div>':''}
    <div class="field-editor-fields">
      ${measures.length?`<div class="field-editor-section"><b>${active>=0?esc(activeHeader):'Pengamatan'}</b>${measures.map(item=>fieldInput(current,row,item.index,{active:item.active,readonly:item.readonly})).join('')}${quickScore}</div>`:'<div class="field-editor-empty compact">Belum ada kolom pengamatan. Tekan <b>+ Parameter</b>.</div>'}
      <div class="field-condition-quick"><button type="button" data-field-status-quick="normal">Normal</button><button type="button" data-field-status-quick="dead">Mati</button><button type="button" data-field-status-quick="damaged">Rusak</button><button type="button" data-field-status-quick="harvested">Panen</button></div>
      <div class="field-editor-tools">
        <button type="button" data-field-photo>Foto</button>
        <button type="button" data-field-gps>${meta.gps?'GPS ✓':'GPS'}</button>
        <button type="button" data-field-road-toggle>${config.roadAfter?.[plotKey(rowIndex)]?'Hapus jalan':'Jalan sesudah'}</button>
        <button type="button" data-field-camera-measure>Kamera ukur</button>
        <button type="button" data-field-chili>Hitung cabai</button>
      </div>
      <div id="fieldMediaTimeline" class="field-media-timeline"></div>
      <div class="field-editor-meta">
        <label><span>Status plot</span><select data-field-status>${statusOptions(plotStatus(rowIndex))}</select></label>
        <label><span>Catatan lapang</span><textarea data-field-note rows="2" placeholder="Mis. rebah, serangan, petak pinggir…">${esc(plotNote(rowIndex))}</textarea></label>
        <small class="field-meta-stamp">${meta.updatedAt?'Terakhir '+esc(new Date(meta.updatedAt).toLocaleString('id-ID'))+(meta.observer?' · '+esc(meta.observer):''):'Belum pernah disimpan'}${meta.gps?` · GPS ±${Math.round(Number(meta.gps.accuracy)||0)} m`:''}</small>
      </div>
      <details class="field-editor-identity" ${config.fieldMode?'':'open'}><summary>Identitas plot</summary>${structural.map(item=>fieldInput(current,row,item.index)).join('')}</details>
    </div>
    <div class="field-editor-actions"><button type="button" data-field-open-row>Buka di tabel</button><button type="button" class="primary" data-field-save>Simpan</button></div>
    <p class="field-editor-status" id="fieldEditorStatus"></p>`;
  dirty=false;void renderMediaTimeline(rowIndex);
}
function selectRow(index){
  if(dirty&&!confirm('Ada perubahan yang belum disimpan. Pindah plot tanpa menyimpan?'))return;
  selectedRow=index;dirty=false;renderMap();renderEditor(index);
  $('#fieldPlotEditor').scrollTop=0;
  requestAnimationFrame(()=>$('#fieldPlotEditor [data-field-col]:not([disabled])')?.focus({preventScroll:true}));
}
function saveEditor({quiet=false,rerender=true}={}){
  if(!Number.isInteger(selectedRow)||!current?.rows[selectedRow])return;
  clearTimeout(autoSaveTimer);
  const values=[...current.rows[selectedRow]];
  $('#fieldPlotEditor').querySelectorAll('[data-field-col]').forEach(input=>{if(!input.readOnly)values[Number(input.dataset.fieldCol)]=input.value.trim();});
  applySampleMeans(values);
  const result=api()?.replaceRow?.(selectedRow,values,'edit plot dari denah lahan');
  const status=$('#fieldEditorStatus');
  if(!result?.ok){if(status)status.textContent=result?.error||'Data belum dapat disimpan.';return;}
  const nextStatus=String($('#fieldPlotEditor [data-field-status]')?.value||'normal');
  const nextNote=String($('#fieldPlotEditor [data-field-note]')?.value||'').trim();
  const statuses={...config.statuses},notes={...config.notes},meta={...config.plotMeta};
  const key=plotKey(selectedRow),beforeStatus=plotStatus(selectedRow),beforeNote=plotNote(selectedRow);
  if(beforeStatus!==nextStatus||beforeNote!==nextNote)pushLayoutHistory('status/catatan plot');
  delete statuses[selectedRow];delete notes[selectedRow];
  if(nextStatus==='normal')delete statuses[key];else statuses[key]=nextStatus;
  if(nextNote)notes[key]=nextNote;else delete notes[key];
  meta[key]={...(meta[key]||{}),updatedAt:new Date().toISOString(),observer:String(config.observer||'')};
  config={...config,statuses,notes,plotMeta:meta};writeConfig(current,config);
  dirty=false;refreshData(false);renderMap();
  if(rerender)renderEditor(selectedRow);
  const freshStatus=$('#fieldEditorStatus');if(freshStatus&&!quiet)freshStatus.textContent=result.changed?'✓ Data dan status tersimpan.':'✓ Status/catatan tersimpan.';
}
function stepEditor(direction){
  if(!current?.rows.length)return;
  if(dirty){saveEditor();if(dirty)return;}
  const route=[...($('#fieldMap')?.querySelectorAll('[data-field-row]')||[])].map(plot=>Number(plot.dataset.fieldRow)).filter(Number.isInteger);
  if(!route.length)return;
  let index=route.indexOf(selectedRow);
  if(index<0)index=direction>0?-1:0;
  index=(index+direction+route.length)%route.length;
  selectRow(route[index]);
}
function addParameter(){
  const name=prompt('Nama parameter baru, misalnya Tinggi Tanaman (cm):','');
  if(!name)return;
  const result=api()?.appendColumn?.(name,'tambah parameter dari denah lahan');
  if(!result?.ok){alert(result?.error||'Parameter belum dapat ditambahkan.');return;}
  refreshData(false);renderControls();renderMap();
  if(Number.isInteger(selectedRow))renderEditor(selectedRow);
}
function refreshData(render=true){
  current=dataset();
  const saved=readStore()[keyFor(current)];
  config=normalizeConfig(current,saved);
  if(render){renderControls();renderMap();}
}

function ensureReturnColumn(preferred,fallback){
  let index=current.headers.findIndex(header=>String(header).toLocaleLowerCase('id-ID')===String(preferred||'').toLocaleLowerCase('id-ID'));
  if(index<0&&fallback instanceof RegExp)index=current.headers.findIndex(header=>fallback.test(String(header)));
  if(index>=0)return index;
  const name=String(preferred||'').trim()||'Pengukuran';
  const result=api()?.appendColumn?.(name,'tambah parameter dari alat lapang');
  if(!result?.ok)return -1;
  refreshData(false);return Number(result.index);
}
function consumeFieldReturn(){
  let payload=null;
  try{payload=JSON.parse(localStorage.getItem('agrotik_field_return_v1')||'null');}catch{}
  if(!payload||String(payload.dataset)!==keyFor(current))return null;
  const row=config.uids.findIndex(uid=>String(uid)===String(payload.uid));
  if(row<0||row>=current.rows.length)return null;
  let col=-1;
  if(payload.type==='chili_count')col=ensureReturnColumn(payload.parameter||'Jumlah Cabai',/(jumlah.*cabai|cabai.*jumlah|jumlah.*buah)/i);
  else if(payload.type==='camera_measure')col=ensureReturnColumn(payload.parameter||'Pengukuran (mm)',/(panjang|jarak|diameter|lebar).*(mm|cm)?/i);
  if(col<0)return null;
  const result=api()?.updateCells?.([{row,col,value:String(payload.value??'')}],'hasil alat lapang ke denah');
  if(result?.ok){
    try{localStorage.removeItem('agrotik_field_return_v1');sessionStorage.removeItem('agrotik_field_context_v1');}catch{}
    refreshData(false);config={...config,session:{...config.session,parameter:col}};writeConfig(current,config);return row;
  }
  return null;
}

function closeFieldLayout(){
  if(dirty&&!confirm('Ada perubahan plot yang belum disimpan. Tutup tanpa menyimpan?'))return;
  $('#fieldLayoutModal')?.classList.remove('open');document.body.classList.remove('field-layout-open');
  dirty=false;multiMode=false;layoutEditMode=false;selectedRows.clear();selectedRow=null;
}
export function openFieldLayout(options={}){
  ensureModal();refreshData();
  const returnedRow=consumeFieldReturn();
  $('#fieldLayoutDataset').textContent=`${current.name||'Dataset'} · ${current.rows.length} baris`;
  $('#fieldLayoutModal').classList.add('open');document.body.classList.add('field-layout-open');
  selectedRow=null;dirty=false;multiMode=false;layoutEditMode=false;selectedRows.clear();layoutUndo.length=0;layoutRedo.length=0;
  $('#fieldMultiToggle').setAttribute('aria-pressed','false');$('#fieldLayoutEdit').setAttribute('aria-pressed','false');
  $('#fieldPlotEditor').innerHTML='<div class="field-editor-empty">Klik satu plot untuk mengisi data.</div>';
  renderControls();renderMap();
  let target=Number.isInteger(returnedRow)?returnedRow:Number(options.row);
  const prefix=String(options.uidPrefix||'').trim();if(prefix)target=config.uids.findIndex(uid=>String(uid).startsWith(prefix));
  if(Number.isInteger(target)&&target>=0&&target<current.rows.length)selectRow(target);
}
