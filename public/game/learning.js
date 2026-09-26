const TRACKS=[
  {id:'design',icon:'📐',title:'Rancangan Percobaan',desc:'Unit percobaan, randomisasi, ulangan, blocking, RAL dan RAK.',lessons:[
    ['unit','Unit percobaan ≠ tanaman sampel','Tanaman contoh di dalam satu petak adalah subsampel. Ulangan biologis adalah unit percobaan yang menerima perlakuan secara independen.'],
    ['random','Randomisasi','Randomisasi memutus pola sistematik antara perlakuan dan posisi lahan.'],
    ['rep','Ulangan','Ulangan mengestimasi galat percobaan dan meningkatkan presisi.'],
    ['block','Kelompok','RAK mengelompokkan unit yang relatif homogen, lalu mengacak perlakuan di dalam setiap kelompok.']
  ]},
  {id:'stats',icon:'📊',title:'Statistika',desc:'Rerata, ragam, ANOVA, CV, korelasi dan interpretasi biologis.',lessons:[
    ['mean','Rerata bukan seluruh cerita','Bandingkan rerata bersama keragaman dan desain percobaan.'],
    ['anova','ANOVA','F = ragam antar perlakuan / ragam galat. Nilai F besar adalah sinyal efek perlakuan, tetapi keputusan signifikansi tetap memerlukan distribusi F dan taraf nyata.'],
    ['cv','Koefisien keragaman','CV menghubungkan simpangan baku galat dengan rerata sehingga membantu membaca presisi percobaan.'],
    ['corr','Korelasi ≠ sebab-akibat','Korelasi mengukur asosiasi linear; interpretasi agronomis tetap membutuhkan mekanisme biologis.']
  ]},
  {id:'breeding',icon:'🧬',title:'Pemuliaan Tanaman',desc:'Variabilitas, seleksi, heritabilitas, stabilitas dan respons lingkungan.',lessons:[
    ['variation','Variasi adalah bahan baku seleksi','Seleksi hanya efektif bila terdapat variasi genetik yang dapat diwariskan.'],
    ['h2','Heritabilitas','Heritabilitas tinggi berarti perbedaan fenotipe lebih konsisten dengan perbedaan genetik pada lingkungan pengujian tersebut; bukan jaminan hasil tinggi.'],
    ['selection','Seleksi multi-karakter','Galur unggul tidak selalu galur dengan hasil tertinggi; kesehatan, umur, stabilitas, kualitas dan tujuan pemuliaan perlu dipertimbangkan.'],
    ['ge','G × E','Genotipe dapat berubah peringkat antar lingkungan. Uji multilokasi dibutuhkan sebelum menyimpulkan adaptasi luas.']
  ]},
  {id:'crossing',icon:'✕',title:'Persilangan & Generasi',desc:'Tetua, F1, segregasi F2, selfing, heterozigositas dan fiksasi.',lessons:[
    ['parent','Pemilihan tetua','Tetua dipilih karena komplementaritas karakter dan bukti performa, bukan hanya satu trait.'],
    ['f1','F1','F1 membawa satu alel dari masing-masing tetua dan umumnya masih sangat heterozigot pada lokus yang berbeda antar tetua.'],
    ['f2','F2 segregasi','Selfing F1 menghasilkan F2 dengan segregasi; inilah generasi penting untuk melihat variasi rekombinan.'],
    ['fix','Fiksasi melalui selfing','Heterozigositas teoritis berkurang setengah setiap generasi selfing: F2 ≈ 1/2 F1, F3 ≈ 1/4, dan seterusnya.']
  ]}
];

