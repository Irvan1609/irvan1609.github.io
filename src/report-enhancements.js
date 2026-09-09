import jStat from 'jstat';
import { parseNumber, formatNumber } from './number-format.js';

const $=(s,r=document)=>r.querySelector(s);
const $$=(s,r=document)=>[...r.querySelectorAll(s)];
const esc=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const num=v=>{const x=parseNumber(String(v??'').replace(/^</,'').trim());return Number.isFinite(x)?x:NaN;};
const fmt=(v,d=2)=>formatNumber(v,d);

function dataGrid(){
  return {
    headers: $$('#gridWrap .data-grid thead th').slice(1).map(x=>x.textContent.trim()),
    rows: $$('#gridWrap .data-grid tbody tr').map(tr=>$$('td',tr).slice(1).map(td=>td.textContent.trim()))
  };
}

function fCritical(alpha,df1,df2){
  try{return jStat.centralF.inv(1-alpha,df1,df2);}catch{return NaN;}
}
function qCritical(alpha,k,dfE){
  try{return jStat.tukey.inv(1-alpha,k,dfE);}catch{return NaN;}
}
function sigLabel(f,f05,f01){
  if(!Number.isFinite(f))return '—';
  if(Number.isFinite(f01)&&f>f01)return 'sangat nyata';
  if(Number.isFinite(f05)&&f>f05)return 'nyata';
  return 'tidak nyata';
}
function compareSentence(s){
  if(!s)return '';
  if(s.label==='sangat nyata')return `F. Hitung (${fmt(s.f,2)}) lebih besar daripada F. Tabel 0.05 (${fmt(s.f05,2)}) dan F. Tabel 0.01 (${fmt(s.f01,2)})`;
  if(s.label==='nyata')return `F. Hitung (${fmt(s.f,2)}) lebih besar daripada F. Tabel 0.05 (${fmt(s.f05,2)}), tetapi lebih kecil atau sama dengan F. Tabel 0.01 (${fmt(s.f01,2)})`;
  return `F. Hitung (${fmt(s.f,2)}) lebih kecil atau sama dengan F. Tabel 0.05 (${fmt(s.f05,2)})`;
}

function ensureStyles(){
  if($('#safeReportStyles'))return;
  const style=document.createElement('style');
  style.id='safeReportStyles';
  style.textContent=`
    .report-caption,.report-lead,.report-interpretation,.report-statline,.figure-caption{font-family:Calibri,"Segoe UI",Arial,sans-serif;color:#111;background:#fff;border:0!important;border-radius:0!important}
    .report-caption{margin:12px 0 4px!important;padding:0!important;font-weight:700;font-size:12.5px}
    .report-lead,.report-interpretation{margin:9px 0!important;padding:0!important;line-height:1.5;text-align:justify}
    .report-statline{margin:6px 0 10px!important;padding:0!important;font-weight:700}
    .observation-table th,.observation-table td{text-align:center!important}
    .observation-table th:first-child,.observation-table td:first-child{text-align:left!important}
    .observation-table tfoot td{font-weight:700}
    .anova-report-table th:nth-child(n+2),.anova-report-table td:nth-child(n+2){text-align:center!important}
    .report-bnj-table{width:auto!important;min-width:360px!important;max-width:560px!important;margin:8px 0 12px!important}
    .report-bnj-table th,.report-bnj-table td{text-align:center!important}
    .mean-chart{margin:12px 0 6px;border:1px solid #8f8f8f;padding:10px 12px;background:#fff;min-width:560px}
    .mean-chart-row{display:grid;grid-template-columns:minmax(180px,300px) minmax(240px,1fr) 74px;gap:8px;align-items:center;min-height:27px;font:12px Calibri,"Segoe UI",Arial,sans-serif}
    .mean-chart-track{height:16px;border-left:1px solid #777;border-bottom:1px solid #ddd}
    .mean-chart-bar{height:100%;background:#5b9bd5;min-width:1px}
    .mean-chart-value{text-align:right;font-variant-numeric:tabular-nums}
    .figure-caption{margin:4px 0 14px!important;padding:0!important;font-weight:700}
    @media(max-width:720px){.mean-chart{min-width:620px}.mean-chart-row{grid-template-columns:220px 1fr 64px}}
  `;
  document.head.appendChild(style);
}

