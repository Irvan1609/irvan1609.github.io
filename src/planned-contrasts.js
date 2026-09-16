import {sum,fTail} from './statistics-engine.js';

const EPS=1e-8;

function validateContrast(row,index,n){
  const name=String(row?.name??'').trim()||`Kontras ${index+1}`;
  const coefficients=Array.isArray(row?.coefficients)?row.coefficients:[];
  if(coefficients.length!==n||coefficients.some(x=>!Number.isFinite(x))){
    throw Error(`${name}: jumlah koefisien harus sama dengan jumlah taraf perlakuan (${n}) dan semuanya harus berupa angka.`);
  }
  const scale=Math.max(1,...coefficients.map(Math.abs));
  if(coefficients.every(x=>x===0))throw Error(`${name}: koefisien tidak boleh semuanya nol.`);
  if(Math.abs(sum(coefficients))>1e-9*scale)throw Error(`${name}: jumlah koefisien harus nol.`);
  return {name,coefficients};
}

function validateItems(items){
  if(!Array.isArray(items)||items.length<2)throw Error('Uji kontras memerlukan minimal dua taraf perlakuan.');
  items.forEach((item,index)=>{
    if(!Number.isFinite(item?.mean))throw Error(`Taraf ${index+1}: rataan perlakuan tidak valid.`);
    if(!Number.isInteger(item?.n)||item.n<1)throw Error(`Taraf ${index+1}: jumlah pengamatan harus berupa bilangan bulat positif.`);
  });
}

export function plannedContrastsFlexible(items,matrix,mse,df){
  validateItems(items);
  const n=items.length;
  if(!Array.isArray(matrix)||!matrix.length)throw Error('Masukkan minimal satu uji kontras terencana.');
  if(matrix.length>50)throw Error('Maksimal 50 uji kontras dalam satu analisis.');
  if(!Number.isFinite(mse)||!(mse>0)||!Number.isInteger(df)||df<1)throw Error('Galat percobaan tidak cukup untuk menghitung uji kontras.');
  const rows=matrix.map((row,i)=>validateContrast(row,i,n));
  const contrasts=rows.map(row=>{
    const estimate=sum(items.map((item,i)=>row.coefficients[i]*item.mean));
    const divisor=sum(items.map((item,i)=>row.coefficients[i]**2/item.n));
    if(!Number.isFinite(divisor)||!(divisor>0))throw Error(`${row.name}: ragam kontras tidak dapat dihitung dari jumlah pengamatan yang tersedia.`);
    const variance=mse*divisor;
    const se=Math.sqrt(variance);
    const f=estimate**2/variance;
    return {...row,estimate,se,ss:estimate**2/divisor,f,df:1,denDf:df,p:fTail(f,1,df)};
  });
  const nonOrthogonalPairs=[];
  for(let i=0;i<rows.length;i++)for(let j=i+1;j<rows.length;j++){
    const covariance=sum(items.map((item,k)=>rows[i].coefficients[k]*rows[j].coefficients[k]/item.n));
    const norm=Math.sqrt(
      sum(items.map((item,k)=>rows[i].coefficients[k]**2/item.n))*
      sum(items.map((item,k)=>rows[j].coefficients[k]**2/item.n))
    );
    if(norm>0&&Math.abs(covariance)>EPS*norm)nonOrthogonalPairs.push([rows[i].name,rows[j].name]);
  }
  return {contrasts,nonOrthogonalPairs};
}
