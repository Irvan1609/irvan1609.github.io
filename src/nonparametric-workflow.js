import {readDataset,openTool} from './data-tools.js';
import {parseNumber,formatNumber as fmt} from './number-format.js';
import {kruskalWallis,friedman} from './nonparametric-engine.js';
import {esc} from './scientific-report.js';
import {resultActions} from './result-export.js';

const $=s=>document.querySelector(s);
const numeric=(data,i)=>{const vals=data.rows.map(r=>String(r[i]??'').trim()).filter(Boolean);return vals.length>0&&vals.length===data.rows.filter(r=>r.some(v=>String(v??'').trim())).length&&vals.every(v=>Number.isFinite(parseNumber(v)));};
const options=(data,filter=()=>true)=>data.headers.map((h,i)=>filter(i)?`<option value="${i}">${esc(h)}</option>`:'').join('');
const cell=v=>typeof v==='number'&&Number.isFinite(v)?`<td data-number="${v}">${fmt(v,5)}</td>`:`<td>${v===null||v===undefined?'—':esc(v)}</td>`;
const table=(heads,rows)=>`<div class="table-scroll"><table class="result-table"><thead><tr>${heads.map(h=>`<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr>${r.map(cell).join('')}</tr>`).join('')}</tbody></table></div>`;
function auto(data,patterns,numericOnly=false,exclude=[]){for(const re of patterns){const i=data.headers.findIndex((h,j)=>!exclude.includes(j)&&re.test(String(h))&&(!numericOnly||numeric(data,j)));if(i>=0)return i;}return data.headers.findIndex((_,j)=>!exclude.includes(j)&&(!numericOnly||numeric(data,j)));}

export function openNonparametric(){
  const data=readDataset();if(!data.headers.length)return openTool('Analisis Nonparametrik','<p>Dataset belum memiliki kolom.</p>');
  openTool('Analisis Nonparametrik',`<div class="form-grid"><label>Metode<select id="npMethod"><option value="kruskal">Kruskal–Wallis — kelompok independen</option><option value="friedman">Friedman — berblok / berpasangan</option></select></label><label>Perlakuan<select id="npTreatment">${options(data)}</select></label><label id="npBlockField">Blok / Subjek<select id="npBlock">${options(data)}</select></label><label>Parameter Y<select id="npY">${options(data,i=>numeric(data,i))}</select></label><label>Taraf nyata<select id="npAlpha"><option value="0.05">0.05 (5%)</option><option value="0.01">0.01 (1%)</option></select></label></div><label class="ral-check"><input type="checkbox" id="npPosthoc" checked> Tampilkan post-hoc bila uji keseluruhan nyata</label><p class="form-help">Kruskal–Wallis menggunakan post-hoc Dunn + Holm. Friedman menggunakan perbandingan mean-rank berpasangan + Holm. Analisis ini cocok untuk data ordinal/skor atau data yang tidak memenuhi asumsi parametrik.</p><p id="npError" role="alert"></p><button id="runNonparametric" class="primary">Jalankan analisis</button><div id="npResult" data-all-results></div>`);
  const ti=auto(data,[/perlakuan/i,/treatment/i,/genotip/i,/variet/i]),bi=auto(data,[/kelompok/i,/blok/i,/block/i,/subjek/i,/subject/i,/ulangan/i],false,[ti]),yi=auto(data,[/produksi/i,/hasil/i,/yield/i,/respons/i,/skor/i],true,[ti,bi]);
  if(ti>=0)$('#npTreatment').value=String(ti);if(bi>=0)$('#npBlock').value=String(bi);if(yi>=0&&[...$('#npY').options].some(o=>o.value===String(yi)))$('#npY').value=String(yi);
  function sync(){const f=$('#npMethod').value==='friedman';$('#npBlockField').hidden=!f;$('#npError').textContent='';$('#npResult').innerHTML='';}$('#npMethod').onchange=sync;sync();
  $('#runNonparametric').onclick=()=>{try{
    const method=$('#npMethod').value,t=Number($('#npTreatment').value),b=Number($('#npBlock').value),y=Number($('#npY').value),alpha=Number($('#npAlpha').value);if([t,y].some(Number.isNaN)||t===y)throw Error('Perlakuan dan parameter Y harus berbeda.');if(method==='friedman'&&(Number.isNaN(b)||new Set([t,b,y]).size<3))throw Error('Perlakuan, blok/subjek, dan Y harus menggunakan kolom berbeda.');
    const rows=[];data.rows.forEach((row,i)=>{if(row.every(v=>String(v??'').trim()===''))return;const yy=parseNumber(row[y]);if(!Number.isFinite(yy))throw Error(`Baris ${i+1}: nilai ${data.headers[y]} harus numerik dan tidak boleh kosong.`);const treatment=String(row[t]??'').trim();if(!treatment)throw Error(`Baris ${i+1}: perlakuan kosong.`);if(method==='friedman'){const block=String(row[b]??'').trim();if(!block)throw Error(`Baris ${i+1}: blok/subjek kosong.`);rows.push([treatment,block,yy]);}else rows.push([treatment,yy]);});
    const result=method==='friedman'?friedman(rows):kruskalWallis(rows),stat=method==='friedman'?result.Q:result.H,significant=result.p<alpha,posthoc=$('#npPosthoc').checked&&significant;
    let html=`<section class="analysis-result" data-export-scope><h3>${esc(result.test)} — ${esc(data.headers[y])}</h3>${resultActions('nonparametric')}<div class="analysis-lead">N = ${result.N}; α = ${fmt(alpha,2)}; statistik = ${fmt(stat,4)}; db = ${result.df}; p = ${result.p<.001?'&lt;0.001':fmt(result.p,5)}; ${esc(result.effect.name)} = ${fmt(result.effect.value,4)}.</div>${table(['Perlakuan','n','Median','Rataan','Mean rank'],result.summaries.map(s=>[s.group,s.n,s.median,s.mean,s.meanRank]))}`;
    html+=`<div class="analysis-note">${significant?'Terdapat perbedaan yang terdeteksi pada taraf nyata yang dipilih.':'Belum terdapat bukti perbedaan pada taraf nyata yang dipilih.'} Koreksi ikatan (ties) = ${fmt(result.tieCorrection,5)}.</div>`;
    if(posthoc)html+=`<div class="table-caption">Post-hoc — ${esc(result.posthoc)}</div>${table(['Perbandingan','Selisih mean rank','z','p','p Holm','Ket.'],result.pairs.map(p=>[`${p.a} vs ${p.b}`,p.difference,p.z,p.p,p.pHolm,p.pHolm<alpha?'*':'tn']))}<div class="analysis-note">Keputusan post-hoc memakai p yang telah dikoreksi Holm untuk mengendalikan family-wise error.</div>`;
    else if($('#npPosthoc').checked&&!significant)html+='<div class="analysis-note">Post-hoc tidak dijalankan karena uji keseluruhan tidak nyata.</div>';
    $('#npResult').innerHTML=html+'</section>';$('#npError').textContent='';
  }catch(e){$('#npError').textContent=e.message;$('#npResult').innerHTML='';}};
}
