import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

function fail(message){console.error('Performance budget failed:',message);process.exit(1);}
const sourceBudgets={
  'src/main.js':120*1024,
  'src/account-dataset-sync.js':48*1024,
  'public/game/app.js':320*1024,
  'public/hitung-cabai/app.js':80*1024,
  'public/pengukur/app.js':80*1024,
  'public/system-core.js':64*1024,
  'public/pwa-register.js':10*1024,
  'public/sw.js':20*1024
};
for(const [file,max] of Object.entries(sourceBudgets)){
  const size=fs.statSync(file).size;
  if(size>max)fail(file+' '+size+' bytes exceeds '+max);
}
const dist='dist/assets';
if(fs.existsSync(dist)){
  const js=fs.readdirSync(dist).filter(name=>name.endsWith('.js'));
  let totalGzip=0;
  for(const name of js){
    const bytes=fs.readFileSync(path.join(dist,name)),gzip=zlib.gzipSync(bytes).byteLength;
    totalGzip+=gzip;
    if(gzip>1536*1024)fail('dist/assets/'+name+' gzip '+gzip+' exceeds 1.5 MB');
  }
  if(totalGzip>3*1024*1024)fail('total initial JS gzip '+totalGzip+' exceeds 3 MB');
}
console.log('Performance budget OK: source modules and built JS remain inside regression limits.');
