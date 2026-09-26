import {startMusic,stopMusic,setMusicTrack,setMusicVolume,musicTracks,isMusicPlaying} from './music.js';
import {createBreedingCup} from './competition.js';
import {speciesProfile,recommendedParameters,makeSubsamples,sampleMeasurements,aggregateSamples,plotCarryover,evidenceLabel,normalizeGenome,crossGenome,selfGenome,geneticEffects} from './academy.js';
import {curriculum,generationName,expectedHeterozygosity,observedHeterozygosity,mendelianSummary,pearson,analyzeExperiment,designCoach,interpretationQuestion,trackQuiz} from './learning.js';
const STORAGE='agrotik_field_zero_v1';
const PLOT_COUNT=24,BLOCK_COUNT=3,PLOTS_PER_BLOCK=8,MAX_DAY=12,CROSS_COST=12;
const PLOT_AREA_M2=25,LEGACY_COIN_RP=5000,ACADEMY_MODEL_VERSION='fz-academy-2';
const PRICE_REFERENCE={cornHpp:5500,cornSulsel:6677,urea:1800,npk:1840};
const COSTS={
  plant:8000,water:5000,waterPrecision:3000,fertilize:6000,fertilizePrecision:4500,
  spray:15000,trader:75000,traderSelected:90000,shield:20000
};
const PLANT_COST=COSTS.plant,COMMERCIAL_SEED_PACK_COST=18000,COMMERCIAL_SEED_PACK_SIZE=8;
const PLOT_USES={commercial:{icon:'Rp',name:'Produksi'},research:{icon:'📐',name:'Penelitian'},breeding:{icon:'🧬',name:'Pemuliaan'}};
const SPECIES={maize:{id:'maize',name:'Jagung',latin:'Zea mays',maturityDays:110},chili:{id:'chili',name:'Cabai rawit',latin:'Capsicum frutescens',maturityDays:145}};
function makePlotRegistry(){
  return Array.from({length:PLOT_COUNT},(_,index)=>{
    const block=Math.floor(index/PLOTS_PER_BLOCK)+1,slot=index%PLOTS_PER_BLOCK+1;
    const blockEffect=(block-2)*.035,fertility=Number((.94+blockEffect+((index*37)%9)/100).toFixed(2)),moisture=Number((.95-blockEffect+((index*19)%7)/100).toFixed(2));
    return {uid:`FZ-K${block}-P${String(slot).padStart(2,'0')}`,block,slot,areaM2:PLOT_AREA_M2,fertility,moisture,history:[]};
  });
}
function plotMeta(index){return state.plotRegistry?.[index]||makePlotRegistry()[index];}
function plotUse(index){return state.plotUse?.[index]||'commercial';}
function setPlotUse(index,use){
  if(!PLOT_USES[use]||experimentUnit(index))return false;
  if(use==='research'){toast('📐 Buat rancangan dulu');return false;}
  state.plotUse[index]=use;save();renderField();renderInspector();return true;
}

const $=selector=>document.querySelector(selector);
const clamp=(value,min=0,max=100)=>Math.max(min,Math.min(max,value));
const round=(value,digits=1)=>Number(value.toFixed(digits));
const pick=list=>list[Math.floor(Math.random()*list.length)];
const chance=p=>Math.random()<p;
const uid=prefix=>prefix+'-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,7);
const shuffle=list=>[...list].sort(()=>Math.random()-.5);
const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));

