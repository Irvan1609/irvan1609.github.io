
import {interpretReport} from './report-insights.js';

const sig=(term,alpha)=>Number.isFinite(term?.p)&&term.p<alpha;
const term=(report,patterns)=>(report.terms||[]).find(item=>patterns.some(pattern=>pattern.test(String(item.label||''))));
const overlap=(a,b)=>(a?.letters||[]).some(letter=>(b?.letters||[]).includes(letter));

function issue(level,message,parameter){
  return {level,message,parameter};
}
function comparisonConsistency(report,comparison,issues){
  if(!comparison?.items?.length)return;
  if(comparison.method==='none'&&comparison.items.some(item=>item.letters?.length)){
    issues.push(issue('error','Huruf uji lanjut tersedia walaupun metode perbandingan berstatus tanpa uji lanjut.',report.name));
  }
  if(comparison.method!=='none'){
    if(!comparison.critical?.length)issues.push(issue('warn',`Uji ${comparison.method.toUpperCase()} aktif tetapi nilai kritis tidak tercatat.`,report.name));
    for(const pair of comparison.pairs||[]){
      const left=comparison.items[pair.i],right=comparison.items[pair.j],same=overlap(left,right);
      if(pair.significant&&same)issues.push(issue('error',`Superscript ${left.label} dan ${right.label} saling tumpang tindih padahal pasangan dinyatakan berbeda nyata.`,report.name));
      if(!pair.significant&&!same)issues.push(issue('error',`Superscript ${left.label} dan ${right.label} tidak berbagi huruf padahal pasangan dinyatakan tidak berbeda nyata.`,report.name));
    }
  }
}
function decisionRows(report){
  const alpha=report.alpha??.05,multi=['fral','frak','split'].includes(report.design),rows=[];
  if(!multi){
    const treatment=term(report,[/^Perlakuan$/i]);
    rows.push({
      source:'Perlakuan',
      status:sig(treatment,alpha)?(treatment.p<.01?'Sangat nyata':'Nyata'):'Tidak nyata',
      action:sig(treatment,alpha)?(report.posthoc==='none'?'Pengaruh nyata; uji lanjut tidak dipilih':`Lanjut ${report.posthoc.toUpperCase()}`):'Tanpa uji lanjut; baca rataan secara deskriptif'
    });
    return rows;
  }
  const interaction=term(report,[/^A\s*×\s*B$/i,/Interaksi.*A.*B/i]);
  const a=term(report,[/^Faktor A$/i,/Petak Utama \(A\)/i]);
  const b=term(report,[/^Faktor B$/i,/Anak Petak \(B\)/i]);
  const intSig=sig(interaction,alpha);
  rows.push({
    source:'Interaksi A × B',
    status:intSig?(interaction.p<.01?'Sangat nyata':'Nyata'):'Tidak nyata',
    action:intSig?(report.posthoc==='none'?'Interpretasikan kombinasi secara deskriptif; uji lanjut tidak dipilih':`Fokus uji lanjut ${report.posthoc.toUpperCase()} pada kombinasi/interaksi`):'Interpretasikan pengaruh utama A dan B secara terpisah'
  });
  for(const [label,item] of [['Faktor A',a],['Faktor B',b]]){
    if(!item)continue;
    rows.push({
      source:label,
      status:sig(item,alpha)?(item.p<.01?'Sangat nyata':'Nyata'):'Tidak nyata',
      action:intSig?'Tidak dijadikan fokus uji lanjut karena interaksi nyata':sig(item,alpha)?(report.posthoc==='none'?'Pengaruh nyata; uji lanjut tidak dipilih':`Lanjut ${report.posthoc.toUpperCase()} untuk ${label}`):'Tanpa uji lanjut'
    });
  }
  return rows;
}

