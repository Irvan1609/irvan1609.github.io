import {startMusic,stopMusic,setMusicTrack,musicTracks} from './music.js';
const STORAGE='agrotik_field_zero_v1';
const PLOT_COUNT=12,MAX_DAY=12,CROSS_COST=12,PLANT_COST=6;

const $=selector=>document.querySelector(selector);
const clamp=(value,min=0,max=100)=>Math.max(min,Math.min(max,value));
const round=(value,digits=1)=>Number(value.toFixed(digits));
const pick=list=>list[Math.floor(Math.random()*list.length)];
const chance=p=>Math.random()<p;
const uid=prefix=>prefix+'-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,7);
const shuffle=list=>[...list].sort(()=>Math.random()-.5);
const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));

const TRAITS={
  early:{name:'Cepat Berbunga',icon:'⚡',rarity:'common',desc:'Pertumbuhan +16%.',growth:1.16},
  deep:{name:'Akar Dalam',icon:'↧',rarity:'common',desc:'Lebih tahan kekeringan.',droughtRes:.42},
  nue:{name:'Efisien N',icon:'N',rarity:'common',desc:'Kehilangan N lebih lambat.',nLoss:.65,lowNYield:1.1},
  rust:{name:'Tahan Karat',icon:'◈',rarity:'common',desc:'Risiko penyakit lebih rendah.',diseaseRes:.55},
  giant:{name:'Tongkol Besar',icon:'▰',rarity:'common',desc:'Potensi hasil +22%.',yield:1.22,growth:.94},
  prolific:{name:'Prolifik',icon:'✦',rarity:'common',desc:'Potensi hasil +12%.',yield:1.12},
  saver:{name:'Hemat Air',icon:'◇',rarity:'common',desc:'Kehilangan air -28%.',waterLoss:.72},
  plastic:{name:'Plastis',icon:'≈',rarity:'common',desc:'Penalti stres lebih kecil.',stressRes:.34},
  heat:{name:'Tahan Panas',icon:'☀',rarity:'rare',desc:'Panas hampir tidak merusak.',heatRes:.72,yield:1.04},
  vigor:{name:'Vigor Tinggi',icon:'↑',rarity:'rare',desc:'Tumbuh cepat dan pulih baik.',growth:1.1,healthGuard:.25},
  myco:{name:'Mikoriza+',icon:'⌁',rarity:'rare',desc:'Akses air dan N meningkat.',waterLoss:.84,nLoss:.78,yield:1.08},
  sentinel:{name:'Sentinel',icon:'◎',rarity:'rare',desc:'Scout menghasilkan riset ekstra.',scoutRp:2,diseaseRes:.18},
  zero:{name:'Resonansi Zero',icon:'ψ',rarity:'legendary',desc:'Trait misterius Field Zero.',yield:1.3,stressRes:.5,diseaseRes:.3,growth:1.08}
};
const MUTATION_POOL=['heat','vigor','myco','sentinel'];
const STARTER_SEEDS=[
  {id:'seed-aruna',name:'Aruna 01',generation:0,traits:['early','nue'],baseYield:14.5,vigor:1.02,source:'Starter'},
  {id:'seed-savana',name:'Savana D',generation:0,traits:['deep','saver'],baseYield:14,vigor:1,source:'Starter'},
  {id:'seed-rinjani',name:'Rinjani R',generation:0,traits:['rust','plastic'],baseYield:13.5,vigor:1.03,source:'Starter'},
  {id:'seed-bima',name:'Bima Dent',generation:0,traits:['giant','prolific'],baseYield:17,vigor:.94,source:'Starter'}
];
const ENVIRONMENTS=[
  {id:'balanced',name:'Musim Seimbang',icon:'◐',desc:'Tidak ada tekanan dominan.',waterLoss:0,disease:.02,nLoss:0,yield:1},
  {id:'drought',name:'Musim Kering',icon:'☀',desc:'Air cepat hilang; akar dan efisiensi air penting.',waterLoss:-7,disease:-.01,nLoss:0,yield:.96},
  {id:'wet',name:'Musim Basah',icon:'☂',desc:'Air berlimpah, tetapi penyakit mudah berkembang.',waterLoss:5,disease:.08,nLoss:1,yield:1.02},
  {id:'rust',name:'Tekanan Karat',icon:'◉',desc:'Patogen hadir hampir setiap hari.',waterLoss:0,disease:.14,nLoss:0,yield:.98},
  {id:'poorN',name:'Tanah Miskin N',icon:'N',desc:'Nitrogen cepat habis; efisiensi N sangat berharga.',waterLoss:0,disease:.02,nLoss:4,yield:.95},
  {id:'anomaly',name:'Anomali Zero',icon:'ψ',desc:'Lingkungan tidak stabil. Mutasi lebih sering muncul.',waterLoss:-2,disease:.06,nLoss:2,yield:1.08}
];
const WEATHER={
  clear:{name:'Cerah',icon:'☀',water:-9,disease:0,heat:0,effect:'Air -9'},
  hot:{name:'Panas',icon:'♨',water:-17,disease:0,heat:1,effect:'Air -17 · stres panas'},
  rain:{name:'Hujan',icon:'☂',water:22,disease:.035,heat:0,effect:'Air +22'},
  storm:{name:'Hujan lebat',icon:'☈',water:34,disease:.06,heat:0,effect:'Air +34 · risiko rebah'},
  humid:{name:'Lembap',icon:'≋',water:6,disease:.09,heat:0,effect:'Penyakit meningkat'},
  breeze:{name:'Berangin',icon:'↝',water:-12,disease:-.01,heat:0,effect:'Air -12'},
  cool:{name:'Sejuk',icon:'❄',water:-3,disease:.015,heat:0,effect:'Pertumbuhan stabil'}
};
const ACHIEVEMENTS={
  first:{name:'Panen Pertama',desc:'Panen tanaman pertama.'},
  twenty:{name:'20+',desc:'Hasil satu petak mencapai 20.'},
  breeder:{name:'Breeder',desc:'Membuat satu hasil persilangan.'},
  anomaly:{name:'Anomali',desc:'Menemukan trait mutasi.'},
  perfect:{name:'Petak Prima',desc:'Panen dengan kesehatan ≥95.'},
  survivor:{name:'Survivor',desc:'Selesaikan musim bertekanan tinggi.'},
  zero:{name:'Field Zero',desc:'Temukan Resonansi Zero.'}
};
const LORE=[
  'Catatan 03: sensor tanah menangkap pola listrik yang tidak mengikuti kelembapan.',
  'Catatan 11: beberapa akar tumbuh mengarah ke pusat lahan, bukan mengikuti gradien air.',
  'Catatan 17: benih dari petak 07 menunjukkan respons yang tidak muncul pada induknya.',
  'Catatan 24: “Zero” mungkin bukan nama lokasi. Mungkin nama perlakuan yang dihapus dari arsip.'
];
const LOCATIONS={
  zero:{name:'Field Zero',icon:'ψ',desc:'Lahan asal. Seimbang, tetapi anomali dapat muncul.',unlock:0,yield:1,disease:0,waterLoss:0,nLoss:0},
  lowland:{name:'Dataran Rendah',icon:'▱',desc:'Panas dan produktif. Trait tahan panas bernilai tinggi.',unlock:2,yield:1.07,disease:.01,waterLoss:-3,nLoss:0},
  dryland:{name:'Lahan Kering',icon:'△',desc:'Air sangat terbatas, reward riset lebih besar.',unlock:3,yield:1.04,disease:-.02,waterLoss:-7,nLoss:1,rp:1.2},
  paddy:{name:'Sawah Drainase',icon:'≋',desc:'Air cukup, tetapi kelembapan meningkatkan penyakit.',unlock:4,yield:1.09,disease:.05,waterLoss:6,nLoss:1},
  highland:{name:'Dataran Tinggi',icon:'▲',desc:'Sejuk, pertumbuhan lambat, kualitas benih lebih baik.',unlock:5,yield:1.12,disease:.02,waterLoss:1,nLoss:0,quality:1.08}
};
const TECH={
  sensor:{name:'Sensor Tanah',icon:'◉',cost:10,requires:[],desc:'Inspector menampilkan risiko stres lebih jelas.',effect:'sensor'},
  irrigation:{name:'Irigasi Presisi',icon:'💧',cost:16,requires:['sensor'],desc:'Irigasi memberi +50 air dan tidak memakai fokus setiap kedua penggunaan.',effect:'irrigation'},
  precisionN:{name:'Pemupukan Presisi',icon:'N',cost:18,requires:['sensor'],desc:'Biaya pupuk turun menjadi 3 koin dan tambahan N lebih besar.',effect:'precisionN'},
  drone:{name:'Drone Scout',icon:'◇',cost:20,requires:['sensor'],desc:'Scout menghasilkan +2 RP dan peluang membuka mutasi meningkat.',effect:'drone'},
  expedition:{name:'Field Expedition',icon:'↗',cost:22,requires:['sensor'],desc:'Membuka ekspedisi ke lokasi liar.',effect:'expedition'},
  genome:{name:'Genome Lab',icon:'⌬',cost:24,requires:['drone'],desc:'Membuka puzzle genom untuk menemukan trait laten.',effect:'genome'},
  cold:{name:'Cold Storage',icon:'❄',cost:26,requires:['precisionN'],desc:'Kandidat terbaik musim otomatis tersimpan jika vault belum memilikinya.',effect:'cold'},
  breeding:{name:'Marker Breeding',icon:'×',cost:30,requires:['genome'],desc:'Persilangan lebih sering mewarisi trait langka.',effect:'breeding'}
};
const EXPEDITIONS={
  river:{name:'Riparian Strip',icon:'≋',days:2,cost:8,desc:'Cari mikroba dan galur toleran genangan.',traits:['myco','rust'],rewardRp:[4,8]},
  ridge:{name:'Dry Ridge',icon:'△',days:3,cost:10,desc:'Cari akar dalam dan toleransi panas.',traits:['deep','heat'],rewardRp:[6,10]},
  oldlab:{name:'Stasiun Lama',icon:'⌂',days:4,cost:14,desc:'Lokasi eksperimen terbengkalai dengan peluang artefak langka.',traits:['sentinel','vigor','zero'],rewardRp:[8,14]},
  high:{name:'Highland Pocket',icon:'▲',days:3,cost:12,desc:'Cari material adaptif dari suhu rendah.',traits:['plastic','vigor'],rewardRp:[6,11]}
};
const CHALLENGES={
  standard:{name:'Standar',desc:'Tanpa pembatas.',plots:12,maxDay:12,yield:1,reward:1},
  nofert:{name:'Tanpa Pupuk',desc:'Aksi pemupukan dinonaktifkan.',plots:12,maxDay:12,yield:1.12,reward:1.3,noFertilizer:true},
  six:{name:'6 Petak',desc:'Hanya enam petak dapat ditanami.',plots:6,maxDay:12,yield:1.08,reward:1.35},
  sprint:{name:'Sprint 8 Hari',desc:'Musim hanya delapan hari.',plots:12,maxDay:8,yield:1.18,reward:1.45},
  mono:{name:'Satu Varietas',desc:'Hanya benih yang dipilih saat awal run dapat ditanam.',plots:12,maxDay:12,yield:1.1,reward:1.4,mono:true}
};
const BOSSES=[
  {id:'megaDrought',name:'Boss: Kekeringan 47°C',icon:'☀',desc:'Air menghilang sangat cepat selama satu musim.',waterLoss:-12,disease:-.02,nLoss:1,yield:1.18},
  {id:'rustWave',name:'Boss: Gelombang Karat',icon:'◉',desc:'Tekanan penyakit ekstrem dan berulang.',waterLoss:0,disease:.22,nLoss:0,yield:1.2},
  {id:'flood',name:'Boss: Flood Pulse',icon:'☂',desc:'Genangan, kelembapan, dan kehilangan N serempak.',waterLoss:12,disease:.13,nLoss:5,yield:1.22}
];
const RIVALS=[
  {id:'nara',name:'Dr. Nara',style:'Stabil',base:58,growth:5},
  {id:'bima',name:'Bima Lab',style:'Agresif',base:66,growth:6.5},
  {id:'sora',name:'Sora Seed Co.',style:'Breeding',base:62,growth:7.2}
];
const GENOME_SIG={
  heat:['A','T','T','G'],vigor:['G','C','A','G'],myco:['C','G','G','T'],sentinel:['T','A','C','C'],zero:['ψ','A','ψ','G']
};
const META_ACHIEVEMENTS={
  explorer:{name:'Explorer',desc:'Selesaikan ekspedisi pertama.'},
  technologist:{name:'Technologist',desc:'Buka empat teknologi.'},
  boss:{name:'Boss Breaker',desc:'Menang pada Boss Season.'},
  rival:{name:'Peer Review',desc:'Kalahkan rival satu musim.'},
  legacy:{name:'New Game+',desc:'Lakukan prestige pertama.'},
  genome:{name:'Genome Reader',desc:'Selesaikan puzzle Genome Lab.'},
  daily:{name:'Daily Trial',desc:'Selesaikan Daily Seed.'}
};
Object.assign(ACHIEVEMENTS,META_ACHIEVEMENTS);


