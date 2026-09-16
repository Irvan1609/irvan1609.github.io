import fs from 'node:fs';
import path from 'node:path';

function fail(message) {
  console.error(`Dist check failed: ${message}`);
  process.exit(1);
}

const indexPath = 'dist/index.html';
if (!fs.existsSync(indexPath)) fail('dist/index.html is missing');
const html = fs.readFileSync(indexPath, 'utf8');
if (!html.includes('Statistical Web')) fail('built index does not contain application title');
if (/src\/[^"']+\.js/.test(html)) fail('built index still references source JavaScript under /src/');
if (/src\/[^"']+\.css/.test(html)) fail('built index still references source CSS under /src/');

const assetMatches = [...html.matchAll(/(?:src|href)="([^"]*assets\/[^"]+)"/g)].map(m => m[1]);
if (!assetMatches.length) fail('built index has no bundled assets');

const assetDir = 'dist/assets';
if (!fs.existsSync(assetDir)) fail('dist/assets is missing');
const files = fs.readdirSync(assetDir);
const jsFiles = files.filter(f => f.endsWith('.js'));
const cssFiles = files.filter(f => f.endsWith('.css'));
if (!jsFiles.length) fail('no JavaScript bundle was produced');
if (!cssFiles.length) fail('no CSS bundle was produced');

const js = jsFiles.map(f => fs.readFileSync(path.join(assetDir, f), 'utf8')).join('\n');
// Check markers that belong to the current production entry graph. RAL/RAK are
// opened through the scientific workflow; the legacy rak-dnd module is
// intentionally not loaded and therefore must not be required in dist.
for (const marker of ['pasteBtn','openAnalysis','analysisChoice']) {
  if (!js.includes(marker)) fail(`JavaScript bundle is missing marker ${marker}`);
}
if (/from\s*["']jstat["']/.test(js)) fail('bundle still contains a bare jstat import');

console.log(`Dist check OK: ${jsFiles.length} JS bundle(s), ${cssFiles.length} CSS bundle(s), source paths removed, production navigation markers present.`);
