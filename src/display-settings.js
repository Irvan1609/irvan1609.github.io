const KEY='statistical_web_font_size';
const OPTIONS={small:{label:'Kecil',scale:.88},medium:{label:'Sedang',scale:1},large:{label:'Besar',scale:1.15}};

function ensureStyles(){
  if(document.getElementById('globalDisplaySettingsStyle'))return;
  const style=document.createElement('style');
  style.id='globalDisplaySettingsStyle';
  style.textContent=`
    :root{--ui-scale:1}
    html[data-ui-font="small"]{--ui-scale:.88}
    html[data-ui-font="medium"]{--ui-scale:1}
    html[data-ui-font="large"]{--ui-scale:1.15}
    body>.subweb-header,
    body>#app,
    body>.modal-backdrop,
    body>.analysis-result-dock,
    body>.mobile-dataset-backdrop,
    body>.simple-web-dialog-backdrop,
    body>#columnContextMenu,
    body>.account-status,
    body>.agrotik-offline{zoom:var(--ui-scale)}
    .app-header{position:relative}
    .nav{position:relative}
    #appSettingsToggle{display:inline-flex;align-items:center;justify-content:center;width:28px;min-width:28px;height:28px;min-height:28px;padding:0;border-radius:6px;font-size:13px;line-height:1;margin-left:auto}\n    .settings-toggle-icon{width:17px;height:17px;display:block}
    #appSettingsToggle[aria-expanded="true"]{background:#eaf1fd;border-color:#9ab3d6;color:#194caa}
    #appSettingsPanel{position:absolute;right:6px;top:calc(100% + 5px);z-index:120;width:min(260px,calc(100vw / var(--ui-scale) - 20px));padding:8px;background:#fff;border:1px solid var(--border);border-radius:7px;box-shadow:0 10px 24px #15233422}
    #appSettingsPanel[hidden]{display:none!important}
    .settings-panel-title{display:flex;align-items:center;justify-content:space-between;gap:6px;margin-bottom:6px;font-size:13px;font-weight:700}
    #closeAppSettings{width:26px;min-width:26px;height:26px;min-height:26px;padding:0;border-radius:5px}
    .settings-section input[type="range"]{display:block;width:100%;margin:6px 0 2px}
    .settings-range-label{display:flex!important;align-items:center;justify-content:space-between;gap:8px}
    .settings-range-label output{font-variant-numeric:tabular-nums;color:var(--muted);font-weight:700}
    .settings-section{padding:6px 0;border-top:1px solid #e5eaf0}
    .settings-section:first-of-type{border-top:0;padding-top:0}
    .settings-section label{display:block;margin-bottom:3px;font-size:11.5px;font-weight:600}
    .settings-section select{display:block;width:100%;min-height:30px;padding:4px 6px;border:1px solid var(--border);border-radius:5px;background:#fff;color:var(--text);font-size:11.5px}
    .settings-section p{margin:4px 0 0;color:var(--muted);font-size:10px;line-height:1.3}
    .settings-detected{padding:7px 9px;margin-bottom:8px;background:#eef6ff;border:1px solid #c9ddf3;border-radius:6px;color:#315a80;font-size:.875em}
    @media(max-width:720px){#appSettingsPanel{right:5px;width:min(270px,calc(100vw / var(--ui-scale) - 10px))}}
  `;
  document.head.appendChild(style);
}

