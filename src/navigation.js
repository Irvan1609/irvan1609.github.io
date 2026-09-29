export function installNavigation(){
  const nav=document.querySelector('.nav');
  const sheet=document.querySelector('.sheet-header');
  if(!nav||!sheet)return;
  const analysisButton=document.getElementById('openAnalysis');
  const searchButton=document.getElementById('globalSearchButton');
  const projectToggle=document.getElementById('projectToggle');
  const settingsToggle=document.getElementById('appSettingsToggle');

  const appHeader=nav.closest('.app-header');
  function positionFloatingMenu(anchor,panel){
    if(!anchor||!panel||!appHeader)return;
    const headerRect=appHeader.getBoundingClientRect(),anchorRect=anchor.getBoundingClientRect();
    const scale=headerRect.width&&appHeader.offsetWidth?headerRect.width/appHeader.offsetWidth:1;
    const headerWidth=appHeader.offsetWidth||headerRect.width/Math.max(scale,.01);
    const requested=globalThis.matchMedia?.('(max-width:720px)')?.matches?210:196;
    const width=Math.max(164,Math.min(requested,headerWidth-10));
    const center=((anchorRect.left+anchorRect.right)/2-headerRect.left)/Math.max(scale,.01);
    const left=Math.max(6,Math.min(headerWidth-width-6,center-width/2));
    panel.style.setProperty('--floating-menu-left',left+'px');
    panel.style.setProperty('--floating-menu-width',width+'px');
    panel.dataset.anchorId=anchor.id||'';
  }

  const toolbar=document.querySelector('.toolbar');
  if(toolbar)toolbar.hidden=true;

  const primaryNav=document.createElement('div');
  primaryNav.className='nav-primary';
  primaryNav.setAttribute('aria-label','Tab utama');
  const utilityNav=document.createElement('div');
  utilityNav.className='nav-utilities';
  utilityNav.setAttribute('aria-label','Pencarian dan pengaturan');
  nav.replaceChildren(primaryNav,utilityNav);

  const menuButtons=new Map();
  for(const [id,title,ids] of [
    ['fileMenu','File',['pasteBtn','importBtn','importXlsx','newTxt']],
    ['dataMenu','Data',['undoData','redoData','validateDataset','transformData','outlierData','fieldbookTool','clearData']],
    ['helpMenu','Bantuan',['dataTemplate','analysisHistory']]
  ]){
    const button=document.createElement('button');
    button.id=id+'Button';
    button.type='button';
    button.textContent=title;
    button.className='nav-tab';
    button.setAttribute('aria-expanded','false');
    button.setAttribute('aria-controls',id);

    const panel=document.createElement('div');
    panel.id=id;
    panel.className='nav-command-panel';
    panel.hidden=true;
    panel.setAttribute('role','group');
    panel.setAttribute('aria-label',title);
    ids.forEach(name=>{const command=document.getElementById(name);if(command)panel.append(command);});
    nav.after(panel);
    menuButtons.set(id,button);

    button.onclick=()=>openCommandMenu(id,button);
    panel.addEventListener('click',event=>{if(event.target.closest('button'))closeMenus();});
  }

  if(menuButtons.get('fileMenu'))primaryNav.append(menuButtons.get('fileMenu'));
  if(menuButtons.get('dataMenu'))primaryNav.append(menuButtons.get('dataMenu'));

  const fieldTab=document.createElement('button');
  fieldTab.id='fieldLayoutTab';
  fieldTab.type='button';
  fieldTab.className='nav-tab';
  fieldTab.textContent='Denah';
  fieldTab.title='Denah lahan';
  fieldTab.setAttribute('aria-label','Buka Denah Lahan');
  primaryNav.append(fieldTab);

  if(analysisButton){
    analysisButton.classList.remove('primary');
    analysisButton.classList.add('nav-tab');
    primaryNav.append(analysisButton);
  }
  if(menuButtons.get('helpMenu'))primaryNav.append(menuButtons.get('helpMenu'));

  if(projectToggle)utilityNav.append(projectToggle);
  if(searchButton)utilityNav.append(searchButton);
  if(settingsToggle)utilityNav.append(settingsToggle);
  const mobileBackButton=document.createElement('button');
  mobileBackButton.id='mobileBackButton';
  mobileBackButton.type='button';
  mobileBackButton.className='header-icon-button';
  mobileBackButton.textContent='‹';
  mobileBackButton.title='Kembali';
  mobileBackButton.setAttribute('aria-label','Kembali');
  primaryNav.prepend(mobileBackButton);


  const mobileMoreButton=document.createElement('button');
  mobileMoreButton.id='mobileMoreButton';
  mobileMoreButton.type='button';
  mobileMoreButton.className='header-icon-button';
  mobileMoreButton.textContent='⋯';
  mobileMoreButton.title='Menu';
  mobileMoreButton.setAttribute('aria-label','Menu');
  mobileMoreButton.setAttribute('aria-expanded','false');
  const mobileMorePanel=document.createElement('div');
  mobileMorePanel.id='mobileMorePanel';
  mobileMorePanel.className='mobile-more-panel';
  mobileMorePanel.hidden=true;
  mobileMorePanel.setAttribute('role','menu');
  mobileMorePanel.innerHTML='<button type="button" data-mobile-menu="search">Cari</button><button type="button" data-mobile-menu="settings">Pengaturan</button><button type="button" data-mobile-menu="fileMenu">File</button><button type="button" data-mobile-menu="dataMenu">Data</button><button type="button" data-mobile-menu="helpMenu">Bantuan</button>';
  utilityNav.append(mobileMoreButton);
  appHeader?.append(mobileMorePanel);

  function openCommandMenu(id,anchor=document.getElementById(id+'Button')){
    const panel=document.getElementById(id),button=document.getElementById(id+'Button');
    if(!panel)return;
    const opening=panel.hidden;
    document.dispatchEvent(new CustomEvent('stat-close-floating',{detail:{except:id}}));
    closeMenus();
    if(!opening)return;
    positionFloatingMenu(anchor||button,panel);
    panel.hidden=false;
    button?.setAttribute('aria-expanded','true');
  }
  function closeMobileMore(){
    mobileMorePanel.hidden=true;
    mobileMoreButton.setAttribute('aria-expanded','false');
  }
  mobileMoreButton.onclick=event=>{
    event.stopPropagation();
    const opening=mobileMorePanel.hidden;
    closeMenus();closeMobileMore();
    if(opening){
      positionFloatingMenu(mobileMoreButton,mobileMorePanel);
      mobileMorePanel.hidden=false;
      mobileMoreButton.setAttribute('aria-expanded','true');
    }
  };
  mobileMorePanel.addEventListener('click',event=>{
    const action=event.target.closest('[data-mobile-menu]')?.dataset.mobileMenu;
    if(!action)return;
    event.stopPropagation();closeMobileMore();
    if(action==='search'){searchButton?.click();return;}
    if(action==='settings'){
      document.dispatchEvent(new CustomEvent('stat-open-settings'));
      return;
    }
    openCommandMenu(action,mobileMoreButton);
  });

  function syncFieldTab(){
    const active=document.body.classList.contains('field-layout-open');
    fieldTab.classList.toggle('active',active);
    if(active)fieldTab.setAttribute('aria-current','page');
    else fieldTab.removeAttribute('aria-current');
  }
  syncFieldTab();
  new MutationObserver(syncFieldTab).observe(document.body,{attributes:true,attributeFilter:['class']});

  fieldTab.onclick=async()=>{
    closeMenus();
    fieldTab.disabled=true;
    try{
      const {openFieldLayout}=await import('./field-layout.js');
      openFieldLayout();
    }catch(error){
      console.error('Denah lahan gagal dimuat',error);
      const status=document.getElementById('status');
      if(status)status.textContent='Denah lahan belum dapat dibuka. Muat ulang halaman lalu coba lagi.';
    }finally{fieldTab.disabled=false;}
  };


  mobileBackButton.onclick=()=>{
    const searchOpen=searchModal?.classList.contains('open');
    const settingsPanel=document.getElementById('appSettingsPanel');
    const analysisMenu=document.getElementById('analysisMenu');
    const openCommand=[...document.querySelectorAll('.nav-command-panel')].find(panel=>!panel.hidden);
    if(searchOpen){closeGlobalSearch();return;}
    if(settingsPanel&&!settingsPanel.hidden){document.getElementById('closeAppSettings')?.click();return;}
    if(document.documentElement.classList.contains('mobile-project-open')){projectToggle?.click();return;}
    if(analysisMenu&&!analysisMenu.hidden){analysisMenu.hidden=true;analysisButton?.setAttribute('aria-expanded','false');return;}
    if(openCommand){closeMenus();return;}
    const openModal=document.querySelector('.modal-backdrop.open');
    if(openModal){openModal.querySelector('[aria-label="Tutup"],#closeDataTool,#closeGlobalSearch')?.click();return;}
    if(document.body.classList.contains('field-layout-open')){globalThis.AgrotikFieldLayout?.close?.();return;}
    if(history.length>1)history.back();
    else location.href='/';
  };

  const searchModal=document.getElementById('globalSearchModal');
  const searchInput=document.getElementById('globalSearch');
  const searchResults=document.getElementById('globalSearchResults');
  const closeSearch=document.getElementById('closeGlobalSearch');
  const normalize=value=>String(value??'').toLocaleLowerCase('id-ID').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').trim();

  function searchEntry(label,type,keywords,action){
    return {label:String(label||'').trim(),type,keywords:normalize(keywords),action};
  }

  function buildGlobalIndex(){
    const items=[],seen=new Set();
    const push=entry=>{
      if(!entry.label)return;
      const key=normalize(entry.type+' '+entry.label);
      if(seen.has(key))return;
      seen.add(key);items.push(entry);
    };

    document.querySelectorAll('#analysisMenu .analysis-menu-item').forEach(button=>{
      const label=button.querySelector('b')?.textContent||button.textContent;
      const group=button.closest('[data-analysis-group]')?.querySelector('.analysis-group-toggle b')?.textContent||'';
      push(searchEntry(label,'Analisis',`${button.textContent} ${group} statistik anova`,()=>button.click()));
    });

    document.querySelectorAll('#fileTree [data-file]').forEach(button=>{
      const label=button.textContent.replace(/^📄\s*/,'').trim();
      push(searchEntry(label,'Dataset',`${label} dataset file data`,()=>button.click()));
    });

    const aliases={
      pasteBtn:'tempel paste excel clipboard data',
      importBtn:'impor import csv file data',
      importXlsx:'impor import excel xlsx workbook',
      newTxt:'baru dataset data baru',
      addRow:'tambah baris row',
      addCol:'tambah kolom column',
      undoData:'undo urungkan',
      redoData:'redo ulangi',
      duplicateDataset:'duplikat salin dataset copy',
      validateDataset:'validasi cek data kesalahan',
      transformData:'transformasi log sqrt akar',
      outlierData:'outlier pencilan',
      fieldbookTool:'fieldbook buku lapang randomisasi rancangan',
      fieldLayoutTab:'denah lahan plot petak lapangan field map pengamatan input data',
      dataTemplate:'template contoh data',
      analysisHistory:'riwayat analisis history',
      clearData:'hapus kosongkan semua data',
      renameDataset:'ubah nama rename dataset',
      viewRawDataset:'data mentah raw csv',
      viewDatasetMeta:'metadata dataset',
      datasetHistory:'riwayat perubahan dataset',
      deleteDataset:'hapus delete dataset',
      syncDatasets:'sinkronisasi cloud akun dataset cadangan antar perangkat'
    };
    Object.keys(aliases).forEach(id=>{
      const button=document.getElementById(id);if(!button)return;
      const label=button.textContent.trim()||button.getAttribute('aria-label')||id;
      push(searchEntry(label,'Fitur',`${label} ${aliases[id]}`,()=>button.click()));
    });

    document.querySelectorAll('.data-grid th[data-column-header]').forEach(th=>{
      const label=th.dataset.columnHeader||th.textContent.trim();
      push(searchEntry(label,'Kolom',`${label} parameter variabel kolom data`,()=>{
        th.scrollIntoView({behavior:'smooth',block:'nearest',inline:'center'});
        th.querySelector('.header-name')?.focus();
      }));
    });

    document.querySelectorAll('[data-result-action]').forEach(button=>{
      const label=button.textContent.trim();
      if(label)push(searchEntry(label,'Hasil',`${label} ekspor excel formula salin hasil`,()=>button.click()));
    });

    document.querySelectorAll('.subweb-nav a').forEach(link=>{
      const label=link.textContent.trim();
      push(searchEntry(label,'Halaman',`${label} halaman navigasi`,()=>link.click()));
    });
    return items;
  }

  function rank(entry,query){
    const q=normalize(query),label=normalize(entry.label),hay=`${label} ${entry.keywords}`;
    const tokens=q.split(' ').filter(Boolean);
    if(!tokens.length||!tokens.every(token=>hay.includes(token)))return Infinity;
    let score=0;
    if(label===q)score-=12;
    else if(label.startsWith(q))score-=7;
    else if(label.includes(q))score-=4;
    for(const token of tokens){
      if(label.startsWith(token))score-=2;
      else if(label.includes(token))score-=1;
    }
    return score+Math.max(0,label.length-q.length)/100;
  }

  function renderSearch(){
    if(!searchInput||!searchResults)return;
    const query=searchInput.value.trim();
    searchResults.replaceChildren();
    if(!query){
      const empty=document.createElement('div');
      empty.className='global-search-empty';
      empty.textContent='Cari fitur, analisis, dataset, atau kolom.';
      searchResults.append(empty);return;
    }
    const matches=buildGlobalIndex().map(entry=>({entry,score:rank(entry,query)})).filter(x=>Number.isFinite(x.score)).sort((a,b)=>a.score-b.score||a.entry.label.localeCompare(b.entry.label,'id')).slice(0,14);
    if(!matches.length){
      const empty=document.createElement('div');empty.className='global-search-empty';empty.textContent='Tidak ada hasil yang cocok.';searchResults.append(empty);return;
    }
    matches.forEach(({entry})=>{
      const button=document.createElement('button');
      button.type='button';button.className='global-search-item';button.setAttribute('role','option');
      const label=document.createElement('span');label.textContent=entry.label;
      const type=document.createElement('small');type.textContent=entry.type;
      button.append(label,type);
      button.onclick=()=>{searchModal?.classList.remove('open');searchInput.value='';entry.action();};
      searchResults.append(button);
    });
  }

  function openGlobalSearch(){
    document.dispatchEvent(new CustomEvent('stat-close-floating',{detail:{except:'search'}}));
    if(!searchModal||!searchInput)return;
    closeMenus();
    searchModal.classList.add('open');
    searchInput.value='';
    renderSearch();
    requestAnimationFrame(()=>searchInput.focus());
  }
  function closeGlobalSearch(){searchModal?.classList.remove('open');}

  searchButton?.addEventListener('click',openGlobalSearch);
  closeSearch?.addEventListener('click',closeGlobalSearch);
  searchInput?.addEventListener('input',renderSearch);
  searchInput?.addEventListener('keydown',event=>{
    if(event.key==='Escape'){event.preventDefault();closeGlobalSearch();return;}
    if(event.key==='Enter'){
      const first=searchResults?.querySelector('.global-search-item');
      if(first){event.preventDefault();first.click();}
      return;
    }
    if(event.key==='ArrowDown'){
      const first=searchResults?.querySelector('.global-search-item');
      if(first){event.preventDefault();first.focus();}
    }
  });
  searchResults?.addEventListener('keydown',event=>{
    const buttons=[...searchResults.querySelectorAll('.global-search-item')],index=buttons.indexOf(document.activeElement);
    if(event.key==='ArrowDown'&&index<buttons.length-1){event.preventDefault();buttons[index+1].focus();}
    else if(event.key==='ArrowUp'){
      event.preventDefault();
      if(index<=0)searchInput?.focus();else buttons[index-1].focus();
    }else if(event.key==='Escape'){event.preventDefault();closeGlobalSearch();}
  });
  searchModal?.addEventListener('click',event=>{if(event.target===searchModal)closeGlobalSearch();});

  function closeMenus(){
    if(typeof closeMobileMore==='function')closeMobileMore();
    for(const id of ['fileMenu','dataMenu','helpMenu']){
      const panel=document.getElementById(id),button=document.getElementById(id+'Button');
      if(panel)panel.hidden=true;
      if(button)button.setAttribute('aria-expanded','false');
    }
    const analysisMenu=document.getElementById('analysisMenu'),openAnalysis=document.getElementById('openAnalysis');
    if(analysisMenu)analysisMenu.hidden=true;
    if(openAnalysis)openAnalysis.setAttribute('aria-expanded','false');
  }

  document.addEventListener('click',event=>{
    if(!event.target.closest('.nav,.nav-command-panel,.mobile-more-panel,#backScience,[data-back-design],#appSettingsToggle,#appSettingsPanel'))closeMenus();
  });
  window.addEventListener('resize',()=>{
    for(const id of ['fileMenu','dataMenu','helpMenu']){
      const panel=document.getElementById(id);
      if(!panel?.hidden){
        const anchor=document.getElementById(panel.dataset.anchorId)||document.getElementById(id+'Button');
        positionFloatingMenu(anchor,panel);
      }
    }
    if(!mobileMorePanel.hidden)positionFloatingMenu(mobileMoreButton,mobileMorePanel);
  });
  document.addEventListener('stat-close-floating',event=>{
    const except=event.detail?.except||'';
    if(!['fileMenu','dataMenu','helpMenu'].includes(except))closeMenus();
    if(except!=='dataset-panel'){
      document.documentElement.classList.remove('mobile-project-open');
      projectToggle?.setAttribute('aria-expanded','false');
    }
  });
  projectToggle?.addEventListener('click',()=>document.dispatchEvent(new CustomEvent('stat-close-floating',{detail:{except:'dataset-panel'}})),{capture:true});

  document.addEventListener('close-navigation',closeMenus);
  document.addEventListener('keydown',event=>{
    if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='k'){event.preventDefault();openGlobalSearch();return;}
    if(event.key==='Escape'){closeMenus();closeGlobalSearch();}
  });
}
