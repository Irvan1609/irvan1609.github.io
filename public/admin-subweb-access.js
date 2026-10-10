// Client-side experience gate only. GitHub Pages serves static sources publicly.
// Sensitive data/actions still require server authorization on their own endpoints.
let pending=null;
export function requireAdminSubweb(){
  if(pending)return pending;
  pending=verifyAdmin();
  return pending;
}
async function verifyAdmin(){
  const gate=document.getElementById('adminSubwebGate');
  document.body.classList.add('admin-subweb-locked');
  const info=gate?.querySelector('[data-admin-gate-message]');
  const login=gate?.querySelector('[data-admin-gate-login]');
  if(info)info.textContent='Memeriksa sesi admin dengan server…';
  if(login){
    login.disabled=true;
    login.onclick=()=>window.IrvanAccount?.login?.();
  }
  try{
    const src=document.querySelector('script[src^="/account.js"]')?.getAttribute('src')||'/account.js';
    await import(src);
    const account=window.IrvanAccount;
    if(!account?.refresh)throw Error('Layanan akun tidak tersedia.');
    // The OAuth callback is processed asynchronously by account.js.
    if(new URL(location.href).searchParams.has('auth_code')){
      await new Promise(resolve=>{
        const timeout=setTimeout(()=>{document.removeEventListener('accountchange',onChange);resolve();},7000);
        function onChange(event){
          if(!event.detail?.authenticated)return;
          clearTimeout(timeout);document.removeEventListener('accountchange',onChange);resolve();
        }
        document.addEventListener('accountchange',onChange);
      });
    }
    const user=await account.refresh();
    if(user?.role!=='admin')throw Error(user?'Akun ini bukan admin. Akses hanya untuk admin.':'Masuk dengan akun Google admin untuk menggunakan subweb ini.');
    gate?.remove();
    document.body.classList.remove('admin-subweb-locked');
    // If the admin signs out, stop normal interaction until verification again.
    document.addEventListener('accountchange',event=>{
      if(event.detail?.user?.role!=='admin'){
        document.body.classList.add('admin-subweb-locked');
        location.reload();
      }
    });
    return true;
  }catch(err){
    if(info)info.textContent=err?.message||'Verifikasi admin gagal. Coba masuk kembali.';
    if(login){login.disabled=false;login.textContent='Masuk dengan Google';}
    throw new Error('Subweb khusus admin: '+String(err?.message||'akses ditolak'));
  }
}
