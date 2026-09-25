import {formatNumber as fmt} from './number-format.js';
import {metadataFactor,describeLevel} from './treatment-metadata.js';
import {parseParameterHeader,parameterLongName} from './parameter-metadata.js';

const html=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const significant=(term,alpha)=>Number.isFinite(term?.p)&&term.p<alpha;
const statusText=(term,alpha)=>significant(term,alpha)?(term.p<.01?'berpengaruh sangat nyata':'berpengaruh nyata'):'tidak berpengaruh nyata';
const significanceSymbol=p=>!Number.isFinite(p)?'—':p<.01?'**':p<.05?'*':'tn';

function lettersOverlap(a,b){
  const left=a?.letters||[],right=b?.letters||[];
  return left.some(letter=>right.includes(letter));
}
function extreme(items,mode='high'){
  if(!items?.length)return null;
  return items.reduce((best,item)=>mode==='high'?(item.mean>best.mean?item:best):(item.mean<best.mean?item:best));
}
function parameterParts(report){
  const meta=parseParameterHeader(report?.name||'parameter'),base=(meta.name||meta.code||'parameter').trim().toLowerCase();
  return {measure:report?.transform?.type&&report.transform.type!=='none'?`setelah transformasi ${base}`:base,unit:meta.unit};
}
function valueText(value,unit){
  return `${fmt(value,2)}${unit?' '+unit:''}`;
}
function termBy(report,patterns){
  return (report.terms||[]).find(term=>patterns.some(pattern=>pattern.test(String(term.label||''))));
}
function readableFactor(value,fallback){
  const text=String(value??'').trim();
  return text||fallback;
}
function listLabels(items){
  const labels=items.map(item=>item.a&&item.b?`${item.a}${item.b}`:item.label);
  if(labels.length<=1)return labels[0]||'';
  if(labels.length===2)return labels.join(' dan ');
  return labels.slice(0,-1).join(', ')+', dan '+labels.at(-1);
}
function relationClause(high,comparison){
  if(comparison.method==='none'||!high?.letters?.length)return '';
  const others=comparison.items.filter(item=>item!==high),different=others.filter(item=>!lettersOverlap(high,item)),same=others.filter(item=>lettersOverlap(high,item));
  if(different.length&&same.length)return ` yang berbeda nyata dengan ${listLabels(different)}, namun tidak berbeda nyata dengan ${listLabels(same)}`;
  if(different.length)return ` yang berbeda nyata dengan ${listLabels(different)}`;
  if(same.length)return ` yang tidak berbeda nyata dengan ${listLabels(same)}`;
  return '';
}
function comparisonSubject(comparison,report,item){
  const aName=metadataFactor(report,'a',readableFactor(report.factorLabels?.a,'Faktor A')),bName=metadataFactor(report,'b',readableFactor(report.factorLabels?.b,'Faktor B'));
  if(comparison.layout==='factorial-interaction'||/interaksi/i.test(comparison.title)){
    if(item?.a&&item?.b){
      const aDesc=describeLevel(report,'a',item.a,{withCode:false}),bDesc=describeLevel(report,'b',item.b,{withCode:false});
      const hasMeta=aDesc!==item.a||bDesc!==item.b;
      return hasMeta?`kombinasi ${aName} ${aDesc} dan ${bName} ${bDesc} (${item.a}${item.b})`:`kombinasi perlakuan ${item.a}${item.b}`;
    }
    return `kombinasi perlakuan ${item?.label||''}`;
  }
  if(/petak utama|faktor a/i.test(comparison.title)){
    const desc=describeLevel(report,'a',item.label,{withCode:false});
    return desc!==item.label?`${aName} ${desc} (${item.label})`:`taraf ${item.label} pada ${aName}`;
  }
  if(/anak petak|faktor b/i.test(comparison.title)){
    const desc=describeLevel(report,'b',item.label,{withCode:false});
    return desc!==item.label?`${bName} ${desc} (${item.label})`:`taraf ${item.label} pada ${bName}`;
  }
  const desc=describeLevel(report,'a',item.label,{withCode:false});
  return desc!==item.label?`perlakuan ${desc} (${item.label})`:`perlakuan ${item.label}`;
}
function comparisonNarrative(comparison,report){
  if(!comparison?.items?.length)return '';
  const {measure,unit}=parameterParts(report),high=extreme(comparison.items,'high'),low=extreme(comparison.items,'low');
  if(!high||!low)return '';
  if(comparison.method==='none'){
    return `Secara deskriptif, ${comparisonSubject(comparison,report,high)} menghasilkan rata-rata ${measure} tertinggi yaitu ${valueText(high.mean,unit)}, sedangkan rata-rata ${measure} terendah ditemukan pada ${comparisonSubject(comparison,report,low)} yaitu ${valueText(low.mean,unit)}. Karena pengaruh yang relevan tidak nyata atau uji lanjut tidak dipilih, perbedaan rataan tersebut tidak dinyatakan sebagai perbedaan nyata.`;
  }
  const method=comparison.method.toUpperCase(),level=fmt((report.alpha??.05)*100,0);
  return `Berdasarkan hasil uji lanjut ${method} ${level}%, ${comparisonSubject(comparison,report,high)} menghasilkan rata-rata ${measure} tertinggi yaitu ${valueText(high.mean,unit)}${relationClause(high,comparison)}. Sementara itu, rata-rata ${measure} terendah ditemukan pada ${comparisonSubject(comparison,report,low)} yaitu ${valueText(low.mean,unit)}.`;
}