function focusMax(level){return Math.min(7,4+Math.floor((Math.max(1,level)-1)/3)+(((typeof state!=='undefined'&&state?.legacy)||0)>0?1:0));}
function levelFromXp(xp){return 1+Math.floor(Math.max(0,xp)/120);}
function traitMeta(id){return TRAITS[id]||{name:id,icon:'?',rarity:'common',desc:'Trait tidak dikenal.'};}
function traitValue(traits,key,base=1){
  return traits.reduce((value,id)=>{
    const modifier=traitMeta(id)[key];
    return Number.isFinite(modifier)?value*modifier:value;
  },base);
}
function traitSum(traits,key){
  return traits.reduce((sum,id)=>sum+(Number(traitMeta(id)[key])||0),0);
}
function unique(list){return [...new Set(list)];}

function newEnvironment(season){
  if(season>0&&season%5===0){
    const boss=structuredClone(BOSSES[(Math.floor(season/5)-1)%BOSSES.length]);boss.boss=true;return boss;
  }
  const pool=season>=4?ENVIRONMENTS:ENVIRONMENTS.filter(env=>env.id!=='anomaly');
  return structuredClone(pick(pool));
}
function weatherPool(envId){
  const map={
    balanced:['clear','clear','rain','breeze','cool','humid'],
    drought:['clear','hot','hot','breeze','clear','rain'],
    wet:['rain','rain','humid','storm','cool','clear'],
    rust:['humid','rain','humid','clear','cool','rain'],
    poorN:['clear','breeze','rain','clear','hot','cool'],
    anomaly:['hot','storm','humid','clear','breeze','rain']
  };
  return map[envId]||map.balanced;
}
function rollWeather(env){return pick(weatherPool(env.id));}
function missionFor(season){
  const difficulty=1+Math.floor((season-1)/2);
  return pick([
    {type:'yield',target:55+difficulty*8,text:'Total hasil',unit:'kg'},
    {type:'harvest',target:4+Math.min(3,difficulty),text:'Jumlah panen',unit:'petak'},
    {type:'healthy',target:2+Math.min(3,difficulty),text:'Panen sehat ≥80',unit:'petak'}
  ]);
}
function missionValue(){
  if(state.mission.type==='yield')return state.seasonStats.yield;
  if(state.mission.type==='harvest')return state.seasonStats.harvests;
  return state.seasonStats.healthy;
}
function missionDone(){return missionValue()>=state.mission.target;}

function freshState(){
  const env=newEnvironment(1);
  return {
    version:2,season:1,day:1,maxDay:MAX_DAY,coins:78,rp:0,xp:0,level:1,focus:4,sound:true,musicTrack:'morning',
    field:Array.from({length:PLOT_COUNT},()=>null),vault:structuredClone(STARTER_SEEDS),selectedPlot:0,selectedSeedId:'seed-aruna',
    discoveredTraits:unique(STARTER_SEEDS.flatMap(seed=>seed.traits)),achievements:[],lore:[],
    env,weather:rollWeather(env),mission:missionFor(1),
    seasonStats:{yield:0,harvests:0,healthy:0,maxYield:0,failed:0},seasonBest:null,pendingEvent:null,
    log:[{day:1,text:'Field Zero aktif. Empat galur starter tersedia di Seed Vault.'}],history:[],
    location:'zero',unlockedLocations:['zero'],tech:[],expedition:null,expeditionHistory:[],genomePuzzle:null,
    challenge:'standard',monoSeedId:null,daily:null,legacy:0,legacyScore:0,records:{},lineage:[],eventFlags:{},
    rival:RIVALS[0].id,rivalTarget:0,rivalWins:0,irrigationUses:0,collection:{environments:[],bosses:[],locations:['zero']}
  };
}
function load(){
  try{
    const raw=JSON.parse(localStorage.getItem(STORAGE)||'null');
    if(!raw)return freshState();
    const base=freshState(),hadMusicPreference=Object.prototype.hasOwnProperty.call(raw,'musicTrack'),merged={...base,...raw,version:2};
    if(!hadMusicPreference){merged.musicTrack='morning';merged.sound=true;}
    merged.level=levelFromXp(merged.xp||0);
    if(!Array.isArray(merged.field)||merged.field.length!==PLOT_COUNT)merged.field=Array.from({length:PLOT_COUNT},()=>null);
    if(!Array.isArray(merged.vault)||!merged.vault.length)merged.vault=structuredClone(STARTER_SEEDS);
    merged.tech=Array.isArray(merged.tech)?merged.tech:[];
    merged.unlockedLocations=Array.isArray(merged.unlockedLocations)?merged.unlockedLocations:['zero'];
    merged.lineage=Array.isArray(merged.lineage)?merged.lineage:[];
    merged.records=merged.records&&typeof merged.records==='object'?merged.records:{};
    merged.eventFlags=merged.eventFlags&&typeof merged.eventFlags==='object'?merged.eventFlags:{};
    merged.collection={...base.collection,...(merged.collection||{})};
    merged.challenge=CHALLENGES[merged.challenge]?merged.challenge:'standard';
    merged.location=LOCATIONS[merged.location]?merged.location:'zero';
    merged.maxDay=CHALLENGES[merged.challenge].maxDay;
    merged.focus=Math.min(merged.focus??4,Math.min(7,4+Math.floor((Math.max(1,merged.level)-1)/3)+(merged.legacy>0?1:0)));
    return merged;
  }catch{return freshState();}
}
let state=load(),toastTimer=0,audioContext=null,activeFieldTool='';

function save(){try{localStorage.setItem(STORAGE,JSON.stringify(state));}catch{}}
function beep(freq=420,duration=.045){
  if(!state.sound)return;
  try{
    audioContext??=new (window.AudioContext||window.webkitAudioContext)();
    const osc=audioContext.createOscillator(),gain=audioContext.createGain();
    osc.frequency.value=freq;gain.gain.value=.025;osc.connect(gain);gain.connect(audioContext.destination);osc.start();
    gain.gain.exponentialRampToValueAtTime(.0001,audioContext.currentTime+duration);osc.stop(audioContext.currentTime+duration);
  }catch{}
}
function toast(message){
  const el=$('#toast');el.textContent=message;el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),1800);
}
function addLog(text,day=state.day){
  state.log.unshift({day,text});state.log=state.log.slice(0,28);
}
function awardAchievement(id){
  if(state.achievements.includes(id)||!ACHIEVEMENTS[id])return;
  state.achievements.push(id);state.xp+=25;state.level=levelFromXp(state.xp);toast('Achievement: '+ACHIEVEMENTS[id].name);beep(720,.09);
}
function discoverTrait(id){
  if(!id||state.discoveredTraits.includes(id))return;
  state.discoveredTraits.push(id);state.rp+=3;toast('Trait ditemukan: '+traitMeta(id).name);
  if(id==='zero')awardAchievement('zero');else awardAchievement('anomaly');
}
function gameProfile(){
  const history=state.history||[],historyYield=history.reduce((sum,item)=>sum+(Number(item.yield)||0),0);
  const currentIncluded=history.some(item=>Number(item.season)===Number(state.season));
  const currentYield=currentIncluded?0:(Number(state.seasonStats?.yield)||0);
  const bestYield=Math.max(Number(state.seasonStats?.yield)||0,...history.map(item=>Number(item.yield)||0));
  return {bestYield:round(bestYield,1),season:state.season,level:state.level,legacy:state.legacy||0,location:state.location,xp:state.xp||0,rivalWins:state.rivalWins||0,achievements:state.achievements?.length||0,totalYield:round(historyYield+currentYield,1)};
}
function notifyGameProfile(){
  document.dispatchEvent(new CustomEvent('fieldzero-profile',{detail:gameProfile()}));
}
function applyRemoteBurn(raid){
  const living=state.field.map((crop,index)=>({crop,index})).filter(item=>item.crop&&item.crop.health>0);
  if(!living.length)return false;
  const seed=hashString(raid?.id||String(Date.now())),target=living[Math.floor(seededUnit(seed)*living.length)];
  target.crop.health=Math.max(25,target.crop.health-12);
  target.crop.water=clamp(target.crop.water-10);
  target.crop.stress=clamp(target.crop.stress+10,0,120);
  target.crop.burned=2;
  addLog('🔥 '+String(raid?.attacker?.name||'Teman').slice(0,40)+' membakar ringan P'+String(target.index+1).padStart(2,'0')+'.');
  toast('🔥 P'+String(target.index+1).padStart(2,'0')+' diserang teman');
  beep(220,.09);render();return true;
}
function applyWaterAid(aid){
  const living=state.field.map((crop,index)=>({crop,index})).filter(item=>item.crop&&item.crop.health>0);
  if(!living.length)return false;
  const seed=hashString(aid?.id||String(Date.now())),target=living[Math.floor(seededUnit(seed)*living.length)];
  target.crop.water=clamp(target.crop.water+24);
  target.crop.health=clamp(target.crop.health+4);
  target.crop.stress=Math.max(0,target.crop.stress-5);
  addLog('💧 '+String(aid?.helper?.name||'Teman').slice(0,40)+' membantu P'+String(target.index+1).padStart(2,'0')+'.');
  toast('💧 Bantuan teman masuk ke P'+String(target.index+1).padStart(2,'0'));
  beep(520,.07);render();return true;
}

