import assert from 'node:assert/strict';
import {kruskalWallis,friedman} from '../src/nonparametric-engine.js';
import {effectSizeFromMeans,oneWayAnovaPower,requiredReplicates} from '../src/power-engine.js';
import {stabilityIndices} from '../src/stability-indices-engine.js';
const near=(a,b,t=1e-7)=>assert.ok(Math.abs(a-b)<=t*Math.max(1,Math.abs(b)),`${a} != ${b}`);

const kw=kruskalWallis([['A',1],['A',2],['A',3],['B',4],['B',5],['B',6],['C',7],['C',8],['C',9]]);
near(kw.H,7.2);assert.equal(kw.df,2);assert.ok(kw.p<.05);near(kw.effect.value,5.2/6);assert.equal(kw.pairs.length,3);assert.ok(kw.pairs.every(x=>x.pHolm>=x.p));
const kwTie=kruskalWallis([['A',1],['A',1],['B',2],['B',2],['C',3],['C',3]]);assert.ok(kwTie.tieCorrection<1&&kwTie.tieCorrection>0);

const fr=[];for(const b of ['1','2','3','4']){fr.push(['A',b,1],['B',b,2],['C',b,3]);}
const fd=friedman(fr);near(fd.Q,8);near(fd.effect.value,1);assert.equal(fd.df,2);assert.ok(fd.p<.05);assert.equal(fd.pairs.length,3);
assert.throws(()=>friedman(fr.slice(1)),/tidak lengkap/i);

const e=effectSizeFromMeans([10,12,14,16],2);near(e.f,Math.sqrt(5)/2);
const p3=oneWayAnovaPower({groups:4,replicates:3,effectSize:.4,alpha:.05}),p10=oneWayAnovaPower({groups:4,replicates:10,effectSize:.4,alpha:.05});assert.ok(p10.power>p3.power&&p10.power>0&&p10.power<1);
const req=requiredReplicates({groups:4,effectSize:.4,alpha:.05,targetPower:.8});assert.ok(req&&req.power>=.8&&req.replicates>=2);if(req.replicates>2){const before=oneWayAnovaPower({groups:4,replicates:req.replicates-1,effectSize:.4,alpha:.05});assert.ok(before.power<.8);}

const rows=[];const matrix={E1:{G1:5,G2:6,G3:7},E2:{G1:6,G2:7.5,G3:8},E3:{G1:7,G2:8,G3:10},E4:{G1:8,G2:9.5,G3:12}};for(const [env,gs] of Object.entries(matrix))for(const [g,m] of Object.entries(gs))for(const d of [-.1,.1])rows.push([env,g,m+d]);
const si=stabilityIndices(rows);assert.equal(si.environments.length,4);assert.equal(si.genotypes.length,3);assert.equal(si.indices.length,3);assert.ok(si.indices.every(x=>Number.isFinite(x.wricke)&&Number.isFinite(x.finlaySlope)&&Number.isFinite(x.asv)&&Number.isFinite(x.ysi)));assert.ok(si.indices.every(x=>x.yieldRank>=1&&x.asvRank>=1));
assert.throws(()=>stabilityIndices(rows.filter(([e,g])=>!(e==='E4'&&g==='G3'))),/kosong/i);
console.log('Planning and robust analyses verified: Kruskal–Wallis, Friedman, Holm post-hoc, noncentral-F power planning, and multilocation stability indices.');