function numeric(value){const n=Number(value);return Number.isFinite(n)?n:null;}
function mean(values){return values.length?values.reduce((a,b)=>a+b,0)/values.length:NaN;}
function variance(values){
  if(values.length<2)return NaN;
  const m=mean(values);return values.reduce((s,v)=>s+(v-m)**2,0)/(values.length-1);
}
export function curriculum(){return TRACKS.map(track=>({...track,lessons:track.lessons.map(row=>[...row])}));}
export function generationName(generation=0){
  const g=Math.max(0,Math.round(Number(generation)||0));
  if(g===0)return 'P';
  return 'F'+g;
}
export function expectedHeterozygosity(generation=1){
  const g=Math.max(1,Math.round(Number(generation)||1));
  return g===1?1:Math.pow(.5,g-1);
}
export function observedHeterozygosity(genome={}){
  const loci=Object.values(genome).filter(pair=>Array.isArray(pair)&&pair.length===2);
  if(!loci.length)return 0;
  return loci.filter(pair=>pair[0]!==pair[1]).length/loci.length;
}
export function mendelianSummary(genome={}){
  const rows=Object.entries(genome).filter(([,pair])=>Array.isArray(pair)&&pair.length===2);
  return rows.map(([locus,pair])=>({locus,alleles:[...pair],heterozygous:pair[0]!==pair[1]}));
}
export function pearson(xValues=[],yValues=[]){
  const pairs=xValues.map((x,i)=>[numeric(x),numeric(yValues[i])]).filter(([x,y])=>x!==null&&y!==null);
  if(pairs.length<3)return null;
  const xs=pairs.map(p=>p[0]),ys=pairs.map(p=>p[1]),mx=mean(xs),my=mean(ys);
  const num=pairs.reduce((s,[x,y])=>s+(x-mx)*(y-my),0);
  const dx=Math.sqrt(pairs.reduce((s,[x])=>s+(x-mx)**2,0)),dy=Math.sqrt(pairs.reduce((s,[,y])=>s+(y-my)**2,0));
  return dx&&dy?num/(dx*dy):null;
}
export function analyzeExperiment({design='ral',units=[],treatments=[],parameter='Hasil'}={}){
  const rows=units.map(unit=>({
    treatmentId:unit.treatmentId,
    block:Number(unit.block||unit.rep)||1,
    value:numeric(unit.observations?.[parameter])
  })).filter(row=>row.value!==null);
  const result={parameter,n:rows.length,design,valid:false,means:[],warnings:[]};
  if(rows.length<3){result.warnings.push('Data belum cukup untuk ANOVA.');return result;}
  const byTreatment=new Map(),byBlock=new Map();
  for(const row of rows){
    if(!byTreatment.has(row.treatmentId))byTreatment.set(row.treatmentId,[]);
    byTreatment.get(row.treatmentId).push(row.value);
    if(!byBlock.has(row.block))byBlock.set(row.block,[]);
    byBlock.get(row.block).push(row.value);
  }
  const trtIds=[...byTreatment.keys()],grand=mean(rows.map(r=>r.value));
  result.means=trtIds.map(id=>{
    const t=treatments.find(item=>item.id===id),values=byTreatment.get(id);
    return {id,name:t?.name||t?.code||id,n:values.length,mean:mean(values),sd:Math.sqrt(variance(values)||0)};
  }).sort((a,b)=>b.mean-a.mean);
  if(trtIds.length<2){result.warnings.push('ANOVA membutuhkan sedikitnya dua perlakuan.');return result;}
  const ssTotal=rows.reduce((s,r)=>s+(r.value-grand)**2,0);
  const ssTreatment=[...byTreatment.values()].reduce((s,values)=>s+values.length*(mean(values)-grand)**2,0);
  let ssBlock=0,dfBlock=0;
  if(design==='rak'){
    ssBlock=[...byBlock.values()].reduce((s,values)=>s+values.length*(mean(values)-grand)**2,0);
    dfBlock=Math.max(0,byBlock.size-1);
    if(byBlock.size<2)result.warnings.push('RAK belum memiliki cukup kelompok teramati.');
  }
  const dfTreatment=trtIds.length-1,dfTotal=rows.length-1,dfError=dfTotal-dfTreatment-dfBlock;
  const ssError=Math.max(0,ssTotal-ssTreatment-ssBlock);
  if(dfError<=0){result.warnings.push('Derajat bebas galat tidak cukup.');return result;}
  const msTreatment=ssTreatment/dfTreatment,mse=ssError/dfError,f=msTreatment/(mse||Number.EPSILON);
  const cv=grand!==0?Math.sqrt(mse)/Math.abs(grand)*100:null;
  const balanced=result.means.every(item=>item.n===result.means[0].n);
  if(!balanced)result.warnings.push('Jumlah ulangan tidak seimbang; interpretasikan ANOVA sederhana ini dengan hati-hati.');
  result.valid=true;
  Object.assign(result,{grandMean:grand,ssTotal,ssTreatment,ssBlock,ssError,dfTreatment,dfBlock,dfError,msTreatment,mse,f,cv,balanced});
  if(balanced){
    const reps=result.means[0].n,sigmaG=Math.max(0,(msTreatment-mse)/Math.max(1,reps));
    result.broadSenseH2=sigmaG/(sigmaG+mse/Math.max(1,reps));
  }
  return result;
}
export function designCoach({design='ral',plotRegistry=[],units=[]}={}){
  const fertility=(plotRegistry||[]).map(row=>Number(row?.fertility)).filter(Number.isFinite);
  const moisture=(plotRegistry||[]).map(row=>Number(row?.moisture)).filter(Number.isFinite);
  const spatialVariation=Math.max(Math.sqrt(variance(fertility)||0),Math.sqrt(variance(moisture)||0));
  const advice=[];
  if(design==='ral'&&spatialVariation>.045)advice.push('Lahan menunjukkan gradien posisi; RAK biasanya lebih defensif daripada RAL karena variasi dapat diserap oleh kelompok.');
  if(design==='rak')advice.push('Pastikan setiap perlakuan muncul di setiap kelompok dan randomisasi dilakukan terpisah dalam kelompok.');
  if(units.length)advice.push('Unit percobaan adalah petak. Tanaman sampel di dalam petak tidak boleh dihitung sebagai ulangan independen.');
  return advice;
}
export function interpretationQuestion(analysis){
  if(!analysis?.valid)return null;
  const best=analysis.means?.[0],cv=analysis.cv;
  return {
    prompt:`Parameter ${analysis.parameter}: F = ${analysis.f.toFixed(2)}, CV = ${cv===null?'—':cv.toFixed(1)+'%'}. Kesimpulan yang paling tepat sebelum uji lanjut?`,
    options:[
      'Periksa signifikansi ANOVA terlebih dahulu; jika nyata, baru bandingkan rerata dengan uji lanjut yang sesuai.',
      `${best?.name||'Perlakuan tertinggi'} pasti terbaik secara genetik karena reratanya tertinggi.`,
      'Semua tanaman sampel dapat dianggap sebagai ulangan tambahan agar F lebih besar.'
    ],
    answer:0,
    explanation:'Rerata tertinggi belum cukup. Struktur rancangan, galat, signifikansi ANOVA, dan unit percobaan harus dipertahankan sebelum uji lanjut.'
  };
}