function extractMeans(section){
  const table=$('.posthoc-table',section);
  if(!table)return [];
  return $$('tbody tr',table).map(tr=>{
    const cells=$$('td',tr);
    const valueCell=cells[cells.length-1];
    const plain=[...valueCell.childNodes].find(n=>n.nodeType===Node.TEXT_NODE&&n.textContent.trim());
    return {
      treatment:cells[0]?.textContent.trim()||'',
      n:cells.length>=3?num(cells[1]?.textContent):NaN,
      mean:num(plain?.textContent||valueCell?.textContent),
      letters:$('sup',valueCell)?.textContent.trim()||''
    };
  }).filter(x=>x.treatment&&Number.isFinite(x.mean));
}

function selectedColumns(design,responseName){
  const d=dataGrid();
  if(design==='RAK'){
    return {d,yi:Number($('#rakResponse')?.value),ti:Number($('#rakTreatment')?.value),bi:Number($('#rakBlock')?.value)};
  }
  return {d,yi:d.headers.findIndex(h=>h===responseName),ti:Number($('#ralTreatment')?.value),bi:null};
}

function observationTable(design,responseName){
  const {d,yi,ti,bi}=selectedColumns(design,responseName);
  if(!Number.isInteger(yi)||!Number.isInteger(ti)||yi<0||ti<0)return null;
  const treatments=[...new Set(d.rows.map(r=>String(r[ti]??'').trim()).filter(Boolean))];
  if(!treatments.length)return null;
  let reps=[],values=[];
  if(design==='RAK'&&Number.isInteger(bi)&&bi>=0){
    reps=[...new Set(d.rows.map(r=>String(r[bi]??'').trim()).filter(Boolean))];
    values=treatments.map(t=>reps.map(b=>{
      const row=d.rows.find(r=>String(r[ti]??'').trim()===t&&String(r[bi]??'').trim()===b);
      return row?num(row[yi]):NaN;
    }));
  }else{
    const groups=treatments.map(t=>d.rows.filter(r=>String(r[ti]??'').trim()===t).map(r=>num(r[yi])).filter(Number.isFinite));
    const m=Math.max(...groups.map(g=>g.length),0);
    if(!m)return null;
    reps=Array.from({length:m},(_,i)=>String(i+1));
    values=groups.map(g=>Array.from({length:m},(_,i)=>g[i]??NaN));
  }
  const colTotals=reps.map((_,j)=>values.reduce((s,row)=>s+(Number.isFinite(row[j])?row[j]:0),0));
  const rowTotals=values.map(row=>row.reduce((s,v)=>s+(Number.isFinite(v)?v:0),0));
  const rowCounts=values.map(row=>row.filter(Number.isFinite).length);
  const grandTotal=rowTotals.reduce((s,v)=>s+v,0);
  const grandN=rowCounts.reduce((s,v)=>s+v,0);
  const grandMean=grandN?grandTotal/grandN:NaN;
  const body=treatments.map((t,i)=>`<tr><td>${esc(t)}</td>${values[i].map(v=>`<td>${Number.isFinite(v)?fmt(v,2):'—'}</td>`).join('')}<td>${fmt(rowTotals[i],2)}</td><td>${rowCounts[i]?fmt(rowTotals[i]/rowCounts[i],2):'—'}</td></tr>`).join('');
  return `<table class="result-table observation-table"><thead><tr><th rowspan="2">Perlakuan</th><th colspan="${reps.length}">Ulangan</th><th rowspan="2">Total</th><th rowspan="2">Rata-Rata</th></tr><tr>${reps.map(r=>`<th>${esc(r)}</th>`).join('')}</tr></thead><tbody>${body}</tbody><tfoot><tr><td>Total</td>${colTotals.map(v=>`<td>${fmt(v,2)}</td>`).join('')}<td>${fmt(grandTotal,2)}</td><td>${Number.isFinite(grandMean)?fmt(grandMean,2):'—'}</td></tr></tfoot></table>`;
}

