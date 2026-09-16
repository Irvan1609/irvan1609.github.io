import jStat from 'jstat';

function logGamma(z){
  const c=[676.5203681218851,-1259.1392167224028,771.32342877765313,-176.6150291621406,12.507343278686905,-0.13857109526572012,9.984369578019571e-6,1.5056327351493116e-7];
  if(z<.5)return Math.log(Math.PI)-Math.log(Math.sin(Math.PI*z))-logGamma(1-z);
  z-=1;let x=.99999999999980993;for(let i=0;i<c.length;i++)x+=c[i]/(z+i+1);const t=z+c.length-.5;return .5*Math.log(2*Math.PI)+(z+.5)*Math.log(t)-t+Math.log(x);
}
function noncentralFCdf(x,df1,df2,lambda){
  if(!(x>=0)||!(df1>0)||!(df2>0)||!(lambda>=0))return NaN;if(lambda<1e-12)return jStat.centralF.cdf(x,df1,df2);
  const mu=lambda/2,sd=Math.sqrt(mu),lo=Math.max(0,Math.floor(mu-12*sd-30)),hi=Math.ceil(mu+12*sd+30),z=df1*x/(df1*x+df2);let total=0;
  for(let j=lo;j<=hi;j++){const logw=-mu+j*Math.log(mu)-logGamma(j+1),w=Math.exp(logw);if(w<1e-16&&j>mu+8*sd)continue;total+=w*jStat.ibeta(z,df1/2+j,df2/2);}
  return Math.max(0,Math.min(1,total));
}
export function oneWayAnovaPower({groups,replicates,effectSize,alpha=.05}){
  const k=Math.floor(groups),r=Math.floor(replicates),f=Number(effectSize);if(k<2||r<2||!(f>0)||!(alpha>0&&alpha<1))throw Error('Power ANOVA memerlukan ≥2 perlakuan, ≥2 ulangan, effect size f > 0, dan 0 < α < 1.');
  const N=k*r,df1=k-1,df2=N-k,critical=jStat.centralF.inv(1-alpha,df1,df2),lambda=N*f*f,power=1-noncentralFCdf(critical,df1,df2,lambda);
  return {groups:k,replicates:r,N,effectSize:f,alpha,df1,df2,critical,lambda,power};
}
export function effectSizeFromMeans(means,sigma){
  const m=means.map(Number);if(m.length<2||m.some(v=>!Number.isFinite(v))||!(sigma>0))throw Error('Masukkan minimal dua rataan perlakuan numerik dan SD dalam-perlakuan > 0.');
  const grand=m.reduce((a,b)=>a+b,0)/m.length,variance=m.reduce((s,v)=>s+(v-grand)**2,0)/m.length,f=Math.sqrt(variance)/sigma;return {means:m,grand,sigma,f};
}
export function requiredReplicates({groups,effectSize,alpha=.05,targetPower=.8,maxReplicates=200}){
  if(!(targetPower>.5&&targetPower<1))throw Error('Target power harus antara 0,50 dan 1,00.');
  for(let r=2;r<=maxReplicates;r++){const result=oneWayAnovaPower({groups,replicates:r,effectSize,alpha});if(result.power>=targetPower)return {...result,targetPower};}
  return null;
}
export function powerCurve({groups,effectSize,alpha=.05,maxReplicates=20}){return Array.from({length:Math.max(1,maxReplicates-1)},(_,i)=>oneWayAnovaPower({groups,replicates:i+2,effectSize,alpha}));}
