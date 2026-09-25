import fs from 'node:fs';

function fail(message){console.error('PWA check failed:',message);process.exit(1);}

const sw=fs.readFileSync('public/sw.js','utf8');
const manifest=JSON.parse(fs.readFileSync('public/manifest.webmanifest','utf8'));
const register=fs.readFileSync('public/pwa-register.js','utf8');
const offline=fs.readFileSync('public/offline.html','utf8');
const icon=fs.readFileSync('public/icons/agrotik.svg','utf8');

for(const marker of [
  "CORE_CACHE='agrotik-core-'",
  "RUNTIME_CACHE='agrotik-runtime-'",
  "THIRD_PARTY_CACHE='agrotik-third-party-'",
  "'/offline.html'",
  "request.method!=='GET'","request.mode==='navigate'",
  "cdn.jsdelivr.net","cdnjs.cloudflare.com"
]) if(!sw.includes(marker))fail('service worker missing '+marker);

if(sw.includes("method==='POST'")||sw.includes('method==="POST"'))fail('service worker must not cache POST requests');
if(!sw.includes("skipSameOriginPath(url.pathname)"))fail('service worker cache exclusion missing');
if(!register.includes("navigator.serviceWorker.register")||!register.includes("beforeinstallprompt"))fail('PWA registration/install flow incomplete');
if(!register.includes("document.querySelector('.subweb-nav')")||!register.includes("document.querySelector('.site-header .nav-links')"))fail('PWA install control must be placed in the site header');

if(manifest.name!=='Agrotik · Alat Riset Agronomi')fail('manifest name incorrect');
if(manifest.display!=='standalone'||manifest.scope!=='/'||manifest.start_url!=='/')fail('manifest app shell settings incorrect');
if(!Array.isArray(manifest.icons)||!manifest.icons.some(icon=>icon.src==='/icons/agrotik.svg'))fail('manifest icon missing');
if(!Array.isArray(manifest.shortcuts)||manifest.shortcuts.length<3)fail('manifest shortcuts incomplete');
if(!offline.includes('/stat/')||!offline.includes('/hitung-cabai/')||!offline.includes('/kamera-pengukur/'))fail('offline fallback links incomplete');
if(!icon.includes('<svg')||!icon.includes('#0d6648'))fail('Agrotik SVG icon invalid');

for(const path of ['index.html','stat/index.html','public/hitung-cabai/index.html','public/kamera-pengukur/index.html','mendeley/index.html','print-skripsi/index.html']){
  const html=fs.readFileSync(path,'utf8');
  if(!html.includes('rel="manifest" href="/manifest.webmanifest"'))fail(path+' missing manifest link');
  if(!html.includes('src="/pwa-register.js"'))fail(path+' missing PWA registration');
}

const sync=fs.readFileSync('src/account-dataset-sync.js','utf8');
if(!sync.includes("navigator.onLine===false")||!sync.includes("window.addEventListener('offline'")||!sync.includes("window.addEventListener('online'"))fail('offline cloud-sync guard missing');

console.log('PWA contract OK: lightweight installable shell, runtime offline cache, header install control, and local-first sync are wired.');
