export function installNavigation(){
  const nav=document.querySelector('.nav');
  const header=document.querySelector('.app-header');
  if(!nav||!header)return;

  const toolbar=document.querySelector('.toolbar');
  if(toolbar)toolbar.hidden=true;

  const panel=document.createElement('div');
  panel.id='appMenu';
  panel.className='nav-command-panel compact-app-menu';
  panel.hidden=true;
  panel.setAttribute('role','region');
  panel.setAttribute('aria-label','Menu aplikasi');

  const addSection=(title,ids)=>{
    const section=document.createElement('section');
    section.className='app-menu-section';
    const heading=document.createElement('div');
    heading.className='app-menu-section-title';
    heading.textContent=title;
    section.append(heading);
    const commands=document.createElement('div');
    commands.className='app-menu-commands';
    ids.forEach(id=>{
      const command=document.getElementById(id);
      if(command)commands.append(command);
    });
    section.append(commands);
    panel.append(section);
  };

  addSection('File',['pasteBtn','importBtn','importXlsx','newTxt']);
  addSection('Data',['focusData','addRow','addCol','compactEditor','undoData','redoData','duplicateDataset','validateDataset','transformData','outlierData','fieldbookTool']);
  addSection('Lainnya',['dataTemplate','analysisHistory','configureDriveBackup','clearData']);

  const settingsToggle=document.getElementById('appSettingsToggle');
  if(settingsToggle){
    settingsToggle.hidden=true;
    const section=panel.querySelector('.app-menu-section:last-child .app-menu-commands');
    const settings=document.createElement('button');
    settings.type='button';
    settings.id='openSettingsFromMenu';
    settings.textContent='Pengaturan';
    settings.onclick=()=>{
      closeMenus();
      settingsToggle.click();
    };
    section?.append(settings);
  }

  const menuButton=document.createElement('button');
  menuButton.id='appMenuButton';
  menuButton.type='button';
  menuButton.textContent='Menu';
  menuButton.setAttribute('aria-expanded','false');
  menuButton.setAttribute('aria-controls','appMenu');
  nav.append(menuButton);
  header.append(panel);

  function closeMenus(){
    panel.hidden=true;
    menuButton.setAttribute('aria-expanded','false');
    const analysisMenu=document.getElementById('analysisMenu'),openAnalysis=document.getElementById('openAnalysis');
    if(analysisMenu)analysisMenu.hidden=true;
    if(openAnalysis)openAnalysis.setAttribute('aria-expanded','false');
  }

  menuButton.onclick=()=>{
    const opening=panel.hidden;
    document.dispatchEvent(new Event('close-navigation'));
    panel.hidden=!opening;
    menuButton.setAttribute('aria-expanded',String(opening));
  };

  panel.addEventListener('click',event=>{
    const button=event.target.closest('button');
    if(button&&button.id!=='openSettingsFromMenu')closeMenus();
  });


  const searchButton=document.getElementById('globalSearchButton');
  const searchModal=document.getElementById('globalSearchModal');
  const searchInput=document.getElementById('globalSearch');
  const searchResults=document.getElementById('globalSearchResults');
  const closeSearch=document.getElementById('closeGlobalSearch');
  const normalize=value=>String(value??'').toLocaleLowerCase('id-ID').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').trim();

  function searchItem(label,type,keywords,action){
    return {label:String(label||'').trim(),type,keywords:normalize(keywords),action};
  }

  function globalIndex(){
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
      push(searchItem(label,'Analisis',`${button.textContent} ${group} statistik anova`,()=>button.click()));
    });

    document.querySelectorAll('#fileTree [data-file]').forEach(button=>{
      const label=button.textContent.replace(/^📄\s*/,'').trim();
      push(searchItem(label,'Dataset',`${label} dataset file data`,()=>button.click()));
    });

    const aliases={
      pasteBtn:'tempel paste excel clipboard data',
      importBtn:'impor import csv file data',
      importXlsx:'impor import excel xlsx workbook',
      newTxt:'baru dataset data baru',
      focusData:'fokus layar penuh tabel spreadsheet',
      addRow:'tambah baris row',
      addCol:'tambah kolom column',
      compactEditor:'ringkas compact tampilan',
      undoData:'undo urungkan',
      redoData:'redo ulangi',
      duplicateDataset:'duplikat salin dataset copy',
      validateDataset:'validasi cek data kesalahan',
      transformData:'transformasi log sqrt akar',
      outlierData:'outlier pencilan',
      fieldbookTool:'fieldbook buku lapang',
      dataTemplate:'template contoh data',
      analysisHistory:'riwayat analisis history',
      configureDriveBackup:'backup drive cadangan',
      clearData:'hapus kosongkan semua data',
      renameDataset:'ubah nama rename dataset',
      viewRawDataset:'data mentah raw csv',
      viewDatasetMeta:'metadata dataset',
      datasetHistory:'riwayat perubahan dataset',
      deleteDataset:'hapus delete dataset',
      toggleDatasetMeta:'informasi tanaman perlakuan metadata',
      openSettingsFromMenu:'pengaturan settings font desimal tampilan'
    };

    Object.keys(aliases).forEach(id=>{
      const button=document.getElementById(id);if(!button)return;
      const label=button.textContent.trim()||button.getAttribute('aria-label')||id;
      push(searchItem(label,'Fitur',`${label} ${aliases[id]}`,()=>button.click()));
    });

    document.querySelectorAll('.data-grid th[data-column-header]').forEach(th=>{
      const label=th.dataset.columnHeader||th.textContent.trim();
      push(searchItem(label,'Kolom',`${label} parameter variabel kolom data`,()=>{
        th.scrollIntoView({behavior:'smooth',block:'nearest',inline:'center'});
        th.querySelector('.header-name')?.focus();
      }));
    });

    document.querySelectorAll('[data-result-action]').forEach(button=>{
      const label=button.textContent.trim();
      if(label)push(searchItem(label,'Hasil',`${label} ekspor excel formula salin hasil`,()=>button.click()));
    });

    document.querySelectorAll('.subweb-nav a').forEach(link=>{
      const label=link.textContent.trim();
      push(searchItem(label,'Halaman',`${label} halaman navigasi`,()=>link.click()));
    });

    return items;
  }

  function searchScore(entry,query){
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

  function renderGlobalSearch(){
    if(!searchInput||!searchResults)return;
    const query=searchInput.value.trim();
    searchResults.replaceChildren();
    if(!query){
      const empty=document.createElement('div');
      empty.className='global-search-empty';
      empty.textContent='Ketik untuk mencari fitur, analisis, dataset, kolom, hasil, atau halaman.';
      searchResults.append(empty);return;
    }
    const matches=globalIndex().map(entry=>({entry,score:searchScore(entry,query)})).filter(x=>Number.isFinite(x.score)).sort((a,b)=>a.score-b.score||a.entry.label.localeCompare(b.entry.label,'id')).slice(0,14);
    if(!matches.length){
      const empty=document.createElement('div');
      empty.className='global-search-empty';
      empty.textContent='Tidak ada hasil yang cocok.';
      searchResults.append(empty);return;
    }
    matches.forEach(({entry})=>{
      const button=document.createElement('button');
      button.type='button';
      button.className='global-search-item';
      button.setAttribute('role','option');
      const label=document.createElement('span');label.textContent=entry.label;
      const type=document.createElement('small');type.textContent=entry.type;
      button.append(label,type);
      button.onclick=()=>{
        searchModal?.classList.remove('open');
        searchInput.value='';
        entry.action();
      };
      searchResults.append(button);
    });
  }

  function openGlobalSearch(){
    if(!searchModal||!searchInput)return;
    closeMenus();
    searchModal.classList.add('open');
    searchInput.value='';
    renderGlobalSearch();
    requestAnimationFrame(()=>searchInput.focus());
  }
  function closeGlobalSearch(){
    searchModal?.classList.remove('open');
  }

  searchButton?.addEventListener('click',openGlobalSearch);
  closeSearch?.addEventListener('click',closeGlobalSearch);
  searchInput?.addEventListener('input',renderGlobalSearch);
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
      if(index<=0)searchInput?.focus(); else buttons[index-1].focus();
    }else if(event.key==='Escape'){event.preventDefault();closeGlobalSearch();}
  });
  searchModal?.addEventListener('click',event=>{if(event.target===searchModal)closeGlobalSearch();});

  document.addEventListener('click',event=>{
    if(!event.target.closest('.nav,.nav-command-panel,#backScience,[data-back-design],#appSettingsPanel'))closeMenus();
  });
  document.addEventListener('close-navigation',closeMenus);
  document.addEventListener('keydown',event=>{if(event.key==='Escape'){closeMenus();closeGlobalSearch();}});
}
