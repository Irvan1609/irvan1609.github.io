import {getDecimalSeparator} from './number-format.js';
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const $=s=>document.querySelector(s);
export function readDataset(){
  return {name:$('#activeFile')?.textContent||'Dataset',headers:[...document.querySelectorAll('.data-grid thead th')].slice(1).map(x=>x.textContent.trim()),rows:[...document.querySelectorAll('.data-grid tbody tr')].map(tr=>[...tr.cells].slice(1).map(td=>td.textContent))};
}
export function installDataTools(){
  const toolbar=$('.toolbar');
  toolbar.insertAdjacentHTML('beforeend','<button id="importXlsx">Impor Excel</button><button id="dataTemplate">Template data</button><button id="analysisHistory">Riwayat analisis</button>');
  document.body.insertAdjacentHTML('beforeend',`<input id="xlsxInput" type="file" accept=".xlsx" hidden><div id="dataToolModal" class="modal-backdrop"><div class="modal" role="dialog" aria-modal="true" aria-labelledby="dataToolTitle"><div class="modal-head"><strong id="dataToolTitle"></strong><button id="closeDataTool" aria-label="Tutup">✕</button></div><div id="dataToolBody" class="modal-body"></div></div></div>`);
  $('#closeDataTool').onclick=()=>$('#dataToolModal').classList.remove('open');
  $('#importXlsx').onclick=()=>$('#xlsxInput').click();
  $('#xlsxInput').onchange=async event=>{
    const file=event.target.files[0];event.target.value='';if(!file)return;
    openTool('Impor Excel','<p>Membaca lembar kerja…</p>');
    try{
      const {default:ExcelJS}=await import('exceljs');const book=new ExcelJS.Workbook();await book.xlsx.load(await file.arrayBuffer());
      const sheets=book.worksheets.filter(s=>s.rowCount>0);if(!sheets.length)throw Error('File tidak memiliki lembar berisi data.');
      $('#dataToolBody').innerHTML=`<label for="importSheet">Pilih lembar kerja</label><select id="importSheet">${sheets.map((s,i)=>`<option value="${i}">${esc(s.name)}</option>`).join('')}</select><p>Baris pertama harus berisi judul kolom. Gunakan satu baris per pengamatan, tanpa total atau rata-rata.</p><div id="sheetPreview" class="table-scroll"></div><p id="importError" role="alert"></p><button id="applyXlsx" class="primary">Impor sebagai dataset baru</button>`;
      const cellValue=cell=>{
        let value=cell.value;
        if(value&&typeof value==='object'){
          if('formula' in value||'sharedFormula' in value){value=value.result;if(value===undefined)throw Error('Ada formula tanpa hasil tersimpan. Hitung dan simpan file di Excel terlebih dahulu.');}
          else if(value.richText)value=value.richText.map(r=>r.text).join('');
          else if(value.text!==undefined)value=value.text;
        }
        if(value===null||value===undefined)return '';
        if(typeof value==='number')return String(value).replace('.',getDecimalSeparator());
        if(typeof value==='string')return value;
        throw Error('Ada nilai tanggal, kesalahan formula, atau tipe sel yang tidak didukung. Ubah menjadi angka atau teks.');
      };
      const extract=()=>{
        const sheet=sheets[Number($('#importSheet').value)],rows=[];
        sheet.eachRow({includeEmpty:true},row=>rows.push(Array.from({length:sheet.columnCount},(_,i)=>cellValue(row.getCell(i+1)))));
        while(rows.length&&rows.at(-1).every(v=>v===''))rows.pop();
        let cols=rows.reduce((m,r)=>Math.max(m,r.findLastIndex(v=>v!=='')+1),0);
        return rows.map(r=>r.slice(0,cols));
      };
      function preview(){try{const rows=extract();$('#sheetPreview').innerHTML=`<table class="result-table">${rows.slice(0,7).map((r,i)=>`<tr>${r.map(v=>`<${i?'td':'th'}>${esc(v)}</${i?'td':'th'}>`).join('')}</tr>`).join('')}</table><p>${Math.max(0,rows.length-1)} pengamatan.</p>`;$('#importError').textContent='';}catch(e){$('#importError').textContent=e.message;}}
      $('#importSheet').onchange=preview;preview();
      $('#applyXlsx').onclick=()=>{try{
        const [headers,...rows]=extract();
        if(!headers?.length||headers.some(h=>!h.trim())||new Set(headers.map(h=>h.trim())).size!==headers.length)throw Error('Judul kolom harus terisi dan tidak boleh sama.');
        if(!rows.length)throw Error('Belum ada baris pengamatan.');
        document.dispatchEvent(new CustomEvent('dataset-import',{detail:{name:file.name.replace(/\.xlsx$/i,'')+'-'+sheets[Number($('#importSheet').value)].name,headers:headers.map(h=>h.trim()),rows}}));
        $('#dataToolModal').classList.remove('open');
      }catch(e){$('#importError').textContent=e.message;}};
    }catch(e){$('#dataToolBody').innerHTML=`<p role="alert">${esc(e.message)}</p>`;}
  };
  $('#dataTemplate').onclick=()=>{
    openTool('Template data',`<label for="templateDesign">Rancangan</label><select id="templateDesign"><option value="ral">RAL</option><option value="rak">RAK</option><option value="fral">Faktorial RAL (2 faktor)</option><option value="frak">Faktorial RAK (2 faktor)</option><option value="split">RPT / petak terbagi dalam RAK</option></select><p>Template memuat contoh 3 ulangan dan dua parameter. Ganti seluruh data contoh dengan data penelitian Anda.</p><button id="downloadTemplate" class="primary">Unduh template .xlsx</button><p id="templateStatus" role="status"></p>`);
    $('#downloadTemplate').onclick=async()=>{const button=$('#downloadTemplate');button.disabled=true;try{
      const {default:ExcelJS}=await import('exceljs');const book=new ExcelJS.Workbook();const sheet=book.addWorksheet('Data');const design=$('#templateDesign').value,multi=['fral','frak','split'].includes(design);
      sheet.addRow(multi?['Faktor A','Faktor B','Ulangan','Parameter 1','Parameter 2']:['Perlakuan','Ulangan','Parameter 1','Parameter 2']);
      for(let r=1;r<=3;r++)for(let a=1;a<=3;a++)for(let b=1;b<=(multi?2:1);b++)sheet.addRow(multi?[`A${a}`,`B${b}`,r,10+a+b+r*.3,20+a*2+b+r*.2]:[`P${a}`,r,10+a+r*.3,20+a*2+r*.2]);
      sheet.columns.forEach(c=>c.width=20);sheet.getRow(1).font={bold:true};sheet.views=[{state:'frozen',ySplit:1}];
      const help=book.addWorksheet('Petunjuk');help.getColumn(1).width=110;
      ['Data contoh untuk format, bukan data penelitian.','Satu baris = satu unit percobaan; satu kolom = satu variabel.','Jangan masukkan baris total/rataan. Judul kolom harus unik.',multi?'Semua kombinasi A × B harus tersedia pada setiap ulangan.':'Setiap perlakuan memiliki pengamatan pada ulangan yang sesuai.',design==='split'?'Faktor A = petak utama; Faktor B = anak petak; ulangan = kelompok.':'Ulangan merupakan kelompok hanya pada RAK.','Parameter 1 dan Parameter 2 dapat diganti namanya atau ditambah.'].forEach(x=>help.addRow([x]));
      downloadBlob(await book.xlsx.writeBuffer(),`template-${design}.xlsx`);$('#templateStatus').textContent='Template siap diunduh.';
    }catch(e){$('#templateStatus').textContent=e.message;}finally{button.disabled=false;}};
  };
}
export function openTool(title,html){$('#dataToolTitle').textContent=title;$('#dataToolBody').innerHTML=html;$('#dataToolModal').classList.add('open');}
export function downloadBlob(buffer,name){const url=URL.createObjectURL(new Blob([buffer],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);}