function simplifyMeanTable(table,responseName){
  if(!table)return;
  const headers=$$('thead th',table);
  if(headers.length>=3){
    headers[1].remove();
    const remain=$$('thead th',table);
    if(remain[1])remain[1].textContent=responseName;
    $$('tbody tr',table).forEach(tr=>{const cells=$$('td',tr);if(cells.length>=3)cells[1].remove();});
  }else if(headers[1])headers[1].textContent=responseName;
}

function bnjSummary(alpha,k,dfE,mse,meanRows){
  const q=qCritical(alpha,k,dfE);
  if(!Number.isFinite(q)||q<=0)return null;
  const ns=meanRows.map(r=>r.n).filter(Number.isFinite);
  const equalN=ns.length===meanRows.length&&ns.length>0&&ns.every(n=>n===ns[0]);
  let se='—',bnj='Tukey–Kramer';
  if(equalN&&ns[0]>0&&Number.isFinite(mse)&&mse>=0){
    const s=Math.sqrt(mse/ns[0]);
    se=fmt(s,6);bnj=fmt(q*s,6);
  }
  const wrap=document.createElement('div');
  wrap.className='report-bnj-wrap';
  wrap.innerHTML=`<div class="report-caption">UJI LANJUT — BNJ ${alpha*100}%</div><table class="result-table report-bnj-table"><thead><tr><th>q tabel</th><th>SE</th><th>Nilai BNJ</th></tr></thead><tbody><tr><td>${fmt(q,3)}</td><td>${se}</td><td>${bnj}</td></tr></tbody></table>`;
  return wrap;
}

function meanNarrative(rows,responseName,alpha,significant){
  if(!rows.length)return '';
  const ordered=[...rows].sort((a,b)=>b.mean-a.mean),hi=ordered[0],lo=ordered[ordered.length-1];
  if(!significant)return `Secara deskriptif, perlakuan <b>${esc(hi.treatment)}</b> menghasilkan rata-rata ${esc(responseName)} tertinggi sebesar <b>${fmt(hi.mean,2)}</b>, sedangkan <b>${esc(lo.treatment)}</b> menghasilkan rata-rata terendah sebesar <b>${fmt(lo.mean,2)}</b>. Perbedaan rataan tersebut tidak boleh ditafsirkan sebagai perbedaan nyata antarperlakuan.`;
  let relation='';
  if(hi.letters&&lo.letters){const same=[...hi.letters].some(x=>lo.letters.includes(x));relation=same?'tidak berbeda nyata':'berbeda nyata';}
  return `Uji lanjut BNJ ${alpha*100}% menunjukkan bahwa perlakuan <b>${esc(hi.treatment)}</b> menghasilkan rata-rata ${esc(responseName)} tertinggi sebesar <b>${fmt(hi.mean,2)}${hi.letters?`<sup>${esc(hi.letters)}</sup>`:''}</b>, sedangkan <b>${esc(lo.treatment)}</b> menghasilkan rata-rata terendah sebesar <b>${fmt(lo.mean,2)}${lo.letters?`<sup>${esc(lo.letters)}</sup>`:''}</b>${relation?`. Kedua perlakuan tersebut ${relation}`:''}. Huruf superscript yang sama menunjukkan tidak berbeda nyata.`;
}