function ensureSettingsUi(){
  const topbar=document.querySelector('.app-header');
  const nav=document.querySelector('.nav');
  if(!topbar||!nav)return null;
  let toggle=document.getElementById('appSettingsToggle');
  let panel=document.getElementById('appSettingsPanel');
  if(!toggle){
    toggle=document.createElement('button');
    toggle.id='appSettingsToggle';
    toggle.type='button';
    toggle.innerHTML='<svg class="settings-toggle-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h10M18 7h2M4 17h2M10 17h10M14 4v6M8 14v6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><circle cx="16" cy="7" r="2" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="8" cy="17" r="2" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>';
    toggle.title='Pengaturan';
    toggle.setAttribute('aria-label','Pengaturan');
    toggle.setAttribute('aria-haspopup','true');
    toggle.setAttribute('aria-expanded','false');
    nav.append(toggle);
  }
  if(!panel){
    panel=document.createElement('div');
    panel.id='appSettingsPanel';
    panel.hidden=true;
    panel.innerHTML='<div class="settings-panel-title"><span>Pengaturan</span><button id="closeAppSettings" type="button" aria-label="Tutup pengaturan">✕</button></div><section class="settings-section"><label for="dataFontSize">Ukuran tampilan</label><select id="dataFontSize"><option value="small">Kecil</option><option value="medium">Sedang</option><option value="large">Besar</option></select><p>Mengatur skala antarmuka.</p></section><section class="settings-section"><label class="settings-range-label" for="editorZoom"><span>Zoom Data Editor</span><output id="editorZoomValue">100%</output></label><input id="editorZoom" type="range" min="65" max="165" step="5" value="100"><p>Di HP juga dapat diubah langsung dengan gestur dua jari pada tabel.</p></section><div id="numberSettingsMount"></div>';
    topbar.append(panel);
  }
  const openPanel=()=>{
    document.dispatchEvent(new CustomEvent('stat-close-floating',{detail:{except:'settings'}}));
    panel.hidden=false;
    toggle.setAttribute('aria-expanded','true');
  };
  const closePanel=()=>{
    panel.hidden=true;
    toggle.setAttribute('aria-expanded','false');
  };
  if(!toggle.dataset.bound){
    toggle.dataset.bound='1';
    toggle.addEventListener('click',event=>{
      event.stopPropagation();
      if(panel.hidden)openPanel();else closePanel();
    });
    panel.addEventListener('click',event=>event.stopPropagation());
    document.addEventListener('click',()=>{if(!panel.hidden)closePanel();});
    document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!panel.hidden){closePanel();toggle.focus();}});
    document.addEventListener('stat-close-floating',event=>{if(event.detail?.except!=='settings'&&!panel.hidden)closePanel();});
  }
  if(!panel.dataset.mobileOpenBound){
    panel.dataset.mobileOpenBound='1';
    document.addEventListener('stat-open-settings',()=>openPanel());
    panel.querySelector('#closeAppSettings')?.addEventListener('click',event=>{event.stopPropagation();closePanel();});
  }
  return panel;
}

export function initDisplaySettings(){
  ensureStyles();
  const panel=ensureSettingsUi();
  if(!panel)return;
  const select=document.getElementById('dataFontSize');
  const editorZoom=document.getElementById('editorZoom');
  const editorZoomValue=document.getElementById('editorZoomValue');
  const GRID_ZOOM_KEY='statistical_web_grid_zoom_v1';
  let saved='medium';
  try{saved=localStorage.getItem(KEY)||'medium';}catch{}
  if(!OPTIONS[saved])saved='medium';
  select.value=saved;
  let savedEditorZoom=1;
  try{
    const value=Number(localStorage.getItem(GRID_ZOOM_KEY));
    if(Number.isFinite(value))savedEditorZoom=Math.max(.65,Math.min(1.65,value));
  }catch{}
  if(editorZoom){
    editorZoom.value=String(Math.round(savedEditorZoom*100/5)*5);
    if(editorZoomValue)editorZoomValue.textContent=Math.round(savedEditorZoom*100)+'%';
  }
  const syncEditorZoom=(zoom,{commit=false}={})=>{
    const value=Math.max(.65,Math.min(1.65,Number(zoom)||1));
    if(editorZoom)editorZoom.value=String(Math.round(value*100/5)*5);
    if(editorZoomValue)editorZoomValue.textContent=Math.round(value*100)+'%';
    document.dispatchEvent(new CustomEvent('stat-grid-zoom-change',{detail:{zoom:value,commit}}));
    if(commit){try{localStorage.setItem(GRID_ZOOM_KEY,String(value));}catch{}}
  };
  if(editorZoom&&!editorZoom.dataset.bound){
    editorZoom.dataset.bound='1';
    editorZoom.addEventListener('input',()=>syncEditorZoom(Number(editorZoom.value)/100,{commit:false}));
    editorZoom.addEventListener('change',()=>syncEditorZoom(Number(editorZoom.value)/100,{commit:true}));
    document.addEventListener('stat-grid-zoom-updated',event=>{
      const value=Number(event.detail?.zoom);
      if(Number.isFinite(value)){
        editorZoom.value=String(Math.round(value*100/5)*5);
        if(editorZoomValue)editorZoomValue.textContent=Math.round(value*100)+'%';
      }
    });
  }
  const apply=()=>{
    const value=OPTIONS[select.value]?select.value:'medium';
    delete document.documentElement.dataset.dataFont;
    document.documentElement.dataset.uiFont=value;
  };
  apply();
  if(!select.dataset.bound){
    select.dataset.bound='1';
    select.addEventListener('change',()=>{
      apply();
      try{localStorage.setItem(KEY,select.value);}catch{}
      const status=document.getElementById('status');
      if(status)status.textContent=`✓ Ukuran tampilan: ${OPTIONS[select.value].label}.`;
    });
    select.addEventListener('settings-save',()=>{
      apply();
      try{localStorage.setItem(KEY,select.value);}catch{}
    });
  }
}
