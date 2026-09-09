import jStat from 'jstat';
import { parseNumber, formatNumber } from './number-format.js';

const $ = (s, root=document) => root.querySelector(s);
const $$ = (s, root=document) => [...root.querySelectorAll(s)];
const esc = value => String(value ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const num = value => {
  const parsed = parseNumber(String(value ?? '').replace(/^</,'').trim());
  return Number.isFinite(parsed) ? parsed : NaN;
};
const fmt = (value, digits=2) => formatNumber(value, digits);

function fCritical(alpha, df1, df2){
  try { return jStat.centralF.inv(1-alpha, df1, df2); }
  catch { return NaN; }
}

function significanceLabel(f, f05, f01){
  if(!Number.isFinite(f)) return '—';
  if(Number.isFinite(f01) && f > f01) return 'sangat nyata';
  if(Number.isFinite(f05) && f > f05) return 'nyata';
  return 'tidak nyata';
}

function ensureStyles(){
  if($('#reportEnhancementStyles')) return;
  const style=document.createElement('style');
  style.id='reportEnhancementStyles';
  style.textContent=`
    .report-lead,.report-interpretation,.report-caption,.report-statline,.figure-caption{background:#fff!important;color:#111!important;border-radius:0!important;font-family:Calibri,"Segoe UI",Arial,sans-serif!important}
    .report-lead{border:0!important;margin:10px 0!important;padding:2px 0!important;line-height:1.45!important}
    .report-caption{border:0!important;margin:12px 0 4px!important;padding:0!important;font-weight:700!important;font-size:12.5px!important;outline:none}
    .report-caption:focus{box-shadow:0 0 0 2px #9fc2ef inset}
    .report-interpretation{border:0!important;margin:10px 0!important;padding:0!important;line-height:1.5!important;text-align:justify}
    .report-statline{border:0!important;margin:6px 0 12px!important;padding:0!important;font-weight:700!important}
    .report-bnj-table{width:auto!important;min-width:360px!important;max-width:560px!important;margin:10px 0 12px!important}
    .report-bnj-table th,.report-bnj-table td{text-align:center!important}
    .mean-chart{margin:14px 0 8px;border:1px solid #8f8f8f;background:#fff;padding:10px 12px;min-width:560px}
    .mean-chart-row{display:grid;grid-template-columns:minmax(180px,280px) minmax(240px,1fr) 70px;gap:8px;align-items:center;min-height:28px;font:12px Calibri,"Segoe UI",Arial,sans-serif}
    .mean-chart-label{overflow-wrap:anywhere;line-height:1.2}
    .mean-chart-track{height:16px;border-left:1px solid #777;border-bottom:1px solid #d8d8d8;position:relative}
    .mean-chart-bar{height:100%;background:#5b9bd5;min-width:1px}
    .mean-chart-value{text-align:right;font-variant-numeric:tabular-nums}
    .figure-caption{border:0!important;margin:5px 0 14px!important;padding:0!important;font-weight:700!important;outline:none}
    .figure-caption:focus{box-shadow:0 0 0 2px #9fc2ef inset}
    .analysis-result .anova-report-table th:nth-child(n+2),.analysis-result .anova-report-table td:nth-child(n+2){text-align:center}
    @media(max-width:720px){.mean-chart{min-width:620px}.mean-chart-row{grid-template-columns:210px 1fr 62px}}
  `;
  document.head.appendChild(style);
}

function extractMeanRows(section){
  const table=$('.posthoc-table',section);
  if(!table) return [];
  return $$('tbody tr',table).map(tr=>{
    const cells=$$('td',tr);
    const valueCell=cells[cells.length-1];
    return {
      treatment: cells[0]?.textContent.trim() || '',
      n: cells.length>=3 ? num(cells[1]?.textContent) : NaN,
      mean: num(valueCell?.childNodes?.[0]?.textContent || valueCell?.textContent),
      letters: $('sup',valueCell)?.textContent.trim() || '',
      row: tr
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

function buildBnjTable(section,alpha){
  const notes=$$('.analysis-note',section);
  const source=notes.find(n=>/q tabel\s*=/.test(n.textContent) && /BNJ|nilai BNJ|SE\s*=/.test(n.textContent));
  if(!source) return null;
  const text=source.textContent.replace(/\s+/g,' ');
  const q=text.match(/q tabel\s*=\s*([0-9.,]+)/i)?.[1];
  const se=text.match(/SE\s*=\s*([0-9.,]+)/i)?.[1];
  const hsd=text.match(/nilai BNJ\s*=\s*([0-9.,]+)/i)?.[1];
  if(!q || !se || !hsd) return null;
  const wrap=document.createElement('div');
  wrap.className='report-bnj-wrap';
  wrap.innerHTML=`<div class="analysis-note report-caption" contenteditable="true">UJI LANJUT — BNJ ${alpha*100}%</div><table class="result-table report-bnj-table"><thead><tr><th>q tabel</th><th>SE</th><th>Nilai BNJ</th></tr></thead><tbody><tr><td>${esc(q)}</td><td>${esc(se)}</td><td>${esc(hsd)}</td></tr></tbody></table>`;
  source.replaceWith(wrap);
  return wrap;
}

function makeChart(rows,responseName,figureNo){
  if(!rows.length) return null;
  const max=Math.max(...rows.map(r=>r.mean));
  const scale=max>0?max:1;
  const figure=document.createElement('div');
  figure.className='report-figure';
  figure.innerHTML=`<div class="mean-chart">${rows.map(r=>`<div class="mean-chart-row"><div class="mean-chart-label">${esc(r.treatment)}</div><div class="mean-chart-track"><div class="mean-chart-bar" style="width:${Math.max(0,(r.mean/scale)*100)}%"></div></div><div class="mean-chart-value">${esc(fmt(r.mean,2))}</div></div>`).join('')}</div><div class="analysis-note figure-caption" contenteditable="true">Gambar ${figureNo}. Rata-rata ${esc(responseName)} pada berbagai perlakuan.</div>`;
  return figure;
}

function reportInterpretation(rows,responseName,isSignificant,alpha){
  if(!rows.length) return '';
  const ordered=[...rows].sort((a,b)=>b.mean-a.mean);
  const high=ordered[0], low=ordered[ordered.length-1];
  if(!isSignificant){
    return `Perlakuan tidak menunjukkan pengaruh nyata terhadap ${esc(responseName)}. Secara deskriptif, rata-rata tertinggi diperoleh pada perlakuan <b>${esc(high.treatment)}</b> sebesar <b>${esc(fmt(high.mean,2))}</b>, sedangkan rata-rata terendah diperoleh pada perlakuan <b>${esc(low.treatment)}</b> sebesar <b>${esc(fmt(low.mean,2))}</b>. Perbedaan rataan tersebut hanya bersifat deskriptif dan tidak dapat dinyatakan sebagai perbedaan akibat perlakuan berdasarkan sidik ragam.`;
  }
  const share = high.letters && low.letters && [...high.letters].some(letter=>low.letters.includes(letter));
  const relation = high.letters && low.letters ? (share ? 'tidak berbeda nyata' : 'berbeda nyata') : 'dibandingkan berdasarkan notasi BNJ';
  return `Hasil uji lanjut BNJ ${alpha*100}% menunjukkan bahwa perlakuan <b>${esc(high.treatment)}</b> menghasilkan rata-rata ${esc(responseName)} tertinggi, yaitu <b>${esc(fmt(high.mean,2))}<sup>${esc(high.letters)}</sup></b>, sedangkan perlakuan <b>${esc(low.treatment)}</b> menghasilkan rata-rata terendah, yaitu <b>${esc(fmt(low.mean,2))}<sup>${esc(low.letters)}</sup></b>. Kedua perlakuan tersebut ${relation}. Huruf superscript yang sama menunjukkan tidak berbeda nyata pada taraf BNJ ${alpha*100}%.`;
}

function enhanceSection(section,index,design,figureNo){
  if(section.dataset.reportEnhanced==='1') return figureNo;
  const responseName=(design==='RAK' ? ($('h3',section)?.textContent.split('—').slice(1).join('—').trim()) : $('h4',section)?.textContent.trim()) || 'Peubah respons';
  const anova=$('.result-table:not(.posthoc-table):not(.report-bnj-table)',section);
  if(!anova) return figureNo;
  const meanRows=extractMeanRows(section);
  const alpha=Number((design==='RAK'?$('#rakAlpha'):$('#ralAlpha'))?.value || 0.05);
  const rows=$$('tbody tr',anova);
  const errorRow=rows.find(tr=>/^Galat$/i.test($('td',tr)?.textContent.trim()));
  const dfE=num($$('td',errorRow||document.createElement('tr'))[1]?.textContent);
  const mse=num($$('td',errorRow||document.createElement('tr'))[3]?.textContent);
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
      f05=fCritical(0.05,df1,dfE);f01=fCritical(0.01,df1,dfE);
      sourceRows.push({source,f,f05,f01,label:significanceLabel(f,f05,f01)});
    }
    const keep=cells.slice(0,5).map(td=>td.outerHTML).join('');
    tr.innerHTML=keep+`<td>${Number.isFinite(f05)?fmt(f05,2):'—'}</td><td>${Number.isFinite(f01)?fmt(f01,2):'—'}</td>`;
  });

  const treatmentStat=sourceRows.find(r=>/^Perlakuan$/i.test(r.source)) || sourceRows[0];
  const isSignificant=!!treatmentStat && treatmentStat.f>treatmentStat.f05;
  const tableNo=index*2+1;
  const meanTableNo=tableNo+1;

  const lead=document.createElement('div');
  lead.className='analysis-note report-lead';
  lead.innerHTML=`Data ${esc(responseName)} dianalisis menggunakan ${design}. Hasil sidik ragam disajikan pada Tabel ${tableNo}.`;
  anova.before(lead);

  const anovaCaption=document.createElement('div');
  anovaCaption.className='analysis-note report-caption';
  anovaCaption.contentEditable='true';
  anovaCaption.textContent=`Tabel ${tableNo}. Sidik Ragam ${responseName}`;
  anova.before(anovaCaption);

  const oldDecision=$$('.analysis-note',section).find(n=>/Keputusan\s*α|Kesimpulan\s*α/i.test(n.textContent));
  if(oldDecision) oldDecision.remove();
  const orderNote=$$('.analysis-note',section).find(n=>/Urutan hasil mengikuti/i.test(n.textContent));
  if(orderNote) orderNote.remove();

  const interpretation=document.createElement('div');
  interpretation.className='analysis-note report-interpretation';
  if(design==='RAK'){
    const treatment=sourceRows.find(r=>/^Perlakuan$/i.test(r.source));
    const block=sourceRows.find(r=>/^(Kelompok|Ulangan)$/i.test(r.source));
    const parts=[];
    if(treatment) parts.push(`perlakuan <b>${treatment.label}</b> karena F. Hitung (${fmt(treatment.f,2)}) ${treatment.f>treatment.f05?'lebih besar':'lebih kecil atau sama dengan'} F. Tabel 0.05 (${fmt(treatment.f05,2)})`);
    if(block) parts.push(`kelompok/ulangan <b>${block.label}</b> karena F. Hitung (${fmt(block.f,2)}) ${block.f>block.f05?'lebih besar':'lebih kecil atau sama dengan'} F. Tabel 0.05 (${fmt(block.f05,2)})`);
    interpretation.innerHTML=`Berdasarkan Tabel ${tableNo}, sidik ragam menunjukkan bahwa ${parts.join(', sedangkan ')} terhadap ${esc(responseName)}.`;
  } else if(treatmentStat){
    interpretation.innerHTML=`Berdasarkan Tabel ${tableNo}, perlakuan <b>${treatmentStat.label}</b> terhadap ${esc(responseName)}. Nilai F. Hitung sebesar <b>${fmt(treatmentStat.f,2)}</b> ${treatmentStat.f>treatmentStat.f05?'lebih besar':'lebih kecil atau sama dengan'} F. Tabel 0.05 sebesar <b>${fmt(treatmentStat.f05,2)}</b>${treatmentStat.f>treatmentStat.f01?` dan F. Tabel 0.01 sebesar <b>${fmt(treatmentStat.f01,2)}</b>`:''}.`;
  }
  anova.after(interpretation);

  if(Number.isFinite(mse) && meanRows.length){
    const totalN=meanRows.reduce((s,r)=>s+(Number.isFinite(r.n)?r.n:1),0);
    const weighted=meanRows.reduce((s,r)=>s+r.mean*(Number.isFinite(r.n)?r.n:1),0);
    const grand=totalN?weighted/totalN:NaN;
    const kk=Number.isFinite(grand)&&grand!==0?Math.sqrt(mse)/grand*100:NaN;
    if(Number.isFinite(kk)){
      const kkLine=document.createElement('div');
      kkLine.className='analysis-note report-statline';
      kkLine.textContent=`KK = ${fmt(kk,2)}%`;
      interpretation.after(kkLine);
    }
  }

  if(isSignificant) buildBnjTable(section,alpha);
  else {
    $$('.analysis-note',section).filter(n=>/q tabel\s*=|Uji BNJ tidak dijalankan/i.test(n.textContent)).forEach(n=>n.remove());
  }

  const meanTable=$('.posthoc-table',section);
  if(meanTable){
    const meanCaption=document.createElement('div');
    meanCaption.className='analysis-note report-caption';
    meanCaption.contentEditable='true';
    meanCaption.textContent=`Tabel ${meanTableNo}. Rata-Rata ${responseName} pada Berbagai Perlakuan`;
    meanTable.before(meanCaption);
    simplifyMeanTable(section,responseName);

    const meanInterpret=document.createElement('div');
    meanInterpret.className='analysis-note report-interpretation';
    meanInterpret.innerHTML=`Berdasarkan Tabel ${meanTableNo}, ${reportInterpretation(meanRows,responseName,isSignificant,alpha)}`;
    meanTable.after(meanInterpret);

    if(!isSignificant){
      figureNo+=1;
      const chart=makeChart(meanRows,responseName,figureNo);
      if(chart) meanInterpret.after(chart);
    }
  }

  section.dataset.reportEnhanced='1';
  return figureNo;
}

function enhanceRoot(rootSelector,design){
  const root=$(rootSelector);if(!root)return;
  let figureNo=0;
  $$('.analysis-result',root).forEach((section,index)=>{figureNo=enhanceSection(section,index,design,figureNo);});
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
