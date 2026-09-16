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
  `;
  document.head.appendChild(style);
}

function activateDataset(button){
  if(!button.classList.contains('active'))button.click();
}

function decorateTree(){
  const tree=$('#fileTree');
  if(!tree)return;
  const items=[...tree.querySelectorAll(':scope > .tree-item')];
  if(!items.length)return;
  for(const item of items){
    const row=document.createElement('div');
    row.className='dataset-tree-row';
    item.before(row);
    row.appendChild(item);
    item.title='Klik sekali untuk membuka. Klik 2x untuk mengubah nama.';
    const del=document.createElement('button');
    del.type='button';
    del.className='dataset-delete-shortcut';
    del.textContent='×';
    del.title='Hapus dataset';
    del.setAttribute('aria-label',`Hapus dataset ${item.textContent.replace(/^📄\s*/, '').trim()}`);
    row.appendChild(del);
  }
}

export function installDatasetSidebarEnhancements(){
  const tree=$('#fileTree');
  if(!tree)return;
  ensureStyle();
  decorateTree();
  const observer=new MutationObserver(()=>decorateTree());
  observer.observe(tree,{childList:true});

  let lastDataset='',lastClick=0;
  tree.addEventListener('click',event=>{
    const del=event.target.closest('.dataset-delete-shortcut');
    if(del&&tree.contains(del)){
      event.preventDefault();
      event.stopPropagation();
      const item=del.closest('.dataset-tree-row')?.querySelector('.tree-item');
      if(!item)return;
      activateDataset(item);
      $('#deleteDataset')?.click();
      lastDataset='';lastClick=0;
      return;
    }

    const item=event.target.closest('.tree-item');
    if(!item||!tree.contains(item))return;
    const name=item.dataset.file||item.textContent.replace(/^📄\s*/, '').trim(),now=Date.now();
    if(name===lastDataset&&now-lastClick<=450){
      event.preventDefault();
      lastDataset='';lastClick=0;
      $('#renameDataset')?.click();
      return;
    }
    lastDataset=name;lastClick=now;
  });
}
