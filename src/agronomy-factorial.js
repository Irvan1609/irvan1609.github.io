import jStat from 'jstat';
import {compareMeans,compactLetters,fTail} from './statistics-engine.js';

function testedTerm(label,ss,df,mse,denDf,error){
  const ms=ss/df,f=ms/mse;
  return {label,ss,df,ms,f,p:fTail(f,df,denDf),f05:jStat.centralF.inv(.95,df,denDf),f01:jStat.centralF.inv(.99,df,denDf),error};
}

function renameTerm(term,label,error){return {...term,label,error:error??term.error};}

function noTest(items,title,mse,df,layout){
  return {title,items:items.map(item=>({...item,letters:[]})),mse,df,method:'none',critical:[],pairs:[],layout};
}

function withError(test,mse,df){return {...test,mse,df};}

function significanceMatrix(items,threshold){
  const n=items.length,sig=Array.from({length:n},()=>Array(n).fill(false)),pairs=[];
  for(let i=0;i<n;i++)for(let j=i+1;j<n;j++){
    const difference=Math.abs(items[i].mean-items[j].mean),significant=difference>threshold;
    sig[i][j]=sig[j][i]=significant;pairs.push({i,j,difference,threshold,significant});
  }
  return {sig,pairs};
}

function weightedBnt(items,alpha,mseA,dfA,mseB,dfB,b,r){
  const tA=jStat.studentt.inv(1-alpha/2,dfA),tB=jStat.studentt.inv(1-alpha/2,dfB);
  const wA=mseA,wB=(b-1)*mseB,weightedT=(wB*tB+wA*tA)/(wB+wA);
  const effectiveMse=(wA+wB)/b;
  const effectiveDf=(wA+wB)**2/(wA**2/dfA+wB**2/dfB);
  const threshold=weightedT*Math.sqrt(2*(wA+wB)/(r*b));
  const {sig,pairs}=significanceMatrix(items,threshold),letters=compactLetters(items.map(item=>item.mean),sig);
  return {items:items.map((item,i)=>({...item,letters:letters[i]})),method:'bnt',critical:[{range:2,value:weightedT}],pairs,mse:effectiveMse,df:effectiveDf,weighted:true,threshold,tA,tB,dfA,dfB,mseA,mseB};
}

const columnAlphabet=['x','y','z','w','v','u','t','s','r','q','p','o','n','m','l','k','j','i','h','g','f','e','d','c','b','a'];
function columnLetters(items){
  const source=[...new Set(items.flatMap(item=>item.letters||[]))],map=new Map(source.map((letter,i)=>[letter,columnAlphabet[i]||`x${i+1}`]));
  return items.map(item=>({...item,letters:(item.letters||[]).map(letter=>map.get(letter))}));
}

function buildSplitInteraction(report,mseA,dfA,mseB,dfB){
  const A=report.factorA,B=report.factorB,r=report.cells[0]?.n||0,method=report.posthoc,alpha=report.alpha;
  const rowTests=A.map(a=>{
    const items=B.map(b=>report.cells.find(cell=>cell.a===a&&cell.b===b));
    const test=method==='none'?noTest(items,`Anak Petak (B) pada Petak Utama (A) = ${a}`,mseB,dfB):withError(compareMeans(items,method,alpha,mseB,dfB),mseB,dfB);
    return {...test,a,title:`Anak Petak (B) pada Petak Utama (A) = ${a}`};
  });
  const effectiveMse=(mseA+(B.length-1)*mseB)/B.length;
  const effectiveDf=(mseA+(B.length-1)*mseB)**2/(mseA**2/dfA+((B.length-1)*mseB)**2/dfB);
  const columnTests=B.map(b=>{
    const items=A.map(a=>report.cells.find(cell=>cell.a===a&&cell.b===b));
    let test;
    if(method==='none')test=noTest(items,`Petak Utama (A) pada Anak Petak (B) = ${b}`,effectiveMse,effectiveDf);
    else if(method==='bnt')test=weightedBnt(items,alpha,mseA,dfA,mseB,dfB,B.length,r);
    else test=withError(compareMeans(items,method,alpha,effectiveMse,effectiveDf),effectiveMse,effectiveDf);
    test.items=columnLetters(test.items);
    return {...test,b,title:`Petak Utama (A) pada Anak Petak (B) = ${b}`};
  });
  const cells=report.cells.map(cell=>{
    const row=rowTests.find(test=>test.a===cell.a)?.items.find(item=>item.b===cell.b);
    const column=columnTests.find(test=>test.b===cell.b)?.items.find(item=>item.a===cell.a);
    return {...cell,rowLetters:row?.letters||[],columnLetters:column?.letters||[]};
  });
  return {method,alpha,rows:A,columns:B,cells,rowTests,columnTests,mseA,dfA,mseB,dfB,effectiveMse,effectiveDf};
}

