const PREFIX='agrotik:settings:';
export function createSettingsStore({storage=globalThis.localStorage,prefix=PREFIX}={}){
  const read=(key,fallback)=>{
    try{const value=JSON.parse(storage?.getItem?.(prefix+key)||'null');return value??fallback;}catch{return fallback;}
  };
  const write=(key,value)=>{
    try{storage?.setItem?.(prefix+key,JSON.stringify(value));return true;}catch{return false;}
  };
  return Object.freeze({
    get(key,fallback=null){return read(key,fallback);},
    set(key,value){return write(key,value);},
    remove(key){try{storage?.removeItem?.(prefix+key);return true;}catch{return false;}}
  });
}
