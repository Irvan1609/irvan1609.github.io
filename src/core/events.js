export function createEventBus(target=document){
  const listeners=new Map();
  return Object.freeze({
    on(type,handler){
      if(typeof handler!=='function')return()=>{};
      const set=listeners.get(type)||new Set();
      set.add(handler);listeners.set(type,set);
      return()=>set.delete(handler);
    },
    emit(type,detail={}){
      for(const handler of [...(listeners.get(type)||[])]){try{handler(detail);}catch(error){target?.dispatchEvent?.(new CustomEvent('agrotik-core-error',{detail:{source:type,error}}));}}
      target?.dispatchEvent?.(new CustomEvent('agrotik:'+String(type),{detail}));
    },
    off(type,handler){listeners.get(type)?.delete(handler);}
  });
}
