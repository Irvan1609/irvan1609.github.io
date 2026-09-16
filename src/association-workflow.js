import {readDataset,openTool} from './data-tools.js';
import {parseNumber,formatNumber as fmt} from './number-format.js';
import {numericRows,correlation,pathAnalysis,correlationCritical} from './association-engine.js';
import {esc} from './scientific-report.js';
import {resultActions} from './result-export.js';
import {backupRawDataset} from './drive-backup.js';
const $=s=>document.querySelector(s);
const table=(heads,rows)=>`<div class="table-scroll"><table class="result-table"><thead><tr>${heads.map(h=>`<th scope="col">${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(row=>`<tr>${row.map(v=>typeof v==='number'?`<td data-number="${v}">${fmt(v,5)}</td>`:`<td>${esc(v??'—')}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
export function renderAssociation(result,names,kind,alpha){
  let html=`<section class="analysis-result" data-export-scope><h3>${kind==='path'?'Sidik lintas — satu respons':'Korelasi '+result.method}</h3>${resultActions(kind)}<div class="analysis-lead">N = ${result.n}; α = ${fmt(alpha,2)}. Urutan variabel mengikuti pilihan kolom.</div>`;
  const c=kind==='path'?result.corr:result;
  const pairs=new Map(c.pairs.map(p=>[`${p.i},${p.j}`,p]));
  html+=`<div class="table-caption">Matriks korelasi — segitiga atas</div><div class="table-scroll"><table class="result-table correlation-table"><thead><tr><th scope="row">n</th><th>=</th><th colspan="${Math.max(1,names.length-1)}">${c.n}</th></tr>${[.05,.01].map(a=>`<tr><th scope="row">${fmt(a,2)}</th><th>=</th><th colspan="${Math.max(1,names.length-1)}">${fmt(correlationCritical(c.n,a),4)}</th></tr>`).join('')}<tr><th></th>${names.map(n=>`<th scope="col">${esc(n)}</th>`).join('')}</tr></thead><tbody>${c.matrix.map((row,i)=>`<tr><th scope="row">${esc(names[i])}</th>${row.map((r,j)=>{if(j<i)return '<td></td>';if(j===i)return `<td data-number="1">${fmt(1,2)}</td>`;const p=pairs.get(`${i},${j}`).p,mark=p<.01?'**':p<.05?'*':'ns';return `<td>${fmt(r,2)}<sup>${mark}</sup></td>`;}).join('')}</tr>`).join('')}</tbody></table></div>`;
  html+='<div class="analysis-note">* = p &lt; 0.05; ** = p &lt; 0.01; ns = tidak nyata. Notasi memakai p dua sisi tanpa koreksi multipel dan dihitung sebelum pembulatan. Diagonal 1.00 adalah korelasi dengan diri sendiri, sehingga tidak diberi tanda signifikansi. Baris 0.05 dan 0.01 adalah r kritis berdasarkan N − 2 derajat bebas'+(c.method==='spearman'?' (pendekatan untuk Spearman).':'.')+'</div>';
  if(kind==='path'){
    html+=`<div class="analysis-note">Y = ${esc(names[0])}. R² = ${fmt(result.r2,5)}; R² terkoreksi = ${fmt(result.adjustedR2,5)}; koefisien residual = ${fmt(result.residual,5)}; db residual = ${result.df}.</div>`;
    html+='<div class="table-caption">Koefisien lintas terstandar (langsung), SE dan VIF</div>'+table(['X','Langsung','SE','t','p dua sisi','VIF'],result.effects.map((e,i)=>[names[i+1],e.direct,e.se,e.t,e.p,e.vif]));
    html+='<div class="table-caption">Dekomposisi korelasi X dengan Y</div>'+table(['X','Langsung',...names.slice(1).map(n=>'Melalui '+n),'Total = r(X,Y)'],result.effects.map((e,i)=>[names[i+1],e.direct,...e.indirect,e.total]));
    html+='<div class="analysis-note">Model satu Y dengan X yang saling berkorelasi. Koefisien langsung adalah regresi terstandar; komponen melalui Xj = r(Xi,Xj) × koefisien Xj. Komponen ini adalah dekomposisi korelasi, bukan bukti mediasi atau sebab-akibat. p koefisien belum dikoreksi multipel. Inferensi mengasumsikan residual independen, normal, dan homogen.</div>';
    if(result.effects.some(e=>e.vif>5))html+='<div class="analysis-note">Ada VIF > 5: prediktor saling berkorelasi kuat; koefisien dapat tidak stabil.</div>';
  }else{
    html+='<div class="table-caption">Uji korelasi dua sisi</div>'+table(['Variabel 1','Variabel 2','r','p mentah','p Holm','Ket. Holm'],c.pairs.map(p=>[names[p.i],names[p.j],p.r,p.p,p.holm,p.holm<alpha?'Nyata':'Tidak nyata']));
    html+=`<div class="analysis-note">${c.method==='spearman'?'Spearman memakai peringkat rata-rata untuk nilai sama. p memakai pendekatan t; sampel kecil memerlukan uji permutasi untuk inferensi yang lebih andal.':'Pearson mengukur hubungan linear; p mengasumsikan pasangan pengamatan independen dengan distribusi normal bivariat.'} Koreksi Holm berlaku untuk semua pasangan dalam matriks ini. Korelasi bukan bukti sebab-akibat.</div>`;
  }
  return html+'</section>';
}
export function openAssociation(kind){
  const data=readDataset(),path=kind==='path',options=data.headers.map((h,i)=>`<option value="${i}">${esc(h)}</option>`).join('');
  openTool(path?'Sidik lintas':'Korelasi',`<p>Satu baris = satu unit pengamatan independen. Pilih kolom numerik; data kosong harus dilengkapi. Data berulang/berkelompok tidak otomatis dikoreksi.</p><div id="associationFields">${path?`<label>Respons Y<select id="assocY"><option value="">Pilih Y</option>${options}</select></label>`:'<label>Metode<select id="assocMethod"><option value="pearson">Pearson</option><option value="spearman">Spearman</option></select></label>'}<fieldset><legend>${path?'Prediktor X':'Variabel'}</legend>${data.headers.map((h,i)=>`<label class="ral-check"><input type="checkbox" data-assoc-col value="${i}">${esc(h)}</label>`).join('')}</fieldset><label>Taraf nyata<select id="assocAlpha"><option value="0.05">0.05</option><option value="0.01">0.01</option></select></label></div><button id="runAssociation" class="primary">Jalankan analisis</button><p id="assocError" role="alert"></p><div id="assocResult"></div>`);
  $('#associationFields').onchange=()=>{$('#assocResult').innerHTML='';$('#assocError').textContent='';};
  $('#runAssociation').onclick=()=>{
    $('#assocResult').innerHTML='';$('#assocError').textContent='';
    try{const selected=[...document.querySelectorAll('[data-assoc-col]:checked')].map(x=>Number(x.value));if(path&&$('#assocY').value==='')throw Error('Pilih respons Y.');const columns=path?[Number($('#assocY').value),...selected]:selected;
      const rows=numericRows(data,columns,parseNumber),result=path?pathAnalysis(rows):correlation(rows,$('#assocMethod').value);
      $('#assocResult').innerHTML=renderAssociation(result,columns.map(i=>data.headers[i]),kind,Number($('#assocAlpha').value));
      $('#assocResult [data-export-scope]').dataset.datasetName=data.name;
      void backupRawDataset(data);
    }catch(e){$('#assocError').textContent=e.message;}
  };
  // Numeric measurements are preselected; experimental identifiers are excluded.
  document.querySelectorAll('[data-assoc-col]').forEach(input=>{const i=Number(input.value),values=data.rows.map(r=>r[i]).filter(v=>String(v??'').trim()!=='');input.checked=!path&&!/^(ulangan|kelompok|blok|block|rep|id|kode)$/i.test(data.headers[i])&&values.length>0&&values.every(v=>Number.isFinite(parseNumber(v)));});
  if(path)$('#assocY').addEventListener('change',()=>{document.querySelectorAll('[data-assoc-col]').forEach(input=>{input.disabled=input.value===$('#assocY').value;if(input.disabled)input.checked=false;});});
}
