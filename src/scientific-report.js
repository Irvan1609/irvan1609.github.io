import {formatNumber as fmt} from './number-format.js';
import {resultActions} from './result-export.js';
import jStat from 'jstat';
import {interpretReport} from './report-insights.js';
import {renderBab4Table} from './bab4-table.js';
import {renderDecisionSummary} from './analysis-audit.js';
import {residualHistogram,renderInfluenceDiagnostics} from './diagnostic-report.js';
import {parameterLongName,parseParameterHeader} from './parameter-metadata.js';
import {describeLevel,metadataFactor} from './treatment-metadata.js';
export const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[c]));
export const designNames={ral:'RAL',rak:'RAK',fral:'Faktorial RAL',frak:'Faktorial RAK',split:'RPT / petak terbagi dalam RAK'};
const pv=p=>p===null||!Number.isFinite(p)?'—':p<.001?'&lt;'+fmt(.001):fmt(p);
const sigMark=p=>!Number.isFinite(p)?'—':p<.01?'**':p<.05?'*':'tn';
function compactStatus(report){
  const terms=report.terms||[],find=patterns=>terms.find(term=>patterns.some(pattern=>pattern.test(String(term.label||''))));
  const chip=(label,term)=>term&&Number.isFinite(term.p)?`<span class="result-status-chip result-status-${sigMark(term.p)==='**'?'ss':sigMark(term.p)==='*'?'s':'tn'}"><b>${esc(label)}</b> ${sigMark(term.p)}</span>`:'';
  if(['fral','frak','split'].includes(report.design)){
    return [chip('A',find([/^Faktor A$/i,/Petak Utama \(A\)/i])),chip('B',find([/^Faktor B$/i,/Anak Petak \(B\)/i])),chip('A×B',find([/^A\s*×\s*B$/i,/Interaksi.*A.*B/i]))].filter(Boolean).join('');
  }
  return chip('Perlakuan',find([/^Perlakuan$/i]));
}
function cell(x){return typeof x==='number'?`<td data-number="${x}">${fmt(x)}</td>`:`<td>${x??'—'}</td>`;}
function table(headers,rows,cls=''){return `<div class="table-scroll"><table class="result-table ${cls}"><thead><tr>${headers.map(h=>`<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(row=>`<tr>${row.map(cell).join('')}</tr>`).join('')}</tbody></table></div>`;}
const labelLines=(label,x,y)=>String(label).match(/.{1,35}(?:\s|$)|.{1,35}/g)?.map((text,i)=>`<tspan x="${x}" dy="${i?14:0}">${esc(text)}</tspan>`).join('')||'';

export function contrastDisplayRows(report){
  return (report.contrasts||[]).map(c=>{
    const firstSign=Math.sign(c.coefficients.find(x=>x!==0));
    const groupMean=sign=>{
      const weight=c.coefficients.reduce((s,x)=>s+(Math.sign(x)===sign?Math.abs(x):0),0);
      return c.coefficients.reduce((s,x,i)=>s+(Math.sign(x)===sign?Math.abs(x)*report.cells[i].mean:0),0)/weight;
    };
    return {...c,q:c.coefficients.reduce((s,x,i)=>s+x*report.cells[i].mean*report.cells[i].n,0),
      leftMean:groupMean(firstSign),rightMean:groupMean(-firstSign),
      mark:c.p<.01?'**':c.p<.05?'*':'tn',
      f05:jStat.centralF.inv(.95,1,c.denDf),f01:jStat.centralF.inv(.99,1,c.denDf)};
  });
}

export function renderContrasts(report,caption){
  const contrasts=contrastDisplayRows(report);
  const value=x=>`<span data-number="${x}">${fmt(x,2)}</span>`;
  const marked=c=>`${value(c.f)}<sup>${c.mark}</sup>`;
  const rows=report.cells.map((item,i)=>[esc(item.label),item.mean*item.n,...contrasts.map(c=>c.coefficients[i])]);
  rows.push(['Q','',...contrasts.map(c=>c.q)],['JK','',...contrasts.map(c=>c.ss)],
    ['F. Hitung','',...contrasts.map(marked)],['Rata-rata 1','',...contrasts.map(c=>value(c.leftMean))],
    ['Rata-rata 2','',...contrasts.map(c=>value(c.rightMean))]);
  return caption('Perhitungan uji kontras — '+report.name)+table(['Perlakuan','Total perlakuan',...contrasts.map(c=>c.name)],rows,'contrast-calculation-table')+
    '<div class="analysis-note">Q = Σ(cᵢTᵢ). Untuk ulangan sama, JK = Q²/(rΣcᵢ²). Untuk ulangan tidak sama, JK = (Σcᵢȳᵢ)²/Σ(cᵢ²/nᵢ). Rata-rata kelompok dibobot menurut nilai absolut koefisien; kelompok 1 mengikuti tanda koefisien pertama yang tidak nol. Pembalikan seluruh tanda koefisien tidak mengubah JK atau F.</div>'+
    caption('Uji kontras — '+report.name)+table(['Kontras','Rata-Rata','F. Hitung'],contrasts.map(c=>[esc(c.name),`${value(c.leftMean)} vs ${value(c.rightMean)}`,marked(c)]),'contrast-summary-table')+
    '<div class="analysis-note">tn = tidak nyata; * = p &lt; 0,05; ** = p &lt; 0,01. Nilai p merupakan pengujian individual, tanpa penyesuaian pengujian multipel. Baris kontras merupakan rincian perbandingan perlakuan, bukan sumber keragaman tambahan yang dijumlahkan kembali.</div>'+
    '<details><summary>Estimasi, SE, dan nilai p kontras</summary>'+table(['Kontras','Estimasi','SE','JK','F','p'],contrasts.map(c=>[esc(c.name),c.estimate,c.se,c.ss,c.f,pv(c.p)]))+'</details>';
}

export function renderAnova(report){
  const terms=report.terms.map(t=>({...t}));
  // The combined treatment row is meaningful only for factorial designs with one error stratum.
  if(['fral','frak'].includes(report.design)){
    const effects=terms.filter(t=>['Faktor A','Faktor B','A × B'].includes(t.label)),error=terms.find(t=>t.label==='Galat');
    if(effects.length===3&&error?.ms>0){
      const ss=effects.reduce((s,t)=>s+t.ss,0),df=effects.reduce((s,t)=>s+t.df,0),ms=ss/df,f=ms/error.ms;
      terms.splice(terms.findIndex(t=>t.label==='Faktor A'),0,{label:'Perlakuan',ss,df,ms,f,f05:jStat.centralF.inv(.95,df,error.df),f01:jStat.centralF.inv(.99,df,error.df),error:'Galat'});
    }
  }
  if(['ral','rak'].includes(report.design)&&(report.contrasts||[]).length){
    const at=terms.findIndex(t=>t.label==='Perlakuan');
    if(at>=0)terms.splice(at+1,0,...contrastDisplayRows(report).map(c=>({label:c.name,df:1,ss:c.ss,ms:c.ss,f:c.f,f05:c.f05,f01:c.f01,error:'Galat'})));
  }
  const numeric=(x,digits=2)=>x===null||x===undefined?'':`<span data-number="${x}">${fmt(x,digits)}</span>`;
  const numCell=(x,digits=2)=>x===null||x===undefined?'<td></td>':`<td data-number="${x}">${fmt(x,digits)}</td>`;
  const rows=terms.map(t=>{
    const tested=typeof t.f==='number'&&!Number.isNaN(t.f),mark=tested?(t.f>t.f01?'**':t.f>t.f05?'*':'tn'):'';
    return `<tr><td>${esc(t.label==='Ulangan'?'Kelompok':t.label)}</td>${numCell(t.df,0)}${numCell(t.ss)}${numCell(t.ms)}<td>${tested?numeric(t.f)+`<sup>${mark}</sup>`:''}</td>${numCell(t.f05)}${numCell(t.f01)}<td>${mark}</td></tr>`;
  }).join('');
  const headings=['SK','db','JK','KT','F. Hitung'].map(x=>`<th scope="col" rowspan="2">${x}</th>`).join('');
  const errors=[...new Set(terms.filter(t=>typeof t.f==='number').map(t=>t.error).filter(Boolean))];
  const errorNote=errors.length>1?` Pembanding: ${terms.filter(t=>typeof t.f==='number').map(t=>esc(t.label)+' → '+esc(t.error)).join('; ')}.`:'';
  return `<div class="table-scroll"><table class="result-table anova-table"><thead><tr>${headings}<th scope="colgroup" colspan="2">F. Tabel</th><th scope="col" rowspan="2">Ket.</th></tr><tr><th scope="col">${fmt(.05,2)}</th><th scope="col">${fmt(.01,2)}</th></tr></thead><tbody>${rows}</tbody></table></div><div class="analysis-note">KK = ${fmt(report.cv,2)}%${report.cvWhole!==null&&report.cvWhole!==undefined?`; KK petak utama = ${fmt(report.cvWhole,2)}%`:''}</div><div class="analysis-note">tn = tidak nyata; * = nyata pada taraf 5%; ** = sangat nyata pada taraf 1%.${errorNote}${['fral','frak'].includes(report.design)?' Baris Perlakuan merupakan gabungan Faktor A, Faktor B, dan interaksinya.':''}</div>`;
}

export function barChart(items,title){
  const width=860,left=280,right=100,step=52,height=70+step*items.length,range=[Math.min(0,...items.map(x=>x.mean-x.se)),Math.max(0,...items.map(x=>x.mean+x.se))];
  const span=range[1]-range[0]||1,scale=x=>left+(x-range[0])/span*(width-left-right),zero=scale(0);
  const bars=items.map((item,i)=>{const y=38+i*step,tip=scale(item.mean),lo=scale(item.mean-item.se),hi=scale(item.mean+item.se),letters=(item.letters||[]).join('');return `<text x="8" y="${y+14}" font-size="12">${labelLines(item.label,8,y+14)}</text><rect x="${Math.min(zero,tip)}" y="${y}" width="${Math.max(1,Math.abs(tip-zero))}" height="24" fill="#3165ad"/><path d="M${lo},${y+12}H${hi} M${lo},${y+5}V${y+19} M${hi},${y+5}V${y+19}" stroke="#111" fill="none"/><text x="${hi+8}" y="${y+16}" font-size="12">${esc(fmt(item.mean,2))}<tspan baseline-shift="super" font-size="10">${esc(letters)}</tspan></text>`;}).join('');
  return `<div class="scientific-chart"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(title)}"><rect width="100%" height="100%" fill="white"/><g font-family="Arial,sans-serif" fill="#18283a"><text x="8" y="19" font-size="15" font-weight="bold">${esc(title)}</text><path d="M${zero},28V${height-25}" stroke="#aaa"/>${bars}<text x="${left}" y="${height-6}" font-size="12">${esc(fmt(range[0],2))}</text><text x="${width-right}" y="${height-6}" font-size="12">${esc(fmt(range[1],2))}</text></g></svg><button data-chart-download>Unduh grafik SVG</button></div>`;
}
export function interactionChart(report){
  const {factorA:A,factorB:B,cells}=report,width=860,height=350,colors=['#215cc5','#bd3b37','#2f824a','#965cb4','#a56c14','#14858d'];
  const min=Math.min(...cells.map(x=>x.mean)),max=Math.max(...cells.map(x=>x.mean)),span=max-min||1,x=i=>80+i*520/Math.max(1,B.length-1),y=v=>280-(v-min)/span*220;
  const response=parameterLongName(report.name),aName=metadataFactor(report,'a','Faktor A'),bName=metadataFactor(report,'b','Faktor B');
  const bLabels=B.map(code=>describeLevel(report,'b',code)),aLabels=A.map(code=>describeLevel(report,'a',code));
  return `<div class="scientific-chart"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${Math.max(height,A.length*22+60)}" role="img" aria-label="Interaksi ${esc(aName)} dan ${esc(bName)}"><rect width="100%" height="100%" fill="white"/><g font-family="Arial,sans-serif" font-size="12"><text x="25" y="22" font-size="15" font-weight="bold">Interaksi ${esc(aName)} × ${esc(bName)} — ${esc(response)}</text><path d="M70,45V285H610" stroke="#555" fill="none"/>${[0,.5,1].map(t=>`<text x="8" y="${y(min+t*span)+4}">${esc(fmt(min+t*span,2))}</text>`).join('')}${bLabels.map((label,i)=>`<text x="${x(i)}" y="308" text-anchor="middle">${labelLines(label,x(i),308)}</text>`).join('')}${A.map((a,i)=>{const values=B.map(b=>cells.find(c=>c.a===a&&c.b===b).mean);return `<polyline points="${values.map((v,j)=>`${x(j)},${y(v)}`).join(' ')}" fill="none" stroke="${colors[i%colors.length]}" stroke-width="2"/>${values.map((v,j)=>`<circle cx="${x(j)}" cy="${y(v)}" r="4" fill="${colors[i%colors.length]}"/>`).join('')}<text x="640" y="${55+i*22}" fill="${colors[i%colors.length]}">${esc(aLabels[i])}</text>`;}).join('')}<text x="275" y="340">${esc(bName)}</text><text x="16" y="175" transform="rotate(-90 16 175)" text-anchor="middle">${esc(response)}</text></g></svg><button data-chart-download>Unduh grafik SVG</button></div>`;
}
function diagnosticPlot(values,fitted,qq){
  if(values.length<3)return '';
  const sorted=[...values].sort((a,b)=>a-b),xs=qq?sorted.map((_,i)=>jStat.normal.inv((i+.5)/sorted.length,0,1)):fitted,ys=qq?sorted:values;
  const xmin=Math.min(...xs),xmax=Math.max(...xs),ymin=Math.min(...ys),ymax=Math.max(...ys),x=v=>60+(v-xmin)/(xmax-xmin||1)*530,y=v=>250-(v-ymin)/(ymax-ymin||1)*200;
  const title=qq?'Q–Q residual':'Residual terhadap nilai prediksi';
  return `<div class="scientific-chart"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 650 300" role="img" aria-label="${title}"><rect width="100%" height="100%" fill="white"/><g font-family="Arial" font-size="12"><text x="30" y="22" font-weight="bold">${title}</text><path d="M55,45V255H600" fill="none" stroke="#666"/>${qq?`<path d="M60,250L590,50" stroke="#999"/>`:`<path d="M60,${y(0)}H590" stroke="#999"/>`}${xs.map((v,i)=>`<circle cx="${x(v)}" cy="${y(ys[i])}" r="2.5" fill="#215cc5"/>`).join('')}<text x="60" y="273">${esc(fmt(xmin,2))}</text><text x="555" y="273">${esc(fmt(xmax,2))}</text><text x="3" y="55">${esc(fmt(ymax,2))}</text><text x="3" y="250">${esc(fmt(ymin,2))}</text><text x="230" y="293">${qq?'Kuantil normal teoretis':'Nilai prediksi'}</text></g></svg><button data-chart-download>Unduh grafik SVG</button></div>`;
}
function criticalText(test){return (test.critical||[]).map(x=>`${x.range}: ${fmt(x.value,3)}`).join('; ')||'—';}
function factorialInteractionTable(report,comparison,displayName){
  const rows=report.factorA.map(a=>[esc(a),...report.factorB.map(b=>{const item=comparison.items.find(x=>x.a===a&&x.b===b),letters=(item?.letters||[]).join('');return item?`${fmt(item.mean,2)}${letters?`<sup>${esc(letters)}</sup>`:''}`:'—';})]);
  return table(['Faktor A \\ Faktor B',...report.factorB],rows,'posthoc-table')+`<div class="analysis-note">${comparison.method==='none'?'Uji lanjut interaksi tidak dipilih.':`${comparison.method.toUpperCase()} ${report.alpha*100}% diterapkan pada seluruh kombinasi A × B menggunakan KT Acak = ${fmt(comparison.mse)} dan db = ${fmt(comparison.df,0)}. Huruf yang sama menunjukkan kombinasi tidak terdeteksi berbeda nyata.`}</div>${comparison.method==='none'?'':table(['Rentang','Nilai kritis '+(comparison.method==='bnt'?'t':'q')],comparison.critical.map(x=>[x.range,x.value]))}`;
}
function splitInteractionTable(report,posthoc){
  const rows=posthoc.rows.map(a=>[esc(a),...posthoc.columns.map(b=>{const item=posthoc.cells.find(x=>x.a===a&&x.b===b),rowLetters=(item?.rowLetters||[]).join(''),columnLetters=(item?.columnLetters||[]).join('');return item?`${fmt(item.mean,2)}${rowLetters?`<sup>${esc(rowLetters)}</sup>`:''}${columnLetters?`<sub>${esc(columnLetters)}</sub>`:''}`:'—';})]);
  let html=table(['Petak Utama (A) \\ Anak Petak (B)',...posthoc.columns],rows,'posthoc-table');
  if(posthoc.method==='none')return html+'<div class="analysis-note">Interaksi nyata, tetapi uji lanjut tidak dipilih. Tabel hanya menampilkan rataan kombinasi.</div>';
  const rowTest=posthoc.rowTests[0],columnTest=posthoc.columnTests[0];
  html+=`<div class="analysis-note"><b>Uji lanjut interaksi RPT — ${posthoc.method.toUpperCase()} ${posthoc.alpha*100}%.</b> Huruf <sup>a, b, c, …</sup> dibandingkan <b>dalam baris yang sama</b> (Anak Petak pada Petak Utama yang sama). Huruf <sub>x, y, z, …</sub> dibandingkan <b>dalam kolom yang sama</b> (Petak Utama pada Anak Petak yang sama). Huruf dari baris atau kolom berbeda tidak dibandingkan langsung.</div>`;
  html+=table(['Arah perbandingan','Galat pembanding','db efektif','Nilai kritis','Ambang pertama'],[
    ['B pada setiap A',`Acak (b): KT ${fmt(posthoc.mseB)}`,rowTest.df,criticalText(rowTest),rowTest.pairs?.[0]?.threshold??'—'],
    ['A pada setiap B',posthoc.method==='bnt'?`Acak (a) + Acak (b), t terbobot`:`Acak (a) + Acak (b), Satterthwaite`,columnTest.df,criticalText(columnTest),columnTest.pairs?.[0]?.threshold??'—']
  ]);
  return html;
}

