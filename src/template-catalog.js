const seq=n=>Array.from({length:n},(_,i)=>i);
const round=x=>Math.round(x*100)/100;

function oneFactor(blockLabel='Ulangan'){
  const headers=['Perlakuan',blockLabel,'Tinggi Tanaman','Bobot Panen'];
  const rows=[];
  for(const r of [1,2,3])for(const [i,p] of ['P0','P1','P2','P3'].entries())rows.push([p,r,round(18+i*2.3+r*.35),round(42+i*4.1+r*.55)]);
  return {headers,rows};
}
function factorial(blockLabel='Ulangan'){
  const headers=['Faktor A','Faktor B',blockLabel,'Tinggi Tanaman','Bobot Panen'];
  const rows=[];
  for(const r of [1,2,3])for(const [ai,a] of ['A0','A1','A2'].entries())for(const [bi,b] of ['B0','B1'].entries())rows.push([a,b,r,round(20+ai*2.1+bi*1.4+ai*bi*.7+r*.25),round(50+ai*4+bi*3+ai*bi*1.6+r*.4)]);
  return {headers,rows};
}
function multivariate(){
  const headers=['Sampel','TiTa','DiBa','BoPa','PaTo','DiTo','Produksi'];
  const rows=seq(12).map(i=>{
    const j=i+1;
    return [`S${j}`,round(145+j*2.7+(j%3)*1.2),round(14+j*.42+(j%4)*.18),round(120+j*3.1-(j%5)*1.8),round(14+j*.38+(j%3)*.25),round(3.1+j*.09+(j%2)*.07),round(28+j*2.2+(j%4)*1.4-(j%3)*.6)];
  });
  return {headers,rows};
}
function regression(){
  const headers=['Dosis','Ulangan','Respons'];
  const rows=[];
  for(const dose of [0,50,100,150,200])for(const rep of [1,2,3])rows.push([dose,rep,round(35+.32*dose-.0009*dose*dose+(rep-2)*1.2)]);
  return {headers,rows};
}
function multilocation(unbalanced=false){
  const headers=['Lokasi','Genotipe','Kelompok','Produksi','Tinggi Tanaman'];
  const rows=[];
  for(const [li,l] of ['L1','L2'].entries())for(const [gi,g] of ['G1','G2','G3'].entries())for(const b of [1,2,3]){
    if(unbalanced&&((l==='L1'&&g==='G2'&&b===3)||(l==='L2'&&g==='G1'&&b===2)))continue;
    rows.push([l,g,b,round(6.2+li*.8+gi*.65+li*gi*.22+(b-2)*.11),round(165+li*5+gi*4+li*gi*1.5+(b-2)*.8)]);
  }
  return {headers,rows};
}
function genetic(){
  const headers=['Genotipe','Kelompok','Produksi','Tinggi Tanaman'];
  const rows=[];
  for(const [gi,g] of ['G1','G2','G3','G4'].entries())for(const b of [1,2,3])rows.push([g,b,round(5.5+gi*.85+(b-2)*.18),round(155+gi*7+(b-2)*1.5)]);
  return {headers,rows};
}
function stability(){
  const headers=['Lingkungan','Genotipe','Ulangan','Produksi'];
  const base=[[5.2,6.4,5.9,7.0],[6.8,6.3,7.7,7.2],[5.7,7.0,6.6,8.1]],rows=[];
  for(const [ei,e] of ['E1','E2','E3'].entries())for(const [gi,g] of ['G1','G2','G3','G4'].entries())for(const r of [1,2])rows.push([e,g,r,round(base[ei][gi]+(r===1?-.12:.12))]);
  return {headers,rows};
}

