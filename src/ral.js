import { parseNumber, formatNumber } from './number-format.js';
import { resultActions, installResultExport } from './result-export.js';
import jStat from 'jstat';
(() => {
  const $ = s => document.querySelector(s);
  const esc = v => String(v ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const safeFilename = value => String(value || 'hasil').replace(/[^a-z0-9._-]+/gi,'-');
  function dataset(){const th=[...document.querySelectorAll('#gridWrap .data-grid thead th')].slice(1).map(x=>x.textContent.trim());const rs=[...document.querySelectorAll('#gridWrap .data-grid tbody tr')].map(tr=>[...tr.querySelectorAll('td')].slice(1).map(td=>td.textContent));return {headers:th,rows:rs};}
  function err(msg){const b=$('#ralError');if(b){b.hidden=false;b.textContent='⚠ '+msg;}const s=$('#status');if(s)s.textContent='⚠ '+msg;}
  function clearErr(){const b=$('#ralError');if(b){b.hidden=true;b.textContent='';}}
  const numeric=parseNumber, fmt=formatNumber;
  function pval(f,d1,d2){return f===Infinity?0:jStat.ibeta(d2/(d2+d1*f),d2/2,d1/2);}
  function label(k){let s='';do{s=String.fromCharCode(97+k%26)+s;k=Math.floor(k/26)-1;}while(k>=0);return s;}
  function subset(a,b){for(const v of a)if(!b.has(v))return false;return true;}
  function cleanColumns(cols){const unique=[];for(const c of cols){if(!unique.some(u=>u.size===c.size&&subset(c,u)))unique.push(c);}return unique.filter((c,i)=>!unique.some((d,j)=>i!==j&&c.size<d.size&&subset(c,d)));}
  function compactLetters(means, significant){
    const n=means.length;let cols=[new Set(Array.from({length:n},(_,i)=>i))];
    const pairs=[];for(let i=0;i<n;i++)for(let j=i+1;j<n;j++)if(significant[i][j])pairs.push([i,j,Math.abs(means[i]-means[j])]);
    pairs.sort((a,b)=>b[2]-a[2]);
    for(const [i,j] of pairs){const next=[];for(const col of cols){if(col.has(i)&&col.has(j)){const a=new Set(col),b=new Set(col);a.delete(i);b.delete(j);if(a.size)next.push(a);if(b.size)next.push(b);}else next.push(col);}cols=cleanColumns(next);}
    cols.sort((a,b)=>Math.max(...[...b].map(i=>means[i]))-Math.max(...[...a].map(i=>means[i])));
    return means.map((_,i)=>cols.map((c,k)=>c.has(i)?label(k):'').join(''));
  }
  function ensureBnjOptions(){
    if($('#ralBnjOptions'))return;
    const result=$('#ralResult');if(!result)return;
    const box=document.createElement('div');box.id='ralBnjOptions';box.className='analysis-note';
    box.style.cssText='margin:14px 0;padding:12px;display:grid;grid-template-columns:1fr 1fr;gap:12px;align-items:end';
    box.innerHTML='<div><label for="ralAlpha" style="display:block;font-weight:700;margin-bottom:5px">Taraf nyata BNJ (α)</label><select id="ralAlpha"><option value="0.05">0.05 (5%)</option><option value="0.01">0.01 (1%)</option></select></div><div style="font-size:13px;color:#526171"><b>q tabel otomatis.</b> Nilai q dihitung dari α, jumlah perlakuan (k), dan db galat. Urutan hasil selalu mengikuti urutan perlakuan pada data.</div>';
    box.querySelector('select').addEventListener('change',()=>{result.innerHTML='';});
    result.parentNode.insertBefore(box,result);
  }
  function populate(){const d=dataset(),list=$('#ralResponses'),sel=$('#ralTreatment');if(!list||!sel)return;list.innerHTML='';sel.innerHTML='';if(!d.headers.length){list.innerHTML='<div style="padding:10px;color:#777">Tidak ada variabel. Masukkan data terlebih dahulu.</div>';return;}d.headers.forEach((h,i)=>{const label=document.createElement('label');label.className='ral-check';label.innerHTML=`<input type="checkbox" value="${i}"> <span>${esc(h)}</span>`;list.appendChild(label);const o=document.createElement('option');o.value=i;o.textContent=h;sel.appendChild(o);});}
  function open(){clearErr();populate();ensureBnjOptions();$('#ralResult').innerHTML='';$('#ralModal').classList.add('open');}
  function close(){$('#ralModal').classList.remove('open');}
  function analyze(){
    clearErr();$('#ralResult').innerHTML='';const d=dataset(),selected=[...document.querySelectorAll('#ralResponses input:checked')].map(x=>Number(x.value)),ti=Number($('#ralTreatment').value),alpha=Number($('#ralAlpha')?.value);
    if(!selected.length)return err('Pilih minimal satu peubah respons.');if(!Number.isInteger(ti))return err('Pilih peubah perlakuan.');if(selected.includes(ti))return err('Peubah perlakuan tidak boleh dipilih sebagai respons.');if(![0.05,0.01].includes(alpha))return err('Pilih taraf nyata 0.05 atau 0.01.');if(d.rows.length<2)return err('Dataset belum memiliki cukup observasi.');
    const treatments=[...new Set(d.rows.map(r=>String(r[ti]??'').trim()).filter(Boolean))];if(treatments.length<2)return err('RAL memerlukan sedikitnya dua taraf perlakuan.');let html='';
    for(const yi of selected){
      const obs=[];for(const [rowIndex,r] of d.rows.entries()){const t=String(r[ti]??'').trim(),y=numeric(r[yi]);if(t!==''&&!Number.isFinite(y))return err(`Angka pada baris ${rowIndex+1}, kolom ${d.headers[yi]} tidak valid atau kosong. Periksa Pengaturan angka.`);if(t!==''&&Number.isFinite(y))obs.push({t,y});}
      const groups=treatments.map(t=>obs.filter(o=>o.t===t).map(o=>o.y));if(obs.length<2||groups.some(g=>!g.length)){html+=`<section class="ral-result-block analysis-result" data-export-scope><h4>${esc(d.headers[yi])}</h4><div class="analysis-note">Data numerik tidak lengkap untuk semua taraf perlakuan.</div></section>`;continue;}
      const N=obs.length,a=groups.length,grand=obs.reduce((s,o)=>s+o.y,0)/N,meanValues=groups.map(g=>g.reduce((s,x)=>s+x,0)/g.length);
      const ssT=groups.reduce((s,g)=>s+g.length*(g.reduce((u,v)=>u+v,0)/g.length-grand)**2,0),ssTot=obs.reduce((s,o)=>s+(o.y-grand)**2,0),ssE=groups.reduce((sum,g,i)=>sum+g.reduce((subtotal,y)=>subtotal+(y-meanValues[i])**2,0),0),dfT=a-1,dfE=N-a,msT=ssT/dfT,msE=ssE/dfE,f=msE>0?msT/msE:Infinity,p=pval(f,dfT,dfE);
      if(dfE<2||!Number.isFinite(msE)||msE<=0){html+=`<section class="ral-result-block analysis-result" data-export-scope><h4>${esc(d.headers[yi])}</h4>${resultActions(`RAL-${safeFilename(d.headers[yi])}`)}<div class="analysis-note">BNJ otomatis memerlukan db galat minimal 2 dan KT galat positif.</div></section>`;continue;}
      let q;try{q=jStat.tukey.inv(1-alpha,a,dfE);}catch{q=NaN;}
      if(!Number.isFinite(q)||q<=0){html+=`<section class="ral-result-block analysis-result" data-export-scope><h4>${esc(d.headers[yi])}</h4>${resultActions(`RAL-${safeFilename(d.headers[yi])}`)}<div class="analysis-note">q tabel tidak dapat dihitung untuk parameter ini.</div></section>`;continue;}
      let posthoc=`<div class="analysis-note">q tabel = ${fmt(q)} (k = ${a}, db galat = ${dfE}, α = ${fmt(alpha,2)}). Uji BNJ tidak dijalankan karena pengaruh perlakuan tidak nyata.</div>`;
      let notations=Array(a).fill('');
      if(p<alpha){
        const significant=Array.from({length:a},()=>Array(a).fill(false));
        for(let i=0;i<a;i++)for(let j=i+1;j<a;j++){const se=Math.sqrt(msE/2*(1/groups[i].length+1/groups[j].length));significant[i][j]=significant[j][i]=Math.abs(meanValues[i]-meanValues[j])>q*se;}
        notations=compactLetters(meanValues,significant);
        const equalN=groups.every(g=>g.length===groups[0].length),se=equalN?Math.sqrt(msE/groups[0].length):NaN,hsd=equalN?q*se:NaN;
        posthoc=`<div class="analysis-note"><b>BNJ ${alpha*100}%</b>: q tabel = ${fmt(q)} (k = ${a}, db galat = ${dfE})${equalN?`, SE = ${fmt(se)}, nilai BNJ = ${fmt(hsd)}`:', menggunakan penyesuaian Tukey–Kramer karena ukuran kelompok tidak sama'}.</div>`;
      }
      const means=treatments.map((t,i)=>`<tr><td>${esc(t)}</td><td>${groups[i].length}</td><td class="posthoc-value">${fmt(meanValues[i],2)}${notations[i]?`<sup>${esc(notations[i])}</sup>`:''}</td></tr>`).join('');
      html+=`<section class="ral-result-block analysis-result" data-export-scope><h4>${esc(d.headers[yi])}</h4>${resultActions(`RAL-${safeFilename(d.headers[yi])}`)}<table class="result-table"><thead><tr><th>Sumber</th><th>db</th><th>JK</th><th>KT</th><th>F hitung</th><th>p-value</th></tr></thead><tbody><tr><td>Perlakuan</td><td>${dfT}</td><td>${fmt(ssT)}</td><td>${fmt(msT)}</td><td>${fmt(f)}</td><td>${p<.001?'&lt;'+fmt(0.001):fmt(p)}</td></tr><tr><td>Galat</td><td>${dfE}</td><td>${fmt(ssE)}</td><td>${fmt(msE)}</td><td>—</td><td>—</td></tr><tr><td>Total</td><td>${N-1}</td><td>${fmt(ssTot)}</td><td>—</td><td>—</td><td>—</td></tr></tbody></table>${posthoc}<table class="result-table posthoc-table"><thead><tr><th>Perlakuan</th><th>n</th><th>Rataan + Notasi BNJ</th></tr></thead><tbody>${means}</tbody></table><div class="analysis-note">Urutan hasil mengikuti urutan pertama perlakuan pada dataset dan tidak diurutkan berdasarkan besar rataan. Kesimpulan α = ${fmt(alpha,2)}: perlakuan <b>${p<alpha?'berpengaruh nyata':'tidak berpengaruh nyata'}</b> terhadap ${esc(d.headers[yi])}.</div></section>`;
    }
    $('#ralResult').innerHTML=html;
  }
  function bind(){installResultExport();[...document.querySelectorAll('[data-menu="Analyze"],[data-mobile="Analyze"]')].forEach(btn=>{const clone=btn.cloneNode(true);btn.replaceWith(clone);clone.addEventListener('click',e=>{e.preventDefault();open();});});$('#closeRal')?.addEventListener('click',close);$('#closeRal2')?.addEventListener('click',close);$('#runRal')?.addEventListener('click',analyze);$('#ralModal')?.addEventListener('click',e=>{if(e.target.id==='ralModal')close();});}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(bind,50));else setTimeout(bind,50);
})();