export function auditReport(report){
  const issues=[],alpha=report.alpha??.05,multi=['fral','frak','split'].includes(report.design);
  const interaction=multi?term(report,[/^A\s*×\s*B$/i,/Interaksi.*A.*B/i]):null,intSig=sig(interaction,alpha);
  const comparisons=report.comparisons||[];
  if(intSig){
    const hasInteraction=comparisons.some(c=>c.layout==='factorial-interaction'||/interaksi/i.test(c.title))||!!report.interactionPosthoc;
    if(!hasInteraction)issues.push(issue('error','Interaksi nyata tetapi keluaran uji lanjut interaksi tidak ditemukan.',report.name));
    const mainTested=comparisons.some(c=>c.method!=='none'&&!c.layout&&/Faktor A|Faktor B|Petak Utama|Anak Petak/i.test(c.title));
    if(mainTested)issues.push(issue('error','Interaksi nyata tetapi uji lanjut faktor tunggal masih dijalankan sebagai fokus utama.',report.name));
  }else if(multi&&report.interactionPosthoc){
    issues.push(issue('error','Uji lanjut interaksi RPT tersedia walaupun interaksi tidak nyata.',report.name));
  }
  for(const comparison of comparisons)comparisonConsistency(report,comparison,issues);

  if(report.posthoc==='none'&&comparisons.some(c=>c.method!=='none'))issues.push(issue('error','Pilihan uji lanjut = tidak pakai, tetapi keluaran uji lanjut inferensial masih muncul.',report.name));
  if(report.transform?.type&&report.transform.type!=='none'){
    if(!report.beforeTransform&&!report.beforeTransformError)issues.push(issue('warn','Transformasi digunakan tetapi jejak analisis sebelum transformasi tidak tersedia.',report.name));
  }
  const meta=report.treatmentMeta?.levels||{};
  const missingA=(report.factorA||[]).filter(code=>!String(meta.a?.[code]||'').trim());
  const missingB=(report.factorB||[]).filter(code=>code!==''&&!String(meta.b?.[code]||'').trim());
  if(missingA.length)issues.push(issue('info',`Definisi taraf A/perlakuan belum lengkap: ${missingA.join(', ')}.`,report.name));
  if(multi&&missingB.length)issues.push(issue('info',`Definisi taraf B belum lengkap: ${missingB.join(', ')}.`,report.name));

  const unitMatch=String(report.name||'').match(/\(([^()]+)\)\s*$/);
  if(!unitMatch)issues.push(issue('info','Satuan parameter belum terbaca dari nama kolom; tambahkan satuan dalam kurung bila diperlukan untuk BAB IV.',report.name));

  const interpretation=interpretReport(report).join(' ');
  const activeMethods=[...new Set(comparisons.map(c=>c.method).filter(m=>m&&m!=='none'))];
  for(const method of activeMethods)if(!interpretation.toUpperCase().includes(method.toUpperCase()))issues.push(issue('warn',`Interpretasi belum menyebut metode ${method.toUpperCase()} yang aktif.`,report.name));
  const compared=comparisons.filter(c=>c.items?.length);
  for(const comparison of compared){
    const high=comparison.items.reduce((a,b)=>a.mean>=b.mean?a:b),low=comparison.items.reduce((a,b)=>a.mean<=b.mean?a:b);
    const highCode=high.a&&high.b?`${high.a}${high.b}`:high.label,lowCode=low.a&&low.b?`${low.a}${low.b}`:low.label;
    if(comparison.method!=='none'&&(!interpretation.includes(highCode)||!interpretation.includes(lowCode)))issues.push(issue('warn',`Narasi belum memuat kode rataan tertinggi/terendah untuk ${comparison.title}.`,report.name));
  }

  const diagnosticFlags=report.diagnostics?.items?.filter(item=>item.flag)||[];
  if(diagnosticFlags.length)issues.push(issue('warn',`${diagnosticFlags.length} unit memiliki |studentized residual| > 2 atau Cook's distance > 4/n; periksa unit tersebut tanpa menghapus otomatis.`,report.name));

  const errors=issues.filter(x=>x.level==='error').length,warnings=issues.filter(x=>x.level==='warn').length;
  return {
    parameter:report.name,
    issues,
    decisions:decisionRows(report),
    errors,
    warnings,
    status:errors?'Ada masalah':warnings?'Perlu diperiksa':'Siap digunakan'
  };
}

export function auditReports(reports){
  const items=(reports||[]).map(auditReport),errors=items.reduce((s,x)=>s+x.errors,0),warnings=items.reduce((s,x)=>s+x.warnings,0);
  return {items,errors,warnings,status:errors?'Ada masalah':warnings?'Perlu diperiksa':'Siap digunakan'};
}

const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function renderDecisionSummary(report){
  const rows=decisionRows(report);
  if(!rows.length)return '';
  return `<section class="decision-summary" data-decision-summary><div class="summary-head"><div><b>Ringkasan uji lanjut</b><small>Arah pembacaan hasil berdasarkan sidik ragam</small></div></div><div class="table-scroll"><table class="result-table"><thead><tr><th>Sumber</th><th>Status</th><th>Tindak lanjut</th></tr></thead><tbody>${rows.map(row=>`<tr><td>${esc(row.source)}</td><td>${esc(row.status)}</td><td>${esc(row.action)}</td></tr>`).join('')}</tbody></table></div></section>`;
}
export function renderAudit(audit){
  const cls=audit.errors?'audit-bad':audit.warnings?'audit-warn':'audit-good';
  const cards=audit.items.map(item=>{
    const findings=item.issues.length?`<ul>${item.issues.map(entry=>`<li class="audit-${entry.level}">${esc(entry.message)}</li>`).join('')}</ul>`:'<p>Tidak ada masalah utama yang terlihat pada hasil, tabel, uji lanjut, dan catatan interpretasi.</p>';
    return `<div class="audit-card"><div class="audit-card-head"><b>${esc(item.parameter)}</b><strong>${esc(item.status)}</strong></div>${findings}</div>`;
  }).join('');
  return `<section class="thesis-audit ${cls}" data-thesis-audit><div class="audit-head"><div><b>Periksa hasil</b><small>Saya pakai bagian ini untuk mengecek hasil, uji lanjut, huruf pembeda, transformasi, satuan, dan residual sebelum menyalinnya ke naskah.</small></div><strong>${esc(audit.status)}</strong></div>${cards}</section>`;
}
