(() => {
  const $ = s => document.querySelector(s);
  const esc = v => String(v ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  function dataset(){const th=[...document.querySelectorAll('#gridWrap .data-grid thead th')].slice(1).map(x=>x.textContent.trim());const rs=[...document.querySelectorAll('#gridWrap .data-grid tbody tr')].map(tr=>[...tr.querySelectorAll('td')].slice(1).map(td=>td.textContent));return {headers:th,rows:rs};}
  function err(msg){const b=$('#ralError');if(b){b.hidden=false;b.textContent='⚠ '+msg;}const s=$('#status');if(s)s.textContent='⚠ '+msg;}
  function clearErr(){const b=$('#ralError');if(b){b.hidden=true;b.textContent='';}}
  function numeric(x){return Number(String(x??'').trim().replace(',','.'));}
  function gamma(z){const p=[676.5203681218851,-1259.1392167224028,771.32342877765313,-176.61502916214059,12.507343278686905,-0.13857109526572012,9.984369578019571e-6,1.5056327351493116e-7];if(z<.5)return Math.log(Math.PI)-Math.log(Math.sin(Math.PI*z))-gamma(1-z);z--;let x=.9999999999998099;for(let i=0;i<p.length;i++)x+=p[i]/(z+i+1);const t=z+p.length-.5;return .5*Math.log(2*Math.PI)+(z+.5)*Math.log(t)-t+Math.log(x);}
  function betaCF(a,b,x){let d=1-(a+b)*x/(a+1);if(Math.abs(d)<1e-300)d=1e-300;d=1/d;let c=d,h=d;for(let m=1;m<=200;m++){const m2=2*m;let aa=m*(b-m)*x/((a-1+m2)*(a+m2));d=1+aa*d;if(Math.abs(d)<1e-300)d=1e-300;c=1+aa/c;if(Math.abs(c)<1e-300)c=1e-300;d=1/d;h*=d*c;aa=-(a+m)*(a+b+m)*x/((a+m2)*(a+1+m2));d=1+aa*d;if(Math.abs(d)<1e-300)d=1e-300;c=1+aa/c;if(Math.abs(c)<1e-300)c=1e-300;d=1/d;const del=d*c;h*=del;if(Math.abs(del-1)<3e-10)break;}return h;}
  function ibeta(x,a,b){if(x<=0)return 0;if(x>=1)return 1;const bt=Math.exp(gamma(a+b)-gamma(a)-gamma(b)+a*Math.log(x)+b*Math.log(1-x));return x<(a+1)/(a+b+2)?bt*betaCF(a,b,x)/a:1-bt*betaCF(b,a,1-x)/b;}
  function fCdf(x,d1,d2){if(!Number.isFinite(x)||x<0)return 0;return ibeta(d1*x/(d1*x+d2),d1/2,d2/2);}
  function fmt(x){return Number.isFinite(x)?x.toLocaleString('id-ID',{minimumFractionDigits:3,maximumFractionDigits:3}):'—';}
  function pval(f,d1,d2){return Math.max(0,Math.min(1,1-fCdf(f,d1,d2)));}

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
    box.innerHTML='<div><label for="ralQ" style="display:block;font-weight:700;margin-bottom:5px">q tabel BNJ</label><input id="ralQ" type="number" min="0" step="0.0001" value="5.3" style="width:100%;padding:9px;border:1px solid #cbd5df;border-radius:5px"></div><div style="font-size:12px;color:#526171">Masukkan q sesuai jumlah perlakuan, db galat, dan taraf nyata. Notasi dihitung otomatis jika ANOVA nyata.</div>';
    result.parentNode.insertBefore(box,result);
  }
  function populate(){const d=dataset(),list=$('#ralResponses'),sel=$('#ralTreatment');if(!list||!sel)return;list.innerHTML='';sel.innerHTML='';if(!d.headers.length){list.innerHTML='<div style="padding:10px;color:#777">Tidak ada variabel. Masukkan data terlebih dahulu.</div>';return;}d.headers.forEach((h,i)=>{const label=document.createElement('label');label.className='ral-check';label.innerHTML=`<input type="checkbox" value="${i}"> <span>${esc(h)}</span>`;list.appendChild(label);const o=document.createElement('option');o.value=i;o.textContent=h;sel.appendChild(o);});}
  function open(){clearErr();populate();ensureBnjOptions();$('#ralResult').innerHTML='';$('#ralModal').classList.add('open');}
  function close(){$('#ralModal').classList.remove('open');}
  function analyze(){
    clearErr();const d=dataset(),selected=[...document.querySelectorAll('#ralResponses input:checked')].map(x=>Number(x.value)),ti=Number($('#ralTreatment').value),q=numeric($('#ralQ')?.value);
    if(!selected.length)return err('Pilih minimal satu peubah respons.');if(!Number.isInteger(ti))return err('Pilih peubah perlakuan.');if(selected.includes(ti))return err('Peubah perlakuan tidak boleh dipilih sebagai respons.');if(!Number.isFinite(q)||q<=0)return err('Masukkan nilai q tabel BNJ yang valid.');if(d.rows.length<2)return err('Dataset belum memiliki cukup observasi.');
    const treatments=[...new Set(d.rows.map(r=>String(r[ti]??'').trim()).filter(Boolean))];if(treatments.length<2)return err('RAL memerlukan sedikitnya dua taraf perlakuan.');let html='';
    for(const yi of selected){
      const obs=[];for(const r of d.rows){const t=String(r[ti]??'').trim(),y=numeric(r[yi]);if(t!==''&&Number.isFinite(y))obs.push({t,y});}
      const groups=treatments.map(t=>obs.filter(o=>o.t===t).map(o=>o.y));if(obs.length<2||groups.some(g=>!g.length)){html+=`<div class="ral-result-block"><h4>${esc(d.headers[yi])}</h4><div class="analysis-note">Data numerik tidak lengkap untuk semua taraf perlakuan.</div></div>`;continue;}
      const N=obs.length,a=groups.length,grand=obs.reduce((s,o)=>s+o.y,0)/N,meanValues=groups.map(g=>g.reduce((s,x)=>s+x,0)/g.length);
      const ssT=groups.reduce((s,g)=>s+g.length*(g.reduce((u,v)=>u+v,0)/g.length-grand)**2,0),ssTot=obs.reduce((s,o)=>s+(o.y-grand)**2,0),ssE=ssTot-ssT,dfT=a-1,dfE=N-a,msT=ssT/dfT,msE=ssE/dfE,f=msE>0?msT/msE:Infinity,p=pval(f,dfT,dfE);
      let posthoc='<div class="analysis-note">Uji BNJ tidak dijalankan karena pengaruh perlakuan tidak nyata pada α = 0,05.</div>';
      let notations=Array(a).fill('—');
      if(p<.05){
        const significant=Array.from({length:a},()=>Array(a).fill(false));
        for(let i=0;i<a;i++)for(let j=i+1;j<a;j++){const se=Math.sqrt(msE/2*(1/groups[i].length+1/groups[j].length));significant[i][j]=significant[j][i]=Math.abs(meanValues[i]-meanValues[j])>q*se;}
        notations=compactLetters(meanValues,significant);
        const equalN=groups.every(g=>g.length===groups[0].length),sd=equalN?Math.sqrt(msE/groups[0].length):NaN,np=equalN?q*sd:NaN;
        posthoc=`<div class="analysis-note"><b>BNJ 5%</b>: q = ${fmt(q)}${equalN?`, SD = ${fmt(sd)}, NP = ${fmt(np)}`:', menggunakan penyesuaian Tukey–Kramer karena ukuran kelompok tidak sama'}.</div>`;
      }
      const order=meanValues.map((m,i)=>({i,m})).sort((x,y)=>y.m-x.m);
      const means=order.map(({i})=>`<tr><td>${esc(treatments[i])}</td><td>${groups[i].length}</td><td>${fmt(meanValues[i])}</td><td><b>${notations[i]}</b></td></tr>`).join('');
      html+=`<div class="ral-result-block"><h4>${esc(d.headers[yi])}</h4><table class="result-table"><thead><tr><th>Sumber</th><th>db</th><th>JK</th><th>KT</th><th>F hitung</th><th>p-value</th></tr></thead><tbody><tr><td>Perlakuan</td><td>${dfT}</td><td>${fmt(ssT)}</td><td>${fmt(msT)}</td><td>${fmt(f)}</td><td>${p<.001?'<0,001':fmt(p)}</td></tr><tr><td>Galat</td><td>${dfE}</td><td>${fmt(ssE)}</td><td>${fmt(msE)}</td><td>—</td><td>—</td></tr><tr><td>Total</td><td>${N-1}</td><td>${fmt(ssTot)}</td><td>—</td><td>—</td><td>—</td></tr></tbody></table>${posthoc}<table class="result-table"><thead><tr><th>Perlakuan</th><th>n</th><th>Rataan</th><th>Notasi BNJ</th></tr></thead><tbody>${means}</tbody></table><div class="analysis-note">Rataan yang memiliki sekurang-kurangnya satu huruf sama tidak berbeda nyata. Kesimpulan α = 0,05: perlakuan <b>${p<.05?'berpengaruh nyata':'tidak berpengaruh nyata'}</b> terhadap ${esc(d.headers[yi])}.</div></div>`;
    }
    $('#ralResult').innerHTML=html;
  }
  function bind(){[...document.querySelectorAll('[data-menu="Analyze"],[data-mobile="Analyze"]')].forEach(btn=>{const clone=btn.cloneNode(true);btn.replaceWith(clone);clone.addEventListener('click',e=>{e.preventDefault();open();});});$('#closeRal')?.addEventListener('click',close);$('#closeRal2')?.addEventListener('click',close);$('#runRal')?.addEventListener('click',analyze);$('#ralModal')?.addEventListener('click',e=>{if(e.target.id==='ralModal')close();});}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(bind,50));else setTimeout(bind,50);
})();
