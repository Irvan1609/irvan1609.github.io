import 'bootstrap/dist/css/bootstrap.min.css'
import 'bootstrap/dist/js/bootstrap.bundle.min.js'
import './style.css'

const state = { headers: [], rows: [] }
const app = document.querySelector('#app')

function esc(value) {
  return String(value ?? '').replace(/[&<>\"']/g, (m) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '\"':'&quot;', "'":'&#39;' }[m]))
}

function render() {
  app.innerHTML = `
    <div class="app-shell d-flex flex-column vh-100">
      <header class="border-bottom bg-white">
        <div class="container-fluid py-2 d-flex align-items-center gap-2">
          <button class="btn btn-outline-secondary d-lg-none" data-bs-toggle="offcanvas" data-bs-target="#projectPanel" aria-label="Project Explorer">☰</button>
          <strong class="app-title">Statistical Data Editor</strong>
        </div>
        <nav class="nav nav-pills flex-nowrap overflow-x-auto px-2 pb-2 gap-1">
          ${['Project','Data','Design','Analyze','Graphs','Help'].map((x,i)=>`<button class="nav-link ${i===1?'active':''} text-nowrap">${x}</button>`).join('')}
        </nav>
      </header>

      <div class="toolbar border-bottom bg-light px-2 py-2 d-flex gap-2 overflow-x-auto">
        <button id="pasteBtn" class="btn btn-primary text-nowrap">📋 Paste from Excel</button>
        <button id="importBtn" class="btn btn-outline-secondary text-nowrap">📁 Import CSV</button>
        <button id="addRow" class="btn btn-outline-secondary text-nowrap">＋ Row</button>
        <button id="addCol" class="btn btn-outline-secondary text-nowrap">＋ Column</button>
      </div>

      <main class="d-flex flex-grow-1 min-h-0 overflow-hidden">
        <aside class="offcanvas-lg offcanvas-start border-end bg-white project-panel" tabindex="-1" id="projectPanel">
          <div class="offcanvas-header border-bottom"><h6 class="offcanvas-title mb-0">Project Explorer</h6><button class="btn-close d-lg-none" data-bs-dismiss="offcanvas"></button></div>
          <div class="p-2">
            <div class="fw-semibold small text-secondary px-2 py-1">PROJECT</div>
            <button class="tree-item active">📁 Data</button>
            <button class="tree-item">　📄 Dataset</button>
            <button class="tree-item">📁 Output</button>
          </div>
        </aside>

        <section class="workspace flex-grow-1 min-w-0 d-flex flex-column">
          <div class="sheet-header p-2 border-bottom bg-light d-flex align-items-center gap-2">
            <strong class="text-nowrap">Data Editor</strong>
            <input class="form-control form-control-sm dataset-name" value="dataset" aria-label="Nama dataset">
            <span id="info" class="small text-secondary text-nowrap">0 × 0</span>
          </div>
          <div id="gridWrap" class="table-responsive flex-grow-1"></div>
          <div id="status" class="status-bar border-top px-2 py-1 small bg-light">Siap — salin blok data dari Excel lalu pilih Paste.</div>
        </section>
      </main>

      <nav class="mobile-nav d-lg-none border-top bg-white">
        <button class="mobile-nav-item active">▦<span>Data</span></button>
        <button class="mobile-nav-item">ƒ<span>Analyze</span></button>
        <button class="mobile-nav-item">≡<span>Output</span></button>
        <button class="mobile-nav-item" data-bs-toggle="offcanvas" data-bs-target="#projectPanel">☰<span>More</span></button>
      </nav>
    </div>
    <input id="file" type="file" accept=".csv,text/csv" hidden>
    <div class="modal fade" id="pasteModal" tabindex="-1" aria-hidden="true">
      <div class="modal-dialog modal-dialog-centered modal-lg modal-fullscreen-sm-down">
        <div class="modal-content">
          <div class="modal-header"><h5 class="modal-title">Paste Data dari Excel</h5><button class="btn-close" data-bs-dismiss="modal"></button></div>
          <div class="modal-body">
            <p class="small text-secondary">Tempel blok dari Excel. Tab menjadi kolom dan baris baru menjadi baris.</p>
            <textarea id="pasteArea" class="form-control font-monospace" rows="8" placeholder="Tempel data Excel di sini..."></textarea>
            <div class="form-check mt-3"><input id="hasHeader" class="form-check-input" type="checkbox" checked><label class="form-check-label" for="hasHeader">Baris pertama adalah nama variabel</label></div>
            <div id="preview" class="table-responsive mt-3"></div>
          </div>
          <div class="modal-footer"><button class="btn btn-outline-secondary" data-bs-dismiss="modal">Batal</button><button id="applyPaste" class="btn btn-primary">Masukkan Data</button></div>
        </div>
      </div>
    </div>`
  bind()
  renderGrid()
}

function parse(text) { return text.replace(/\r/g,'').split('\n').filter(Boolean).map(r => r.split('\t')) }
function renderGrid() {
  const wrap = document.querySelector('#gridWrap')
  if (!state.headers.length) { wrap.innerHTML = '<div class="empty-state"><div class="fs-2">▦</div><h5>Belum ada data</h5><p>Salin data dari Excel lalu tekan <strong>Paste from Excel</strong>.</p></div>'; return }
  wrap.innerHTML = `<table class="table table-bordered table-sm data-grid mb-0"><thead><tr><th class="row-number">#</th>${state.headers.map(h=>`<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${state.rows.map((r,i)=>`<tr><td class="row-number">${i+1}</td>${state.headers.map((_,j)=>`<td contenteditable="true" data-r="${i}" data-c="${j}">${esc(r[j])}</td>`).join('')}</tr>`).join('')}</tbody></table>`
  document.querySelector('#info').textContent = `${state.rows.length} × ${state.headers.length}`
  wrap.querySelectorAll('[contenteditable]').forEach(td => td.addEventListener('input', () => { state.rows[+td.dataset.r][+td.dataset.c] = td.textContent }))
}
function updatePreview() {
  const a = parse(document.querySelector('#pasteArea').value)
  const preview = document.querySelector('#preview')
  if (!a.length) { preview.innerHTML=''; return }
  const hasHeader = document.querySelector('#hasHeader').checked
  const hs = hasHeader ? a[0] : a[0].map((_,i)=>`Variable${i+1}`)
  const rows = a.slice(hasHeader ? 1 : 0)
  preview.innerHTML = `<div class="small fw-semibold mb-2">Preview: ${rows.length} baris × ${hs.length} kolom</div><table class="table table-bordered table-sm"><thead><tr>${hs.map(h=>`<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.slice(0,8).map(r=>`<tr>${hs.map((_,i)=>`<td>${esc(r[i]??'')}</td>`).join('')}</tr>`).join('')}</tbody></table>`
}
function bind() {
  const modal = new bootstrap.Modal('#pasteModal')
  document.querySelector('#pasteBtn').onclick = () => { document.querySelector('#pasteArea').value=''; modal.show(); setTimeout(()=>document.querySelector('#pasteArea').focus(),300) }
  document.querySelector('#pasteArea').addEventListener('input', updatePreview)
  document.querySelector('#hasHeader').addEventListener('change', updatePreview)
  document.querySelector('#applyPaste').onclick = () => {
    const a = parse(document.querySelector('#pasteArea').value); if (!a.length) return
    const hh = document.querySelector('#hasHeader').checked
    state.headers = hh ? a[0] : a[0].map((_,i)=>`Variable${i+1}`)
    state.rows = a.slice(hh ? 1 : 0).map(r => state.headers.map((_,i)=>r[i]??''))
    renderGrid(); document.querySelector('#status').textContent = `✓ ${state.rows.length} baris × ${state.headers.length} kolom berhasil dimasukkan.`; modal.hide()
  }
  document.querySelector('#importBtn').onclick = () => document.querySelector('#file').click()
  document.querySelector('#file').onchange = async (e) => { const f=e.target.files[0]; if(!f)return; const a=parse(await f.text()); if(a.length){state.headers=a[0];state.rows=a.slice(1).map(r=>state.headers.map((_,i)=>r[i]??''));renderGrid();document.querySelector('#status').textContent=`✓ CSV diimpor: ${state.rows.length} baris.`} }
  document.querySelector('#addRow').onclick = () => { if(!state.headers.length)state.headers=['Variable1']; state.rows.push(state.headers.map(()=>'')); renderGrid() }
  document.querySelector('#addCol').onclick = () => { state.headers.push(`Variable${state.headers.length+1}`); state.rows.forEach(r=>r.push('')); renderGrid() }
}
render()
