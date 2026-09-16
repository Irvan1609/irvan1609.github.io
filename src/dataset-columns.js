export function nextColumnName(headers){
  const used=new Set(headers.map(name=>String(name).trim().toLowerCase()));
  let number=headers.length+1;
  while(used.has(`variable${number}`))number++;
  return `Variable${number}`;
}
