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

function focusMax(level){return Math.min(6,4+Math.floor((Math.max(1,level)-1)/3));}
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
    version:1,season:1,day:1,maxDay:MAX_DAY,coins:78,rp:0,xp:0,level:1,focus:4,sound:false,
    field:Array.from({length:PLOT_COUNT},()=>null),vault:structuredClone(STARTER_SEEDS),selectedPlot:0,selectedSeedId:'seed-aruna',
    discoveredTraits:unique(STARTER_SEEDS.flatMap(seed=>seed.traits)),achievements:[],lore:[],
    env,weather:rollWeather(env),mission:missionFor(1),
    seasonStats:{yield:0,harvests:0,healthy:0,maxYield:0,failed:0},seasonBest:null,pendingEvent:null,
    log:[{day:1,text:'Field Zero aktif. Empat galur starter tersedia di Seed Vault.'}],history:[]
  };
}
function load(){
  try{
    const raw=JSON.parse(localStorage.getItem(STORAGE)||'null');
    if(!raw||raw.version!==1)return freshState();
    raw.level=levelFromXp(raw.xp||0);raw.focus=Math.min(raw.focus??4,focusMax(raw.level));
    if(!Array.isArray(raw.field)||raw.field.length!==PLOT_COUNT)raw.field=Array.from({length:PLOT_COUNT},()=>null);
    if(!Array.isArray(raw.vault)||!raw.vault.length)raw.vault=structuredClone(STARTER_SEEDS);
    return {...freshState(),...raw};
  }catch{return freshState();}
}
let state=load(),toastTimer=0,audioContext=null;

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
  $('#fieldGrid').innerHTML=state.field.map((crop,index)=>{
    const cls=statusClass(crop),selected=index===state.selectedPlot?' selected':'';
    if(!crop)return `<button type="button" class="plot empty${selected}" data-plot="${index}" aria-label="Petak ${index+1}, kosong"><div class="plot-top"><span>P${String(index+1).padStart(2,'0')}</span><span>KOSONG</span></div><div class="plot-empty-mark">＋</div></button>`;
    const stage=stageOf(crop),traits=allCropTraits(crop);
    return `<button type="button" class="plot ${cls}${selected}" data-plot="${index}" aria-label="Petak ${index+1}, ${esc(crop.seed.name)}, ${esc(stage)}"><div class="plot-top"><span>P${String(index+1).padStart(2,'0')}</span><span>H${crop.age}</span></div><div class="plot-crop"><span class="plant-icon">${cropIcon(crop)}</span><div><b>${esc(crop.seed.name)}</b><small>${esc(stage)} · ${Math.round(crop.growth)}%</small></div></div><div class="plot-health"><i style="width:${crop.health}%"></i></div><div class="plot-bars"><span class="mini-meter"><i style="width:${crop.water}%"></i></span><span class="mini-meter n"><i style="width:${crop.n}%"></i></span></div>${crop.revealed&&crop.mutation?`<span class="trait ${traitMeta(crop.mutation).rarity}" title="Mutasi">${traitMeta(crop.mutation).icon}</span>`:''}</button>`;
  }).join('');
}
function renderInspector(){
  const crop=selectedCrop(),plot=state.selectedPlot+1;
  $('#plotTitle').textContent='Petak '+String(plot).padStart(2,'0');
  $('#plotStage').textContent=stageOf(crop);
  if(!crop){
    const seed=selectedSeed();
    $('#inspectorBody').innerHTML=`<div class="seed-picker"><label>Benih<select id="seedSelect">${state.vault.map(item=>`<option value="${esc(item.id)}" ${item.id===seed.id?'selected':''}>${esc(item.name)} · G${item.generation}</option>`).join('')}</select></label><div class="seed-card-preview"><b>${esc(seed.name)}</b><p>Potensi dasar ${seed.baseYield.toFixed(1)} · vigor ${seed.vigor.toFixed(2)} · ${esc(seed.source)}</p><div class="trait-row">${seedTraitsHtml(seed)}</div></div><button id="plantSelected" class="primary" type="button" ${state.focus<1||state.coins<PLANT_COST?'disabled':''}>Tanam · ${PLANT_COST} koin · 1 fokus</button><p class="action-note">Trait mutasi tidak terlihat saat tanam. Scout dapat mengungkapkannya lebih awal.</p></div>`;
    $('#seedSelect').onchange=event=>{state.selectedSeedId=event.target.value;save();renderInspector();renderVault();};
    $('#plantSelected').onclick=plantSelected;
    return;
  }
  const knownExtra=crop.revealed&&crop.mutation?[crop.mutation]:[];
  const mutationText=crop.mutation?(crop.revealed?traitMeta(crop.mutation).name:'Belum diketahui'):'Tidak terdeteksi';
  $('#inspectorBody').innerHTML=`<div class="crop-stats"><div class="stat-box"><span>Kesehatan</span><b>${Math.round(crop.health)}%</b></div><div class="stat-box"><span>Air</span><b>${Math.round(crop.water)}%</b></div><div class="stat-box"><span>Nitrogen</span><b>${Math.round(crop.n)}%</b></div><div class="stat-box"><span>Penyakit</span><b>${Math.round(crop.disease)}%</b></div></div><div class="seed-card-preview"><b>${esc(crop.seed.name)} · G${crop.seed.generation}</b><p>Stres akumulatif ${Math.round(crop.stress)} · anomali: ${esc(mutationText)}</p><div class="trait-row">${seedTraitsHtml(crop.seed,knownExtra)}</div></div><div class="action-grid"><button data-crop-action="water" ${state.focus<1||crop.health<=0?'disabled':''}>💧 Irigasi · 1 fokus</button><button data-crop-action="fertilize" ${state.focus<1||state.coins<5||crop.health<=0?'disabled':''}>N Pupuk · 5 koin</button><button class="scout" data-crop-action="scout" ${state.focus<1||crop.health<=0?'disabled':''}>◎ Scout · 1 fokus</button>${crop.health<=0?'<button data-crop-action="remove">Bersihkan petak</button>':crop.growth>=100?'<button class="harvest" data-crop-action="harvest">Panen sekarang</button>':''}</div><p class="action-note">Pertumbuhan ${Math.round(crop.growth)}%. Kondisi air, N, penyakit, lingkungan, dan trait menentukan hasil akhir.</p>`;
  $('#inspectorBody').querySelectorAll('[data-crop-action]').forEach(button=>button.onclick=()=>cropAction(button.dataset.cropAction));
}
function renderVault(){
  $('#vaultCount').textContent=state.vault.length;
  $('#vaultList').innerHTML=state.vault.map(seed=>`<article class="seed-item ${seed.id===state.selectedSeedId?'active':''}"><div class="seed-item-head"><b>${esc(seed.name)}</b><small>G${seed.generation}</small></div><small>${esc(seed.source)} · potensi ${seed.baseYield.toFixed(1)}</small><div class="trait-row">${seedTraitsHtml(seed)}</div><button type="button" data-use-seed="${esc(seed.id)}">${seed.id===state.selectedSeedId?'Dipilih':'Pilih untuk tanam'}</button></article>`).join('');
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
  $('#discoveries').innerHTML=`<div class="discovery-grid">${traitCards+achCards}</div>${lore}`;
  $('#discoveryCount').textContent=(state.discoveredTraits.length+state.achievements.length);
}
function render(){
  renderHud();renderSeason();renderField();renderInspector();renderVault();renderLog();renderDiscoveries();save();
  if(state.pendingEvent)renderEvent();
}

