import fs from 'node:fs';
import {analyzeExperiment,auditDesign,makeProgeny,genomeStats,speciesProfile,recommendedParameters} from '../public/game/academy.js';

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
if(!html.includes('class="calm-ui"'))fail('game must default to calm focus UI');
if(!css.includes('FIELD ZERO CALM FOCUS UI'))fail('calm focus styling missing');
for(const marker of ['id="gameWorkflow"','data-main-action="lab"','data-main-action="research"','data-main-action="analysis"'])if(!html.includes(marker))fail('focused game workflow missing '+marker);
for(const marker of ['FIELD ZERO FOCUSED GAMEPLAY FLOW','.game-workflow','.field-primary-actions','.research-steps','.experiment-wizard'])if(!css.includes(marker))fail('focused workflow styling missing '+marker);
for(const marker of ['renderExperimentWizard','openAnalysisHub','workflowStep','renderProgressiveUI','experimentDraft','PENELITIAN AKTIF'])if(!app.includes(marker))fail('focused game flow missing '+marker);
if(app.includes('Hipotesis sebelum menghitung'))fail('statistics learning must not block analysis behind a mandatory quiz');
for(const marker of ['id="phenologyStatus"','id="criticalTask"','id="timeStop"','id="skip3Days"','id="nextCritical"','>Tenaga<'])if(!html.includes(marker))fail('agronomic time UI missing '+marker);
for(const marker of ['GAME_SAVE_VERSION=8','seasonLengthFor','nitrogenTimingEfficiency','Prakiraan 3 hari','criticalTasks','criticalStopReason','stepOneDay','advanceDays','reproStress'])if(!app.includes(marker))fail('agronomic time engine missing '+marker);
for(const marker of ['openCareCenter','batchCare','carePriority','careCandidates','applyCareAction'])if(!app.includes(marker))fail('strategic care engine missing '+marker);
for(const marker of ["theme:'system'","function preferredTheme()","function applyTheme()",'data-comfort="theme"','prefers-color-scheme: light'])if(!app.includes(marker))fail('theme preference system missing '+marker);
for(const marker of ['FIELD ZERO LIGHT/DARK THEME 2026-09-27','body.theme-light','body.theme-dark'])if(!css.includes(marker))fail('light dark theme styling missing '+marker);

for(const marker of ['<span>Rawat</span>','id="attentionCount"'])if(!html.includes(marker))fail('strategic care entry UI missing '+marker);
for(const marker of ['FIELD ZERO CARE CENTER 2026-09-26','.care-choice','.field-tool-dock [data-field-tool="water"]'])if(!css.includes(marker))fail('strategic care styling missing '+marker);
if(!app.includes("$('#attentionToggle').onclick=openCareCenter;"))fail('Rawat button must open the care center');
if(app.includes("$('#attentionToggle').onclick=toggleAttention;"))fail('Rawat button must not only cycle attention mode');

for(const marker of ['frequency:14','Setiap 14 hari','Math.max(7,Math.min(28','days:14'])if(!app.includes(marker))fail('real-calendar scheduling missing '+marker);
if(app.includes('Setiap 2 hari</option>')||app.includes('measureEvery:Math.max(1,Math.min(4'))fail('legacy compressed observation cadence must not return');
for(const marker of ['FIELD ZERO AGRONOMIC TIME 2026-09-26','.time-panel','#nextCritical'])if(!css.includes(marker))fail('agronomic time styling missing '+marker);
if(!competition.includes("api.seasonDays?.('trial24')")||!competition.includes("api.seasonDays?.('standard')"))fail('Breeding Cup calendar integration missing');
if(!worker.includes('day>200'))fail('cloud save must allow full agronomic calendar');

