import assert from 'node:assert/strict';
import fs from 'node:fs';
import {alignmentCheck} from '../public/pengukur/alignment.js';
import {cameraGuide,installLiveCamera} from '../public/pengukur/live-camera.js';
import {WIDTH,HEIGHT,PPM,homography,project,detectMarkers} from '../public/pengukur/geometry.js';
import {PAPER_SIZES,paperProfile,buildCalibratorSvg,grayPatchRects} from '../public/pengukur/paper.js';
import {imageQuality,segmentObject,morphology,repeatability} from '../public/pengukur/image-tools.js';

const p=[[45,30],[620,100],[590,910],[100,800]],h=homography(p);
[[0,0],[WIDTH,0],[WIDTH,HEIGHT],[0,HEIGHT]].forEach((q,i)=>{const v=project(h,...q);assert.ok(Math.hypot(v[0]-p[i][0],v[1]-p[i][1])<1e-7);});
const a3=paperProfile('a3','portrait'),ha3=homography(p,a3.activeWidth,a3.activeHeight);
assert.ok(project(ha3,a3.activeWidth,a3.activeHeight).every((v,i)=>Math.abs(v-p[2][i])<1e-7));
assert.equal(100*PPM,500);

for(const id of ['a5','a4','a3','letter','legal','f4']){
  assert.ok(PAPER_SIZES[id]);
  const profile=paperProfile(id);
  assert.ok(profile.activeWidth>0&&profile.activeHeight>0);
  const svg=buildCalibratorSvg(profile);
  assert.match(svg,new RegExp('width="'+String(profile.width).replace('.','\\.')+'mm"'));
  assert.match(svg,/GARIS CEK/);
  assert.match(svg,/>10<\/text>/);
  assert.match(svg,/v 1\.25/);
  assert.equal(grayPatchRects(profile).length,6);
}
const custom=paperProfile('custom','landscape',{width:200,height:300,margin:20});
assert.equal(custom.width,300);assert.equal(custom.height,200);assert.equal(custom.activeWidth,260);assert.equal(custom.activeHeight,160);

const data=new Uint8ClampedArray(210*297*4);data.fill(255);
for(const [x,y] of [[15,15],[195,15],[195,282],[15,282]])for(let dy=-3;dy<=3;dy++)for(let dx=-3;dx<=3;dx++){const i=((y+dy)*210+x+dx)*4;data[i]=208;data[i+1]=0;data[i+2]=208;data[i+3]=255;}
assert.deepEqual(detectMarkers({data,width:210,height:297}),[[15,15],[195,15],[195,282],[15,282]]);
assert.throws(()=>homography([[0,0],[1,1],[2,2],[3,3]]));
assert.equal(alignmentCheck([[0,0],[180,0],[180,267],[0,267]],180/267).retake,false);
assert.equal(alignmentCheck([[30,0],[150,0],[180,267],[0,267]],180/267).retake,true);
assert.equal(alignmentCheck([],180/267),null);

const profile=paperProfile('a4'),target=cameraGuide(null,480,640,profile).target;
assert.equal(cameraGuide(target,480,640,profile).ready,true);
assert.equal(cameraGuide(null,480,640,profile).ready,false);

const qImage={width:64,height:64,data:new Uint8ClampedArray(64*64*4)};
for(let y=0;y<64;y++)for(let x=0;x<64;x++){const i=4*(y*64+x),v=(x+y)%2?75:205;qImage.data.set([v,v,v,255],i);}
const quality=imageQuality(qImage,target,alignmentCheck(target,profile.activeWidth/profile.activeHeight));
assert.ok(quality.score>=0&&quality.score<=100);
assert.ok(Number.isFinite(quality.sharpness));

const seg={width:40,height:40,data:new Uint8ClampedArray(40*40*4)};
for(let y=0;y<40;y++)for(let x=0;x<40;x++){const i=4*(y*40+x),inside=x>=10&&x<30&&y>=12&&y<28;seg.data.set(inside?[50,150,60,255]:[245,245,245,255],i);}
const mask=segmentObject(seg,20,20,30),metrics=morphology(mask,40,40,5);
assert.ok(metrics.area>12&&metrics.area<14);
assert.ok(metrics.perimeter>10);
assert.ok(metrics.feret>metrics.minFeret);
assert.ok(metrics.circularity>0&&metrics.circularity<=1.2);
const rep=repeatability([{sampleId:'S1',type:'length',primaryValue:10},{sampleId:'S1',type:'length',primaryValue:11},{sampleId:'S2',type:'length',primaryValue:9}]);
assert.equal(rep.length,1);assert.equal(rep[0].n,2);

const html=fs.readFileSync('public/pengukur/index.html','utf8');
const app=fs.readFileSync('public/pengukur/app.js','utf8');
const style=fs.readFileSync('public/pengukur/style.css','utf8');
const old=fs.readFileSync('public/kamera-pengukur/index.html','utf8');
for(const marker of ['paperSize','A5','A4','A3','Letter','Legal','F4 / Folio','autoCapture','qualityGate','objectPreset','segmentThreshold','exportCsv','sendField'])assert.ok(html.includes(marker),'Pengukur HTML missing '+marker);
for(const marker of ['segmentObject','morphology','normalizeGrayPatches','repeatability','BarcodeDetector','agrotik-field-handoff','batchFiles','calibration','fieldContext'])assert.ok(app.includes(marker),'Pengukur app missing '+marker);
for(const marker of ['measure-toolbar','morphology-card','quality-gate','repeatability','@media(max-width:820px)'])assert.ok(style.includes(marker),'Pengukur CSS missing '+marker);
assert.ok(old.includes('/pengukur/'),'Legacy camera route must redirect to /pengukur/');

// Closing while camera permission is pending must release the late stream.
const elements=Object.fromEntries(['openLive','closeLive','takeLive','livePanel','liveVideo','liveOverlay','liveStatus','liveQuality','autoCapture'].map(id=>[id,{disabled:false,hidden:false,checked:false,textContent:'',innerHTML:'',focus(){},getContext(){return {clearRect(){}};},play:async()=>{}}]));
const documentEvents={},windowEvents={};
globalThis.document={getElementById:id=>elements[id],createElement:()=>({getContext:()=>({})}),addEventListener:(n,f)=>documentEvents[n]=f};
globalThis.window={addEventListener:(n,f)=>windowEvents[n]=f};
let resolveCamera,stopped=0;
Object.defineProperty(globalThis,'navigator',{configurable:true,value:{mediaDevices:{getUserMedia:()=>new Promise(resolve=>resolveCamera=resolve)}}});
installLiveCamera({onCapture:()=>assert.fail('No capture expected'),getProfile:()=>profile});
const opening=elements.openLive.onclick();elements.closeLive.onclick();resolveCamera({getTracks:()=>[{stop:()=>stopped++}]});await opening;
assert.equal(stopped,1);assert.equal(elements.livePanel.hidden,true);
console.log('Pengukur tests OK: multi-paper calibration, projective mapping, quality gate, morphology, repeatability, camera lifecycle and legacy redirect.');