function plantSelected(){
  const seed=selectedSeed();if(!seed||state.field[state.selectedPlot]||state.focus<1||state.coins<PLANT_COST)return;
  const mutationChance=Math.min(.12,.045+state.level*.004+(state.env.id==='anomaly'?.05:0));
  let mutation=null;
  if(chance(mutationChance)){
    const pool=MUTATION_POOL.filter(id=>!seed.traits.includes(id));mutation=pool.length?pick(pool):null;
    if(state.env.id==='anomaly'&&state.season>=4&&chance(.08))mutation='zero';
  }
  state.field[state.selectedPlot]={
    seed:structuredClone(seed),age:0,growth:3,health:100,water:62,n:58,disease:0,stress:0,mutation,revealed:false,scouted:0
  };
  state.coins-=PLANT_COST;state.focus--;addLog('P'+String(state.selectedPlot+1).padStart(2,'0')+': '+seed.name+' ditanam.');beep(410);render();
}
function cropAction(action){
  const crop=selectedCrop();if(!crop)return;
  if(action==='remove'){state.field[state.selectedPlot]=null;state.seasonStats.failed++;addLog('P'+(state.selectedPlot+1)+': tanaman mati dibersihkan.');render();return;}
  if(action==='harvest'){harvestPlot(state.selectedPlot,1,true);return;}
  if(state.focus<1||crop.health<=0)return;
  if(action==='water'){crop.water=clamp(crop.water+38);state.focus--;crop.stress=Math.max(0,crop.stress-2);addLog('P'+(state.selectedPlot+1)+': irigasi.');beep(360);}
  if(action==='fertilize'){
    if(state.coins<5)return;crop.n=clamp(crop.n+38);state.coins-=5;state.focus--;addLog('P'+(state.selectedPlot+1)+': pemupukan N.');beep(440);
  }
  if(action==='scout'){
    state.focus--;crop.scouted++;const bonus=traitSum(allCropTraits(crop),'scoutRp');state.rp+=2+bonus;
    if(crop.mutation&&!crop.revealed){crop.revealed=true;discoverTrait(crop.mutation);addLog('P'+(state.selectedPlot+1)+': scout menemukan '+traitMeta(crop.mutation).name+'.');}
    else addLog('P'+(state.selectedPlot+1)+': scout selesai; penyakit '+Math.round(crop.disease)+'%.');
    crop.disease=Math.max(0,crop.disease-5);beep(540);
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
  return Math.max(0,round(crop.seed.baseYield*healthFactor*stressPenalty*waterFactor*nFactor*traitYield*state.env.yield*noise,1));
}
function candidateFrom(crop,yieldValue){
  const traits=allCropTraits(crop),gain=yieldValue>crop.seed.baseYield?1.04:1;
  return {
    id:uid('seed'),name:'FZ-'+state.season+'-'+String(state.selectedPlot+1).padStart(2,'0'),generation:(crop.seed.generation||0)+1,
    traits:unique(traits).slice(0,4),baseYield:round(crop.seed.baseYield*gain*(.97+Math.random()*.06),1),
    vigor:round(crop.seed.vigor*(.98+Math.random()*.05),2),source:'Seleksi musim '+state.season
  };
}
function recordHarvest(index,crop,multiplier=1,announce=true){
  const y=round(yieldFor(crop)*multiplier,1);state.seasonStats.yield=round(state.seasonStats.yield+y,1);state.seasonStats.harvests++;
  if(crop.health>=80)state.seasonStats.healthy++;state.seasonStats.maxYield=Math.max(state.seasonStats.maxYield,y);
  state.coins+=Math.round(y*1.25);state.rp+=Math.max(1,Math.floor(y/9));state.xp+=Math.max(5,Math.round(y*1.6));state.level=levelFromXp(state.xp);
  if(!state.seasonBest||y>state.seasonBest.yield)state.seasonBest={yield:y,seed:candidateFrom(crop,y)};
  allCropTraits(crop).forEach(id=>discoverTrait(id));
  if(crop.mutation)awardAchievement('anomaly');awardAchievement('first');if(y>=20)awardAchievement('twenty');if(crop.health>=95)awardAchievement('perfect');
  addLog('P'+String(index+1).padStart(2,'0')+': panen '+y+' kg dari '+crop.seed.name+'.');
  if(announce)toast('Panen '+y+' kg · +'+Math.round(y*1.25)+' koin');
  state.field[index]=null;beep(650,.08);return y;
}
function harvestPlot(index,multiplier=1,announce=true){
  const crop=state.field[index];if(!crop||crop.growth<100||crop.health<=0)return 0;
  const y=recordHarvest(index,crop,multiplier,announce);render();return y;
}

function processCrop(crop,weather){
  if(!crop||crop.health<=0)return;
  const traits=allCropTraits(crop),droughtRes=traitSum(traits,'droughtRes'),heatRes=traitSum(traits,'heatRes'),diseaseRes=traitSum(traits,'diseaseRes');
  const waterLoss=traitValue(traits,'waterLoss',1),nLoss=traitValue(traits,'nLoss',1);
  const seasonalWater=state.env.waterLoss||0;
  const waterDelta=(weather.water<0?(weather.water+seasonalWater)*waterLoss*(1-droughtRes):weather.water+seasonalWater);
  crop.water=clamp(crop.water+waterDelta);
  crop.n=clamp(crop.n-(5+(state.env.nLoss||0))*nLoss);
  const diseaseRisk=Math.max(0,(weather.disease||0)+(state.env.disease||0))*(1-diseaseRes);
  if(chance(diseaseRisk))crop.disease=clamp(crop.disease+8+Math.random()*12);
  else crop.disease=Math.max(0,crop.disease-2.5);
  let damage=0,stress=0;
  if(crop.water<20){damage+=7*(1-droughtRes);stress+=10;}else if(crop.water<38)stress+=4;
  if(crop.n<20){damage+=4;stress+=6;}else if(crop.n<35)stress+=2;
  if(weather.heat){damage+=5*(1-heatRes);stress+=6*(1-heatRes);}
  if(weather===WEATHER.storm&&crop.growth>55){damage+=2;stress+=2;}
  if(crop.disease>55){damage+=6;stress+=5;}else if(crop.disease>30){damage+=2;stress+=2;}
  const guard=traitSum(traits,'healthGuard');crop.health=clamp(crop.health-damage*(1-guard));
  crop.stress=clamp(crop.stress+stress,0,120);
  const growthTrait=traitValue(traits,'growth',1),healthFactor=.55+.45*crop.health/100,resourceFactor=.65+.18*crop.water/100+.17*crop.n/100;
  crop.growth=clamp(crop.growth+15.5*crop.seed.vigor*growthTrait*healthFactor*resourceFactor,0,110);crop.age++;
}
function advanceDay(){
  if(state.pendingEvent)return;
  if(state.day>=state.maxDay){finishSeason();return;}
  state.day++;state.focus=focusMax(state.level);state.weather=rollWeather(state.env);
  const w=WEATHER[state.weather];state.field.forEach(crop=>processCrop(crop,w));
  addLog(w.icon+' '+w.name+'. '+w.effect+'.');
  if(chance(.28+Math.min(.12,state.season*.01)))state.pendingEvent=createEvent();
  render();if(state.pendingEvent)renderEvent();else toast('Hari '+state.day+' · '+w.name);
}
function createEvent(){
  const types=['rust','trader','soil','drainage'];if(state.season>=3)types.push('signal');
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
      choices:[['trace','Lacak sinyal · 2 fokus'],['shield','Lindungi tanaman · 8 koin']]}
  };
  return defs[event.kind]||defs.soil;
}
function canEventChoice(kind,choice){
  if(choice==='spray')return state.coins>=10;if(choice==='buy')return state.coins>=22;
  if(choice==='sample'||choice==='drain')return state.focus>=1;if(choice==='trace')return state.focus>=2;if(choice==='shield')return state.coins>=8;
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
    else{state.rp+=4;state.field.forEach(c=>{if(c)c.disease=clamp(c.disease+5);});note='Data penyakit dikumpulkan.';}
  }
  if(event.kind==='trader'){
    if(choice==='buy'){state.coins-=22;const seed=traderSeed();state.vault.push(seed);state.selectedSeedId=seed.id;seed.traits.forEach(discoverTrait);note=seed.name+' masuk Seed Vault.';}
    else note='Lot benih dilewati.';
  }
  if(event.kind==='soil'){
    if(choice==='sample'){
      state.focus--;state.rp+=6;const item=randomLivingCrop();
      if(item&&chance(.38)&&!item.crop.mutation){item.crop.mutation=pick(MUTATION_POOL.filter(id=>!item.crop.seed.traits.includes(id)));item.crop.revealed=true;discoverTrait(item.crop.mutation);}
      note='Sampel menghasilkan +6 riset.';
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
      note=item?'Resonansi Zero ditemukan pada P'+(item.index+1)+'.':'Jejak sinyal dikonversi menjadi +10 riset.';
    }else{state.coins-=8;state.field.forEach(c=>{if(c)c.health=clamp(c.health+7);});note='Tanaman dilindungi dari anomali.';}
  }
  addLog(note);state.pendingEvent=null;$('#eventModal').hidden=true;beep(580,.06);render();
}

