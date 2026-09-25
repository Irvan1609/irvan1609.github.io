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

  document.addEventListener('click',event=>{
    if(!event.target.closest('.nav,.nav-command-panel,#backScience,[data-back-design],#appSettingsPanel'))closeMenus();
  });
  document.addEventListener('close-navigation',closeMenus);
  document.addEventListener('keydown',event=>{if(event.key==='Escape')closeMenus();});
}
