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

// Imported sheets may contain duplicate or blank headings. Resolve names only,
// preserving column order and every original cell value. Manual renaming stays strict.
export function prepareImportedColumnNames(headers){
  if(!Array.isArray(headers)||!headers.length)throw Error('Data tidak memiliki kolom.');
  const originals=headers.map(name=>String(name??'').trim());
  const reserved=new Set(originals.filter(Boolean).map(normalized));
  const used=new Set(),renamed=[];
  const clean=originals.map((original,index)=>{
    let name=original;
    if(!name){
      let number=index+1;
      name='Variable'+number;
      while(reserved.has(normalized(name))||used.has(normalized(name)))name='Variable'+(++number);
    }else if(used.has(normalized(name))){
      let number=2;
      do{name=original+' ('+(number++)+')';}
      while(reserved.has(normalized(name))||used.has(normalized(name)));
    }
    used.add(normalized(name));
    if(name!==original)renamed.push({index,from:original,to:name});
    return name;
  });
  validateColumnNames(clean);
  return {headers:clean,renamed};
}