function factorialAnovaNarrative(report,alpha){
  const aName=metadataFactor(report,'a',readableFactor(report.factorLabels?.a,'Faktor A')),bName=metadataFactor(report,'b',readableFactor(report.factorLabels?.b,'Faktor B'));
  const interaction=termBy(report,[/^A\s*×\s*B$/i,/interaksi.*A.*B/i]);
  const aTerm=termBy(report,[/^Faktor A$/i,/Petak Utama \(A\)/i]);
  const bTerm=termBy(report,[/^Faktor B$/i,/Anak Petak \(B\)/i]);
  if(!interaction)return '';
  if(significant(interaction,alpha)){
    return `Sidik ragam menunjukkan bahwa pengaruh interaksi antara ${aName} dan ${bName} ${statusText(interaction,alpha)} terhadap ${parameterLongName(report.name)}.`;
  }
  const parts=[`pengaruh interaksi antara ${aName} dan ${bName} ${statusText(interaction,alpha)}`];
  if(aTerm)parts.push(`pengaruh tunggal ${aName} ${statusText(aTerm,alpha)}`);
  if(bTerm)parts.push(`pengaruh tunggal ${bName} ${statusText(bTerm,alpha)}`);
  return `Sidik ragam menunjukkan bahwa ${parts.join(', ')} terhadap ${parameterLongName(report.name)}.`;
}
function oneFactorAnovaNarrative(report,alpha){
  const treatment=termBy(report,[/^Perlakuan$/i]);
  if(!treatment)return '';
  const factor=metadataFactor(report,'a',readableFactor(report.factorLabels?.a,'perlakuan'));
  return `Sidik ragam menunjukkan bahwa ${factor} ${statusText(treatment,alpha)} terhadap ${parameterLongName(report.name)}.`;
}

