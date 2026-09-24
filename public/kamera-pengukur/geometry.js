export const WIDTH=180, HEIGHT=267, PPM=5;
export function homography(points){
 if(points.length!==4||points.some(p=>p.length!==2||!p.every(Number.isFinite)))throw Error('Empat titik diperlukan.');
 const crosses=points.map((p,i)=>{const q=points[(i+1)%4],r=points[(i+2)%4];return(q[0]-p[0])*(r[1]-q[1])-(q[1]-p[1])*(r[0]-q[0]);});
 if(crosses.some(x=>x<=1))throw Error('Urutkan titik kiri atas, kanan atas, kanan bawah, kiri bawah.');
 const rect=[[0,0],[WIDTH,0],[WIDTH,HEIGHT],[0,HEIGHT]],a=[];
 rect.forEach(([x,y],i)=>{const [u,v]=points[i];a.push([x,y,1,0,0,0,-u*x,-u*y,u],[0,0,0,x,y,1,-v*x,-v*y,v]);});
 for(let c=0;c<8;c++){let p=c;for(let j=c+1;j<8;j++)if(Math.abs(a[j][c])>Math.abs(a[p][c]))p=j;
 if(Math.abs(a[p][c])<1e-10)throw Error('Posisi titik tidak valid.');[a[c],a[p]]=[a[p],a[c]];const d=a[c][c];for(let j=c;j<=8;j++)a[c][j]/=d;
 for(let i=0;i<8;i++)if(i!==c){const m=a[i][c];for(let j=c;j<=8;j++)a[i][j]-=m*a[c][j];}}
 return a.map(r=>r[8]);
}
export function project(h,x,y){const d=h[6]*x+h[7]*y+1;return [(h[0]*x+h[1]*y+h[2])/d,(h[3]*x+h[4]*y+h[5])/d];}
export function detectMarkers({data,width,height}){
 const mask=new Uint8Array(width*height),seen=new Uint8Array(mask.length),clusters=[];
 for(let i=0;i<mask.length;i++){const r=data[4*i],g=data[4*i+1],b=data[4*i+2];mask[i]=r>85&&b>65&&r>g*1.45&&b>g*1.35&&Math.abs(r-b)<110?1:0;}
 for(let i=0;i<mask.length;i++){if(!mask[i]||seen[i])continue;const stack=[i];seen[i]=1;let n=0,sx=0,sy=0,minX=width,maxX=0,minY=height,maxY=0;
 while(stack.length){const k=stack.pop(),x=k%width,y=Math.floor(k/width);n++;sx+=x;sy+=y;minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);
 for(const j of [x>0?k-1:-1,x<width-1?k+1:-1,y>0?k-width:-1,y<height-1?k+width:-1])if(j>=0&&mask[j]&&!seen[j]){seen[j]=1;stack.push(j);}}
 const w=maxX-minX+1,h=maxY-minY+1;if(n>=8&&n<mask.length*.025&&w/h>.35&&w/h<2.8&&n/(w*h)>.35)clusters.push({n,p:[sx/n,sy/n]});}
 if(clusters.length!==4)throw Error('Empat penanda belum terdeteksi dengan pasti. Pilih titik secara manual atau ambil ulang foto.');
 clusters.sort((a,b)=>a.p[1]-b.p[1]);const top=clusters.slice(0,2).sort((a,b)=>a.p[0]-b.p[0]),bottom=clusters.slice(2).sort((a,b)=>a.p[0]-b.p[0]);
 const points=[top[0].p,top[1].p,bottom[1].p,bottom[0].p];homography(points);return points;
}
