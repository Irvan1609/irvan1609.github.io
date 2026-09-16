import {readDataset,openTool} from './data-tools.js';
import {parseNumber,formatNumber as fmt} from './number-format.js';
import {descriptiveStatistics,polynomialRegression,pca,combinedAnova,geneticParameters} from './advanced-engine.js';
import {esc} from './scientific-report.js';
import {resultActions} from './result-export.js';
import {backupRawDataset} from './drive-backup.js';
const $=s=>document.querySelector(s);
const sig=t=>t.f===null?'':t.f>t.f01?'**':t.f>t.f05?'*':'tn';
const cell=v=>typeof v==='number'&&Number.isFinite(v)?`<td data-number="${v}">${fmt(v,5)}</td>`:`<td>${v===null||v===undefined?'—':v}</td>`;
const table=(heads,rows,cls='')=>`<div class="table-scroll"><table class="result-table ${cls}"><thead><tr>${heads.map(h=>`<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(row=>`<tr>${row.map(cell).join('')}</tr>`).join('')}</tbody></table></div>`;
const numeric=(data,i)=>{const v=data.rows.map(r=>String(r[i]??'').trim()).filter(Boolean);return v.length>0&&v.every(x=>Number.isFinite(parseNumber(x)));};
const selected=()=>[...document.querySelectorAll('[data-advanced-col]:checked')].map(x=>Number(x.value));
function numericRows(data,cols){if(!cols.length)throw Error('Pilih minimal satu kolom.');const out=[];data.rows.forEach((row,i)=>{if(row.every(v=>String(v??'').trim()===''))return;const values=cols.map(c=>parseNumber(row[c]));if(values.some(v=>!Number.isFinite(v)))throw Error(`Baris ${i+1}: semua kolom terpilih harus berisi angka.`);out.push(values);});return out;}
function optionList(data){return data.headers.map((h,i)=>`<option value="${i}">${esc(h)}</option>`).join('');}
function autoIndex(data,patterns,exclude=[]){const blocked=new Set(exclude);for(const p of patterns){const i=data.headers.findIndex((h,j)=>!blocked.has(j)&&p.test(String(h)));if(i>=0)return i;}return -1;}
function autoNumeric(data,patterns,exclude=[]){const i=autoIndex(data,patterns,exclude);if(i>=0&&numeric(data,i))return i;return data.headers.findIndex((_,j)=>!exclude.includes(j)&&numeric(data,j));}
function resultShell(title,body,key){return `<section class="analysis-result" data-export-scope><h3>${esc(title)}</h3>${resultActions(key)}${body}</section>`;}
function anovaTable(terms){return table(['SK','db','JK','KT','F. Hitung','F. Tabel 0.05','F. Tabel 0.01','Ket.'],terms.map(t=>[esc(t.label),t.df,t.ss,t.ms,t.f,t.f05,t.f01,sig(t)]));}
function degreeName(d){return ['','Linear','Kuadratik','Kubik'][d]||`Derajat ${d}`;}
function equation(model){return model.coefficients.map((c,i)=>`${i&&c.value>=0?'+ ':''}${fmt(c.value,6)}${i?`X${i>1?`^${i}`:''}`:''}`).join(' ');}

function renderDescriptive(result,names){
  const rows=result.map((s,i)=>[names[i],s.n,s.mean,s.median,s.min,s.q1,s.q3,s.max,s.sd,s.se,s.cv,s.skew,s.kurtosis]);
  return resultShell('Statistik Deskriptif',`<div class="analysis-note">Ringkasan dihitung dari seluruh baris lengkap pada variabel yang dipilih. CV = SD / |rataan| × 100%.</div>${table(['Variabel','n','Mean','Median','Min','Q1','Q3','Max','SD','SE','CV (%)','Skewness','Kurtosis'],rows)}`,'descriptive');
}
function renderRegression(result,xName,yName){
  const models=result.models.map(m=>[degreeName(m.degree),m.r2,m.adjustedR2,m.rmse,m.aic,m.f,m.p]);
  let html=`<div class="analysis-lead">Y = ${esc(yName)}; X = ${esc(xName)}; N = ${result.n}. Model terpilih otomatis berdasarkan AIC minimum: <b>${degreeName(result.bestDegree)}</b>.</div>${table(['Model','R²','R² terkoreksi','RMSE','AIC','F','p'],models)}`;
  for(const m of result.models){
    html+=`<div class="table-caption">${degreeName(m.degree)}: ${esc(equation(m))}</div>${table(['Koefisien','Estimasi','SE','t','p'],m.coefficients.map(c=>[c.degree===0?'Intersep':`X^${c.degree}`,c.value,c.se,c.t,c.p]))}`;
    if(m.stationary.length)html+=table(['Titik stasioner','X','Prediksi Y'],m.stationary.map(s=>[s.type,s.x,s.y]));
  }
  const best=result.models.find(m=>m.degree===result.bestDegree);html+=`<div class="analysis-note">Model ${degreeName(best.degree)} memiliki AIC terendah. Titik optimum/stasioner hanya dilaporkan bila berada di dalam rentang X yang diamati; ekstrapolasi tidak dilakukan.</div>`;
  return resultShell('Regresi respons dosis',html,'regression');
}
function renderPca(result,names){
  const eig=result.eigenvalues.map((v,i)=>[`PC${i+1}`,v,result.explained[i]*100,result.cumulative[i]*100]);
  const loads=names.map((name,i)=>[name,...result.loadings[i]]);
  const keep=result.eigenvalues.filter(v=>v>=1).length||Math.min(2,result.p);
  return resultShell('Principal Component Analysis (PCA)',`<div class="analysis-lead">N = ${result.n}; ${result.p} variabel. PCA menggunakan matriks korelasi setelah standardisasi z-score.</div>${table(['Komponen','Eigenvalue','Keragaman (%)','Kumulatif (%)'],eig)}<div class="analysis-note">Kriteria Kaiser (eigenvalue ≥ 1) mempertahankan ${keep} komponen. Gunakan juga proporsi keragaman kumulatif dan interpretasi biologis.</div><div class="table-caption">Loading komponen utama</div>${table(['Variabel',...result.eigenvalues.map((_,i)=>`PC${i+1}`)],loads)}<div class="table-caption">Skor individu (10 baris pertama)</div>${table(['Baris',...result.eigenvalues.map((_,i)=>`PC${i+1}`)],result.scores.slice(0,10).map((r,i)=>[i+1,...r]))}`,'pca');
}
function renderCombined(result,yName){
  return resultShell('ANOVA Gabungan Lokasi',`<div class="analysis-lead">Parameter: ${esc(yName)}; ${result.locations.length} lokasi; ${result.treatments.length} perlakuan/genotipe; ${result.blocks.length} kelompok per lokasi; N = ${result.n}; KK = ${fmt(result.cv,2)}%.</div>${anovaTable(result.terms)}<div class="analysis-note">Model seimbang RAK multilokasi. Lokasi diuji terhadap Kelompok(Lokasi); Perlakuan/Genotipe diuji terhadap Lokasi × Perlakuan; interaksi diuji terhadap Galat. Struktur ini sesuai interpretasi klasik ketika lingkungan/lokasi diperlakukan sebagai sampel lingkungan untuk mengevaluasi konsistensi genotipe.</div><div class="table-caption">Rataan perlakuan/genotipe lintas lokasi</div>${table(['Perlakuan/Genotipe','Rataan'],result.means.map(x=>[x.label,x.mean]))}`,'combined');
}
function renderGenetic(result,yName){const c=result.components;
  return resultShell('Parameter Genetik',`<div class="analysis-lead">Parameter: ${esc(yName)}; ${result.genotypes.length} genotipe; ${result.blocks.length} kelompok; N = ${result.n}; rataan = ${fmt(result.grand,3)}.</div>${anovaTable(result.terms)}<div class="table-caption">Komponen ragam dan parameter genetik</div>${table(['Parameter','Nilai','Kriteria'],[['Ragam genotipe (σ²g)',c.vg,''],['Ragam lingkungan (σ²e)',c.ve,''],['Ragam fenotipe rataan (σ²p)',c.vp,''],['Heritabilitas arti luas (H², %)',c.h2Percent,c.hClass],['KKG / GCV (%)',c.gcv,c.gcvClass],['KKP / PCV (%)',c.pcv,c.pcvClass],['Kemajuan genetik (GA, seleksi 5%)',c.ga,''],['Kemajuan genetik relatif (GAM, %)',c.gam,'']])}<div class="analysis-note">H² dihitung pada basis rataan genotipe: σ²p = σ²g + σ²e/r. Kemajuan genetik memakai intensitas seleksi 5% k = ${fmt(c.selectionIntensity,2)}. Klasifikasi H²: &lt;20% rendah, 20–50% sedang, &gt;50% tinggi; KKG/KKP: &lt;10% sempit, 10–20% sedang, &gt;20% luas.</div><div class="table-caption">Rataan genotipe</div>${table(['Genotipe','Rataan'],result.means.map(x=>[x.label,x.mean]))}`,'genetic');}

export function openAdvanced(kind){
  const data=readDataset(),opts=optionList(data),checks=data.headers.map((h,i)=>`<label class="ral-check"><input type="checkbox" data-advanced-col value="${i}">${esc(h)}</label>`).join('');
  let title='',form='';
  if(kind==='descriptive'){title='Statistik Deskriptif';form=`<p>Pilih variabel numerik. Semua kolom numerik dicentang otomatis.</p><fieldset><legend>Variabel</legend>${checks}</fieldset>`;}
  if(kind==='regression'){title='Regresi';form=`<p>Regresi polinomial linear–kubik untuk respons dosis. Model terbaik ditandai berdasarkan AIC.</p><div class="form-grid"><label>X / dosis<select id="advX"><option value="">Pilih X</option>${opts}</select></label><label>Y / respons<select id="advY"><option value="">Pilih Y</option>${opts}</select></label><label>Derajat maksimum<select id="advDegree"><option value="1">Linear</option><option value="2">Kuadratik</option><option value="3" selected>Kubik</option></select></label></div>`;}
  if(kind==='pca'){title='PCA';form=`<p>Pilih minimal dua variabel numerik. Kolom numerik dicentang otomatis; identitas perlakuan/ulangan tidak dipilih.</p><fieldset><legend>Variabel PCA</legend>${checks}</fieldset>`;}
  if(kind==='combined'){title='ANOVA Gabungan';form=`<p>Format saat ini: RAK seimbang di ≥2 lokasi dengan kelompok yang sama pada setiap lokasi.</p><div class="form-grid"><label>Lokasi<select id="advLocation"><option value="">Pilih lokasi</option>${opts}</select></label><label>Perlakuan / Genotipe<select id="advTreatment"><option value="">Pilih perlakuan</option>${opts}</select></label><label>Kelompok<select id="advBlock"><option value="">Pilih kelompok</option>${opts}</select></label><label>Parameter Y<select id="advY"><option value="">Pilih Y</option>${opts}</select></label></div>`;}
  if(kind==='genetic'){title='Parameter Genetik';form=`<p>Estimasi ragam genotipe, lingkungan, fenotipe, H², KKG, KKP, dan kemajuan genetik dari RAK seimbang.</p><div class="form-grid"><label>Genotipe<select id="advTreatment"><option value="">Pilih genotipe</option>${opts}</select></label><label>Kelompok / Ulangan<select id="advBlock"><option value="">Pilih kelompok</option>${opts}</select></label><label>Parameter Y<select id="advY"><option value="">Pilih Y</option>${opts}</select></label></div>`;}
  openTool(title,`${form}<button id="runAdvanced" class="primary">Jalankan analisis</button><p id="advancedError" role="alert"></p><div id="advancedResult"></div>`);
  if(['descriptive','pca'].includes(kind))document.querySelectorAll('[data-advanced-col]').forEach(input=>{const i=Number(input.value);input.checked=numeric(data,i)&&!/^(ulangan|kelompok|blok|block|rep|id|kode|perlakuan|treatment|genotip|genotype)$/i.test(data.headers[i]);});
  if(kind==='regression'){
    const y=autoNumeric(data,[/produksi/i,/produktivitas/i,/hasil/i,/yield/i]);if(y>=0)$('#advY').value=String(y);const x=autoNumeric(data,[/dosis/i,/dose/i,/nitrogen/i,/^n$/i],[y]);if(x>=0)$('#advX').value=String(x);
  }
  if(kind==='combined'){
    const l=autoIndex(data,[/lokasi/i,/location/i,/environment/i,/lingkungan/i]),t=autoIndex(data,[/genotip/i,/varietas/i,/perlakuan/i,/treatment/i]),b=autoIndex(data,[/kelompok/i,/blok/i,/block/i,/ulangan/i]);if(l>=0)$('#advLocation').value=l;if(t>=0)$('#advTreatment').value=t;if(b>=0)$('#advBlock').value=b;const y=autoNumeric(data,[/produksi/i,/produktivitas/i,/hasil/i,/yield/i],[l,t,b]);if(y>=0)$('#advY').value=y;
  }
  if(kind==='genetic'){
    const t=autoIndex(data,[/genotip/i,/varietas/i,/perlakuan/i]),b=autoIndex(data,[/kelompok/i,/blok/i,/block/i,/ulangan/i]);if(t>=0)$('#advTreatment').value=t;if(b>=0)$('#advBlock').value=b;const y=autoNumeric(data,[/produksi/i,/produktivitas/i,/hasil/i,/yield/i],[t,b]);if(y>=0)$('#advY').value=y;
  }
  $('#runAdvanced').onclick=()=>{try{
    let html='';
    if(kind==='descriptive'){const cols=selected();if(cols.length<1)throw Error('Pilih minimal satu variabel numerik.');html=renderDescriptive(descriptiveStatistics(numericRows(data,cols)),cols.map(i=>data.headers[i]));}
    if(kind==='pca'){const cols=selected();if(cols.length<2)throw Error('PCA memerlukan minimal dua variabel.');html=renderPca(pca(numericRows(data,cols)),cols.map(i=>data.headers[i]));}
    if(kind==='regression'){const x=Number($('#advX').value),y=Number($('#advY').value);if(!Number.isInteger(x)||!Number.isInteger(y)||x===y)throw Error('Pilih X dan Y yang berbeda.');html=renderRegression(polynomialRegression(numericRows(data,[x,y]),Number($('#advDegree').value)),data.headers[x],data.headers[y]);}
    if(kind==='combined'){const l=Number($('#advLocation').value),t=Number($('#advTreatment').value),b=Number($('#advBlock').value),y=Number($('#advY').value);if(new Set([l,t,b,y]).size!==4||[l,t,b,y].some(i=>!Number.isInteger(i)))throw Error('Pilih empat kolom yang berbeda.');const rows=data.rows.filter(r=>!r.every(v=>String(v??'').trim()==='')).map((r,i)=>{const value=parseNumber(r[y]);if(!Number.isFinite(value))throw Error(`Baris ${i+1}: parameter Y harus angka.`);return [String(r[l]).trim(),String(r[t]).trim(),String(r[b]).trim(),value];});html=renderCombined(combinedAnova(rows),data.headers[y]);}
    if(kind==='genetic'){const t=Number($('#advTreatment').value),b=Number($('#advBlock').value),y=Number($('#advY').value);if(new Set([t,b,y]).size!==3||[t,b,y].some(i=>!Number.isInteger(i)))throw Error('Pilih Genotipe, Kelompok, dan Y yang berbeda.');const rows=data.rows.filter(r=>!r.every(v=>String(v??'').trim()==='')).map((r,i)=>{const value=parseNumber(r[y]);if(!Number.isFinite(value))throw Error(`Baris ${i+1}: parameter Y harus angka.`);return [String(r[t]).trim(),String(r[b]).trim(),value];});html=renderGenetic(geneticParameters(rows),data.headers[y]);}
    $('#advancedResult').innerHTML=html;$('#advancedError').textContent='';void backupRawDataset(data);
  }catch(e){$('#advancedResult').innerHTML='';$('#advancedError').textContent=e.message;}};
}
