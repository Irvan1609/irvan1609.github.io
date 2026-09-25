import fs from 'node:fs';
import path from 'node:path';

function fail(message) {
  console.error(`Dist check failed: ${message}`);
  process.exit(1);
}

const portfolioPath = 'dist/index.html';
const statPath = 'dist/stat/index.html';
const printPath = 'dist/print-skripsi/index.html';
const mendeleyPath = 'dist/mendeley/index.html';
const chiliPath = 'dist/hitung-cabai/index.html';
const chiliAppPath = 'dist/hitung-cabai/app.js';
const chiliDetectorPath = 'dist/hitung-cabai/detector.js';
const chiliSyncPath = 'dist/hitung-cabai/stat-sync.js';
const pwaManifestPath = 'dist/manifest.webmanifest';
const serviceWorkerPath = 'dist/sw.js';
const pwaRegisterPath = 'dist/pwa-register.js';
const offlinePath = 'dist/offline.html';
const pwaIconPath = 'dist/icons/agrotik.svg';
if (!fs.existsSync(portfolioPath)) fail('dist/index.html is missing');
if (!fs.existsSync(statPath)) fail('dist/stat/index.html is missing');
if (!fs.existsSync(printPath)) fail('dist/print-skripsi/index.html is missing');
if (!fs.existsSync(mendeleyPath)) fail('dist/mendeley/index.html is missing');
if (!fs.existsSync(chiliPath)) fail('dist/hitung-cabai/index.html is missing');
if (!fs.existsSync(chiliAppPath)) fail('dist/hitung-cabai/app.js is missing');
if (!fs.existsSync(chiliDetectorPath)) fail('dist/hitung-cabai/detector.js is missing');
if (!fs.existsSync(chiliSyncPath)) fail('dist/hitung-cabai/stat-sync.js is missing');
for (const [pathName,label] of [[pwaManifestPath,'manifest'],[serviceWorkerPath,'service worker'],[pwaRegisterPath,'PWA register'],[offlinePath,'offline fallback'],[pwaIconPath,'PWA icon']]) {
  if (!fs.existsSync(pathName)) fail('dist '+label+' is missing');
}

const portfolio = fs.readFileSync(portfolioPath, 'utf8');
if (!portfolio.includes('Mahasiswa Agronomi')) fail('built root does not contain student-oriented portfolio content');
if (!portfolio.includes('/stat/')) fail('built portfolio does not link to /stat/');
if (!portfolio.includes('/print-skripsi/')) fail('built portfolio does not link to /print-skripsi/');
if (!portfolio.includes('/mendeley/')) fail('built portfolio does not link to /mendeley/');
if (!portfolio.includes('/hitung-cabai/')) fail('built portfolio does not link to /hitung-cabai/');
if (portfolio.includes('id="gridWrap"')) fail('built portfolio unexpectedly contains the statistical application shell');