function finalizeOrdinaryFactorial(report){
  const original=report.terms;
  const block=original.find(term=>term.label==='Ulangan');
  const factorA=original.find(term=>term.label==='Faktor A'),factorB=original.find(term=>term.label==='Faktor B');
  const interaction=original.find(term=>term.label==='A × B'),error=original.find(term=>term.label==='Galat'),total=original.find(term=>term.label==='Total');
  if(!factorA||!factorB||!interaction||!error)return report;
  const treatment=testedTerm('Perlakuan',factorA.ss+factorB.ss+interaction.ss,factorA.df+factorB.df+interaction.df,error.ms,error.df,'Acak');
  report.terms=[...(block?[renameTerm(block,'Kelompok','Acak')]:[]),treatment,renameTerm(factorA,'Faktor A','Acak'),renameTerm(factorB,'Faktor B','Acak'),renameTerm(interaction,'Interaksi (A × B)','Acak'),renameTerm(error,'Acak'),total];
  report.notes=report.notes.filter(note=>!note.startsWith('Interaksi A × B nyata:'));
  if(interaction.p<report.alpha){
    const title='Interaksi A × B';
    const compared=report.posthoc==='none'?noTest(report.cells,title,error.ms,error.df,'factorial-interaction'):withError(compareMeans(report.cells,report.posthoc,report.alpha,error.ms,error.df),error.ms,error.df);
    report.comparisons=[{...compared,title,layout:'factorial-interaction'}];
    report.notes.push('Interaksi A × B nyata: uji lanjut hanya dilakukan pada kombinasi interaksi. Faktor tunggal A dan B tidak diuji lanjut karena telah terwakili oleh interaksi.');
  }
  return report;
}

function finalizeSplitPlot(report){
  const original=report.terms;
  const block=original.find(term=>term.label==='Ulangan'),factorA=original.find(term=>term.label==='Faktor A'),errorA=original.find(term=>term.label==='Galat (a)');
  const factorB=original.find(term=>term.label==='Faktor B'),interaction=original.find(term=>term.label==='A × B'),errorB=original.find(term=>term.label==='Galat (b)'),total=original.find(term=>term.label==='Total');
  if(!block||!factorA||!errorA||!factorB||!interaction||!errorB)return report;
  report.terms=[renameTerm(block,'Kelompok','Acak (a)'),renameTerm(factorA,'Petak Utama (A)','Acak (a)'),renameTerm(errorA,'Acak (a)'),renameTerm(factorB,'Anak Petak (B)','Acak (b)'),renameTerm(interaction,'Interaksi (A × B)','Acak (b)'),renameTerm(errorB,'Acak (b)'),total];
  report.notes=report.notes.filter(note=>!note.startsWith('Interaksi A × B nyata:')&&!note.startsWith('RPT berbasis RAK:'));
  report.notes.push('RPT berbasis RAK: Kelompok dan Petak Utama diuji dengan Acak (a); Anak Petak dan Interaksi A × B diuji dengan Acak (b).');
  if(interaction.p<report.alpha){
    report.comparisons=[];
    report.interactionPosthoc=buildSplitInteraction(report,errorA.ms,errorA.df,errorB.ms,errorB.df);
    report.notes.push('Interaksi A × B nyata: uji lanjut hanya dilakukan pada interaksi. RPT diuji dua arah, yaitu Anak Petak pada setiap Petak Utama (huruf baris) dan Petak Utama pada setiap Anak Petak (huruf kolom).');
    if(report.posthoc==='bnt')report.notes.push('Untuk BNT RPT, perbandingan Petak Utama pada taraf Anak Petak yang sama menggunakan galat gabungan Acak (a) dan Acak (b) serta nilai t terbobot sesuai struktur galat RPT.');
    else if(report.posthoc!=='none')report.notes.push('Untuk BNJ/DMRT pada arah Petak Utama dalam Anak Petak, galat gabungan menggunakan pendekatan derajat bebas Satterthwaite.');
  }else{
    report.interactionPosthoc=null;
    report.comparisons=report.comparisons.map(comparison=>({...comparison,title:comparison.title==='Faktor A'?'Petak Utama (A)':comparison.title==='Faktor B'?'Anak Petak (B)':comparison.title}));
  }
  return report;
}

export function finalizeAgronomyFactorial(report){
  if(report.design==='fral'||report.design==='frak')return finalizeOrdinaryFactorial(report);
  if(report.design==='split')return finalizeSplitPlot(report);
  return report;
}