const TRAITS={
  early:{name:'Cepat Berbunga',icon:'⚡',rarity:'common',desc:'Lebih cepat matang, tetapi potensi hasil sedikit turun.',growth:1.15,yield:.95},
  deep:{name:'Akar Dalam',icon:'↧',rarity:'common',desc:'Lebih tahan kekeringan, tetapi kebutuhan awal N sedikit lebih tinggi.',droughtRes:.42,nLoss:1.06},
  nue:{name:'Efisien N',icon:'N',rarity:'common',desc:'Lebih efisien pada N rendah, dengan plafon hasil sedikit lebih rendah.',nLoss:.72,lowNYield:1.12,yield:.97},
  rust:{name:'Tahan Karat',icon:'◈',rarity:'common',desc:'Tekanan penyakit lebih rendah, dengan biaya hasil kecil.',diseaseRes:.52,yield:.97},
  giant:{name:'Tongkol Besar',icon:'▰',rarity:'common',desc:'Potensi hasil tinggi, tumbuh lebih lambat dan lebih boros air.',yield:1.18,growth:.92,waterLoss:1.12},
  prolific:{name:'Prolifik',icon:'✦',rarity:'common',desc:'Potensi hasil naik, tetapi kebutuhan N meningkat.',yield:1.11,nLoss:1.12},
  saver:{name:'Hemat Air',icon:'◇',rarity:'common',desc:'Kehilangan air lebih lambat, tetapi pertumbuhan sedikit lebih lambat.',waterLoss:.72,growth:.97},
  plastic:{name:'Plastis',icon:'≈',rarity:'common',desc:'Penalti stres lebih kecil, tanpa bonus hasil langsung.',stressRes:.34,yield:.99},
  heat:{name:'Tahan Panas',icon:'☀',rarity:'rare',desc:'Tahan hari panas, tetapi hasil maksimum sedikit turun.',heatRes:.7,yield:.98},
  vigor:{name:'Vigor Tinggi',icon:'↑',rarity:'rare',desc:'Tumbuh cepat dan pulih baik, namun lebih cepat menghabiskan air.',growth:1.1,healthGuard:.23,waterLoss:1.08},
  myco:{name:'Mikoriza+',icon:'⌁',rarity:'rare',desc:'Akses air dan N membaik, terutama pada lahan marjinal.',waterLoss:.86,nLoss:.8,yield:1.05},
  sentinel:{name:'Sentinel',icon:'◎',rarity:'rare',desc:'Scouting memberi riset ekstra dan deteksi penyakit lebih baik.',scoutRp:2,diseaseRes:.2,yield:.98},
  zero:{name:'Resonansi Zero',icon:'ψ',rarity:'legendary',desc:'Trait misterius: sangat adaptif tetapi tidak selalu stabil.',yield:1.18,stressRes:.45,diseaseRes:.28,growth:1.05}
};
const MUTATION_POOL=['heat','vigor','myco','sentinel'];
const STARTER_SEEDS=[
  {id:'seed-aruna',name:'Aruna 01',generation:0,traits:['early','nue'],baseYield:14.5,vigor:1.02,source:'Starter',stock:24,viability:96,ageSeasons:0},
  {id:'seed-savana',name:'Savana D',generation:0,traits:['deep','saver'],baseYield:14,vigor:1,source:'Starter',stock:24,viability:96,ageSeasons:0},
  {id:'seed-rinjani',name:'Rinjani R',generation:0,traits:['rust','plastic'],baseYield:13.5,vigor:1.03,source:'Starter',stock:24,viability:96,ageSeasons:0},
  {id:'seed-bima',name:'Bima Dent',generation:0,traits:['giant','prolific'],baseYield:17,vigor:.94,source:'Starter',stock:24,viability:96,ageSeasons:0}
];
const ENVIRONMENTS=[
  {id:'transition',name:'Peralihan Sulsel',icon:'◐',desc:'Hujan tidak menentu; keputusan air dan penyakit sama-sama penting.',waterLoss:-1,disease:.035,nLoss:1,yield:1},
  {id:'drought',name:'Kemarau Sulsel',icon:'☀',desc:'Hari tanpa hujan memanjang; evaporasi dan stres panas meningkat.',waterLoss:-8,disease:-.01,nLoss:1,yield:.95},
  {id:'wet',name:'Musim Hujan',icon:'☂',desc:'Air cukup, tetapi kelembapan, penyakit, dan kehilangan N meningkat.',waterLoss:6,disease:.085,nLoss:2,yield:1.01},
  {id:'rust',name:'Tekanan Karat',icon:'◉',desc:'Kelembapan dan inokulum meningkatkan risiko karat daun.',waterLoss:1,disease:.14,nLoss:1,yield:.97},
  {id:'poorN',name:'Lahan N Rendah',icon:'N',desc:'Pasokan N cepat menjadi pembatas; efisiensi N dan timing pupuk penting.',waterLoss:-1,disease:.02,nLoss:5,yield:.93},
  {id:'anomaly',name:'Anomali Zero',icon:'ψ',desc:'Lingkungan eksperimen tidak stabil; mutasi langka lebih sering muncul.',waterLoss:-2,disease:.06,nLoss:2,yield:1.05}
];
const WEATHER={
  clear:{name:'Cerah',icon:'☀',water:-9,disease:0,heat:0,effect:'Evapotranspirasi meningkat'},
  hot:{name:'Panas terik',icon:'♨',water:-17,disease:0,heat:1,effect:'Air turun cepat · stres panas'},
  rain:{name:'Hujan sedang',icon:'☂',water:22,disease:.035,heat:0,effect:'Air naik · daun lebih lembap'},
  storm:{name:'Hujan lebat',icon:'☈',water:34,disease:.06,heat:0,effect:'Risiko genangan, rebah, dan N tercuci'},
  humid:{name:'Lembap berawan',icon:'≋',water:6,disease:.09,heat:0,effect:'Tekanan penyakit meningkat'},
  breeze:{name:'Cerah berangin',icon:'↝',water:-12,disease:-.01,heat:0,effect:'Pengeringan tanah lebih cepat'},
  cool:{name:'Sejuk',icon:'◌',water:-3,disease:.015,heat:0,effect:'Pertumbuhan stabil'}
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
  zero:{name:'Kebun Percobaan Sulsel',icon:'ψ',desc:'Lahan awal 600 m²: 3 kelompok × 8 petak @25 m².',unlock:0,yield:1,disease:0,waterLoss:0,nLoss:0},
  lowland:{name:'Dataran Rendah Sulsel',icon:'▱',desc:'Lebih panas; potensi hasil tinggi jika air dan penyakit terkendali.',unlock:2,yield:1.04,disease:.015,waterLoss:-3,nLoss:0},
  dryland:{name:'Tegalan Bone',icon:'△',desc:'Lahan kering: cadangan air terbatas dan respons terhadap akar dalam lebih kuat.',unlock:3,yield:1.02,disease:-.02,waterLoss:-8,nLoss:1,rp:1.2},
  paddy:{name:'Sawah Drainase Gowa',icon:'≋',desc:'Air relatif tersedia; genangan, kelembapan, dan kehilangan N menjadi risiko.',unlock:4,yield:1.06,disease:.055,waterLoss:6,nLoss:2},
  highland:{name:'Dataran Menengah Gowa',icon:'▲',desc:'Suhu lebih sejuk; pertumbuhan sedikit lambat dan kualitas benih lebih stabil.',unlock:5,yield:1.05,disease:.025,waterLoss:1,nLoss:0,quality:1.06}
};
const TECH={
  sensor:{name:'Sensor Tanah',icon:'◉',cost:10,requires:[],desc:'Inspector menampilkan risiko stres lebih jelas.',effect:'sensor'},
  irrigation:{name:'Irigasi Presisi',icon:'💧',cost:16,requires:['sensor'],desc:'Irigasi memberi +50 air dan tidak memakai fokus setiap kedua penggunaan.',effect:'irrigation'},
  precisionN:{name:'Pemupukan Presisi',icon:'N',cost:18,requires:['sensor'],desc:'Biaya aplikasi N turun dan dosis lebih efisien.',effect:'precisionN'},
  drone:{name:'Drone Scout',icon:'◇',cost:20,requires:['sensor'],desc:'Scout menghasilkan +2 RP dan peluang membuka mutasi meningkat.',effect:'drone'},
  expedition:{name:'Field Expedition',icon:'↗',cost:22,requires:['sensor'],desc:'Membuka ekspedisi ke lokasi liar.',effect:'expedition'},
  genome:{name:'Genome Lab',icon:'⌬',cost:24,requires:['drone'],desc:'Membuka puzzle genom untuk menemukan trait laten.',effect:'genome'},
  cold:{name:'Cold Storage',icon:'❄',cost:26,requires:['precisionN'],desc:'Kandidat terbaik musim otomatis tersimpan jika vault belum memilikinya.',effect:'cold'},
  breeding:{name:'Marker Breeding',icon:'×',cost:30,requires:['genome'],desc:'Persilangan lebih sering mewarisi trait langka.',effect:'breeding'}
};
const EXPEDITIONS={
  river:{name:'Riparian Strip',icon:'≋',days:2,cost:25000,desc:'Cari mikroba dan galur toleran genangan.',traits:['myco','rust'],rewardRp:[4,8]},
  ridge:{name:'Dry Ridge',icon:'△',days:3,cost:30000,desc:'Cari akar dalam dan toleransi panas.',traits:['deep','heat'],rewardRp:[6,10]},
  oldlab:{name:'Stasiun Lama',icon:'⌂',days:4,cost:50000,desc:'Lokasi eksperimen terbengkalai dengan peluang artefak langka.',traits:['sentinel','vigor','zero'],rewardRp:[8,14]},
  high:{name:'Highland Pocket',icon:'▲',days:3,cost:35000,desc:'Cari material adaptif dari suhu rendah.',traits:['plastic','vigor'],rewardRp:[6,11]}
};
const CHALLENGES={
  standard:{name:'Standar',desc:'24 petak · kontrak musim makin berat.',plots:24,maxDay:12,yield:1,reward:1,pressure:0},
  nofert:{name:'Tanpa Pupuk',desc:'24 petak tanpa intervensi pemupukan.',plots:24,maxDay:12,yield:1.08,reward:1.45,noFertilizer:true,pressure:.08},
  six:{name:'6 Petak',desc:'Hanya enam petak; setiap kegagalan sangat berarti.',plots:6,maxDay:12,yield:1.05,reward:1.55,pressure:.08},
  sprint:{name:'Sprint 8 Hari',desc:'Delapan hari; sedikit waktu memulihkan kesalahan.',plots:24,maxDay:8,yield:1.12,reward:1.6,pressure:.12},
  mono:{name:'Satu Varietas',desc:'Satu varietas menghadapi seluruh heterogenitas lahan.',plots:24,maxDay:12,yield:1.06,reward:1.5,mono:true,pressure:.1},
  ironman:{name:'Iron Field',desc:'Tekanan tinggi · fokus harian -1 · tanpa Undo.',plots:24,maxDay:11,yield:1,reward:1.9,pressure:.24,focusPenalty:1,noUndo:true},
  crisis:{name:'Musim Krisis',desc:'Cuaca berantai dan penyakit menyebar lebih agresif.',plots:24,maxDay:12,yield:1.04,reward:1.8,pressure:.3,streakBoost:1.45,spreadBoost:1.5},
  trial24:{name:'Breeding Cup · 24 Petak',desc:'Seleksi buta dengan tepat 24 petak.',plots:24,maxDay:12,yield:1,reward:1.3,competition:true,pressure:.1}
};
const BOSSES=[
  {id:'megaDrought',name:'Boss: Kemarau Ekstrem',icon:'☀',desc:'Hari panas berulang dan jeda hujan panjang menekan tanaman.',waterLoss:-13,disease:-.02,nLoss:1,yield:1.12},
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


function focusMax(level){
  const legacy=((typeof state!=='undefined'&&state?.legacy)||0)>0?1:0,base=Math.min(7,4+Math.floor((Math.max(1,level)-1)/3)+legacy);
  const penalty=(typeof state!=='undefined'&&state?.challenge&&CHALLENGES[state.challenge])?Number(CHALLENGES[state.challenge].focusPenalty||0):0;
  return Math.max(3,base-penalty);
}
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
function formatRupiah(value,compact=false){
  const amount=Math.max(0,Math.round(Number(value)||0));
  if(compact){
    if(amount>=1000000)return 'Rp'+(amount/1000000).toLocaleString('id-ID',{maximumFractionDigits:1})+' jt';
    if(amount>=1000)return 'Rp'+Math.round(amount/1000).toLocaleString('id-ID')+' rb';
  }
  return 'Rp'+amount.toLocaleString('id-ID');
}
function actionCost(kind){
  const base=Number(COSTS[kind]??(kind==='plant'?PLANT_COST:0)),season=Math.max(1,Number(state?.season)||1),env=state?.env?.id||'transition',challenge=activeChallenge?.()||CHALLENGES.standard;
  let multiplier=1+Math.min(.2,(season-1)*.018)+Math.min(.12,Number(challenge.pressure||0)*.35);
  if((kind==='water'||kind==='waterPrecision')&&env==='drought')multiplier+=.22;
  if((kind==='fertilize'||kind==='fertilizePrecision')&&['wet','poorN'].includes(env))multiplier+=.12;
  if(kind==='spray'&&['wet','rust'].includes(env))multiplier+=.18;
  const shock=(seededUnit(hashString('input:'+season+':'+env+':'+kind))-.5)*.12;
  return Math.max(500,Math.round(base*(multiplier+shock)/500)*500);
}
function agroMonthForSeason(season){return ((Math.max(1,Number(season)||1)+9)%12)+1;}
function monthName(month){return ['','Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'][month]||'';}
function rollMarketPrice(season,envId='transition',location='zero'){
  const seed=hashString('market:'+season+':'+envId+':'+location),noise=Math.round(seededUnit(seed)*18)*50;
  const climate=envId==='drought'?250:envId==='wet'?-150:0,loc=location==='dryland'?100:location==='paddy'?-50:0;
  return clamp(5350+noise+climate+loc,5200,6750);
}
function plotIssue(crop){
  if(!crop)return '';
  if(crop.health<=0)return 'mati';
  if(crop.growth>=100)return 'panen';
  if(crop.disease>=35)return 'penyakit';
  if(crop.water<30)return 'air';
  if(crop.n<30)return 'n';
  if(crop.health<65)return 'stres';
  return '';
}
function attentionIndexes(){return state.field.map((crop,index)=>({index,issue:plotIssue(crop)})).filter(item=>item.issue&&item.index<fieldLimit());}
function weatherRiskPreview(){
  const pool=weatherPool(state.env.id),wet=pool.filter(id=>['rain','storm','humid'].includes(id)).length/pool.length,hot=pool.filter(id=>id==='hot').length/pool.length;
  if(hot>=.3)return 'Besok: peluang panas/kering tinggi';
  if(wet>=.5)return 'Besok: peluang hujan/lembap tinggi';
  return 'Besok: kondisi cukup berubah';
}


function newEnvironment(season){
  if(season>0&&season%5===0){
    const boss=structuredClone(BOSSES[(Math.floor(season/5)-1)%BOSSES.length]);boss.boss=true;boss.month=agroMonthForSeason(season);return boss;
  }
  const month=agroMonthForSeason(season);
  let ids=month>=11||month<=3?['wet','wet','rust','transition']:month<=5?['transition','transition','wet','poorN']:['drought','drought','poorN','transition'];
  if(season>=4)ids=[...ids,'anomaly'];
  const env=structuredClone(ENVIRONMENTS.find(item=>item.id===pick(ids))||ENVIRONMENTS[0]);env.month=month;return env;
}
function weatherPool(envId){
  const map={
    transition:['clear','rain','breeze','humid','clear','cool'],
    drought:['clear','hot','hot','breeze','clear','rain'],
    wet:['rain','rain','humid','storm','cool','clear'],
    rust:['humid','rain','humid','clear','cool','rain'],
    poorN:['clear','breeze','rain','clear','hot','cool'],
    anomaly:['hot','storm','humid','clear','breeze','rain']
  };
  return map[envId]||map.transition;
}
function rollWeather(env){return pick(weatherPool(env.id));}
function challengeForMission(id='standard'){return CHALLENGES[id]||CHALLENGES.standard;}
function objectiveValue(objective){
  if(objective.type==='yield')return state.seasonStats.yield;
  if(objective.type==='harvest')return state.seasonStats.harvests;
  if(objective.type==='healthy')return state.seasonStats.healthy;
  if(objective.type==='margin')return (state.seasonStats.revenue||0)-(state.seasonStats.cost||0);
  if(objective.type==='research')return state.rp-(state.seasonStartRp||0);
  return 0;
}
function missionFor(season,challengeId='standard'){
  const ch=challengeForMission(challengeId),plots=ch.plots||PLOT_COUNT,tier=Math.min(8,Math.floor((Math.max(1,season)-1)/2));
  const yieldPerPlot=8.2+tier*.55+(ch.pressure||0)*3.2;
  const primary={type:'yield',target:Math.round(plots*yieldPerPlot),text:'Hasil',unit:'kg'};
  const secondary=season%2
    ?{type:'healthy',target:Math.max(2,Math.ceil(plots*(.35+Math.min(.18,tier*.025)))),text:'Panen sehat ≥80',unit:'petak'}
    :{type:'harvest',target:Math.max(3,Math.ceil(plots*(.62+Math.min(.16,tier*.02)))),text:'Petak dipanen',unit:'petak'};
  const objectives=[primary,secondary];
  if(season>=3&&plots>=12)objectives.push(season%3===0
    ?{type:'margin',target:25000+tier*8000,text:'Margin',unit:'Rp'}
    :{type:'research',target:4+Math.ceil(tier/2),text:'Riset baru',unit:'RP'});
  return {type:'contract',text:'Kontrak musim',unit:'target',objectives};
}
function missionObjectives(){return state.mission?.type==='contract'?(state.mission.objectives||[]):[state.mission];}
function missionValue(){
  const objectives=missionObjectives();
  if(state.mission?.type==='contract')return objectives.filter(item=>objectiveValue(item)>=item.target).length;
  return objectiveValue(objectives[0]);
}
function missionDone(){const objectives=missionObjectives();return objectives.length>0&&objectives.every(item=>objectiveValue(item)>=item.target);}
function missionRatio(){
  const objectives=missionObjectives();if(!objectives.length)return 0;
  return objectives.reduce((sum,item)=>sum+Math.min(1,Math.max(0,objectiveValue(item))/Math.max(1,item.target)),0)/objectives.length;
}
function missionDisplay(){
  const objectives=missionObjectives();
  if(state.mission?.type!=='contract'){
    const item=objectives[0];return {title:item.text+' '+item.target+' '+item.unit,progress:round(objectiveValue(item),1)+'/'+item.target+(missionDone()?' ✓':'')};
  }
  const done=objectives.filter(item=>objectiveValue(item)>=item.target).length;
  const compact=objectives.map(item=>{
    const value=objectiveValue(item),label=item.type==='margin'?formatRupiah(item.target):item.target+' '+item.unit;
    return (value>=item.target?'✓':'•')+item.text+' '+label;
  }).join(' · ');
  return {title:compact,progress:done+'/'+objectives.length+' target'};
}
function pressureLevel(){
  const carry=state?.fieldPressure||{},ch=activeChallenge?.()||CHALLENGES.standard;
  const season=Math.max(1,Number(state?.season)||1),progression=Math.min(.38,(season-1)*.035);
  const carryover=Math.min(.28,(Number(carry.pathogen)||0)*.004+(Number(carry.fatigue)||0)*.003);
  return round(1+progression+carryover+Number(ch.pressure||0),2);
}
function weatherMemoryUpdate(weatherId){
  const m=state.weatherMemory||{hot:0,wet:0,dry:0};
  m.hot=weatherId==='hot'?m.hot+1:0;
  m.wet=['rain','storm','humid'].includes(weatherId)?m.wet+1:0;
  m.dry=['hot','clear','breeze'].includes(weatherId)?m.dry+1:0;
  state.weatherMemory=m;return m;
}
function pressureLabel(){
  const p=pressureLevel(),m=state.weatherMemory||{};
  const streak=m.hot>=2?' · Gelombang panas ×'+m.hot:m.wet>=2?' · Basah ×'+m.wet:m.dry>=3?' · Kering ×'+m.dry:'';
  return 'Tekanan '+p.toFixed(2)+'×'+streak;
}
function freshState(){
  const env=newEnvironment(1),comfort={thumb:'right',density:'auto',battery:false,haptic:'light',colorSafe:false,musicVolume:.65,uiVolume:.75,attention:false,lastView:'field',lastSeenAt:Date.now()};
  return {
    version:5,season:1,day:1,maxDay:MAX_DAY,coins:150000,rp:0,xp:0,level:1,focus:4,sound:true,musicTrack:'morning',marketPrice:rollMarketPrice(1,env.id,'zero'),comfort,species:'maize',simulationSeed:hashString('academy:'+Date.now()),seasonStartRp:0,fieldPressure:{pathogen:0,fatigue:0},weatherMemory:{hot:0,wet:0,dry:0},
    field:Array.from({length:PLOT_COUNT},()=>null),plotRegistry:makePlotRegistry(),plotUse:Array.from({length:PLOT_COUNT},()=> 'commercial'),vault:structuredClone(STARTER_SEEDS),selectedPlot:0,selectedSeedId:'seed-aruna',
    discoveredTraits:unique(STARTER_SEEDS.flatMap(seed=>seed.traits)),achievements:[],lore:[],
    env,weather:rollWeather(env),mission:missionFor(1,'standard'),
    seasonStats:{yield:0,harvests:0,healthy:0,maxYield:0,failed:0,revenue:0,cost:0},seasonBest:null,pendingEvent:null,
    log:[{day:1,text:'Akademi aktif: 3 kelompok × 8 petak. Produksi, penelitian, dan pemuliaan dapat berjalan bersamaan.'}],history:[],
    location:'zero',unlockedLocations:['zero'],tech:[],expedition:null,expeditionHistory:[],genomePuzzle:null,
    challenge:'standard',monoSeedId:null,daily:null,legacy:0,legacyScore:0,records:{},lineage:[],eventFlags:{},
    rival:RIVALS[0].id,rivalTarget:0,rivalWins:0,irrigationUses:0,collection:{environments:[],bosses:[],locations:['zero']},experiment:null,experimentHistory:[],competition:null,selectionPool:[],selectionMode:'index',learning:{xp:0,completed:[],reviewed:[],correct:0,attempts:0}
  };
}
function load(){
  try{
    const raw=JSON.parse(localStorage.getItem(STORAGE)||'null');
    if(!raw)return freshState();
    const base=freshState(),hadMusicPreference=Object.prototype.hasOwnProperty.call(raw,'musicTrack'),merged={...base,...raw,version:5};
    if(!hadMusicPreference){merged.musicTrack='morning';merged.sound=true;}
    if((Number(raw.version)||2)<3&&Number(raw.coins)<10000)merged.coins=Math.round((Number(raw.coins)||78)*LEGACY_COIN_RP);
    merged.comfort={...base.comfort,...(raw.comfort||{}),lastSeenAt:Number(raw.comfort?.lastSeenAt||raw.lastSeenAt||Date.now())};
    merged.marketPrice=Number(raw.marketPrice)||rollMarketPrice(merged.season,merged.env?.id,merged.location);
    merged.level=levelFromXp(merged.xp||0);
    if(!Array.isArray(merged.field))merged.field=Array.from({length:PLOT_COUNT},()=>null);else if(merged.field.length<PLOT_COUNT)merged.field=[...merged.field,...Array.from({length:PLOT_COUNT-merged.field.length},()=>null)];else if(merged.field.length>PLOT_COUNT)merged.field=merged.field.slice(0,PLOT_COUNT);
    merged.plotRegistry=Array.isArray(raw.plotRegistry)&&raw.plotRegistry.length===PLOT_COUNT?raw.plotRegistry:makePlotRegistry();
    merged.plotUse=Array.isArray(raw.plotUse)&&raw.plotUse.length===PLOT_COUNT?raw.plotUse.map(use=>PLOT_USES[use]?use:'commercial'):Array.from({length:PLOT_COUNT},()=> 'commercial');
    merged.species=SPECIES[raw.species]?raw.species:'maize';
    merged.simulationSeed=Number(raw.simulationSeed)||hashString('academy:'+String(raw.season||1));
    if(!Array.isArray(merged.vault)||!merged.vault.length)merged.vault=structuredClone(STARTER_SEEDS);
    merged.vault=merged.vault.map(seed=>({...seed,stock:Math.max(0,Number.isFinite(Number(seed.stock))?Math.round(Number(seed.stock)):(seed.parents?.length?6:24)),viability:clamp(Number(seed.viability)||96,0,100),ageSeasons:Math.max(0,Math.round(Number(seed.ageSeasons)||0)),genome:normalizeGenome(seed.genome,seed.id,merged.simulationSeed)}));
    merged.field=merged.field.map((crop,index)=>{
      if(!crop)return null;
      const seed={...(crop.seed||{}),genome:normalizeGenome(crop.seed?.genome,crop.seed?.id||('plot-'+index),merged.simulationSeed)};
      const uidValue=crop.uid||('legacy-plant-'+index);
      return {...crop,uid:uidValue,seed,samples:Array.isArray(crop.samples)&&crop.samples.length?crop.samples:makeSubsamples({plotUid:merged.plotRegistry?.[index]?.uid||('P'+index),plantUid:uidValue,species:crop.species||merged.species,simulationSeed:merged.simulationSeed})};
    });
    merged.tech=Array.isArray(merged.tech)?merged.tech:[];
    merged.unlockedLocations=Array.isArray(merged.unlockedLocations)?merged.unlockedLocations:['zero'];
    merged.lineage=Array.isArray(merged.lineage)?merged.lineage:[];
    merged.records=merged.records&&typeof merged.records==='object'?merged.records:{};
    merged.eventFlags=merged.eventFlags&&typeof merged.eventFlags==='object'?merged.eventFlags:{};
    merged.collection={...base.collection,...(merged.collection||{})};
    merged.fieldPressure={...base.fieldPressure,...(raw.fieldPressure||{})};
    merged.weatherMemory={...base.weatherMemory,...(raw.weatherMemory||{})};
    merged.seasonStartRp=Number.isFinite(Number(raw.seasonStartRp))?Number(raw.seasonStartRp):Number(merged.rp||0);
    merged.selectionPool=(Array.isArray(raw.selectionPool)?raw.selectionPool:[]).map(item=>({...item,seed:item?.seed?{...item.seed,stock:Math.max(0,Number(item.seed.stock)||6),viability:clamp(Number(item.seed.viability)||97,0,100),ageSeasons:Math.max(0,Number(item.seed.ageSeasons)||0),genome:normalizeGenome(item.seed.genome,item.seed.id||item.id,merged.simulationSeed)}:item.seed}));
    merged.experimentHistory=Array.isArray(raw.experimentHistory)?raw.experimentHistory:[];
    merged.learning={...base.learning,...(raw.learning||{})};
    merged.learning.completed=Array.isArray(merged.learning.completed)?merged.learning.completed:[];
    merged.learning.reviewed=Array.isArray(merged.learning.reviewed)?merged.learning.reviewed:[];
    merged.seasonStats={...base.seasonStats,...(merged.seasonStats||{})};
    merged.challenge=CHALLENGES[merged.challenge]?merged.challenge:'standard';
    merged.location=LOCATIONS[merged.location]?merged.location:'zero';
    merged.maxDay=CHALLENGES[merged.challenge].maxDay;
    merged.focus=Math.min(merged.focus??4,Math.min(7,4+Math.floor((Math.max(1,merged.level)-1)/3)+(merged.legacy>0?1:0)));
    return merged;
  }catch{return freshState();}
}
let state=load(),resumeGapMs=Math.max(0,Date.now()-(Number(state.comfort?.lastSeenAt)||Date.now())),toastTimer=0,audioContext=null,activeFieldTool='',harvestCombo=0,undoState=null,undoTimer=0,notificationQueue=[],interactionBusy=false,replantCache=null,lastProgressFingerprint='';
const breedingCup=createBreedingCup({getState:()=>state,esc,uid,randomize:randomizedExperimentUnits,save,render,openModal:openMetaModal,toast,addLog,setTool:value=>{activeFieldTool=value;},sendToStat:sendExperimentToStat,openExperiment});

function cloudProgressState(source=state){
  const copy=structuredClone(source);
  delete copy.comfort;delete copy.sound;delete copy.musicTrack;delete copy.selectedPlot;
  return copy;
}
function progressFingerprint(value=cloudProgressState()){
  const raw=typeof value==='string'?value:JSON.stringify(value);
  return raw.length.toString(36)+'-'+hashString(raw).toString(36);
}
function exportCloudSave(){return cloudProgressState();}
function importCloudSave(remote){
  if(!remote||typeof remote!=='object'||Array.isArray(remote))return false;
  const localPrefs={
    comfort:structuredClone(state.comfort||freshState().comfort),
    sound:state.sound,
    musicTrack:state.musicTrack,
    selectedPlot:state.selectedPlot
  };
  try{
    localStorage.setItem(STORAGE,JSON.stringify({...structuredClone(remote),...localPrefs}));
    state=load();
    clearUndo();replantCache=null;activeFieldTool='';
    lastProgressFingerprint=progressFingerprint();
    applyComfortSettings();render();updateCrossPreview();notifyGameProfile(true);
    document.dispatchEvent(new CustomEvent('fieldzero-cloud-applied',{detail:{fingerprint:lastProgressFingerprint}}));
    return true;
  }catch{return false;}
}
function gameProgressSummary(value=state){
  const field=Array.isArray(value?.field)?value.field:[],history=Array.isArray(value?.history)?value.history:[],vault=Array.isArray(value?.vault)?value.vault:[];
  return {
    season:Math.max(1,Number(value?.season)||1),day:Math.max(1,Number(value?.day)||1),level:Math.max(1,Number(value?.level)||1),
    coins:Math.max(0,Number(value?.coins)||0),rp:Math.max(0,Number(value?.rp)||0),xp:Math.max(0,Number(value?.xp)||0),
    planted:field.filter(Boolean).length,history:history.length,vault:vault.length,legacy:Math.max(0,Number(value?.legacy)||0)
  };
}
function isFreshProgress(value=state){
  const p=gameProgressSummary(value);
  return p.season===1&&p.day===1&&p.level===1&&p.xp===0&&p.rp===0&&p.legacy===0&&p.planted===0&&p.history===0&&p.vault<=STARTER_SEEDS.length;
}
function save(){
  try{localStorage.setItem(STORAGE,JSON.stringify(state));}catch{}
  const fingerprint=progressFingerprint();
  if(lastProgressFingerprint&&fingerprint!==lastProgressFingerprint){
    document.dispatchEvent(new CustomEvent('fieldzero-save-change',{detail:{fingerprint}}));
  }
  lastProgressFingerprint=fingerprint;
}
function haptic(ms=8){
  if(state.comfort?.haptic==='off')return;
  const amount=state.comfort?.haptic==='normal'?Math.max(12,ms):Math.min(8,ms);
  try{navigator.vibrate?.(amount);}catch{}
}
function beep(freq=420,duration=.045){
  if(!state.sound||state.comfort?.battery)return;
  try{
    audioContext??=new (window.AudioContext||window.webkitAudioContext)();
    const osc=audioContext.createOscillator(),gain=audioContext.createGain(),volume=Math.max(0,Math.min(1,Number(state.comfort?.uiVolume??.75)));
    osc.frequency.value=freq;gain.gain.value=.025*volume;osc.connect(gain);gain.connect(audioContext.destination);osc.start();
    gain.gain.exponentialRampToValueAtTime(.0001,audioContext.currentTime+duration);osc.stop(audioContext.currentTime+duration);
  }catch{}
}
function showToast(message){
  const el=$('#toast');if(!el)return;el.textContent=message;el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),1800);
}
function toast(message){
  if(interactionBusy){notificationQueue.push(String(message));return;}
  showToast(message);
}
function flushNotifications(){
  if(interactionBusy||!notificationQueue.length)return;
  const items=notificationQueue.splice(0,3),suffix=notificationQueue.length?' +'+notificationQueue.length:'';
  showToast(items.join(' · ')+suffix);
}
function clearUndo(){
  undoState=null;clearTimeout(undoTimer);undoTimer=0;
  const box=$('#undoToast');if(box)box.hidden=true;
}
function offerUndo(snapshot,label,replay=null){
  if(activeChallenge().noUndo){clearUndo();toast('Iron Field · keputusan tidak dapat diurungkan');return;}
  clearUndo();undoState={snapshot,label,replay,expires:Date.now()+6000};
  const box=$('#undoToast'),text=$('#undoText');if(!box||!text)return;
  text.textContent=label+' diterapkan';box.hidden=false;
  undoTimer=setTimeout(clearUndo,6000);
}
function undoLastAction(){
  if(!undoState||Date.now()>undoState.expires)return clearUndo();
  const replay=undoState.replay;state=structuredClone(undoState.snapshot);if(replay)replantCache={...replay,expires:Date.now()+12000};
  clearUndo();applyComfortSettings();render();toast('Aksi diurungkan');
}
function applyComfortSettings(){
  const c=state.comfort||{};
  document.body.classList.toggle('thumb-left',c.thumb==='left');
  document.body.classList.toggle('density-auto',c.density==='auto');
  document.body.classList.toggle('density-compact',c.density==='compact');
  document.body.classList.toggle('density-large',c.density==='large');
  document.body.classList.toggle('battery-saver',!!c.battery);
  document.body.classList.toggle('color-safe',!!c.colorSafe);
  setMusicVolume(c.battery?0:Number(c.musicVolume??.65)*.16);
  if(c.battery&&isMusicPlaying())stopMusic();
}
function updateComfort(patch){
  state.comfort={...state.comfort,...patch};applyComfortSettings();save();renderHud();
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
function notifyGameProfile(force=false){
  document.dispatchEvent(new CustomEvent('fieldzero-profile',{detail:{...gameProfile(),_forceSync:force}}));
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

const STAT_IMPORT_KEY='agrotik_stat_import_queue_v1';
function experimentUnit(index){return state.experiment?.units?.find(unit=>unit.plot===index)||null;}
function experimentTreatment(unit){return unit&&state.experiment?.treatments?.find(item=>item.id===unit.treatmentId)||null;}
function experimentSeedForPlot(index){
  if(state.experiment?.kind!=='genotype')return null;
  const treatment=experimentTreatment(experimentUnit(index));return treatment?.seedId?state.vault.find(seed=>seed.id===treatment.seedId)||null:null;
}
function experimentBadge(index){
  const unit=experimentUnit(index),treatment=experimentTreatment(unit);if(!unit||!treatment)return '';
  const repLabel=state.experiment.design==='rak'?'K':'U';
  return `<span class="experiment-badge ${unit.applied?'applied':''}" title="${esc(treatment.name)} · ${repLabel}${unit.rep}">${esc(treatment.code)}·${repLabel}${unit.rep}${unit.applied?'✓':''}</span>`;
}
function seededShuffle(list,seed){
  const out=[...list];let x=Number(seed)||1;
  for(let i=out.length-1;i>0;i--){x=hashString(x+':'+i);const j=Math.floor(seededUnit(x)*(i+1));[out[i],out[j]]=[out[j],out[i]];}
  return out;
}
function randomizedExperimentUnits(design,treatments,reps,seed=state.simulationSeed){
  const units=[];
  if(design==='rak'){
    const blocks=BLOCK_COUNT;
    for(let block=0;block<blocks;block++){
      const slots=seededShuffle(Array.from({length:PLOTS_PER_BLOCK},(_,i)=>block*PLOTS_PER_BLOCK+i),hashString(seed+':slot:'+block)).slice(0,treatments.length);
      const order=seededShuffle(treatments,hashString(seed+':trt:'+block));
      order.forEach((treatment,i)=>units.push({plot:slots[i],treatmentId:treatment.id,rep:block+1,block:block+1,applied:false,observations:{},timeline:[],missingStatus:''}));
    }
  }else{
    const pool=[];for(const treatment of treatments)for(let i=0;i<reps;i++)pool.push(treatment);
    const order=seededShuffle(pool,hashString(seed+':ral:trt')),slots=seededShuffle(Array.from({length:PLOT_COUNT},(_,i)=>i),hashString(seed+':ral:slot')).slice(0,order.length),counts={};
    order.forEach((treatment,i)=>{counts[treatment.id]=(counts[treatment.id]||0)+1;units.push({plot:slots[i],treatmentId:treatment.id,rep:counts[treatment.id],block:plotMeta(slots[i]).block,applied:false,observations:{},timeline:[],missingStatus:''});});
  }
  return units.sort((a,b)=>a.plot-b.plot);
}
function experimentTreatments(kind,count,custom=''){
  if(kind==='genotype')return state.vault.slice(0,count).map((seed,index)=>({id:'G'+(index+1),code:'G'+(index+1),name:seed.name,seedId:seed.id,effects:{}}));
  if(kind==='nitrogen'){
    const levels=[0,50,100,150,200,250];return levels.slice(0,count).map((dose,index)=>({id:'N'+index,code:'N'+dose,name:'N '+dose+' kg/ha',dose,effects:{yield:dose===0?.9:dose>=250?.98:1,nLoss:dose>=200?1.04:.98}}));
  }
  if(kind==='water'){
    const levels=[50,75,100,125];return levels.slice(0,count).map((level,index)=>({id:'W'+level,code:'W'+level,name:'Air '+level+'%',effects:{waterDaily:(level-100)/8,waterLoss:level<100?1.08:level>100?.94:1,yield:level===100?1.03:level===75?1:.96}}));
  }
  if(kind==='spacing'){
    const levels=[['J1','50×20 cm',.95,1.08],['J2','70×20 cm',1.02,1],['J3','70×25 cm',1.04,.96],['J4','75×25 cm',1,.94]];
    return levels.slice(0,count).map(([code,name,yieldFx,waterLoss])=>({id:code,code,name,effects:{yield:yieldFx,waterLoss}}));
  }
  if(kind==='mulch'){
    const levels=[['M0','Tanpa mulsa',1,1,1],['M1','Mulsa organik',.88,.96,1.02],['M2','Mulsa plastik',.78,1.04,1.04],['M3','Plastik + organik',.72,1.02,1.06]];
    return levels.slice(0,count).map(([code,name,waterLoss,diseaseRisk,yieldFx])=>({id:code,code,name,effects:{waterLoss,diseaseRisk,yield:yieldFx}}));
  }
  if(kind==='soil'){
    const levels=[['S0','Kontrol',1,1],['S1','Kompos',.94,1.04],['S2','Pengapuran',.98,1.02],['S3','Kompos + kapur',.91,1.06]];
    return levels.slice(0,count).map(([code,name,nLoss,yieldFx])=>({id:code,code,name,effects:{nLoss,yield:yieldFx,growth:yieldFx}}));
  }
  if(kind==='disease'){
    const levels=[['H0','Kontrol',1,1],['H1','Sanitasi',.8,.99],['H2','Biokontrol',.68,.98],['H3','Ambang pengendalian',.58,.97]];
    return levels.slice(0,count).map(([code,name,diseaseRisk,yieldFx])=>({id:code,code,name,effects:{diseaseRisk,yield:yieldFx}}));
  }
  const names=String(custom||'').split(',').map(x=>x.trim()).filter(Boolean);
  return Array.from({length:count},(_,index)=>({id:'P'+(index+1),code:'P'+(index+1),name:names[index]||('P'+(index+1)),effects:{}}));
}
function applyTreatmentModel(crop,treatment){
  if(!crop||!treatment)return;
  crop.experimentEffects={...(treatment.effects||{})};
  if(Number.isFinite(Number(treatment.dose))){
    const bonus=Math.min(50,Math.round(Number(treatment.dose)/5));crop.n=clamp(crop.n+bonus);
    if(Number(treatment.dose)>=250){crop.stress=clamp(crop.stress+5,0,120);}
  }
}
function createExperiment({name,question,design,kind,count,reps,custom,parameters,frequency=2}){
  if(design==='rak')reps=BLOCK_COUNT;
  const treatments=experimentTreatments(kind,count,custom),total=treatments.length*reps;
  if(state.field.some(Boolean))throw Error('Kosongkan lahan sebelum membuat rancangan baru.');
  if(treatments.length<2||reps<2||total>fieldLimit())throw Error('Gunakan ≥2 perlakuan, ≥2 ulangan, total tidak boleh melebihi petak aktif.');
  if(design==='rak'&&treatments.length>PLOTS_PER_BLOCK)throw Error('RAK awal maksimal 8 perlakuan agar setiap perlakuan muncul sekali pada Kelompok I–III.');
  if(kind==='genotype'&&treatments.length<count)throw Error('Benih di Koleksi Benih belum cukup.');
  const params=unique(String(parameters||'TT,DB,JD,Penyakit,Hasil').split(',').map(x=>x.trim()).filter(Boolean)).slice(0,10),seed=hashString(state.simulationSeed+':'+state.season+':'+String(name||'rancob'));
  state.plotUse=state.plotUse.map(()=> 'commercial');
  state.experiment={id:uid('exp'),name:String(name||'Rancob Field Zero').trim().slice(0,50)||'Rancob Field Zero',question:String(question||'Apakah perlakuan memengaruhi respons tanaman?').trim().slice(0,180),design,kind,treatments,reps,controlId:kind==='genotype'?'':(treatments[0]?.id||''),parameters:params.length?params:['Hasil'],measureEvery:Math.max(1,Math.min(4,Number(frequency)||2)),measurementUnitCost:250,observationCost:0,seed,randomization:1,units:randomizedExperimentUnits(design,treatments,reps,seed),createdAt:new Date().toISOString(),modelVersion:ACADEMY_MODEL_VERSION,researchRewarded:false};
  state.experiment.units.forEach(unit=>{state.plotUse[unit.plot]='research';});
  state.selectedPlot=state.experiment.units[0]?.plot||0;activeFieldTool='';
  awardLearning('design:unit',4);awardLearning('design:random',6);awardLearning('design:rep',5);if(design==='rak')awardLearning('design:block',7);
  addLog('📐 '+state.experiment.design.toUpperCase()+' · '+treatments.length+' perlakuan × '+reps+' · petak lain tetap untuk produksi.');render();openExperiment();
}
function applyExperimentTreatment(index){
  const exp=state.experiment,unit=experimentUnit(index),treatment=experimentTreatment(unit);if(!exp||!unit||!treatment)return false;
  if(exp.kind==='genotype'){toast('🌱 = '+treatment.code);return false;}
  if(unit.applied){toast('🧪✓');return false;}
  unit.applied=true;
  const crop=state.field[index];if(crop)applyTreatmentModel(crop,treatment);
  addLog(plotMeta(index).uid+': 🧪 '+treatment.name+'.');beep(500,.05);render();return true;
}
function applyPendingExperimentEffect(index,crop){
  const exp=state.experiment,unit=experimentUnit(index),treatment=experimentTreatment(unit);if(!exp||!unit||!treatment)return;
  if(exp.kind==='genotype'){unit.applied=true;crop.experimentEffects={};return;}
  if(unit.applied)applyTreatmentModel(crop,treatment);
}
function biologicalDay(){const species=SPECIES[state.species]||SPECIES.maize;return Math.max(1,Math.round((state.day/state.maxDay)*species.maturityDays));}
function parameterValue(parameter,values){
  const key=String(parameter).toLocaleLowerCase('id-ID').replace(/[^a-z0-9]/g,'');
  if(key==='tt'||key.includes('tinggitanaman')||key==='plantheight')return values.tt;
  if(key==='db'||key.includes('diameterbatang')||key==='stemdiameter')return values.db;
  if(key==='jd'||key.includes('jumlahdaun')||key==='leafnumber')return values.jd;
  if(key.includes('hasil')||key==='yield')return values.hasil;
  if(key.includes('kesehatan')||key==='health')return values.kesehatan;
  if(key.includes('stres')||key==='stress')return values.stres;
  if(key.includes('penyakit')||key==='disease')return values.penyakit;
  if(key==='air'||key.includes('water'))return values.air;
  if(key.includes('nitrogen')||key==='n')return values.nitrogen;
  if(key==='ua'||key.includes('anthesis'))return values.anthesis;
  if(key==='us'||key.includes('silking'))return values.silking;
  if(key==='asi'||key.includes('anthesissilking'))return values.asi;
  if(key==='pt'||key.includes('panjangtongkol'))return values.pt;
  if(key==='dt'||key.includes('diametertongkol'))return values.dt;
  if(key==='jb'||key.includes('jumlahbiji'))return values.jb;
  if(key==='bb'||key.includes('bobotbiji')||key.includes('bobotbuah'))return values.bb;
  if(key==='ka'||key.includes('kadarair'))return values.ka;
  if(key==='ub'||key.includes('umurberbunga'))return values.ub;
  if(key==='jbu'||key.includes('jumlahbuah'))return values.jbu;
  if(key==='pb'||key.includes('panjangbuah'))return values.pb;
  if(key==='dbu'||key.includes('diameterbuah'))return values.dbu;
  return '';
}
function simulatedObservationValues(index,crop,yieldValue=''){
  const growth=clamp(crop.growth,0,110),bio=biologicalDay(),species=crop.species||state.species;
  if(species==='maize'){
    if(growth>=52&&!crop.anthesisBioDay)crop.anthesisBioDay=bio;
    if(growth>=58&&!crop.silkingBioDay)crop.silkingBioDay=bio;
  }
  if(!Array.isArray(crop.samples)||!crop.samples.length)crop.samples=makeSubsamples({plotUid:plotMeta(index).uid,plantUid:crop.uid,species,simulationSeed:state.simulationSeed});
  const sampleRows=crop.samples.filter(sample=>sample.alive!==false).map(sample=>({id:sample.id,values:sampleMeasurements({species,crop,sample,bioDay:bio,yieldValue})}));
  const agg=parameter=>aggregateSamples(sampleRows,parameter);
  return {
    tt:agg('TT'),db:agg('DB'),jd:agg('JD'),hasil:yieldValue,
    kesehatan:round(crop.health,1),stres:round(crop.stress,1),penyakit:round(crop.disease,1),air:round(crop.water,1),nitrogen:round(crop.n,1),
    anthesis:agg('UA'),silking:agg('US'),asi:agg('ASI'),pt:agg('PT'),dt:agg('DT'),jb:agg('JB'),bb:agg('BB'),ka:agg('KA'),
    ub:agg('UB'),jbu:agg('JBu'),pb:agg('PB'),dbu:agg('DBu'),__samples:sampleRows
  };
}
function recordDailyExperimentObservation(index,crop,{yieldValue='',force=false}={}){
  const exp=state.experiment,unit=experimentUnit(index);if(!exp||!unit||!crop)return;
  unit.timeline=Array.isArray(unit.timeline)?unit.timeline:[];
  if(!force&&unit.timeline.some(row=>row.day===state.day))return;
  if(crop.health<=0){unit.missingStatus='TANAMAN MATI';unit.timeline.push({day:state.day,biologicalDay:biologicalDay(),values:{},status:'missing-dead'});return;}
  const values=simulatedObservationValues(index,crop,yieldValue),measured={};
  for(const parameter of exp.parameters){
    const value=parameterValue(parameter,values);
    if(value!==''&&value!==undefined){measured[parameter]=value;if(!String(parameter).toLowerCase().includes('hasil')||yieldValue!=='')unit.observations[parameter]=value;}
  }
  unit.timeline.push({day:state.day,biologicalDay:biologicalDay(),values:measured,samples:values.__samples||[],status:'observed'});
}
function runScheduledExperimentObservation(){
  const exp=state.experiment;if(!exp||state.day<=1||state.day%exp.measureEvery!==0)return;
  const units=exp.units.filter(unit=>state.field[unit.plot]),measureParams=exp.parameters.filter(parameter=>!String(parameter).toLocaleLowerCase('id-ID').includes('hasil'));
  if(!units.length||!measureParams.length)return;
  const cost=units.length*measureParams.length*(exp.measurementUnitCost||250);
  if(state.coins<cost){
    for(const unit of units){
      unit.missingStatus='ANGGARAN PENGAMATAN';
      unit.timeline.push({day:state.day,biologicalDay:biologicalDay(),values:{},status:'missing-budget'});
    }
    addLog('📋 Pengamatan H'+state.day+' terlewat: anggaran kurang '+formatRupiah(cost)+'.');return;
  }
  state.coins-=cost;state.seasonStats.cost=(state.seasonStats.cost||0)+cost;exp.observationCost=(exp.observationCost||0)+cost;
  units.forEach(unit=>recordDailyExperimentObservation(unit.plot,state.field[unit.plot]));
  addLog('📋 Pengamatan H'+state.day+' · '+units.length+' petak · '+formatRupiah(cost)+'.');
}
function recordExperimentObservation(index,crop,yieldValue){
  const unit=experimentUnit(index);if(!unit)return;
  recordDailyExperimentObservation(index,crop,{yieldValue,force:true});
  const values=simulatedObservationValues(index,crop,yieldValue);
  for(const parameter of state.experiment.parameters){const value=parameterValue(parameter,values);if(value!==''&&value!==undefined)unit.observations[parameter]=value;}
  unit.missingStatus='';
}
function experimentDataset(){
  const exp=state.experiment;if(!exp)return null;
  const repHeader=exp.design==='rak'?'Kelompok':'Ulangan',species=SPECIES[state.species]||SPECIES.maize;
  const headers=['Perlakuan',repHeader,'ExperimentID','Musim','PlotUID','PlantUID','Petak','Aktivitas','TingkatData','Spesies','Varietas/Galur','Generasi',...exp.parameters,'StatusData','CatatanStatistik','ModelSimulasi'];
  const rows=exp.units.map(unit=>{
    const treatment=experimentTreatment(unit),crop=state.field[unit.plot],material=unit.material||{},seed=crop?.seed||(material.seedId?state.vault.find(item=>item.id===material.seedId):null)||(treatment?.seedId?state.vault.find(item=>item.id===treatment.seedId):null),missing=exp.parameters.some(parameter=>String(unit.observations?.[parameter]??'').trim()==='')?'BELUM LENGKAP':'LENGKAP';
    return [treatment?.name||treatment?.code||'',String(unit.rep),exp.id,String(state.season),plotMeta(unit.plot).uid,crop?.uid||material.plantUid||'',String(unit.plot+1),plotUse(unit.plot),'unit_percobaan',species.name,seed?.name||material.seedName||'',String(seed?.generation??material.generation??''),...exp.parameters.map(parameter=>String(unit.observations?.[parameter]??'')),missing,'ANOVA memakai unit percobaan; tanaman sampel adalah subsampel',ACADEMY_MODEL_VERSION];
  });
  return {name:'SIMULASI · '+exp.name,headers,rows,plant:`${species.name} (${species.latin}) · DATA SIMULASI GAME`,treatment:`DATA SIMULASI GAME · ${exp.design.toUpperCase()} · ${exp.treatments.length} perlakuan · ${exp.reps} ${exp.design==='rak'?'kelompok':'ulangan'} · Pertanyaan: ${exp.question||'—'}`,design:exp.design,simulation:true,dataLabel:'DATA SIMULASI GAME'};
}
function experimentRawDataset(){
  const exp=state.experiment;if(!exp)return null;
  const species=SPECIES[state.species]||SPECIES.maize,repHeader=exp.design==='rak'?'Kelompok':'Ulangan';
  const headers=['ExperimentID','Musim',repHeader,'PlotUID','PlantUID','SamplePlantUID','Petak','Aktivitas','TingkatData','PeranStatistik','Spesies','Varietas/Galur','Generasi','Perlakuan','HariGame','HSTSimulasi','Parameter','Nilai','StatusData','ModelSimulasi'];
  const rows=[];
  for(const unit of exp.units){
    const treatment=experimentTreatment(unit),material=unit.material||{},seed=state.field[unit.plot]?.seed||(material.seedId?state.vault.find(item=>item.id===material.seedId):null)||(treatment?.seedId?state.vault.find(item=>item.id===treatment.seedId):null),plantUid=material.plantUid||state.field[unit.plot]?.uid||'';
    for(const entry of unit.timeline||[]){
      for(const [parameter,value] of Object.entries(entry.values||{}))rows.push([
        exp.id,String(state.season),String(unit.rep),plotMeta(unit.plot).uid,plantUid,'',String(unit.plot+1),plotUse(unit.plot),'unit_percobaan','ULANGAN/UNIT ANALISIS',species.name,seed?.name||material.seedName||'',String(seed?.generation??material.generation??''),treatment?.name||treatment?.code||'',String(entry.day),String(entry.biologicalDay),parameter,String(value??''),entry.status||'observed',ACADEMY_MODEL_VERSION
      ]);
      for(const sample of entry.samples||[])for(const [parameter,value] of Object.entries(sample.values||{})){
        if(value===''||value===undefined)continue;
        rows.push([
          exp.id,String(state.season),String(unit.rep),plotMeta(unit.plot).uid,plantUid,sample.id,String(unit.plot+1),plotUse(unit.plot),'tanaman_individu','SUBSAMPEL · BUKAN ULANGAN',species.name,seed?.name||material.seedName||'',String(seed?.generation??material.generation??''),treatment?.name||treatment?.code||'',String(entry.day),String(entry.biologicalDay),parameter,String(value),entry.status||'observed',ACADEMY_MODEL_VERSION
        ]);
      }
    }
  }
  const blank=[exp.id,String(state.season),'','','','','','','pengamatan_berulang','BUKAN DATA ANALISIS','','','','','','','','','BELUM ADA PENGAMATAN',ACADEMY_MODEL_VERSION];
  return {name:'SIMULASI · '+exp.name+' · data mentah',headers,rows:rows.length?rows:[blank],plant:`${species.name} (${species.latin}) · DATA SIMULASI GAME`,treatment:'DATA MENTAH + SUBSAMPEL · DATA SIMULASI GAME',design:exp.design,simulation:true,dataLabel:'DATA SIMULASI GAME'};
}
function experimentQualityScore(){
  const exp=state.experiment;if(!exp)return 0;
  const complete=exp.units.filter(unit=>exp.parameters.every(parameter=>String(unit.observations?.[parameter]??'').trim()!=='')).length/Math.max(1,exp.units.length);
  const applied=exp.kind==='genotype'?1:exp.units.filter(unit=>unit.applied).length/Math.max(1,exp.units.length);
  const counts=Object.values(exp.units.reduce((acc,unit)=>(acc[unit.treatmentId]=(acc[unit.treatmentId]||0)+1,acc),{})),balanced=counts.length&&Math.max(...counts)===Math.min(...counts)?1:.6;
  return Math.round((complete*.55+applied*.25+balanced*.2)*100);
}
function sendExperimentToStat(){
  const summary=experimentDataset(),raw=experimentRawDataset();if(!summary||!raw)return;
  const score=experimentQualityScore();
  if(!state.experiment.researchRewarded&&score>=60){const grant=Math.max(2,Math.round(score/15));state.rp+=grant;state.experiment.researchRewarded=true;addLog('📐 Mutu protokol '+score+'% · hibah +'+grant+' RP.');}
  try{
    localStorage.setItem(STAT_IMPORT_KEY,JSON.stringify({version:2,source:'field-zero',design:summary.design,createdAt:new Date().toISOString(),datasets:[raw,summary]}));
    save();location.href='/stat/?from=field-zero&design='+encodeURIComponent(summary.design);
  }catch{toast('Gagal menyiapkan dataset');}
}
function experimentTableHtml(){
  const exp=state.experiment;if(!exp)return '';
  const repLabel=exp.design==='rak'?'K':'U';
  return `<div class="experiment-table-wrap"><table class="experiment-table"><thead><tr><th>P</th><th>Perlakuan</th><th>${repLabel}</th><th>🧪</th>${exp.parameters.map(p=>`<th>${esc(p)}</th>`).join('')}</tr></thead><tbody>${exp.units.map(unit=>{
    const t=experimentTreatment(unit);
    return `<tr><td>${unit.plot+1}</td><td>${esc(t?.code||'')}<small>${esc(t?.name||'')}</small></td><td>${unit.rep}</td><td>${unit.applied?'✓':'—'}</td>${exp.parameters.map(p=>`<td><input data-exp-plot="${unit.plot}" data-exp-param="${esc(p)}" inputmode="decimal" value="${esc(unit.observations?.[p]??'')}" placeholder="—"></td>`).join('')}</tr>`;
  }).join('')}</tbody></table></div>`;
}
function experimentSummaryHtml(){
  const exp=state.experiment,filled=exp.units.filter(unit=>exp.parameters.some(p=>String(unit.observations?.[p]??'').trim()!=='')).length;
  return `<div class="experiment-status"><span>📐 ${exp.design.toUpperCase()}</span><span>🧪 ${exp.units.filter(u=>u.applied).length}/${exp.units.length}</span><span>📋 ${filled}/${exp.units.length}</span><span>◷ /${exp.measureEvery||2} hari</span><span>Rp ${formatRupiah(exp.observationCost||0,true)}</span></div>`;
}
function openExperiment(){
  if(breedingCup.active()){breedingCup.open();return;}
  if(!state.experiment){
    openMetaModal('BELAJAR RANCOB','📐 Rancangan percobaan',`<form id="experimentForm" class="experiment-form">
      <label>Mode<select name="kind"><option value="genotype">🌱 Genetik / galur</option><option value="nitrogen">N Dosis nitrogen</option><option value="water">💧 Air</option><option value="spacing">▦ Jarak tanam</option><option value="mulch">◫ Mulsa</option><option value="soil">△ Tanah</option><option value="disease">◈ Hama/penyakit</option><option value="custom">🧪 Perlakuan bebas</option></select></label>
      <label>Rancangan<select name="design"><option value="rak">RAK</option><option value="ral">RAL</option></select></label>
      <label>Perlakuan<input name="count" type="number" min="2" max="8" value="4"></label>
      <label>Ulangan<input name="reps" type="number" min="2" max="6" value="3"><small>RAK = Kelompok I–III</small></label>
      <label>Frekuensi ukur<select name="frequency"><option value="1">Setiap hari</option><option value="2" selected>2 hari</option><option value="3">3 hari</option><option value="4">4 hari</option></select></label>
      <label class="experiment-wide">Nama<input name="name" value="Uji Field Zero"></label>
      <label class="experiment-wide">Pertanyaan<input name="question" value="Apakah perlakuan memengaruhi respons tanaman?"></label>
      <label class="experiment-wide">Nama perlakuan (opsional)<input name="custom" placeholder="P0, P1, P2, P3"></label>
      <label class="experiment-wide">Parameter<input name="parameters" value="${recommendedParameters(state.species).slice(0,10).join(',')}"></label>
      <button class="primary experiment-wide" type="submit">🎲 Randomisasi</button>
      <button class="competition-launch experiment-wide" type="button" data-breeding-cup>🏆 Breeding Cup · 24 petak</button>
    </form><p class="meta-note">RAK memakai 3 kelompok × 8 petak dan randomisasi terpisah dalam tiap kelompok. Petak yang tidak masuk percobaan tetap dapat dipakai untuk Rp produksi atau 🧬 pemuliaan.</p>`);
    $('#experimentForm').onsubmit=event=>{
      event.preventDefault();const fd=new FormData(event.currentTarget);
      try{createExperiment({name:fd.get('name'),question:fd.get('question'),design:String(fd.get('design')),kind:String(fd.get('kind')),count:Number(fd.get('count')),reps:Number(fd.get('reps')),custom:fd.get('custom'),parameters:fd.get('parameters'),frequency:Number(fd.get('frequency'))});}
      catch(error){toast(error.message);}
    };
    $('#metaModalBody').querySelector('[data-breeding-cup]').onclick=breedingCup.open;
    return;
  }
  const exp=state.experiment;
  openMetaModal('RANCOB AKTIF',exp.name,`<p class="experiment-question">${esc(exp.question||'')}</p>${experimentSummaryHtml()}${experimentTableHtml()}<div class="experiment-actions"><button data-exp-randomize>🎲 Acak ulang</button><button data-exp-learn>🎓 Statistik Lapang</button><button data-exp-reset>×</button><button data-exp-stat class="primary">📊 /stat</button></div><p class="meta-note">${exp.kind==='genotype'?'🌱 Tanam mengikuti galur hasil randomisasi.':'🧪 Terapkan perlakuan ke petak sesuai randomisasi.'} Gunakan Statistik Lapang untuk membaca F, CV, H² latihan, rerata, dan kesalahan desain sebelum membuka analisis penuh.</p>`);
  $('#metaModalBody').querySelectorAll('[data-exp-plot]').forEach(input=>input.oninput=()=>{
    const unit=experimentUnit(Number(input.dataset.expPlot));if(unit){unit.observations[input.dataset.expParam]=input.value;save();}
  });
  $('#metaModalBody').querySelector('[data-exp-randomize]').onclick=()=>{const hasData=exp.units.some(unit=>Object.values(unit.observations||{}).some(value=>String(value??'').trim()!==''));if(hasData&&!confirm('Acak ulang? Data pengamatan yang sudah ada akan dikosongkan.'))return;exp.randomization=(exp.randomization||1)+1;exp.seed=hashString(exp.seed+':'+exp.randomization);state.plotUse=state.plotUse.map(use=>use==='research'?'commercial':use);exp.units=randomizedExperimentUnits(exp.design,exp.treatments,exp.reps,exp.seed);exp.units.forEach(unit=>state.plotUse[unit.plot]='research');render();openExperiment();};
  $('#metaModalBody').querySelector('[data-exp-learn]').onclick=()=>openExperimentAnalysis();
  $('#metaModalBody').querySelector('[data-exp-reset]').onclick=()=>{if(confirm('Hapus rancangan aktif?')){state.experiment=null;activeFieldTool='';render();closeMetaModal();}};
  $('#metaModalBody').querySelector('[data-exp-stat]').onclick=sendExperimentToStat;
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
function simUnit(...parts){return seededUnit(hashString([state.simulationSeed,...parts].join(':')));}
function simPick(list,...parts){return list[Math.min(list.length-1,Math.floor(simUnit(...parts)*list.length))];}
function deterministicWeather(env,day){
  const pool=weatherPool(env.id);return pool[Math.min(pool.length-1,Math.floor(simUnit('weather',state.season,day,env.id)*pool.length))];
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
  const rival=currentRival(),loc=activeLocation(),challenge=activeChallenge(),boss=state.env?.boss?1.14:1,fieldScale=Math.max(1,(challenge.plots||PLOT_COUNT)/6);
  const noise=.94+seededUnit(hashString(state.season+':'+state.location+':'+rival.id))*0.12;
  const base=(rival.base+rival.growth*Math.max(0,state.season-1))*fieldScale*loc.yield*boss*noise;
  const recent=(state.history||[]).slice(0,3).map(item=>Number(item.yield)||0).filter(Boolean);
  const adaptive=recent.length?(recent.reduce((a,b)=>a+b,0)/recent.length)*(0.94+Math.min(.08,(state.rivalWins||0)*.012)):0;
  return round(Math.max(base,adaptive),1);
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
  clearUndo();if(!locationUnlocked(id)||!LOCATIONS[id])return;
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
  clearUndo();const challenge=CHALLENGES[id];if(!challenge||!challengeCanStart()){toast('Challenge hanya dapat diganti pada awal musim kosong');return;}
  state.challenge=id;state.daily=null;state.maxDay=challenge.maxDay;state.monoSeedId=challenge.mono?state.selectedSeedId:null;
  state.mission=missionFor(state.season,id);state.seasonStartRp=state.rp;closeMetaModal();addLog('Challenge: '+challenge.name+'.');render();
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
  const next=freshState();next.legacy=legacy;next.legacyScore=score;next.coins=180000+legacy*30000;next.rp=legacy*5;next.vault=uniqueSeeds([...structuredClone(STARTER_SEEDS),...structuredClone(carry)]);next.unlockedLocations=unlocked;next.discoveredTraits=discoveries;next.achievements=achievements;next.tech=tech;next.collection=structuredClone(state.collection);next.lineage=state.lineage.slice(-40);
  state=next;awardAchievement('legacy');closeMetaModal();$('#recapModal').hidden=true;render();toast('New Game+ '+legacy+' dimulai');
}
function uniqueSeeds(seeds){const seen=new Set();return seeds.filter(seed=>{if(seen.has(seed.id))return false;seen.add(seed.id);return true;});}
function expeditionAvailable(){return hasTech('expedition');}
function startExpedition(id){
  const ex=EXPEDITIONS[id];if(!ex||!expeditionAvailable()||state.expedition)return;
  if(state.coins<ex.cost){toast('Butuh '+formatRupiah(ex.cost));return;}
  state.coins-=ex.cost;state.seasonStats.cost=(state.seasonStats.cost||0)+ex.cost;state.expedition={id,remaining:ex.days,total:ex.days};addLog('Ekspedisi berangkat ke '+ex.name+' · '+formatRupiah(ex.cost)+'.');render();
}
function tickExpedition(){
  if(!state.expedition)return;
  state.expedition.remaining--;
  if(state.expedition.remaining>0)return;
  const ex=EXPEDITIONS[state.expedition.id],range=ex.rewardRp,reward=range[0]+Math.floor(Math.random()*(range[1]-range[0]+1));
  state.rp+=reward;let note='Ekspedisi kembali: +'+reward+' RP.';
  if(chance(.62)){
    const key='expedition-seed:'+state.season+':'+ex.name+':'+state.expeditionHistory.length,trait=ex.traits[Math.floor(simUnit(key,'trait')*ex.traits.length)],seedId=uid('seed'),seed={id:seedId,name:'Wild-'+Math.floor(100+simUnit(key,'name')*900),generation:0,traits:[trait],baseYield:round(12.5+simUnit(key,'yield')*5.5,1),vigor:round(.96+simUnit(key,'vigor')*.14,2),source:'Ekspedisi '+ex.name,parents:[],stock:8,viability:94,ageSeasons:0,genome:normalizeGenome(null,seedId,state.simulationSeed)};
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
  clearUndo();if(!hasTech('genome')){toast('Buka Genome Lab di Tech Tree');return;}
  if(state.rp<5){toast('Butuh 5 RP untuk sequencing');return;}
  state.rp-=5;state.genomePuzzle=makeGenomePuzzle();renderGenomeLab();save();
}
function solveGenome(choice){
  clearUndo();const puzzle=state.genomePuzzle;if(!puzzle)return;
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
  return ({plant:'Tanam',water:'Air',fertilize:'Pupuk',scout:'Periksa',harvest:'Panen',treatment:'Perlakuan'})[tool]||'';
}
function toolSymbol(tool){
  return ({plant:'🌱',water:'💧',fertilize:'N',scout:'◎',harvest:'🧺',treatment:'🧪'})[tool]||'•';
}
function playHint(){
  if(breedingCup.active())return {icon:'🏆',text:'Breeding Cup · lanjutkan keputusan',action:'cup'};
  if(state.pendingEvent)return {icon:'⚠',text:'Kejadian lapang · ketuk untuk tinjau',action:'event'};
  if(activeFieldTool)return {icon:'→',text:toolLabel(activeFieldTool)+' aktif · pilih petak',action:'field'};
  if(state.experiment&&state.experiment.kind!=='genotype'&&state.experiment.kind!=='competition'){
    const pending=state.experiment.units.find(unit=>!unit.applied);
    if(pending)return {icon:'🧪',text:'P'+String(pending.plot+1).padStart(2,'0')+' · '+(experimentTreatment(pending)?.code||''),action:'tool',tool:'treatment'};
  }
  const ready=state.field.findIndex(crop=>crop&&crop.health>0&&crop.growth>=100);
  if(ready>=0)return {icon:'🧺',text:'P'+String(ready+1).padStart(2,'0')+' ✓',action:'tool',tool:'harvest'};
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
  const seed=selectedSeed(),hint=playHint(),expTool=$('#experimentTool');
  if(expTool)expTool.hidden=!state.experiment||state.experiment.kind==='genotype'||state.experiment.kind==='competition';
  $('#selectedSeedName').textContent=seed?.name||'Pilih benih';
  $('#activeToolStatus').textContent=activeFieldTool?toolSymbol(activeFieldTool)+' ×':'☝ → ▦';
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
  if(hint.action==='cup'){breedingCup.open();return;}
  if(hint.action==='event'){renderEvent();return;}
  document.querySelector('.field-panel')?.scrollIntoView({behavior:'smooth',block:'start'});
}
function openSeedVault(){
  const hub=$('#labHub');hub.open=true;hub.scrollIntoView({behavior:'smooth',block:'start'});
  setTimeout(()=>document.querySelector('.vault-panel')?.scrollIntoView({behavior:'smooth',block:'center'}),120);
}
function openGameHelp(){
  openMetaModal('CARA MAIN','Rp → 📐 → 🧬 → 📊',`<div class="help-steps">
    <div><b>Rp</b><span>Produksi</span></div>
    <div><b>📐</b><span>Uji</span></div>
    <div><b>🧬</b><span>Seleksi</span></div>
  </div><p class="help-note">📊 Data percobaan dapat dibuka langsung di /stat.</p>`);
}

function seedEvidence(seed){
  const commercial=!seed?.parents?.length&&Number(seed?.generation||0)===0&&String(seed?.source||'')==='Starter';
  if(commercial)return {level:4,label:'Deskripsi varietas'};
  const tests=Number(seed?.evidenceTests||0),generation=Number(seed?.generation||0),stressTests=Number(seed?.stressTests||0),label=evidenceLabel({tests,generation,stressTests});
  return {level:label==='Relatif stabil'?4:label==='Didukung pengujian'?3:label==='Indikasi'?2:1,label};
}
function seedTraitsHtml(seed,extra=[]){
  const evidence=seedEvidence(seed),ids=unique([...(seed?.traits||[]),...extra]);
  if(evidence.level<3)return `<span class="trait-evidence level-${evidence.level}">? ${esc(evidence.label)}</span>`;
  const visible=evidence.level>=4?ids:ids.slice(0,Math.max(1,Math.ceil(ids.length/2)));
  return visible.map(id=>{const t=traitMeta(id);return `<span class="trait ${t.rarity}">${esc(t.icon)} ${esc(t.name)}</span>`;}).join('')+`<span class="trait-evidence level-${evidence.level}">${esc(evidence.label)}</span>`;
}

function renderHud(){
  state.level=levelFromXp(state.xp);
  $('#seasonValue').textContent=state.season;
  $('#dayValue').textContent=state.day+'/'+state.maxDay;
  $('#coinValue').textContent=formatRupiah(state.coins,true);$('#coinValue').title=formatRupiah(state.coins);
  $('#marketValue').textContent=formatRupiah(state.marketPrice||PRICE_REFERENCE.cornHpp)+'/kg';
  $('#marketValue').title='Acuan game: HPP '+formatRupiah(PRICE_REFERENCE.cornHpp)+'/kg · referensi pembelian Sulsel '+formatRupiah(PRICE_REFERENCE.cornSulsel)+'/kg';
  $('#focusValue').textContent=state.focus+'/'+focusMax(state.level);
  $('#rpValue').textContent=Math.round(state.rp);
  $('#levelValue').textContent=state.level;
  const progress=state.xp%120;$('#xpValue').textContent=progress+'/120';$('#xpBar').style.width=(progress/120*100)+'%';
  $('#soundToggle').setAttribute('aria-pressed',String(state.sound));
}
function renderSeason(){
  const month=state.env?.month||agroMonthForSeason(state.season);
  $('#seasonIcon').textContent=state.env.icon;$('#seasonName').textContent=monthName(month)+' · '+state.env.name;$('#seasonDesc').textContent=state.env.desc;
  $('#weatherText').textContent=WEATHER[state.weather].icon+' '+WEATHER[state.weather].name;$('#weatherEffect').textContent=WEATHER[state.weather].effect;
  const missionView=missionDisplay();$('#missionText').textContent=missionView.title;$('#missionProgress').textContent=missionView.progress;
  $('#forecastText').textContent=weatherRiskPreview()+' · '+pressureLabel();
  const cupActive=breedingCup.active(),eventPending=!!state.pendingEvent,icons={panen:'🧺',penyakit:'◈',air:'💧',n:'N',mati:'×',stres:'!'};
  const alerts=attentionIndexes().slice(0,4).map(item=>(icons[item.issue]||'!')+'P'+String(item.index+1).padStart(2,'0'));
  $('#finishSeason').hidden=cupActive||eventPending||state.day<state.maxDay;$('#nextDay').hidden=!cupActive&&!eventPending&&state.day>=state.maxDay;
  $('#nextDay').textContent=cupActive?'🏆 Buka Breeding Cup':eventPending?'⚠ Tinjau kejadian':('Hari berikutnya →'+(alerts.length?' · '+alerts.join(' '):''));
  $('#nextDay').title=eventPending?'Kejadian lapang menunggu keputusan':(alerts.length?'Petak perlu perhatian: '+alerts.join(', '):'Lanjutkan satu hari');
}
function plotUseControlHtml(index){
  const unit=experimentUnit(index),active=unit?'research':plotUse(index),meta=plotMeta(index);
  return `<div class="plot-academy-context"><span>${esc(meta.uid)} · K${meta.block}</span><div class="plot-use-switch">${Object.entries(PLOT_USES).map(([id,item])=>`<button type="button" data-plot-use="${id}" ${active===id?'aria-pressed="true"':''} ${unit&&id!=='research'?'disabled':''} title="${esc(item.name)}">${item.icon}</button>`).join('')}</div></div>`;
}
function bindPlotUseControls(){
  $('#inspectorBody')?.querySelectorAll('[data-plot-use]').forEach(button=>button.onclick=()=>setPlotUse(state.selectedPlot,button.dataset.plotUse));
}
function renderField(){
  const limit=fieldLimit(),attention=!!state.comfort?.attention,grid=$('#fieldGrid');
  grid.classList.toggle('attention-mode',attention);
  const plotHtml=(crop,index)=>{
    const cls=statusClass(crop),selected=index===state.selectedPlot?' selected':'',burned=crop?.burned>0?' burned':'',issue=plotIssue(crop),attentionClass=attention?(issue?' attention-hit':' attention-muted'):'',competitionClass=breedingCup.plotClass(index),meta=plotMeta(index),use=PLOT_USES[plotUse(index)]||PLOT_USES.commercial;
    if(index>=limit)return `<button type="button" class="plot plot-locked${attentionClass}" data-plot="${index}" disabled aria-label="Petak ${index+1}, dikunci challenge"><div class="plot-top"><span>${meta.uid}</span><span>×</span></div><div class="plot-empty-mark">LOCK</div></button>`;
    if(!crop)return `<button type="button" class="plot empty${selected}${attentionClass}${competitionClass}" data-plot="${index}" aria-label="${meta.uid}, kosong"><div class="plot-top"><span>${meta.uid}</span><span class="plot-use-icon">${use.icon}</span></div><div class="plot-empty-mark">＋</div>${experimentBadge(index)}</button>`;
    const stage=stageOf(crop),issueIcon={panen:'🧺',penyakit:'◈',air:'💧',n:'N',mati:'×',stres:'!'}[issue]||'';
    return `<button type="button" class="plot ${cls}${burned}${selected}${attentionClass}" data-plot="${index}" ${crop.growth>=100&&crop.health>0?`draggable="true" data-harvest-drag="${index}"`:''} aria-label="${meta.uid}, ${esc(crop.seed.name)}, ${esc(stage)}"><div class="plot-top"><span>${meta.uid}</span><span>${issueIcon||use.icon}</span></div><div class="plot-crop"><span class="plant-icon">${cropIcon(crop)}</span><div><b>${esc(crop.seed.name)}</b><small>${esc(stage)} · ${Math.round(crop.growth)}%</small></div></div><div class="plot-health"><i style="width:${crop.health}%"></i></div><div class="plot-bars"><span class="mini-meter"><i style="width:${crop.water}%"></i></span><span class="mini-meter n"><i style="width:${crop.n}%"></i></span></div>${experimentBadge(index)}${crop.revealed&&crop.mutation?`<span class="trait ${traitMeta(crop.mutation).rarity}" title="Mutasi">${traitMeta(crop.mutation).icon}</span>`:''}</button>`;
  };
  grid.innerHTML=Array.from({length:BLOCK_COUNT},(_,block)=>{
    const from=block*PLOTS_PER_BLOCK,to=from+PLOTS_PER_BLOCK,indices=Array.from({length:PLOTS_PER_BLOCK},(_,i)=>from+i),research=indices.filter(i=>plotUse(i)==='research').length,breeding=indices.filter(i=>plotUse(i)==='breeding').length,commercial=PLOTS_PER_BLOCK-research-breeding;
    return `<section class="field-block" data-block="${block+1}"><header><b>Kelompok ${['I','II','III'][block]}</b><span>Rp ${commercial} · 📐 ${research} · 🧬 ${breeding}</span></header><div class="field-block-grid">${indices.map(i=>plotHtml(state.field[i],i)).join('')}</div></section>`;
  }).join('');
}
function renderInspector(){
  const crop=selectedCrop(),plot=state.selectedPlot+1;
  $('#plotTitle').textContent='Petak '+String(plot).padStart(2,'0');
  $('#plotStage').textContent=stageOf(crop);
  if(!crop){
    const competitionInspector=breedingCup.inspector(state.selectedPlot);
    if(competitionInspector){$('#inspectorBody').innerHTML=competitionInspector;$('#openCupFromPlot').onclick=breedingCup.open;return;}
    const assigned=experimentSeedForPlot(state.selectedPlot),seed=assigned||selectedSeed();
    const locked=state.selectedPlot>=fieldLimit(),mono=activeChallenge().mono&&state.monoSeedId&&seed.id!==state.monoSeedId;
    $('#inspectorBody').innerHTML=`${plotUseControlHtml(state.selectedPlot)}<div class="seed-picker"><label>Benih<select id="seedSelect" ${assigned?'disabled':''}>${state.vault.map(item=>`<option value="${esc(item.id)}" ${item.id===seed.id?'selected':''}>${esc(item.name)} · G${item.generation}</option>`).join('')}</select></label><div class="seed-card-preview"><b>${esc(seed.name)}</b><p>🌱 ${seed.stock||0} · ${Math.round(seed.viability||0)}% · Potensi ${seed.baseYield.toFixed(1)} kg/25 m² · G${seed.generation}</p><div class="trait-row">${seedTraitsHtml(seed)}</div></div><button id="plantSelected" class="primary" type="button" ${state.focus<1||state.coins<actionCost('plant')||locked||mono||(seed.stock||0)<1||(seed.viability||0)<45?'disabled':''}>${locked?'Petak terkunci':mono?'Satu varietas':`Tanam · ${formatRupiah(actionCost('plant'))}`}</button></div>`;
    $('#seedSelect').onchange=event=>{state.selectedSeedId=event.target.value;save();renderInspector();renderVault();};
    $('#plantSelected').onclick=plantSelected;bindPlotUseControls();
    return;
  }
  const knownExtra=crop.revealed&&crop.mutation?[crop.mutation]:[];
  const mutationText=crop.mutation?(crop.revealed?traitMeta(crop.mutation).name:'Belum diketahui'):'Tidak terdeteksi';
  const fertilizerCost=actionCost(hasTech('precisionN')?'fertilizePrecision':'fertilize'),waterFocus=hasTech('irrigation')&&state.irrigationUses%2===1?0:1,waterCost=actionCost(hasTech('irrigation')?'waterPrecision':'water'),scoutReward=2+(hasTech('drone')?2:0);
  const hidden=crop.scouted>=2?` · respons air ${crop.waterSensitivity>1?'tinggi':crop.waterSensitivity<.95?'rendah':'sedang'} · kebutuhan N ${crop.nDemand>1?'tinggi':crop.nDemand<.95?'rendah':'sedang'}`:' · karakter respons belum lengkap';
  $('#inspectorBody').innerHTML=`${plotUseControlHtml(state.selectedPlot)}<div class="crop-stats"><div class="stat-box"><span>Kesehatan</span><b>${Math.round(crop.health)}%</b></div><div class="stat-box"><span>Air</span><b>${Math.round(crop.water)}%</b></div><div class="stat-box"><span>Nitrogen</span><b>${Math.round(crop.n)}%</b></div><div class="stat-box"><span>Penyakit</span><b>${Math.round(crop.disease)}%</b></div></div><div class="seed-card-preview"><b>${esc(crop.seed.name)} · G${crop.seed.generation}</b><p>Stres ${Math.round(crop.stress)}${hidden} · anomali: ${esc(mutationText)}</p><div class="trait-row">${seedTraitsHtml(crop.seed,knownExtra)}</div></div><div class="action-grid"><button data-crop-action="water" ${state.focus<waterFocus||state.coins<waterCost||crop.health<=0?'disabled':''}>💧 Irigasi · ${formatRupiah(waterCost)}</button><button data-crop-action="fertilize" ${activeChallenge().noFertilizer||state.focus<1||state.coins<fertilizerCost||crop.health<=0?'disabled':''}>N Pupuk · ${formatRupiah(fertilizerCost)}</button><button class="scout" data-crop-action="scout" ${state.focus<1||crop.health<=0?'disabled':''}>◎ Periksa · +${scoutReward} RP</button>${crop.health<=0?'<button data-crop-action="remove">Bersihkan petak</button>':crop.growth>=100?'<button class="harvest" data-crop-action="harvest">Panen sekarang</button>':''}</div><p class="action-note">Tumbuh ${Math.round(crop.growth)}% · estimasi pasar ${formatRupiah(state.marketPrice)}/kg</p>`;
  $('#inspectorBody').querySelectorAll('[data-crop-action]').forEach(button=>button.onclick=()=>cropAction(button.dataset.cropAction));bindPlotUseControls();
}
function renderVault(){
  $('#vaultCount').textContent=state.vault.length;
  $('#vaultList').innerHTML=state.vault.map(seed=>`<article class="seed-item ${seed.id===state.selectedSeedId?'active':''}" draggable="true" data-seed-drag="${esc(seed.id)}"><div class="seed-item-head"><b>${esc(seed.name)}</b><small>G${seed.generation}</small></div><small>🌱 ${seed.stock||0} · ${Math.round(seed.viability||0)}% · ${seed.baseYield.toFixed(1)}</small><div class="trait-row">${seedTraitsHtml(seed)}</div><div class="seed-card-actions"><button type="button" data-use-seed="${esc(seed.id)}" ${(seed.stock||0)<1?'disabled':''}>${seed.id===state.selectedSeedId?'✓':'🌱'}</button>${!seed.parents?.length?`<button type="button" data-buy-seed="${esc(seed.id)}" title="Beli ${COMMERCIAL_SEED_PACK_SIZE} benih">＋</button>`:''}<button type="button" data-rename-seed="${esc(seed.id)}" title="Nama varietas">✎</button></div></article>`).join('');
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
  host.innerHTML=`<div class="expedition-list">${Object.entries(EXPEDITIONS).map(([id,ex])=>`<button type="button" data-expedition="${id}" ${state.coins<ex.cost?'disabled':''}><span>${ex.icon}</span><b>${esc(ex.name)}</b><small>${ex.days} hari · ${formatRupiah(ex.cost)}</small></button>`).join('')}</div>`;
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
  return `<div class="challenge-grid">${Object.entries(CHALLENGES).map(([id,ch])=>`<button data-challenge="${id}" class="${state.challenge===id&&!state.daily?'active':''}"><b>${esc(ch.name)}</b><span>${esc(ch.desc)}</span><small>Tekanan +${Math.round((ch.pressure||0)*100)}% · Reward ×${ch.reward}</small></button>`).join('')}</div><div class="daily-card"><span>DAILY SEED</span><b>${daily.key}</b><p>Kondisi dan target sama untuk tanggal ini di perangkat mana pun.</p><button data-daily-start ${challengeCanStart()?'':'disabled'}>Mulai Daily</button></div>`;
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
function learningDone(id){return state.learning.completed.includes(id);}
function awardLearning(id,xp=6){
  if(learningDone(id))return false;
  state.learning.completed.push(id);state.learning.xp+=xp;state.rp+=1;
  addLog('🎓 Kompetensi '+id+' selesai · +'+xp+' XP belajar · +1 RP.');save();return true;
}
function academyMastery(track){
  const lessons=track.lessons||[],done=lessons.filter(([id])=>learningDone(track.id+':'+id)).length;
  return {done,total:lessons.length,percent:lessons.length?Math.round(done/lessons.length*100):0};
}
function openAcademy(){
  const tracks=curriculum(),total=tracks.reduce((sum,t)=>sum+t.lessons.length,0),done=tracks.reduce((sum,t)=>sum+academyMastery(t).done,0);
  openMetaModal('AKADEMI PEMULIAAN','Belajar lewat keputusan',`<div class="academy-progress"><b>${done}/${total}</b><span>kompetensi dikuasai · ${state.learning.xp||0} XP belajar</span></div><div class="academy-track-grid">${tracks.map(track=>{
    const m=academyMastery(track);
    return `<button type="button" data-academy-track="${track.id}"><span>${track.icon}</span><b>${esc(track.title)}</b><small>${esc(track.desc)}</small><i><u style="width:${m.percent}%"></u></i><em>${m.done}/${m.total}</em></button>`;
  }).join('')}</div><p class="meta-note">Kompetensi dibuka dengan membaca konsep dan menerapkannya pada rancangan, analisis, seleksi, atau persilangan di game. Tidak ada bonus untuk sekadar menekan Next.</p>`);
  $('#metaModalBody').querySelectorAll('[data-academy-track]').forEach(button=>button.onclick=()=>openAcademyTrack(button.dataset.academyTrack));
}
function openAcademyTrack(id){
  const track=curriculum().find(item=>item.id===id);if(!track)return openAcademy();
  openMetaModal('AKADEMI · '+track.icon,track.title,`<div class="academy-lessons">${track.lessons.map(([lessonId,title,text],index)=>{
    const key=track.id+':'+lessonId,done=learningDone(key),reviewed=state.learning.reviewed.includes(key);
    return `<article class="${done?'done':reviewed?'reviewed':''}"><header><span>${done?'✓':index+1}</span><b>${esc(title)}</b></header><p>${esc(text)}</p><button type="button" data-review="${esc(key)}" ${reviewed||done?'disabled':''}>${done?'Dikuasai lewat praktik':reviewed?'Sudah dibaca':'Baca & simpan konsep'}</button></article>`;
  }).join('')}</div><div class="academy-actions"><button type="button" data-academy-back>← Akademi</button>${id==='design'?'<button type="button" data-academy-exp>📐 Buat percobaan</button>':''}${id==='stats'&&state.experiment?'<button type="button" data-academy-analysis>📊 Analisis percobaan aktif</button>':''}${id==='crossing'?'<button type="button" data-academy-cross>✕ Buka persilangan</button>':''}</div>`);
  $('#metaModalBody').querySelectorAll('[data-review]').forEach(button=>button.onclick=()=>{
    const key=button.dataset.review;if(!state.learning.reviewed.includes(key))state.learning.reviewed.push(key);save();openAcademyTrack(id);
  });
  $('#metaModalBody').querySelector('[data-academy-back]')?.addEventListener('click',openAcademy);
  $('#metaModalBody').querySelector('[data-academy-exp]')?.addEventListener('click',openExperiment);
  $('#metaModalBody').querySelector('[data-academy-analysis]')?.addEventListener('click',openExperimentAnalysis);
  $('#metaModalBody').querySelector('[data-academy-cross]')?.addEventListener('click',()=>{closeMetaModal();document.querySelector('#labHub')?.setAttribute('open','');document.querySelector('#parentA')?.scrollIntoView({behavior:'smooth',block:'center'});});
  const quiz=trackQuiz(id),quizKey=id+':quiz';
  if(quiz&&!learningDone(quizKey)){
    const wrap=document.createElement('section');wrap.className='academy-quiz';
    wrap.innerHTML='<b>'+esc(quiz.prompt)+'</b>'+quiz.options.map((option,i)=>'<button type="button" data-track-answer="'+i+'">'+esc(option)+'</button>').join('')+'<p></p>';
    $('#metaModalBody').appendChild(wrap);
    wrap.querySelectorAll('[data-track-answer]').forEach(button=>button.onclick=()=>{
      state.learning.attempts++;const correct=Number(button.dataset.trackAnswer)===quiz.answer;
      if(correct){state.learning.correct++;awardLearning(quizKey,10);}
      wrap.querySelector('p').textContent=(correct?'✓ ':'✗ ')+quiz.explanation;
      wrap.querySelector('p').className=correct?'correct':'wrong';save();
      if(correct)setTimeout(()=>openAcademyTrack(id),250);
    });
  }
}
function experimentAnalysis(parameter=''){
  const exp=state.experiment;if(!exp)return null;
  const preferred=parameter||exp.parameters.find(p=>String(p).toLowerCase().includes('hasil'))||exp.parameters[0];
  return analyzeExperiment({design:exp.design,units:exp.units,treatments:exp.treatments,parameter:preferred});
}
function openExperimentAnalysis(parameter=''){
  const exp=state.experiment;if(!exp){toast('Belum ada percobaan aktif');return;}
  const analysis=experimentAnalysis(parameter),coach=designCoach({design:exp.design,plotRegistry:state.plotRegistry,units:exp.units});
  const select=`<label class="analysis-param">Parameter<select id="academyAnalysisParameter">${exp.parameters.map(p=>`<option value="${esc(p)}" ${p===analysis.parameter?'selected':''}>${esc(p)}</option>`).join('')}</select></label>`;
  if(!analysis.valid){
    openMetaModal('STATISTIKA LAPANG','Belum cukup data',select+`<div class="analysis-warning">${analysis.warnings.map(esc).join('<br>')}</div><div class="coach-list">${coach.map(item=>`<p>📐 ${esc(item)}</p>`).join('')}</div>`);
    $('#academyAnalysisParameter').onchange=e=>openExperimentAnalysis(e.target.value);return;
  }
  const q=interpretationQuestion(analysis),h2=exp.kind==='genotype'&&Number.isFinite(analysis.broadSenseH2)?analysis.broadSenseH2:null;
  const otherParam=exp.parameters.find(p=>p!==analysis.parameter),corr=otherParam?pearson(exp.units.map(u=>u.observations?.[analysis.parameter]),exp.units.map(u=>u.observations?.[otherParam])):null;
  openMetaModal('STATISTIKA LAPANG',exp.name,`${select}<div class="analysis-kpis"><div><small>Rerata</small><b>${analysis.grandMean.toFixed(2)}</b></div><div><small>F perlakuan</small><b>${analysis.f.toFixed(2)}</b></div><div><small>CV</small><b>${analysis.cv===null?'—':analysis.cv.toFixed(1)+'%'}</b></div>${h2===null?'':`<div><small>H² luas*</small><b>${(h2*100).toFixed(0)}%</b></div>`}${corr===null?'':`<div><small>r · ${esc(otherParam)}</small><b>${corr.toFixed(2)}</b></div>`}</div><div class="analysis-means">${analysis.means.map((row,i)=>`<div><span>#${i+1}</span><b>${esc(row.name)}</b><em>${row.mean.toFixed(2)}</em><small>n=${row.n}</small></div>`).join('')}</div><div class="coach-list">${coach.map(item=>`<p>📐 ${esc(item)}</p>`).join('')}${analysis.warnings.map(item=>`<p>⚠ ${esc(item)}</p>`).join('')}</div>${q?`<section class="analysis-question"><b>${esc(q.prompt)}</b>${q.options.map((option,i)=>`<button type="button" data-analysis-answer="${i}">${esc(option)}</button>`).join('')}<p id="analysisFeedback"></p></section>`:''}<p class="meta-note">*H² ditampilkan hanya sebagai latihan pada uji genotipe seimbang. Untuk inferensi lengkap, gunakan 📊 /stat dan pertahankan unit percobaan yang benar.</p><div class="academy-actions"><button type="button" data-open-stat>📊 Buka /stat</button></div>`);
  $('#academyAnalysisParameter').onchange=e=>openExperimentAnalysis(e.target.value);
  $('#metaModalBody').querySelectorAll('[data-analysis-answer]').forEach(button=>button.onclick=()=>{
    state.learning.attempts++;const correct=Number(button.dataset.analysisAnswer)===q.answer;
    if(correct){
      state.learning.correct++;awardLearning('stats:mean',4);awardLearning('stats:anova',8);awardLearning('stats:cv',5);
      if(corr!==null)awardLearning('stats:corr',6);
      if(h2!==null)awardLearning('breeding:h2',7);
    }
    const feedback=$('#analysisFeedback');feedback.textContent=(correct?'✓ ':'✗ ')+q.explanation;feedback.className=correct?'correct':'wrong';save();
  });
  $('#metaModalBody').querySelector('[data-open-stat]')?.addEventListener('click',sendExperimentToStat);
}
function seedGenerationPanel(seed){
  const generation=Math.max(0,Number(seed?.generation)||0),name=generationName(generation),observed=observedHeterozygosity(seed?.genome||{}),expected=generation?expectedHeterozygosity(generation):observed;
  const loci=mendelianSummary(seed?.genome||{});
  return `<div class="generation-panel"><header><div><small>Generasi</small><b>${name}</b></div><div><small>Heterozigositas genom</small><b>${Math.round(observed*100)}%</b></div><div><small>Ekspektasi selfing</small><b>${generation?Math.round(expected*100)+'%':'—'}</b></div></header><div class="locus-strip">${loci.map(row=>`<span class="${row.heterozygous?'het':'fixed'}"><b>${esc(row.locus)}</b> ${esc(row.alleles.join('/'))}</span>`).join('')}</div></div>`;
}
function selfSelectedSeed(){
  const parent=selectedSeed(),parentGeneration=Math.max(0,Number(parent?.generation)||0);if(!parent||parentGeneration<1||state.rp<4)return;
  const generation=parentGeneration+1,key=['self',state.season,parent.id,generation,state.vault.length].join(':');
  state.rp-=4;
  const genome=selfGenome(parent.genome,key),fx=geneticEffects(genome);
  const child={
    ...structuredClone(parent),id:uid('seed'),name:parent.name+'-'+generationName(generation),generation,parents:[parent.id],
    source:'Selfing '+parent.name,genome,stock:6,ageSeasons:0,viability:98,evidenceTests:0,
    baseYield:round(parent.baseYield*(.97+simUnit('self-yield',key)*.06)*fx.yield,1),
    vigor:round(parent.vigor*(.98+simUnit('self-vigor',key)*.04)*fx.growth,2)
  };
  state.vault.push(child);state.selectedSeedId=child.id;rememberLineage(parent);rememberLineage(child);
  state.learning.xp+=5;if(generation===2)awardLearning('crossing:f2',8);if(generation>=4)awardLearning('crossing:fix',10);
  addLog('✕ '+parent.name+' diselfing → '+child.name+'.');save();render();toast(child.name+' · heterozigositas '+Math.round(observedHeterozygosity(genome)*100)+'%');
}
function openQuickMore(){
  openMetaModal('MENU','Lainnya',`<div class="quick-menu-grid">
    <button data-quick-more="academy">🎓<span>Akademi</span></button>
    <button data-quick-more="run">⚑<span>Challenge</span></button>
    <button data-quick-more="rival">⚔<span>Rival</span></button>
    <button data-quick-more="record">◷<span>Rekor</span></button>
    <button data-quick-more="legacy">↺<span>Legacy</span></button>
    <button data-quick-more="collection">◆<span>Koleksi</span></button>
    <button data-quick-more="economy">Rp<span>Ekonomi</span></button>
    <button data-quick-more="comfort">⚙<span>Kenyamanan</span></button>
    <button data-quick-more="music">♫<span>Audio</span></button>
  </div>`);
  $('#metaModalBody').querySelectorAll('[data-quick-more]').forEach(button=>button.onclick=()=>{
    const key=button.dataset.quickMore;
    if(key==='academy')openAcademy();
    if(key==='run')openChallenges();
    if(key==='rival')openRival();
    if(key==='record')openRecords();
    if(key==='legacy')openPrestige();
    if(key==='collection')openCollectionBook();
    if(key==='economy')openEconomyInfo();
    if(key==='comfort')openComfortSettings();
    if(key==='music')openMusicPicker();
  });
}
function openEconomyInfo(){
  const margin=(state.seasonStats.revenue||0)-(state.seasonStats.cost||0);
  openMetaModal('EKONOMI LAPANGAN','Rupiah & harga acuan',`<div class="economy-grid">
    <div><small>Luas petak</small><b>${PLOT_AREA_M2} m²</b><span>24 petak · 3 kelompok · ${PLOT_AREA_M2*PLOT_COUNT} m²</span></div>
    <div><small>Harga pasar musim</small><b>${formatRupiah(state.marketPrice)}/kg</b><span>Berubah antar musim</span></div>
    <div><small>HPP jagung acuan</small><b>${formatRupiah(PRICE_REFERENCE.cornHpp)}/kg</b><span>Jagung pipilan kering</span></div>
    <div><small>Referensi Sulsel</small><b>${formatRupiah(PRICE_REFERENCE.cornSulsel)}/kg</b><span>Pembelian KA 14%</span></div>
    <div><small>Urea subsidi</small><b>${formatRupiah(PRICE_REFERENCE.urea)}/kg</b><span>Harga acuan input</span></div>
    <div><small>NPK subsidi</small><b>${formatRupiah(PRICE_REFERENCE.npk)}/kg</b><span>Harga acuan input</span></div>
    <div><small>Pendapatan musim</small><b>${formatRupiah(state.seasonStats.revenue||0)}</b><span>Panen × harga</span></div>
    <div><small>Biaya musim</small><b>${formatRupiah(state.seasonStats.cost||0)}</b><span>Input & operasi</span></div>
    <div><small>Margin berjalan</small><b>${formatRupiah(margin)}</b><span>Belum termasuk nilai riset</span></div>
  </div><p class="help-note">Harga di game dikalibrasi ke nilai lapangan Indonesia/Sulawesi Selatan, tetapi tetap disederhanakan agar permainan seimbang.</p>`);
}
function openComfortSettings(){
  const c=state.comfort;
  openMetaModal('KENYAMANAN','Kontrol & tampilan',`<div class="comfort-settings">
    <label>Mode ibu jari<select data-comfort="thumb"><option value="right" ${c.thumb==='right'?'selected':''}>Tangan kanan</option><option value="left" ${c.thumb==='left'?'selected':''}>Tangan kiri</option></select></label>
    <label>Kepadatan<select data-comfort="density"><option value="auto" ${c.density==='auto'?'selected':''}>Otomatis</option><option value="compact" ${c.density==='compact'?'selected':''}>Ringkas</option><option value="large" ${c.density==='large'?'selected':''}>Besar</option></select></label>
    <label>Haptic<select data-comfort="haptic"><option value="off" ${c.haptic==='off'?'selected':''}>Mati</option><option value="light" ${c.haptic==='light'?'selected':''}>Ringan</option><option value="normal" ${c.haptic==='normal'?'selected':''}>Normal</option></select></label>
    <label class="toggle-row"><input type="checkbox" data-comfort-check="colorSafe" ${c.colorSafe?'checked':''}>Status ramah buta warna</label>
    <label class="toggle-row"><input type="checkbox" data-comfort-check="battery" ${c.battery?'checked':''}>Hemat baterai</label>
    <label>Volume musik <input type="range" min="0" max="100" step="5" value="${Math.round((c.musicVolume??.65)*100)}" data-comfort-range="musicVolume"></label>
    <label>Volume efek UI <input type="range" min="0" max="100" step="5" value="${Math.round((c.uiVolume??.75)*100)}" data-comfort-range="uiVolume"></label>
  </div>`);
  $('#metaModalBody').querySelectorAll('[data-comfort]').forEach(el=>el.onchange=()=>{updateComfort({[el.dataset.comfort]:el.value});openComfortSettings();});
  $('#metaModalBody').querySelectorAll('[data-comfort-check]').forEach(el=>el.onchange=()=>{updateComfort({[el.dataset.comfortCheck]:el.checked});openComfortSettings();});
  $('#metaModalBody').querySelectorAll('[data-comfort-range]').forEach(el=>el.oninput=()=>updateComfort({[el.dataset.comfortRange]:Number(el.value)/100}));
}
function openMusicPicker(){
  const c=state.comfort;
  openMetaModal('AUDIO','Musik Field Zero',`<div class="music-picker">${musicTracks().map(track=>`<button type="button" data-music-track="${track.id}" class="${state.musicTrack===track.id?'active':''}"><b>♫ ${esc(track.name)}</b><span>${esc(track.subtitle)}</span></button>`).join('')}</div><div class="audio-mixer"><label>Musik <input type="range" min="0" max="100" value="${Math.round((c.musicVolume??.65)*100)}" data-audio-volume="music"></label><label>Efek <input type="range" min="0" max="100" value="${Math.round((c.uiVolume??.75)*100)}" data-audio-volume="ui"></label></div>`);
  $('#metaModalBody').querySelectorAll('[data-music-track]').forEach(button=>button.onclick=()=>{
    state.musicTrack=button.dataset.musicTrack;state.sound=true;save();setMusicTrack(state.musicTrack);setMusicVolume((state.comfort.musicVolume??.65)*.16);startMusic(state.musicTrack);renderHud();openMusicPicker();
  });
  $('#metaModalBody').querySelectorAll('[data-audio-volume]').forEach(input=>input.oninput=()=>{
    const value=Number(input.value)/100;if(input.dataset.audioVolume==='music'){state.comfort.musicVolume=value;setMusicVolume(value*.16);}else state.comfort.uiVolume=value;save();
  });
}
function openInspectorSheet(){document.querySelector('.inspector')?.classList.add('sheet-open');}
function closeInspectorSheet(){document.querySelector('.inspector')?.classList.remove('sheet-open');}
function smartActionForSelected(){
  const crop=selectedCrop();
  if(!crop)return {tool:'plant',label:'🌱 Tanam'};
  if(crop.health<=0)return {tool:'remove',label:'× Bersihkan'};
  if(crop.growth>=100)return {tool:'harvest',label:'🧺 Panen'};
  if(crop.water<30)return {tool:'water',label:'💧 Irigasi'};
  if(crop.disease>=35)return {tool:'scout',label:'◎ Periksa'};
  if(crop.n<30)return {tool:'fertilize',label:'N Pupuk'};
  return {tool:'scout',label:'◎ Periksa'};
}
function renderComfortControls(){
  const issues=attentionIndexes(),smart=smartActionForSelected(),button=$('#smartAction'),attention=$('#attentionToggle');
  if(button){button.innerHTML=smart.label;button.dataset.smartTool=smart.tool;}
  if(attention){attention.setAttribute('aria-pressed',String(!!state.comfort.attention));$('#attentionCount').textContent=issues.length;}
}
function runSmartAction(){
  const action=smartActionForSelected();if(action.tool==='plant')plantSelected();else cropAction(action.tool);
}
function toggleAttention(){
  const issues=attentionIndexes();
  if(!state.comfort.attention){state.comfort.attention=true;if(issues.length)state.selectedPlot=issues[0].index;}
  else if(issues.length){
    const pos=issues.findIndex(item=>item.index===state.selectedPlot),next=issues[(pos+1+issues.length)%issues.length];state.selectedPlot=next.index;
  }else state.comfort.attention=false;
  save();renderField();renderInspector();renderComfortControls();if(state.comfort.attention&&issues.length)openInspectorSheet();
}
function setFieldTool(tool=''){
  activeFieldTool=activeFieldTool===tool?'':tool;
  document.querySelectorAll('[data-field-tool]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.fieldTool===activeFieldTool)));
  document.querySelector('#fieldGrid')?.classList.toggle('tool-active',!!activeFieldTool);
  renderPlayControls();
}
function useFieldTool(tool,index,{seedId=''}={}){
  if(index<0||index>=fieldLimit())return false;
  state.selectedPlot=index;
  if(seedId){const seed=state.vault.find(item=>item.id===seedId);if(seed)state.selectedSeedId=seed.id;}
  if(tool==='plant'){plantSelected();return true;}
  if(tool==='treatment')return applyExperimentTreatment(index);
  if(!state.field[index]){haptic(4);renderField();renderInspector();return false;}
  if(tool==='harvest'){
    if(state.field[index].growth<100||state.field[index].health<=0){haptic(4);renderField();renderInspector();return false;}
    harvestPlot(index,1,true);return true;
  }
  if(['water','fertilize','scout'].includes(tool)){cropAction(tool);return true;}
  return false;
}


function render(){
  renderHud();renderSeason();renderField();renderInspector();renderVault();renderSelectionPreview();renderLog();renderDiscoveries();renderMeta();renderPlayControls();renderComfortControls();save();
}

function plantSelected(){
  const assignedSeed=experimentSeedForPlot(state.selectedPlot),seed=assignedSeed||selectedSeed(),challenge=activeChallenge(),index=state.selectedPlot;
  const plantCost=actionCost('plant');if(!seed||state.field[index]||index>=fieldLimit()||state.focus<1||state.coins<plantCost)return;
  if((seed.stock||0)<1){toast('🌱×');return;}
  if((seed.viability||0)<45){toast('Benih terlalu tua');return;}
  if(challenge.mono&&state.monoSeedId&&seed.id!==state.monoSeedId){toast('Challenge hanya mengizinkan satu varietas');return;}
  const snapshot=structuredClone(state);
  let crop=null;
  if(replantCache&&replantCache.expires>Date.now()&&replantCache.index===index&&replantCache.seedId===seed.id){crop=structuredClone(replantCache.crop);replantCache=null;}
  if(!crop){
    const mutationChance=Math.min(.18,.045+state.level*.004+(state.env.id==='anomaly'?.05:0)+(hasTech('genome')?.02:0));
    let mutation=null;
    if(simUnit('mutation',state.season,index,seed.id)<mutationChance){
      const pool=MUTATION_POOL.filter(id=>!seed.traits.includes(id));mutation=pool.length?simPick(pool,'mutation-trait',state.season,index,seed.id):null;
      if((state.env.id==='anomaly'||state.env.boss)&&state.season>=4&&simUnit('zero-mutation',state.season,index,seed.id)<.08)mutation='zero';
    }
    const cropUid=uid('plant');
    crop={
      uid:cropUid,species:state.species,seed:structuredClone(seed),age:0,growth:3,health:100,water:62,n:58,disease:0,stress:0,mutation,revealed:false,scouted:0,
      waterSensitivity:round(.88+simUnit('water-sensitivity',state.season,index,seed.id)*.26,2),
      nDemand:round(.88+simUnit('n-demand',state.season,index,seed.id)*.28,2),
      diseaseSusceptibility:round(.85+simUnit('disease-susceptibility',state.season,index,seed.id)*.32,2),
      stressLog:{water:0,n:0,disease:0,heat:0,burn:0}
    };
    crop.samples=makeSubsamples({plotUid:plotMeta(index).uid,plantUid:cropUid,species:state.species,simulationSeed:state.simulationSeed});
  }
  rememberLineage(seed);seed.stock=Math.max(0,(seed.stock||0)-1);state.field[index]=crop;applyPendingExperimentEffect(index,state.field[index]);
  const expUnit=experimentUnit(index);if(expUnit)expUnit.material={plantUid:crop.uid,seedId:seed.id,seedName:seed.name,generation:seed.generation,species:state.species};
  recordDailyExperimentObservation(index,state.field[index],{force:true});
  state.coins-=plantCost;state.seasonStats.cost=(state.seasonStats.cost||0)+plantCost;state.focus--;
  addLog('P'+String(index+1).padStart(2,'0')+': '+seed.name+' ditanam · '+formatRupiah(plantCost)+'.');
  offerUndo(snapshot,'Tanam P'+String(index+1).padStart(2,'0'),{index,seedId:seed.id,crop:structuredClone(crop)});
  beep(410);render();document.dispatchEvent(new Event('fieldzero-field-change'));
}
function cropAction(action){
  const crop=selectedCrop();if(!crop)return;
  if(action==='harvest'){clearUndo();harvestPlot(state.selectedPlot,1,true);return;}
  if(action==='scout'){
    clearUndo();if(crop.health<=0||state.focus<1)return;
    state.focus--;crop.scouted++;const bonus=traitSum(allCropTraits(crop),'scoutRp')+(hasTech('drone')?2:0);state.rp+=2+bonus;
    if(crop.mutation&&!crop.revealed&&(hasTech('drone')||chance(.7))){crop.revealed=true;discoverTrait(crop.mutation);addLog('P'+(state.selectedPlot+1)+': periksa menemukan '+traitMeta(crop.mutation).name+'.');}
    else addLog('P'+(state.selectedPlot+1)+': periksa selesai; penyakit '+Math.round(crop.disease)+'%.');
    crop.disease=Math.max(0,crop.disease-(hasTech('drone')?9:5));beep(540);render();return;
  }
  const snapshot=structuredClone(state);
  if(action==='remove'){
    state.field[state.selectedPlot]=null;state.seasonStats.failed++;addLog('P'+(state.selectedPlot+1)+': tanaman mati dibersihkan.');
    offerUndo(snapshot,'Bersihkan P'+String(state.selectedPlot+1).padStart(2,'0'));render();return;
  }
  if(crop.health<=0)return;
  if(action==='water'){
    const focusCost=hasTech('irrigation')&&state.irrigationUses%2===1?0:1,cost=actionCost(hasTech('irrigation')?'waterPrecision':'water');
    if(state.focus<focusCost||state.coins<cost)return;
    crop.water=clamp(crop.water+(hasTech('irrigation')?50:38));state.focus-=focusCost;state.coins-=cost;state.seasonStats.cost=(state.seasonStats.cost||0)+cost;
    state.irrigationUses++;crop.stress=Math.max(0,crop.stress-(hasTech('irrigation')?5:2));addLog('P'+(state.selectedPlot+1)+': irigasi · '+formatRupiah(cost)+'.');beep(360);
    offerUndo(snapshot,'Irigasi P'+String(state.selectedPlot+1).padStart(2,'0'));
  }
  if(action==='fertilize'){
    if(activeChallenge().noFertilizer){toast('Challenge melarang pupuk');return;}
    const cost=actionCost(hasTech('precisionN')?'fertilizePrecision':'fertilize');if(state.focus<1||state.coins<cost)return;
    const highN=crop.n>75,addition=hasTech('precisionN')?46:34;crop.n=Math.min(110,crop.n+addition);state.coins-=cost;state.seasonStats.cost=(state.seasonStats.cost||0)+cost;state.focus--;
    if(highN){crop.stress=clamp(crop.stress+8,0,120);crop.health=clamp(crop.health-3);addLog('P'+(state.selectedPlot+1)+': N berlebih meningkatkan stres.');}
    else addLog('P'+(state.selectedPlot+1)+': pemupukan N · '+formatRupiah(cost)+'.');
    beep(440);offerUndo(snapshot,'Pemupukan P'+String(state.selectedPlot+1).padStart(2,'0'));
  }
  render();
}
function yieldFor(crop){
  const traits=allCropTraits(crop),gFx=geneticEffects(crop.seed.genome),healthFactor=clamp(crop.health,0,100)/100;
  const stressPenalty=1-(clamp(crop.stress,0,120)/180)*(1-traitSum(traits,'stressRes'));
  const waterBase=clamp(crop.water,0,100)/100,nBase=clamp(crop.n,0,100)/100;
  const waterFactor=1-(1-(.72+.28*waterBase))*(crop.waterSensitivity||1),nFactor=1-(1-(.74+.26*nBase))*(crop.nDemand||1);
  let traitYield=traitValue(traits,'yield',1);
  if(crop.n<35)traitYield*=traitValue(traits,'lowNYield',1);
  const noise=.9+simUnit('yield',state.season,crop.uid||crop.seed.id)*.2;
  const challenge=activeChallenge(),loc=activeLocation(),legacy=1+(state.legacy||0)*.03;
  const maturityBonus=1+Math.min(.08,Math.max(0,(crop.growth-100)/125));
  return Math.max(0,round(crop.seed.baseYield*(gFx.yield||1)*healthFactor*stressPenalty*waterFactor*nFactor*traitYield*(crop.experimentEffects?.yield||1)*(state.env.yield||1)*(loc.yield||1)*(challenge.yield||1)*legacy*maturityBonus*noise,1));
}
function candidateFrom(crop,yieldValue,index=state.selectedPlot){
  const traits=allCropTraits(crop),gain=yieldValue>crop.seed.baseYield?1.04:1;
  return {
    id:uid('seed'),name:'FZ-'+state.season+'-'+String(index+1).padStart(2,'0'),generation:(crop.seed.generation||0)+1,
    traits:unique(traits).slice(0,4),baseYield:round(crop.seed.baseYield*gain*(.97+seededUnit(hashString(crop.uid+':yield'))*.06)*(activeLocation().quality||1),1),
    vigor:round(crop.seed.vigor*(.98+seededUnit(hashString(crop.uid+':vigor'))*.05),2),source:'Seleksi musim '+state.season,parents:[crop.seed.id],
    evidenceTests:Number(crop.seed.evidenceTests||0)+1,
    stressTests:Number(crop.seed.stressTests||0)+(['drought','rust','wet','poorN'].includes(state.env.id)||state.env.boss?1:0),
    species:crop.species||state.species,stock:6,viability:97,ageSeasons:0,
    genome:selfGenome(crop.seed.genome,crop.uid+':G'+((crop.seed.generation||0)+1))
  };
}
function selectionCandidate(index,crop,yieldValue){
  const seed=candidateFrom(crop,yieldValue,index),entry={
    id:uid('candidate'),season:state.season,plot:index,plotUid:plotMeta(index).uid,plantUid:crop.uid,yield:yieldValue,
    health:round(crop.health,1),stress:round(crop.stress,1),disease:round(crop.disease,1),seed,selected:false
  };
  state.selectionPool=[entry,...state.selectionPool].slice(0,48);return entry;
}
function selectionCandidates(season=null){
  return state.selectionPool.filter(item=>season===null||Number(item.season)===Number(season));
}
function renderSelectionPreview(){
  const count=selectionCandidates(state.season).filter(item=>!item.selected).length,el=$('#selectionCount');if(el)el.textContent=String(count);
}
function selectCandidate(id){
  const item=state.selectionPool.find(candidate=>candidate.id===id);if(!item||item.selected)return;
  item.selected=true;
  if(!state.vault.some(seed=>seed.id===item.seed.id))state.vault.push(item.seed);
  state.selectedSeedId=item.seed.id;rememberLineage(item.seed);item.seed.traits.forEach(discoverTrait);
  awardLearning('breeding:variation',4);awardLearning('breeding:selection',7);
  save();render();toast('🧬 '+item.seed.name+' disimpan');
}
function selectionScore(item,mode=state.selectionMode||'index'){
  if(mode==='yield')return Number(item.yield)||0;
  if(mode==='health')return Number(item.health)||0;
  return (Number(item.yield)||0)*4+(Number(item.health)||0)*.4-(Number(item.stress)||0)*.3-(Number(item.disease)||0)*.2;
}
function openSelection(){
  const mode=state.selectionMode||'index',items=selectionCandidates().slice(0,48).sort((a,b)=>selectionScore(b,mode)-selectionScore(a,mode)).slice(0,30);
  const controls=`<div class="selection-modes"><button data-selection-mode="yield" aria-pressed="${mode==='yield'}">🧺</button><button data-selection-mode="health" aria-pressed="${mode==='health'}">♥</button><button data-selection-mode="index" aria-pressed="${mode==='index'}">Σ</button></div>`;
  openMetaModal('SELEKSI','🧬 Kandidat generasi berikutnya',controls+(items.length?`<div class="selection-list">${items.map((item,rank)=>{
    const ev=seedEvidence(item.seed),score=selectionScore(item,mode);
    return `<article class="${item.selected?'selected':''}"><header><b>#${rank+1} · ${esc(item.seed.name)}</b><span>${item.plotUid}</span></header><div><span>🧺 ${Number(item.yield).toFixed(1)} kg</span><span>♥ ${Math.round(item.health)}%</span><span>! ${Math.round(item.stress)}</span><span>Σ ${score.toFixed(1)}</span></div><small>${esc(ev.label)} · G${item.seed.generation}</small><button data-select-candidate="${esc(item.id)}" ${item.selected?'disabled':''}>${item.selected?'✓':'🧬'}</button></article>`;
  }).join('')}</div>`:'<div class="meta-empty">Belum ada kandidat dari petak 🧬 atau uji galur.</div>'));
  $('#metaModalBody').querySelectorAll('[data-selection-mode]').forEach(button=>button.onclick=()=>{state.selectionMode=button.dataset.selectionMode;save();openSelection();});
  $('#metaModalBody').querySelectorAll('[data-select-candidate]').forEach(button=>button.onclick=()=>{selectCandidate(button.dataset.selectCandidate);openSelection();});
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
  const use=plotUse(index),y=round(yieldFor(crop)*multiplier,1),price=Number(state.marketPrice)||PRICE_REFERENCE.cornHpp,revenueFactor=use==='commercial'?1:use==='breeding'?.5:.25,revenue=Math.round(y*price*revenueFactor/100)*100;
  state.seasonStats.yield=round(state.seasonStats.yield+y,1);state.seasonStats.harvests++;state.seasonStats.revenue=(state.seasonStats.revenue||0)+revenue;
  if(crop.health>=80)state.seasonStats.healthy++;state.seasonStats.maxYield=Math.max(state.seasonStats.maxYield,y);
  harvestCombo++;state.coins+=revenue;if(use==='breeding')state.rp+=Math.max(1,Math.floor(y/12));state.xp+=Math.max(5,Math.round(y*1.6));state.level=levelFromXp(state.xp);
  const selectionEligible=use==='breeding'||(state.experiment?.kind==='genotype'&&!!experimentUnit(index));
  if(selectionEligible){
    const candidate=selectionCandidate(index,crop,y);
    if(!state.seasonBest||y>state.seasonBest.yield)state.seasonBest={yield:y,seed:candidate.seed,plot:index,plantUid:crop.uid,candidateId:candidate.id};
  }
  allCropTraits(crop).forEach(id=>discoverTrait(id));
  if(crop.mutation)awardAchievement('anomaly');awardAchievement('first');if(y>=20)awardAchievement('twenty');if(crop.health>=95)awardAchievement('perfect');
  const reason=harvestReason(crop);recordExperimentObservation(index,crop,y);
  const meta=plotMeta(index),unit=experimentUnit(index),treatment=experimentTreatment(unit);
  meta.history=[...(meta.history||[]),{season:state.season,use,seedId:crop.seed.id,seedName:crop.seed.name,yield:y,treatment:treatment?.name||'',health:round(crop.health,1)}].slice(-8);
  addLog(meta.uid+': '+(PLOT_USES[use]?.icon||'•')+' panen '+y+' kg · '+formatRupiah(revenue)+' · '+reason+'.');
  if(announce)toast('🧺 '+y+' kg · '+(PLOT_USES[use]?.icon||'')+' '+formatRupiah(revenue)+(harvestCombo>1?' · ×'+harvestCombo:''));
  state.field[index]=null;beep(650,.08);return y;
}
function harvestPlot(index,multiplier=1,announce=true){
  const crop=state.field[index];if(!crop||crop.growth<100||crop.health<=0)return 0;
  const y=recordHarvest(index,crop,multiplier,announce);render();return y;
}

function infectedNeighbors(index,snapshot){
  if(index<0||!Array.isArray(snapshot))return 0;
  const block=Math.floor(index/PLOTS_PER_BLOCK),from=block*PLOTS_PER_BLOCK,to=from+PLOTS_PER_BLOCK-1;
  return [index-1,index+1].filter(i=>i>=from&&i<=to&&Number(snapshot[i]||0)>=38).length;
}
function processCrop(crop,weather,index=-1,diseaseSnapshot=[]){
  if(!crop||crop.health<=0)return;
  crop.stressLog={water:0,n:0,disease:0,heat:0,burn:0,...(crop.stressLog||{})};
  if(crop.burned>0){crop.stressLog.burn++;crop.burned=Math.max(0,crop.burned-1);}
  const traits=allCropTraits(crop),loc=activeLocation(),challenge=activeChallenge(),pressure=pressureLevel(),memory=state.weatherMemory||{},streakBoost=Number(challenge.streakBoost||1),gFx=geneticEffects(crop.seed.genome);
  const droughtRes=traitSum(traits,'droughtRes'),heatRes=traitSum(traits,'heatRes'),diseaseRes=traitSum(traits,'diseaseRes');
  const waterLoss=traitValue(traits,'waterLoss',1)*(crop.waterSensitivity||1)*(gFx.waterLoss||1),nLoss=traitValue(traits,'nLoss',1)*(crop.nDemand||1);
  const meta=index>=0?plotMeta(index):{fertility:1,moisture:1,history:[]},carry=plotCarryover(meta),fx=crop.experimentEffects||{},seasonalWater=(state.env.waterLoss||0)+(loc.waterLoss||0);
  const heatStreak=memory.hot>=2?-(memory.hot-1)*3.2*streakBoost:0,dryStreak=memory.dry>=3?-(memory.dry-2)*1.8*streakBoost:0;
  const rawWater=(weather.water<0?(weather.water+seasonalWater+heatStreak+dryStreak)*waterLoss*(fx.waterLoss||1)*(1-droughtRes):weather.water+seasonalWater)+(fx.waterDaily||0),waterDelta=rawWater*(meta.moisture||1);
  crop.water=clamp(crop.water+waterDelta);
  const wetN=memory.wet>=2?(memory.wet-1)*1.4*streakBoost:0;
  crop.n=clamp(crop.n-(5+(state.env.nLoss||0)+(loc.nLoss||0)+wetN)*nLoss*(fx.nLoss||1)*(2-(carry.fertility||1)));
  const neighborPressure=infectedNeighbors(index,diseaseSnapshot)*.025*Number(challenge.spreadBoost||1),wetDisease=memory.wet>=2?(memory.wet-1)*.018*streakBoost:0;
  const carryDisease=(Number(state.fieldPressure?.pathogen)||0)*.0018;
  const diseaseRisk=Math.max(0,(weather.disease||0)+(state.env.disease||0)+(loc.disease||0)+neighborPressure+wetDisease+carryDisease+(carry.diseasePressure||0))*(1-diseaseRes)*(crop.diseaseSusceptibility||1)*(fx.diseaseRisk||1)*(gFx.diseaseRisk||1)*pressure;
  if(simUnit('disease',state.season,state.day,index,crop.uid||crop.seed.id)<diseaseRisk)crop.disease=clamp(crop.disease+8+simUnit('disease-load',state.season,state.day,index,crop.uid||crop.seed.id)*12);
  else crop.disease=Math.max(0,crop.disease-(pressure>1.35?1.5:2.5));
  let damage=0,stress=0;
  if(crop.water<20){damage+=7*(1-droughtRes);stress+=10;crop.stressLog.water+=2;}else if(crop.water<38){stress+=4;crop.stressLog.water++;}
  if(crop.n<20){damage+=4;stress+=6;crop.stressLog.n+=2;}else if(crop.n<35){stress+=2;crop.stressLog.n++;}
  if(weather.heat){damage+=5*(1-heatRes);stress+=6*(1-heatRes);crop.stressLog.heat++;}
  if(memory.hot>=3){damage+=2.5*(memory.hot-2)*(1-heatRes)*streakBoost;stress+=3*(memory.hot-2);crop.stressLog.heat++;}
  if(weather===WEATHER.storm&&crop.growth>55){damage+=2;stress+=2;}
  if(crop.disease>55){damage+=6;stress+=5;crop.stressLog.disease+=2;}else if(crop.disease>30){damage+=2;stress+=2;crop.stressLog.disease++;}
  const damagePressure=1+(pressure-1)*.55,guard=traitSum(traits,'healthGuard')+Math.min(.18,(state.legacy||0)*.03);
  crop.health=clamp(crop.health-damage*damagePressure*(1-guard));
  crop.stress=clamp(crop.stress+stress*(1+(pressure-1)*.35),0,120);
  const growthTrait=traitValue(traits,'growth',1),healthFactor=.55+.45*crop.health/100,resourceFactor=.65+.18*crop.water/100+.17*crop.n/100;
  const firstHarvestBoost=state.achievements.includes('first')?1:1.3,siteFactor=.94+.06*(carry.fertility||1),fatiguePenalty=1-Math.min(.08,(Number(state.fieldPressure?.fatigue)||0)*.0012);
  crop.growth=clamp(crop.growth+15.1*firstHarvestBoost*crop.seed.vigor*growthTrait*(gFx.growth||1)*healthFactor*resourceFactor*siteFactor*fatiguePenalty*(fx.growth||1),0,110);crop.age++;
}
function updateFieldPressure(){
  const crops=state.field.filter(Boolean),count=Math.max(1,crops.length),avgDisease=crops.reduce((sum,c)=>sum+(Number(c.disease)||0),0)/count,avgStress=crops.reduce((sum,c)=>sum+(Number(c.stress)||0),0)/count;
  const failed=Number(state.seasonStats.failed||0),previous=state.fieldPressure||{};
  state.fieldPressure={
    pathogen:round(clamp((Number(previous.pathogen)||0)*.55+avgDisease*.42+failed*2.4,0,75),1),
    fatigue:round(clamp((Number(previous.fatigue)||0)*.6+Math.max(0,avgStress-18)*.28+Math.max(0,(state.seasonStats.yield||0)/Math.max(1,fieldLimit())-10)*.7,0,70),1)
  };
}
function advanceDay(){
  clearUndo();if(state.pendingEvent){renderEvent();return;}
  if(state.day>=state.maxDay){finishSeason();return;}
  state.day++;harvestCombo=0;state.focus=focusMax(state.level);
  if(state.daily){
    const pool=weatherPool(state.env.id),seed=hashString(state.daily.key+':'+state.day);state.weather=pool[Math.floor(seededUnit(seed)*pool.length)];
  }else state.weather=deterministicWeather(state.env,state.day);
  const w=WEATHER[state.weather];weatherMemoryUpdate(state.weather);
  const diseaseSnapshot=state.field.map(crop=>Number(crop?.disease)||0);
  state.field.forEach((crop,index)=>processCrop(crop,w,index,diseaseSnapshot));runScheduledExperimentObservation();tickExpedition();
  addLog(w.icon+' '+w.name+'. '+w.effect+'.');
  const eventChance=state.achievements.includes('first')?(.10+Math.min(.04,Math.max(0,state.season-1)*.004)+(state.env.boss?0.04:0)):0.02;
  if(simUnit('event',state.season,state.day)<eventChance)state.pendingEvent=createEvent();
  render();
}
function createEvent(){
  const types=['rust','trader','soil','drainage'];
  if(state.season>=3||state.eventFlags.sampledSoil)types.push('signal');
  if(state.eventFlags.rustObserved)types.push('pathogen');
  if(state.eventFlags.traderSkipped)types.push('returnTrader');
  if(state.eventFlags.zeroTrace)types.push('archive');
  if(state.env.boss)types.push('bossChoice');
  return {kind:simPick(types,'event-kind',state.season,state.day),id:uid('event')};
}
function eventDefinition(event){
  const defs={
    rust:{kicker:'BIOSECURITY ALERT',title:'Front penyakit bergerak',text:'Bercak baru muncul di beberapa petak. Intervensi cepat mahal, tetapi mengurangi tekanan penyakit seluruh lahan.',
      choices:[['spray','Semprot · '+formatRupiah(actionCost('spray'))],['observe','Amati · +4 riset']]},
    trader:{kicker:'VISITOR',title:'Pedagang benih keliling',text:'Seorang pedagang menawarkan lot benih tanpa silsilah lengkap. Potensinya tidak pasti.',
      choices:[['buy','Beli lot · '+formatRupiah(actionCost('trader'))],['pass','Lewati']]},
    soil:{kicker:'SOIL SIGNAL',title:'Pembacaan tanah tidak normal',text:'Sensor menunjukkan pola ion yang berulang di bawah satu petak. Mengambil sampel membutuhkan fokus hari ini.',
      choices:[['sample','Ambil sampel · 1 fokus'],['ignore','Abaikan']]},
    drainage:{kicker:'WEATHER EVENT',title:'Air tertahan di lahan',text:'Saluran kecil tersumbat setelah hujan. Tanaman dengan penyakit aktif paling berisiko.',
      choices:[['drain','Buka drainase · 1 fokus'],['risk','Biarkan']]},
    signal:{kicker:'FIELD ZERO',title:'Sinyal ungu di petak',text:'Selama beberapa detik, sensor, daun, dan tanah menunjukkan pola yang sama. Tidak ada catatan fenomena ini.',
      choices:[['trace','Lacak sinyal · 2 fokus'],['shield','Lindungi tanaman · '+formatRupiah(actionCost('shield'))] ]},
    pathogen:{kicker:'FOLLOW-UP',title:'Sampel patogen kembali',text:'Data observasi karat sebelumnya membuka dua jalur: dokumentasi mendalam atau tindakan cepat.',
      choices:[['publish','Dokumentasikan · +8 RP'],['contain','Kendalikan penyakit']]},
    returnTrader:{kicker:'VISITOR',title:'Pedagang itu kembali',text:'Karena sebelumnya Anda menolak lot pertama, kali ini ia menawarkan galur yang lebih jelas asal-usulnya.',
      choices:[['buyBetter','Beli galur terseleksi · '+formatRupiah(actionCost('traderSelected'))],['declineAgain','Tolak lagi']]},
    archive:{kicker:'FIELD ZERO ARCHIVE',title:'Arsip terenkripsi ditemukan',text:'Jejak sinyal membuka satu fragmen arsip. Anda dapat membacanya sekarang atau mengonversi energinya untuk menjaga tanaman.',
      choices:[['readArchive','Baca arsip'],['stabilize','Stabilkan lahan']]},
    bossChoice:{kicker:'BOSS SEASON',title:'Tekanan utama meningkat',text:'Kondisi ekstrem memuncak. Pilih satu respons prioritas untuk seluruh lahan.',
      choices:[['defendBoss','Pertahanan kolektif · 2 fokus'],['gambleBoss','Ambil risiko · +10 RP']]}
  };
  return defs[event.kind]||defs.soil;
}
function canEventChoice(kind,choice){
  if(choice==='spray')return state.coins>=actionCost('spray');if(choice==='buy')return state.coins>=actionCost('trader');
  if(choice==='sample'||choice==='drain')return state.focus>=1;if(choice==='trace'||choice==='defendBoss')return state.focus>=2;if(choice==='shield')return state.coins>=actionCost('shield');
  if(choice==='buyBetter')return state.coins>=actionCost('traderSelected');
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
  const key='trader:'+state.season+':'+state.vault.length,traitPool=seededShuffle(Object.keys(TRAITS).filter(id=>id!=='zero'),hashString(key)),traits=traitPool.slice(0,2),seedId=uid('seed');
  return {id:seedId,name:'Lot '+String.fromCharCode(65+Math.floor(simUnit(key,'letter')*26))+Math.floor(10+simUnit(key,'number')*90),generation:0,traits,baseYield:round(13+simUnit(key,'yield')*5,1),vigor:round(.92+simUnit(key,'vigor')*.16,2),source:'Pedagang',parents:[],stock:10,viability:94,ageSeasons:0,genome:normalizeGenome(null,seedId,state.simulationSeed)};
}
function applyEventChoice(choice){
  clearUndo();const event=state.pendingEvent;if(!event||!canEventChoice(event.kind,choice))return;
  let note='';
  if(event.kind==='rust'){
    if(choice==='spray'){const eventCost=actionCost('spray');state.coins-=eventCost;state.seasonStats.cost=(state.seasonStats.cost||0)+eventCost;state.field.forEach(c=>{if(c)c.disease=Math.max(0,c.disease-22);});note='Tekanan penyakit ditekan · '+formatRupiah(actionCost('spray'))+'.';}
    else{state.rp+=4;state.eventFlags.rustObserved=true;state.field.forEach(c=>{if(c)c.disease=clamp(c.disease+5);});note='Data penyakit dikumpulkan. Follow-up mungkin muncul.';}
  }
  if(event.kind==='trader'){
    if(choice==='buy'){const eventCost=actionCost('trader');state.coins-=eventCost;state.seasonStats.cost=(state.seasonStats.cost||0)+eventCost;const seed=traderSeed();state.vault.push(seed);state.selectedSeedId=seed.id;seed.traits.forEach(discoverTrait);rememberLineage(seed);note=seed.name+' masuk Seed Vault.';}
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
    }else{const eventCost=actionCost('shield');state.coins-=eventCost;state.seasonStats.cost=(state.seasonStats.cost||0)+eventCost;state.field.forEach(c=>{if(c)c.health=clamp(c.health+7);});note='Tanaman dilindungi dari anomali.';}
  }
  if(event.kind==='pathogen'){
    if(choice==='publish'){state.rp+=8;state.xp+=18;note='Dataset patogen didokumentasikan: +8 RP.';}
    else{state.field.forEach(c=>{if(c)c.disease=Math.max(0,c.disease-28);});note='Tekanan penyakit dikendalikan.';}
    state.eventFlags.rustObserved=false;
  }
  if(event.kind==='returnTrader'){
    if(choice==='buyBetter'){
      const eventCost=actionCost('traderSelected');state.coins-=eventCost;state.seasonStats.cost=(state.seasonStats.cost||0)+eventCost;const seed=traderSeed();seed.name='Selected-'+seed.name;seed.baseYield=round(seed.baseYield*1.08,1);seed.source='Pedagang terseleksi';state.vault.push(seed);state.selectedSeedId=seed.id;seed.traits.forEach(discoverTrait);rememberLineage(seed);note=seed.name+' masuk Seed Vault.';
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
  if(state.pendingEvent)return;clearUndo();updateFieldPressure();
  for(let i=0;i<state.field.length;i++){const crop=state.field[i];if(crop&&crop.growth>=100&&crop.health>0)recordHarvest(i,crop,.9,false);}
  const completed=missionDone(),contractRatio=missionRatio(),challenge=activeChallenge(),rewardScale=challenge.reward||1;
  const reward=completed
    ?{coins:Math.round(75000*rewardScale),rp:Math.round(8*rewardScale),xp:Math.round(45*rewardScale)}
    :{coins:Math.round((8000+26000*contractRatio)*Math.min(1.2,rewardScale)),rp:Math.floor(3*contractRatio),xp:Math.round(6+16*contractRatio)};
  const rivalTarget=computeRivalTarget(),beatRival=state.seasonStats.yield>=rivalTarget,bossWon=!!state.env.boss&&completed;
  state.coins+=reward.coins;state.rp+=reward.rp;state.xp+=reward.xp;state.level=levelFromXp(state.xp);
  if(beatRival){state.rivalWins=(state.rivalWins||0)+1;state.rp+=4;awardAchievement('rival');}
  if(state.env.boss){state.collection.bosses=unique([...(state.collection.bosses||[]),state.env.id]);if(bossWon){state.rp+=12;state.coins+=50000;awardAchievement('boss');}}
  else state.collection.environments=unique([...(state.collection.environments||[]),state.env.id]);
  if(['drought','rust','wet','poorN','anomaly'].includes(state.env.id)||state.env.boss)awardAchievement('survivor');
  const previousGhost=recordBest();
  if(state.daily){awardAchievement('daily');state.records['daily:'+state.daily.key]=Math.max(Number(state.records['daily:'+state.daily.key]||0),state.seasonStats.yield);}
  updateRecord(state.seasonStats.yield);
  const ghostDelta=round(state.seasonStats.yield-previousGhost,1);
  state.history.unshift({season:state.season,env:state.env.name,location:state.location,challenge:state.challenge,yield:state.seasonStats.yield,revenue:state.seasonStats.revenue||0,cost:state.seasonStats.cost||0,marketPrice:state.marketPrice,mission:completed,contractRatio:round(contractRatio,2),rival:rivalTarget,beatRival,boss:!!state.env.boss,pressure:structuredClone(state.fieldPressure)});state.history=state.history.slice(0,20);
  if(hasTech('cold')&&state.seasonBest&&!state.vault.some(item=>item.id===state.seasonBest.seed.id)){
    const auto=state.seasonBest.seed;state.vault.push(auto);rememberLineage(auto);addLog('Cold Storage otomatis menyimpan '+auto.name+'.');
  }
  $('#recapTitle').textContent='Musim '+state.season+' · '+(completed?'Target tercapai':'Target belum tercapai')+(state.env.boss?' · BOSS':'');
  $('#recapStats').innerHTML=`<div><small>Total hasil</small><b>${state.seasonStats.yield.toFixed(1)} kg</b></div><div><small>Kontrak</small><b>${Math.round(contractRatio*100)}%</b></div><div><small>Rival</small><b>${state.seasonStats.yield>=rivalTarget?'Menang':'Kalah'} · ${rivalTarget.toFixed(1)} kg</b></div><div><small>Insentif</small><b>+${formatRupiah(reward.coins)}</b></div><div><small>Patogen carry-over</small><b>${state.fieldPressure.pathogen.toFixed(1)}</b></div><div><small>Residu stres lahan</small><b>${state.fieldPressure.fatigue.toFixed(1)}</b></div>`;
  const best=$('#bestCandidate'),saveButton=$('#saveBestSeed');
  if(state.seasonBest){
    const seed=state.seasonBest.seed;rememberLineage(seed);best.innerHTML=`<small>Kandidat terbaik · ${state.seasonBest.yield.toFixed(1)} kg</small><b>${esc(seed.name)}</b><div class="trait-row">${seedTraitsHtml(seed)}</div>`;
    saveButton.hidden=!selectionCandidates(state.season).length;saveButton.disabled=false;saveButton.textContent='🧬 Seleksi';
  }else{best.innerHTML='';saveButton.hidden=true;}
  $('#recapModal').hidden=false;save();notifyGameProfile(true);beep(760,.12);
}
function saveBestCandidate(){
  if(!state.seasonBest)return;const seed=state.seasonBest.seed;if(state.vault.some(item=>item.id===seed.id))return;
  state.vault.push(seed);state.selectedSeedId=seed.id;seed.traits.forEach(discoverTrait);rememberLineage(seed);$('#saveBestSeed').disabled=true;toast(seed.name+' disimpan ke Seed Vault');renderVault();save();
}
function archiveActiveExperiment(){
  const exp=state.experiment;if(!exp)return;
  state.experimentHistory=[{
    id:exp.id,name:exp.name,season:state.season,design:exp.design,kind:exp.kind,quality:experimentQualityScore(),
    treatments:exp.treatments.length,reps:exp.reps,completed:exp.units.filter(unit=>exp.parameters.every(p=>String(unit.observations?.[p]??'').trim()!=='')).length,total:exp.units.length
  },...state.experimentHistory].slice(0,20);
}
function beginNextSeason(){
  const wasDaily=!!state.daily;archiveActiveExperiment();
  state.season++;state.day=1;state.field=Array.from({length:PLOT_COUNT},()=>null);state.plotUse=Array.from({length:PLOT_COUNT},()=> 'commercial');state.experiment=null;state.focus=focusMax(state.level);state.irrigationUses=0;
  state.vault.forEach(seed=>{seed.ageSeasons=(seed.ageSeasons||0)+1;seed.viability=clamp((seed.viability||96)-(hasTech('cold')?1:3),0,100);});
  if(wasDaily){state.daily=null;state.challenge='standard';state.maxDay=CHALLENGES.standard.maxDay;state.monoSeedId=null;}
  state.env=newEnvironment(state.season);state.weather=rollWeather(state.env);state.weatherMemory={hot:0,wet:0,dry:0};state.marketPrice=rollMarketPrice(state.season,state.env.id,state.location);state.seasonStartRp=state.rp;state.mission=missionFor(state.season,state.challenge);
  state.seasonStats={yield:0,harvests:0,healthy:0,maxYield:0,failed:0,revenue:0,cost:0};state.seasonBest=null;state.pendingEvent=null;state.selectedPlot=0;state.rivalTarget=computeRivalTarget();
  if(state.season%3===0){const fragment=LORE[Math.min(LORE.length-1,Math.floor(state.season/3)-1)];if(fragment&&!state.lore.includes(fragment)){state.lore.push(fragment);addLog('Fragment arsip baru ditemukan.');}}
  addLog('Musim '+state.season+' dimulai: '+state.env.name+(state.env.boss?' [BOSS]':'')+'.',1);$('#recapModal').hidden=true;render();toast(state.env.name+' dimulai');
}

function updateCrossPreview(){
  const a=state.vault.find(seed=>seed.id===$('#parentA').value),b=state.vault.find(seed=>seed.id===$('#parentB').value),selected=selectedSeed();
  $('#crossSeeds').disabled=!a||!b||a.id===b.id||state.rp<CROSS_COST;
  const genHost=$('#selectedSeedGenetics');if(genHost)genHost.innerHTML=seedGenerationPanel(selected);
  const selfButton=$('#selfSelectedSeed');if(selfButton){
    const g=Math.max(0,Number(selected?.generation)||0);selfButton.disabled=!selected||g<1||state.rp<4;selfButton.textContent=g<1?'Silangkan dulu untuk membuat F1':'Selfing '+generationName(g)+' → '+generationName(g+1)+' · 4 RP';
  }
  if(!a||!b){$('#crossPreview').textContent='Pilih dua tetua. Persilangan membuat F1; selfing F1 menghasilkan F2 yang bersegregasi.';return;}
  const possible=unique([...a.traits,...b.traits]),hetA=Math.round(observedHeterozygosity(a.genome||{})*100),hetB=Math.round(observedHeterozygosity(b.genome||{})*100);
  $('#crossPreview').innerHTML=`<b>${esc(a.name)} × ${esc(b.name)}</b><small>Heterozigositas tetua: A ${hetA}% · B ${hetB}% · keturunan pertama = F1</small><span class="trait-row">${possible.map(id=>`<span class="trait ${traitMeta(id).rarity}">${esc(traitMeta(id).name)}</span>`).join('')}</span>`;
}
function crossSeeds(){
  clearUndo();const a=state.vault.find(seed=>seed.id===$('#parentA').value),b=state.vault.find(seed=>seed.id===$('#parentB').value);
  if(!a||!b||a.id===b.id||state.rp<CROSS_COST)return;
  state.rp-=CROSS_COST;const crossKey=[state.season,a.id,b.id,state.vault.length].join(':'),inheritChance=hasTech('breeding')?0.72:0.58,union=unique([...a.traits,...b.traits]);
  let inherited=seededShuffle(union,hashString(crossKey)).filter((_,i)=>simUnit('inherit',crossKey,i)<inheritChance).slice(0,hasTech('breeding')?4:3);
  if(!inherited.length)inherited=[simPick(union,'inherit-fallback',crossKey)];
  if(simUnit('cross-mutation',crossKey)<(hasTech('breeding')?0.22:0.16)){
    const pool=MUTATION_POOL.filter(id=>!inherited.includes(id)),mutation=pool.length?simPick(pool,'cross-mutation-trait',crossKey):null;if(mutation){inherited.push(mutation);discoverTrait(mutation);}
  }
  if(state.season>=5&&simUnit('cross-zero',crossKey)<(hasTech('genome')?0.04:0.025)&&!inherited.includes('zero')){inherited.push('zero');discoverTrait('zero');}
  const child={id:uid('seed'),name:'X'+state.season+'-'+Math.floor(100+simUnit('cross-name',crossKey)*900),generation:1,traits:unique(inherited).slice(0,4),baseYield:round(((a.baseYield+b.baseYield)/2)*(.95+simUnit('cross-yield',crossKey)*.12),1),vigor:round(((a.vigor+b.vigor)/2)*(.97+simUnit('cross-vigor',crossKey)*.08),2),source:a.name+' × '+b.name,parents:[a.id,b.id],evidenceTests:0,stressTests:0,species:state.species,stock:8,viability:98,ageSeasons:0,genome:crossGenome(a.genome,b.genome,crossKey)};
  state.vault.push(child);rememberLineage(a);rememberLineage(b);rememberLineage(child);state.selectedSeedId=child.id;state.xp+=30;state.level=levelFromXp(state.xp);state.learning.xp+=6;awardLearning('crossing:parent',5);awardLearning('crossing:f1',8);awardAchievement('breeder');addLog('Breeding Lab menghasilkan '+child.name+'.');beep(680,.1);render();toast(child.name+' berhasil dibuat');
}

function bind(){
  const field=$('#fieldGrid'),vault=$('#vaultList'),toolDock=$('#toolDock');
  let mobileFieldGesture=null,suppressFieldClickUntil=0,inspectHoldTimer=0,inspectHoldPointer=0,inspectHoldX=0,inspectHoldY=0;
  const touchLike=event=>event.pointerType==='touch'||event.pointerType==='pen';
  const plotFromPoint=(x,y)=>document.elementFromPoint(x,y)?.closest?.('[data-plot]');
  const gestureAction=index=>{
    const g=mobileFieldGesture;if(!g||g.seen.has(index)||index<0||index>=fieldLimit())return;
    g.seen.add(index);
    if(g.mode==='harvest'){
      const crop=state.field[index];if(!crop||crop.growth<100||crop.health<=0)return;
      g.harvested++;g.yield=round(g.yield+recordHarvest(index,crop,1,false),1);
      field.querySelector(`[data-plot="${index}"]`)?.classList.add('gesture-used');haptic(8);return;
    }
    if(g.mode){
      const before=JSON.stringify(state.field[index]||null),beforeFocus=state.focus,beforeCoins=state.coins;
      useFieldTool(g.mode,index);
      if(before!==JSON.stringify(state.field[index]||null)||beforeFocus!==state.focus||beforeCoins!==state.coins){g.applied++;haptic(6);}
    }
  };
  const finishGesture=event=>{
    const g=mobileFieldGesture;if(!g||event.pointerId!==g.pointerId)return;
    if(g.active){
      suppressFieldClickUntil=performance.now()+420;
      if(g.mode==='harvest'&&g.harvested){
        render();save();toast(`Panen cepat · ${g.harvested} petak · ${g.yield} kg`);
        document.dispatchEvent(new Event('fieldzero-field-change'));
      }else if(g.mode!=='harvest'&&g.applied>1)toast(`${toolSymbol(g.mode)} × ${g.applied}`);
    }
    field.classList.remove('gesture-active');
    try{if(field.hasPointerCapture?.(event.pointerId))field.releasePointerCapture(event.pointerId);}catch{}
    mobileFieldGesture=null;interactionBusy=false;flushNotifications();
  };
  field.addEventListener('click',event=>{
    if(performance.now()<suppressFieldClickUntil)return;
    const plot=event.target.closest('[data-plot]');if(!plot||plot.disabled)return;
    const index=Number(plot.dataset.plot);
    if(activeFieldTool){useFieldTool(activeFieldTool,index);return;}
    state.selectedPlot=index;beep(330);renderField();renderInspector();renderComfortControls();openInspectorSheet();
  });
  field.addEventListener('pointerdown',event=>{
    if(!touchLike(event)||event.button!==0)return;
    const plot=event.target.closest('[data-plot]');if(!plot||plot.disabled)return;
    const index=Number(plot.dataset.plot),crop=state.field[index];
    clearTimeout(inspectHoldTimer);inspectHoldPointer=event.pointerId;inspectHoldX=event.clientX;inspectHoldY=event.clientY;
    inspectHoldTimer=setTimeout(()=>{
      if(inspectHoldPointer!==event.pointerId)return;
      mobileFieldGesture=null;suppressFieldClickUntil=performance.now()+500;state.selectedPlot=index;
      renderField();renderInspector();renderComfortControls();openInspectorSheet();haptic(16);
    },520);
    const mode=activeFieldTool||(crop&&crop.growth>=100&&crop.health>0?'harvest':'');
    if(!mode)return;
    mobileFieldGesture={pointerId:event.pointerId,startX:event.clientX,startY:event.clientY,startIndex:index,mode,seen:new Set(),active:false,harvested:0,yield:0,applied:0};
  },{passive:true});
  field.addEventListener('pointermove',event=>{
    if(event.pointerId===inspectHoldPointer&&Math.hypot(event.clientX-inspectHoldX,event.clientY-inspectHoldY)>8){clearTimeout(inspectHoldTimer);inspectHoldPointer=0;}
    const g=mobileFieldGesture;if(!g||event.pointerId!==g.pointerId)return;
    const dx=event.clientX-g.startX,dy=event.clientY-g.startY;
    if(Math.hypot(dx,dy)>8){clearTimeout(inspectHoldTimer);inspectHoldPointer=0;}
    if(!g.active){
      if(Math.hypot(dx,dy)<11)return;
      g.active=true;interactionBusy=true;if(g.mode==='harvest')clearUndo();field.classList.add('gesture-active');
      try{field.setPointerCapture?.(event.pointerId);}catch{}
      gestureAction(g.startIndex);
    }
    event.preventDefault();
    const plot=plotFromPoint(event.clientX,event.clientY);if(plot&&!plot.disabled)gestureAction(Number(plot.dataset.plot));
  },{passive:false});
  field.addEventListener('pointerup',event=>{clearTimeout(inspectHoldTimer);inspectHoldPointer=0;finishGesture(event);});
  field.addEventListener('pointercancel',event=>{clearTimeout(inspectHoldTimer);inspectHoldPointer=0;finishGesture(event);});
  field.addEventListener('dragstart',event=>{
    const plot=event.target.closest('[data-harvest-drag]');if(!plot)return;
    event.dataTransfer.setData('fieldzero/harvest-index',plot.dataset.harvestDrag);event.dataTransfer.effectAllowed='move';plot.classList.add('dragging-harvest');
  });
  field.addEventListener('dragend',event=>event.target.closest('[data-harvest-drag]')?.classList.remove('dragging-harvest'));
  field.addEventListener('dragover',event=>{const plot=event.target.closest('[data-plot]');if(plot&&!plot.disabled){event.preventDefault();plot.classList.add('drag-target');}});
  field.addEventListener('dragleave',event=>event.target.closest('[data-plot]')?.classList.remove('drag-target'));
  field.addEventListener('drop',event=>{
    const plot=event.target.closest('[data-plot]');if(!plot||plot.disabled)return;event.preventDefault();plot.classList.remove('drag-target');
    const index=Number(plot.dataset.plot),seedId=event.dataTransfer?.getData('fieldzero/seed')||'',tool=event.dataTransfer?.getData('fieldzero/tool')||(seedId?'plant':'');
    if(tool)useFieldTool(tool,index,{seedId});
  });
  toolDock.addEventListener('click',event=>{const button=event.target.closest('[data-field-tool]');if(button)setFieldTool(button.dataset.fieldTool);});
  toolDock.addEventListener('dragstart',event=>{const button=event.target.closest('[data-field-tool]');if(!button)return;event.dataTransfer.setData('fieldzero/tool',button.dataset.fieldTool);event.dataTransfer.effectAllowed='copy';});
  const basket=$('#harvestBasket');
  basket.addEventListener('dragover',event=>{if(event.dataTransfer?.types.includes('fieldzero/harvest-index')){event.preventDefault();basket.classList.add('basket-ready');}});
  basket.addEventListener('dragleave',()=>basket.classList.remove('basket-ready'));
  basket.addEventListener('drop',event=>{
    const raw=event.dataTransfer?.getData('fieldzero/harvest-index');if(raw==='')return;
    event.preventDefault();basket.classList.remove('basket-ready');const index=Number(raw);
    if(Number.isInteger(index))harvestPlot(index,1,true);
  });
  vault.addEventListener('click',event=>{
    const buy=event.target.closest('[data-buy-seed]');
    if(buy){
      const seed=state.vault.find(item=>item.id===buy.dataset.buySeed);if(!seed||state.coins<COMMERCIAL_SEED_PACK_COST)return;
      state.coins-=COMMERCIAL_SEED_PACK_COST;state.seasonStats.cost=(state.seasonStats.cost||0)+COMMERCIAL_SEED_PACK_COST;seed.stock=(seed.stock||0)+COMMERCIAL_SEED_PACK_SIZE;seed.viability=Math.max(seed.viability||0,95);save();render();toast('🌱 +'+COMMERCIAL_SEED_PACK_SIZE);return;
    }
    const rename=event.target.closest('[data-rename-seed]');
    if(rename){
      const seed=state.vault.find(item=>item.id===rename.dataset.renameSeed);if(!seed)return;
      const name=prompt('Nama varietas',seed.name)?.trim().slice(0,28);if(!name)return;
      seed.name=name;rememberLineage(seed);save();render();toast('Nama varietas disimpan');return;
    }
    const button=event.target.closest('[data-use-seed]');if(!button)return;state.selectedSeedId=button.dataset.useSeed;save();renderVault();renderInspector();renderGenomeLab();toast('Benih dipilih');
  });
  vault.addEventListener('dragstart',event=>{const card=event.target.closest('[data-seed-drag]');if(!card)return;event.dataTransfer.setData('fieldzero/seed',card.dataset.seedDrag);event.dataTransfer.effectAllowed='copy';});
  $('#nextDay').onclick=()=>breedingCup.active()?breedingCup.open():advanceDay();$('#finishSeason').onclick=finishSeason;
  $('#smartAction').onclick=()=>{runSmartAction();openInspectorSheet();};
  $('#attentionToggle').onclick=toggleAttention;
  $('#closeInspectorSheet').onclick=closeInspectorSheet;
  $('#undoAction').onclick=undoLastAction;
  $('#eventChoices').addEventListener('click',event=>{const button=event.target.closest('[data-event-choice]');if(button)applyEventChoice(button.dataset.eventChoice);});
  $('#eventModal').addEventListener('click',event=>{if(event.target.id==='eventModal')$('#eventModal').hidden=true;});
  $('#saveBestSeed').onclick=openSelection;$('#nextSeason').onclick=beginNextSeason;
  $('#parentA').onchange=updateCrossPreview;$('#parentB').onchange=updateCrossPreview;$('#crossSeeds').onclick=crossSeeds;
  $('#selfSelectedSeed').onclick=selfSelectedSeed;
  $('#soundToggle').onclick=async()=>{
    if(!isMusicPlaying()){state.sound=true;save();renderHud();await startMusic(state.musicTrack||'morning');beep(520,.05);}
    else{state.sound=false;save();renderHud();stopMusic();}
  };
  const resetRun=(confirmed=false)=>{clearUndo();if(!confirmed&&!confirm('Mulai ulang Field Zero? Save permainan saat ini akan diganti.'))return;state=freshState();applyComfortSettings();save();$('#eventModal').hidden=true;$('#recapModal').hidden=true;closeMetaModal();closeInspectorSheet();render();notifyGameProfile();toast('Run baru dimulai');};
  let resetHold=0,resetHoldDone=false;
  $('#newRun').addEventListener('pointerdown',event=>{if(event.pointerType!=='touch'&&event.pointerType!=='pen')return;resetHoldDone=false;resetHold=setTimeout(()=>{resetHoldDone=true;haptic(20);resetRun(true);},700);});
  ['pointerup','pointercancel','pointerleave'].forEach(type=>$('#newRun').addEventListener(type,()=>{clearTimeout(resetHold);resetHold=0;}));
  $('#newRun').onclick=event=>{if(resetHoldDone){event.preventDefault();return;}if(matchMedia('(pointer:coarse)').matches){toast('Tahan ↺ untuk reset');return;}resetRun();};
  $('#openWorldMap').onclick=openWorldMap;$('#openChallenges').onclick=openChallenges;$('#openRival').onclick=openRival;$('#openRecords').onclick=openRecords;$('#openPrestige').onclick=openPrestige;$('#openEvolution').onclick=openEvolution;$('#openSelection').onclick=openSelection;
  $('#quickField').onclick=()=>{state.comfort.lastView='field';save();closeInspectorSheet();document.querySelector('.field-panel')?.scrollIntoView({behavior:'smooth',block:'start'});};
  $('#quickLab').onclick=()=>{state.comfort.lastView='lab';save();closeInspectorSheet();const hub=$('#labHub');hub.open=true;hub.scrollIntoView({behavior:'smooth',block:'start'});};
  $('#quickMap').onclick=openWorldMap;$('#quickExperiment').onclick=openExperiment;$('#quickMore').onclick=openQuickMore;
  $('#selectedSeedQuick').onclick=openSeedVault;$('#playHint').onclick=runPlayHint;$('#gameHelp').onclick=openGameHelp;
  $('#closeMetaModal').onclick=closeMetaModal;$('#metaModal').addEventListener('click',event=>{if(event.target.id==='metaModal')closeMetaModal();});
  document.addEventListener('keydown',event=>{
    if(event.key>='1'&&event.key<='9'&&!event.target.matches('input,select,textarea')){const index=Number(event.key)-1;if(index<fieldLimit()){state.selectedPlot=index;renderField();renderInspector();}}
    if(event.key==='Escape'){setFieldTool('');closeMetaModal();}
  });
  document.addEventListener('pointerdown',event=>{if(event.target.closest('#soundToggle'))return;if(state.sound&&!isMusicPlaying())startMusic(state.musicTrack||'morning');},{once:true});
  const rememberSeen=()=>{state.comfort.lastSeenAt=Date.now();save();};
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')rememberSeen();});
  window.addEventListener('beforeunload',()=>{rememberSeen();stopMusic();});
}

window.FieldZeroGame={
  getProfile:gameProfile,applyBurnRaid:applyRemoteBurn,applyWaterAid,refresh:render,
  exportSave:exportCloudSave,importSave:importCloudSave,
  fingerprintSave:progressFingerprint,getSaveSummary:gameProgressSummary,isFreshSave:isFreshProgress
};
applyComfortSettings();bind();render();lastProgressFingerprint=progressFingerprint();updateCrossPreview();notifyGameProfile();document.dispatchEvent(new Event('fieldzero-ready'));
if(resumeGapMs>30*60*1000){
  const issues=attentionIndexes().length,ready=state.field.filter(crop=>crop&&crop.health>0&&crop.growth>=100).length;
  setTimeout(()=>toast('Kembali · '+ready+' siap panen · '+issues+' perlu perhatian'),350);
}
if(state.comfort.lastView==='lab'&&resumeGapMs<2*60*60*1000){
  setTimeout(()=>{const hub=$('#labHub');if(hub){hub.open=true;hub.scrollIntoView({block:'start'});}},120);
}
