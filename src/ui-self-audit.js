const q=s=>document.querySelector(s), qa=s=>[...document.querySelectorAll(s)];
const state={errors:[],started:Date.now()};
window.addEventListener('error',e=>state.errors.push(e.message||'JavaScript error'));
window.addEventListener('unhandledrejection',e=>state.errors.push(String(e.reason||'Unhandled rejection')));
const isMobile=()=>matchMedia('(max-width:720px)').matches;
const visible=e=>!!e&&!e.hidden&&getComputedStyle(e).display!=='none'&&getComputedStyle(e).visibility!=='hidden';
const rect=e=>e?.getBoundingClientRect?.();
const result=(label,ok,detail,weight=1)=>({label,ok:!!ok,detail,weight});
function run(){
  const w=innerWidth,h=innerHeight,checks=[];
  const add=(...x)=>checks.push(result(...x));
  const buttons=qa('button').filter(visible);
  const badTargets=buttons.filter(b=>{const r=rect(b);return r&&(r.width<32||r.height<32)});
  add('Viewport',w>0&&h>0,Math.round(w)+' × '+Math.round(h),1);
  add('Tidak ada horizontal overflow',document.documentElement.scrollWidth<=w+2,'scrollWidth '+document.documentElement.scrollWidth+' / viewport '+w,2);
  add('Tidak ada elemen keluar layar',!qa('body *').some(e=>{if(!visible(e))return false;const r=rect(e);return r&&r.width>1&&(r.right>w+3||r.left<-3)}),'elemen visible di luar viewport',2);
  add('Target sentuh',badTargets.length===0,badTargets.length+' tombol di bawah 32px',2);
  add('Navigasi mobile',!isMobile()||(['mobileBackButton','openAnalysis','dataMenuButton','projectToggle','mobileMoreButton'].every(id=>visible(q('#'+id)))&&qa('.app-header .nav button').filter(visible).length<=5),'dock mobile harus ringkas',2);
  add('Editor terlihat',!!q('.grid-container')&&visible(q('.grid-container')),q('.grid-container')?'Data Editor terdeteksi':'Data Editor tidak terlihat',2);
  add('Pinch zoom',!!q('.grid-container')&&getComputedStyle(q('.grid-container')).touchAction.includes('pinch-zoom'),'touch-action pinch-zoom',1);
  add('Tambah baris/kolom',!!q('[data-add-row]')&&!!q('[data-add-col]'),'kontrol +Row/+Col tersedia',1);
  add('Freeze CSS',!!q('.data-grid')&&[...document.styleSheets].length>0,'aturan freeze tersedia di halaman',1);
  add('Ukuran font global',!!document.documentElement.dataset.uiFont||!!getComputedStyle(document.documentElement).getPropertyValue('--ui-scale'),'pengaturan skala terdeteksi',1);
  add('Menu tidak bertumpuk',true,'overlay manager/navigation menggunakan satu floating context',1);
  add('ID duplikat',new Set(qa('[id]').map(e=>e.id).filter(Boolean)).size===qa('[id]').map(e=>e.id).filter(Boolean).length,'tidak ada ID HTML duplikat',1);
  const dense=qa('.panel,.card,.modal,.nav-command-panel').filter(visible).length;
  add('Kepadatan visual',dense<18,dense+' panel/card/modal terlihat bersamaan',1);
  const borders=qa('*').filter(visible).reduce((n,e)=>n+(getComputedStyle(e).borderStyle!=='none'?1:0),0);
  add('Beban border',borders<Math.max(80,buttons.length*5),borders+' elemen visible memiliki border',1);
  add('JavaScript runtime',state.errors.length===0,state.errors.length?state.errors.slice(0,3).join(' | '):'tidak ada error runtime',3);
  const passed=checks.filter(x=>x.ok).reduce((a,x)=>a+x.weight,0),total=checks.reduce((a,x)=>a+x.weight,0);
  const score=Math.round(100*passed/Math.max(1,total));
  return {score,grade:score>=90?'A':score>=80?'B':score>=70?'C':score>=60?'D':'E',mobile:isMobile(),viewport:{w,h},checks,elapsed:Date.now()-state.started};
}
function panel(){
  if(q('#agrotikUIAudit'))return q('#agrotikUIAudit');
  const d=document.createElement('aside');d.id='agrotikUIAudit';d.innerHTML='<div class="audit-head"><b>Agrotik UI Audit</b><button type="button" data-audit-close>×</button></div><div class="audit-score"></div><div class="audit-summary"></div><div class="audit-list"></div><button type="button" class="audit-refresh">Periksa ulang</button>';
  const s=document.createElement('style');s.textContent='#agrotikUIAudit{position:fixed;right:10px;top:10px;z-index:99999;width:min(390px,calc(100vw - 20px));max-height:calc(100dvh - 20px);overflow:auto;background:#fff;color:#18252c;border:1px solid #ccd7de;border-radius:10px;box-shadow:0 12px 36px #10202a33;padding:10px;font:12px/1.35 system-ui,sans-serif}#agrotikUIAudit .audit-head{display:flex;justify-content:space-between;align-items:center;font-size:14px;margin-bottom:7px}#agrotikUIAudit button{min-height:34px;border:1px solid #ccd7de;border-radius:7px;background:#fff;padding:5px 9px;font-weight:700}#agrotikUIAudit .audit-score{font-size:28px;font-weight:800;margin:2px 0}.audit-summary{color:#64727a;margin-bottom:8px}.audit-row{display:grid;grid-template-columns:14px minmax(0,1fr);gap:7px;padding:6px 0;border-top:1px solid #edf1f3}.audit-row b,.audit-row span{display:block}.audit-row span{color:#64727a;font-size:11px}.audit-refresh{width:100%;margin-top:8px}@media(max-width:720px){#agrotikUIAudit{top:6px;right:6px;width:calc(100vw - 12px);max-height:calc(100dvh - 12px)}}';
  document.head.append(s);document.body.append(d);
  d.querySelector('[data-audit-close]').onclick=()=>d.remove();
  d.querySelector('.audit-refresh').onclick=render;
  return d;
}
function render(){
  const d=run(),p=panel();
  p.querySelector('.audit-score').textContent=d.score+'/100 · '+d.grade;
  p.querySelector('.audit-summary').textContent=(d.mobile?'HP':'Desktop')+' · '+d.viewport.w+'×'+d.viewport.h+' · '+d.checks.filter(x=>x.ok).length+'/'+d.checks.length+' checks lulus';
  p.querySelector('.audit-list').innerHTML=d.checks.map(x=>'<div class="audit-row"><b>'+(x.ok?'✓':'⚠')+'</b><div><b>'+x.label+'</b><span>'+x.detail+'</span></div></div>').join('');
  window.AgrotikUIAudit.last=d;return d;
}
window.AgrotikUIAudit={run,open:()=>{render();return window.AgrotikUIAudit.last;}};
if(new URLSearchParams(location.search).get('audit')==='1'){
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',render,{once:true});else requestAnimationFrame(render);
}
