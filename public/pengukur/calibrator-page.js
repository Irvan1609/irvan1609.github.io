import {paperProfile,calibratorLayout,buildCalibratorSvg,buildLensCheckerboardSvg} from './paper.js';
const q=new URLSearchParams(location.search),id=q.get('paper')||'a4',orientation=q.get('orientation')||'portrait',target=q.get('target')||'measure';
const custom=id==='custom'?{width:Number(q.get('width'))||210,height:Number(q.get('height'))||297,margin:Number(q.get('margin'))||15}:null;
const profile=paperProfile(id,orientation,custom),labelInput=document.getElementById('printLabel');
let label=String(q.get('label')||'').slice(0,80),svg='';
function render(){
  svg=target==='lens'?buildLensCheckerboardSvg(profile):buildCalibratorSvg(profile,{id:'AGROTIK-CAL-V4-'+profile.id.toUpperCase(),label});
  document.getElementById('sheet').innerHTML=svg;
}
document.documentElement.style.setProperty('--paper-w',profile.width+'mm');document.documentElement.style.setProperty('--paper-h',profile.height+'mm');
const style=document.createElement('style');style.textContent='@page{size:'+profile.width+'mm '+profile.height+'mm;margin:0}';document.head.appendChild(style);
if(labelInput){labelInput.value=label;labelInput.closest('label').hidden=target==='lens';labelInput.oninput=()=>{label=labelInput.value.slice(0,80);render();};}
render();
const layout=calibratorLayout(profile);
document.getElementById('note').textContent=target==='lens'?profile.name+' '+profile.width+' × '+profile.height+' mm · target checkerboard lensa. Cetak 100% / actual size; ambil foto pada beberapa posisi/sudut untuk evaluasi distorsi.':profile.name+' '+(profile.orientation==='portrait'?'Portrait':'Landscape')+' · '+profile.width+' × '+profile.height+' mm · area foto '+layout.photo.width.toFixed(0)+' × '+layout.photo.height.toFixed(0)+' mm. Marker, patch warna, grayscale, dan garis cek berada di luar area foto; hanya penggaris dan label yang masuk hasil ekspor.';
document.getElementById('print').onclick=()=>window.print();
document.getElementById('download').onclick=()=>{const blob=new Blob([svg],{type:'image/svg+xml'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=(target==='lens'?'target-lensa-':'kalibrator-')+profile.id+'-'+profile.orientation+'.svg';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
