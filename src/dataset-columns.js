const normalized=name=>String(name??'').normalize('NFKC').trim().toLowerCase();

export function isUniqueColumnName(headers,name,excludeIndex=-1){
  const target=normalized(name);
  if(!target)return false;
  return !headers.some((header,index)=>index!==excludeIndex&&normalized(header)===target);
}

export function validateColumnNames(headers){
  const clean=headers.map(name=>String(name??'').trim());
  if(!clean.length||clean.some(name=>!name))throw Error('Judul kolom harus terisi.');
  if(clean.some((name,index)=>!isUniqueColumnName(clean,name,index))){
    throw Error('Judul kolom harus unik tanpa membedakan huruf besar-kecil atau bentuk Unicode (misalnya “Produksi” dan “produksi” dianggap sama).');
  }
  return clean;
}

export function nextColumnName(headers){
  const used=new Set(headers.map(normalized));
  let number=headers.length+1;
  while(used.has(`variable${number}`))number++;
  return `Variable${number}`;
}