export function interpretReport(report){
  const alpha=report.alpha??.05,paragraphs=[],multi=['fral','frak','split'].includes(report.design);
  const anovaText=multi?factorialAnovaNarrative(report,alpha):oneFactorAnovaNarrative(report,alpha);
  if(anovaText)paragraphs.push(anovaText);

  const interaction=multi?termBy(report,[/^A\s*×\s*B$/i,/interaksi.*A.*B/i]):null;
  const interactionSignificant=significant(interaction,alpha);
  const comparisons=(report.comparisons||[]).filter(comparison=>{
    if(!comparison.items?.length)return false;
    if(interactionSignificant)return comparison.layout==='factorial-interaction'||/interaksi/i.test(comparison.title);
    return true;
  });
  for(const comparison of comparisons){
    const text=comparisonNarrative(comparison,report);
    if(text)paragraphs.push(text);
  }

  if(report.interactionPosthoc?.cells?.length){
    const {measure,unit}=parameterParts(report),cells=report.interactionPosthoc.cells,high=extreme(cells,'high'),low=extreme(cells,'low'),method=String(report.interactionPosthoc.method||report.posthoc||'').toUpperCase();
    if(high&&low){
      const prefix=method&&method!=='NONE'?`Berdasarkan hasil uji lanjut ${method} ${fmt(alpha*100,0)}%, `:'Secara deskriptif, ';
      paragraphs.push(`${prefix}${comparisonSubject({layout:'factorial-interaction',title:'Interaksi'},report,high)} menghasilkan rata-rata ${measure} tertinggi yaitu ${valueText(high.mean,unit)}, sedangkan rata-rata ${measure} terendah ditemukan pada ${comparisonSubject({layout:'factorial-interaction',title:'Interaksi'},report,low)} yaitu ${valueText(low.mean,unit)}. Pada RPT, keputusan berbeda nyata tetap mengikuti arah perbandingan baris dan kolom pada tabel uji lanjut.`);
    }
  }

  if(!paragraphs.length)paragraphs.push(`Hasil analisis ${parameterLongName(report.name)} belum memiliki informasi inferensial yang cukup untuk disusun menjadi interpretasi hasil.`);
  return paragraphs;
}

export function analysisSummaryRows(reports){
  return (reports||[]).map(report=>{
    const tested=(report.terms||[]).filter(t=>Number.isFinite(t.p)&&!['Ulangan','Kelompok'].includes(t.label));
    const significantTerms=tested.filter(t=>t.p<.05).map(t=>t.label);
    const minP=tested.length?Math.min(...tested.map(t=>t.p)):null;
    const posthoc=(report.comparisons||[]).map(c=>c.method).filter(m=>m&&m!=='none');
    return {
      key:String(report.name||''),
      parameter:parameterLongName(report.name),
      n:report.N,
      mean:report.grand,
      cv:report.cv,
      minP,
      significance:significanceSymbol(minP),
      significant:significantTerms.join(', ')||'—',
      posthoc:[...new Set(posthoc)].map(x=>x.toUpperCase()).join(', ')||'—'
    };
  });
}

export function renderAnalysisSummary(reports){
  const rows=analysisSummaryRows(reports);
  if(!rows.length)return '';
  const body=rows.map(row=>`<tr><td><button type="button" class="summary-parameter-link" data-summary-parameter="${html(row.key)}">${html(row.parameter)}</button></td><td data-number="${row.n}">${row.n}</td><td data-number="${row.mean}">${fmt(row.mean,2)}</td><td data-number="${row.cv}">${fmt(row.cv,2)}%</td><td class="summary-significance"><b>${row.significance}</b></td><td>${html(row.significant)}</td><td>${html(row.posthoc)}</td></tr>`).join('');
  return `<section class="analysis-summary" data-analysis-summary><div class="summary-head"><div><b>Ringkasan semua parameter</b><small>${rows.length} parameter dianalisis</small></div></div><div class="table-scroll"><table class="result-table summary-table"><thead><tr><th>Parameter</th><th>N</th><th>Rataan</th><th>KK</th><th>Ket.</th><th>Sumber nyata</th><th>Uji lanjut</th></tr></thead><tbody>${body}</tbody></table></div><div class="analysis-note">tn = tidak nyata; * = nyata pada taraf 5%; ** = sangat nyata pada taraf 1%.</div></section>`;
}