function hasTech(id){return state.tech.includes(id);}
function activeChallenge(){return CHALLENGES[state.challenge]||CHALLENGES.standard;}
function activeLocation(){return LOCATIONS[state.location]||LOCATIONS.zero;}
function techCount(){return state.tech.length;}
function fieldLimit(){return Math.min(PLOT_COUNT,activeChallenge().plots||PLOT_COUNT);}
function dailyKey(){
  const d=new Date(),y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,'0'),day=String(d.getDate()).padStart(2,'0');
  return y+'-'+m+'-'+day;
}
function hashString(text){
  let h=2166136261;for(const ch of String(text)){h^=ch.charCodeAt(0);h=Math.imul(h,16777619);}return h>>>0;
}
function seededUnit(seed){
  let x=seed>>>0;x+=0x6D2B79F5;x=Math.imul(x^(x>>>15),x|1);x^=x+Math.imul(x^(x>>>7),x|61);return ((x^(x>>>14))>>>0)/4294967296;
}
function dailyDefinition(){
  const key=dailyKey(),seed=hashString('FieldZero:'+key),envs=['drought','wet','rust','poorN','anomaly'];
  const env=ENVIRONMENTS.find(item=>item.id===envs[Math.floor(seededUnit(seed)*envs.length)])||ENVIRONMENTS[0];
  const target=70+Math.floor(seededUnit(seed+17)*45);
  return {key,env:structuredClone(env),target,name:'Daily '+key,challenge:['six','nofert','sprint'][Math.floor(seededUnit(seed+91)*3)]};
}
function currentRival(){
  const found=RIVALS.find(rival=>rival.id===state.rival)||RIVALS[0];return found;
}
function computeRivalTarget(){
  const rival=currentRival(),loc=activeLocation(),challenge=activeChallenge(),boss=state.env?.boss?1.16:1;
  const noise=.92+seededUnit(hashString(state.season+':'+state.location+':'+rival.id))*0.16;
  return round((rival.base+rival.growth*Math.max(0,state.season-1))*loc.yield*challenge.reward*boss*noise,1);
}
function runRecordKey(){
  const mode=state.daily?'daily:'+state.daily.key:state.challenge;
  return state.location+'|'+mode;
}
function recordBest(){
  const key=runRecordKey();return Number(state.records[key]||0);
}
function updateRecord(value){
  const key=runRecordKey(),old=Number(state.records[key]||0);
  if(value>old)state.records[key]=round(value,1);
}
function prestigeAvailable(){return state.season>=6&&state.achievements.length>=4;}
function locationUnlocked(id){return state.unlockedLocations.includes(id);}
function canUnlockLocation(id){
  const loc=LOCATIONS[id];return !!loc&&state.level>=loc.unlock&&!locationUnlocked(id);
}
function unlockLocation(id){
  const loc=LOCATIONS[id];if(!canUnlockLocation(id))return;
  const cost=Math.max(6,loc.unlock*4);if(state.rp<cost){toast('Butuh '+cost+' RP');return;}
  state.rp-=cost;state.unlockedLocations.push(id);state.collection.locations=unique([...(state.collection.locations||[]),id]);toast(loc.name+' terbuka');beep(650,.08);render();
}
function travelLocation(id){
  if(!locationUnlocked(id)||!LOCATIONS[id])return;
  if(state.field.some(Boolean)){toast('Kosongkan lahan sebelum pindah lokasi');return;}
  state.location=id;state.collection.locations=unique([...(state.collection.locations||[]),id]);addLog('Tim pindah ke '+LOCATIONS[id].name+'.');closeMetaModal();render();
}
function techReady(id){
  const tech=TECH[id];return tech&&!hasTech(id)&&tech.requires.every(hasTech)&&state.rp>=tech.cost;
}
function unlockTech(id){
  const tech=TECH[id];if(!tech||hasTech(id))return;
  if(!tech.requires.every(hasTech)){toast('Prasyarat belum terbuka');return;}
  if(state.rp<tech.cost){toast('Butuh '+tech.cost+' RP');return;}
  state.rp-=tech.cost;state.tech.push(id);if(state.tech.length>=4)awardAchievement('technologist');
  addLog('Riset membuka '+tech.name+'.');toast(tech.name+' terbuka');beep(720,.08);render();
}
function challengeCanStart(){return !state.field.some(Boolean)&&state.day===1&&state.seasonStats.harvests===0;}
function startChallenge(id){
  const challenge=CHALLENGES[id];if(!challenge||!challengeCanStart()){toast('Challenge hanya dapat diganti pada awal musim kosong');return;}
  state.challenge=id;state.daily=null;state.maxDay=challenge.maxDay;state.monoSeedId=challenge.mono?state.selectedSeedId:null;
  state.mission=missionFor(state.season);closeMetaModal();addLog('Challenge: '+challenge.name+'.');render();
}
function startDaily(){
  if(!challengeCanStart()){toast('Daily Seed hanya dapat dimulai pada awal musim kosong');return;}
  const daily=dailyDefinition(),stored=state.records['daily:'+daily.key]||0;
  state.daily={key:daily.key,target:daily.target,previous:stored};state.challenge=daily.challenge;state.maxDay=CHALLENGES[daily.challenge].maxDay;
  state.env=daily.env;state.weather=rollWeather(state.env);state.mission={type:'yield',target:daily.target,text:'Daily target',unit:'kg'};
  state.monoSeedId=null;closeMetaModal();addLog('Daily Seed '+daily.key+' dimulai.');render();
}
function doPrestige(){
  if(!prestigeAvailable())return;
  const carry=[...state.vault].sort((a,b)=>b.baseYield-a.baseYield).slice(0,4),legacy=(state.legacy||0)+1,score=(state.legacyScore||0)+Math.round(state.seasonStats.yield+state.history.reduce((sum,item)=>sum+(item.yield||0),0));
  const unlocked=[...state.unlockedLocations],discoveries=[...state.discoveredTraits],achievements=[...state.achievements],tech=[...state.tech].slice(0,Math.min(2+legacy,state.tech.length));
  const next=freshState();next.legacy=legacy;next.legacyScore=score;next.coins=90+legacy*12;next.rp=legacy*5;next.vault=uniqueSeeds([...structuredClone(STARTER_SEEDS),...structuredClone(carry)]);next.unlockedLocations=unlocked;next.discoveredTraits=discoveries;next.achievements=achievements;next.tech=tech;next.collection=structuredClone(state.collection);next.lineage=state.lineage.slice(-40);
  state=next;awardAchievement('legacy');closeMetaModal();$('#recapModal').hidden=true;render();toast('New Game+ '+legacy+' dimulai');
}
function uniqueSeeds(seeds){const seen=new Set();return seeds.filter(seed=>{if(seen.has(seed.id))return false;seen.add(seed.id);return true;});}
function expeditionAvailable(){return hasTech('expedition');}
function startExpedition(id){
  const ex=EXPEDITIONS[id];if(!ex||!expeditionAvailable()||state.expedition)return;
  if(state.coins<ex.cost){toast('Butuh '+ex.cost+' koin');return;}
  state.coins-=ex.cost;state.expedition={id,remaining:ex.days,total:ex.days};addLog('Ekspedisi berangkat ke '+ex.name+'.');render();
}
function tickExpedition(){
  if(!state.expedition)return;
  state.expedition.remaining--;
  if(state.expedition.remaining>0)return;
  const ex=EXPEDITIONS[state.expedition.id],range=ex.rewardRp,reward=range[0]+Math.floor(Math.random()*(range[1]-range[0]+1));
  state.rp+=reward;let note='Ekspedisi kembali: +'+reward+' RP.';
  if(chance(.62)){
    const trait=pick(ex.traits),seed={id:uid('seed'),name:'Wild-'+Math.floor(100+Math.random()*900),generation:0,traits:[trait],baseYield:round(12.5+Math.random()*5.5,1),vigor:round(.96+Math.random()*.14,2),source:'Ekspedisi '+ex.name,parents:[]};
    if(trait==='zero'&&state.season<5)seed.traits=['sentinel'];
    state.vault.push(seed);seed.traits.forEach(discoverTrait);note+=' Benih liar '+seed.name+' ditemukan.';
  }
  if(chance(.3)){const fragment=pick(LORE);if(!state.lore.includes(fragment))state.lore.push(fragment);}
  state.expeditionHistory.unshift({name:ex.name,season:state.season,reward});state.expeditionHistory=state.expeditionHistory.slice(0,8);state.expedition=null;awardAchievement('explorer');addLog(note);toast(note);
}
function makeGenomePuzzle(){
  if(!hasTech('genome'))return null;
  const seed=selectedSeed(),candidates=shuffle(['heat','vigor','myco','sentinel','zero']).slice(0,3);
  const answer=pick(candidates),sig=GENOME_SIG[answer];
  return {id:uid('genome'),seedId:seed.id,answer,candidates,markers:sig.map((base,i)=>chance(.18)&&base!=='ψ'?pick(['A','T','G','C']):base)};
}
function startGenomePuzzle(){
  if(!hasTech('genome')){toast('Buka Genome Lab di Tech Tree');return;}
  if(state.rp<5){toast('Butuh 5 RP untuk sequencing');return;}
  state.rp-=5;state.genomePuzzle=makeGenomePuzzle();renderGenomeLab();save();
}
function solveGenome(choice){
  const puzzle=state.genomePuzzle;if(!puzzle)return;
  if(choice===puzzle.answer){
    const seed=state.vault.find(item=>item.id===puzzle.seedId),trait=choice;
    if(seed&&!seed.traits.includes(trait)){seed.traits.push(trait);discoverTrait(trait);}
    state.rp+=8;state.xp+=35;awardAchievement('genome');toast('Lokus cocok: '+traitMeta(trait).name);
  }else{toast('Marker tidak cocok. Data tersimpan untuk percobaan berikutnya.');state.rp+=1;}
  state.genomePuzzle=null;render();beep(choice===puzzle.answer?760:250,.09);
}
function lineageNode(seed){
  return {id:seed.id,name:seed.name,generation:seed.generation||0,parents:[...(seed.parents||[])],traits:[...(seed.traits||[])],source:seed.source||''};
}
function rememberLineage(seed){
  const node=lineageNode(seed),i=state.lineage.findIndex(item=>item.id===node.id);if(i>=0)state.lineage[i]=node;else state.lineage.push(node);state.lineage=state.lineage.slice(-100);
}
function applyLocationToEnv(env){
  const loc=activeLocation();env.waterLoss=(env.waterLoss||0)+(loc.waterLoss||0);env.disease=(env.disease||0)+(loc.disease||0);env.nLoss=(env.nLoss||0)+(loc.nLoss||0);env.yield=(env.yield||1)*(loc.yield||1);return env;
}
function rivalName(){return currentRival().name;}

function selectedSeed(){return state.vault.find(seed=>seed.id===state.selectedSeedId)||state.vault[0];}
function selectedCrop(){return state.field[state.selectedPlot]||null;}
function allCropTraits(crop){return unique([...(crop?.seed?.traits||[]),...(crop?.mutation?[crop.mutation]:[])]);}
function stageOf(crop){
  if(!crop)return 'Kosong';
  if(crop.health<=0)return 'Mati';
  if(crop.growth>=100)return 'Siap panen';
  if(crop.growth>=78)return 'Pengisian';
  if(crop.growth>=52)return 'Berbunga';
  if(crop.growth>=22)return 'Vegetatif';
  return 'Bibit';
}
function cropIcon(crop){
  if(!crop)return '＋';
  if(crop.health<=0)return '✕';
  if(crop.growth>=100)return '🌽';
  if(crop.growth>=52)return '🌾';
  if(crop.growth>=22)return '🌿';
  return '🌱';
}
function statusClass(crop){
  if(!crop)return 'empty';
  if(crop.growth>=100&&crop.health>0)return 'ready';
  if(crop.disease>=35)return 'sick';
  if(crop.health<60||crop.water<24||crop.n<22)return 'stressed';
  return '';
}
function toolLabel(tool){
  return ({plant:'Tanam',water:'Air',fertilize:'Pupuk',scout:'Periksa'})[tool]||'';
}
function playHint(){
  if(activeFieldTool)return {icon:'→',text:toolLabel(activeFieldTool)+' aktif · pilih petak',action:'field'};
  const ready=state.field.findIndex(crop=>crop&&crop.health>0&&crop.growth>=100);
  if(ready>=0)return {icon:'🌽',text:'Panen P'+String(ready+1).padStart(2,'0'),action:'plot',index:ready};
  const lowWater=state.field.findIndex(crop=>crop&&crop.health>0&&crop.water<28);
  if(lowWater>=0)return {icon:'💧',text:'P'+String(lowWater+1).padStart(2,'0')+' butuh air',action:'tool',tool:'water'};
  const lowN=state.field.findIndex(crop=>crop&&crop.health>0&&crop.n<28);
  if(lowN>=0&&!activeChallenge().noFertilizer)return {icon:'N',text:'P'+String(lowN+1).padStart(2,'0')+' butuh pupuk',action:'tool',tool:'fertilize'};
  const sick=state.field.findIndex(crop=>crop&&crop.health>0&&crop.disease>28);
  if(sick>=0)return {icon:'◎',text:'Cek P'+String(sick+1).padStart(2,'0'),action:'tool',tool:'scout'};
  if(!state.field.slice(0,fieldLimit()).some(Boolean))return {icon:'🌱',text:'Tanam di petak kosong',action:'tool',tool:'plant'};
  if(state.day>=state.maxDay)return {icon:'✓',text:'Musim selesai · lihat hasil',action:'finish'};
  return {icon:'→',text:'Lanjut ke hari '+(state.day+1),action:'next'};
}
function renderPlayControls(){
  const seed=selectedSeed(),hint=playHint();
  $('#selectedSeedName').textContent=seed?.name||'Pilih benih';
  $('#activeToolStatus').textContent=activeFieldTool?toolLabel(activeFieldTool)+' aktif · ketuk beberapa petak':'Ketuk alat → petak';
  $('#playHintIcon').textContent=hint.icon;$('#playHintText').textContent=hint.text;
  $('#playHint').dataset.action=hint.action||'';
  $('#playHint').dataset.tool=hint.tool||'';
  $('#playHint').dataset.index=Number.isInteger(hint.index)?String(hint.index):'';
}
function runPlayHint(){
  const hint=playHint();
  if(hint.action==='tool'){setFieldTool(hint.tool);document.querySelector('.field-panel')?.scrollIntoView({behavior:'smooth',block:'start'});return;}
  if(hint.action==='plot'&&Number.isInteger(hint.index)){state.selectedPlot=hint.index;renderField();renderInspector();document.querySelector('.field-panel')?.scrollIntoView({behavior:'smooth',block:'start'});return;}
  if(hint.action==='next'){advanceDay();return;}
  if(hint.action==='finish'){finishSeason();return;}
  document.querySelector('.field-panel')?.scrollIntoView({behavior:'smooth',block:'start'});
}
function openSeedVault(){
  const hub=$('#labHub');hub.open=true;hub.scrollIntoView({behavior:'smooth',block:'start'});
  setTimeout(()=>document.querySelector('.vault-panel')?.scrollIntoView({behavior:'smooth',block:'center'}),120);
}
function openGameHelp(){
  openMetaModal('CARA MAIN','3 langkah',`<div class="help-steps">
    <div><b>1</b><span>🌱 Pilih benih</span></div>
    <div><b>2</b><span>Alat → petak</span></div>
    <div><b>3</b><span>Hari berikutnya</span></div>
  </div><p class="help-note">PC: alat/benih juga bisa diseret ke petak.</p>`);
}

