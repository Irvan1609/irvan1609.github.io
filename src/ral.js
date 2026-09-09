import { parseNumber, formatNumber } from './number-format.js';
import { resultActions, installResultExport } from './result-export.js';
import { fCritical, effectLevel, isSignificantAt, cvPercent, descriptiveMeanChart } from './report-utils.js';
import jStat from 'jstat';

(() => {
  const $ = s => document.querySelector(s);
  const esc = v => String(v ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const safeFilename = value => String(value || 'hasil').replace(/[^a-z0-9._-]+/gi,'-');
  const numeric = parseNumber;
  const fmt = formatNumber;

  function dataset() {
    const headers = [...document.querySelectorAll('#gridWrap .data-grid thead th')].slice(1).map(x => x.textContent.trim());
    const rows = [...document.querySelectorAll('#gridWrap .data-grid tbody tr')].map(tr => [...tr.querySelectorAll('td')].slice(1).map(td => td.textContent));
    return { headers, rows };
  }

  function err(msg) {
    const box = $('#ralError');
    if (box) { box.hidden = false; box.textContent = '⚠ ' + msg; }
    const status = $('#status');
    if (status) status.textContent = '⚠ ' + msg;
  }

  function clearErr() {
    const box = $('#ralError');
    if (box) { box.hidden = true; box.textContent = ''; }
  }

  function label(k) {
    let s = '';
    do { s = String.fromCharCode(97 + k % 26) + s; k = Math.floor(k / 26) - 1; } while (k >= 0);
    return s;
  }

  function subset(a,b) { for (const v of a) if (!b.has(v)) return false; return true; }

  function cleanColumns(cols) {
    const unique = [];
    for (const c of cols) if (!unique.some(u => u.size === c.size && subset(c,u))) unique.push(c);
    return unique.filter((c,i) => !unique.some((d,j) => i !== j && c.size < d.size && subset(c,d)));
  }

  function compactLetters(means, significant) {
    const n = means.length;
    let cols = [new Set(Array.from({length:n},(_,i)=>i))];
    const pairs = [];
    for (let i=0;i<n;i++) for (let j=i+1;j<n;j++) if (significant[i][j]) pairs.push([i,j,Math.abs(means[i]-means[j])]);
    pairs.sort((a,b)=>b[2]-a[2]);
    for (const [i,j] of pairs) {
      const next = [];
      for (const col of cols) {
        if (col.has(i) && col.has(j)) {
          const left = new Set(col), right = new Set(col);
          left.delete(i); right.delete(j);
          if (left.size) next.push(left);
          if (right.size) next.push(right);
        } else next.push(col);
      }
      cols = cleanColumns(next);
    }
    cols.sort((a,b)=>Math.max(...[...b].map(i=>means[i]))-Math.max(...[...a].map(i=>means[i])));
    return means.map((_,i)=>cols.map((c,k)=>c.has(i)?label(k):'').join(''));
  }

  function shareLetter(a,b) {
    const set = new Set(String(a || '').split(''));
    return String(b || '').split('').some(x => set.has(x));
  }

  function ensureBnjOptions() {
    if ($('#ralBnjOptions')) return;
    const result = $('#ralResult');
    if (!result) return;
    const box = document.createElement('div');
    box.id = 'ralBnjOptions';
    box.className = 'analysis-note';
    box.style.cssText = 'margin:14px 0;padding:12px;display:grid;grid-template-columns:1fr 1fr;gap:12px;align-items:end';
    box.innerHTML = '<div><label for="ralAlpha" style="display:block;font-weight:700;margin-bottom:5px">Taraf nyata BNJ (α)</label><select id="ralAlpha"><option value="0.05">0.05 (5%)</option><option value="0.01">0.01 (1%)</option></select></div><div style="font-size:13px;color:#526171"><b>q tabel otomatis.</b> Nilai q dihitung dari α, jumlah perlakuan (k), dan db galat. Urutan hasil selalu mengikuti urutan perlakuan pada data.</div>';
    box.querySelector('select').addEventListener('change',()=>{ result.innerHTML = ''; });
    result.parentNode.insertBefore(box,result);
  }

  function populate() {
    const d = dataset(), list = $('#ralResponses'), sel = $('#ralTreatment');
    if (!list || !sel) return;
    list.innerHTML = ''; sel.innerHTML = '';
    if (!d.headers.length) {
      list.innerHTML = '<div style="padding:10px;color:#777">Tidak ada variabel. Masukkan data terlebih dahulu.</div>';
      return;
    }
    d.headers.forEach((h,i)=>{
      const item = document.createElement('label');
      item.className = 'ral-check';
      item.innerHTML = `<input type="checkbox" value="${i}"> <span>${esc(h)}</span>`;
      list.appendChild(item);
      const option = document.createElement('option');
      option.value = i; option.textContent = h; sel.appendChild(option);
    });
  }

  function open() {
    clearErr(); populate(); ensureBnjOptions();
    $('#ralResult').innerHTML = '';
    $('#ralModal').classList.add('open');
  }

  function close() { $('#ralModal').classList.remove('open'); }

  function analyze() {
    clearErr();
    $('#ralResult').innerHTML = '';
    const d = dataset();
    const selected = [...document.querySelectorAll('#ralResponses input:checked')].map(x=>Number(x.value));
    const ti = Number($('#ralTreatment').value);
    const alpha = Number($('#ralAlpha')?.value);
    if (!selected.length) return err('Pilih minimal satu peubah respons.');
    if (!Number.isInteger(ti)) return err('Pilih peubah perlakuan.');
    if (selected.includes(ti)) return err('Peubah perlakuan tidak boleh dipilih sebagai respons.');
    if (![0.05,0.01].includes(alpha)) return err('Pilih taraf nyata 0.05 atau 0.01.');
    if (d.rows.length < 2) return err('Dataset belum memiliki cukup observasi.');

    const treatments = [...new Set(d.rows.map(r=>String(r[ti]??'').trim()).filter(Boolean))];
    if (treatments.length < 2) return err('RAL memerlukan sedikitnya dua taraf perlakuan.');

    let html = '';
    let tableNo = 1;
    let figureNo = 1;

    for (const yi of selected) {
      const responseName = d.headers[yi] || 'Respons';
      const obs = [];
      for (const [rowIndex,r] of d.rows.entries()) {
        const t = String(r[ti]??'').trim();
        const y = numeric(r[yi]);
        if (t !== '' && !Number.isFinite(y)) return err(`Angka pada baris ${rowIndex+1}, kolom ${responseName} tidak valid atau kosong. Periksa Pengaturan angka.`);
        if (t !== '' && Number.isFinite(y)) obs.push({t,y});
      }
      const groups = treatments.map(t=>obs.filter(o=>o.t===t).map(o=>o.y));
      if (obs.length < 2 || groups.some(g=>!g.length)) {
        html += `<section class="ral-result-block analysis-result" data-export-scope><h3>${esc(responseName)}</h3>${resultActions(`RAL-${safeFilename(responseName)}`)}<div class="analysis-note">Data numerik tidak lengkap untuk semua taraf perlakuan.</div></section>`;
        continue;
      }

      const N = obs.length, a = groups.length;
      const grand = obs.reduce((s,o)=>s+o.y,0)/N;
      const meanValues = groups.map(g=>g.reduce((s,x)=>s+x,0)/g.length);
      const totals = groups.map(g=>g.reduce((s,x)=>s+x,0));
      const maxRep = Math.max(...groups.map(g=>g.length));
      const ssT = groups.reduce((s,g)=>s+g.length*(g.reduce((u,v)=>u+v,0)/g.length-grand)**2,0);
      const ssTot = obs.reduce((s,o)=>s+(o.y-grand)**2,0);
      const ssE = groups.reduce((sum,g,i)=>sum+g.reduce((subtotal,y)=>subtotal+(y-meanValues[i])**2,0),0);
      const dfT = a-1, dfE = N-a, msT = ssT/dfT, msE = ssE/dfE;
      const f = msE > 0 ? msT/msE : Infinity;

      if (dfE < 2 || !Number.isFinite(msE) || msE <= 0) {
        html += `<section class="ral-result-block analysis-result" data-export-scope><h3>${esc(responseName)}</h3>${resultActions(`RAL-${safeFilename(responseName)}`)}<div class="analysis-note">Analisis memerlukan db galat minimal 2 dan KT galat positif.</div></section>`;
        continue;
      }

      const f05 = fCritical(jStat,0.05,dfT,dfE);
      const f01 = fCritical(jStat,0.01,dfT,dfE);
      const selectedFCrit = alpha === 0.01 ? f01 : f05;
      const level = effectLevel(f,f05,f01);
      const significantSelected = isSignificantAt(f,selectedFCrit);
      const cv = cvPercent(msE,grand);

      const observationNo = tableNo++;
      const anovaNo = tableNo++;
      const repHeaders = Array.from({length:maxRep},(_,i)=>`<th>Ulangan ${i+1}</th>`).join('');
      const observationRows = treatments.map((t,i)=>`<tr><td>${esc(t)}</td>${Array.from({length:maxRep},(_,r)=>`<td>${groups[i][r] === undefined ? '' : fmt(groups[i][r],2)}</td>`).join('')}<td>${fmt(totals[i],2)}</td><td>${fmt(meanValues[i],2)}</td></tr>`).join('');
      const repTotals = Array.from({length:maxRep},(_,r)=>groups.reduce((sum,g)=>sum+(g[r] ?? 0),0));
      const grandTotal = totals.reduce((s,x)=>s+x,0);

      let section = `<section class="ral-result-block analysis-result" data-export-scope><h3>Hasil RAL — ${esc(responseName)}</h3>${resultActions(`RAL-${safeFilename(responseName)}`)}<div class="analysis-lead">Data pengamatan ${esc(responseName)} dan sidik ragam disajikan pada Tabel ${observationNo} dan Tabel ${anovaNo}.</div><div class="table-caption">Tabel ${observationNo}. Data Pengamatan ${esc(responseName)} pada Berbagai Perlakuan</div><table class="result-table observation-table"><thead><tr><th>Perlakuan</th>${repHeaders}<th>Total</th><th>Rata-Rata</th></tr></thead><tbody>${observationRows}<tr class="table-total"><td>Total</td>${repTotals.map(x=>`<td>${fmt(x,2)}</td>`).join('')}<td>${fmt(grandTotal,2)}</td><td>${fmt(grand,2)}</td></tr></tbody></table><div class="table-caption">Tabel ${anovaNo}. Sidik Ragam ${esc(responseName)} pada Berbagai Perlakuan</div><table class="result-table"><thead><tr><th>SK</th><th>db</th><th>JK</th><th>KT</th><th>F. Hitung</th><th>F. Tabel 0.05</th><th>F. Tabel 0.01</th></tr></thead><tbody><tr><td>Perlakuan</td><td>${dfT}</td><td>${fmt(ssT)}</td><td>${fmt(msT)}</td><td>${fmt(f)}</td><td>${fmt(f05)}</td><td>${fmt(f01)}</td></tr><tr><td>Galat</td><td>${dfE}</td><td>${fmt(ssE)}</td><td>${fmt(msE)}</td><td>—</td><td>—</td><td>—</td></tr><tr><td>Total</td><td>${N-1}</td><td>${fmt(ssTot)}</td><td>—</td><td>—</td><td>—</td><td>—</td></tr></tbody></table><div class="analysis-note"><b>Interpretasi:</b> F. Hitung perlakuan = ${fmt(f)}, F. Tabel 0.05 = ${fmt(f05)}, dan F. Tabel 0.01 = ${fmt(f01)}. Dengan demikian pengaruh perlakuan terhadap ${esc(responseName)} adalah <b>${level}</b>. KK = ${fmt(cv,2)}%.</div>`;

      if (significantSelected) {
        let q = NaN;
        try { q = jStat.tukey.inv(1-alpha,a,dfE); } catch {}
        if (!Number.isFinite(q) || q <= 0) return err(`q tabel tidak dapat dihitung untuk ${responseName}.`);
        const significant = Array.from({length:a},()=>Array(a).fill(false));
        for (let i=0;i<a;i++) for (let j=i+1;j<a;j++) {
          const sePair = Math.sqrt(msE/2*(1/groups[i].length+1/groups[j].length));
          significant[i][j] = significant[j][i] = Math.abs(meanValues[i]-meanValues[j]) > q*sePair;
        }
        const notations = compactLetters(meanValues,significant);
        const equalN = groups.every(g=>g.length===groups[0].length);
        const se = equalN ? Math.sqrt(msE/groups[0].length) : NaN;
        const hsd = equalN ? q*se : NaN;
        const meansNo = tableNo++;
        const meanRows = treatments.map((t,i)=>`<tr><td>${esc(t)}</td><td class="posthoc-value">${fmt(meanValues[i],2)}${notations[i]?`<sup>${esc(notations[i])}</sup>`:''}</td></tr>`).join('');
        const high = meanValues.indexOf(Math.max(...meanValues));
        const low = meanValues.indexOf(Math.min(...meanValues));
        const related = shareLetter(notations[high],notations[low]);
        section += `<div class="analysis-note"><b>BNJ ${alpha*100}%</b>: q tabel = ${fmt(q)} (k = ${a}, db galat = ${dfE})${equalN?`, SE = ${fmt(se)}, nilai BNJ = ${fmt(hsd)}`:', menggunakan Tukey–Kramer karena jumlah ulangan tidak sama'}. Huruf superscript yang sama menunjukkan tidak berbeda nyata.</div><div class="table-caption">Tabel ${meansNo}. Rata-Rata ${esc(responseName)} pada Berbagai Perlakuan</div><table class="result-table posthoc-table"><thead><tr><th>Perlakuan</th><th>${esc(responseName)}</th></tr></thead><tbody>${meanRows}</tbody></table><div class="analysis-note">Rata-rata tertinggi terdapat pada ${esc(treatments[high])} (${fmt(meanValues[high],2)}), sedangkan terendah pada ${esc(treatments[low])} (${fmt(meanValues[low],2)}). Kedua perlakuan tersebut ${related?'masih memiliki huruf yang sama sehingga tidak berbeda nyata':'tidak memiliki huruf yang sama sehingga berbeda nyata'} pada BNJ ${alpha*100}%. Urutan hasil mengikuti urutan perlakuan pada dataset.</div>`;
      } else {
        const high = meanValues.indexOf(Math.max(...meanValues));
        const low = meanValues.indexOf(Math.min(...meanValues));
        section += `<div class="analysis-note">Pada taraf α = ${fmt(alpha,2)}, F. Hitung tidak melebihi F. Tabel yang digunakan sehingga uji lanjut BNJ ${alpha*100}% tidak dilakukan. Rata-rata tertinggi (${esc(treatments[high])}: ${fmt(meanValues[high],2)}) dan terendah (${esc(treatments[low])}: ${fmt(meanValues[low],2)}) hanya bersifat deskriptif dan tidak menunjukkan perbedaan nyata.</div>${descriptiveMeanChart({labels:treatments,values:meanValues,responseName,figureNo:figureNo++,alpha,esc,fmt})}`;
      }

      section += '</section>';
      html += section;
    }

    $('#ralResult').innerHTML = html;
  }

  function bind() {
    installResultExport();
    [...document.querySelectorAll('[data-menu="Analyze"],[data-mobile="Analyze"]')].forEach(btn=>{
      const clone = btn.cloneNode(true);
      btn.replaceWith(clone);
      clone.addEventListener('click',e=>{ e.preventDefault(); open(); });
    });
    $('#closeRal')?.addEventListener('click',close);
    $('#closeRal2')?.addEventListener('click',close);
    $('#runRal')?.addEventListener('click',analyze);
    $('#ralModal')?.addEventListener('click',e=>{ if (e.target.id === 'ralModal') close(); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',()=>setTimeout(bind,50));
  else setTimeout(bind,50);
})();
