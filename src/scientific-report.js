import {formatNumber as fmt} from './number-format.js';
import {resultActions} from './result-export.js';
import jStat from 'jstat';
export const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const designNames={ral:'RAL',rak:'RAK',fral:'Faktorial RAL',frak:'Faktorial RAK',split:'RPT / petak terbagi dalam RAK'};
const pv=p=>p===null||!Number.isFinite(p)?'—':p<.001?'&lt;'+fmt(.001):fmt(p);
function cell(x){return typeof x==='number'?`<td data-number="${x}">${fmt(x)}</td>`:`<td>${x??'—'}</td>`;}
function table(headers,rows,cls=''){return `<div class="table-scroll"><table class="result-table ${cls}"><thead><tr>${headers.map(h=>`<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(row=>`<tr>${row.map(cell).join('')}</tr>`).join('')}</tbody></table></div>`;}
const labelLines=(label,x,y)=>String(label).match(/.{1,35}(?:\s|$)|.{1,35}/g)?.map((text,i)=>`<tspan x="${x}" dy="${i?14:0}">${esc(text)}</tspan>`).join('')||'';

export function barChart(items,title){
  const width=860,left=280,right=100,step=52,height=70+step*items.length,range=[Math.min(0,...items.map(x=>x.mean-x.se)),Math.max(0,...items.map(x=>x.mean+x.se))];
  const span=range[1]-range[0]||1,scale=x=>left+(x-range[0])/span*(width-left-right),zero=scale(0);
  const bars=items.map((item,i)=>{const y=38+i*step,tip=scale(item.mean),lo=scale(item.mean-item.se),hi=scale(item.mean+item.se),letters=(item.letters||[]).join('');return `<text x="8" y="${y+14}" font-size="12">${labelLines(item.label,8,y+14)}</text><rect x="${Math.min(zero,tip)}" y="${y}" width="${Math.max(1,Math.abs(tip-zero))}" height="24" fill="#3165ad"/><path d="M${lo},${y+12}H${hi} M${lo},${y+5}V${y+19} M${hi},${y+5}V${y+19}" stroke="#111" fill="none"/><text x="${hi+8}" y="${y+16}" font-size="12">${esc(fmt(item.mean,2))}<tspan baseline-shift="super" font-size="10">${esc(letters)}</tspan></text>`;}).join('');
  return `<div class="scientific-chart"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(title)}"><rect width="100%" height="100%" fill="white"/><g font-family="Arial,sans-serif" fill="#18283a"><text x="8" y="19" font-size="15" font-weight="bold">${esc(title)}</text><path d="M${zero},28V${height-25}" stroke="#aaa"/>${bars}<text x="${left}" y="${height-6}" font-size="12">${esc(fmt(range[0],2))}</text><text x="${width-right}" y="${height-6}" font-size="12">${esc(fmt(range[1],2))}</text></g></svg><button data-chart-download>Unduh grafik SVG</button></div>`;
}
export function interactionChart(report){
  const {factorA:A,factorB:B,cells}=report,width=860,height=350,colors=['#215cc5','#bd3b37','#2f824a','#965cb4','#a56c14','#14858d'];
  const min=Math.min(...cells.map(x=>x.mean)),max=Math.max(...cells.map(x=>x.mean)),span=max-min||1,x=i=>70+i*530/Math.max(1,B.length-1),y=v=>280-(v-min)/span*220;
  return `<div class="scientific-chart"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${Math.max(height,A.length*22+60)}" role="img" aria-label="Interaksi A dan B"><rect width="100%" height="100%" fill="white"/><g font-family="Arial,sans-serif" font-size="12"><text x="25" y="22" font-size="15" font-weight="bold">Interaksi A × B — ${esc(report.name)}</text><path d="M65,45V285H610" stroke="#555" fill="none"/>${[0,.5,1].map(t=>`<text x="5" y="${y(min+t*span)+4}">${esc(fmt(min+t*span,2))}</text>`).join('')}${B.map((b,i)=>`<text x="${x(i)}" y="308" text-anchor="middle">${esc(b)}</text>`).join('')}${A.map((a,i)=>{const values=B.map(b=>cells.find(c=>c.a===a&&c.b===b).mean);return `<polyline points="${values.map((v,j)=>`${x(j)},${y(v)}`).join(' ')}" fill="none" stroke="${colors[i%colors.length]}" stroke-width="2"/>${values.map((v,j)=>`<circle cx="${x(j)}" cy="${y(v)}" r="4" fill="${colors[i%colors.length]}"/>`).join('')}<text x="640" y="${55+i*22}" fill="${colors[i%colors.length]}">${esc(a)}</text>`;}).join('')}<text x="260" y="340">Faktor B</text></g></svg><button data-chart-download>Unduh grafik SVG</button></div>`;
}
function diagnosticPlot(values,fitted,qq){
  if(values.length<3)return '';
  const sorted=[...values].sort((a,b)=>a-b),xs=qq?sorted.map((_,i)=>jStat.normal.inv((i+.5)/sorted.length,0,1)):fitted,ys=qq?sorted:values;
  const xmin=Math.min(...xs),xmax=Math.max(...xs),ymin=Math.min(...ys),ymax=Math.max(...ys),x=v=>60+(v-xmin)/(xmax-xmin||1)*530,y=v=>250-(v-ymin)/(ymax-ymin||1)*200;
  const title=qq?'Q–Q residual':'Residual terhadap nilai prediksi';
  return `<div class="scientific-chart"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 650 300" role="img" aria-label="${title}"><rect width="100%" height="100%" fill="white"/><g font-family="Arial" font-size="12"><text x="30" y="22" font-weight="bold">${title}</text><path d="M55,45V255H600" fill="none" stroke="#666"/>${qq?`<path d="M60,250L590,50" stroke="#999"/>`:`<path d="M60,${y(0)}H590" stroke="#999"/>`}${xs.map((v,i)=>`<circle cx="${x(v)}" cy="${y(ys[i])}" r="2.5" fill="#215cc5"/>`).join('')}<text x="60" y="273">${esc(fmt(xmin,2))}</text><text x="555" y="273">${esc(fmt(xmax,2))}</text><text x="3" y="55">${esc(fmt(ymax,2))}</text><text x="3" y="250">${esc(fmt(ymin,2))}</text><text x="230" y="293">${qq?'Kuantil normal teoretis':'Nilai prediksi'}</text></g></svg><button data-chart-download>Unduh grafik SVG</button></div>`;
}
export function renderReport(report){
  const {name,design,alpha}=report;let num=0;
  const caption=text=>`<div class="table-caption">Tabel ${++num}. ${esc(text)}</div>`;
  let html=`<section class="analysis-result" data-export-scope data-parameter="${esc(name)}"><h3>${esc(designNames[design])} — ${esc(name)}</h3>${resultActions(`${design}-${name}`)}<div class="analysis-lead">Parameter: ${esc(name)}; N = ${report.N}; α = ${fmt(alpha,2)}. Rataan = ${fmt(report.grand,2)}; KK = ${fmt(report.cv,2)}%${report.cvWhole!==null?`; KK petak utama = ${fmt(report.cvWhole,2)}%`:''}.</div>`;
  const multi=['fral','frak','split'].includes(design);
  const hasRep=report.replicates.some(r=>r!=='');
  const rawGroups=report.cells.map(c=>report.observations.filter(o=>o.a===c.a&&o.b===c.b));
  const repNames=hasRep?report.replicates:Array.from({length:Math.max(...rawGroups.map(g=>g.length))},(_,i)=>String(i+1));
  const displayGroups=rawGroups.map(g=>repNames.map((rep,i)=>hasRep?g.find(o=>o.rep===rep)?.y:g[i]?.y));
  const observationRows=report.cells.map((c,i)=>[esc(c.label),...displayGroups[i].map(x=>x===undefined?'':x),rawGroups[i].reduce((s,o)=>s+o.y,0),c.mean]);
  observationRows.push(['Total',...repNames.map((_,i)=>displayGroups.reduce((s,g)=>s+(g[i]??0),0)),report.observations.reduce((s,o)=>s+o.y,0),report.grand]);
  html+=caption('Data pengamatan')+table(['Perlakuan',...repNames.map(r=>'Ulangan '+r),'Total','Rata-rata'],observationRows,'observation-table');
  html+=caption('Sidik ragam')+table(['SK','db','JK','KT','F. Hitung','F. Tabel 0.05','F. Tabel 0.01','Galat pembanding'],report.terms.map(t=>[esc(t.label),t.df,t.ss,t.ms,t.f,t.f05,t.f01,esc(t.error||'—')]));
  const tested=report.terms.filter(t=>t.f!==null);
  html+=`<div class="analysis-note">${tested.map(t=>`${esc(t.label)} ${t.p<alpha?'berpengaruh nyata':'tidak menunjukkan pengaruh nyata'} terhadap ${esc(name)} (F = ${fmt(t.f)}, db = ${t.df} dan ${report.terms.find(e=>e.label===t.error)?.df??'—'}, α = ${fmt(alpha,2)}).`).join(' ')}</div>`;
  for(const comparison of report.comparisons){
    const method=comparison.method==='none'?'Tanpa uji lanjut':comparison.method.toUpperCase();
    html+=caption(`${comparison.title} — ${method}`)+table(['Perlakuan',name,'n','SD','SE'],comparison.items.map(item=>[esc(item.label),`${fmt(item.mean,2)}${item.letters?.length?`<sup>${esc(item.letters.join(comparison.items.length>26?' · ':''))}</sup>`:''}`,item.n,item.sd,item.se]),'posthoc-table');
    if(comparison.method!=='none'){
      html+=`<div class="analysis-note">${method} ${alpha*100}%; KT galat = ${fmt(comparison.mse)}; db galat = ${comparison.df}. Rataan dengan huruf bersama tidak terdeteksi berbeda nyata. Huruf hanya berlaku di dalam tabel ini.</div>`;
      html+=table(['Rentang','Nilai kritis '+(comparison.method==='bnt'?'t':'q')],comparison.critical.map(x=>[x.range,x.value]));
    }else html+='<div class="analysis-note">Huruf tidak diberikan karena uji lanjut tidak dipilih atau uji F yang relevan tidak nyata.</div>';
    const high=comparison.items.reduce((a,b)=>a.mean>=b.mean?a:b),low=comparison.items.reduce((a,b)=>a.mean<=b.mean?a:b);
    const same=high.letters?.some(x=>low.letters?.includes(x));
    html+=`<div class="analysis-note">Pada ${esc(comparison.title)}, rataan tertinggi terdapat pada ${esc(high.label)} (${fmt(high.mean,2)} ± ${fmt(high.se,2)} SE), sedangkan terendah pada ${esc(low.label)} (${fmt(low.mean,2)} ± ${fmt(low.se,2)} SE). ${comparison.method==='none'?'Perbandingan ini bersifat deskriptif.':`Kedua rataan ${same?'tidak terdeteksi berbeda nyata':'berbeda nyata'} menurut ${method} pada α = ${fmt(alpha,2)}.`}</div>`;
    html+=barChart(comparison.items,`${name} — ${comparison.title}`)+`<div class="figure-caption">Rataan ± SE model. Urutan mengikuti data. ${comparison.method==='none'?'Grafik bersifat deskriptif.':''}</div>`;
  }
  if(multi)html+=interactionChart(report)+caption('Rataan kombinasi untuk grafik interaksi')+table(['Faktor A','Faktor B','Rataan','SE'],report.cells.map(c=>[esc(c.a),esc(c.b),c.mean,c.se]));
  if(report.contrasts.length)html+=caption('Kontras terencana / polinomial ortogonal')+table(['Kontras','Estimasi','SE','JK','F','p'],report.contrasts.map(c=>[esc(c.name),c.estimate,c.se,c.ss,c.f,pv(c.p)]))+table(['Kontras','Koefisien sesuai urutan perlakuan'],report.contrasts.map(c=>[esc(c.name),c.coefficients.map(x=>fmt(x,5)).join('; ')]));
  if(report.assumptions.length){
    html+=caption('Pemeriksaan asumsi')+table(['Pemeriksaan','Statistik','p','Keterangan'],report.assumptions.map(a=>[esc(a.name),a.stat,pv(a.p),esc(a.p===null?a.note:a.p<alpha?'Ada bukti penyimpangan pada taraf yang dipilih.':'Belum ada bukti penyimpangan pada taraf yang dipilih.')]));
    html+=diagnosticPlot(report.residuals,report.fitted,true)+diagnosticPlot(report.residuals,report.fitted,false);
    if(report.wholeResiduals.length)html+=diagnosticPlot(report.wholeResiduals,[],true);
  }
  html+=report.notes.map(note=>`<div class="analysis-note">${esc(note)}</div>`).join('');
  return html+'</section>';
}
export function installChartDownload(){document.addEventListener('click',event=>{const button=event.target.closest('[data-chart-download]');if(!button)return;const svg=button.parentElement.querySelector('svg');const blob=new Blob([svg.outerHTML],{type:'image/svg+xml;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='grafik-analisis.svg';a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);});}
