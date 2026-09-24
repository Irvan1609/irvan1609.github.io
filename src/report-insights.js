import {formatNumber as fmt} from './number-format.js';

const html=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const significant=(term,alpha)=>Number.isFinite(term?.p)&&term.p<alpha;
const mark=p=>p<.01?'sangat nyata':p<.05?'nyata':'tidak nyata';

function lettersOverlap(a,b){
  const left=a?.letters||[],right=b?.letters||[];
  return left.some(letter=>right.includes(letter));
}
function extreme(items,mode='high'){
  if(!items?.length)return null;
  return items.reduce((best,item)=>mode==='high'?(item.mean>best.mean?item:best):(item.mean<best.mean?item:best));
}
function comparisonSentence(comparison,alpha){
  if(!comparison?.items?.length)return '';
  const high=extreme(comparison.items,'high'),low=extreme(comparison.items,'low');
  if(!high||!low)return '';
  const method=comparison.method==='none'?null:comparison.method.toUpperCase();
  if(!method)return `Pada ${comparison.title}, rataan tertinggi terdapat pada ${high.label} (${fmt(high.mean,2)}), sedangkan rataan terendah terdapat pada ${low.label} (${fmt(low.mean,2)}). Perbandingan ini bersifat deskriptif karena uji lanjut tidak dijalankan.`;
  const same=lettersOverlap(high,low);
  return `Pada ${comparison.title}, rataan tertinggi terdapat pada ${high.label} (${fmt(high.mean,2)}), sedangkan rataan terendah terdapat pada ${low.label} (${fmt(low.mean,2)}). Berdasarkan ${method} pada taraf ${fmt(alpha*100,0)}%, kedua rataan tersebut ${same?'tidak terdeteksi berbeda nyata':'berbeda nyata'}.`;
}

export function interpretReport(report){
  const alpha=report.alpha??.05,paragraphs=[];
  const tested=(report.terms||[]).filter(term=>Number.isFinite(term.f)&&Number.isFinite(term.p));
  const interaction=tested.find(term=>term.label==='A × B');
  if(interaction){
    paragraphs.push(`Hasil analisis ragam menunjukkan bahwa interaksi Faktor A × Faktor B ${mark(interaction.p)} terhadap ${report.name} (F = ${fmt(interaction.f,2)}; p ${interaction.p<.001?'< 0,001':'= '+fmt(interaction.p,4)}). ${significant(interaction,alpha)?'Karena interaksi nyata pada taraf yang dipilih, interpretasi rataan difokuskan pada kombinasi perlakuan atau pengaruh sederhana, bukan hanya pada pengaruh utama masing-masing faktor.':'Karena interaksi tidak nyata pada taraf yang dipilih, pengaruh utama Faktor A dan Faktor B dapat dibaca secara terpisah dengan tetap mempertimbangkan konteks biologis percobaan.'}`);
  }
  for(const term of tested.filter(term=>term.label!=='A × B'&&!['Ulangan','Kelompok'].includes(term.label))){
    if(interaction&&significant(interaction,alpha)&&['Faktor A','Faktor B'].includes(term.label))continue;
    paragraphs.push(`${term.label} ${mark(term.p)} terhadap ${report.name} (F = ${fmt(term.f,2)}; p ${term.p<.001?'< 0,001':'= '+fmt(term.p,4)}).`);
  }
  const useful=(report.comparisons||[]).filter(c=>c.items?.length&&(!interaction||!significant(interaction,alpha)||c.layout==='factorial-interaction'||/ pada A = /.test(c.title)||c.method!=='none'));
  for(const comparison of useful){
    const sentence=comparisonSentence(comparison,alpha);
    if(sentence)paragraphs.push(sentence);
  }
  if(report.interactionPosthoc?.cells?.length){
    const cells=report.interactionPosthoc.cells,high=extreme(cells,'high'),low=extreme(cells,'low');
    if(high&&low)paragraphs.push(`Pada kombinasi RPT, rataan tertinggi terdapat pada ${high.a} × ${high.b} (${fmt(high.mean,2)}), sedangkan rataan terendah terdapat pada ${low.a} × ${low.b} (${fmt(low.mean,2)}). Huruf uji lanjut harus dibaca sesuai arah perbandingan baris dan kolom yang ditampilkan pada tabel.`);
  }
  if(!paragraphs.length)paragraphs.push(`Analisis ${report.name} telah selesai. Tidak ada efek model yang dapat diinterpretasikan secara inferensial dari keluaran yang tersedia; gunakan rataan sebagai informasi deskriptif.`);
  return paragraphs;
}

export function analysisSummaryRows(reports){
  return (reports||[]).map(report=>{
    const tested=(report.terms||[]).filter(t=>Number.isFinite(t.p)&&!['Ulangan','Kelompok'].includes(t.label));
    const significantTerms=tested.filter(t=>t.p<(report.alpha??.05)).map(t=>t.label);
    const minP=tested.length?Math.min(...tested.map(t=>t.p)):null;
    const posthoc=(report.comparisons||[]).map(c=>c.method).filter(m=>m&&m!=='none');
    return {
      parameter:report.name,
      n:report.N,
      mean:report.grand,
      cv:report.cv,
      minP,
      significant:significantTerms.join(', ')||'Tidak ada',
      posthoc:[...new Set(posthoc)].map(x=>x.toUpperCase()).join(', ')||'—'
    };
  });
}

export function renderAnalysisSummary(reports){
  const rows=analysisSummaryRows(reports);
  if(!rows.length)return '';
  const body=rows.map(row=>`<tr><td>${html(row.parameter)}</td><td data-number="${row.n}">${row.n}</td><td data-number="${row.mean}">${fmt(row.mean,2)}</td><td data-number="${row.cv}">${fmt(row.cv,2)}%</td><td>${row.minP===null?'—':row.minP<.001?'&lt;0,001':fmt(row.minP,4)}</td><td>${html(row.significant)}</td><td>${html(row.posthoc)}</td></tr>`).join('');
  return `<section class="analysis-summary" data-analysis-summary><div class="summary-head"><div><b>Ringkasan semua parameter</b><small>${rows.length} parameter dianalisis</small></div></div><div class="table-scroll"><table class="result-table summary-table"><thead><tr><th>Parameter</th><th>N</th><th>Rataan</th><th>KK</th><th>p terkecil</th><th>Sumber keragaman nyata</th><th>Uji lanjut</th></tr></thead><tbody>${body}</tbody></table></div></section>`;
}
