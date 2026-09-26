import fs from 'node:fs';

const root=fs.readFileSync('index.html','utf8');
const html=fs.readFileSync('public/game/index.html','utf8');
const css=fs.readFileSync('public/game/style.css','utf8');
const app=fs.readFileSync('public/game/app.js','utf8');

function fail(message){console.error('Field Zero check failed: '+message);process.exit(1);}

if(!root.includes('href="/game/"')||!root.includes('Field Zero'))fail('homepage must link to /game/');
for(const marker of ['id="fieldGrid"','id="vaultList"','id="crossSeeds"','id="eventModal"','id="recapModal"','id="metaModal"','id="openWorldMap"','id="openChallenges"','id="openRival"','id="openRecords"','id="openPrestige"','id="techTree"','id="expeditionPanel"','id="genomeLab"','id="evolutionPreview"','/game/app.js','/game/style.css','/pwa-register.js'])if(!html.includes(marker))fail('game shell missing '+marker);
for(const marker of ['agrotik_field_zero_v1','STARTER_SEEDS','ENVIRONMENTS','MUTATION_POOL','finishSeason','crossSeeds','pendingEvent','discoveredTraits','achievements','localStorage.setItem','LOCATIONS','TECH','EXPEDITIONS','CHALLENGES','BOSSES','RIVALS','GENOME_SIG','dailyDefinition','startDaily','doPrestige','startExpedition','tickExpedition','startGenomePuzzle','solveGenome','computeRivalTarget','updateRecord','openWorldMap','openChallenges','openRival','openRecords','openPrestige','openEvolution','openCollectionBook','eventFlags'])if(!app.includes(marker))fail('gameplay/meta progression loop missing '+marker);
for(const marker of ['.field-grid','.plot.ready','.plot.stressed','.plot.sick','.event-backdrop','.seed-list','.cross-form','.meta-strip','.tech-tree','.expedition-list','.genome-puzzle','.world-map','.challenge-grid','.lineage-tree','.codex-grid','.plot-locked','@media(max-width:620px)'])if(!css.includes(marker))fail('game styling missing '+marker);
if(/fetch\(|XMLHttpRequest|WebSocket/.test(app))fail('Field Zero must remain local/offline-first');
console.log('Field Zero check OK: local roguelite loop plus world map, tech, expedition, genome, boss, rival, daily, challenge, prestige, lineage, codex and ghost records are wired.');
