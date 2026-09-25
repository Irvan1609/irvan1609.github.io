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
  panel.setAttribute('aria-label','Data dan alat');

  const sections=[
    ['File',['pasteBtn','importBtn','importXlsx','newTxt']],
    ['Edit data',['focusData','addRow','addCol','compactEditor','undoData','redoData','duplicateDataset']],
    ['Alat',['validateDataset','transformData','outlierData','fieldbookTool']],
    ['Lainnya',['dataTemplate','analysisHistory','configureDriveBackup','clearData']]
  ];

  const closeSections=except=>{
    panel.querySelectorAll('.app-menu-section').forEach(section=>{
      if(section===except)return;
      const body=section.querySelector('.app-menu-commands');
      const toggle=section.querySelector('.app-menu-section-toggle');
      if(body)body.hidden=true;
      if(toggle)toggle.setAttribute('aria-expanded','false');
    });
  };

  sections.forEach(([title,ids])=>{
    const section=document.createElement('section');
    section.className='app-menu-section';
    const toggle=document.createElement('button');
    toggle.type='button';
    toggle.className='app-menu-section-toggle';
    toggle.innerHTML=`<span>${title}</span><span class="menu-chevron" aria-hidden="true">⌄</span>`;
    toggle.setAttribute('aria-expanded','false');
    const commands=document.createElement('div');
    commands.className='app-menu-commands';
    commands.hidden=true;
    ids.forEach(id=>{
      const command=document.getElementById(id);
      if(command)commands.append(command);
    });
    toggle.onclick=()=>{
      const opening=commands.hidden;
      closeSections(section);
      commands.hidden=!opening;
      toggle.setAttribute('aria-expanded',String(opening));
    };
    section.append(toggle,commands);
    panel.append(section);
  });

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
  menuButton.textContent='Data';
  menuButton.setAttribute('aria-expanded','false');
  menuButton.setAttribute('aria-controls','appMenu');
  nav.insertBefore(menuButton,document.getElementById('projectToggle')||null);
  header.append(panel);

  function closeMenus(){
    panel.hidden=true;
    menuButton.setAttribute('aria-expanded','false');
    closeSections();
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
    const command=event.target.closest('.app-menu-commands button');
    if(command&&command.id!=='openSettingsFromMenu')closeMenus();
  });

  document.addEventListener('click',event=>{
    if(!event.target.closest('.nav,.nav-command-panel,#backScience,[data-back-design],#appSettingsPanel'))closeMenus();
  });
  document.addEventListener('close-navigation',closeMenus);
  document.addEventListener('keydown',event=>{if(event.key==='Escape')closeMenus();});
}
