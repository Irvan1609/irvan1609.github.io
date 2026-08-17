(() => {
  const $ = (s) => document.querySelector(s);
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (m) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const responseNames = new Set();
  let multiRunGuard = false;

  function installStyles() {
    if ($('#rakDndStyles')) return;
    const style=document.createElement('style');
    style.id='rakDndStyles';
    style.textContent=`
      @media(max-width:767.98px){.mobile-nav{display:none!important}}
      .rak-model{display:grid;grid-template-columns:minmax(190px,1fr) 36px minmax(210px,1.15fr);gap:14px;align-items:start}
      .rak-var-panel,.rak-role-panel{border:1px solid var(--border);background:#fff;border-radius:5px;min-height:330px}
      .rak-panel-title{font-size:12px;font-weight:650;color:#526171;background:#f1f4f7;border-bottom:1px solid var(--border);padding:9px 10px}
      .rak-variable-list{padding:8px;display:flex;flex-direction:column;gap:5px;max-height:390px;overflow:auto}
      .rak-chip{display:flex;align-items:center;gap:7px;padding:8px 9px;border:1px solid #cbd5df;border-radius:4px;background:#fff;color:#334455;font-size:13px;cursor:grab;user-select:none;touch-action:none}
      .rak-chip:hover{background:#f3f7fb;border-color:#8fb0ce}.rak-chip:active{cursor:grabbing}.rak-chip.dragging{opacity:.45}.rak-chip small{margin-left:auto;color:#8a96a3;font-size:10px}
      .rak-drop-panel{padding:10px;display:flex;flex-direction:column;gap:10px}.rak-role{border:1px dashed #aebdcb;border-radius:5px;background:#fafbfd;min-height:78px;padding:8px;transition:.12s}.rak-role.drag-over{border-color:var(--blue);background:#eef6ff;box-shadow:inset 0 0 0 1px var(--blue)}
      .rak-role-title{font-size:11px;font-weight:650;color:#647384;margin-bottom:6px}.rak-role-value{min-height:34px;display:flex;align-items:center;color:#98a3af;font-size:12px}.rak-role-value .rak-chip{width:100%;margin:0;cursor:default;background:#eef5fc;border-color:#a9c4dd;color:#214e76}
      .rak-response-list{display:flex;flex-direction:column;gap:6px;max-height:180px;overflow:auto}.rak-response-option{display:flex;align-items:center;gap:8px;padding:7px 8px;border:1px solid #d5dee7;border-radius:4px;background:#fff;color:#334455;cursor:pointer}.rak-response-option:hover{background:#f3f7fb}.rak-response-option input{width:18px;height:18px;margin:0;accent-color:var(--blue)}.rak-selected-count{font-size:11px;color:var(--blue);font-weight:650;margin-top:7px}
      .rak-arrow{display:flex;align-items:center;justify-content:center;color:#8291a0;font-size:22px;padding-top:155px}.rak-helper{margin-top:10px;padding:8px 10px;border:1px solid #dbe4ec;background:#f7f9fb;border-radius:5px;font-size:11px;color:#687787}.rak-hidden-selects{display:none!important}
      @media(max-width:700px){.rak-model{grid-template-columns:1fr}.rak-arrow{display:none}.rak-var-panel,.rak-role-panel{min-height:0}.rak-variable-list{max-height:210px}.rak-role{min-height:70px}.rak-response-list{max-height:220px}}
    `;
    document.head.appendChild(style);
  }

  function headersFromApp(){
    const response=$('#rakResponse');
    if(!response)return[];
    const all=new Set();
    ['#rakResponse','#rakTreatment','#rakBlock'].forEach(id=>document.querySelectorAll(`${id} option`).forEach(o=>all.add(o.textContent)));
    return [...all];
  }

  function populateVariables(){
    const list=$('#rakVariableList');
    if(!list)return;
    const names=headersFromApp();
    list.innerHTML=names.length?names.map(name=>`<div class="rak-chip" draggable="true" data-variable="${esc(name)}">▦ ${esc(name)}<small>drag</small></div>`).join(''):'<div class="rak-helper">Tidak ada variabel. Kembali ke Data Editor dan masukkan dataset.</div>';
    list.querySelectorAll('.rak-chip[draggable="true"]').forEach(chip=>{
      chip.addEventListener('dragstart',e=>{chip.classList.add('dragging');e.dataTransfer.effectAllowed='copy';e.dataTransfer.setData('text/plain',chip.dataset.variable);});
      chip.addEventListener('dragend',()=>chip.classList.remove('dragging'));
    });
    populateResponseOptions(names);
  }

  function populateResponseOptions(names){
    const list=$('#rakResponseMulti');
    if(!list)return;
    const previous=new Set(responseNames);
    list.innerHTML=names.map(name=>`<label class="rak-response-option"><input type="checkbox" value="${esc(name)}"> <span>${esc(name)}</span></label>`).join('');
    list.querySelectorAll('input').forEach(input=>{
      input.checked=previous.has(input.value);
      input.addEventListener('change',()=>{
        if(input.checked)responseNames.add(input.value);else responseNames.delete(input.value);
        syncHiddenResponse();
        updateResponseCount();
      });
    });
    updateResponseCount();
  }

  function updateResponseCount(){
    const count=$('#rakResponseCount');
    if(count)count.textContent=`${responseNames.size} peubah dipilih`;
  }

  function syncHiddenResponse(){
    const select=$('#rakResponse');
    if(!select)return;
    const first=[...responseNames][0];
    if(first){const option=[...select.options].find(o=>o.textContent===first);if(option)select.value=option.value;}
    else select.value='';
  }

  function findOption(select,name){return [...select.options].find(o=>o.textContent===name);}

  function addResponse(name){
    if(!name)return;
    responseNames.add(name);
    const input=$(`#rakResponseMulti input[value="${CSS.escape(name)}"]`);
    if(input)input.checked=true;
    syncHiddenResponse();
    updateResponseCount();
  }

  function setRole(role,name){
    if(role==='response'){
      addResponse(name);
      return;
    }
    const select=role==='treatment'?$('#rakTreatment'):$('#rakBlock');
    const value=$(`#rakRoleValue-${role}`);
    if(!select||!value)return;
    const option=findOption(select,name);
    if(!option){const opt=document.createElement('option');opt.value='';opt.textContent=name;select.appendChild(opt);}
    const target=findOption(select,name)||select.options[select.options.length-1];
    select.value=target.value;
    value.innerHTML=`<div class="rak-chip">▦ ${esc(name)} <button type="button" data-clear-role="${role}" title="Hapus" style="margin-left:auto;border:0;background:transparent;color:#6c7b8a;cursor:pointer">✕</button></div>`;
    value.querySelector('[data-clear-role]').addEventListener('click',()=>clearRole(role));
  }

  function clearRole(role){
    if(role==='response'){
      responseNames.clear();
      document.querySelectorAll('#rakResponseMulti input').forEach(i=>i.checked=false);
      syncHiddenResponse();updateResponseCount();return;
    }
    const select=role==='treatment'?$('#rakTreatment'):$('#rakBlock');
    const value=$(`#rakRoleValue-${role}`);
    if(select)select.value='';if(value)value.innerHTML='<span>Tarik variabel ke sini</span>';
  }

  function bindDrop(role){
    const zone=$(`#rakRole-${role}`);if(!zone)return;
    zone.addEventListener('dragover',e=>{e.preventDefault();zone.classList.add('drag-over');e.dataTransfer.dropEffect='copy';});
    zone.addEventListener('dragleave',()=>zone.classList.remove('drag-over'));
    zone.addEventListener('drop',e=>{e.preventDefault();zone.classList.remove('drag-over');const name=e.dataTransfer.getData('text/plain');if(name)setRole(role,name);});
  }

  function installMultiRun(){
    const btn=$('#runRak');
    if(!btn||btn.dataset.multiRunBound)return;
    btn.dataset.multiRunBound='1';
    btn.addEventListener('click',()=>{
      if(multiRunGuard)return;
      if(responseNames.size<=1)return;
      const select=$('#rakResponse');
      const result=$('#rakResult');
      if(!select||!result)return;
      const names=[...responseNames];
      const firstOption=findOption(select,names[0]);
      if(!firstOption)return;
      const firstResult=result.innerHTML;
      const outputs=[{name:names[0],html:firstResult}];
      multiRunGuard=true;
      try{
        for(let i=1;i<names.length;i++){
          const option=findOption(select,names[i]);
          if(!option)continue;
          select.value=option.value;
          btn.click();
          outputs.push({name:names[i],html:result.innerHTML});
        }
      }finally{
        select.value=firstOption.value;
        multiRunGuard=false;
      }
      result.innerHTML=`<div class="analysis-note" style="margin-top:14px"><b>${outputs.length} parameter dianalisis</b> sekaligus.</div>`+outputs.map((o,i)=>`<section style="margin-top:16px;padding-top:12px;border-top:1px solid var(--border)"><h3 style="margin:0 0 6px;color:var(--navy);font-size:15px">${i+1}. ${esc(o.name)}</h3>${o.html}</section>`).join('');
    });
  }

  function build(){
    installStyles();
    const modal=$('#rakModal');
    if(!modal||$('#rakDndRoot'))return;
    const body=modal.querySelector('.modal-body');if(!body)return;
    const oldGrid=body.querySelector('.form-grid');if(oldGrid)oldGrid.classList.add('rak-hidden-selects');
    const root=document.createElement('div');root.id='rakDndRoot';
    root.innerHTML=`<div class="rak-model"><div class="rak-var-panel"><div class="rak-panel-title">Variabel</div><div id="rakVariableList" class="rak-variable-list"></div></div><div class="rak-arrow">→</div><div class="rak-role-panel"><div class="rak-panel-title">Model RAK</div><div class="rak-drop-panel"><div id="rakRole-response" class="rak-role"><div class="rak-role-title">RESPONSE VARIABLE(S) — BISA LEBIH DARI SATU</div><div id="rakResponseMulti" class="rak-response-list"></div><div id="rakResponseCount" class="rak-selected-count">0 peubah dipilih</div></div><div id="rakRole-treatment" class="rak-role"><div class="rak-role-title">TREATMENT(S) / PERLAKUAN</div><div id="rakRoleValue-treatment" class="rak-role-value">Tarik perlakuan ke sini</div></div><div id="rakRole-block" class="rak-role"><div class="rak-role-title">BLOCK / KELOMPOK / ULANGAN</div><div id="rakRoleValue-block" class="rak-role-value">Tarik kelompok ke sini</div></div></div></div></div><div class="rak-helper">💡 <b>Response</b> dapat dipilih lebih dari satu. Perlakuan dan kelompok tetap satu faktor. Seret variabel dari panel kiri atau centang beberapa peubah respons.</div>`;
    body.insertBefore(root,body.firstChild);
    ['response','treatment','block'].forEach(bindDrop);
    document.querySelectorAll('[data-menu="Analyze"],[data-mobile="Analyze"]').forEach(btn=>btn.addEventListener('click',()=>setTimeout(populateVariables,30));
    document.querySelectorAll('#rakModal select').forEach(s=>s.addEventListener('change',()=>{const role=s.id==='rakResponse'?'response':s.id==='rakTreatment'?'treatment':'block';const selected=s.options[s.selectedIndex];if(selected&&selected.value!=='')setRole(role,selected.textContent);}));
    populateVariables();
    setTimeout(installMultiRun,0);
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',build);else build();
})();

(() => {
  function cleanName(name){return String(name||'dataset').replace(/\.txt$/i,'');}
  function refreshDataLabels(){
    const title=document.querySelector('.panel-title');
    if(title && /DATA\s*\(\.TXT\)/i.test(title.textContent)) title.textContent='DATA';
    const newData=document.querySelector('#newTxt');
    if(newData) newData.textContent='＋ Data';
    document.querySelectorAll('#fileTree .tree-item').forEach(btn=>{const name=btn.getAttribute('data-file');btn.textContent='📄 '+(name?cleanName(name):btn.textContent.replace(/\.txt\b/gi,'').trim());});
    const active=document.querySelector('#activeFile');
    if(active) active.textContent=cleanName(active.textContent);
    const storage=document.querySelector('#storageStatus');
    if(storage) storage.textContent=storage.textContent.replace(/file\s*\.txt/gi,'dataset');
    const empty=document.querySelector('#gridWrap .empty-state');
    if(empty) empty.innerHTML=empty.innerHTML.replace(/File \.txt/gi,'Dataset');
  }
  const observer=new MutationObserver(refreshDataLabels);
  function start(){refreshDataLabels();const tree=document.querySelector('#fileTree');if(tree)observer.observe(tree,{childList:true,subtree:true});const active=document.querySelector('#activeFile');if(active)observer.observe(active,{childList:true,characterData:true,subtree:true});}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})();