function finishSeason(){
  if(state.pendingEvent)return;
  for(let i=0;i<state.field.length;i++){const crop=state.field[i];if(crop&&crop.growth>=100&&crop.health>0)recordHarvest(i,crop,.9,false);}
  const completed=missionDone(),reward=completed?{coins:35,rp:8,xp:45}:{coins:10,rp:2,xp:12};
  state.coins+=reward.coins;state.rp+=reward.rp;state.xp+=reward.xp;state.level=levelFromXp(state.xp);
  if(['drought','rust','wet','poorN','anomaly'].includes(state.env.id))awardAchievement('survivor');
  state.history.unshift({season:state.season,env:state.env.name,yield:state.seasonStats.yield,mission:completed});state.history=state.history.slice(0,12);
  $('#recapTitle').textContent='Musim '+state.season+' · '+(completed?'Target tercapai':'Target belum tercapai');
  $('#recapStats').innerHTML=`<div><small>Total hasil</small><b>${state.seasonStats.yield.toFixed(1)} kg</b></div><div><small>Panen</small><b>${state.seasonStats.harvests} petak</b></div><div><small>Reward</small><b>+${reward.coins} koin</b></div>`;
  const best=$('#bestCandidate'),saveButton=$('#saveBestSeed');
  if(state.seasonBest){
    const seed=state.seasonBest.seed;best.innerHTML=`<small>Kandidat terbaik · ${state.seasonBest.yield.toFixed(1)} kg</small><b>${esc(seed.name)}</b><div class="trait-row">${seedTraitsHtml(seed)}</div>`;
    saveButton.hidden=false;saveButton.disabled=state.vault.some(item=>item.id===seed.id);
  }else{best.innerHTML='';saveButton.hidden=true;}
  $('#recapModal').hidden=false;save();beep(760,.12);
}
function saveBestCandidate(){
  if(!state.seasonBest)return;const seed=state.seasonBest.seed;if(state.vault.some(item=>item.id===seed.id))return;
  state.vault.push(seed);state.selectedSeedId=seed.id;seed.traits.forEach(discoverTrait);$('#saveBestSeed').disabled=true;toast(seed.name+' disimpan ke Seed Vault');renderVault();save();
}
function beginNextSeason(){
  state.season++;state.day=1;state.field=Array.from({length:PLOT_COUNT},()=>null);state.focus=focusMax(state.level);
  state.env=newEnvironment(state.season);state.weather=rollWeather(state.env);state.mission=missionFor(state.season);
  state.seasonStats={yield:0,harvests:0,healthy:0,maxYield:0,failed:0};state.seasonBest=null;state.pendingEvent=null;state.selectedPlot=0;
  if(state.season%3===0){const fragment=LORE[Math.min(LORE.length-1,Math.floor(state.season/3)-1)];if(fragment&&!state.lore.includes(fragment)){state.lore.push(fragment);addLog('Fragment arsip baru ditemukan.');}}
  addLog('Musim '+state.season+' dimulai: '+state.env.name+'.',1);$('#recapModal').hidden=true;render();toast(state.env.name+' dimulai');
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
  state.rp-=CROSS_COST;let inherited=shuffle(unique([...a.traits,...b.traits])).filter(()=>chance(.58)).slice(0,3);
  if(!inherited.length)inherited=[pick(unique([...a.traits,...b.traits]))];
  if(chance(.16)){
    const mutation=pick(MUTATION_POOL.filter(id=>!inherited.includes(id)));if(mutation){inherited.push(mutation);discoverTrait(mutation);}
  }
  if(state.season>=5&&chance(.025)&&!inherited.includes('zero')){inherited.push('zero');discoverTrait('zero');}
  const child={id:uid('seed'),name:'X'+state.season+'-'+Math.floor(100+Math.random()*900),generation:Math.max(a.generation,b.generation)+1,traits:unique(inherited).slice(0,4),baseYield:round(((a.baseYield+b.baseYield)/2)*(.95+Math.random()*.12),1),vigor:round(((a.vigor+b.vigor)/2)*(.97+Math.random()*.08),2),source:a.name+' × '+b.name};
  state.vault.push(child);state.selectedSeedId=child.id;state.xp+=30;state.level=levelFromXp(state.xp);awardAchievement('breeder');addLog('Breeding Lab menghasilkan '+child.name+'.');beep(680,.1);render();toast(child.name+' berhasil dibuat');
}

