import assert from 'node:assert/strict';
import fs from 'node:fs';
import {analyzeParameter,compareMeans,plannedContrasts,polynomialContrasts,normality,validateData} from '../src/statistics-engine.js';
import {plannedContrastsFlexible} from '../src/planned-contrasts.js';
import {finalizeAgronomyFactorial} from '../src/agronomy-factorial.js';
const ref=JSON.parse(fs.readFileSync(new URL('./statistics-reference.json',import.meta.url),'utf8'));
const near=(a,b,tolerance=1e-7)=>assert.ok(Math.abs(a-b)<=tolerance*Math.max(1,Math.abs(b)),`${a} != ${b}`);
const shares=(a,b)=>a.some(letter=>b.includes(letter));
for(const design of ['fral','frak','split']){
 const report=analyzeParameter(ref.rows,{design,alpha:.05,posthoc:'bnj',assumptions:true,contrastMode:'none'},0,'Y');
 for(const expected of ref.refs[design].terms){const actual=report.terms.find(t=>t.label===expected.label);assert.equal(actual.df,expected.df);near(actual.ss,expected.ss);}
 near(report.assumptions[0].stat,ref.refs[design].normal[0]);near(report.assumptions[0].p,ref.refs[design].normal[1]);near(report.assumptions[1].stat,ref.refs[design].bf[0]);near(report.assumptions[1].p,ref.refs[design].bf[1]);
 if(design==='split'){assert.equal(report.terms.find(t=>t.label==='Faktor A').error,'Galat (a)');assert.equal(report.terms.find(t=>t.label==='Faktor B').error,'Galat (b)');}
 assert.ok(report.comparisons.every(c=>c.title.startsWith('Faktor B pada A')));
}
for(const design of ['fral','frak']){
 const report=finalizeAgronomyFactorial(analyzeParameter(ref.rows,{design,alpha:.05,posthoc:'bnj',assumptions:false,contrastMode:'none'},0,'Y'));
 assert.ok(report.terms.some(term=>term.label==='Perlakuan'));
 if(design==='frak')assert.equal(report.terms[0].label,'Kelompok');
 const treatment=report.terms.find(term=>term.label==='Perlakuan');
 const parts=['Faktor A','Faktor B','Interaksi (A × B)'].map(label=>report.terms.find(term=>term.label===label));
 near(treatment.ss,parts.reduce((s,term)=>s+term.ss,0));
 assert.equal(report.comparisons.length,1);assert.equal(report.comparisons[0].layout,'factorial-interaction');
 assert.equal(report.comparisons[0].items.length,report.factorA.length*report.factorB.length);
 assert.ok(!report.comparisons.some(c=>c.title==='Faktor A'||c.title==='Faktor B'));
}
const rptSource=[
 ['t0','v1',[1.10,1.15,1.17]],['t0','v2',[1.25,1.27,1.28]],['t0','v3',[1.16,1.17,1.18]],['t0','v4',[1.24,1.24,1.25]],
 ['t1','v1',[1.50,1.60,1.65]],['t1','v2',[1.48,1.59,1.63]],['t1','v3',[1.60,1.61,1.62]],['t1','v4',[1.65,1.70,1.75]],
 ['t2','v1',[1.49,1.51,1.53]],['t2','v2',[1.52,1.57,1.58]],['t2','v3',[1.59,1.60,1.62]],['t2','v4',[1.70,1.75,1.79]]
];
const rptRows=rptSource.flatMap(([a,b,ys])=>ys.map((y,i)=>({a,b,rep:String(i+1),values:[y]})));
const rpt=finalizeAgronomyFactorial(analyzeParameter(rptRows,{design:'split',alpha:.01,posthoc:'bnt',assumptions:false,contrastMode:'none'},0,'Y'));
assert.deepEqual(rpt.terms.map(term=>term.label),['Kelompok','Petak Utama (A)','Acak (a)','Anak Petak (B)','Interaksi (A × B)','Acak (b)','Total']);
near(rpt.terms.find(t=>t.label==='Kelompok').f,8.826848249028394);
near(rpt.terms.find(t=>t.label==='Petak Utama (A)').f,458.82684824909006);
near(rpt.terms.find(t=>t.label==='Anak Petak (B)').f,75.37333333333434);
near(rpt.terms.find(t=>t.label==='Interaksi (A × B)').f,16.561904761904934);
assert.equal(rpt.comparisons.length,0);assert.ok(rpt.interactionPosthoc);
assert.equal(rpt.interactionPosthoc.rowTests.length,3);assert.equal(rpt.interactionPosthoc.columnTests.length,4);
near(rpt.interactionPosthoc.rowTests[0].pairs[0].threshold,0.05181785088783711);
near(rpt.interactionPosthoc.columnTests[0].critical[0].value,3.7321328316281117);
const rptCell=(a,b)=>rpt.interactionPosthoc.cells.find(cell=>cell.a===a&&cell.b===b);
assert.equal(shares(rptCell('t0','v1').rowLetters,rptCell('t0','v2').rowLetters),false);
assert.equal(shares(rptCell('t1','v1').columnLetters,rptCell('t2','v1').columnLetters),true);
assert.equal(shares(rptCell('t0','v1').columnLetters,rptCell('t1','v1').columnLetters),false);
const obs=ref.single.flatMap((g,i)=>g.map((y,r)=>({a:'P'+i,b:'',rep:String(r+1),values:[y]})));
for(const alpha of [.05,.01])for(const method of ['bnt','bnj','dmrt']){
 const report=analyzeParameter(obs,{design:'ral',alpha,posthoc:method,assumptions:true,contrastMode:'none'},0,'Y'),c=report.comparisons[0];near(report.terms.find(t=>t.label==='Galat').ms,ref.mse);
 assert.deepEqual(c.items.map(x=>x.label),ref.single.map((_,i)=>'P'+i));
 c.critical.forEach((q,i)=>near(q.value,method==='dmrt'?ref.critical[alpha].dmrt[i]:ref.critical[alpha][method],2e-6));
 for(const pair of c.pairs){const shared=c.items[pair.i].letters.some(x=>c.items[pair.j].letters.includes(x));assert.equal(shared,!pair.significant);}
}
const items=[{label:'a',n:3,mean:1},{label:'b',n:3,mean:3},{label:'c',n:3,mean:4}];
const poly=polynomialContrasts(items,[0,1,2],2,6);near(poly.reduce((s,x)=>s+x.ss,0),14);assert.equal(poly.length,2);
const planned=plannedContrasts(items,[{name:'C1',coefficients:[-2,1,1]},{name:'C2',coefficients:[0,-1,1]}],2,6);near(planned.reduce((s,x)=>s+x.ss,0),14);
assert.throws(()=>plannedContrasts(items,[{name:'bad',coefficients:[1,1,1]}],2,6));
assert.throws(()=>plannedContrasts(items,[{coefficients:[-1,1,0]},{coefficients:[-1,0,1]}],2,6));
const sixItems=[10,12,14,16,18,20].map((mean,i)=>({label:'P'+i,n:3,mean}));
const flexible=plannedContrastsFlexible(sixItems,[
 {name:'Kontrol vs Semuanya',coefficients:[-5,1,1,1,1,1]},
 {name:'Kontrol vs Mulsa Kulit Kakao',coefficients:[-2,1,1,0,0,0]},
 {name:'Mulsa Kulit Kakao Tanpa Fermentasi vs Dengan Fermentasi',coefficients:[0,-1,1,0,-1,1]}
],4,12);
assert.equal(flexible.contrasts.length,3);assert.equal(flexible.nonOrthogonalPairs.length,1);near(flexible.contrasts[0].estimate,30);near(flexible.contrasts[0].ss,90);near(flexible.contrasts[0].f,22.5);
assert.throws(()=>plannedContrastsFlexible(sixItems,[{name:'bad',coefficients:[1,1,1,1,1,1]}],4,12));
assert.throws(()=>plannedContrastsFlexible(sixItems,[{name:'Kontras A',coefficients:[-1,1,0,0,0,0]},{name:' kontras a ',coefficients:[0,0,-1,1,0,0]}],4,12),/nama setiap kontras harus unik/i);
assert.throws(()=>polynomialContrasts(items,[0,0,1],2,6));assert.equal(normality([1,2,3]).p,null);
const dataset={headers:['A','B','R','Y'],rows:ref.rows.map(o=>[o.a,o.b,o.rep,o.values[0]])},options={design:'frak',a:0,b:1,rep:2,parameters:[3]};
assert.equal(validateData(dataset,options,Number).issues.length,0);
assert.ok(validateData({...dataset,rows:[...dataset.rows,dataset.rows[0]]},options,Number).issues.length>0);
assert.ok(validateData({...dataset,rows:dataset.rows.slice(1)},options,Number).issues.length>0);
console.log('Statistics verified: factorial/split-plot SS and df; agronomic factorial interaction-only follow-up; RPT row-column follow-up with separate error strata; normality and Brown–Forsythe; BNT/BNJ/DMRT; planned contrasts including unique-name validation; incomplete/duplicate data.');
