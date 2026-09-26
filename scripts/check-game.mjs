import fs from 'node:fs';

const root=fs.readFileSync('index.html','utf8');
const html=fs.readFileSync('public/game/index.html','utf8');
const css=fs.readFileSync('public/game/style.css','utf8');
const app=fs.readFileSync('public/game/app.js','utf8');
const social=fs.readFileSync('public/game/social.js','utf8');
const worker=fs.readFileSync('cloudflare/hitung-cabai-worker/src/index.js','utf8');

function fail(message){console.error('Field Zero check failed: '+message);process.exit(1);}

if(!root.includes('href="/game/"')||!root.includes('Field Zero'))fail('homepage must link to /game/');
for(const marker of ['id="fieldGrid"','id="vaultList"','id="crossSeeds"','id="eventModal"','id="recapModal"','id="metaModal"','id="socialModal"','id="toolDock"','id="quickSocial"','id="labHub"','id="playHint"','id="selectedSeedQuick"','id="gameHelp"','/account.js','/game/app.js','/game/social.js','/game/style.css','/pwa-register.js'])if(!html.includes(marker))fail('game shell missing '+marker);
for(const marker of ['agrotik_field_zero_v1','finishSeason','crossSeeds','LOCATIONS','TECH','EXPEDITIONS','CHALLENGES','BOSSES','RIVALS','dailyDefinition','doPrestige','startExpedition','startGenomePuzzle','openWorldMap','openQuickMore','setFieldTool','useFieldTool','fieldzero/seed','fieldzero/tool','applyRemoteBurn','fieldzero-profile','FieldZeroGame','playHint','renderPlayControls','runPlayHint','openGameHelp','openSeedVault'])if(!app.includes(marker))fail('gameplay/meta progression loop missing '+marker);
for(const marker of ['.field-grid','.plot.ready','.plot.sick','.event-backdrop','.seed-list','.game-quick-nav','.field-tool-dock','.drag-target','.plot.burned','.social-card','.social-tabs','.social-player','.lab-hub','.play-hint','.field-context','.help-steps','@media(max-width:620px)'])if(!css.includes(marker))fail('game styling missing '+marker);
if(/fetch\(|XMLHttpRequest|WebSocket/.test(app))fail('Core Field Zero simulation must remain local/offline-first');
for(const marker of ['/v1/game/profile','/v1/game/leaderboard','/v1/game/friends','/v1/game/raids/inbox','data-friend-burn','IrvanAccount','fieldzero-profile'])if(!social.includes(marker))fail('social client missing '+marker);
for(const marker of ['CREATE TABLE IF NOT EXISTS game_profiles','CREATE TABLE IF NOT EXISTS game_friends','CREATE TABLE IF NOT EXISTS game_raids','handleGameLeaderboard','handleGameFriends','handleGameRaid','cooldownMs=12*60*60*1000',"Raid hanya dapat dilakukan ke teman.","url.pathname.startsWith('/v1/game/')"])if(!worker.includes(marker))fail('social backend missing '+marker);
console.log('Field Zero check OK: easy-play drag/tap tools, account social, leaderboard, friends and bounded friend raids are wired.');
