import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { assertSafeArtifacts } from './public-build.mjs';

const temp = await mkdtemp(path.join(tmpdir(), 'agrotik-artifacts-'));
try {
  for (const name of ['assets/app.js.map', '.env.production', 'cloudflare/worker.js', 'payment-worker/index.js', 'backup.sql', 'secret.pem', 'src/main.js']) {
    const file = path.join(temp, name);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, 'private');
    await assert.rejects(assertSafeArtifacts(temp), /must not be deployed/);
    await rm(file);
  }
  await writeFile(path.join(temp, 'inline.js'), '//# sourceMappingURL=data:application/json;base64,e30=');
  await assert.rejects(assertSafeArtifacts(temp), /source map reference/);
  await rm(path.join(temp, 'inline.js'));
  await writeFile(path.join(temp, 'account-config.js'), 'window.API_URL="https://example.com";');
  await assertSafeArtifacts(temp);
} finally { await rm(temp, { recursive: true, force: true }); }

// Exercise the published service worker, including branches affected by minification.
const listeners = {};
const fallback = new Response('offline');
vm.runInNewContext(await readFile('dist/sw.js', 'utf8'), {
  self: { location: { origin: 'https://example.com' }, addEventListener(type, fn) { listeners[type] = fn; } },
  URL, Request, Response, Set,
  caches: { async match(request) { return request === '/offline.html' ? fallback : undefined; } },
  async fetch() { throw new Error('offline'); },
});
for (const [method, url] of [['POST', '/stat/'], ['GET', '/api/private'], ['GET', '/sw.js'], ['GET', 'https://untrusted.example/a.js']]) {
  listeners.fetch({ request: { method, url: new URL(url, 'https://example.com').href }, respondWith() { assert.fail('must bypass cache'); } });
}
let response;
listeners.fetch({ request: { method: 'GET', mode: 'navigate', url: 'https://example.com/stat/' }, respondWith(value) { response = value; } });
assert.equal(await response, fallback);
listeners.fetch({ request: { method: 'GET', mode: 'cors', url: 'https://example.com/missing.js' }, respondWith(value) { response = value; } });
assert.equal((await response).status, 504);

// Public module exports must survive minification; compare a real calculation.
const source = await import('../public/hitung-cabai/detector.js');
const built = await import('../dist/hitung-cabai/detector.js');
assert.deepEqual(Object.keys(built).sort(), Object.keys(source).sort());
const image = { width: 32, height: 32, data: new Uint8ClampedArray(32 * 32 * 4) };
assert.deepEqual(built.detectChiliBoxesFromImageData(image), source.detectChiliBoxesFromImageData(image));
console.log('Public build OK: artifact leak rejection, published offline routing and detector exports/behavior.');
