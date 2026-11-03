(()=>{
  const boot=()=>{
    const shell=document.querySelector('.game-shell');
    const root=document.getElementById('floatingGameActions');
    const btn=document.getElementById('floatingGameButton');
    const menu=document.getElementById('floatingGameMenu');
    if(window.matchMedia('(max-width:620px)').matches){
      document.documentElement.style.cssText+=';width:100%;height:100%;overflow:hidden!important';
      document.body.style.cssText+=';width:100%;min-width:0;min-height:100dvh;margin:0;padding:0;overflow:hidden!important';
      if(shell){shell.style.cssText+=';position:fixed!important;inset:0!important;width:100%!important;max-width:none!important;height:100dvh!important;min-height:100dvh!important;margin:0!important;padding:4px 4px calc(76px + env(safe-area-inset-bottom))!important;overflow:auto!important;overscroll-behavior:contain!important'}
      if(root){root.style.cssText+=';position:fixed!important;right:8px!important;bottom:calc(58px + env(safe-area-inset-bottom))!important;z-index:9999!important;display:grid!important;visibility:visible!important;opacity:1!important'}
      if(btn){btn.style.cssText+=';display:grid!important;visibility:visible!important;opacity:1!important;position:relative!important;width:46px!important;height:46px!important;min-width:46px!important;min-height:46px!important;z-index:10000!important'}
      if(menu)menu.style.zIndex='10001';
    }
    if(btn&&!btn.dataset.mobileBootBound){
      btn.dataset.mobileBootBound='1';
      btn.addEventListener('click',()=>{
        if(!menu)return;
        menu.hidden=!menu.hidden;
        btn.setAttribute('aria-expanded',String(!menu.hidden));
      },{capture:true});
    }
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
