const VERSION='20260928-stat-mobile-dock-nonoverlay-v4';
const CORE_CACHE='agrotik-core-'+VERSION;
const RUNTIME_CACHE='agrotik-runtime-'+VERSION;
const THIRD_PARTY_CACHE='agrotik-third-party-'+VERSION;
const CONTROL_CACHE='agrotik-control';
const CACHE_PREFIX='agrotik-';
let rollbackEnabled=null;

const CORE_URLS=[
  '/',
  '/offline.html',
  '/manifest.webmanifest',
  '/icons/agrotik.svg'
];

const THIRD_PARTY_HOSTS=new Set(['cdn.jsdelivr.net','cdnjs.cloudflare.com']);

function sameOrigin(url){return url.origin===self.location.origin;}
function cacheableResponse(response){return response&&(response.ok||response.type==='opaque');}
function skipSameOriginPath(pathname){
  return pathname==='/sw.js'||pathname.startsWith('/.git/')||pathname.startsWith('/api/');
}
function extractRefs(text,baseUrl){
  const refs=new Set(),patterns=[
    /(?:src|href)\s*=\s*["']([^"'#]+)["']/gi,
    /(?:from\s*|import\s*\(\s*)["']([^"']+)["']/g,
    /import\s*["']([^"']+)["']/g,
    /url\(\s*["']?([^"')#]+)["']?\s*\)/g
  ];
  for(const pattern of patterns){
    let match;
    while((match=pattern.exec(text))){
      try{
        const url=new URL(match[1],baseUrl);
        if(sameOrigin(url)&&!skipSameOriginPath(url.pathname))refs.add(url.href);
      }catch{}
    }
  }
  return [...refs];
}
async function put(cacheName,request,response){
  if(!cacheableResponse(response))return;
  const cache=await caches.open(cacheName);
  await cache.put(request,response.clone());
}
async function warmResource(input){
  const url=new URL(input,self.location.origin);
  if(!sameOrigin(url)||skipSameOriginPath(url.pathname))return;
  try{
    const response=await fetch(url.href);
    if(cacheableResponse(response))await put(CORE_CACHE,url.href,response);
  }catch{}
}
async function cacheExternal(url){
  try{
    const request=new Request(url,{mode:'cors'});
    const response=await fetch(request);
    if(cacheableResponse(response))await put(THIRD_PARTY_CACHE,url,response);
  }catch{
    try{
      const request=new Request(url,{mode:'no-cors'});
      const response=await fetch(request);
      if(cacheableResponse(response))await put(THIRD_PARTY_CACHE,url,response);
    }catch{}
  }
}
async function matchIgnoreSearch(request){
  const direct=await caches.match(request);
  if(direct)return direct;
  const url=new URL(request.url);
  if(!sameOrigin(url))return null;
  url.search='';
  return caches.match(url.href,{ignoreSearch:true});
}
async function rollbackMode(){
  if(rollbackEnabled!==null)return rollbackEnabled;
  try{
    const cache=await caches.open(CONTROL_CACHE),response=await cache.match('/__agrotik_rollback__');
    const data=response?await response.json():null;rollbackEnabled=Boolean(data?.enabled);return rollbackEnabled;
  }catch{rollbackEnabled=false;return false;}
}
async function previousCaches(){
  const names=await caches.keys();
  const runtime=names.filter(name=>name.startsWith('agrotik-runtime-')&&name!==RUNTIME_CACHE).sort().at(-1);
  const core=names.filter(name=>name.startsWith('agrotik-core-')&&name!==CORE_CACHE).sort().at(-1);
  return {runtime,core};
}
async function previousMatch(request){
  const {runtime,core}=await previousCaches();
  for(const name of [runtime,core]){
    if(!name)continue;
    const cache=await caches.open(name),exact=await cache.match(request);
    if(exact)return exact;
    const url=new URL(request.url);url.search='';
    const clean=await cache.match(url.href);if(clean)return clean;
  }
  return null;
}
async function navigationResponse(request){
  if(await rollbackMode()){
    const previous=await previousMatch(request);
    if(previous)return previous;
  }
  const url=new URL(request.url),networkFirstRoute=true;
  const cached=await matchIgnoreSearch(request);
  const refresh=fetch(request).then(async response=>{
    if(cacheableResponse(response))await put(RUNTIME_CACHE,request,response);
    return response;
  }).catch(()=>null);
  if(networkFirstRoute)return await refresh||cached||await caches.match('/offline.html')||await caches.match('/');
  if(cached){void refresh;return cached;}
  return await refresh||await caches.match('/offline.html')||await caches.match('/');
}
async function staticResponse(request){
  if(await rollbackMode()){
    const previous=await previousMatch(request);
    if(previous)return previous;
  }
  const url=new URL(request.url),versioned=url.searchParams.has('v');
  const cached=versioned?await caches.match(request):await matchIgnoreSearch(request);
  const refresh=fetch(request).then(async response=>{
    if(cacheableResponse(response))await put(RUNTIME_CACHE,request,response);
    return response;
  }).catch(()=>null);
  const criticalFresh=(url.pathname.startsWith('/game/')&&url.pathname.endsWith('.js'))||['/account.js','/resilience.js','/pwa-register.js'].includes(url.pathname);
  if(criticalFresh)return await refresh||cached||new Response('',{status:504,statusText:'Offline'});
  if(cached){void refresh;return cached;}
  return await refresh||new Response('',{status:504,statusText:'Offline'});
}
async function thirdPartyResponse(request){
  const cached=await caches.match(request);
  if(cached)return cached;
  try{
    const response=await fetch(request);
    if(cacheableResponse(response))await put(THIRD_PARTY_CACHE,request,response);
    return response;
  }catch{
    return new Response('',{status:504,statusText:'Offline'});
  }
}

self.addEventListener('install',event=>{
  event.waitUntil((async()=>{
    await Promise.allSettled(CORE_URLS.map(url=>warmResource(url)));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate',event=>{
  event.waitUntil((async()=>{
    const names=await caches.keys(),keep=new Set([CORE_CACHE,RUNTIME_CACHE,THIRD_PARTY_CACHE,CONTROL_CACHE]);
    for(const prefix of ['agrotik-core-','agrotik-runtime-','agrotik-third-party-']){
      const previous=names.filter(name=>name.startsWith(prefix)&&!keep.has(name)).sort().at(-1);
      if(previous)keep.add(previous);
    }
    await Promise.all(names.filter(name=>name.startsWith(CACHE_PREFIX)&&!keep.has(name)).map(name=>caches.delete(name)));
    await self.clients.claim();
    const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
    await Promise.allSettled(windows.filter(client=>{
      try{return new URL(client.url).pathname.startsWith('/game/');}catch{return false;}
    }).map(client=>client.navigate(client.url)));
  })());
});

self.addEventListener('fetch',event=>{
  const request=event.request;
  if(request.method!=='GET')return;
  const url=new URL(request.url);

  if(!sameOrigin(url)){
    if(THIRD_PARTY_HOSTS.has(url.hostname))event.respondWith(thirdPartyResponse(request));
    return;
  }
  if(skipSameOriginPath(url.pathname))return;
  if(request.mode==='navigate'){
    event.respondWith(navigationResponse(request));
    return;
  }
  event.respondWith(staticResponse(request));
});

self.addEventListener('message',event=>{
  const data=event.data||{};
  if(data.type==='SKIP_WAITING'){void self.skipWaiting();return;}
  if(data.type==='ROLLBACK_PREVIOUS'){
    rollbackEnabled=Boolean(data.enabled);
    event.waitUntil((async()=>{
      const cache=await caches.open(CONTROL_CACHE);
      await cache.put('/__agrotik_rollback__',new Response(JSON.stringify({enabled:rollbackEnabled,updatedAt:Date.now()}),{headers:{'Content-Type':'application/json'}}));
    })());
    return;
  }
  if(data.type==='WARM_ROUTE'){
    event.waitUntil(warmResource(data.url||'/'));
    return;
  }
});
