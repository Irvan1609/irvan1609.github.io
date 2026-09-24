
import {formatNumber as fmt} from './number-format.js';

const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function table(headers,rows){
  return `<div class="table-scroll"><table class="result-table diagnostic-table"><thead><tr>${headers.map(h=>`<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(row=>`<tr>${row.map((cell,i)=>i===0?`<td>${esc(cell)}</td>`:`<td>${typeof cell==='number'&&Number.isFinite(cell)?fmt(cell,4):esc(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}
export function residualHistogram(values,title='Histogram residual'){
  const x=values.filter(Number.isFinite);
  if(x.length<3)return '';
  const min=Math.min(...x),max=Math.max(...x),bins=Math.max(4,Math.min(12,Math.ceil(Math.sqrt(x.length)))),span=max-min||1,width=650,height=300,left=55,bottom=250,plotW=540,plotH=190;
  const counts=Array(bins).fill(0);
  for(const value of x){
    const index=Math.min(bins-1,Math.floor((value-min)/span*bins));
    counts[index]++;
  }
  const maxCount=Math.max(...counts,1),barW=plotW/bins;
  const bars=counts.map((count,i)=>{
    const h=count/maxCount*plotH,x0=left+i*barW+2,y=bottom-h;
    return `<rect x="${x0}" y="${y}" width="${Math.max(1,barW-4)}" height="${h}" fill="#557aa6"/><text x="${x0+barW/2-2}" y="${Math.max(18,y-4)}" font-size="10" text-anchor="middle">${count}</text>`;
  }).join('');
  return `<div class="scientific-chart diagnostic-histogram"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(title)}"><rect width="100%" height="100%" fill="white"/><g font-family="Arial,sans-serif" font-size="11"><text x="25" y="20" font-size="15" font-weight="bold">${esc(title)}</text><path d="M${left},40V${bottom}H${left+plotW}" stroke="#555" fill="none"/>${bars}<text x="${left}" y="272">${esc(fmt(min,2))}</text><text x="${left+plotW}" y="272" text-anchor="end">${esc(fmt(max,2))}</text><text x="${left+plotW/2}" y="292" text-anchor="middle">Residual</text></g></svg><button data-chart-download>Unduh grafik SVG</button></div>`;
}
export function renderInfluenceDiagnostics(diagnostics){
  if(!diagnostics)return '';
  if(!diagnostics.items?.length)return `<div class="analysis-note">${esc(diagnostics.note||'Diagnostik pengaruh tidak tersedia.')}</div>`;
  const flagged=diagnostics.items.filter(item=>item.flag),ranked=[...diagnostics.items].sort((a,b)=>b.cook-a.cook||Math.abs(b.studentized)-Math.abs(a.studentized)).slice(0,Math.min(12,diagnostics.items.length));
  const rows=ranked.map(item=>[item.unit,item.residual,item.studentized,item.leverage,item.cook,item.flag?'Periksa':'']);
  return `<div class="diagnostic-influence"><div class="analysis-note"><b>Diagnostik unit berpengaruh:</b> ambang penanda |studentized residual| &gt; 2 atau Cook's distance &gt; ${fmt(diagnostics.cookThreshold,4)} (4/n). ${flagged.length} unit ditandai. ${esc(diagnostics.note||'')}</div>${table(['Unit','Residual','Studentized','Leverage',"Cook's D",'Status'],rows)}</div>`;
}
