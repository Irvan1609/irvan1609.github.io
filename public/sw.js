const VERSION='20260926-public-build-1';
const CORE_CACHE='agrotik-core-'+VERSION;
const RUNTIME_CACHE='agrotik-runtime-'+VERSION;
const THIRD_PARTY_CACHE='agrotik-third-party-'+VERSION;
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
async function matchIgnoreSearch(request){
  const direct=await caches.match(request);
  if(direct)return direct;
  const url=new URL(request.url);
  if(!sameOrigin(url))return null;
  url.search='';
  return caches.match(url.href,{ignoreSearch:true});
}
async function navigationResponse(request){
  const cached=await matchIgnoreSearch(request);
  const refresh=fetch(request).then(async response=>{
    if(cacheableResponse(response))await put(RUNTIME_CACHE,request,response);
    return response;
  }).catch(()=>null);
  if(cached){void refresh;return cached;}
  return await refresh||await caches.match('/offline.html')||await caches.match('/');
}
async function staticResponse(request){
  const cached=await matchIgnoreSearch(request);
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
    const names=await caches.keys();
    await Promise.all(names.filter(name=>name.startsWith(CACHE_PREFIX)&&![CORE_CACHE,RUNTIME_CACHE,THIRD_PARTY_CACHE].includes(name)).map(name=>caches.delete(name)));
    await self.clients.claim();
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
});