const defs=[
  ['ral','Rancangan','RAL','Perlakuan, ulangan, dan beberapa parameter numerik. Ulangan hanya sebagai identitas pada RAL.',()=>oneFactor('Ulangan')],
  ['rak','Rancangan','RAK','Perlakuan, kelompok, dan beberapa parameter numerik. Kelompok menjadi sumber keragaman dalam ANOVA.',()=>oneFactor('Kelompok')],
  ['fral','Rancangan','Faktorial RAL (2 faktor)','Faktor A × Faktor B dengan ulangan dan beberapa parameter numerik.',()=>factorial('Ulangan')],
  ['frak','Rancangan','Faktorial RAK (2 faktor)','Faktor A × Faktor B dalam kelompok/blok.',()=>factorial('Kelompok')],
  ['split','Rancangan','RPT / Split-plot dalam RAK','Faktor A = petak utama, Faktor B = anak petak, dan Kelompok = blok.',()=>factorial('Kelompok')],
  ['descriptive','Eksplorasi','Statistik Deskriptif','Satu baris per sampel dan beberapa karakter numerik. Kolom Sampel berfungsi sebagai identitas.',multivariate],
  ['correlation','Eksplorasi','Korelasi','Beberapa karakter numerik untuk matriks korelasi Pearson/Spearman.',multivariate],
  ['path','Eksplorasi','Sidik Lintas','Beberapa karakter X numerik dan satu respons Y; contoh memakai Produksi sebagai Y.',multivariate],
  ['regression','Pemodelan','Regresi Respons Dosis','Dosis/X numerik, ulangan, dan respons Y. Ulangan pada dosis yang sama memungkinkan uji lack-of-fit.',regression],
  ['pca','Pemodelan','PCA + Biplot','Beberapa karakter numerik pada setiap sampel; identitas sampel tidak dimasukkan ke PCA.',multivariate],
  ['combined','Multilokasi','ANOVA Gabungan','Lokasi, Genotipe/Perlakuan, Kelompok, dan parameter Y. Contoh dibuat seimbang.',()=>multilocation(false)],
  ['mixed','Multilokasi','Mixed Model REML','Lokasi, Genotipe, Kelompok, dan Y. Contoh sengaja tidak seimbang tetapi setiap sel Lokasi × Genotipe tetap terisi.',()=>multilocation(true)],
  ['genetic','Pemuliaan','Parameter Genetik','Genotipe, kelompok/ulangan, dan parameter Y pada RAK seimbang.',genetic],
  ['stability','Pemuliaan','AMMI / GGE Biplot','Lingkungan, Genotipe, Ulangan, dan parameter hasil. Semua sel Lingkungan × Genotipe harus terisi.',stability]
];

export const templateCatalog=defs.map(([id,group,label,description,build])=>({id,group,label,description,build}));
export function getDataTemplate(id){
  const def=templateCatalog.find(x=>x.id===id);if(!def)throw Error('Template analisis tidak ditemukan.');
  const {headers,rows}=def.build();
  return {...def,headers:[...headers],rows:rows.map(r=>[...r]),name:`template-${id}`};
}
export function rowsForEditor(template,separator='.'){
  return template.rows.map(row=>row.map(value=>typeof value==='number'?String(value).replace('.',separator):String(value)));
}
export function templateHelp(template){
  const common=['Data contoh hanya menunjukkan format; ganti dengan data penelitian Anda.','Satu baris = satu unit pengamatan; satu kolom = satu variabel.','Judul kolom harus unik. Jangan masukkan baris total, rataan, atau catatan di dalam tabel data.'];
  const specific={
    ral:'Perlakuan biasanya berupa kode seperti P0, P1, P2; Ulangan menggunakan 1, 2, 3, dan seterusnya.',
    rak:'Perlakuan biasanya berupa kode seperti P0, P1, P2; Kelompok menggunakan 1, 2, 3, dan seterusnya.',
    fral:'Semua kombinasi Faktor A × Faktor B harus tersedia pada setiap ulangan.',
    frak:'Semua kombinasi Faktor A × Faktor B harus tersedia pada setiap kelompok.',
    split:'Faktor A adalah petak utama; Faktor B adalah anak petak; Kelompok adalah blok.',
    correlation:'Pilih minimal dua karakter numerik; kolom identitas seperti Sampel tidak dianalisis.',
    path:'Tentukan satu variabel sebagai Y/respons dan minimal dua variabel lain sebagai X.',
    regression:'Gunakan X/dosis numerik. Beberapa ulangan pada dosis yang sama memungkinkan pemisahan pure error dan lack-of-fit.',
    pca:'PCA membutuhkan minimal dua variabel numerik dengan variasi; hindari kolom konstan.',
    combined:'Setiap Lokasi × Genotipe harus terisi. Data seimbang dianalisis dengan ANOVA klasik; data tidak seimbang dapat memakai GLM.',
    mixed:'Kelompok diperlakukan sebagai efek acak tersarang dalam Lokasi. Setiap Lokasi × Genotipe harus memiliki data.',
    genetic:'Template parameter genetik menggunakan RAK seimbang agar komponen ragam dapat diestimasi secara klasik.',
    stability:'AMMI/GGE membutuhkan semua kombinasi Lingkungan × Genotipe terisi; ulangan boleh lebih dari satu.',
    descriptive:'Kolom numerik dapat dipilih seluruhnya atau sebagian.'
  };
  return [...common,specific[template.id]].filter(Boolean);
}
