const normalized=name=>String(name??'').trim().toLowerCase();

export function isUniqueColumnName(headers,name,excludeIndex=-1){
  const target=normalized(name);
  if(!target)return false;
  return !headers.some((header,index)=>index!==excludeIndex&&normalized(header)===target);
}

export function nextColumnName(headers){
  const used=new Set(headers.map(normalized));
  let number=headers.length+1;
  while(used.has(`variable${number}`))number++;
  return `Variable${number}`;
}