for(const marker of ['id="fieldGrid"','id="vaultList"','id="crossSeeds"','id="eventModal"','id="recapModal"','id="metaModal"','id="socialModal"','id="toolDock"','id="quickSocial"','id="labHub"','id="playHint"','id="selectedSeedQuick"','id="gameHelp"','id="harvestBasket"','data-field-tool="harvest"','id="smartAction"','id="attentionToggle"','id="marketValue"','id="undoToast"','id="closeInspectorSheet"','id="quickExperiment"','id="cloudSync"','id="syncConflictModal"','id="syncUseCloud"','id="syncKeepLocal"','id="experimentTool"','data-field-tool="treatment"','id="openSelection"','id="selectionCount"','id="openAcademy"','id="academyStatus"','id="crossMode"','Peringkat','Koleksi Benih','Teknologi','Periksa','/account.js','/game/app.js','/game/social.js','/game/sync.js','/game/style.css','/pwa-register.js'])if(!html.includes(marker))fail('game shell missing '+marker);
for(const marker of ['agrotik_field_zero_v1','finishSeason','crossSeeds','LOCATIONS','TECH','EXPEDITIONS','CHALLENGES','BOSSES','RIVALS','dailyDefinition','doPrestige','startExpedition','startGenomePuzzle','openWorldMap','openQuickMore','openMusicPicker','setFieldTool','useFieldTool','fieldzero/seed','fieldzero/tool','applyRemoteBurn','applyWaterAid','harvestReason','firstHarvestBoost','stressLog','data-rename-seed','harvestCombo','fieldzero/harvest-index','toolSymbol','isMusicPlaying','PRICE_REFERENCE','formatRupiah','rollMarketPrice','plotIssue','openComfortSettings','openEconomyInfo','smartActionForSelected','offerUndo','waterSensitivity','nDemand','diseaseSusceptibility','fieldzero-profile','fieldzero-save-change','fieldzero-ready','exportCloudSave','importCloudSave','progressFingerprint','FieldZeroGame','STAT_IMPORT_KEY','openExperiment','createExperiment','randomizedExperimentUnits','experimentDataset','sendExperimentToStat','recordExperimentObservation','applyExperimentTreatment','experimentSeedForPlot','createBreedingCup','breedingCup.active','trial24','Iron Field','Musim Krisis','pressureLevel','weatherMemoryUpdate','infectedNeighbors','fieldPressure','missionRatio','missionDisplay','actionCost','adaptive','BLOCK_COUNT=3','PLOTS_PER_BLOCK=8','ACADEMY_MODEL_VERSION','PLOT_USES','makePlotRegistry','plotRegistry','selectionPool','seedEvidence','openSelection','runScheduledExperimentObservation','experimentRawDataset','experimentQualityScore','DATA SIMULASI GAME','PlantUID','TingkatData','simUnit','deterministicWeather','makeSubsamples','sampleMeasurements','plotCarryover','SUBSAMPEL · BUKAN ULANGAN','selectionScore','COMMERCIAL_SEED_PACK_COST','viability','ageSeasons','normalizeGenome','crossGenome','selfGenome','geneticEffects','openAcademy','openStatisticsLab','openExperimentAudit','openDesignCase','openCrossProtocol','academyMark','crossCost','generationLabel','homozygosity','factorialTreatments','advancedDesignUnlocked','value="frak"','value="fral"','value="split"','openSpeciesPicker',"rice:{id:'rice'","soybean:{id:'soybean'",'FaktorA','FaktorB','WEATHER_METRICS','organicMatter','compaction','PROFESSOR_CASES','openProfessorCasebook','openProfessorCase','design-pseudorep','design-splitplot','stats-posthoc','stats-correlation','stats-assumption','breeding-heritability','breeding-ge','breeding-response','cross-segregation','cross-inbreeding','experimentCorrelation','selectionDifferential'])if(!app.includes(marker))fail('gameplay/meta progression loop missing '+marker);
for(const marker of ['.plot-canopy','.field-grid','.plot.ready','.plot.sick','.event-backdrop','.seed-list','.game-quick-nav','.field-tool-dock','.drag-target','.plot.burned','.social-card','.social-tabs','.social-player','.aid-button','.music-picker','.seed-card-actions','.basket-ready','.dragging-harvest','.mobile-command-row','.undo-toast','.economy-grid','.comfort-settings','.attention-mode','.sheet-open','.battery-saver','.color-safe','.cloud-sync','.sync-conflict-card','.sync-save-card','.experiment-badge','.experiment-form','.experiment-table','.experiment-actions','.competition-head','.competition-diagnostics','.decision-review','.failure-case','.soil-high','.field-block','.field-block-grid','.plot-academy-context','.plot-use-switch','.selection-list','.selection-modes','.trait-evidence','.academy-intro','.academy-progress','.academy-track-grid','.anova-table','.stat-kpis','.design-audit-list','.professor-case','.professor-casebook','.stat-correlation','.selection-differential','.professor-stat-actions','.genotype-preview','.cross-protocol-steps','.lab-hub','.play-hint','.field-context','.help-steps','.species-picker','.factor-b-fields','.soil-mini','.soil-acid','.soil-compact','@media(max-width:620px)'])if(!css.includes(marker))fail('game styling missing '+marker);
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
for(const marker of ['FIELD ZERO CLASSIC COMPAT','content-visibility:auto','backdrop-filter:none!important'])if(!css.includes(marker))fail('classic lightweight field rendering missing '+marker);
for(const marker of ['Pagi di Lahan','Hujan di Rumah Kaca','Lampu Lab Malam','startMusic','setMusicTrack','setMusicVolume','isMusicPlaying'])if(!music.includes(marker))fail('music system missing '+marker);
if(social.includes('fieldzero-field-change'))fail('social client must not poll Worker on local field changes');
if(social.includes('/v1/game/raids/inbox')||social.includes('/v1/game/aids/inbox'))fail('social client must use batched inbox endpoint');
for(const marker of ['G + E + M','G×E','G×M','24*135000','TENDERS','STRATEGIES','DIAGNOSTICS','DATA SIMULASI','Uji akhir rahasia','Pilih tepat 2 galur','finalTest','INVESTIGASI KEGAGALAN','name="design"'])if(!competition.includes(marker))fail('Breeding Cup missing '+marker);
for(const marker of ['agrotik_stat_import_queue_v1','statistical_web_local_only_datasets_v1','consumeExternalDatasetImport',"source!=='field-zero'",'dataset-import','datasets'])if(!statMain.includes(marker))fail('Field Zero to /stat bridge missing '+marker);
for(const marker of ['statistical_web_local_only_datasets_v1','localOnlyNames','Dataset game tersimpan lokal'])if(!datasetSync.includes(marker))fail('local-only dataset sync guard missing '+marker);
for(const marker of ['speciesProfile','recommendedParameters','rice','soybean','Jumlah anakan','Polong isi','makeSubsamples','sampleMeasurements','aggregateSamples','plotCarryover','evidenceLabel','founderGenome','crossGenome','selfGenome','geneticEffects','analyzeExperiment','auditDesign','makeProgeny','genomeStats','heritability','repeated-measure'])if(!academy.includes(marker))fail('academy model missing '+marker);
if(!statWorkflow.includes('tanaman subsampel')||!statWorkflow.includes('bukan ulangan independen'))fail('stat pseudoreplication warning missing');
if((html.match(/id="socialModal"/g)||[]).length!==1)fail('social modal must exist exactly once');
for(const id of ['maize','chili','rice','soybean'])if(speciesProfile(id).id!==id)fail('species profile missing '+id);
for(const marker of ['JA','JAP','PM','GI','GH'])if(!recommendedParameters('rice').includes(marker))fail('rice parameter missing '+marker);
for(const marker of ['JC','PI','PH'])if(!recommendedParameters('soybean').includes(marker))fail('soybean parameter missing '+marker);
if(!app.includes("['rak','frak','split','aug'].includes")||!app.includes("design==='split'")||!app.includes("design==='aug'"))fail('advanced experimental randomization missing');
if(!app.includes("design:statDesign")||!app.includes("statDesign=summary.design==='aug'?'augmented':summary.design")||!app.includes("dataLabel:'DATA SIMULASI GAME'"))fail('advanced /stat handoff metadata missing');
for(const marker of ['RECOVERY_STORAGE','RECOVERY_LIMIT=3','checkpoint(','restoreCheckpoint','openRecoveryCenter','noteBreeder','recordDecision','openBreederNotebook','openExperimentHistory','openGenerationCompare','seasonDecisionReview'])if(!app.includes(marker))fail('recovery/notebook system missing '+marker);
for(const marker of ['augmentedTreatments','design===\'aug\'','role:\'check\'','role:\'entry\'','augmentedAnalysis','adjusted:raw-blockMean+grand','designPrecisionScore','fieldHeterogeneity'])if(!app.includes(marker))fail('augmented/precision system missing '+marker);
for(const marker of ['weeklyDefinition','startWeekly','FieldZeroWeekly','playerRivalScore','metric:\'stability\'','metric:\'profit\'','metric:\'breeding\''])if(!app.includes(marker))fail('competitive strategy system missing '+marker);
for(const marker of ['id="advanceNotice"','id="prevPlot"','id="nextPlot"','id="nextIssuePlot"'])if(!html.includes(marker))fail('field navigation/advance guard missing '+marker);
for(const marker of ['FIELD ZERO SYSTEMS PASS','.advance-notice','.augmented-ranking','.recovery-list','.breeder-notebook','.generation-compare','.candidate-metrics'])if(!css.includes(marker))fail('systems UI styling missing '+marker);
if(html.includes('field-zero-world.svg')||html.includes('class="field-world"'))fail('classic game shell must not load immersive map artwork');

const dynamicIds=new Set(['academyStatParameter','openCupFromPlot','seedSelect','plantSelected','openCollectionBook','startGenome','experimentForm']);
const htmlIds=new Set([...html.matchAll(/id="([^"]+)"/g)].map(match=>match[1]));
for(const match of app.matchAll(/\$\('#([^']+)'\)\.(?:onclick|onchange|oninput|addEventListener)/g)){
  if(!htmlIds.has(match[1])&&!dynamicIds.has(match[1]))fail('static control binding has no DOM target: '+match[1]);
}
if(Buffer.byteLength(app,'utf8')>260000)fail('game app exceeds 260 KB performance budget');
if(Buffer.byteLength(css,'utf8')>100000)fail('game CSS exceeds 100 KB performance budget');
if(Buffer.byteLength(html,'utf8')>30000)fail('game shell exceeds 30 KB performance budget');

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

console.log('Field Zero check OK: calm field-first UI, recovery saves, augmented design, design precision, breeding generations, strategy rivals, weekly seed, /stat export and local-first cloud sync are wired within performance budgets.');
