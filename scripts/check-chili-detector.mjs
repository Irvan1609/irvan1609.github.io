import assert from 'node:assert/strict';
import {detectChiliBoxesFromImageData} from '../public/hitung-cabai/detector.js';

const width=180,height=120,data=new Uint8ClampedArray(width*height*4);
for(let i=0;i<data.length;i+=4){data[i]=242;data[i+1]=242;data[i+2]=238;data[i+3]=255;}
function rect(x1,y1,x2,y2,r,g,b){
  for(let y=y1;y<y2;y++)for(let x=x1;x<x2;x++){
    const i=(y*width+x)*4;data[i]=r;data[i+1]=g;data[i+2]=b;data[i+3]=255;
  }
}
rect(18,20,31,78,210,35,28);
rect(92,32,108,98,40,142,55);
rect(145,15,160,50,35,70,190);

const all=detectChiliBoxesFromImageData({data,width,height},{target:'all',sensitivity:'normal'});
assert.equal(all.boxes.length,2);
assert.ok(all.boxes.every(box=>box.length===4&&box.every(Number.isFinite)));
const red=detectChiliBoxesFromImageData({data,width,height},{target:'red',sensitivity:'normal'});
assert.equal(red.boxes.length,1);
const green=detectChiliBoxesFromImageData({data,width,height},{target:'green',sensitivity:'normal'});
assert.equal(green.boxes.length,1);
assert.throws(()=>detectChiliBoxesFromImageData({data:new Uint8ClampedArray(),width:0,height:0}));
console.log('Chili detector identifies red/green peppers and ignores blue foreground.');