export function trackQuiz(trackId){
  const bank={
    design:{prompt:'Lahan memiliki gradien kesuburan yang jelas dari Kelompok I ke III. Rancangan mana paling masuk akal?',options:['RAL tanpa kelompok','RAK dengan randomisasi di dalam kelompok','Menambah tanaman sampel lalu menganggapnya sebagai ulangan'],answer:1,explanation:'Blocking pada RAK membantu menyerap variasi sistematik antar bagian lahan; tanaman sampel bukan ulangan independen.'},
    stats:{prompt:'ANOVA perlakuan nyata dan salah satu rerata paling tinggi. Apa langkah berikutnya?',options:['Langsung nyatakan perlakuan terbaik','Gunakan uji lanjut yang sesuai lalu interpretasikan besar dan arah efek','Hapus nilai terendah agar CV mengecil'],answer:1,explanation:'Signifikansi ANOVA membuka alasan untuk perbandingan lanjut; keputusan agronomis tetap melihat besar efek dan konteks biologis.'},
    breeding:{prompt:'Galur A hasilnya tertinggi di satu lokasi tetapi sangat tidak stabil; Galur B sedikit lebih rendah namun stabil di tiga lingkungan. Apa keputusan yang ilmiah?',options:['Selalu pilih A','Pilih berdasarkan tujuan pemuliaan dan bukti G×E, bukan satu rerata','Campur datanya agar perbedaannya hilang'],answer:1,explanation:'Pemuliaan membutuhkan definisi target. Adaptasi luas, adaptasi spesifik, stabilitas, dan kualitas bukti dapat menghasilkan keputusan berbeda.'},
    crossing:{prompt:'Apa yang paling diharapkan setelah F1 heterozigot diselfing menjadi F2?',options:['Semua tanaman identik','Segregasi genetik meningkat dan kombinasi rekombinan muncul','Heterozigositas menjadi 100%'],answer:1,explanation:'F2 adalah generasi segregasi. Selfing kemudian secara bertahap menurunkan heterozigositas dan meningkatkan fiksasi.'}
  };
  return bank[trackId]||bank.design;
}
