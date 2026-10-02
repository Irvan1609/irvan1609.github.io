export function createOverlayManager(root=document){
  let active=null;
  const closeOthers=(except=null)=>{
    for(const element of root.querySelectorAll?.('[data-agrotik-overlay="true"]')||[]){
      if(element===except)continue;
      element.hidden=true;element.classList.remove('open');
    }
    if(active&&active!==except){active.hidden=true;active.classList.remove('open');}
    active=except;
  };
  return Object.freeze({
    register(element){
      if(!element)return()=>{};
      element.dataset.agrotikOverlay='true';
      return()=>{if(active===element)active=null;element.hidden=true;element.classList.remove('open');};
    },
    open(element){if(!element)return;closeOthers(element);element.hidden=false;element.classList.add('open');active=element;},
    close(){closeOthers(null);},
    active(){return active;}
  });
}

export function bindOverlayManager(manager,{root=document}={}){
  if(!manager)return()=>{};
  const onClick=event=>{
    const trigger=event.target.closest?.('[data-agrotik-overlay-open]');
    if(trigger){const selector=trigger.getAttribute('data-agrotik-overlay-open');const element=root.querySelector(selector);if(element){manager.open(element);event.preventDefault();return;}}
    const close=event.target.closest?.('[data-agrotik-overlay-close]');
    if(close){manager.close();event.preventDefault();return;}
  };
  root.addEventListener('click',onClick);
  return()=>root.removeEventListener('click',onClick);
}
