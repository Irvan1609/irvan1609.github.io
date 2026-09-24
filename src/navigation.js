export function installNavigation(){
  const nav=document.querySelector('.nav');
  const sheet=document.querySelector('.sheet-header');
  if(!nav||!sheet)return;

  const clear=document.getElementById('clearData');
  if(clear){clear.textContent='🗑';clear.setAttribute('aria-label','Hapus seluruh data');clear.title='Hapus seluruh data';clear.classList.add('icon-only');sheet.append(clear);}
  const toolbar=document.querySelector('.toolbar');
  if(toolbar)toolbar.hidden=true;

  for(const [id,title,ids] of [
    ['fileMenu','File',['pasteBtn','importBtn','importXlsx','newTxt']],
    ['dataMenu','Data',['undoData','redoData','duplicateDataset','validateDataset','transformData','outlierData','fieldbookTool']],
    ['helpMenu','Help',['dataTemplate','analysisHistory','configureDriveBackup']]
  ]){
    const button=document.createElement('button');
    button.id=id+'Button';
    button.textContent=title;
    button.setAttribute('aria-expanded','false');
    button.setAttribute('aria-controls',id);

    const panel=document.createElement('div');
    panel.id=id;
    panel.className='nav-command-panel';
    panel.hidden=true;
    panel.setAttribute('role','group');
    panel.setAttribute('aria-label',title);
    ids.forEach(name=>{const command=document.getElementById(name);if(command)panel.append(command);});
    nav.append(button);
    nav.after(panel);

    button.onclick=()=>{
      const opening=panel.hidden;
      closeMenus();
      panel.hidden=!opening;
      button.setAttribute('aria-expanded',String(opening));
    };
    panel.addEventListener('click',event=>{if(event.target.closest('button'))closeMenus();});
  }

  function closeMenus(){
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
    if(!event.target.closest('.nav,.nav-command-panel,#backScience,[data-back-design],#appSettingsToggle,#appSettingsPanel'))closeMenus();
  });
  document.addEventListener('close-navigation',closeMenus);
  document.addEventListener('keydown',event=>{if(event.key==='Escape')closeMenus();});
}
