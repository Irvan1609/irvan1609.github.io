import fs from 'node:fs';
import path from 'node:path';

function fail(message){console.error('Security headers check failed:',message);process.exit(1);}
const headers=fs.readFileSync('public/_headers','utf8');
for(const marker of [
  'Content-Security-Policy:','X-Content-Type-Options: nosniff','Referrer-Policy: strict-origin-when-cross-origin',
  'X-Frame-Options: DENY','Strict-Transport-Security:','Permissions-Policy:','frame-ancestors \'none\'',
  "object-src 'none'","https://challenges.cloudflare.com","/hitung-cabai/*","camera=(self)","/kamera-pengukur/*","/pengukur/*"
])if(!headers.includes(marker))fail('missing '+marker);
if(/script-src[^;\n]*'unsafe-inline'/.test(headers))fail('script-src must not allow unsafe-inline');

const roots=['index.html','stat/index.html','mendeley/index.html','print-skripsi/index.html'];
function walk(dir){
  if(!fs.existsSync(dir))return [];
  return fs.readdirSync(dir,{withFileTypes:true}).flatMap(entry=>{
    const full=path.join(dir,entry.name);
    return entry.isDirectory()?walk(full):entry.name.endsWith('.html')?[full]:[];
  });
}
const htmlFiles=[...roots.filter(fs.existsSync),...walk('public')];
for(const file of htmlFiles){
  const html=fs.readFileSync(file,'utf8');
  const inline=[...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
    .filter(match=>!/src\s*=/.test(match[1])&&match[2].trim());
  if(inline.length)fail('inline script blocked by CSP in '+file);
}
console.log('Security headers OK: enforced CSP, anti-framing, HSTS, privacy policy and camera path allowances.');
