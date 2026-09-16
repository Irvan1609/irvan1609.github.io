export function installNavigation(){
  const nav=document.querySelector('.nav');
  const sheet=document.querySelector('.sheet-header');
  const add=document.createElement('div');add.className='sheet-add-actions';add.append(document.getElementById('addRow'),document.getElementById('addCol'));document.getElementById('activeFile').after(add);
  const clear=document.getElementById('clearData');clear.textContent='Hapus data';sheet.append(clear);document.querySelector('.toolbar').hidden=true;
  for(const [id,title,ids] of [['fileMenu','File',['pasteBtn','importBtn','newTxt','importXlsx']],['helpMenu','Help',['dataTemplate','analysisHistory','configureDriveBackup']]]){
    const button=document.createElement('button');button.id=id+'Button';button.textContent=title;button.setAttribute('aria-expanded','false');button.setAttribute('aria-controls',id);
    const panel=document.createElement('div');panel.id=id;panel.className='nav-command-panel';panel.hidden=true;panel.setAttribute('role','group');panel.setAttribute('aria-label',title);
    ids.forEach(name=>{const command=document.getElementById(name);if(command)panel.append(command);});nav.append(button);nav.after(panel);
    button.onclick=()=>{const opening=panel.hidden;closeMenus();panel.hidden=!opening;button.setAttribute('aria-expanded',String(opening));};
    panel.addEventListener('click',event=>{if(event.target.closest('button'))closeMenus();});
  }
  function closeMenus(){for(const id of ['fileMenu','helpMenu']){document.getElementById(id).hidden=true;document.getElementById(id+'Button').setAttribute('aria-expanded','false');}document.getElementById('analysisMenu').hidden=true;document.getElementById('openAnalysis').setAttribute('aria-expanded','false');}
  const open=document.createElement('button');open.id='openSettings';open.textContent='Pengaturan';open.setAttribute('aria-haspopup','dialog');nav.append(open);
  const backdrop=document.createElement('div');backdrop.id='settingsModal';backdrop.className='modal-backdrop';
  backdrop.innerHTML='<div class="modal settings-dialog" role="dialog" aria-modal="true" aria-labelledby="settingsTitle"><div class="modal-head"><strong id="settingsTitle">Pengaturan</strong></div><div class="modal-body" id="settingsBody"></div><div class="modal-foot"><button id="saveSettings" class="primary">Simpan</button><button id="closeSettings">Tutup</button></div></div>';
  document.body.append(backdrop);
  const body=backdrop.querySelector('#settingsBody'),old=document.getElementById('numberSettings');
  body.append(old.querySelector('.number-settings-body'));old.remove();body.append(document.querySelector('.font-size-setting'));
  const decimal=document.getElementById('decimalSeparator'),font=document.getElementById('dataFontSize');let previous;
  const close=()=>{if(!backdrop.classList.contains('open'))return;decimal.value=previous.decimal;font.value=previous.font;backdrop.classList.remove('open');open.focus();};
  open.onclick=()=>{closeMenus();previous={decimal:decimal.value,font:font.value};backdrop.classList.add('open');decimal.focus();};
  document.getElementById('closeSettings').onclick=close;
  document.getElementById('saveSettings').onclick=()=>{if(decimal.value!==previous.decimal)decimal.dispatchEvent(new Event('settings-save'));font.dispatchEvent(new Event('settings-save'));previous={decimal:decimal.value,font:font.value};close();};
  backdrop.addEventListener('click',e=>{if(e.target===backdrop)close();});
  document.addEventListener('click',event=>{if(!event.target.closest('.nav,.nav-command-panel'))closeMenus();});
  document.addEventListener('close-navigation',closeMenus);
  document.addEventListener('keydown',event=>{if(event.key==='Escape'){closeMenus();close();}if(event.key==='Tab'&&backdrop.classList.contains('open')){const first=decimal,last=document.getElementById('closeSettings');if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}}});
}
