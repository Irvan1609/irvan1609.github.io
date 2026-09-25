export function installNavigation(){
  const nav=document.querySelector('.nav');
  const header=document.querySelector('.app-header');
  if(!nav||!header)return;

  const clear=document.getElementById('clearData');
  if(clear){clear.textContent='×';clear.setAttribute('aria-label','Hapus seluruh data');clear.title='Hapus seluruh data';clear.classList.add('icon-only');document.querySelector('.sheet-header')?.append(clear);}
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
    ids.forEach(name=>{const command=document.getElementById(name);if(command)commands.append(command);});
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
    settings.onclick=()=>{closeMenus();settingsToggle.click();};
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

  panel.addEventListener('click',event=>{if(event.target.closest('button'))closeMenus();});

  const globalSearch=document.getElementById('globalSearch');
  const globalResults=document.getElementById('globalSearchResults');
  const normalize=value=>String(value??'').toLocaleLowerCase('id-ID').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').trim();
  const aliases={
    pasteBtn:'tempel paste excel clipboard data',
    importBtn:'impor import csv file data',
    importXlsx:'impor import excel xlsx workbook',
    newTxt:'baru dataset data baru',
    focusData:'fokus layar penuh tabel spreadsheet',
    addRow:'tambah baris row',
    addCol:'tambah kolom column',
    compactEditor:'ringkas compact tampilan',
    undoData:'undo urungkan kembali',
    redoData:'redo ulangi',
    duplicateDataset:'duplikat salin dataset copy',
    validateDataset:'validasi cek data kesalahan',
    transformData:'transformasi log sqrt akar data',
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

  function item(label,type,keywords,action){
    return {label:String(label||'').trim(),type,keywords:normalize(keywords),action};
  }

  function searchIndex(){
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
      push(item(label,'Analisis',`${button.textContent} ${group} anova statistik`,()=>button.click()));
    });

    document.querySelectorAll('#fileTree [data-file]').forEach(button=>{
      const label=button.textContent.replace(/^📄\s*/,'').trim();
      push(item(label,'Dataset',`${label} dataset file data`,()=>button.click()));
    });

    const commandIds=[
      'pasteBtn','importBtn','importXlsx','newTxt','focusData','addRow','addCol','compactEditor','undoData','redoData',
      'duplicateDataset','validateDataset','transformData','outlierData','fieldbookTool','dataTemplate','analysisHistory',
      'configureDriveBackup','clearData','renameDataset','viewRawDataset','viewDatasetMeta','datasetHistory','deleteDataset',
      'toggleDatasetMeta','openSettingsFromMenu'
    ];
    commandIds.forEach(id=>{
      const button=document.getElementById(id);if(!button)return;
      const label=button.textContent.trim()||button.getAttribute('aria-label')||id;
      push(item(label,'Fitur',`${label} ${aliases[id]||''}`,()=>button.click()));
    });

    document.querySelectorAll('.data-grid th[data-column-header]').forEach(th=>{
      const label=th.dataset.columnHeader||th.textContent.trim();
      push(item(label,'Kolom',`${label} kolom variabel parameter data`,()=>{
        th.scrollIntoView({behavior:'smooth',block:'nearest',inline:'center'});
        th.querySelector('.header-name')?.focus();
      }));
    });

    document.querySelectorAll('[data-result-action]').forEach(button=>{
      const label=button.textContent.trim();if(!label)return;
      push(item(label,'Hasil',`${label} ekspor excel formula salin hasil`,()=>button.click()));
    });

    document.querySelectorAll('.subweb-nav a').forEach(link=>{
      const label=link.textContent.trim();
      push(item(label,'Halaman',`${label} halaman aplikasi navigasi`,()=>link.click()));
    });

    return items;
  }

  function score(entry,query){
    const q=normalize(query),label=normalize(entry.label),hay=`${label} ${entry.keywords}`;
    const tokens=q.split(' ').filter(Boolean);
    if(!tokens.every(token=>hay.includes(token)))return Infinity;
    let value=0;
    if(label===q)value-=10;
    else if(label.startsWith(q))value-=6;
    else if(label.includes(q))value-=3;
    for(const token of tokens){
      if(label.startsWith(token))value-=2;
      else if(label.includes(token))value-=1;
    }
    return value+Math.max(0,label.length-q.length)/100;
  }

  function hideSearch(){
    if(!globalResults||!globalSearch)return;
    globalResults.hidden=true;
    globalSearch.setAttribute('aria-expanded','false');
  }

  function runSearch(){
    if(!globalSearch||!globalResults)return;
    const query=globalSearch.value.trim();
    globalResults.replaceChildren();
    if(!query){hideSearch();return;}
    const matches=searchIndex().map(entry=>({entry,score:score(entry,query)})).filter(x=>Number.isFinite(x.score)).sort((a,b)=>a.score-b.score||a.entry.label.localeCompare(b.entry.label,'id')).slice(0,12);
    if(!matches.length){
      const empty=document.createElement('div');
      empty.className='global-search-empty';
      empty.textContent='Tidak ada fitur, analisis, dataset, atau kolom yang cocok.';
      globalResults.append(empty);
    }else{
      matches.forEach(({entry})=>{
        const button=document.createElement('button');
        button.type='button';
        button.className='global-search-item';
        button.setAttribute('role','option');
        const main=document.createElement('span');
        main.textContent=entry.label;
        const type=document.createElement('small');
        type.textContent=entry.type;
        button.append(main,type);
        button.onclick=()=>{
          globalSearch.value='';
          hideSearch();
          closeMenus();
          entry.action();
        };
        globalResults.append(button);
      });
    }
    globalResults.hidden=false;
    globalSearch.setAttribute('aria-expanded','true');
  }

  globalSearch?.addEventListener('input',runSearch);
  globalSearch?.addEventListener('keydown',event=>{
    if(event.key==='Escape'){hideSearch();globalSearch.blur();return;}
    if(event.key==='Enter'){
      const first=globalResults?.querySelector('.global-search-item');
      if(first){event.preventDefault();first.click();}
      return;
    }
    if(event.key==='ArrowDown'){
      const first=globalResults?.querySelector('.global-search-item');
      if(first){event.preventDefault();first.focus();}
    }
  });
  globalResults?.addEventListener('keydown',event=>{
    const buttons=[...globalResults.querySelectorAll('.global-search-item')],index=buttons.indexOf(document.activeElement);
    if(event.key==='ArrowDown'&&index<buttons.length-1){event.preventDefault();buttons[index+1].focus();}
    if(event.key==='ArrowUp'){event.preventDefault();if(index<=0)globalSearch?.focus();else buttons[index-1].focus();}
    if(event.key==='Escape'){hideSearch();globalSearch?.focus();}
  });

  document.addEventListener('click',event=>{
    if(!event.target.closest('.nav,.nav-command-panel,#backScience,[data-back-design],#appSettingsToggle,#appSettingsPanel'))closeMenus();
    if(!event.target.closest('.global-search'))hideSearch();
  });
  document.addEventListener('close-navigation',closeMenus);
  document.addEventListener('keydown',event=>{if(event.key==='Escape'){closeMenus();hideSearch();}});
}
