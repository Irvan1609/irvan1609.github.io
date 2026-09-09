import jStat from 'jstat';
import { parseNumber, formatNumber } from './number-format.js';

const $ = (s, root=document) => root.querySelector(s);
const $$ = (s, root=document) => [...root.querySelectorAll(s)];
const esc = value => String(value ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const num = value => {
  const raw=String(value ?? '').replace(/^</,'').trim();
  if(raw==='∞' || /^Infinity$/i.test(raw)) return Infinity;
  const parsed = parseNumber(raw);
  return Number.isFinite(parsed) ? parsed : NaN;
};
const fmt = (value, digits=2) => formatNumber(value, digits);

function dataset(){
  const headers=$$('#gridWrap .data-grid thead th').slice(1).map(x=>x.textContent.trim());
  const rows=$$('#gridWrap .data-grid tbody tr').map(tr=>$$('td',tr).slice(1).map(td=>td.textContent.trim()));
  return {headers,rows};
}

function fCritical(alpha, df1, df2){
  try { return jStat.centralF.inv(1-alpha, df1, df2); }
  catch { return NaN; }
}

function qCritical(alpha, k, dfE){
  try { return jStat.tukey.inv(1-alpha, k, dfE); }
  catch { return NaN; }
}

function significanceLabel(f, f05, f01){
  if(f===Infinity) return 'sangat nyata';
  if(!Number.isFinite(f)) return '—';
  if(Number.isFinite(f01) && f > f01) return 'sangat nyata';
  if(Number.isFinite(f05) && f > f05) return 'nyata';
  return 'tidak nyata';
}

function fComparisonSentence(stat){
  if(!stat) return '';
  if(stat.label==='sangat nyata'){
    return `F. Hitung (${fmt(stat.f,2)}) lebih besar daripada F. Tabel 0.05 (${fmt(stat.f05,2)}) dan F. Tabel 0.01 (${fmt(stat.f01,2)})`;
  }
  if(stat.label==='nyata'){
    return `F. Hitung (${fmt(stat.f,2)}) lebih besar daripada F. Tabel 0.05 (${fmt(stat.f05,2)}), tetapi lebih kecil atau sama dengan F. Tabel 0.01 (${fmt(stat.f01,2)})`;
  }
  return `F. Hitung (${fmt(stat.f,2)}) lebih kecil atau sama dengan F. Tabel 0.05 (${fmt(stat.f05,2)})`;
}

function ensureStyles(){
  if($('#reportEnhancementStyles')) return;
  const style=document.createElement('style');
  style.id='reportEnhancementStyles';
  style.textContent=`
    .report-lead,.report-interpretation,.report-caption,.report-statline,.figure-caption,.report-note{background:#fff!important;color:#111!important;border-radius:0!important;font-family:Calibri,"Segoe UI",Arial,sans-serif!important}
    .report-lead{border:0!important;margin:10px 0 8px!important;padding:2px 0!important;line-height:1.5!important;text-align:justify}
    .report-caption{border:0!important;margin:12px 0 4px!important;padding:0!important;font-weight:700!important;font-size:12.5px!important;outline:none}
    .report-caption:focus,.figure-caption:focus{box-shadow:0 0 0 2px #9fc2ef inset}
    .report-interpretation{border:0!important;margin:10px 0!important;padding:0!important;line-height:1.55!important;text-align:justify}
    .report-statline{border:0!important;margin:6px 0 12px!important;padding:0!important;font-weight:700!important}
    .report-note{border:0!important;margin:5px 0 10px!important;padding:0!important;font-size:11.5px!important;line-height:1.4!important}
    .observation-table th,.observation-table td{text-align:center!important}
    .observation-table th:first-child,.observation-table td:first-child{text-align:left!important}
    .observation-table tfoot td{font-weight:700}
    .report-bnj-table{width:auto!important;min-width:360px!important;max-width:560px!important;margin:10px 0 12px!important}
    .report-bnj-table th,.report-bnj-table td{text-align:center!important}
    .mean-chart{margin:14px 0 8px;border:1px solid #8f8f8f;background:#fff;padding:10px 12px;min-width:560px}
    .mean-chart-row{display:grid;grid-template-columns:minmax(180px,300px) minmax(240px,1fr) 72px;gap:8px;align-items:center;min-height:28px;font:12px Calibri,"Segoe UI",Arial,sans-serif}
    .mean-chart-label{overflow-wrap:anywhere;line-height:1.2}
    .mean-chart-track{height:16px;border-left:1px solid #777;border-bottom:1px solid #d8d8d8;position:relative}
    .mean-chart-bar{height:100%;background:#5b9bd5;min-width:1px}
    .mean-chart-value{text-align:right;font-variant-numeric:tabular-nums}
    .figure-caption{border:0!important;margin:5px 0 14px!important;padding:0!important;font-weight:700!important;outline:none}
    .analysis-result .anova-report-table th:nth-child(n+2),.analysis-result .anova-report-table td:nth-child(n+2){text-align:center!important}
    @media(max-width:720px){.mean-chart{min-width:620px}.mean-chart-row{grid-template-columns:220px 1fr 62px}}
  `;
  document.head.appendChild(style);
}

function extractMeanRows(section){
  const table=$('.posthoc-table',section);
  if(!table) return [];
  return $$('tbody tr',table).map(tr=>{
    const cells=$$('td',tr);
    const valueCell=cells[cells.length-1];
    const textNode=[...valueCell.childNodes].find(n=>n.nodeType===Node.TEXT_NODE && n.textContent.trim());
    return {
      treatment: cells[0]?.textContent.trim() || '',
      n: cells.length>=3 ? num(cells[1]?.textContent) : NaN,
      mean: num(textNode?.textContent || valueCell?.textContent),
      letters: $('sup',valueCell)?.textContent.trim() || ''
    };
  }).filter(x=>x.treatment && Number.isFinite(x.mean));
}

function simplifyMeanTable(section,responseName){
  const table=$('.posthoc-table',section);
  if(!table) return;
  const headers=$$('thead th',table);
  if(headers.length>=3){
    headers[1].remove();
    const remaining=$$('thead th',table);
    if(remaining[1]) remaining[1].textContent=responseName;
    $$('tbody tr',table).forEach(tr=>{
      const cells=$$('td',tr);
      if(cells.length>=3) cells[1].remove();
    });
  } else if(headers[1]) headers[1].textContent=responseName;
}

function currentColumns(design,responseName){
  const d=dataset();
  let yi,ti,bi=null;
  if(design==='RAK'){
    yi=Number($('#rakResponse')?.value);
    ti=Number($('#rakTreatment')?.value);
    bi=Number($('#rakBlock')?.value);
  } else {
    ti=Number($('#ralTreatment')?.value);
    yi=d.headers.findIndex(h=>h===responseName);
  }
  return {d,yi,ti,bi};
}

function buildObservationTable(design,responseName){
  const {d,yi,ti,bi}=currentColumns(design,responseName);
  if(!Number.isInteger(yi)||!Number.isInteger(ti)||yi<0||ti<0) return null;
  const treatments=[...new Set(d.rows.map(r=>String(r[ti]??'').trim()).filter(Boolean))];
  if(!treatments.length) return null;

  if(design==='RAK' && Number.isInteger(bi) && bi>=0){
    const blocks=[...new Set(d.rows.map(r=>String(r[bi]??'').trim()).filter(Boolean))];
    if(!blocks.length) return null;
    const values=treatments.map(t=>blocks.map(b=>{
      const row=d.rows.find(r=>String(r[ti]??'').trim()===t && String(r[bi]??'').trim()===b);
      return row ? num(row[yi]) : NaN;
    }));
    return observationTableHtml(treatments,blocks,values);
  }

  const groups=treatments.map(t=>d.rows.filter(r=>String(r[ti]??'').trim()===t).map(r=>num(r[yi])).filter(Number.isFinite));
  const maxN=Math.max(...groups.map(g=>g.length),0);
  if(maxN<1) return null;
  const reps=Array.from({length:maxN},(_,i)=>String(i+1));
  const values=groups.map(g=>Array.from({length:maxN},(_,i)=>g[i] ?? NaN));
  return observationTableHtml(treatments,reps,values);
}

function observationTableHtml(treatments,reps,values){
  const colTotals=reps.map((_,j)=>values.reduce((s,row)=>s+(Number.isFinite(row[j])?row[j]:0),0));
  const rowTotals=values.map(row=>row.reduce((s,v)=>s+(Number.isFinite(v)?v:0),0));
  const rowCounts=values.map(row=>row.filter(Number.isFinite).length);
  const grandTotal=rowTotals.reduce((s,v)=>s+v,0);
  const grandN=rowCounts.reduce((s,v)=>s+v,0);
  const grandMean=grandN?grandTotal/grandN:NaN;
  const body=treatments.map((t,i)=>`<tr><td>${esc(t)}</td>${values[i].map(v=>`<td>${Number.isFinite(v)?fmt(v,2):'—'}</td>`).join('')}<td>${fmt(rowTotals[i],2)}</td><td>${rowCounts[i]?fmt(rowTotals[i]/rowCounts[i],2):'—'}</td></tr>`).join('');
  return `<table class="result-table observation-table"><thead><tr><th rowspan="2">Perlakuan</th><th colspan="${reps.length}">Ulangan</th><th rowspan="2">Total</th><th rowspan="2">Rata-Rata</th></tr><tr>${reps.map(r=>`<th>${esc(r)}</th>`).join('')}</tr></thead><tbody>${body}</tbody><tfoot><tr><td>Total</td>${colTotals.map(v=>`<td>${fmt(v,2)}</td>`).join('')}<td>${fmt(grandTotal,2)}</td><td>${Number.isFinite(grandMean)?fmt(grandMean,2):'—'}</td></tr></tfoot></table>`;
}

function buildBnjSummary(alpha,k,dfE,mse,meanRows){
  const q=qCritical(alpha,k,dfE);
  if(!Number.isFinite(q)||q<=0) return null;
  const ns=meanRows.map(r=>r.n).filter(Number.isFinite);
  const equalN=ns.length===meanRows.length && ns.length>0 && ns.every(n=>n===ns[0]);
  let se='—',hsd='Tukey–Kramer';
  if(equalN && ns[0]>0 && Number.isFinite(mse) && mse>=0){
    const seVal=Math.sqrt(mse/ns[0]);
    se=fmt(seVal,6);
    hsd=fmt(q*seVal,6);
  }
  const wrap=document.createElement('div');
  wrap.className='report-bnj-wrap';
  wrap.innerHTML=`<div class="analysis-note report-caption" contenteditable="true">UJI LANJUT — BNJ ${alpha*100}%</div><table class="result-table report-bnj-table"><thead><tr><th>q tabel</th><th>SE</th><th>Nilai BNJ</th></tr></thead><tbody><tr><td>${fmt(q,3)}</td><td>${se}</td><td>${hsd}</td></tr></tbody></table>`;
  return wrap;
}

function makeChart(rows,responseName,figureNo,alpha){
  if(!rows.length) return null;
  const max=Math.max(...rows.map(r=>r.mean));
  const scale=max>0?max:1;
  const figure=document.createElement('div');
  figure.className='report-figure';
  figure.innerHTML=`<div class="mean-chart">${rows.map(r=>`<div class="mean-chart-row"><div class="mean-chart-label">${esc(r.treatment)}</div><div class="mean-chart-track"><div class="mean-chart-bar" style="width:${Math.max(0,(r.mean/scale)*100)}%"></div></div><div class="mean-chart-value">${esc(fmt(r.mean,2))}</div></div>`).join('')}</div><div class="analysis-note figure-caption" contenteditable="true">Gambar ${figureNo}. Rata-Rata ${esc(responseName)} pada Berbagai Perlakuan (deskriptif; uji lanjut BNJ ${alpha*100}% tidak dilakukan).</div>`;
  return figure;
}

function meanInterpretation(rows,responseName,alpha){
  if(!rows.length) return '';
  const ordered=[...rows].sort((a,b)=>b.mean-a.mean);
  const high=ordered[0],low=ordered[ordered.length-1];
  let relation='';
  if(high.letters && low.letters){
    const share=[...high.letters].some(letter=>low.letters.includes(letter));
    relation=share?'tidak berbeda nyata':'berbeda nyata';
  }
  return `Berdasarkan tabel rata-rata, perlakuan <b>${esc(high.treatment)}</b> menghasilkan ${esc(responseName)} tertinggi, yaitu <b>${fmt(high.mean,2)}${high.letters?`<sup>${esc(high.letters)}</sup>`:''}</b>, sedangkan perlakuan <b>${esc(low.treatment)}</b> menghasilkan rata-rata terendah, yaitu <b>${fmt(low.mean,2)}${low.letters?`<sup>${esc(low.letters)}</sup>`:''}</b>${relation?`. Kedua perlakuan tersebut ${relation}`:''}. Huruf superscript yang sama menunjukkan tidak berbeda nyata menurut BNJ ${alpha*100}%.`;
}

function descriptiveInterpretation(rows,responseName,alpha,thresholdLabel){
  if(!rows.length) return '';
  const ordered=[...rows].sort((a,b)=>b.mean-a.mean);
  const high=ordered[0],low=ordered[ordered.length-1];
  return `Uji lanjut BNJ ${alpha*100}% tidak dilakukan karena F. Hitung perlakuan tidak melampaui ${thresholdLabel}. Secara deskriptif, perlakuan <b>${esc(high.treatment)}</b> mempunyai rata-rata ${esc(responseName)} tertinggi sebesar <b>${fmt(high.mean,2)}</b>, sedangkan <b>${esc(low.treatment)}</b> mempunyai rata-rata terendah sebesar <b>${fmt(low.mean,2)}</b>. Perbedaan tinggi-rendah pada grafik hanya menggambarkan pola rataan dan tidak boleh ditafsirkan sebagai perbedaan nyata antarperlakuan.`;
}

function removeLegacyNotes(section){
  $$('.analysis-note',section).forEach(n=>{
    if(!n.classList.contains('report-caption')&&!n.classList.contains('report-lead')&&!n.classList.contains('report-interpretation')&&!n.classList.contains('report-statline')&&!n.classList.contains('figure-caption')) n.remove();
  });
}

function enhanceSection(section,design,counters){
  if(section.dataset.reportEnhanced==='1') return;
  const responseName=(design==='RAK'
    ? ($('h3',section)?.textContent.split('—').slice(1).join('—').trim())
    : $('h4',section)?.textContent.trim()) || 'Peubah respons';
  const anova=$('.result-table:not(.posthoc-table):not(.report-bnj-table):not(.observation-table)',section);
  if(!anova) return;

  const meanRows=extractMeanRows(section);
  const meanTable=$('.posthoc-table',section);
  const alpha=Number((design==='RAK'?$('#rakAlpha'):$('#ralAlpha'))?.value || 0.05);
  const rows=$$('tbody tr',anova);
  const errorRow=rows.find(tr=>/^Galat$/i.test($('td',tr)?.textContent.trim()));
  const errorCells=errorRow?$$('td',errorRow):[];
  const dfE=num(errorCells[1]?.textContent);
  const mse=num(errorCells[3]?.textContent);
  const sourceRows=[];

  const head=$('thead tr',anova);
  if(head) head.innerHTML='<th>SK</th><th>db</th><th>JK</th><th>KT</th><th>F. Hitung</th><th>F. Tabel 0.05</th><th>F. Tabel 0.01</th>';
  anova.classList.add('anova-report-table');

  rows.forEach(tr=>{
    const cells=$$('td',tr);
    const source=cells[0]?.textContent.trim() || '';
    const df1=num(cells[1]?.textContent);
    const f=num(cells[4]?.textContent);
    let f05=NaN,f01=NaN;
    if(!/^(Galat|Total)$/i.test(source) && Number.isFinite(df1) && Number.isFinite(dfE)){
      f05=fCritical(0.05,df1,dfE);
      f01=fCritical(0.01,df1,dfE);
      sourceRows.push({source,f,f05,f01,label:significanceLabel(f,f05,f01)});
    }
    const keep=cells.slice(0,5).map(td=>td.outerHTML).join('');
    tr.innerHTML=keep+`<td>${Number.isFinite(f05)?fmt(f05,2):'—'}</td><td>${Number.isFinite(f01)?fmt(f01,2):'—'}</td>`;
  });

  removeLegacyNotes(section);

  const treatmentStat=sourceRows.find(r=>/^Perlakuan$/i.test(r.source)) || sourceRows[0];
  const selectedCrit=treatmentStat ? (alpha===0.01?treatmentStat.f01:treatmentStat.f05) : NaN;
  const posthocEligible=!!treatmentStat && Number.isFinite(selectedCrit) && treatmentStat.f>selectedCrit;

  const obsNo=++counters.table;
  const anovaNo=++counters.table;

  const lead=document.createElement('div');
  lead.className='analysis-note report-lead';
  lead.innerHTML=`Data pengamatan <b>${esc(responseName)}</b> dan sidik ragam disajikan pada Tabel ${obsNo} dan Tabel ${anovaNo}.`;

  const obsCaption=document.createElement('div');
  obsCaption.className='analysis-note report-caption';
  obsCaption.contentEditable='true';
  obsCaption.textContent=`Tabel ${obsNo}. Data Pengamatan ${responseName} pada Berbagai Perlakuan`;

  const obsWrap=document.createElement('div');
  obsWrap.innerHTML=buildObservationTable(design,responseName) || '<div class="analysis-note report-note">Data pengamatan tidak dapat disusun ulang.</div>';
  const obsNode=obsWrap.firstElementChild;

  const anovaCaption=document.createElement('div');
  anovaCaption.className='analysis-note report-caption';
  anovaCaption.contentEditable='true';
  anovaCaption.textContent=`Tabel ${anovaNo}. Sidik Ragam ${responseName} pada Berbagai Perlakuan`;

  anova.before(lead,obsCaption,obsNode,anovaCaption);

  const interpretation=document.createElement('div');
  interpretation.className='analysis-note report-interpretation';
  if(design==='RAK'){
    const treatment=sourceRows.find(r=>/^Perlakuan$/i.test(r.source));
    const block=sourceRows.find(r=>/^(Kelompok|Ulangan)$/i.test(r.source));
    const parts=[];
    if(treatment) parts.push(`perlakuan <b>${treatment.label}</b> terhadap ${esc(responseName)} karena ${fComparisonSentence(treatment)}`);
    if(block) parts.push(`kelompok/ulangan <b>${block.label}</b> karena ${fComparisonSentence(block)}`);
    interpretation.innerHTML=`Berdasarkan Tabel ${anovaNo}, sidik ragam menunjukkan bahwa ${parts.join('; sedangkan ')}.`;
  } else if(treatmentStat){
    interpretation.innerHTML=`Berdasarkan Tabel ${anovaNo}, perlakuan <b>${treatmentStat.label}</b> terhadap ${esc(responseName)} karena ${fComparisonSentence(treatmentStat)}.`;
  }
  anova.after(interpretation);

  if(Number.isFinite(mse) && meanRows.length){
    const totalN=meanRows.reduce((s,r)=>s+(Number.isFinite(r.n)?r.n:1),0);
    const weighted=meanRows.reduce((s,r)=>s+r.mean*(Number.isFinite(r.n)?r.n:1),0);
    const grand=totalN?weighted/totalN:NaN;
    const kk=Number.isFinite(grand)&&grand!==0?Math.sqrt(mse)/Math.abs(grand)*100:NaN;
    if(Number.isFinite(kk)){
      const kkLine=document.createElement('div');
      kkLine.className='analysis-note report-statline';
      kkLine.textContent=`KK = ${fmt(kk,2)}%`;
      interpretation.after(kkLine);
    }
  }

  if(posthocEligible && meanTable && meanRows.length){
    const bnj=buildBnjSummary(alpha,meanRows.length,dfE,mse,meanRows);
    if(bnj) section.insertBefore(bnj,meanTable);

    const meanNo=++counters.table;
    const meanCaption=document.createElement('div');
    meanCaption.className='analysis-note report-caption';
    meanCaption.contentEditable='true';
    meanCaption.textContent=`Tabel ${meanNo}. Rata-Rata ${responseName} pada Berbagai Perlakuan`;
    meanTable.before(meanCaption);
    simplifyMeanTable(section,responseName);

    const meanInterpret=document.createElement('div');
    meanInterpret.className='analysis-note report-interpretation';
    meanInterpret.innerHTML=`Berdasarkan Tabel ${meanNo}, ${meanInterpretation(meanRows,responseName,alpha)}`;
    meanTable.after(meanInterpret);
  } else {
    if(meanTable) meanTable.remove();
    counters.figure+=1;
    const thresholdLabel=`F. Tabel ${alpha===0.01?'0.01':'0.05'} (${Number.isFinite(selectedCrit)?fmt(selectedCrit,2):'—'})`;
    const desc=document.createElement('div');
    desc.className='analysis-note report-interpretation';
    desc.innerHTML=descriptiveInterpretation(meanRows,responseName,alpha,thresholdLabel);
    const chart=makeChart(meanRows,responseName,counters.figure,alpha);
    const anchor=$('.report-statline',section) || interpretation;
    anchor.after(desc);
    if(chart) desc.after(chart);
  }

  section.dataset.reportEnhanced='1';
}

function enhanceRoot(rootSelector,design){
  const root=$(rootSelector);
  if(!root) return;
  const counters={table:0,figure:0};
  $$('.analysis-result',root).forEach(section=>enhanceSection(section,design,counters));
}

function scheduleEnhance(target){
  setTimeout(()=>{
    if(target==='rak') enhanceRoot('#rakResult','RAK');
    else enhanceRoot('#ralResult','RAL');
  },0);
}

function bind(){
  ensureStyles();
  document.addEventListener('click',event=>{
    if(event.target.closest('#runRak')) scheduleEnhance('rak');
    if(event.target.closest('#runRal')) scheduleEnhance('ral');
  });
}

if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',bind);
else bind();
