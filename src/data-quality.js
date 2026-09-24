const unique=x=>[...new Set(x)];
const key=(...x)=>JSON.stringify(x.map(v=>String(v??'').trim()));

function quartiles(values){
  const sorted=[...values].sort((a,b)=>a-b),q=p=>{
    if(!sorted.length)return NaN;
    const pos=(sorted.length-1)*p,lo=Math.floor(pos),hi=Math.ceil(pos);
    return sorted[lo]+(sorted[hi]-sorted[lo])*(pos-lo);
  };
  return [q(.25),q(.75)];
}

export function inspectDataQuality(dataset,options,parse){
  const {design,a,b,rep,parameters=[]}=options||{},multi=['fral','frak','split'].includes(design),blocked=['rak','frak','split'].includes(design);
  const rows=(dataset?.rows||[]),headers=dataset?.headers||[],findings=[];
  let blankRows=0,duplicates=0,invalidNumeric=0;
  const seen=new Set(),observed=[];
  rows.forEach((row,index)=>{
    if(row.every(v=>String(v??'').trim()==='')){blankRows++;return;}
    const A=String(row[a]??'').trim(),B=multi?String(row[b]??'').trim():'',R=rep!==null&&rep!==undefined?String(row[rep]??'').trim():'';
    if(rep!==null&&rep!==undefined){
      const k=key(A,B,R);if(seen.has(k))duplicates++;else seen.add(k);
    }
    const values=parameters.map(p=>parse(row[p]));
    invalidNumeric+=values.filter(v=>!Number.isFinite(v)).length;
    observed.push({A,B,R,values,row:index+1});
  });
  if(blankRows)findings.push({level:'info',message:`${blankRows} baris kosong akan diabaikan.`});
  if(duplicates)findings.push({level:'error',message:`${duplicates} kombinasi unit percobaan terduplikasi.`});
  if(invalidNumeric)findings.push({level:'error',message:`${invalidNumeric} nilai pada parameter terpilih kosong atau bukan angka valid.`});
  const A=unique(observed.map(o=>o.A).filter(Boolean)),B=multi?unique(observed.map(o=>o.B).filter(Boolean)):[''],R=unique(observed.map(o=>o.R).filter(Boolean));
  const missing=[];
  if(blocked&&A.length&&B.length&&R.length){
    for(const aa of A)for(const bb of B)for(const rr of R)if(!observed.some(o=>o.A===aa&&o.B===bb&&o.R===rr))missing.push([aa,bb,rr].filter(Boolean).join(' × '));
    if(missing.length)findings.push({level:'error',message:`${missing.length} kombinasi rancangan hilang${missing.length<=6?': '+missing.join('; '):'.'}`});
  }
  const parameterStats=parameters.map((p,j)=>{
    const values=observed.map(o=>o.values[j]).filter(Number.isFinite),name=headers[p]||`Parameter ${j+1}`;
    const distinct=unique(values).length;
    if(values.length&&distinct===1)findings.push({level:'error',message:`${name}: semua nilai sama (variasi nol).`});
    let outliers=0;
    if(values.length>=4){
      const [q1,q3]=quartiles(values),iqr=q3-q1,lo=q1-1.5*iqr,hi=q3+1.5*iqr;
      outliers=values.filter(v=>v<lo||v>hi).length;
      if(outliers)findings.push({level:'warn',message:`${name}: ${outliers} nilai berada di luar pagar IQR 1,5×. Periksa data; jangan dihapus otomatis.`});
    }
    return {name,n:values.length,distinct,outliers};
  });
  const counts=A.flatMap(aa=>B.map(bb=>observed.filter(o=>o.A===aa&&o.B===bb).length));
  const balanced=counts.length?counts.every(n=>n===counts[0]&&n>0):false;
  if((multi||blocked)&&counts.length&&!balanced)findings.push({level:'error',message:'Jumlah pengamatan antar-kombinasi tidak seimbang untuk rancangan klasik yang dipilih.'});
  const errors=findings.filter(x=>x.level==='error').length,warnings=findings.filter(x=>x.level==='warn').length;
  return {rows:observed.length,blankRows,duplicates,invalidNumeric,missing,balanced:counts.length?balanced:null,parameterStats,findings,errors,warnings,status:errors?'Perlu diperbaiki':warnings?'Perlu diperiksa':'Baik'};
}

export function renderDataQuality(report){
  const cls=report.errors?'quality-bad':report.warnings?'quality-warn':'quality-good';
  const items=report.findings.length?report.findings.map(x=>`<li class="quality-${x.level}">${escapeHtml(x.message)}</li>`).join(''):'<li>Tidak ditemukan masalah struktur atau kualitas data dasar.</li>';
  return `<section class="data-quality ${cls}" data-data-quality><div class="quality-head"><div><b>Data-quality checker</b><small>${report.rows} baris pengamatan · status: ${report.status}</small></div><strong>${report.errors?'✕':report.warnings?'!':'✓'} ${report.status}</strong></div><ul>${items}</ul></section>`;
}
function escapeHtml(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
