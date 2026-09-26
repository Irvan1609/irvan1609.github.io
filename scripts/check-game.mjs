import fs from 'node:fs';
import {analyzeExperiment,auditDesign,makeProgeny,genomeStats} from '../public/game/academy.js';

const root=fs.readFileSync('index.html','utf8');
const html=fs.readFileSync('public/game/index.html','utf8');
const css=fs.readFileSync('public/game/style.css','utf8');
const app=fs.readFileSync('public/game/app.js','utf8');
const competition=fs.readFileSync('public/game/competition.js','utf8');
const academy=fs.readFileSync('public/game/academy.js','utf8');
const social=fs.readFileSync('public/game/social.js','utf8');
const sync=fs.readFileSync('public/game/sync.js','utf8');
const music=fs.readFileSync('public/game/music.js','utf8');
const world=fs.readFileSync('public/game/field-zero-world.svg','utf8');
const worker=fs.readFileSync('cloudflare/hitung-cabai-worker/src/index.js','utf8');
const statMain=fs.readFileSync('src/main.js','utf8');
const statWorkflow=fs.readFileSync('src/scientific-workflow.js','utf8');
const datasetSync=fs.readFileSync('src/account-dataset-sync.js','utf8');

function fail(message){console.error('Field Zero check failed: '+message);process.exit(1);}

