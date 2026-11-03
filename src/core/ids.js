const UUID_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function createUid(prefix='id'){
  const raw=globalThis.crypto?.randomUUID?.()||String(Date.now())+'-'+Math.random().toString(16).slice(2);
  return String(prefix||'id')+'_'+raw;
}
export function isUid(value,prefix=''){
  const text=String(value||'');
  if(!prefix)return UUID_RE.test(text)||/^[a-z][a-z0-9_-]+_[^\s]+$/i.test(text);
  return text.startsWith(String(prefix)+'_')&&text.length>String(prefix).length+1;
}
export function nowIso(){return new Date().toISOString();}