const html = fs.readFileSync(statPath, 'utf8');
if (!html.includes('Statistical Web')) fail('built /stat page does not contain application title');
if (!html.includes('subweb-brand') || !html.includes('subweb-brand-arrow') || !html.includes('href="/"')) fail('built /stat page is missing shared return-to-portfolio header');
if (/src\/[^"']+\.js/.test(html)) fail('built /stat page still references source JavaScript under /src/');
if (/src\/[^"']+\.css/.test(html)) fail('built /stat page still references source CSS under /src/');

const printHtml = fs.readFileSync(printPath, 'utf8');
for (const marker of ['Print Skripsi','pdf-lib@1.17.1','pdf.js/3.11.174','jszip/3.10.1','previewCanvas','downloadAll']) {
  if (!printHtml.includes(marker)) fail(`built /print-skripsi page is missing marker ${marker}`);
}
if (printHtml.includes('/print-skripsi/app.js')) fail('built /print-skripsi page still references source app.js');
const mendeleyHtml = fs.readFileSync(mendeleyPath, 'utf8');
for (const marker of ['Referensi Mendeley','referenceQuery','referenceExportRis','referenceLibrary']) if (!mendeleyHtml.includes(marker)) fail(`built /mendeley page is missing marker ${marker}`);
if (mendeleyHtml.includes('/mendeley/app.js')) fail('built /mendeley page still references source app.js');
const chiliHtml=fs.readFileSync(chiliPath,'utf8'),chiliApp=fs.readFileSync(chiliAppPath,'utf8'),chiliDetector=fs.readFileSync(chiliDetectorPath,'utf8'),chiliSync=fs.readFileSync(chiliSyncPath,'utf8');
for(const marker of ['Hitung Cabai','openCamera','cameraVideo','mobileSave','autoDetect','detectSensitivity','sendToStat','capture="environment"'])if(!chiliHtml.includes(marker))fail(`built /hitung-cabai page is missing marker ${marker}`);
for(const marker of ['getUserMedia','facingMode','optimizePhoto','indexedDB','autoDetectChilies','detector.js','stat-sync.js','sendCurrentToStatistics'])if(!chiliApp.includes(marker))fail(`built /hitung-cabai app is missing marker ${marker}`);
if(!chiliDetector.includes('detectChiliBoxesFromImageData'))fail('built /hitung-cabai detector is missing detection engine');
if(!chiliSync.includes('upsertChiliCountToStatistics')||!chiliSync.includes('statistical_web_csv_files_v1'))fail('built /hitung-cabai sync bridge is missing Statistical Web integration');

for (const [name,page] of [['stat',html],['mendeley',mendeleyHtml],['print',printHtml],['hitung-cabai',chiliHtml]]) if(!page.includes('/subweb-header.css')||!page.includes('subweb-nav')) fail(`built /${name} page is missing shared sub-web header`);
for (const [name,page] of [['root',portfolio],['stat',html],['mendeley',mendeleyHtml],['print',printHtml],['hitung-cabai',chiliHtml]]) {
  if(!page.includes('/manifest.webmanifest')||!page.includes('/pwa-register.js')) fail(`built ${name} page is missing PWA wiring`);
}
const sw=fs.readFileSync(serviceWorkerPath,'utf8'),manifest=JSON.parse(fs.readFileSync(pwaManifestPath,'utf8'));
if(!sw.includes('agrotik-core-')||!sw.includes('agrotik-runtime-')||!sw.includes("request.method!=='GET'")||!sw.includes("request.mode==='navigate'")) fail('built service worker contract is incomplete');
if(manifest.short_name!=='Agrotik'||manifest.display!=='standalone') fail('built PWA manifest is invalid');

const assetMatches = [...html.matchAll(/(?:src|href)="([^"]*assets\/[^"]+)"/g)].map(m => m[1]);
if (!assetMatches.length) fail('built /stat page has no bundled assets');

const assetDir = 'dist/assets';
if (!fs.existsSync(assetDir)) fail('dist/assets is missing');
const files = fs.readdirSync(assetDir);
const jsFiles = files.filter(f => f.endsWith('.js'));
const cssFiles = files.filter(f => f.endsWith('.css'));
if (!jsFiles.length) fail('no JavaScript bundle was produced');
if (!cssFiles.length) fail('no CSS bundle was produced');

const js = jsFiles.map(f => fs.readFileSync(path.join(assetDir, f), 'utf8')).join('\n');
for (const marker of ['pasteBtn','openAnalysis','globalSearch','globalSearchResults','analysisMenu','cutoffPage','processPdf','previewCanvas','downloadAll']) {
  if (!js.includes(marker)) fail(`JavaScript bundle is missing marker ${marker}`);
}
if (/from\s*["']jstat["']/.test(js)) fail('bundle still contains a bare jstat import');

console.log(`Dist check OK: app pages and lightweight PWA shell built; ${jsFiles.length} JS bundle(s), ${cssFiles.length} CSS bundle(s), offline assets and production markers present.`);
