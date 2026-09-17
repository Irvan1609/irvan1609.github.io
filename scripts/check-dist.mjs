import fs from 'node:fs';
import path from 'node:path';

function fail(message) {
  console.error(`Dist check failed: ${message}`);
  process.exit(1);
}

const portfolioPath = 'dist/index.html';
const statPath = 'dist/stat/index.html';
const printPath = 'dist/print-skripsi/index.html';
if (!fs.existsSync(portfolioPath)) fail('dist/index.html is missing');
if (!fs.existsSync(statPath)) fail('dist/stat/index.html is missing');
if (!fs.existsSync(printPath)) fail('dist/print-skripsi/index.html is missing');

const portfolio = fs.readFileSync(portfolioPath, 'utf8');
if (!portfolio.includes('Peneliti Agronomi')) fail('built root does not contain portfolio content');
if (!portfolio.includes('/stat/')) fail('built portfolio does not link to /stat/');
if (portfolio.includes('id="gridWrap"')) fail('built portfolio unexpectedly contains the statistical application shell');

const html = fs.readFileSync(statPath, 'utf8');
if (!html.includes('Statistical Web')) fail('built /stat page does not contain application title');
if (!html.includes('← Portofolio')) fail('built /stat page is missing return-to-portfolio control');
if (/src\/[^"']+\.js/.test(html)) fail('built /stat page still references source JavaScript under /src/');
if (/src\/[^"']+\.css/.test(html)) fail('built /stat page still references source CSS under /src/');

const printHtml = fs.readFileSync(printPath, 'utf8');
if (!printHtml.includes('Print Skripsi')) fail('built /print-skripsi page does not contain page title');
if (!printHtml.includes('pdf-lib@1.17.1')) fail('built /print-skripsi page is missing pinned pdf-lib dependency');
if (printHtml.includes('/print-skripsi/app.js')) fail('built /print-skripsi page still references source app.js');

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
for (const marker of ['pasteBtn','openAnalysis','analysisChoice','cutoffPage','processPdf']) {
  if (!js.includes(marker)) fail(`JavaScript bundle is missing marker ${marker}`);
}
if (/from\s*["']jstat["']/.test(js)) fail('bundle still contains a bare jstat import');

console.log(`Dist check OK: portfolio root, /stat application, and /print-skripsi PDF utility built; ${jsFiles.length} JS bundle(s), ${cssFiles.length} CSS bundle(s), source paths removed, production markers present.`);
