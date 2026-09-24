const clean=value=>String(value??'').trim();

function splitUnit(text){
  const value=clean(text);
  const match=value.match(/^(.*?)\s*\(([^()]*)\)\s*$/);
  if(!match||!clean(match[2]))return {text:value,unit:''};
  return {text:clean(match[1]),unit:clean(match[2])};
}

export function normalizeParameterUnit(value){
  const unit=clean(value);
  const wrapped=unit.match(/^\((.*)\)$/);
  return clean(wrapped?wrapped[1]:unit);
}

export function parseParameterHeader(header){
  const raw=clean(header);
  if(!raw)return {raw:'',code:'',name:'',unit:''};
  const divider=raw.indexOf('|');
  if(divider>=0){
    const code=clean(raw.slice(0,divider)),detail=splitUnit(raw.slice(divider+1));
    return {raw,code,name:detail.text,unit:detail.unit};
  }
  const plain=splitUnit(raw);
  return {raw,code:plain.text||raw,name:'',unit:plain.unit};
}

export function buildParameterHeader({code,name='',unit=''}={}){
  const short=clean(code),full=clean(name),normalizedUnit=normalizeParameterUnit(unit);
  if(!short)return '';
  const suffix=normalizedUnit?` (${normalizedUnit})`:'';
  return full?`${short} | ${full}${suffix}`:`${short}${suffix}`;
}

export function parameterLongName(header,{includeUnit=true}={}){
  const meta=parseParameterHeader(header),base=meta.name||meta.code||'Parameter';
  return includeUnit&&meta.unit?`${base} (${meta.unit})`:base;
}

export function parameterReportTitle(header){
  const meta=parseParameterHeader(header),long=parameterLongName(header);
  return meta.name&&meta.code&&meta.code!==meta.name?`${meta.code} — ${long}`:long;
}

export function parameterUnit(header){
  return parseParameterHeader(header).unit;
}
