const finite=value=>value===null||value===undefined||Number.isFinite(Number(value));
const close=(a,b,tolerance=1e-7)=>{
  const x=Number(a),y=Number(b);
  if(!Number.isFinite(x)||!Number.isFinite(y))return false;
  return Math.abs(x-y)<=tolerance*Math.max(1,Math.abs(y));
};

export function auditCoreReport(report){
  const issues=[],warnings=[];
  if(!report||typeof report!=='object')return {ok:false,issues:['Laporan analisis tidak tersedia.'],warnings};
  const terms=Array.isArray(report.terms)?report.terms:[];
  if(!terms.length)issues.push('Tabel ANOVA kosong.');
  if(!(Number(report.N)>0))issues.push('Jumlah pengamatan tidak valid.');
  const total=terms.find(term=>String(term.label||'').toLowerCase()==='total');
  if(!total)issues.push('Baris Total tidak ditemukan.');
  else if(Number.isFinite(Number(report.N))&&Number(total.df)!==Number(report.N)-1)issues.push('Derajat bebas Total tidak sama dengan N − 1.');

  for(const term of terms){
    for(const field of ['ss','df','ms','f','p']){
      if(!finite(term[field]))issues.push(`${term.label||'Sumber'}: nilai ${field.toUpperCase()} tidak valid.`);
    }
    if(Number.isFinite(Number(term.df))&&Number(term.df)<0)issues.push(`${term.label||'Sumber'}: derajat bebas negatif.`);
    if(term.ms!==null&&term.ms!==undefined&&Number(term.df)>0&&Number.isFinite(Number(term.ss))&&!close(term.ms,Number(term.ss)/Number(term.df),1e-6)){
      issues.push(`${term.label||'Sumber'}: KT tidak konsisten dengan JK/db.`);
    }
    if(term.p!==null&&term.p!==undefined&&(Number(term.p)<0||Number(term.p)>1))issues.push(`${term.label||'Sumber'}: p-value di luar 0–1.`);
    if(term.f!==null&&term.f!==undefined&&Number(term.f)<0)issues.push(`${term.label||'Sumber'}: F hitung negatif.`);
  }

  if(total){
    const components=terms.filter(term=>term!==total&&!term.component);
    const dfSum=components.reduce((sum,term)=>sum+(Number.isFinite(Number(term.df))?Number(term.df):0),0);
    const ssSum=components.reduce((sum,term)=>sum+(Number.isFinite(Number(term.ss))?Number(term.ss):0),0);
    if(Number.isFinite(Number(total.df))&&!close(dfSum,total.df,1e-9))issues.push('Jumlah db komponen tidak sama dengan db Total.');
    if(Number.isFinite(Number(total.ss))&&!close(ssSum,total.ss,1e-6))issues.push('Jumlah JK komponen tidak sama dengan JK Total.');
  }

  for(const term of terms){
    if(term.f===null||term.f===undefined||!term.error)continue;
    const error=terms.find(candidate=>candidate.label===term.error);
    if(!error||!(Number(error.ms)>0)){issues.push(`${term.label}: KT galat pembanding tidak tersedia.`);continue;}
    if(Number.isFinite(Number(term.ms))&&!close(term.f,Number(term.ms)/Number(error.ms),1e-6))issues.push(`${term.label}: F hitung tidak konsisten dengan KT sumber/KT galat.`);
  }

  if(Array.isArray(report.residuals)&&Number.isFinite(Number(report.N))&&report.residuals.length!==Number(report.N))issues.push('Jumlah residual tidak sama dengan jumlah pengamatan.');
  if(Array.isArray(report.fitted)&&Number.isFinite(Number(report.N))&&report.fitted.length!==Number(report.N))issues.push('Jumlah fitted value tidak sama dengan jumlah pengamatan.');
  if(Number.isFinite(Number(report.grand))&&Math.abs(Number(report.grand))<1e-12)warnings.push('Rataan umum mendekati nol; KK/CV dapat tidak informatif.');
  if(report.cv!==null&&report.cv!==undefined&&!Number.isFinite(Number(report.cv)))warnings.push('KK/CV tidak dapat dihitung secara stabil.');

  return {ok:issues.length===0,issues,warnings};
}

export function requireValidCoreReport(report){
  const audit=auditCoreReport(report);
  if(!audit.ok)throw Error(`Audit internal analisis gagal: ${audit.issues.slice(0,3).join(' ')}`);
  return audit;
}

export function attachSupplementWarning(report,message){
  if(!report||!message)return report;
  report.supplementWarnings=Array.isArray(report.supplementWarnings)?report.supplementWarnings:[];
  if(!report.supplementWarnings.includes(message))report.supplementWarnings.push(message);
  report.notes=Array.isArray(report.notes)?report.notes:[];
  if(!report.notes.includes(message))report.notes.push(message);
  return report;
}