function chart(rows,responseName,no,alpha){
  if(!rows.length)return null;
  const max=Math.max(...rows.map(r=>r.mean),0)||1;
  const box=document.createElement('div');
  box.className='report-figure';
  box.innerHTML=`<div class="mean-chart">${rows.map(r=>`<div class="mean-chart-row"><div>${esc(r.treatment)}</div><div class="mean-chart-track"><div class="mean-chart-bar" style="width:${Math.max(0,r.mean/max*100)}%"></div></div><div class="mean-chart-value">${fmt(r.mean,2)}</div></div>`).join('')}</div><div class="figure-caption">Gambar ${no}. Rata-Rata ${esc(responseName)} pada Berbagai Perlakuan (deskriptif; BNJ ${alpha*100}% tidak dilakukan).</div>`;
  return box;
}

function removeLegacyNotes(section){
  $$('.analysis-note',section).forEach(n=>n.remove());
}

function enhanceSection(section,design,counters){
  if(section.dataset.safeReportEnhanced==='1')return;
  const responseName=(design==='RAK'?($('h3',section)?.textContent.split('—').slice(1).join('—').trim()):$('h4',section)?.textContent.trim())||'Peubah respons';
  const anova=$('.result-table:not(.posthoc-table)',section);
  if(!anova)return;
  const meanTable=$('.posthoc-table',section);
  const meanRows=extractMeans(section);
  const alpha=Number((design==='RAK'?$('#rakAlpha'):$('#ralAlpha'))?.value||0.05);
  const rows=$$('tbody tr',anova);
  const errorRow=rows.find(tr=>/^Galat$/i.test($('td',tr)?.textContent.trim()));
  const errorCells=errorRow?$$('td',errorRow):[];
  const dfE=num(errorCells[1]?.textContent),mse=num(errorCells[3]?.textContent);
  const stats=[];

  const head=$('thead tr',anova);
  if(head)head.innerHTML='<th>SK</th><th>db</th><th>JK</th><th>KT</th><th>F. Hitung</th><th>F. Tabel 0.05</th><th>F. Tabel 0.01</th>';
  anova.classList.add('anova-report-table');
  rows.forEach(tr=>{
    const cells=$$('td',tr),source=cells[0]?.textContent.trim()||'',df1=num(cells[1]?.textContent),f=num(cells[4]?.textContent);
    let f05=NaN,f01=NaN;
    if(!/^(Galat|Total)$/i.test(source)&&Number.isFinite(df1)&&Number.isFinite(dfE)){
      f05=fCritical(0.05,df1,dfE);f01=fCritical(0.01,df1,dfE);
      stats.push({source,f,f05,f01,label:sigLabel(f,f05,f01)});
    }
    const keep=cells.slice(0,5).map(td=>td.outerHTML).join('');
    tr.innerHTML=keep+`<td>${Number.isFinite(f05)?fmt(f05,2):'—'}</td><td>${Number.isFinite(f01)?fmt(f01,2):'—'}</td>`;
  });

  removeLegacyNotes(section);
  const treatment=stats.find(s=>/^Perlakuan$/i.test(s.source))||stats[0];
  const selectedCrit=treatment?(alpha===0.01?treatment.f01:treatment.f05):NaN;
  const significant=!!treatment&&Number.isFinite(selectedCrit)&&treatment.f>selectedCrit;

  const obsNo=++counters.table;
  const anovaNo=++counters.table;
  const lead=document.createElement('div');lead.className='report-lead';lead.innerHTML=`Data pengamatan <b>${esc(responseName)}</b> dan sidik ragam disajikan pada Tabel ${obsNo} dan Tabel ${anovaNo}.`;
  const obsCap=document.createElement('div');obsCap.className='report-caption';obsCap.dataset.tableCaption='1';obsCap.textContent=`Tabel ${obsNo}. Data Pengamatan ${responseName} pada Berbagai Perlakuan`;
  const obsWrap=document.createElement('div');obsWrap.innerHTML=observationTable(design,responseName)||'<div class="report-interpretation">Data pengamatan tidak dapat disusun ulang.</div>';
  const anovaCap=document.createElement('div');anovaCap.className='report-caption';anovaCap.dataset.tableCaption='1';anovaCap.textContent=`Tabel ${anovaNo}. Sidik Ragam ${responseName} pada Berbagai Perlakuan`;
  anova.before(lead,obsCap,obsWrap.firstElementChild,anovaCap);

  const interp=document.createElement('div');interp.className='report-interpretation';
  if(design==='RAK'){
    const block=stats.find(s=>/^(Kelompok|Ulangan)$/i.test(s.source));
    const p1=treatment?`perlakuan <b>${treatment.label}</b> terhadap ${esc(responseName)} karena ${compareSentence(treatment)}`:'';
    const p2=block?`kelompok/ulangan <b>${block.label}</b> karena ${compareSentence(block)}`:'';
    interp.innerHTML=`Berdasarkan Tabel ${anovaNo}, sidik ragam menunjukkan bahwa ${[p1,p2].filter(Boolean).join('; sedangkan ')}.`;
  }else if(treatment){
    interp.innerHTML=`Berdasarkan Tabel ${anovaNo}, perlakuan <b>${treatment.label}</b> terhadap ${esc(responseName)} karena ${compareSentence(treatment)}.`;
  }
  anova.after(interp);

  if(Number.isFinite(mse)&&meanRows.length){
    const totalN=meanRows.reduce((s,r)=>s+(Number.isFinite(r.n)?r.n:1),0);
    const grand=totalN?meanRows.reduce((s,r)=>s+r.mean*(Number.isFinite(r.n)?r.n:1),0)/totalN:NaN;
    if(Number.isFinite(grand)&&grand!==0){const kk=document.createElement('div');kk.className='report-statline';kk.textContent=`KK = ${fmt(Math.sqrt(mse)/Math.abs(grand)*100,2)}%`;interp.after(kk);}
  }

  if(meanTable&&meanRows.length){
    if(significant){
      const bnj=bnjSummary(alpha,meanRows.length,dfE,mse,meanRows);if(bnj)meanTable.before(bnj);
    }
    const meanNo=++counters.table;
    const meanCap=document.createElement('div');meanCap.className='report-caption';meanCap.dataset.tableCaption='1';meanCap.textContent=`Tabel ${meanNo}. Rata-Rata ${responseName} pada Berbagai Perlakuan${significant?'':' (Deskriptif)'}`;
    meanTable.before(meanCap);simplifyMeanTable(meanTable,responseName);
    if(!significant)$$('sup',meanTable).forEach(s=>s.remove());
    const narr=document.createElement('div');narr.className='report-interpretation';narr.innerHTML=`Berdasarkan Tabel ${meanNo}, ${meanNarrative(meanRows,responseName,alpha,significant)}`;meanTable.after(narr);
    if(!significant){const fig=chart(meanRows,responseName,++counters.figure,alpha);if(fig)narr.after(fig);}
  }
  section.dataset.safeReportEnhanced='1';
}

function enhanceRoot(selector,design){
  try{
    const root=$(selector);if(!root)return;
    const counters={table:0,figure:0};
    $$('.analysis-result',root).forEach(section=>{
      if(section.dataset.safeReportEnhanced==='1'){
        counters.table+=$$('.report-caption[data-table-caption="1"]',section).length;
        counters.figure+=$$('.figure-caption',section).length;
      }else enhanceSection(section,design,counters);
    });
  }catch(error){
    console.error('Report enhancement error:',error);
    const status=$('#status');if(status)status.textContent='⚠ Analisis selesai, tetapi format laporan tambahan tidak dapat diterapkan.';
  }
}

function watch(selector,design){
  const root=$(selector);if(!root)return;
  let timer=null;
  const run=()=>{clearTimeout(timer);timer=setTimeout(()=>enhanceRoot(selector,design),40);};
  new MutationObserver(run).observe(root,{childList:true,subtree:true});
}

function init(){
  try{ensureStyles();watch('#ralResult','RAL');watch('#rakResult','RAK');}
  catch(error){console.error('Report enhancer init error:',error);}
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
