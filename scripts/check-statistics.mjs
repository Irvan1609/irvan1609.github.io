import assert from 'node:assert/strict';
import fs from 'node:fs';
import {analyzeParameter,compareMeans,plannedContrasts,polynomialContrasts,normality,validateData} from '../src/statistics-engine.js';
const ref=JSON.parse(fs.readFileSync(new URL('./statistics-reference.json',import.meta.url),'utf8'));
const near=(a,b,tolerance=1e-7)=>assert.ok(Math.abs(a-b)<=tolerance*Math.max(1,Math.abs(b)),`${a} != ${b}`);
for(const design of ['fral','frak','split']){
 const report=analyzeParameter(ref.rows,{design,alpha:.05,posthoc:'bnj',assumptions:true,contrastMode:'none'},0,'Y');
 for(const expected of ref.refs[design].terms){const actual=report.terms.find(t=>t.label===expected.label);assert.equal(actual.df,expected.df);near(actual.ss,expected.ss);}
 near(report.assumptions[0].stat,ref.refs[design].normal[0]);near(report.assumptions[0].p,ref.refs[design].normal[1]);near(report.assumptions[1].stat,ref.refs[design].bf[0]);near(report.assumptions[1].p,ref.refs[design].bf[1]);
 if(design==='split'){assert.equal(report.terms.find(t=>t.label==='Faktor A').error,'Galat (a)');assert.equal(report.terms.find(t=>t.label==='Faktor B').error,'Galat (b)');}
 assert.ok(report.comparisons.every(c=>c.title.startsWith('Faktor B pada A')));
}
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
assert.throws(()=>polynomialContrasts(items,[0,0,1],2,6));assert.equal(normality([1,2,3]).p,null);
const dataset={headers:['A','B','R','Y'],rows:ref.rows.map(o=>[o.a,o.b,o.rep,o.values[0]])},options={design:'frak',a:0,b:1,rep:2,parameters:[3]};
assert.equal(validateData(dataset,options,Number).issues.length,0);
assert.ok(validateData({...dataset,rows:[...dataset.rows,dataset.rows[0]]},options,Number).issues.length>0);
assert.ok(validateData({...dataset,rows:dataset.rows.slice(1)},options,Number).issues.length>0);
console.log('Statistics verified: factorial/split-plot SS and df against independent least-squares; normality and Brown–Forsythe against SciPy; BNT/BNJ/DMRT at both alpha levels; CLD pairwise consistency; contrasts and polynomial SS; incomplete/duplicate data.');
