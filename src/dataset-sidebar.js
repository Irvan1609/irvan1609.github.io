const $=s=>document.querySelector(s);

function ensureStyle(){
  if($('#datasetSidebarEnhancementStyle'))return;
  const style=document.createElement('style');
  style.id='datasetSidebarEnhancementStyle';
  style.textContent=`
    #fileTree .dataset-tree-row{position:relative;display:grid;grid-template-columns:minmax(0,1fr) 30px;gap:3px;align-items:center;margin-bottom:3px}
    #fileTree .dataset-tree-row .tree-item{min-width:0;width:100%;min-height:32px;margin:0;padding:5px 7px;display:grid;grid-template-columns:minmax(0,1fr) auto;gap:7px;align-items:center;text-align:left;white-space:nowrap}
    #fileTree .dataset-tree-name{min-width:0;overflow:hidden;text-overflow:ellipsis;font-size:12px;font-weight:650}
    #fileTree .dataset-tree-size{font-size:10px;font-weight:700;color:#7a8792;white-space:nowrap}
    #fileTree .dataset-row-menu{position:relative;min-width:0}
    #fileTree .dataset-row-menu>summary{width:30px;height:32px;display:grid;place-items:center;cursor:pointer;list-style:none;border-radius:6px;color:#657582;font-size:16px;font-weight:800}
    #fileTree .dataset-row-menu>summary::-webkit-details-marker{display:none}
    #fileTree .dataset-row-menu[open]>summary,#fileTree .dataset-row-menu>summary:hover{background:#edf2f5;color:#29475e}
    #fileTree .dataset-row-menu-body{position:fixed;left:0;top:0;right:auto;z-index:220;width:156px;max-height:min(320px,70dvh);overflow:auto;padding:4px;border:1px solid #d5dde4;border-radius:7px;background:#fff;box-shadow:0 12px 30px rgba(25,43,58,.18)}
    #fileTree .dataset-row-menu-body button{width:100%;min-height:30px;padding:4px 7px;border:0;border-radius:5px;background:transparent;text-align:left;font-size:11.5px;color:#344b5d}
    #fileTree .dataset-row-menu-body button:hover{background:#f1f4f6}
    #fileTree .dataset-row-menu-body button[data-dataset-action="delete"]{color:#9c302a}
    #projectPanel>.dataset-actions{display:none!important}
    @media(max-width:720px){
      #fileTree .dataset-tree-row{grid-template-columns:minmax(0,1fr) 36px;gap:4px}
      #fileTree .dataset-tree-row .tree-item{min-height:42px;padding:7px 8px}
      #fileTree .dataset-tree-name{font-size:13px}
      #fileTree .dataset-tree-size{font-size:11px}
      #fileTree .dataset-row-menu>summary{width:36px;height:42px;font-size:18px}
      #fileTree .dataset-row-menu-body{width:176px}
      #fileTree .dataset-row-menu-body button{min-height:40px;font-size:13px}
    }
  `;
  document.head.appendChild(style);
}

const menuMarkup=()=>`<details class="dataset-row-menu">
  <summary aria-label="Tindakan dataset" title="Tindakan dataset">⋯</summary>
  <div class="dataset-row-menu-body">
    <button type="button" data-dataset-action="rename">Ubah nama</button>
    <button type="button" data-dataset-action="duplicate">Buat salinan</button>
    <button type="button" data-dataset-action="raw">Data mentah</button>
    <button type="button" data-dataset-action="meta">Metadata</button>
    <button type="button" data-dataset-action="history">Riwayat</button>
    <button type="button" data-dataset-action="delete">Hapus</button>
  </div>
</details>`;

function decorateTree(){
  const tree=$('#fileTree');if(!tree)return;
  const items=[...tree.querySelectorAll(':scope > .tree-item')];
  for(const item of items){
    const row=document.createElement('div');row.className='dataset-tree-row';item.before(row);row.appendChild(item);
    const name=item.querySelector('.dataset-tree-name')?.textContent?.trim()||item.dataset.file||'dataset';
    item.title='Buka '+name;
    row.insertAdjacentHTML('beforeend',menuMarkup());
  }
}

function positionMenu(menu){
  const summary=menu?.querySelector('summary'),body=menu?.querySelector('.dataset-row-menu-body');
  if(!summary||!body)return;
  const rect=summary.getBoundingClientRect(),gap=4,pad=8;
  const width=Math.min(globalThis.matchMedia?.('(max-width:720px)')?.matches?176:156,window.innerWidth-pad*2);
  body.style.width=width+'px';
  body.style.left=Math.max(pad,Math.min(window.innerWidth-width-pad,rect.right-width))+'px';
  body.style.top=(rect.bottom+gap)+'px';
  requestAnimationFrame(()=>{
    const h=Math.min(body.scrollHeight,window.innerHeight-pad*2),below=rect.bottom+gap+h<=window.innerHeight-pad;
    const top=below?rect.bottom+gap:Math.max(pad,rect.top-gap-h);
    body.style.top=top+'px';
  });
}
function closeMenus(except=null){
  document.querySelectorAll('#fileTree .dataset-row-menu[open]').forEach(menu=>{if(menu!==except)menu.open=false;});
}

export function installDatasetSidebarEnhancements(){
  const tree=$('#fileTree');if(!tree)return;ensureStyle();decorateTree();
  new MutationObserver(()=>decorateTree()).observe(tree,{childList:true});

  tree.addEventListener('toggle',event=>{
    const menu=event.target.closest?.('.dataset-row-menu');
    if(menu?.open){closeMenus(menu);positionMenu(menu);}
  },true);

  tree.addEventListener('click',event=>{
    const actionButton=event.target.closest('[data-dataset-action]');
    if(!actionButton||!tree.contains(actionButton))return;
    event.preventDefault();event.stopPropagation();
    const row=actionButton.closest('.dataset-tree-row'),item=row?.querySelector('.tree-item');
    if(!item)return;
    if(!item.classList.contains('active'))item.click();
    const targets={
      rename:'#renameDataset',duplicate:'#duplicateDataset',raw:'#viewRawDataset',
      meta:'#viewDatasetMeta',history:'#datasetHistory',delete:'#deleteDataset'
    };
    const target=$(targets[actionButton.dataset.datasetAction]);
    actionButton.closest('.dataset-row-menu').open=false;
    target?.click();
  });

  tree.addEventListener('dblclick',event=>{
    const item=event.target.closest('.tree-item');if(!item||!tree.contains(item))return;
    event.preventDefault();if(!item.classList.contains('active'))item.click();$('#renameDataset')?.click();
  });

  document.addEventListener('click',event=>{if(!event.target.closest('#fileTree .dataset-row-menu'))closeMenus();});
  window.addEventListener('resize',()=>document.querySelectorAll('#fileTree .dataset-row-menu[open]').forEach(positionMenu));
  document.addEventListener('scroll',event=>{if(event.target.closest?.('#projectPanel')||event.target===document)closeMenus();},true);
}
