import {readDataset,openTool} from './data-tools.js';
import {parseNumber,formatNumber as fmt} from './number-format.js';
import {stabilityIndices} from './stability-indices-engine.js';
import {esc} from './scientific-report.js';
import {resultActions} from './result-export.js';

const $=s=>document.querySelector(s);
const numeric=(data,i)=>{const v=data.rows.map(r=>String(r[i]??'').trim()).filter(Boolean);return v.length>0&&v.every(x=>Number.isFinite(parseNumber(x)));};
const options=data=>data.headers.map((h,i)=>`<option value="${i}">${esc(h)}</option>`).join('');
const cell=v=>typeof v==='number'&&Number.isFinite(v)?`<td data-number="${v}">${fmt(v,5)}</td>`:`<td>${v===null||v===undefined?'—':esc(v)}</td>`;
const table=(heads,rows)=>`<div class="table-scroll"><table class="result-table"><thead><tr>${heads.map(h=>`<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr>${r.map(cell).join('')}</tr>`).join('')}</tbody></table></div>`;
function auto(data,patterns,exclude=[]){for(const re of patterns){const i=data.headers.findIndex((h,j)=>!exclude.includes(j)&&re.test(String(h)));if(i>=0)return i;}return data.headers.findIndex((_,j)=>!exclude.includes(j));}
export function openStabilityIndices(){
  const data=readDataset();if(!data.headers.length)return openTool('Indeks Stabilitas','<p>Dataset belum memiliki kolom.</p>');
  openTool('Indeks Stabilitas Multilokasi',`<div class="form-grid"><label>Lingkungan / Lokasi<select id="siEnv">${options(data)}</select></label><label>Genotipe<select id="siGen">${options(data)}</select></label><label>Parameter Y<select id="siY">${data.headers.map((h,i)=>numeric(data,i)?`<option value="${i}">${esc(h)}</option>`:'').join('')}</select></label></div><p class="form-help">Setiap kombinasi Lingkungan × Genotipe harus memiliki data. Ulangan boleh lebih dari satu; analisis memakai rataan tiap sel.</p><p id="siError" role="alert"></p><button id="runStabilityIndices" class="primary">Hitung indeks stabilitas</button><div id="siResult" data-all-results></div>`);
  const e=auto(data,[/lingkungan/i,/lokasi/i,/environment/i]),g=auto(data,[/genotip/i,/variet/i,/perlakuan/i],[e]);let y=data.headers.findIndex((h,i)=>i!==e&&i!==g&&numeric(data,i)&&/produksi|hasil|yield/i.test(String(h)));if(y<0)y=data.headers.findIndex((_,i)=>i!==e&&i!==g&&numeric(data,i));if(e>=0)$('#siEnv').value=String(e);if(g>=0)$('#siGen').value=String(g);if(y>=0)$('#siY').value=String(y);
  $('#runStabilityIndices').onclick=()=>{try{
    const ei=Number($('#siEnv').value),gi=Number($('#siGen').value),yi=Number($('#siY').value);if(new Set([ei,gi,yi]).size<3)throw Error('Lingkungan, genotipe, dan parameter Y harus menggunakan kolom berbeda.');
    const rows=[];data.rows.forEach((row,i)=>{if(row.every(v=>String(v??'').trim()===''))return;const env=String(row[ei]??'').trim(),gen=String(row[gi]??'').trim(),yv=parseNumber(row[yi]);if(!env||!gen||!Number.isFinite(yv))throw Error(`Baris ${i+1}: lingkungan, genotipe, dan Y harus terisi valid.`);rows.push([env,gen,yv]);});
    const result=stabilityIndices(rows),sorted=[...result.indices].sort((a,b)=>a.ysi-b.ysi),html=`<section class="analysis-result" data-export-scope><h3>Indeks Stabilitas — ${esc(data.headers[yi])}</h3>${resultActions('stability-indices')}<div class="analysis-lead">${result.environments.length} lingkungan × ${result.genotypes.length} genotipe; N = ${result.n}; rataan umum = ${fmt(result.grand,4)}.</div><div class="table-caption">Indeks per genotipe</div>${table(['Genotipe','Rataan','CV lintas lingkungan (%)','Wricke Wi','Finlay–Wilkinson b','Deviasi regresi','R² regresi','IPCA1','IPCA2','ASV','Rank hasil','Rank ASV','YSI'],result.indices.map(x=>[x.genotype,x.mean,x.cv,x.wricke,x.finlaySlope,x.deviationMS,x.regressionR2,x.ipca1,x.ipca2,x.asv,x.yieldRank,x.asvRank,x.ysi]))}<div class="table-caption">Urutan YSI</div>${table(['Urutan','Genotipe','Rataan','ASV','YSI'],sorted.map((x,i)=>[i+1,x.genotype,x.mean,x.asv,x.ysi]))}${result.notes.map(n=>`<div class="analysis-note">${esc(n)}</div>`).join('')}<div class="analysis-note">YSI adalah indeks gabungan hasil dan stabilitas. Gunakan bersama rataan hasil, pola lingkungan, AMMI/GGE, dan tujuan pemuliaan; jangan menjadikan satu indeks sebagai satu-satunya dasar seleksi.</div></section>`;
    $('#siResult').innerHTML=html;$('#siError').textContent='';
  }catch(err){$('#siError').textContent=err.message;$('#siResult').innerHTML='';}};
}
