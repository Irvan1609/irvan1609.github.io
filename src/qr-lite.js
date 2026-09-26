const VERSION=3,SIZE=29,DATA_CODEWORDS=55,EC_CODEWORDS=15;
const gfExp=new Array(512),gfLog=new Array(256);
let x=1;
for(let i=0;i<255;i++){gfExp[i]=x;gfLog[x]=i;x<<=1;if(x&0x100)x^=0x11d;}
for(let i=255;i<512;i++)gfExp[i]=gfExp[i-255];
const mul=(a,b)=>a&&b?gfExp[gfLog[a]+gfLog[b]]:0;

function generator(degree){
  let poly=[1];
  for(let i=0;i<degree;i++){
    const next=new Array(poly.length+1).fill(0);
    for(let j=0;j<poly.length;j++){next[j]^=poly[j];next[j+1]^=mul(poly[j],gfExp[i]);}
    poly=next;
  }
  return poly;
}
function ecBytes(data,degree){
  const gen=generator(degree),work=[...data,...Array(degree).fill(0)];
  for(let i=0;i<data.length;i++){
    const factor=work[i];if(!factor)continue;
    for(let j=0;j<gen.length;j++)work[i+j]^=mul(gen[j],factor);
  }
  return work.slice(data.length);
}
function bitsToBytes(text){
  const bytes=[...new TextEncoder().encode(text)];
  if(bytes.length>53)throw Error('Isi QR terlalu panjang.');
  const bits=[],push=(value,count)=>{for(let i=count-1;i>=0;i--)bits.push((value>>>i)&1);};
  push(0b0100,4);push(bytes.length,8);for(const byte of bytes)push(byte,8);
  for(let i=0;i<Math.min(4,DATA_CODEWORDS*8-bits.length);i++)bits.push(0);
  while(bits.length%8)bits.push(0);
  const data=[];for(let i=0;i<bits.length;i+=8){let byte=0;for(let j=0;j<8;j++)byte=(byte<<1)|(bits[i+j]||0);data.push(byte);}
  let pad=0;while(data.length<DATA_CODEWORDS)data.push(pad++%2?0x11:0xec);
  return data;
}
function bchDigit(value){let digit=0;while(value){digit++;value>>>=1;}return digit;}
function formatBits(mask){
  const data=(1<<3)|mask,g=0x537;let d=data<<10;
  while(bchDigit(d)-bchDigit(g)>=0)d^=g<<(bchDigit(d)-bchDigit(g));
  return ((data<<10)|d)^0x5412;
}
function matrix(){
  return Array.from({length:SIZE},()=>Array(SIZE).fill(null));
}
function finder(m,row,col){
  for(let r=-1;r<=7;r++)for(let c=-1;c<=7;c++){
    const rr=row+r,cc=col+c;if(rr<0||rr>=SIZE||cc<0||cc>=SIZE)continue;
    m[rr][cc]=(r>=0&&r<=6&&c>=0&&c<=6&&(r===0||r===6||c===0||c===6||(r>=2&&r<=4&&c>=2&&c<=4)));
  }
}
function alignment(m,row,col){
  for(let r=-2;r<=2;r++)for(let c=-2;c<=2;c++)if(m[row+r][col+c]===null)m[row+r][col+c]=Math.max(Math.abs(r),Math.abs(c))!==1;
}
function setupFunctions(m){
  finder(m,0,0);finder(m,SIZE-7,0);finder(m,0,SIZE-7);
  alignment(m,22,22);
  for(let i=8;i<SIZE-8;i++){if(m[i][6]===null)m[i][6]=i%2===0;if(m[6][i]===null)m[6][i]=i%2===0;}
  for(let i=0;i<15;i++){
    if(i<6)m[i][8]=false;else if(i<8)m[i+1][8]=false;else m[SIZE-15+i][8]=false;
    if(i<8)m[8][SIZE-i-1]=false;else if(i<9)m[8][15-i]=false;else m[8][15-i-1]=false;
  }
  m[SIZE-8][8]=true;
}
function putFormat(m,mask){
  const bits=formatBits(mask);
  for(let i=0;i<15;i++){
    const bit=((bits>>i)&1)===1;
    if(i<6)m[i][8]=bit;else if(i<8)m[i+1][8]=bit;else m[SIZE-15+i][8]=bit;
    if(i<8)m[8][SIZE-i-1]=bit;else if(i<9)m[8][15-i]=bit;else m[8][15-i-1]=bit;
  }
  m[SIZE-8][8]=true;
}
function maskBit(mask,row,col){
  if(mask===0)return (row+col)%2===0;
  if(mask===1)return row%2===0;
  if(mask===2)return col%3===0;
  if(mask===3)return (row+col)%3===0;
  if(mask===4)return (Math.floor(row/2)+Math.floor(col/3))%2===0;
  if(mask===5)return (row*col)%2+(row*col)%3===0;
  if(mask===6)return ((row*col)%2+(row*col)%3)%2===0;
  return ((row*col)%3+(row+col)%2)%2===0;
}
function placeData(m,codewords,mask){
  const bits=[];for(const byte of codewords)for(let i=7;i>=0;i--)bits.push((byte>>>i)&1);
  let bit=0,row=SIZE-1,inc=-1;
  for(let col=SIZE-1;col>0;col-=2){
    if(col===6)col--;
    while(true){
      for(let c=0;c<2;c++){
        const cc=col-c;if(m[row][cc]!==null)continue;
        let value=bit<bits.length?bits[bit++]:0;if(maskBit(mask,row,cc))value^=1;m[row][cc]=value===1;
      }
      row+=inc;if(row<0||row>=SIZE){row-=inc;inc=-inc;break;}
    }
  }
}
function penalty(m){
  let score=0;
  for(let r=0;r<SIZE;r++){let run=1;for(let c=1;c<SIZE;c++){if(m[r][c]===m[r][c-1])run++;else{if(run>=5)score+=3+run-5;run=1;}}if(run>=5)score+=3+run-5;}
  for(let c=0;c<SIZE;c++){let run=1;for(let r=1;r<SIZE;r++){if(m[r][c]===m[r-1][c])run++;else{if(run>=5)score+=3+run-5;run=1;}}if(run>=5)score+=3+run-5;}
  for(let r=0;r<SIZE-1;r++)for(let c=0;c<SIZE-1;c++){const v=m[r][c];if(m[r+1][c]===v&&m[r][c+1]===v&&m[r+1][c+1]===v)score+=3;}
  const pattern=[true,false,true,true,true,false,true];
  for(let r=0;r<SIZE;r++)for(let c=0;c<=SIZE-7;c++)if(pattern.every((v,i)=>m[r][c+i]===v))score+=40;
  for(let c=0;c<SIZE;c++)for(let r=0;r<=SIZE-7;r++)if(pattern.every((v,i)=>m[r+i][c]===v))score+=40;
  const dark=m.flat().filter(Boolean).length,percent=dark/(SIZE*SIZE)*100;score+=Math.floor(Math.abs(percent-50)/5)*10;
  return score;
}
export function qrMatrix(text){
  const data=bitsToBytes(text),codewords=[...data,...ecBytes(data,EC_CODEWORDS)];
  let best=null,bestScore=Infinity;
  for(let mask=0;mask<8;mask++){
    const m=matrix();setupFunctions(m);placeData(m,codewords,mask);putFormat(m,mask);const score=penalty(m);
    if(score<bestScore){best=m;bestScore=score;}
  }
  return best;
}
export function qrSvg(text,{moduleSize=4,margin=4}={}){
  const m=qrMatrix(text),size=(SIZE+margin*2)*moduleSize;
  let path='';
  for(let r=0;r<SIZE;r++)for(let c=0;c<SIZE;c++)if(m[r][c])path+=`M${(c+margin)*moduleSize} ${(r+margin)*moduleSize}h${moduleSize}v${moduleSize}h-${moduleSize}z`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="white"/><path d="${path}" fill="black"/></svg>`;
}