if(!root.includes('href="/game/"')||!root.includes('Field Zero'))fail('homepage must link to /game/');
for(const marker of ['id="fieldGrid"','id="mapNursery"','id="mapResearch"','id="mapWater"','id="mapAnalysis"','class="field-world"','class="field-map-stage"','class="field-tool-analysis"','id="vaultList"','id="crossSeeds"','id="eventModal"','id="recapModal"','id="metaModal"','id="socialModal"','id="toolDock"','id="quickSocial"','id="labHub"','id="playHint"','id="selectedSeedQuick"','id="gameHelp"','id="harvestBasket"','data-field-tool="harvest"','id="smartAction"','id="attentionToggle"','id="marketValue"','id="undoToast"','id="closeInspectorSheet"','id="quickExperiment"','id="cloudSync"','id="syncConflictModal"','id="syncUseCloud"','id="syncKeepLocal"','id="experimentTool"','data-field-tool="treatment"','id="openSelection"','id="selectionCount"','id="openAcademy"','id="academyStatus"','id="crossMode"','Peringkat','Koleksi Benih','Teknologi','Periksa','/account.js','/game/app.js','/game/social.js','/game/sync.js','/game/style.css','/pwa-register.js'])if(!html.includes(marker))fail('game shell missing '+marker);
for(const marker of ['agrotik_field_zero_v1','finishSeason','crossSeeds','LOCATIONS','TECH','EXPEDITIONS','CHALLENGES','BOSSES','RIVALS','dailyDefinition','doPrestige','startExpedition','startGenomePuzzle','openWorldMap','openQuickMore','openMusicPicker','setFieldTool','useFieldTool','fieldzero/seed','fieldzero/tool','applyRemoteBurn','applyWaterAid','harvestReason','firstHarvestBoost','stressLog','data-rename-seed','harvestCombo','fieldzero/harvest-index','toolSymbol','isMusicPlaying','PRICE_REFERENCE','formatRupiah','rollMarketPrice','plotIssue','openComfortSettings','openEconomyInfo','smartActionForSelected','offerUndo','waterSensitivity','nDemand','diseaseSusceptibility','fieldzero-profile','fieldzero-save-change','fieldzero-ready','exportCloudSave','importCloudSave','progressFingerprint','FieldZeroGame','STAT_IMPORT_KEY','openExperiment','createExperiment','randomizedExperimentUnits','experimentDataset','sendExperimentToStat','recordExperimentObservation','applyExperimentTreatment','experimentSeedForPlot','createBreedingCup','breedingCup.active','trial24','Iron Field','Musim Krisis','pressureLevel','weatherMemoryUpdate','infectedNeighbors','fieldPressure','missionRatio','missionDisplay','actionCost','adaptive','BLOCK_COUNT=3','PLOTS_PER_BLOCK=8','ACADEMY_MODEL_VERSION','PLOT_USES','makePlotRegistry','plotRegistry','selectionPool','seedEvidence','openSelection','runScheduledExperimentObservation','experimentRawDataset','experimentQualityScore','DATA SIMULASI GAME','PlantUID','TingkatData','simUnit','deterministicWeather','makeSubsamples','sampleMeasurements','plotCarryover','SUBSAMPEL · BUKAN ULANGAN','selectionScore','COMMERCIAL_SEED_PACK_COST','viability','ageSeasons','normalizeGenome','crossGenome','selfGenome','geneticEffects','openAcademy','openStatisticsLab','openExperimentAudit','openDesignCase','openCrossProtocol','academyMark','crossCost','generationLabel','homozygosity','PROFESSOR_CASES','openProfessorCasebook','openProfessorCase','design-pseudorep','design-splitplot','stats-posthoc','stats-correlation','stats-assumption','breeding-heritability','breeding-ge','breeding-response','cross-segregation','cross-inbreeding','experimentCorrelation','selectionDifferential'])if(!app.includes(marker))fail('gameplay/meta progression loop missing '+marker);
for(const marker of ['.field-world','.field-world-landmarks','.map-landmark','.field-map-stage','.plot-canopy','.stage-ripe','.field-tool-analysis','.field-grid','.plot.ready','.plot.sick','.event-backdrop','.seed-list','.game-quick-nav','.field-tool-dock','.drag-target','.plot.burned','.social-card','.social-tabs','.social-player','.aid-button','.music-picker','.seed-card-actions','.basket-ready','.dragging-harvest','.mobile-command-row','.undo-toast','.economy-grid','.comfort-settings','.attention-mode','.sheet-open','.battery-saver','.color-safe','.cloud-sync','.sync-conflict-card','.sync-save-card','.experiment-badge','.experiment-form','.experiment-table','.experiment-actions','.competition-head','.competition-diagnostics','.decision-review','.failure-case','.soil-high','.field-block','.field-block-grid','.plot-academy-context','.plot-use-switch','.selection-list','.selection-modes','.trait-evidence','.academy-intro','.academy-progress','.academy-track-grid','.anova-table','.stat-kpis','.design-audit-list','.professor-case','.professor-casebook','.stat-correlation','.selection-differential','.professor-stat-actions','.genotype-preview','.cross-protocol-steps','.lab-hub','.play-hint','.field-context','.help-steps','@media(max-width:620px)'])if(!css.includes(marker))fail('game styling missing '+marker);
for(const marker of ['mobileFieldGesture','pointermove','Panen cepat'])if(!app.includes(marker))fail('mobile touch gameplay missing '+marker);
for(const marker of ['safe-area-inset-bottom','100dvh','content-visibility:auto','.field-grid.tool-active','.plot.gesture-used'])if(!css.includes(marker))fail('mobile game styling missing '+marker);
if(/fetch\(|XMLHttpRequest|WebSocket/.test(app+competition+academy))fail('Core Field Zero simulation must remain local/offline-first');
if(!app.includes("Kejadian lapang · ketuk untuk tinjau")||!app.includes("event.target.id==='eventModal'"))fail('event prompts must stay passive and dismissible');
if(app.includes("if(state.pendingEvent)renderEvent();"))fail('render loop must not auto-open event prompts');
if(/catch\(error\)\{alert\(/.test(app))fail('validation errors must not use blocking alert prompts');
for(const marker of ['/v1/game/profile','/v1/game/leaderboard','/v1/game/friends','/v1/game/inbox','/v1/game/inbox/claim','data-friend-burn','data-friend-aid','RANK_TTL','FRIENDS_TTL','PROFILE_TTL','IrvanAccount','fieldzero-profile'])if(!social.includes(marker))fail('social client missing '+marker);
for(const marker of ['CREATE TABLE IF NOT EXISTS game_profiles','score_version','CREATE TABLE IF NOT EXISTS game_friends','CREATE TABLE IF NOT EXISTS game_raids','CREATE TABLE IF NOT EXISTS game_aids','handleGameLeaderboard','handleGameFriends','handleGameRaid','handleGameAid','handleGameInbox','handleGameInboxClaim','cooldownMs=12*60*60*1000','shieldMs=2*60*60*1000',"Raid hanya dapat dilakukan ke teman.","Bantuan hanya dapat dikirim ke teman.","url.pathname.startsWith('/v1/game/')"])if(!worker.includes(marker))fail('social backend missing '+marker);
for(const marker of ['MAX_GAME_SAVE_BYTES','CREATE TABLE IF NOT EXISTS game_saves','handleGameSaveGet','handleGameSavePut',"url.pathname==='/v1/game/save'","error:'save_conflict'",'revision=?','WHERE user_id=? AND revision=?'])if(!worker.includes(marker))fail('cross-device save backend missing '+marker);
for(const marker of ['META_PREFIX','SYNC_DELAY=20000','MAX_DIRTY_WAIT=60000','/v1/game/save','fieldzero-save-change','fieldzero-ready','baseRevision','showConflict','useCloud','keepLocal','visibilitychange','window.addEventListener(\'online\''])if(!sync.includes(marker))fail('cross-device save client missing '+marker);
if(/setInterval\s*\(/.test(sync))fail('cross-device save must not poll continuously');
if(!world.includes('<svg')||!world.includes('Field Zero research farm landscape')||!world.includes('irrigation canal'))fail('visual farm world asset missing');
if(app.includes("Array.from({length:canopyCount}"))fail('crop canopy must not create decorative DOM per plant');
for(const marker of ['FIELD ZERO LITE RENDER','content-visibility:auto','body.battery-saver .field-world','backdrop-filter:none!important'])if(!css.includes(marker))fail('lightweight map rendering missing '+marker);
for(const marker of ['Pagi di Lahan','Hujan di Rumah Kaca','Lampu Lab Malam','startMusic','setMusicTrack','setMusicVolume','isMusicPlaying'])if(!music.includes(marker))fail('music system missing '+marker);
if(social.includes('fieldzero-field-change'))fail('social client must not poll Worker on local field changes');
if(social.includes('/v1/game/raids/inbox')||social.includes('/v1/game/aids/inbox'))fail('social client must use batched inbox endpoint');
for(const marker of ['G + E + M','G×E','G×M','24*135000','TENDERS','STRATEGIES','DIAGNOSTICS','DATA SIMULASI','Uji akhir rahasia','Pilih tepat 2 galur','finalTest','INVESTIGASI KEGAGALAN','name="design"'])if(!competition.includes(marker))fail('Breeding Cup missing '+marker);
for(const marker of ['agrotik_stat_import_queue_v1','statistical_web_local_only_datasets_v1','consumeExternalDatasetImport',"source!=='field-zero'",'dataset-import','datasets'])if(!statMain.includes(marker))fail('Field Zero to /stat bridge missing '+marker);
for(const marker of ['statistical_web_local_only_datasets_v1','localOnlyNames','Dataset game tersimpan lokal'])if(!datasetSync.includes(marker))fail('local-only dataset sync guard missing '+marker);
for(const marker of ['speciesProfile','recommendedParameters','makeSubsamples','sampleMeasurements','aggregateSamples','plotCarryover','evidenceLabel','founderGenome','crossGenome','selfGenome','geneticEffects','analyzeExperiment','auditDesign','makeProgeny','genomeStats','heritability','repeated-measure'])if(!academy.includes(marker))fail('academy model missing '+marker);
if(!statWorkflow.includes('tanaman subsampel')||!statWorkflow.includes('bukan ulangan independen'))fail('stat pseudoreplication warning missing');
const demoExp={
  design:'ral',kind:'genotype',
  treatments:[{id:'A',code:'A',name:'A'},{id:'B',code:'B',name:'B'},{id:'C',code:'C',name:'C'}],
  units:[
    {plot:0,treatmentId:'A',rep:1,block:1,observations:{Hasil:10}},{plot:1,treatmentId:'A',rep:2,block:1,observations:{Hasil:11}},{plot:2,treatmentId:'A',rep:3,block:1,observations:{Hasil:9}},
    {plot:3,treatmentId:'B',rep:1,block:2,observations:{Hasil:20}},{plot:4,treatmentId:'B',rep:2,block:2,observations:{Hasil:21}},{plot:5,treatmentId:'B',rep:3,block:2,observations:{Hasil:19}},
    {plot:6,treatmentId:'C',rep:1,block:3,observations:{Hasil:30}},{plot:7,treatmentId:'C',rep:2,block:3,observations:{Hasil:31}},{plot:8,treatmentId:'C',rep:3,block:3,observations:{Hasil:29}}
  ]
};
const anova=analyzeExperiment(demoExp,'Hasil');
if(!anova.ok||!(anova.p<.05)||anova.anova[0].df!==2||anova.means.length!==3)fail('professor ANOVA calculation invalid');
if(!(anova.heritability>.8))fail('genotype heritability teaching metric invalid');
const audit=auditDesign(demoExp,Array.from({length:9},(_,i)=>({fertility:.9+i*.03})));
if(!audit.some(item=>item.code==='heterogeneous-field'))fail('design audit must flag RAL on heterogeneous field');

const founderA={id:'A',traits:['early'],baseYield:16,vigor:1,generation:0};
const founderB={id:'B',traits:['deep'],baseYield:14,vigor:1,generation:0};
const f1=makeProgeny(founderA,founderB,'f1','demo-f1');
if(!f1||f1.generationLabel!=='F1'||f1.homozygosity<0||f1.homozygosity>1)fail('F1 generation invalid');
const f2=makeProgeny({...founderA,...f1,generation:1,parents:['A','B']},null,'self','demo-f2');
if(!f2||f2.generationLabel!=='F2'||f2.homozygosity<0||f2.homozygosity>1)fail('F2 selfing/segregation invalid');
const bc=makeProgeny({...founderA,...f1,generation:1,parents:['A','B']},founderA,'backcross','demo-bc');
if(!bc||bc.generationLabel!=='BC1')fail('backcross generation invalid');

console.log('Field Zero check OK: professor academy v2 covers experimental-unit discipline, split-plot reasoning, ANOVA/post-hoc/assumptions/correlation, heritability/G×E/selection response, F2 segregation/inbreeding, field data, cloud saves and competitive breeding.');