export function renderReport(report){
  const {name,design,alpha}=report;let num=0;
  const displayName=parameterLongName(name),parameterMeta=parseParameterHeader(name),datasetMeta=report.datasetMeta||{};
  const context=[datasetMeta.plant,datasetMeta.treatment].map(x=>String(x||'').trim()).filter(Boolean);
  const reportTitle=context.length?`Analisis ${displayName} — ${context.join(' — ')}`:`${designNames[design]} — ${displayName}`;
  const caption=text=>`<div class="table-caption">Tabel ${++num}. ${esc(text)}</div>`;
  const cvText=design==='split'?`KK (a) = ${fmt(report.cvWhole,2)}%; KK (b) = ${fmt(report.cv,2)}%`:`KK = ${fmt(report.cv,2)}%`;
  const transformType=report.transform?.type||'none',transformLabel=report.transform?.label||'Tanpa transformasi',transformLambda=Number.isFinite(report.transform?.lambda)?String(report.transform.lambda):'';
  let html=`<section class="analysis-result" data-export-scope data-parameter="${esc(name)}" data-parameter-code="${esc(parameterMeta.code||'')}" data-parameter-unit="${esc(parameterMeta.unit||'')}" data-design="${esc(design)}" data-transform-type="${esc(transformType)}" data-transform-label="${esc(transformLabel)}" data-transform-lambda="${esc(transformLambda)}"><h3>${esc(reportTitle)}</h3><div class="analysis-result-meta"><span>N ${report.N}</span><span>Rataan ${fmt(report.grand,2)}</span><span>${cvText}</span><span class="analysis-result-significance">${compactStatus(report)}</span></div>${resultActions(`${design}-${name}`)}`;
  const multi=['fral','frak','split'].includes(design),grouped=['rak','frak','split'].includes(design);
  const hasRep=report.replicates.some(r=>r!=='');
  const rawGroups=report.cells.map(c=>report.observations.filter(o=>o.a===c.a&&o.b===c.b));
  const repNames=hasRep?report.replicates:Array.from({length:Math.max(...rawGroups.map(g=>g.length))},(_,i)=>String(i+1));
  const observationTable=(observations,cls='observation-table')=>{
    const groups=report.cells.map(c=>observations.filter(o=>o.a===c.a&&o.b===c.b));
    const display=groups.map(g=>repNames.map((rep,i)=>hasRep?g.find(o=>o.rep===rep)?.y:g[i]?.y));
    const rows=report.cells.map((cell,i)=>{
      const values=groups[i].map(o=>o.y),total=values.reduce((s,v)=>s+v,0),avg=values.length?total/values.length:NaN;
      return [`<span data-factor-a="${esc(cell.a)}" data-factor-b="${esc(cell.b)}">${esc(cell.label)}</span>`,...display[i].map(x=>x===undefined?'':x),total,avg];
    });
    const all=observations.map(o=>o.y),grand=all.length?all.reduce((s,v)=>s+v,0)/all.length:NaN;
    rows.push(['Total',...repNames.map((_,i)=>display.reduce((s,g)=>s+(g[i]??0),0)),all.reduce((s,v)=>s+v,0),grand]);
    return table(['Perlakuan',...repNames.map(r=>(grouped?'Kelompok ':'Ulangan ')+r),'Total','Rata-rata'],rows,cls);
  };
  const transformed=report.transform?.type&&report.transform.type!=='none';
  if(transformed){
    const detail=report.transform.type==='boxcox'&&Number.isFinite(report.transform.lambda)?`${report.transform.label}; λ = ${fmt(report.transform.lambda,2)}`:report.transform.label;
    html+=`<div class="analysis-note transform-note"><b>Transformasi data:</b> ${esc(detail)}. Analisis utama dan uji lanjut menggunakan data setelah transformasi; data sebelum transformasi tetap ditampilkan sebagai pembanding.</div>`;
    if(report.originalObservations?.length){
      html+=`<details class="result-technical-details"><summary>Data sebelum transformasi</summary>${caption('Data sebelum transformasi')}${observationTable(report.originalObservations,'observation-before-table')}${report.beforeTransform?caption('Sidik ragam sebelum transformasi')+renderAnova({...report,terms:report.beforeTransform.terms,cv:report.beforeTransform.cv,cvWhole:report.beforeTransform.cvWhole,grand:report.beforeTransform.grand,contrasts:[]}):report.beforeTransformError?`<div class="analysis-note">Sidik ragam sebelum transformasi tidak dapat dihitung: ${esc(report.beforeTransformError)}</div>`:''}</details>`;
    }
    html+=`<details class="result-technical-details"><summary>Data transformasi</summary>${caption(`Data setelah transformasi ${report.transform.label}`)}${observationTable(report.observations,'observation-table')}</details>`;
    html+=caption(`Sidik ragam setelah transformasi ${report.transform.label}`)+renderAnova(report);
  }else{
    html+=`<details class="result-technical-details"><summary>Data pengamatan</summary>${caption('Data pengamatan')}${observationTable(report.observations,'observation-table')}</details>`;
    html+=caption('Sidik ragam')+renderAnova(report);
  }
  html+=`<details class="result-technical-details"><summary>Keputusan uji lanjut</summary>${renderDecisionSummary(report)}</details>`;
  const tested=report.terms.filter(t=>t.f!==null);
  html+=`<div class="analysis-note">${tested.map(t=>`${esc(t.label)} ${t.p<alpha?'berpengaruh nyata':'tidak menunjukkan pengaruh nyata'} terhadap ${esc(displayName)} (F = ${fmt(t.f)}, db = ${t.df} dan ${report.terms.find(e=>e.label===t.error)?.df??'—'}, α = ${fmt(alpha,2)}).`).join(' ')}</div>`;
  if(report.interactionPosthoc&&report.interactionPosthoc.method!=='none'){
    html+=caption(`Uji lanjut interaksi RPT — ${report.interactionPosthoc.method.toUpperCase()}`)+splitInteractionTable(report,report.interactionPosthoc);
  }
  for(const comparison of report.comparisons){
    if(comparison.method==='none')continue;
    const method=comparison.method.toUpperCase();
    if(comparison.layout==='factorial-interaction'){
      html+=caption(`${comparison.title} — ${method}`)+factorialInteractionTable(report,comparison,name);
      continue;
    }
    html+=caption(`${comparison.title} — ${method}`)+table(['Perlakuan',displayName,'n','SD','SE'],comparison.items.map(item=>[esc(item.label),`${fmt(item.mean,2)}${item.letters?.length?`<sup>${esc(item.letters.join(comparison.items.length>26?' · ':''))}</sup>`:''}`,item.n,item.sd,item.se]),'posthoc-table');
    html+=`<div class="analysis-note">${method} ${alpha*100}%; KT galat = ${fmt(comparison.mse)}; db galat = ${fmt(comparison.df,2)}. Huruf yang sama = tidak berbeda nyata.</div>`;
    const high=comparison.items.reduce((a,b)=>a.mean>=b.mean?a:b),low=comparison.items.reduce((a,b)=>a.mean<=b.mean?a:b);
    const same=high.letters?.some(x=>low.letters?.includes(x));
    html+=`<div class="analysis-note">Pada ${esc(comparison.title)}, rataan tertinggi terdapat pada ${esc(high.label)} (${fmt(high.mean,2)} ± ${fmt(high.se,2)} SE), sedangkan terendah pada ${esc(low.label)} (${fmt(low.mean,2)} ± ${fmt(low.se,2)} SE). Kedua rataan ${same?'tidak terdeteksi berbeda nyata':'berbeda nyata'} menurut ${method} pada α = ${fmt(alpha,2)}.</div>`;
    const axis=/Faktor B|Anak Petak|B pada A/i.test(comparison.title)?'b':'a',chartItems=comparison.items.map(item=>({...item,label:describeLevel(report,axis,item.label)}));html+=barChart(chartItems,`${displayName} — ${comparison.title}`)+`<div class="figure-caption">Rataan ± SE model. Urutan mengikuti data. </div>`;
  }
  if(multi){
    const interaction=report.terms.find(t=>/^A\s*×\s*B$/i.test(String(t.label||''))||/Interaksi.*A.*B/i.test(String(t.label||'')));
    const interactionHtml=interactionChart(report)+caption('Rataan kombinasi untuk grafik interaksi')+table(['Faktor A','Faktor B','Rataan','SE'],report.cells.map(c=>[esc(c.a),esc(c.b),c.mean,c.se]));
    html+=interaction&&Number.isFinite(interaction.p)&&interaction.p<.05?interactionHtml:`<details class="result-technical-details"><summary>Grafik interaksi</summary>${interactionHtml}</details>`;
  }
  if(report.contrasts.length)html+=renderContrasts(report,caption);
  html+=renderBab4Table(report);
  if(report.assumptions.length){
    html+=caption('Pemeriksaan asumsi')+table(['Pemeriksaan','Statistik','p','Keterangan'],report.assumptions.map(a=>[esc(a.name),a.stat,pv(a.p),esc(a.p===null?a.note:a.p<alpha?'Ada bukti penyimpangan pada taraf yang dipilih.':'Belum ada bukti penyimpangan pada taraf yang dipilih.')]));
    html+=diagnosticPlot(report.residuals,report.fitted,true)+diagnosticPlot(report.residuals,report.fitted,false)+residualHistogram(report.residuals,'Histogram residual');
    html+=renderInfluenceDiagnostics(report.diagnostics);
    if(report.wholeResiduals.length)html+=diagnosticPlot(report.wholeResiduals,[],true)+residualHistogram(report.wholeResiduals,'Histogram residual petak utama');
  }
  const interpretation=interpretReport(report);
  html+=`<section class="chapter-interpretation" data-chapter-interpretation><div class="chapter-interpretation-head"><div><b>Catatan interpretasi</b><small>Bagian ini saya gunakan sebagai draf awal. Konteks biologis, satuan, dan istilah penelitian tetap perlu saya cek lagi.</small></div><button type="button" data-result-action="copy-interpretation">Salin catatan</button></div>${interpretation.map(text=>`<div class="analysis-note interpretation-paragraph">${esc(text)}</div>`).join('')}</section>`;
  html+=report.notes.map(note=>`<div class="analysis-note">${esc(note)}</div>`).join('');
  return html+'</section>';
}
export function installChartDownload(){document.addEventListener('click',event=>{const button=event.target.closest('[data-chart-download]');if(!button)return;const svg=button.parentElement.querySelector('svg');const blob=new Blob([svg.outerHTML],{type:'image/svg+xml;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='grafik-analisis.svg';a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);});}
