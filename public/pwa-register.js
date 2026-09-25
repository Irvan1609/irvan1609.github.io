const SW_URL='/sw.js';
let deferredInstall=null;

function sendWarm(registration){
  const worker=navigator.serviceWorker.controller||registration?.active||registration?.waiting;
  worker?.postMessage({type:'WARM_ROUTE',url:location.pathname+location.search});
  if(location.pathname.startsWith('/hitung-cabai/'))worker?.postMessage({type:'WARM_CHILI'});
}
function installStyles(){
  if(document.getElementById('agrotikPwaStyle'))return;
  const style=document.createElement('style');style.id='agrotikPwaStyle';
  style.textContent='.agrotik-install{position:fixed;right:12px;bottom:72px;z-index:180;border:1px solid #b9c9c1;border-radius:999px;background:#fff;color:#173a2d;padding:8px 11px;font:700 12px/1.1 "Segoe UI",Arial,sans-serif;box-shadow:0 7px 22px rgba(18,54,40,.14);cursor:pointer}.agrotik-offline{position:fixed;left:10px;bottom:10px;z-index:180;padding:5px 8px;border-radius:999px;background:#26343d;color:#fff;font:700 11px/1 "Segoe UI",Arial,sans-serif;box-shadow:0 5px 16px rgba(0,0,0,.16)}@media(display-mode:standalone){.agrotik-install{display:none!important}}';
  document.head.append(style);
}
function installButton(){
  installStyles();
  let button=document.getElementById('agrotikInstall');
  if(button)return button;
  button=document.createElement('button');button.id='agrotikInstall';button.className='agrotik-install';button.type='button';button.textContent='Instal';button.setAttribute('aria-label','Instal Agrotik di perangkat');
  button.onclick=async()=>{
    if(!deferredInstall)return;
    button.disabled=true;deferredInstall.prompt();
    await deferredInstall.userChoice.catch(()=>null);
    deferredInstall=null;button.remove();
  };
  document.body.append(button);return button;
}
function updateNetworkBadge(){
  installStyles();
  let badge=document.getElementById('agrotikOffline');
  if(navigator.onLine){badge?.remove();document.documentElement.removeAttribute('data-offline');return;}
  document.documentElement.dataset.offline='true';
  if(!badge){badge=document.createElement('div');badge.id='agrotikOffline';badge.className='agrotik-offline';badge.textContent='Offline';badge.setAttribute('role','status');document.body.append(badge);}
}

window.addEventListener('beforeinstallprompt',event=>{
  event.preventDefault();deferredInstall=event;installButton();
});
window.addEventListener('appinstalled',()=>{deferredInstall=null;document.getElementById('agrotikInstall')?.remove();});
window.addEventListener('online',updateNetworkBadge);
window.addEventListener('offline',updateNetworkBadge);
updateNetworkBadge();

if('serviceWorker'in navigator){
  window.addEventListener('load',async()=>{
    try{
      const registration=await navigator.serviceWorker.register(SW_URL,{scope:'/',updateViaCache:'none'});
      sendWarm(registration);
      navigator.serviceWorker.addEventListener('controllerchange',()=>sendWarm(registration),{once:true});
      void registration.update();
    }catch(error){console.warn('PWA registration skipped',error);}
  });
}
