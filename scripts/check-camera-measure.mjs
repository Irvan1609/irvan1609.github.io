import assert from 'node:assert/strict';
import fs from 'node:fs';
import {alignmentCheck} from '../public/kamera-pengukur/alignment.js';
import {WIDTH,HEIGHT,PPM,homography,project,detectMarkers} from '../public/kamera-pengukur/geometry.js';
const p=[[45,30],[620,100],[590,910],[100,800]],h=homography(p);
[[0,0],[WIDTH,0],[WIDTH,HEIGHT],[0,HEIGHT]].forEach((q,i)=>{const v=project(h,...q);assert.ok(Math.hypot(v[0]-p[i][0],v[1]-p[i][1])<1e-7);});
const scale=homography([[15,15],[195,15],[195,282],[15,282]]);
assert.ok(project(scale,100,100).every(v=>Math.abs(v-115)<1e-9));
assert.equal(100*PPM,500);
const data=new Uint8ClampedArray(210*297*4);data.fill(255);
for(const [x,y] of [[15,15],[195,15],[195,282],[15,282]])for(let dy=-3;dy<=3;dy++)for(let dx=-3;dx<=3;dx++){const i=((y+dy)*210+x+dx)*4;data[i]=208;data[i+1]=0;data[i+2]=208;}
assert.deepEqual(detectMarkers({data,width:210,height:297}),[[15,15],[195,15],[195,282],[15,282]]);
assert.throws(()=>homography([[0,0],[1,1],[2,2],[3,3]]));
assert.throws(()=>homography([[0,0],[0,267],[180,267],[180,0]]));
for(let y=12;y<=18;y++)for(let x=12;x<=18;x++)data.fill(255,(y*210+x)*4,(y*210+x)*4+4);
assert.throws(()=>detectMarkers({data,width:210,height:297}));
const svg=fs.readFileSync('public/kamera-pengukur/kalibrator.svg','utf8');
assert.match(svg,/width="210mm" height="297mm"/);
assert.match(svg,/M55 271 H155/);
// Printed patches must not be mistaken for position markers.
const swatches=[...svg.matchAll(/<rect x="(\d+)" y="(229|241)" width="22" height="10" fill="#([0-9a-f]{6})"\/>/g)];
assert.equal(swatches.length,12);
const chart=new Uint8ClampedArray(210*297*4);chart.fill(255);
for(const [x,y] of [[15,15],[195,15],[195,282],[15,282]])for(let dy=-3;dy<=3;dy++)for(let dx=-3;dx<=3;dx++)chart.set([208,0,208,255],((y+dy)*210+x+dx)*4);
for(const [,x,y,hex] of swatches){
  const rgb=hex.match(/../g).map(n=>parseInt(n,16));
  for(let dy=0;dy<10;dy++)for(let dx=0;dx<22;dx++)chart.set([...rgb,255],((Number(y)+dy)*210+Number(x)+dx)*4);
}
assert.deepEqual(detectMarkers({data:chart,width:210,height:297}),[[15,15],[195,15],[195,282],[15,282]]);
assert.equal(alignmentCheck([[0,0],[180,0],[180,267],[0,267]]).retake,false);
assert.equal(alignmentCheck([[30,0],[150,0],[180,267],[0,267]]).retake,true);
assert.equal(alignmentCheck([[0,0],[180,0],[180,150],[0,150]]).retake,true);
assert.equal(alignmentCheck([]),null);
assert.equal(alignmentCheck([[0,0],[0,0],[0,0],[0,0]]),null);
const rotated=[[0,0],[180,0],[180,267],[0,267]].map(([x,y])=>[x*Math.cos(.3)-y*Math.sin(.3)+90,x*Math.sin(.3)+y*Math.cos(.3)+40]);
assert.equal(alignmentCheck(rotated).retake,false);
console.log('Camera tests OK: projective mapping, scale, marker detection, missing markers, invalid points, A4 dimensions.');
