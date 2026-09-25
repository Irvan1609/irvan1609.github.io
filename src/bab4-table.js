import {formatNumber as fmt} from './number-format.js';
import {metadataFactor,describeLevel} from './treatment-metadata.js';
import {parameterLongName} from './parameter-metadata.js';

const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const mean=values=>values.reduce((a,b)=>a+b,0)/values.length;
const letters=item=>(item?.letters||[]).join('');
const valueCell=item=>item?`<span data-number="${item.mean}">${fmt(item.mean,2)}</span>${letters(item)?`<sup>${esc(letters(item))}</sup>`:''}`:'—';

function methodNote(report,comparisons){
  const methods=[...new Set((comparisons||[]).map(c=>c.method).filter(m=>m&&m!=='none'))];
  if(!methods.length)return 'Rataan tanpa huruf bersifat deskriptif karena uji lanjut tidak dijalankan atau pengaruh yang relevan tidak nyata.';
  const names=methods.map(x=>x.toUpperCase()).join('/');
  return `Angka yang diikuti huruf yang sama tidak berbeda nyata berdasarkan uji ${names} taraf ${fmt((report.alpha??.05)*100,0)}%. Huruf hanya dibandingkan pada kelompok perbandingan yang sama.`;
}
function metadataNote(report){
  const chunks=[];
  for(const axis of ['a','b']){
    const map=report?.treatmentMeta?.levels?.[axis]||{};
    const pairs=Object.entries(map).filter(([,description])=>String(description||'').trim()).map(([code,description])=>`${code} = ${description}`);
    if(pairs.length)chunks.push(pairs.join('; '));
  }
  return chunks.length?`Keterangan perlakuan: ${chunks.join('. ')}.`:'';
}
function measureName(report){
  const name=parameterLongName(report.name);
  return report.transform?.type&&report.transform.type!=='none'?`setelah transformasi ${name}`:name;
}
function factorialHtml(report){
  const A=report.factorA||[],B=report.factorB||[];
  if(!A.length||!B.length)return '';
  const interaction=(report.comparisons||[]).find(c=>c.layout==='factorial-interaction');
  const compA=(report.comparisons||[]).find(c=>/Faktor A|Petak Utama/i.test(c.title));
  const compB=(report.comparisons||[]).find(c=>/Faktor B|Anak Petak/i.test(c.title));
  const cellMap=new Map((interaction?.items||[]).map(item=>[[item.a,item.b].join('\u0000'),item]));
  const aMap=new Map((compA?.items||[]).map(item=>[item.label,item]));
  const bMap=new Map((compB?.items||[]).map(item=>[item.label,item]));
  const cell=(a,b)=>{
    const compared=cellMap.get([a,b].join('\u0000'));
    if(compared)return valueCell(compared);
    const source=(report.cells||[]).find(x=>x.a===a&&x.b===b);
    return source?`<span data-number="${source.mean}">${fmt(source.mean,2)}</span>`:'—';
  };
  const bRows=B.map(b=>{
    const rowCells=A.map(a=>`<td>${cell(a,b)}</td>`).join('');
    const source=bMap.get(b),fallback=mean((report.cells||[]).filter(x=>x.b===b).map(x=>x.mean));
    const marginal=source?valueCell(source):`<span data-number="${fallback}">${fmt(fallback,2)}</span>`;
    return `<tr><th scope="row">${esc(b)}</th>${rowCells}<td>${marginal}</td></tr>`;
  }).join('');
  const aRow=A.map(a=>{
    const source=aMap.get(a),fallback=mean((report.cells||[]).filter(x=>x.a===a).map(x=>x.mean));
    return `<td>${source?valueCell(source):`<span data-number="${fallback}">${fmt(fallback,2)}</span>`}</td>`;
  }).join('');
  const aName=metadataFactor(report,'a','Faktor A'),bName=metadataFactor(report,'b','Faktor B');
  const note=[methodNote(report,[interaction,compA,compB].filter(Boolean)),metadataNote(report)].filter(Boolean).join(' ');
  return `<section class="bab4-result" data-bab4-table><div class="publication-table-tools"><button type="button" data-result-action="copy-publication">Salin ke Word</button></div><div class="table-caption">Tabel hasil BAB IV. Rata-rata ${esc(measureName(report))} pada berbagai ${esc(aName)} dan ${esc(bName)}</div><div class="table-scroll"><table class="result-table bab4-table"><thead><tr><th>${esc(bName)} \\ ${esc(aName)}</th>${A.map(a=>`<th>${esc(a)}</th>`).join('')}<th>Rata-rata</th></tr></thead><tbody>${bRows}<tr><th scope="row">Rata-rata</th>${aRow}<td data-number="${report.grand}">${fmt(report.grand,2)}</td></tr></tbody></table></div><div class="analysis-note">${esc(note)}</div></section>`;
}
function oneFactorHtml(report){
  const comparison=(report.comparisons||[]).find(c=>c.title==='Perlakuan')||(report.comparisons||[])[0];
  if(!comparison?.items?.length)return '';
  const factor=metadataFactor(report,'a','Perlakuan');
  const rows=comparison.items.map(item=>`<tr><th scope="row">${esc(item.label)}</th><td>${valueCell(item)}</td><td>${esc(describeLevel(report,'a',item.label,{withCode:false})||'—')}</td></tr>`).join('');
  const note=[methodNote(report,[comparison]),metadataNote(report)].filter(Boolean).join(' ');
  return `<section class="bab4-result" data-bab4-table><div class="publication-table-tools"><button type="button" data-result-action="copy-publication">Salin ke Word</button></div><div class="table-caption">Tabel hasil BAB IV. Rata-rata ${esc(measureName(report))} pada berbagai ${esc(factor)}</div><div class="table-scroll"><table class="result-table bab4-table"><thead><tr><th>${esc(factor)}</th><th>Rata-rata</th><th>Keterangan perlakuan</th></tr></thead><tbody>${rows}</tbody></table></div><div class="analysis-note">${esc(note)}</div></section>`;
}
export function renderBab4Table(report){
  return ['fral','frak','split'].includes(report.design)?factorialHtml(report):oneFactorHtml(report);
}
