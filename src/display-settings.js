const KEY='statistical_web_font_size';
export function initDisplaySettings(){
  if(document.getElementById('dataFontSize'))return;
  const label=document.createElement('label');label.className='font-size-setting';
  label.innerHTML='Ukuran font data <select id="dataFontSize"><option value="small">Kecil</option><option value="medium">Sedang</option><option value="large">Besar</option></select>';
  document.querySelector('.toolbar')?.append(label);
  const select=label.querySelector('select');let saved='medium';
  try{saved=localStorage.getItem(KEY)||'medium';}catch{}
  select.value=['small','medium','large'].includes(saved)?saved:'medium';
  const apply=()=>{document.documentElement.dataset.dataFont=select.value;};apply();
  select.addEventListener('settings-save',()=>{apply();try{localStorage.setItem(KEY,select.value);}catch{}});
}
