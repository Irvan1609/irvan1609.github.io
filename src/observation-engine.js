// Observation order is separate from measurement identity. No array index is a data key.
export const observationKey=(unitId,sample,parameterId)=>JSON.stringify([unitId,sample,parameterId]);
export const uid=()=>globalThis.crypto.randomUUID();
const text=value=>String(value??'').trim();

export function parseObservationNumber(value){
  const raw=text(value);
  if(!raw)return null;
  if(!/^[+-]?(?:\d+(?:[.,]\d*)?|[.,]\d+)(?:[eE][+-]?\d+)?$/.test(raw))throw Error('Isi satu angka; gunakan koma atau titik sebagai desimal, tanpa pemisah ribuan.');
  const number=Number(raw.replace(',','.'));
  if(!Number.isFinite(number))throw Error('Angka di luar rentang yang didukung.');
  return number;
}

export function parseParameters(source,previous=[]){
  const lines=source.split(/\r?\n/).map(text).filter(Boolean);
  const seen=new Set();
  return lines.map(line=>{
    const [code,name='',unit='']=line.split('|').map(text);
    if(!code||code.length>60||/[;,\t\r\n]/.test(code))throw Error('Kode parameter wajib diisi, maksimal 60 karakter, tanpa koma/titik koma.');
    if(seen.has(code.toLowerCase()))throw Error(`Kode parameter ${code} berulang.`);
    seen.add(code.toLowerCase());
    const old=previous.find(p=>p.code===code);
    return {id:old?.id||uid(),code,name:name||code,unit,reducer:old?.reducer||'mean'};
  });
}

export function validatePlan(plan){
  if(!text(plan.name))throw Error('Isi nama pengamatan.');
  if(!plan.parameters.length||plan.parameters.length>100)throw Error('Gunakan 1–100 parameter.');
  if(!plan.units.length||plan.units.length>1000)throw Error('Gunakan 1–1.000 unit percobaan.');
  for(const list of [plan.parameters,plan.units]){
    if(new Set(list.map(item=>item.id)).size!==list.length)throw Error('Identitas internal berulang.');
  }
  const codes=new Set();let total=0;
  for(const unit of plan.units){
    if(!text(unit.code))throw Error('Kode unit percobaan wajib diisi.');
    if(codes.has(unit.code.toLowerCase()))throw Error(`Unit ${unit.code} berulang.`);
    codes.add(unit.code.toLowerCase());
    if(!Number.isInteger(unit.count)||unit.count<1||unit.count>500)throw Error(`Jumlah sampel ${unit.code} harus 1–500.`);
    if(!['tanaman','buah','lainnya'].includes(unit.kind))throw Error('Jenis sampel tidak valid.');
    total+=unit.count*plan.parameters.length;
  }
  if(total>200000)throw Error('Maksimal 200.000 isian per pengamatan; pisahkan menjadi beberapa pengamatan.');
  if(Math.max(...plan.units.map(u=>u.count))*plan.parameters.length>20000)throw Error('Maksimal 20.000 langkah per unit.');
  return true;
}

export function templateSteps(plan){
  validatePlan(plan);
  const max=Math.max(...plan.units.map(u=>u.count));
  const parameters=new Map(plan.parameters.map(p=>[p.id,p]));
  let steps=[];
  if(plan.orderMode==='manual'){
    const tokens=text(plan.manualOrder).split(/[;,\n]+/).map(text).filter(Boolean);
    steps=tokens.map(token=>{
      const match=token.match(/^(.*)-(\d+)$/);
      const parameter=match&&plan.parameters.find(p=>p.code===match[1]);
      const sample=Number(match?.[2]);
      if(!parameter||sample<1||sample>max)throw Error(`Langkah tidak valid: ${token}. Gunakan kode-1 sampai kode-${max}.`);
      return {parameterId:parameter.id,sample};
    });
  }else{
    for(const group of plan.groups){
      const ids=group.parameterIds;
      if(!ids.length)throw Error('Setiap kelompok urutan harus memiliki parameter.');
      if(ids.some(id=>!parameters.has(id)))throw Error('Parameter kelompok tidak ditemukan. Susun kembali urutan.');
      if(group.mode==='sample'){
        for(let sample=1;sample<=max;sample++)for(const parameterId of ids)steps.push({parameterId,sample});
      }else if(group.mode==='parameter'){
        for(const parameterId of ids)for(let sample=1;sample<=max;sample++)steps.push({parameterId,sample});
      }else throw Error('Pola urutan tidak valid.');
    }
  }
  const keys=steps.map(s=>JSON.stringify([s.parameterId,s.sample]));
  if(new Set(keys).size!==keys.length)throw Error('Ada parameter/sampel yang muncul dua kali dalam urutan.');
  if(steps.length!==max*plan.parameters.length)throw Error('Masukkan setiap parameter tepat satu kali dalam kelompok, atau semua pasangan parameter-sampel dalam urutan rinci.');
  return steps;
}