function seedTraitsHtml(seed,extra=[]){
  return unique([...(seed?.traits||[]),...extra]).map(id=>{
    const t=traitMeta(id);return `<span class="trait ${t.rarity}">${esc(t.icon)} ${esc(t.name)}</span>`;
  }).join('');
}

function renderHud(){
  state.level=levelFromXp(state.xp);
  $('#seasonValue').textContent=state.season;
  $('#dayValue').textContent=state.day+'/'+state.maxDay;
  $('#coinValue').textContent=Math.round(state.coins);
  $('#focusValue').textContent=state.focus+'/'+focusMax(state.level);
  $('#rpValue').textContent=Math.round(state.rp);
  $('#levelValue').textContent=state.level;
  const progress=state.xp%120;$('#xpValue').textContent=progress+'/120';$('#xpBar').style.width=(progress/120*100)+'%';
  $('#soundToggle').setAttribute('aria-pressed',String(state.sound));
}
function renderSeason(){
  $('#seasonIcon').textContent=state.env.icon;$('#seasonName').textContent=state.env.name;$('#seasonDesc').textContent=state.env.desc;
  $('#weatherText').textContent=WEATHER[state.weather].icon+' '+WEATHER[state.weather].name;$('#weatherEffect').textContent=WEATHER[state.weather].effect;
  $('#missionText').textContent=state.mission.text+' '+state.mission.target+' '+state.mission.unit;
  const value=round(missionValue(),1);$('#missionProgress').textContent=value+'/'+state.mission.target+(missionDone()?' ✓':'');
  $('#finishSeason').hidden=state.day<state.maxDay;$('#nextDay').hidden=state.day>=state.maxDay;
}
function renderField(){
  const limit=fieldLimit();
  $('#fieldGrid').innerHTML=state.field.map((crop,index)=>{
    const cls=statusClass(crop),selected=index===state.selectedPlot?' selected':'',burned=crop?.burned>0?' burned':'';
    if(index>=limit)return `<button type="button" class="plot plot-locked" data-plot="${index}" disabled aria-label="Petak ${index+1}, dikunci challenge"><div class="plot-top"><span>P${String(index+1).padStart(2,'0')}</span><span>LOCK</span></div><div class="plot-empty-mark">×</div></button>`;
    if(!crop)return `<button type="button" class="plot empty${selected}" data-plot="${index}" aria-label="Petak ${index+1}, kosong"><div class="plot-top"><span>P${String(index+1).padStart(2,'0')}</span><span>KOSONG</span></div><div class="plot-empty-mark">＋</div></button>`;
    const stage=stageOf(crop);
    return `<button type="button" class="plot ${cls}${burned}${selected}" data-plot="${index}" aria-label="Petak ${index+1}, ${esc(crop.seed.name)}, ${esc(stage)}"><div class="plot-top"><span>P${String(index+1).padStart(2,'0')}</span><span>H${crop.age}</span></div><div class="plot-crop"><span class="plant-icon">${cropIcon(crop)}</span><div><b>${esc(crop.seed.name)}</b><small>${esc(stage)} · ${Math.round(crop.growth)}%</small></div></div><div class="plot-health"><i style="width:${crop.health}%"></i></div><div class="plot-bars"><span class="mini-meter"><i style="width:${crop.water}%"></i></span><span class="mini-meter n"><i style="width:${crop.n}%"></i></span></div>${crop.revealed&&crop.mutation?`<span class="trait ${traitMeta(crop.mutation).rarity}" title="Mutasi">${traitMeta(crop.mutation).icon}</span>`:''}</button>`;
  }).join('');
}
function renderInspector(){
  const crop=selectedCrop(),plot=state.selectedPlot+1;
  $('#plotTitle').textContent='Petak '+String(plot).padStart(2,'0');
  $('#plotStage').textContent=stageOf(crop);
  if(!crop){
    const seed=selectedSeed();
    const locked=state.selectedPlot>=fieldLimit(),mono=activeChallenge().mono&&state.monoSeedId&&seed.id!==state.monoSeedId;
    $('#inspectorBody').innerHTML=`<div class="seed-picker"><label>Benih<select id="seedSelect">${state.vault.map(item=>`<option value="${esc(item.id)}" ${item.id===seed.id?'selected':''}>${esc(item.name)} · G${item.generation}</option>`).join('')}</select></label><div class="seed-card-preview"><b>${esc(seed.name)}</b><p>Potensi ${seed.baseYield.toFixed(1)} · G${seed.generation}</p><div class="trait-row">${seedTraitsHtml(seed)}</div></div><button id="plantSelected" class="primary" type="button" ${state.focus<1||state.coins<PLANT_COST||locked||mono?'disabled':''}>${locked?'Petak terkunci':mono?'Satu varietas':`Tanam · ${PLANT_COST}`}</button></div>`;
    $('#seedSelect').onchange=event=>{state.selectedSeedId=event.target.value;save();renderInspector();renderVault();};
    $('#plantSelected').onclick=plantSelected;
    return;
  }
  const knownExtra=crop.revealed&&crop.mutation?[crop.mutation]:[];
  const mutationText=crop.mutation?(crop.revealed?traitMeta(crop.mutation).name:'Belum diketahui'):'Tidak terdeteksi';
  const fertilizerCost=hasTech('precisionN')?3:5,waterFocus=hasTech('irrigation')&&state.irrigationUses%2===1?0:1,scoutReward=2+(hasTech('drone')?2:0);
  $('#inspectorBody').innerHTML=`<div class="crop-stats"><div class="stat-box"><span>Kesehatan</span><b>${Math.round(crop.health)}%</b></div><div class="stat-box"><span>Air</span><b>${Math.round(crop.water)}%</b></div><div class="stat-box"><span>Nitrogen</span><b>${Math.round(crop.n)}%</b></div><div class="stat-box"><span>Penyakit</span><b>${Math.round(crop.disease)}%</b></div></div><div class="seed-card-preview"><b>${esc(crop.seed.name)} · G${crop.seed.generation}</b><p>Stres ${Math.round(crop.stress)}${hasTech('sensor')?` · risiko ${crop.water<25||crop.n<25||crop.disease>35?'TINGGI':'rendah'}`:''} · anomali: ${esc(mutationText)}</p><div class="trait-row">${seedTraitsHtml(crop.seed,knownExtra)}</div></div><div class="action-grid"><button data-crop-action="water" ${state.focus<waterFocus||crop.health<=0?'disabled':''}>💧 Irigasi · ${waterFocus} fokus</button><button data-crop-action="fertilize" ${activeChallenge().noFertilizer||state.focus<1||state.coins<fertilizerCost||crop.health<=0?'disabled':''}>N Pupuk · ${fertilizerCost} koin</button><button class="scout" data-crop-action="scout" ${state.focus<1||crop.health<=0?'disabled':''}>◎ Periksa · +${scoutReward} RP</button>${crop.health<=0?'<button data-crop-action="remove">Bersihkan petak</button>':crop.growth>=100?'<button class="harvest" data-crop-action="harvest">Panen sekarang</button>':''}</div><p class="action-note">Tumbuh ${Math.round(crop.growth)}%</p>`;
  $('#inspectorBody').querySelectorAll('[data-crop-action]').forEach(button=>button.onclick=()=>cropAction(button.dataset.cropAction));
}
function renderVault(){
  $('#vaultCount').textContent=state.vault.length;
  $('#vaultList').innerHTML=state.vault.map(seed=>`<article class="seed-item ${seed.id===state.selectedSeedId?'active':''}" draggable="true" data-seed-drag="${esc(seed.id)}"><div class="seed-item-head"><b>${esc(seed.name)}</b><small>G${seed.generation}</small></div><small>${seed.baseYield.toFixed(1)} potensi</small><div class="trait-row">${seedTraitsHtml(seed)}</div><div class="seed-card-actions"><button type="button" data-use-seed="${esc(seed.id)}">${seed.id===state.selectedSeedId?'✓ Dipilih':'Pilih'}</button><button type="button" data-rename-seed="${esc(seed.id)}" title="Nama varietas">✎</button></div></article>`).join('');
  const opts=state.vault.map(seed=>`<option value="${esc(seed.id)}">${esc(seed.name)} · G${seed.generation}</option>`).join('');
  const a=$('#parentA'),b=$('#parentB'),av=a.value,bv=b.value;a.innerHTML='<option value="">Pilih</option>'+opts;b.innerHTML='<option value="">Pilih</option>'+opts;
  if(state.vault.some(seed=>seed.id===av))a.value=av;if(state.vault.some(seed=>seed.id===bv))b.value=bv;
  $('#crossSeeds').disabled=state.rp<CROSS_COST||!a.value||!b.value||a.value===b.value;
}
function renderLog(){
  $('#gameLog').innerHTML=state.log.map(row=>`<div class="log-row"><time>H${row.day}</time><span>${esc(row.text)}</span></div>`).join('');
}
function renderDiscoveries(){
  const traitCards=Object.entries(TRAITS).map(([id,t])=>`<div class="discovery ${state.discoveredTraits.includes(id)?'':'locked'}"><b>${state.discoveredTraits.includes(id)?esc(t.icon+' '+t.name):'?'}</b><span>${state.discoveredTraits.includes(id)?esc(t.desc):'Belum ditemukan'}</span></div>`).join('');
  const achCards=Object.entries(ACHIEVEMENTS).map(([id,a])=>`<div class="discovery ${state.achievements.includes(id)?'':'locked'}"><b>${state.achievements.includes(id)?'◆ '+esc(a.name):'◇ ???'}</b><span>${state.achievements.includes(id)?esc(a.desc):'Achievement terkunci'}</span></div>`).join('');
  const lore=state.lore.length?`<div class="discovery-grid">${state.lore.map(text=>`<div class="discovery"><b>Fragment</b><span>${esc(text)}</span></div>`).join('')}</div>`:'';
  $('#discoveries').innerHTML=`<div class="collection-toolbar"><button id="openCollectionBook" type="button">Buka Koleksi</button><span>${state.discoveredTraits.length} trait · ${state.achievements.length} achievement</span></div><div class="discovery-grid">${traitCards+achCards}</div>${lore}`;
  $('#openCollectionBook').onclick=openCollectionBook;
  $('#discoveryCount').textContent=(state.discoveredTraits.length+state.achievements.length);
}
function renderMetaStrip(){
  const loc=activeLocation(),challenge=activeChallenge(),rival=currentRival();
  $('#locationName').textContent=loc.icon+' '+loc.name;
  $('#runModeName').textContent=state.daily?'Daily Seed':challenge.name;
  $('#runModeHint').textContent=state.daily?state.daily.key:challenge.desc;
  $('#rivalName').textContent=rival.name;state.rivalTarget=computeRivalTarget();$('#rivalScore').textContent='Target '+state.rivalTarget+' kg';
  const ghost=recordBest();$('#ghostScore').textContent=ghost?ghost.toFixed(1)+' kg':'Belum ada';
  $('#legacyValue').textContent=state.legacy||0;
}
function renderTechTree(){
  $('#techCount').textContent=state.tech.length+'/'+Object.keys(TECH).length;
  $('#techTree').innerHTML=Object.entries(TECH).map(([id,tech])=>{
    const owned=hasTech(id),requiresOk=tech.requires.every(hasTech),ready=techReady(id);
    return `<button type="button" class="tech-node ${owned?'owned':requiresOk?'available':'locked'}" data-tech="${id}" ${owned||!requiresOk?'disabled':''}><span>${tech.icon}</span><b>${esc(tech.name)}</b><small>${owned?'Aktif':tech.cost+' RP'}</small></button>`;
  }).join('');
  $('#techTree').querySelectorAll('[data-tech]').forEach(button=>button.onclick=()=>unlockTech(button.dataset.tech));
}
function renderExpedition(){
  const host=$('#expeditionPanel');
  if(!expeditionAvailable()){host.innerHTML='<div class="meta-empty">Buka <b>Ekspedisi</b> di Teknologi.</div>';$('#expeditionStatus').textContent='Terkunci';return;}
  if(state.expedition){
    const ex=EXPEDITIONS[state.expedition.id],done=state.expedition.total-state.expedition.remaining;
    $('#expeditionStatus').textContent=state.expedition.remaining+' hari';
    host.innerHTML=`<div class="expedition-running"><b>${ex.icon} ${esc(ex.name)}</b><span>${esc(ex.desc)}</span><div class="progress-track"><i style="width:${done/state.expedition.total*100}%"></i></div><small>Bergerak setiap Hari berikutnya.</small></div>`;return;
  }
  $('#expeditionStatus').textContent='Siap';
  host.innerHTML=`<div class="expedition-list">${Object.entries(EXPEDITIONS).map(([id,ex])=>`<button type="button" data-expedition="${id}" ${state.coins<ex.cost?'disabled':''}><span>${ex.icon}</span><b>${esc(ex.name)}</b><small>${ex.days} hari · ${ex.cost} koin</small></button>`).join('')}</div>`;
  host.querySelectorAll('[data-expedition]').forEach(button=>button.onclick=()=>startExpedition(button.dataset.expedition));
}
function renderGenomeLab(){
  const host=$('#genomeLab');
  if(!hasTech('genome')){host.innerHTML='<div class="meta-empty">Genome Lab tersedia setelah riset <b>Genome Lab</b>.</div>';$('#genomeStatus').textContent='Terkunci';return;}
  $('#genomeStatus').textContent=state.genomePuzzle?'Sequencing':'Siap';
  if(!state.genomePuzzle){
    host.innerHTML=`<div class="genome-start"><span>⌬</span><div><b>Decode ${esc(selectedSeed().name)}</b><small>5 RP · baca marker dan pilih trait laten yang paling cocok.</small></div><button id="startGenome" type="button" ${state.rp<5?'disabled':''}>Scan</button></div>`;
    $('#startGenome').onclick=startGenomePuzzle;return;
  }
  const p=state.genomePuzzle;
  host.innerHTML=`<div class="genome-puzzle"><div class="genome-markers">${p.markers.map(base=>`<b>${esc(base)}</b>`).join('')}</div><small>Cocokkan marker hasil sequencing dengan pola referensi. Satu marker dapat mengalami noise.</small><div class="genome-choices">${p.candidates.map(id=>`<button type="button" data-genome-choice="${id}"><b>${esc(traitMeta(id).icon+' '+traitMeta(id).name)}</b><small>${esc(GENOME_SIG[id].join(' · '))}</small></button>`).join('')}</div></div>`;
  host.querySelectorAll('[data-genome-choice]').forEach(button=>button.onclick=()=>solveGenome(button.dataset.genomeChoice));
}
function renderEvolution(){
  STARTER_SEEDS.forEach(rememberLineage);state.vault.forEach(rememberLineage);
  const recent=[...state.lineage].sort((a,b)=>b.generation-a.generation).slice(0,8);
  $('#evolutionPreview').innerHTML=recent.map(node=>`<div class="evolution-node"><span>G${node.generation}</span><b>${esc(node.name)}</b><small>${node.parents?.length?node.parents.length+' induk':esc(node.source||'Founder')}</small></div>`).join('')||'<div class="meta-empty">Belum ada silsilah.</div>';
}
function renderMeta(){
  renderMetaStrip();renderTechTree();renderExpedition();renderGenomeLab();renderEvolution();
}
function openMetaModal(kicker,title,html){
  $('#metaModalKicker').textContent=kicker;$('#metaModalTitle').textContent=title;$('#metaModalBody').innerHTML=html;$('#metaModal').hidden=false;
}
function closeMetaModal(){$('#metaModal').hidden=true;}
function worldMapHtml(){
  return `<div class="world-map">${Object.entries(LOCATIONS).map(([id,loc])=>{
    const unlocked=locationUnlocked(id),active=id===state.location,cost=Math.max(6,loc.unlock*4);
    return `<article class="world-node ${active?'active':''} ${unlocked?'unlocked':'locked'}"><span>${loc.icon}</span><div><b>${esc(loc.name)}</b><small>${esc(loc.desc)}</small></div>${active?'<em>AKTIF</em>':unlocked?`<button data-travel="${id}">Pindah</button>`:`<button data-unlock-location="${id}" ${canUnlockLocation(id)&&state.rp>=cost?'':'disabled'}>Buka · ${cost} RP</button>`}</article>`;
  }).join('')}</div>`;
}
function openWorldMap(){
  openMetaModal('WORLD MAP','Wilayah penelitian',worldMapHtml());
  $('#metaModalBody').querySelectorAll('[data-travel]').forEach(button=>button.onclick=()=>travelLocation(button.dataset.travel));
  $('#metaModalBody').querySelectorAll('[data-unlock-location]').forEach(button=>button.onclick=()=>{unlockLocation(button.dataset.unlockLocation);openWorldMap();});
}
function challengeHtml(){
  const daily=dailyDefinition();
  return `<div class="challenge-grid">${Object.entries(CHALLENGES).map(([id,ch])=>`<button data-challenge="${id}" class="${state.challenge===id&&!state.daily?'active':''}"><b>${esc(ch.name)}</b><span>${esc(ch.desc)}</span><small>Reward ×${ch.reward}</small></button>`).join('')}</div><div class="daily-card"><span>DAILY SEED</span><b>${daily.key}</b><p>Kondisi dan target sama untuk tanggal ini di perangkat mana pun.</p><button data-daily-start ${challengeCanStart()?'':'disabled'}>Mulai Daily</button></div>`;
}
function openChallenges(){
  openMetaModal('RUN MODES','Challenge & Daily Seed',challengeHtml());
  $('#metaModalBody').querySelectorAll('[data-challenge]').forEach(button=>button.onclick=()=>startChallenge(button.dataset.challenge));
  $('#metaModalBody').querySelector('[data-daily-start]')?.addEventListener('click',startDaily);
}
function openRival(){
  openMetaModal('RIVAL SCIENTIST','Kompetitor musim ini',`<div class="rival-grid">${RIVALS.map(r=>`<button data-rival="${r.id}" class="${state.rival===r.id?'active':''}"><b>${esc(r.name)}</b><span>${esc(r.style)}</span><small>Target saat ini ≈ ${round((r.base+r.growth*Math.max(0,state.season-1))*activeLocation().yield,1)} kg</small></button>`).join('')}</div><p class="meta-note">Rival dihitung offline dari musim, lokasi, dan gaya riset. Tidak memakai AI/server.</p>`);
  $('#metaModalBody').querySelectorAll('[data-rival]').forEach(button=>button.onclick=()=>{state.rival=button.dataset.rival;closeMetaModal();render();});
}
function openRecords(){
  const rows=Object.entries(state.records).sort((a,b)=>b[1]-a[1]);
  openMetaModal('GHOST RECORD','Rekor run pribadi',rows.length?`<div class="record-list">${rows.map(([key,value])=>`<div><b>${esc(key)}</b><span>${Number(value).toFixed(1)} kg</span></div>`).join('')}</div>`:'<div class="meta-empty">Selesaikan musim untuk membuat Ghost Record.</div>');
}
function openPrestige(){
  openMetaModal('NEW GAME+','Legacy Program',`<div class="prestige-card"><span>LEGACY ${state.legacy||0}</span><b>${prestigeAvailable()?'Prestige tersedia':'Belum tersedia'}</b><p>Mulai ulang musim dengan membawa galur terbaik, lokasi yang telah terbuka, koleksi, dan sebagian teknologi. Membutuhkan musim ≥6 dan 4 achievement.</p><div class="prestige-stats"><span>Legacy score <b>${state.legacyScore||0}</b></span><span>Musim <b>${state.season}</b></span><span>Achievement <b>${state.achievements.length}</b></span></div><button data-prestige ${prestigeAvailable()?'':'disabled'}>Mulai New Game+</button></div>`);
  $('#metaModalBody').querySelector('[data-prestige]')?.addEventListener('click',()=>{if(confirm('Mulai New Game+ dan reset run aktif?'))doPrestige();});
}
function openEvolution(){
  const nodes=[...state.lineage].sort((a,b)=>a.generation-b.generation);
  openMetaModal('EVOLUTION TREE','Silsilah benih',`<div class="lineage-tree">${nodes.map(node=>`<article><span>G${node.generation}</span><div><b>${esc(node.name)}</b><small>${node.parents?.length?'Induk: '+node.parents.map(id=>state.lineage.find(n=>n.id===id)?.name||id).join(' × '):esc(node.source||'Founder')}</small><div class="trait-row">${node.traits.map(id=>`<span class="trait ${traitMeta(id).rarity}">${esc(traitMeta(id).name)}</span>`).join('')}</div></div></article>`).join('')}</div>`);
}
function openCollectionBook(){
  const envs=unique(state.collection.environments||[]),bosses=unique(state.collection.bosses||[]),locations=unique(state.collection.locations||[]);
  openMetaModal('COLLECTION BOOK','Field Codex',`<div class="codex-grid"><div><small>Trait</small><b>${state.discoveredTraits.length}/${Object.keys(TRAITS).length}</b></div><div><small>Achievement</small><b>${state.achievements.length}/${Object.keys(ACHIEVEMENTS).length}</b></div><div><small>Lingkungan</small><b>${envs.length}/${ENVIRONMENTS.length}</b></div><div><small>Boss</small><b>${bosses.length}/${BOSSES.length}</b></div><div><small>Lokasi</small><b>${locations.length}/${Object.keys(LOCATIONS).length}</b></div><div><small>Benih</small><b>${state.vault.length}</b></div></div><div class="codex-list">${locations.map(id=>`<span>${LOCATIONS[id]?.icon||'•'} ${esc(LOCATIONS[id]?.name||id)}</span>`).join('')}${envs.map(id=>`<span>${esc(ENVIRONMENTS.find(e=>e.id===id)?.name||id)}</span>`).join('')}${bosses.map(id=>`<span>${esc(BOSSES.find(e=>e.id===id)?.name||id)}</span>`).join('')}</div>`);
}
function openQuickMore(){
  openMetaModal('MENU','Lainnya',`<div class="quick-menu-grid">
    <button data-quick-more="run">⚑<span>Challenge</span></button>
    <button data-quick-more="rival">⚔<span>Rival</span></button>
    <button data-quick-more="record">◷<span>Rekor</span></button>
    <button data-quick-more="legacy">↺<span>Legacy</span></button>
    <button data-quick-more="collection">◆<span>Koleksi</span></button>
    <button data-quick-more="music">♫<span>Musik</span></button>
  </div>`);
  $('#metaModalBody').querySelectorAll('[data-quick-more]').forEach(button=>button.onclick=()=>{
    const key=button.dataset.quickMore;
    if(key==='run')openChallenges();
    if(key==='rival')openRival();
    if(key==='record')openRecords();
    if(key==='legacy')openPrestige();
    if(key==='collection')openCollectionBook();
    if(key==='music')openMusicPicker();
  });
}
function openMusicPicker(){
  openMetaModal('MUSIK','Musik Field Zero',`<div class="music-picker">${musicTracks().map(track=>`<button type="button" data-music-track="${track.id}" class="${state.musicTrack===track.id?'active':''}"><b>♫ ${esc(track.name)}</b><span>${esc(track.subtitle)}</span></button>`).join('')}</div>`);
  $('#metaModalBody').querySelectorAll('[data-music-track]').forEach(button=>button.onclick=()=>{
    state.musicTrack=button.dataset.musicTrack;state.sound=true;save();setMusicTrack(state.musicTrack);startMusic(state.musicTrack);renderHud();openMusicPicker();
  });
}
function setFieldTool(tool=''){
  activeFieldTool=activeFieldTool===tool?'':tool;
  document.querySelectorAll('[data-field-tool]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.fieldTool===activeFieldTool)));
  renderPlayControls();
  if(activeFieldTool)toast(toolLabel(activeFieldTool)+' aktif · ketuk beberapa petak');
}
function useFieldTool(tool,index,{seedId=''}={}){
  if(index<0||index>=fieldLimit())return false;
  state.selectedPlot=index;
  if(seedId){const seed=state.vault.find(item=>item.id===seedId);if(seed)state.selectedSeedId=seed.id;}
  if(tool==='plant'){plantSelected();return true;}
  if(!state.field[index]){toast('Petak kosong');renderField();renderInspector();return false;}
  if(['water','fertilize','scout'].includes(tool)){cropAction(tool);return true;}
  return false;
}


function render(){
  renderHud();renderSeason();renderField();renderInspector();renderVault();renderLog();renderDiscoveries();renderMeta();renderPlayControls();save();
  if(state.pendingEvent)renderEvent();
}

function plantSelected(){
  const seed=selectedSeed(),challenge=activeChallenge();
  if(!seed||state.field[state.selectedPlot]||state.selectedPlot>=fieldLimit()||state.focus<1||state.coins<PLANT_COST)return;
  if(challenge.mono&&state.monoSeedId&&seed.id!==state.monoSeedId){toast('Challenge hanya mengizinkan satu varietas');return;}
  const mutationChance=Math.min(.18,.045+state.level*.004+(state.env.id==='anomaly'?.05:0)+(hasTech('genome')?.02:0));
  let mutation=null;
  if(chance(mutationChance)){
    const pool=MUTATION_POOL.filter(id=>!seed.traits.includes(id));mutation=pool.length?pick(pool):null;
    if((state.env.id==='anomaly'||state.env.boss)&&state.season>=4&&chance(.08))mutation='zero';
  }
  rememberLineage(seed);
  state.field[state.selectedPlot]={
    seed:structuredClone(seed),age:0,growth:3,health:100,water:62,n:58,disease:0,stress:0,mutation,revealed:false,scouted:0,stressLog:{water:0,n:0,disease:0,heat:0,burn:0}
  };
  state.coins-=PLANT_COST;state.focus--;addLog('P'+String(state.selectedPlot+1).padStart(2,'0')+': '+seed.name+' ditanam.');beep(410);render();document.dispatchEvent(new Event('fieldzero-field-change'));
}
function cropAction(action){
  const crop=selectedCrop();if(!crop)return;
  if(action==='remove'){state.field[state.selectedPlot]=null;state.seasonStats.failed++;addLog('P'+(state.selectedPlot+1)+': tanaman mati dibersihkan.');render();return;}
  if(action==='harvest'){harvestPlot(state.selectedPlot,1,true);return;}
  if(crop.health<=0)return;
  if(action==='water'){
    const free=hasTech('irrigation')&&state.irrigationUses%2===1,focusCost=free?0:1;if(state.focus<focusCost)return;
    crop.water=clamp(crop.water+(hasTech('irrigation')?50:38));state.focus-=focusCost;state.irrigationUses++;crop.stress=Math.max(0,crop.stress-(hasTech('irrigation')?5:2));addLog('P'+(state.selectedPlot+1)+': irigasi'+(free?' otomatis':'')+'.');beep(360);
  }
  if(action==='fertilize'){
    if(activeChallenge().noFertilizer){toast('Challenge melarang pupuk');return;}
    const cost=hasTech('precisionN')?3:5;if(state.focus<1||state.coins<cost)return;
    crop.n=clamp(crop.n+(hasTech('precisionN')?50:38));state.coins-=cost;state.focus--;addLog('P'+(state.selectedPlot+1)+': pemupukan N presisi.');beep(440);
  }
  if(action==='scout'){
    if(state.focus<1)return;state.focus--;crop.scouted++;const bonus=traitSum(allCropTraits(crop),'scoutRp')+(hasTech('drone')?2:0);state.rp+=2+bonus;
    if(crop.mutation&&!crop.revealed&&(hasTech('drone')||chance(.7))){crop.revealed=true;discoverTrait(crop.mutation);addLog('P'+(state.selectedPlot+1)+': periksa menemukan '+traitMeta(crop.mutation).name+'.');}
    else addLog('P'+(state.selectedPlot+1)+': periksa selesai; penyakit '+Math.round(crop.disease)+'%.');
    crop.disease=Math.max(0,crop.disease-(hasTech('drone')?9:5));beep(540);
  }
  render();
}
function yieldFor(crop){
  const traits=allCropTraits(crop),healthFactor=clamp(crop.health,0,100)/100;
  const stressPenalty=1-(clamp(crop.stress,0,120)/180)*(1-traitSum(traits,'stressRes'));
  const waterFactor=.72+.28*clamp(crop.water,0,100)/100,nFactor=.74+.26*clamp(crop.n,0,100)/100;
  let traitYield=traitValue(traits,'yield',1);
  if(crop.n<35)traitYield*=traitValue(traits,'lowNYield',1);
  const noise=.9+Math.random()*.2;
  const challenge=activeChallenge(),loc=activeLocation(),legacy=1+(state.legacy||0)*.03;
  return Math.max(0,round(crop.seed.baseYield*healthFactor*stressPenalty*waterFactor*nFactor*traitYield*(state.env.yield||1)*(loc.yield||1)*(challenge.yield||1)*legacy*noise,1));
}
function candidateFrom(crop,yieldValue){
  const traits=allCropTraits(crop),gain=yieldValue>crop.seed.baseYield?1.04:1;
  return {
    id:uid('seed'),name:'FZ-'+state.season+'-'+String(state.selectedPlot+1).padStart(2,'0'),generation:(crop.seed.generation||0)+1,
    traits:unique(traits).slice(0,4),baseYield:round(crop.seed.baseYield*gain*(.97+Math.random()*.06)*(activeLocation().quality||1),1),
    vigor:round(crop.seed.vigor*(.98+Math.random()*.05),2),source:'Seleksi musim '+state.season,parents:[crop.seed.id]
  };
}
function harvestReason(crop){
  const log={water:0,n:0,disease:0,heat:0,burn:0,...(crop?.stressLog||{})};
  const labels={water:'kekurangan air',n:'kekurangan nitrogen',disease:'penyakit',heat:'panas',burn:'serangan pemain'};
  const [key,value]=Object.entries(log).sort((a,b)=>b[1]-a[1])[0]||['',0];
  if(value>0)return labels[key]||'stres';
  if(crop.health<85)return 'kesehatan tanaman';
  return 'kondisi optimal';
}
function recordHarvest(index,crop,multiplier=1,announce=true){
  const y=round(yieldFor(crop)*multiplier,1);state.seasonStats.yield=round(state.seasonStats.yield+y,1);state.seasonStats.harvests++;
  if(crop.health>=80)state.seasonStats.healthy++;state.seasonStats.maxYield=Math.max(state.seasonStats.maxYield,y);
  state.coins+=Math.round(y*1.25);state.rp+=Math.max(1,Math.floor(y/9));state.xp+=Math.max(5,Math.round(y*1.6));state.level=levelFromXp(state.xp);
  if(!state.seasonBest||y>state.seasonBest.yield)state.seasonBest={yield:y,seed:candidateFrom(crop,y)};
  allCropTraits(crop).forEach(id=>discoverTrait(id));
  if(crop.mutation)awardAchievement('anomaly');awardAchievement('first');if(y>=20)awardAchievement('twenty');if(crop.health>=95)awardAchievement('perfect');
  const reason=harvestReason(crop);
  addLog('P'+String(index+1).padStart(2,'0')+': panen '+y+' kg · '+reason+'.');
  if(announce)toast('Panen '+y+' kg · '+reason);
  state.field[index]=null;beep(650,.08);return y;
}
function harvestPlot(index,multiplier=1,announce=true){
  const crop=state.field[index];if(!crop||crop.growth<100||crop.health<=0)return 0;
  const y=recordHarvest(index,crop,multiplier,announce);render();return y;
}

function processCrop(crop,weather){
  if(!crop||crop.health<=0)return;
  crop.stressLog={water:0,n:0,disease:0,heat:0,burn:0,...(crop.stressLog||{})};
  if(crop.burned>0){crop.stressLog.burn++;crop.burned=Math.max(0,crop.burned-1);}
  const traits=allCropTraits(crop),loc=activeLocation(),droughtRes=traitSum(traits,'droughtRes'),heatRes=traitSum(traits,'heatRes'),diseaseRes=traitSum(traits,'diseaseRes');
  const waterLoss=traitValue(traits,'waterLoss',1),nLoss=traitValue(traits,'nLoss',1);
  const seasonalWater=(state.env.waterLoss||0)+(loc.waterLoss||0);
  const waterDelta=(weather.water<0?(weather.water+seasonalWater)*waterLoss*(1-droughtRes):weather.water+seasonalWater);
  crop.water=clamp(crop.water+waterDelta);
  crop.n=clamp(crop.n-(5+(state.env.nLoss||0)+(loc.nLoss||0))*nLoss);
  const diseaseRisk=Math.max(0,(weather.disease||0)+(state.env.disease||0)+(loc.disease||0))*(1-diseaseRes);
  if(chance(diseaseRisk))crop.disease=clamp(crop.disease+8+Math.random()*12);
  else crop.disease=Math.max(0,crop.disease-2.5);
  let damage=0,stress=0;
  if(crop.water<20){damage+=7*(1-droughtRes);stress+=10;crop.stressLog.water+=2;}else if(crop.water<38){stress+=4;crop.stressLog.water++;}
  if(crop.n<20){damage+=4;stress+=6;crop.stressLog.n+=2;}else if(crop.n<35){stress+=2;crop.stressLog.n++;}
  if(weather.heat){damage+=5*(1-heatRes);stress+=6*(1-heatRes);crop.stressLog.heat++;}
  if(weather===WEATHER.storm&&crop.growth>55){damage+=2;stress+=2;}
  if(crop.disease>55){damage+=6;stress+=5;crop.stressLog.disease+=2;}else if(crop.disease>30){damage+=2;stress+=2;crop.stressLog.disease++;}
  const guard=traitSum(traits,'healthGuard')+Math.min(.18,(state.legacy||0)*.03);crop.health=clamp(crop.health-damage*(1-guard));
  crop.stress=clamp(crop.stress+stress,0,120);
  const growthTrait=traitValue(traits,'growth',1),healthFactor=.55+.45*crop.health/100,resourceFactor=.65+.18*crop.water/100+.17*crop.n/100;
  const firstHarvestBoost=state.achievements.includes('first')?1:1.38;
  crop.growth=clamp(crop.growth+15.5*firstHarvestBoost*crop.seed.vigor*growthTrait*healthFactor*resourceFactor,0,110);crop.age++;
}
function advanceDay(){
  if(state.pendingEvent)return;
  if(state.day>=state.maxDay){finishSeason();return;}
  state.day++;state.focus=focusMax(state.level);
  if(state.daily){
    const pool=weatherPool(state.env.id),seed=hashString(state.daily.key+':'+state.day);state.weather=pool[Math.floor(seededUnit(seed)*pool.length)];
  }else state.weather=rollWeather(state.env);
  const w=WEATHER[state.weather];state.field.forEach(crop=>processCrop(crop,w));tickExpedition();
  addLog(w.icon+' '+w.name+'. '+w.effect+'.');
  const eventChance=state.achievements.includes('first')?(.28+Math.min(.12,state.season*.01)+(state.env.boss?0.08:0)):0.06;
  if(chance(eventChance))state.pendingEvent=createEvent();
  render();if(state.pendingEvent)renderEvent();else toast('Hari '+state.day+' · '+w.name);
}
function createEvent(){
  const types=['rust','trader','soil','drainage'];
  if(state.season>=3||state.eventFlags.sampledSoil)types.push('signal');
  if(state.eventFlags.rustObserved)types.push('pathogen');
  if(state.eventFlags.traderSkipped)types.push('returnTrader');
  if(state.eventFlags.zeroTrace)types.push('archive');
  if(state.env.boss)types.push('bossChoice');
  return {kind:pick(types),id:uid('event')};
}
function eventDefinition(event){
  const defs={
    rust:{kicker:'BIOSECURITY ALERT',title:'Front penyakit bergerak',text:'Bercak baru muncul di beberapa petak. Intervensi cepat mahal, tetapi mengurangi tekanan penyakit seluruh lahan.',
      choices:[['spray','Semprot · 10 koin'],['observe','Amati · +4 riset']]},
    trader:{kicker:'VISITOR',title:'Pedagang benih keliling',text:'Seorang pedagang menawarkan lot benih tanpa silsilah lengkap. Potensinya tidak pasti.',
      choices:[['buy','Beli lot · 22 koin'],['pass','Lewati']]},
    soil:{kicker:'SOIL SIGNAL',title:'Pembacaan tanah tidak normal',text:'Sensor menunjukkan pola ion yang berulang di bawah satu petak. Mengambil sampel membutuhkan fokus hari ini.',
      choices:[['sample','Ambil sampel · 1 fokus'],['ignore','Abaikan']]},
    drainage:{kicker:'WEATHER EVENT',title:'Air tertahan di lahan',text:'Saluran kecil tersumbat setelah hujan. Tanaman dengan penyakit aktif paling berisiko.',
      choices:[['drain','Buka drainase · 1 fokus'],['risk','Biarkan']]},
    signal:{kicker:'FIELD ZERO',title:'Sinyal ungu di petak',text:'Selama beberapa detik, sensor, daun, dan tanah menunjukkan pola yang sama. Tidak ada catatan fenomena ini.',
      choices:[['trace','Lacak sinyal · 2 fokus'],['shield','Lindungi tanaman · 8 koin']]},
    pathogen:{kicker:'FOLLOW-UP',title:'Sampel patogen kembali',text:'Data observasi karat sebelumnya membuka dua jalur: dokumentasi mendalam atau tindakan cepat.',
      choices:[['publish','Dokumentasikan · +8 RP'],['contain','Kendalikan penyakit']]},
    returnTrader:{kicker:'VISITOR',title:'Pedagang itu kembali',text:'Karena sebelumnya Anda menolak lot pertama, kali ini ia menawarkan galur yang lebih jelas asal-usulnya.',
      choices:[['buyBetter','Beli galur terseleksi · 18 koin'],['declineAgain','Tolak lagi']]},
    archive:{kicker:'FIELD ZERO ARCHIVE',title:'Arsip terenkripsi ditemukan',text:'Jejak sinyal membuka satu fragmen arsip. Anda dapat membacanya sekarang atau mengonversi energinya untuk menjaga tanaman.',
      choices:[['readArchive','Baca arsip'],['stabilize','Stabilkan lahan']]},
    bossChoice:{kicker:'BOSS SEASON',title:'Tekanan utama meningkat',text:'Kondisi ekstrem memuncak. Pilih satu respons prioritas untuk seluruh lahan.',
      choices:[['defendBoss','Pertahanan kolektif · 2 fokus'],['gambleBoss','Ambil risiko · +10 RP']]}
  };
  return defs[event.kind]||defs.soil;
}
function canEventChoice(kind,choice){
  if(choice==='spray')return state.coins>=10;if(choice==='buy')return state.coins>=22;
  if(choice==='sample'||choice==='drain')return state.focus>=1;if(choice==='trace'||choice==='defendBoss')return state.focus>=2;if(choice==='shield')return state.coins>=8;
  if(choice==='buyBetter')return state.coins>=18;
  return true;
}
function renderEvent(){
  if(!state.pendingEvent)return;
  const def=eventDefinition(state.pendingEvent);$('#eventKicker').textContent=def.kicker;$('#eventTitle').textContent=def.title;$('#eventText').textContent=def.text;
  $('#eventChoices').innerHTML=def.choices.map(([id,label])=>`<button type="button" data-event-choice="${id}" ${canEventChoice(state.pendingEvent.kind,id)?'':'disabled'}>${esc(label)}</button>`).join('');
  $('#eventModal').hidden=false;
}
function randomLivingCrop(){const list=state.field.map((crop,index)=>({crop,index})).filter(item=>item.crop&&item.crop.health>0);return list.length?pick(list):null;}
function traderSeed(){
  const traits=shuffle(Object.keys(TRAITS).filter(id=>id!=='zero')).slice(0,2);
  return {id:uid('seed'),name:'Lot '+String.fromCharCode(65+Math.floor(Math.random()*26))+Math.floor(10+Math.random()*90),generation:0,traits,baseYield:round(13+Math.random()*5,1),vigor:round(.92+Math.random()*.16,2),source:'Pedagang'};
}
function applyEventChoice(choice){
  const event=state.pendingEvent;if(!event||!canEventChoice(event.kind,choice))return;
  let note='';
  if(event.kind==='rust'){
    if(choice==='spray'){state.coins-=10;state.field.forEach(c=>{if(c)c.disease=Math.max(0,c.disease-22);});note='Tekanan penyakit ditekan.';}
    else{state.rp+=4;state.eventFlags.rustObserved=true;state.field.forEach(c=>{if(c)c.disease=clamp(c.disease+5);});note='Data penyakit dikumpulkan. Follow-up mungkin muncul.';}
  }
  if(event.kind==='trader'){
    if(choice==='buy'){state.coins-=22;const seed=traderSeed();state.vault.push(seed);state.selectedSeedId=seed.id;seed.traits.forEach(discoverTrait);rememberLineage(seed);note=seed.name+' masuk Seed Vault.';}
    else{state.eventFlags.traderSkipped=true;note='Lot benih dilewati. Pedagang mengingat keputusan ini.';}
  }
  if(event.kind==='soil'){
    if(choice==='sample'){
      state.focus--;state.rp+=6;const item=randomLivingCrop();
      if(item&&chance(.38)&&!item.crop.mutation){item.crop.mutation=pick(MUTATION_POOL.filter(id=>!item.crop.seed.traits.includes(id)));item.crop.revealed=true;discoverTrait(item.crop.mutation);}
      state.eventFlags.sampledSoil=true;note='Sampel menghasilkan +6 riset dan membuka jalur event baru.';
    }else note='Sinyal tanah tidak ditindaklanjuti.';
  }
  if(event.kind==='drainage'){
    if(choice==='drain'){state.focus--;state.field.forEach(c=>{if(c){c.water=Math.max(45,c.water-12);c.disease=Math.max(0,c.disease-4);}});note='Drainase pulih.';}
    else{state.field.forEach(c=>{if(c&&c.water>75){c.health=clamp(c.health-5);c.stress=clamp(c.stress+6,0,120);}});note='Sebagian petak mengalami stres genangan.';}
  }
  if(event.kind==='signal'){
    if(choice==='trace'){
      state.focus-=2;state.rp+=10;const item=randomLivingCrop();
      if(item){item.crop.mutation='zero';item.crop.revealed=true;discoverTrait('zero');}
      state.eventFlags.zeroTrace=true;note=item?'Resonansi Zero ditemukan pada P'+(item.index+1)+'. Jalur arsip terbuka.':'Jejak sinyal dikonversi menjadi +10 riset.';
    }else{state.coins-=8;state.field.forEach(c=>{if(c)c.health=clamp(c.health+7);});note='Tanaman dilindungi dari anomali.';}
  }
  if(event.kind==='pathogen'){
    if(choice==='publish'){state.rp+=8;state.xp+=18;note='Dataset patogen didokumentasikan: +8 RP.';}
    else{state.field.forEach(c=>{if(c)c.disease=Math.max(0,c.disease-28);});note='Tekanan penyakit dikendalikan.';}
    state.eventFlags.rustObserved=false;
  }
  if(event.kind==='returnTrader'){
    if(choice==='buyBetter'){
      state.coins-=18;const seed=traderSeed();seed.name='Selected-'+seed.name;seed.baseYield=round(seed.baseYield*1.08,1);seed.source='Pedagang terseleksi';state.vault.push(seed);state.selectedSeedId=seed.id;seed.traits.forEach(discoverTrait);rememberLineage(seed);note=seed.name+' masuk Seed Vault.';
    }else note='Pedagang pergi. Jalur dagang berakhir untuk sementara.';
    state.eventFlags.traderSkipped=false;
  }
  if(event.kind==='archive'){
    if(choice==='readArchive'){
      const fragment=LORE.find(item=>!state.lore.includes(item))||pick(LORE);if(!state.lore.includes(fragment))state.lore.push(fragment);state.rp+=5;note='Fragmen arsip dibuka: +5 RP.';
    }else{state.field.forEach(c=>{if(c){c.health=clamp(c.health+10);c.stress=Math.max(0,c.stress-10);}});note='Lahan distabilkan oleh energi anomali.';}
    state.eventFlags.zeroTrace=false;
  }
  if(event.kind==='bossChoice'){
    if(choice==='defendBoss'){state.focus-=2;state.field.forEach(c=>{if(c){c.health=clamp(c.health+8);c.water=clamp(c.water+12);c.disease=Math.max(0,c.disease-10);}});note='Pertahanan kolektif mengurangi tekanan boss.';}
    else{state.rp+=10;state.field.forEach(c=>{if(c)c.stress=clamp(c.stress+8,0,120);});note='Risiko diambil: +10 RP, stres tanaman meningkat.';}
  }
  addLog(note);state.pendingEvent=null;$('#eventModal').hidden=true;beep(580,.06);render();
}

function finishSeason(){
  if(state.pendingEvent)return;
  for(let i=0;i<state.field.length;i++){const crop=state.field[i];if(crop&&crop.growth>=100&&crop.health>0)recordHarvest(i,crop,.9,false);}
  const completed=missionDone(),challenge=activeChallenge(),rewardScale=challenge.reward||1;
  const reward=completed?{coins:Math.round(35*rewardScale),rp:Math.round(8*rewardScale),xp:Math.round(45*rewardScale)}:{coins:10,rp:2,xp:12};
  const rivalTarget=computeRivalTarget(),beatRival=state.seasonStats.yield>=rivalTarget,bossWon=!!state.env.boss&&completed;
  state.coins+=reward.coins;state.rp+=reward.rp;state.xp+=reward.xp;state.level=levelFromXp(state.xp);
  if(beatRival){state.rivalWins=(state.rivalWins||0)+1;state.rp+=4;awardAchievement('rival');}
  if(state.env.boss){state.collection.bosses=unique([...(state.collection.bosses||[]),state.env.id]);if(bossWon){state.rp+=12;state.coins+=25;awardAchievement('boss');}}
  else state.collection.environments=unique([...(state.collection.environments||[]),state.env.id]);
  if(['drought','rust','wet','poorN','anomaly'].includes(state.env.id)||state.env.boss)awardAchievement('survivor');
  const previousGhost=recordBest();
  if(state.daily){awardAchievement('daily');state.records['daily:'+state.daily.key]=Math.max(Number(state.records['daily:'+state.daily.key]||0),state.seasonStats.yield);}
  updateRecord(state.seasonStats.yield);
  const ghostDelta=round(state.seasonStats.yield-previousGhost,1);
  state.history.unshift({season:state.season,env:state.env.name,location:state.location,challenge:state.challenge,yield:state.seasonStats.yield,mission:completed,rival:rivalTarget,beatRival,boss:!!state.env.boss});state.history=state.history.slice(0,20);
  if(hasTech('cold')&&state.seasonBest&&!state.vault.some(item=>item.id===state.seasonBest.seed.id)){
    const auto=state.seasonBest.seed;state.vault.push(auto);rememberLineage(auto);addLog('Cold Storage otomatis menyimpan '+auto.name+'.');
  }
  $('#recapTitle').textContent='Musim '+state.season+' · '+(completed?'Target tercapai':'Target belum tercapai')+(state.env.boss?' · BOSS':'');
  $('#recapStats').innerHTML=`<div><small>Total hasil</small><b>${state.seasonStats.yield.toFixed(1)} kg</b></div><div><small>Rival</small><b>${beatRival?'Menang':'Kalah'} · ${rivalTarget.toFixed(1)}</b></div><div><small>Reward</small><b>+${reward.coins} koin</b></div><div><small>Ghost</small><b>${ghostDelta>=0?'+':''}${ghostDelta.toFixed(1)} kg</b></div><div><small>Run</small><b>${esc(state.daily?'Daily':challenge.name)}</b></div><div><small>Lokasi</small><b>${esc(activeLocation().name)}</b></div>`;
  const best=$('#bestCandidate'),saveButton=$('#saveBestSeed');
  if(state.seasonBest){
    const seed=state.seasonBest.seed;rememberLineage(seed);best.innerHTML=`<small>Kandidat terbaik · ${state.seasonBest.yield.toFixed(1)} kg</small><b>${esc(seed.name)}</b><div class="trait-row">${seedTraitsHtml(seed)}</div>`;
    saveButton.hidden=hasTech('cold');saveButton.disabled=state.vault.some(item=>item.id===seed.id);
  }else{best.innerHTML='';saveButton.hidden=true;}
  $('#recapModal').hidden=false;save();notifyGameProfile();beep(760,.12);
}
function saveBestCandidate(){
  if(!state.seasonBest)return;const seed=state.seasonBest.seed;if(state.vault.some(item=>item.id===seed.id))return;
  state.vault.push(seed);state.selectedSeedId=seed.id;seed.traits.forEach(discoverTrait);rememberLineage(seed);$('#saveBestSeed').disabled=true;toast(seed.name+' disimpan ke Seed Vault');renderVault();save();
}
function beginNextSeason(){
  const wasDaily=!!state.daily;
  state.season++;state.day=1;state.field=Array.from({length:PLOT_COUNT},()=>null);state.focus=focusMax(state.level);state.irrigationUses=0;
  if(wasDaily){state.daily=null;state.challenge='standard';state.maxDay=CHALLENGES.standard.maxDay;state.monoSeedId=null;}
  state.env=newEnvironment(state.season);state.weather=rollWeather(state.env);state.mission=missionFor(state.season);
  state.seasonStats={yield:0,harvests:0,healthy:0,maxYield:0,failed:0};state.seasonBest=null;state.pendingEvent=null;state.selectedPlot=0;state.rivalTarget=computeRivalTarget();
  if(state.season%3===0){const fragment=LORE[Math.min(LORE.length-1,Math.floor(state.season/3)-1)];if(fragment&&!state.lore.includes(fragment)){state.lore.push(fragment);addLog('Fragment arsip baru ditemukan.');}}
  addLog('Musim '+state.season+' dimulai: '+state.env.name+(state.env.boss?' [BOSS]':'')+'.',1);$('#recapModal').hidden=true;render();toast(state.env.name+' dimulai');
}

function updateCrossPreview(){
  const a=state.vault.find(seed=>seed.id===$('#parentA').value),b=state.vault.find(seed=>seed.id===$('#parentB').value);
  $('#crossSeeds').disabled=!a||!b||a.id===b.id||state.rp<CROSS_COST;
  if(!a||!b){$('#crossPreview').textContent='Pilih dua benih berbeda. Keturunannya mewarisi sebagian trait dan mungkin mengalami mutasi.';return;}
  const possible=unique([...a.traits,...b.traits]);$('#crossPreview').innerHTML=`Potensi trait: <span class="trait-row">${possible.map(id=>`<span class="trait ${traitMeta(id).rarity}">${esc(traitMeta(id).name)}</span>`).join('')}</span>`;
}
function crossSeeds(){
  const a=state.vault.find(seed=>seed.id===$('#parentA').value),b=state.vault.find(seed=>seed.id===$('#parentB').value);
  if(!a||!b||a.id===b.id||state.rp<CROSS_COST)return;
  state.rp-=CROSS_COST;const inheritChance=hasTech('breeding')?0.72:0.58;let inherited=shuffle(unique([...a.traits,...b.traits])).filter(()=>chance(inheritChance)).slice(0,hasTech('breeding')?4:3);
  if(!inherited.length)inherited=[pick(unique([...a.traits,...b.traits]))];
  if(chance(hasTech('breeding')?0.22:0.16)){
    const mutation=pick(MUTATION_POOL.filter(id=>!inherited.includes(id)));if(mutation){inherited.push(mutation);discoverTrait(mutation);}
  }
  if(state.season>=5&&chance(hasTech('genome')?0.04:0.025)&&!inherited.includes('zero')){inherited.push('zero');discoverTrait('zero');}
  const child={id:uid('seed'),name:'X'+state.season+'-'+Math.floor(100+Math.random()*900),generation:Math.max(a.generation,b.generation)+1,traits:unique(inherited).slice(0,4),baseYield:round(((a.baseYield+b.baseYield)/2)*(.95+Math.random()*.12),1),vigor:round(((a.vigor+b.vigor)/2)*(.97+Math.random()*.08),2),source:a.name+' × '+b.name,parents:[a.id,b.id]};
  state.vault.push(child);rememberLineage(a);rememberLineage(b);rememberLineage(child);state.selectedSeedId=child.id;state.xp+=30;state.level=levelFromXp(state.xp);awardAchievement('breeder');addLog('Breeding Lab menghasilkan '+child.name+'.');beep(680,.1);render();toast(child.name+' berhasil dibuat');
}

function bind(){
  const field=$('#fieldGrid'),vault=$('#vaultList'),toolDock=$('#toolDock');
  field.addEventListener('click',event=>{
    const plot=event.target.closest('[data-plot]');if(!plot||plot.disabled)return;
    const index=Number(plot.dataset.plot);
    if(activeFieldTool){useFieldTool(activeFieldTool,index);return;}
    state.selectedPlot=index;beep(330);renderField();renderInspector();
  });
  field.addEventListener('dragover',event=>{const plot=event.target.closest('[data-plot]');if(plot&&!plot.disabled){event.preventDefault();plot.classList.add('drag-target');}});
  field.addEventListener('dragleave',event=>event.target.closest('[data-plot]')?.classList.remove('drag-target'));
  field.addEventListener('drop',event=>{
    const plot=event.target.closest('[data-plot]');if(!plot||plot.disabled)return;event.preventDefault();plot.classList.remove('drag-target');
    const index=Number(plot.dataset.plot),seedId=event.dataTransfer?.getData('fieldzero/seed')||'',tool=event.dataTransfer?.getData('fieldzero/tool')||(seedId?'plant':'');
    if(tool)useFieldTool(tool,index,{seedId});
  });
  toolDock.addEventListener('click',event=>{const button=event.target.closest('[data-field-tool]');if(button)setFieldTool(button.dataset.fieldTool);});
  toolDock.addEventListener('dragstart',event=>{const button=event.target.closest('[data-field-tool]');if(!button)return;event.dataTransfer.setData('fieldzero/tool',button.dataset.fieldTool);event.dataTransfer.effectAllowed='copy';});
  vault.addEventListener('click',event=>{
    const rename=event.target.closest('[data-rename-seed]');
    if(rename){
      const seed=state.vault.find(item=>item.id===rename.dataset.renameSeed);if(!seed)return;
      const name=prompt('Nama varietas',seed.name)?.trim().slice(0,28);if(!name)return;
      seed.name=name;rememberLineage(seed);save();render();toast('Nama varietas disimpan');return;
    }
    const button=event.target.closest('[data-use-seed]');if(!button)return;state.selectedSeedId=button.dataset.useSeed;save();renderVault();renderInspector();renderGenomeLab();toast('Benih dipilih');
  });
  vault.addEventListener('dragstart',event=>{const card=event.target.closest('[data-seed-drag]');if(!card)return;event.dataTransfer.setData('fieldzero/seed',card.dataset.seedDrag);event.dataTransfer.effectAllowed='copy';});
  $('#nextDay').onclick=advanceDay;$('#finishSeason').onclick=finishSeason;
  $('#eventChoices').addEventListener('click',event=>{const button=event.target.closest('[data-event-choice]');if(button)applyEventChoice(button.dataset.eventChoice);});
  $('#saveBestSeed').onclick=saveBestCandidate;$('#nextSeason').onclick=beginNextSeason;
  $('#parentA').onchange=updateCrossPreview;$('#parentB').onchange=updateCrossPreview;$('#crossSeeds').onclick=crossSeeds;
  $('#soundToggle').onclick=()=>{state.sound=!state.sound;save();renderHud();if(state.sound){startMusic(state.musicTrack||'morning');beep(520,.05);}else stopMusic();};
  $('#newRun').onclick=()=>{if(!confirm('Mulai ulang Field Zero? Save permainan saat ini akan diganti.'))return;state=freshState();save();$('#eventModal').hidden=true;$('#recapModal').hidden=true;closeMetaModal();render();notifyGameProfile();toast('Run baru dimulai');};
  $('#openWorldMap').onclick=openWorldMap;$('#openChallenges').onclick=openChallenges;$('#openRival').onclick=openRival;$('#openRecords').onclick=openRecords;$('#openPrestige').onclick=openPrestige;$('#openEvolution').onclick=openEvolution;
  $('#quickField').onclick=()=>document.querySelector('.field-panel')?.scrollIntoView({behavior:'smooth',block:'start'});
  $('#quickLab').onclick=()=>{const hub=$('#labHub');hub.open=true;hub.scrollIntoView({behavior:'smooth',block:'start'});};
  $('#quickMap').onclick=openWorldMap;$('#quickMore').onclick=openQuickMore;
  $('#selectedSeedQuick').onclick=openSeedVault;$('#playHint').onclick=runPlayHint;$('#gameHelp').onclick=openGameHelp;
  $('#closeMetaModal').onclick=closeMetaModal;$('#metaModal').addEventListener('click',event=>{if(event.target.id==='metaModal')closeMetaModal();});
  document.addEventListener('keydown',event=>{
    if(event.key>='1'&&event.key<='9'&&!event.target.matches('input,select,textarea')){const index=Number(event.key)-1;if(index<fieldLimit()){state.selectedPlot=index;renderField();renderInspector();}}
    if(event.key==='Escape'){setFieldTool('');closeMetaModal();}
  });
  document.addEventListener('pointerdown',()=>{if(state.sound)startMusic(state.musicTrack||'morning');},{once:true});
  window.addEventListener('beforeunload',()=>{save();stopMusic();});
}

window.FieldZeroGame={getProfile:gameProfile,applyBurnRaid:applyRemoteBurn,applyWaterAid,refresh:render};
bind();render();updateCrossPreview();notifyGameProfile();
