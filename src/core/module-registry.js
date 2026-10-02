import {createEventBus} from './events.js';
import {ERROR_CODES,AgrotikError} from './errors.js';

export function createModuleRegistry({bus=createEventBus()}={}){
  const modules=new Map();
  return Object.freeze({
    register(definition){
      const name=String(definition?.name||'').trim();
      if(!name)throw new AgrotikError(ERROR_CODES.CORE_MODULE_LOAD,'Nama module wajib diisi.');
      if(modules.has(name))throw new AgrotikError(ERROR_CODES.CORE_MODULE_LOAD,'Module '+name+' sudah terdaftar.');
      const record={version:'1.0.0',capabilities:[],...definition,name,state:'registered'};
      modules.set(name,record);
      bus.emit('module:registered',{name,capabilities:[...(record.capabilities||[])]});
      return record;
    },
    get(name){return modules.get(String(name||''))||null;},
    list(){return [...modules.values()].map(item=>({...item}));},
    async activate(name,context={}){
      const item=modules.get(String(name||''));
      if(!item)throw new AgrotikError(ERROR_CODES.CORE_MODULE_LOAD,'Module '+name+' tidak ditemukan.');
      if(item.state==='active')return item;
      try{
        await item.initialize?.(context);
        await item.activate?.(context);
        item.state='active';
        bus.emit('module:active',{name:item.name});
        return item;
      }catch(error){
        item.state='error';
        bus.emit('module:error',{name:item.name,error});
        throw error;
      }
    },
    deactivate(name,context={}){
      const item=modules.get(String(name||''));
      if(!item)return false;
      try{item.deactivate?.(context);}finally{item.state='inactive';}
      return true;
    }
  });
}
