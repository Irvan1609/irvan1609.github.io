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
    body>#columnContextMenu,
    body>.account-status,
    body>.agrotik-offline{zoom:var(--ui-scale)}
    .app-header{position:relative}
    .nav{position:relative}
    #appSettingsToggle{display:inline-flex;align-items:center;justify-content:center;width:34px;min-width:34px;height:34px;min-height:34px;padding:0;border-radius:9px;font-size:17px;line-height:1;margin-left:auto}
    #appSettingsToggle[aria-expanded="true"]{background:#eaf1fd;border-color:#9ab3d6;color:#194caa}
    #appSettingsPanel{position:absolute;right:10px;top:calc(100% + 8px);z-index:120;width:min(360px,calc(100vw / var(--ui-scale) - 28px));padding:14px;background:#fff;border:1px solid var(--border);border-radius:8px;box-shadow:0 12px 32px #15233426}
    #appSettingsPanel[hidden]{display:none!important}
    .settings-panel-title{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px;font-weight:700}
    .settings-section{padding:10px 0;border-top:1px solid #e5eaf0}
    .settings-section:first-of-type{border-top:0;padding-top:0}
    .settings-section label{display:block;margin-bottom:6px;font-weight:600}
    .settings-section select{display:block;width:100%;padding:8px 10px;border:1px solid var(--border);border-radius:6px;background:#fff;color:var(--text);font:inherit}
    .settings-section p{margin:7px 0 0;color:var(--muted);font-size:.875em;line-height:1.4}
    .settings-detected{padding:7px 9px;margin-bottom:8px;background:#eef6ff;border:1px solid #c9ddf3;border-radius:6px;color:#315a80;font-size:.875em}
    @media(max-width:720px){#appSettingsPanel{right:8px;width:min(340px,calc(100vw / var(--ui-scale) - 16px))}}
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
    toggle.textContent='⚙';
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
    panel.innerHTML='<div class="settings-panel-title"><span>Pengaturan</span></div><section class="settings-section"><label for="dataFontSize">Ukuran tampilan</label><select id="dataFontSize"><option value="small">Kecil</option><option value="medium">Sedang</option><option value="large">Besar</option></select><p>Berlaku seragam pada editor, menu, dialog analisis, hasil, tabel, tombol, dan header.</p></section><div id="numberSettingsMount"></div>';
    topbar.append(panel);
  }
  if(!toggle.dataset.bound){
    toggle.dataset.bound='1';
    toggle.addEventListener('click',event=>{
      event.stopPropagation();
      panel.hidden=!panel.hidden;
      toggle.setAttribute('aria-expanded',String(!panel.hidden));
    });
    panel.addEventListener('click',event=>event.stopPropagation());
    document.addEventListener('click',()=>{if(!panel.hidden){panel.hidden=true;toggle.setAttribute('aria-expanded','false');}});
    document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!panel.hidden){panel.hidden=true;toggle.setAttribute('aria-expanded','false');toggle.focus();}});
  }
  return panel;
}

export function initDisplaySettings(){
  ensureStyles();
  const panel=ensureSettingsUi();
  if(!panel)return;
  const select=document.getElementById('dataFontSize');
  let saved='medium';
  try{saved=localStorage.getItem(KEY)||'medium';}catch{}
  if(!OPTIONS[saved])saved='medium';
  select.value=saved;
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