export function observationQueue(plan){
  const steps=templateSteps(plan);
  return plan.units.flatMap(unit=>steps.filter(s=>s.sample<=unit.count).map(s=>({...s,unitId:unit.id,key:observationKey(unit.id,s.sample,s.parameterId)})));
}

export function observationSummary(plan){
  return plan.units.flatMap(unit=>plan.parameters.map(parameter=>{
    const values=[];let missing=0,pending=0;
    for(let sample=1;sample<=unit.count;sample++){
      const value=plan.values[observationKey(unit.id,sample,parameter.id)];
      if(value?.status==='measured'&&Number.isFinite(value.value))values.push(value.value);
      else if(value?.status==='missing')missing++;else pending++;
    }
    const sum=values.length?values.reduce((a,b)=>a+b,0):null;
    return {unit,parameter,n:values.length,missing,pending,expected:unit.count,sum,mean:values.length?sum/values.length:null};
  }));
}

export function rawObservationTable(plan){
  const headers=['Unit','Ulangan','Perlakuan','Sampel','ID sampel','Jenis sampel','Parameter','Nama parameter','Satuan','Nilai','Status','Catatan','Diperbarui'];
  const rows=plan.units.flatMap(u=>Array.from({length:u.count},(_,i)=>i+1).flatMap(sample=>plan.parameters.map(p=>{
    const entry=plan.values[observationKey(u.id,sample,p.id)];
    return [u.code,u.block,u.treatment,sample,`${u.code}(${sample})`,u.kind,p.code,p.name,p.unit,entry?.status==='measured'?entry.value:'',entry?.status||'pending',entry?.note||'',entry?.updatedAt||''];
  })));
  return {headers,rows};
}

export function recapObservationTable(plan){
  const summaries=observationSummary(plan);
  const header=p=>`${p.code} [${p.reducer==='sum'?'jumlah':'rerata'}]${p.unit?' ('+p.unit+')':''}`;
  return {
    headers:['Unit','Ulangan','Perlakuan',...plan.parameters.map(header),...plan.parameters.flatMap(p=>[`${p.code} [n]`,`${p.code} [hilang]`,`${p.code} [belum diisi]`])],
    rows:plan.units.map(u=>{
      const rows=summaries.filter(s=>s.unit.id===u.id);
      return [u.code,u.block,u.treatment,...rows.map(s=>(s.parameter.reducer==='sum'?s.sum:s.mean)??''),...rows.flatMap(s=>[s.n,s.missing,s.pending])];
    })
  };
}

export function tableCsv({headers,rows}){
  const cell=value=>{
    // Prevent formula execution when untrusted labels are opened in spreadsheet software.
    let v=String(value??'');
    if(typeof value!=='number'&&/^[\s]*[=+@-]/.test(v))v="'"+v;
    return '"'+v.replaceAll('"','""')+'"';
  };
  return '\uFEFF'+[headers,...rows].map(row=>row.map(cell).join(',')).join('\r\n');
}

export function applyObservationChange(plan,key,after){
  const before=plan.values[key]??null;
  if(JSON.stringify(before)===JSON.stringify(after))return;
  if(after===null)delete plan.values[key];else plan.values[key]=after;
  plan.undo=[...(plan.undo||[]),{key,before,after}].slice(-100);
  plan.redo=[];
}

export function travelObservationHistory(plan,direction){
  const from=direction==='undo'?'undo':'redo',to=direction==='undo'?'redo':'undo';
  const entry=plan[from]?.pop();if(!entry)return false;
  const value=direction==='undo'?entry.before:entry.after;
  if(value===null)delete plan.values[entry.key];else plan.values[entry.key]=value;
  plan[to]=[...(plan[to]||[]),entry].slice(-100);return true;
}
