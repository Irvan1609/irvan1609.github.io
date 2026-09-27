import fs from 'node:fs';
import path from 'node:path';

const root='dist';
if(!fs.existsSync(root)){console.error('Performance budget: dist belum dibangun.');process.exit(1);}
const files=[];
function walk(dir){
  for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
    const full=path.join(dir,entry.name);
    if(entry.isDirectory())walk(full);
    else files.push({path:full.replace(/\\/g,'/'),bytes:fs.statSync(full).size});
  }
}
walk(root);
const js=files.filter(f=>f.path.endsWith('.js')),html=files.filter(f=>f.path.endsWith('.html'));
const total=files.reduce((s,f)=>s+f.bytes,0),jsTotal=js.reduce((s,f)=>s+f.bytes,0);
const limits={dist:35*1024*1024,jsTotal:12*1024*1024,jsFile:2500*1024,htmlFile:600*1024,resilience:48*1024,account:64*1024};
const failures=[];
if(total>limits.dist)failures.push(`dist total ${total} > ${limits.dist}`);
if(jsTotal>limits.jsTotal)failures.push(`JS total ${jsTotal} > ${limits.jsTotal}`);
for(const f of js)if(f.bytes>limits.jsFile)failures.push(`${f.path} ${f.bytes} > JS/file budget`);
for(const f of html)if(f.bytes>limits.htmlFile)failures.push(`${f.path} ${f.bytes} > HTML/file budget`);
for(const [suffix,limit] of [['/resilience.js',limits.resilience],['/account.js',limits.account]]){
  const f=files.find(x=>x.path.endsWith(suffix));if(f&&f.bytes>limit)failures.push(`${f.path} ${f.bytes} > lightweight core budget ${limit}`);
}
const largest=[...files].sort((a,b)=>b.bytes-a.bytes).slice(0,8);
console.log('Performance budget:',{total,jsTotal,files:files.length});
console.log('Largest:',largest);
if(failures.length){console.error(failures.join('\n'));process.exit(1);}
console.log('Performance budget OK.');
