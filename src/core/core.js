import {createEventBus} from './events.js';
import {createModuleRegistry} from './module-registry.js';
import {createOverlayManager} from './overlay-manager.js';
import {createSettingsStore} from './settings.js';
import {SCHEMAS} from './schema.js';

export function createAgrotikCore({root=document,storage=globalThis.localStorage}={}){
  const bus=createEventBus(root);
  const modules=createModuleRegistry({bus});
  const overlays=createOverlayManager(root);
  const settings=createSettingsStore({storage});
  return Object.freeze({version:'1.0.0',schemas:SCHEMAS,bus,modules,overlays,settings});
}

export const agrotikCore=createAgrotikCore();
if(typeof globalThis!=='undefined')globalThis.AgrotikCore=agrotikCore;