function bind(){
  $('#fieldGrid').addEventListener('click',event=>{const plot=event.target.closest('[data-plot]');if(!plot)return;state.selectedPlot=Number(plot.dataset.plot);beep(330);renderField();renderInspector();});
  $('#vaultList').addEventListener('click',event=>{const button=event.target.closest('[data-use-seed]');if(!button)return;state.selectedSeedId=button.dataset.useSeed;save();renderVault();renderInspector();toast('Benih dipilih');});
  $('#nextDay').onclick=advanceDay;$('#finishSeason').onclick=finishSeason;
  $('#eventChoices').addEventListener('click',event=>{const button=event.target.closest('[data-event-choice]');if(button)applyEventChoice(button.dataset.eventChoice);});
  $('#saveBestSeed').onclick=saveBestCandidate;$('#nextSeason').onclick=beginNextSeason;
  $('#parentA').onchange=updateCrossPreview;$('#parentB').onchange=updateCrossPreview;$('#crossSeeds').onclick=crossSeeds;
  $('#soundToggle').onclick=()=>{state.sound=!state.sound;save();renderHud();beep(520,.05);};
  $('#newRun').onclick=()=>{if(!confirm('Mulai ulang Field Zero? Save permainan saat ini akan diganti.'))return;state=freshState();save();$('#eventModal').hidden=true;$('#recapModal').hidden=true;render();toast('Run baru dimulai');};
  document.addEventListener('keydown',event=>{
    if(event.key>='1'&&event.key<='9'&&!event.target.matches('input,select,textarea')){const index=Number(event.key)-1;if(index<PLOT_COUNT){state.selectedPlot=index;renderField();renderInspector();}}
    if(event.key==='Enter'&&!$('#eventModal').hidden)return;
  });
  window.addEventListener('beforeunload',save);
}

bind();render();updateCrossPreview();
