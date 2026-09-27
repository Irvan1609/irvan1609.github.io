const VERSION='20260927-resilience-v17';
const CORE_CACHE='agrotik-core-'+VERSION;
const RUNTIME_CACHE='agrotik-runtime-'+VERSION;
const THIRD_PARTY_CACHE='agrotik-third-party-'+VERSION;
const CONTROL_CACHE='agrotik-control';
const ROLLBACK_KEY='/__agrotik_rollback__';
const CACHE_PREFIX='agrotik-';

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
async function rollbackEnabled(){
  try{const cache=await caches.open(CONTROL_CACHE);const response=await cache.match(ROLLBACK_KEY);return response?await response.text()==='1':false;}catch{return false;}
}
async function setRollback(enabled){
  const cache=await caches.open(CONTROL_CACHE);
  if(enabled)await cache.put(ROLLBACK_KEY,new Response('1',{headers:{'Cache-Control':'no-store'}}));
  else await cache.delete(ROLLBACK_KEY);
}
async function previousCacheMatch(request){
  const names=await caches.keys(),groups=['agrotik-core-','agrotik-runtime-','agrotik-third-party-'];
  for(const prefix of groups){
    const candidates=names.filter(name=>name.startsWith(prefix)&&![CORE_CACHE,RUNTIME_CACHE,THIRD_PARTY_CACHE].includes(name)).sort().reverse();
    for(const name of candidates.slice(0,1)){
      const cache=await caches.open(name),direct=await cache.match(request);
      if(direct)return direct;
      try{
        const url=new URL(request.url);url.search='';
        const loose=await cache.match(url.href,{ignoreSearch:true});if(loose)return loose;
      }catch{}
    }
  }
  return null;
}
async function matchIgnoreSearch(request){
  const direct=await caches.match(request);
  if(direct)return direct;
  const url=new URL(request.url);
  if(!sameOrigin(url))return null;
  url.search='';
  return caches.match(url.href,{ignoreSearch:true});
}
async function navigationResponse(request){
  const url=new URL(request.url),networkFirstRoute=url.pathname.startsWith('/game/')||url.pathname.startsWith('/stat/');
  if(await rollbackEnabled()){
    const previous=await previousCacheMatch(request);
    if(previous)return previous;
  }
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
  const url=new URL(request.url),versioned=url.searchParams.has('v');
  if(await rollbackEnabled()){
    const previous=await previousCacheMatch(request);
    if(previous)return previous;
  }
  const cached=versioned?await caches.match(request):await matchIgnoreSearch(request);
  const refresh=fetch(request).then(async response=>{
    if(cacheableResponse(response))await put(RUNTIME_CACHE,request,response);
    return response;
  }).catch(()=>null);
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
      const previous=names.filter(name=>name.startsWith(prefix)&&!keep.has(name)).sort().reverse().slice(0,1);
      previous.forEach(name=>keep.add(name));
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
  if(data.type==='WARM_ROUTE'){
    event.waitUntil(warmResource(data.url||'/'));
    return;
  }
  if(data.type==='SET_ROLLBACK'){
    event.waitUntil((async()=>{
      await setRollback(Boolean(data.enabled));
      const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
      windows.forEach(client=>client.postMessage({type:'AGROTIK_ROLLBACK_STATE',enabled:Boolean(data.enabled)}));
    })());
    return;
  }
  if(data.type==='GET_ROLLBACK'){
    event.waitUntil((async()=>event.source?.postMessage?.({type:'AGROTIK_ROLLBACK_STATE',enabled:await rollbackEnabled()}))());
  }
});
