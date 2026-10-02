(()=>{try{
  const KEY='agrotik_field_zero_theme_v2';
  const saved=JSON.parse(localStorage.getItem('agrotik_field_zero_v1')||'{}');
  const stored=localStorage.getItem(KEY);
  const mode=(stored==='light'||stored==='dark'||stored==='system')?stored:(saved?.comfort?.theme||'system');
  const theme=mode==='light'||mode==='dark'?mode:(matchMedia('(prefers-color-scheme: light)').matches?'light':'dark');
  document.documentElement.dataset.theme=theme;
  document.documentElement.style.colorScheme=theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content',theme==='light'?'#f3f7f4':'#10271f');
}catch{}})();
