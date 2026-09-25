const VERSION='20260926-1';
const CORE_CACHE='agrotik-core-'+VERSION;
const RUNTIME_CACHE='agrotik-runtime-'+VERSION;
const THIRD_PARTY_CACHE='agrotik-third-party-'+VERSION;
const CACHE_PREFIX='agrotik-';

const CORE_URLS=[
  '/',
  '/stat/',
  '/hitung-cabai/',
  '/kamera-pengukur/',
  '/mendeley/',
  '/print-skripsi/',
  '/offline.html',
  '/manifest.webmanifest',
  '/pwa-register.js',
  '/subweb-header.css',
  '/account.css?v=20260926-2',
  '/icons/agrotik.svg'
];

const THIRD_PARTY_HOSTS=new Set(['cdn.jsdelivr.net','cdnjs.cloudflare.com']);
const OFFLINE_LIBS=[
  'https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js',
  'https://cdn.jsdelivr.net/npm/jszip@3.10.1/jszip.min.js'
];
const ORT_BASE='https://cdn.jsdelivr.net/npm/onnxruntime-web@1.22.0/dist/';
const ORT_ASSETS=[
  ORT_BASE+'ort.min.js',
  ORT_BASE+'ort-wasm-simd-threaded.mjs',
  ORT_BASE+'ort-wasm-simd-threaded.wasm',
  ORT_BASE+'ort-wasm-simd-threaded.jsep.mjs',
  ORT_BASE+'ort-wasm-simd-threaded.jsep.wasm'
];

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
async function warmResource(input,depth=0,seen=new Set()){
  const url=new URL(input,self.location.origin);
  if(!sameOrigin(url)||skipSameOriginPath(url.pathname)||seen.has(url.href))return;
  seen.add(url.href);
  try{
    const response=await fetch(url.href,{cache:'reload'});
    if(!cacheableResponse(response))return;
    await put(CORE_CACHE,url.href,response);
    if(depth>=3)return;
    const type=response.headers.get('content-type')||'';
    if(!/(text\/html|text\/css|javascript|json)/i.test(type))return;
    const text=await response.clone().text();
    const refs=extractRefs(text,response.url||url.href);
    await Promise.allSettled(refs.map(ref=>warmResource(ref,depth+1,seen)));
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
async function warmChiliOffline(){
  const manifestUrl=new URL('/hitung-cabai/model-manifest.json',self.location.origin);
  let info=null;
  try{
    const response=await fetch(manifestUrl.href,{cache:'reload'});
    if(cacheableResponse(response)){
      await put(CORE_CACHE,manifestUrl.href,response);
      info=await response.clone().json().catch(()=>null);
    }
  }catch{}
  if(info?.enabled&&info.modelUrl){
    try{
      const modelUrl=new URL(info.modelUrl,manifestUrl.href);
      if(sameOrigin(modelUrl)){
        const response=await fetch(modelUrl.href);
        if(cacheableResponse(response))await put(RUNTIME_CACHE,modelUrl.href,response);
      }
    }catch{}
  }
  await Promise.allSettled(ORT_ASSETS.map(cacheExternal));
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
  try{
    const response=await fetch(request);
    if(cacheableResponse(response))await put(RUNTIME_CACHE,request,response);
    return response;
  }catch{
    return await matchIgnoreSearch(request)||await caches.match('/offline.html')||await caches.match('/');
  }
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
    await Promise.allSettled(OFFLINE_LIBS.map(cacheExternal));
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
  if(data.type==='WARM_CHILI'){
    event.waitUntil(warmChiliOffline());
  }
});
