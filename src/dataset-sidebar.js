const $=s=>document.querySelector(s);

function ensureStyle(){
  if($('#datasetSidebarEnhancementStyle'))return;
  const style=document.createElement('style');
  style.id='datasetSidebarEnhancementStyle';
  style.textContent=`
    #fileTree .dataset-tree-row{display:grid;grid-template-columns:minmax(0,1fr) 34px;gap:5px;align-items:stretch;margin-bottom:6px}
    #fileTree .dataset-tree-row .tree-item{min-width:0;width:100%;margin:0;text-align:left;overflow:hidden;text-overflow:ellipsis;white-space:normal;word-break:break-word}
    #fileTree .dataset-delete-shortcut{display:flex;align-items:center;justify-content:center;margin:0;padding:0;border:1px solid #d8dee8;border-radius:7px;background:#fff;color:#dc2626;font-size:24px;line-height:1;cursor:pointer}
    #fileTree .dataset-delete-shortcut:hover{background:#fff1f2;border-color:#fecaca}
    #fileTree .dataset-delete-shortcut:focus-visible{outline:2px solid #60a5fa;outline-offset:1px}
    #projectPanel>.dataset-actions{display:none!important}
  `;
  document.head.appendChild(style);
}

function decorateTree(){
  const tree=$('#fileTree');if(!tree)return;
  const items=[...tree.querySelectorAll(':scope > .tree-item')];
  for(const item of items){
    const row=document.createElement('div');row.className='dataset-tree-row';item.before(row);row.appendChild(item);
    item.title='Klik sekali untuk membuka. Klik 2x untuk mengubah nama.';
    const del=document.createElement('button');del.type='button';del.className='dataset-delete-shortcut';del.textContent='×';del.title='Hapus dataset';del.setAttribute('aria-label',`Hapus dataset ${item.textContent.replace(/^📄\s*/, '').trim()}`);row.appendChild(del);
  }
}

export function installDatasetSidebarEnhancements(){
  const tree=$('#fileTree');if(!tree)return;ensureStyle();decorateTree();
  new MutationObserver(()=>decorateTree()).observe(tree,{childList:true});

  let lastName='',lastTime=0;
  tree.addEventListener('click',event=>{
    const del=event.target.closest('.dataset-delete-shortcut');
    if(del&&tree.contains(del)){
      event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();
      const item=del.closest('.dataset-tree-row')?.querySelector('.tree-item');if(!item)return;
      lastName='';lastTime=0;
      if(!item.classList.contains('active'))item.click();
      lastName='';lastTime=0;
      $('#deleteDataset')?.click();
      return;
    }
    const item=event.target.closest('.tree-item');if(!item)return;
    const name=item.dataset.file||item.textContent.replace(/^📄\s*/, '').trim(),now=Date.now();
    if(name===lastName&&now-lastTime<=550){
      event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();lastName='';lastTime=0;
      $('#renameDataset')?.click();
      return;
    }
    lastName=name;lastTime=now;
  },true);
}
