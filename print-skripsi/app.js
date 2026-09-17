import { buildPdfSplitPlan, compactPageList } from '../src/pdf-split-plan.js';

const $ = (selector) => document.querySelector(selector);
const fileInput = $('#pdfFile');
const cutoffInput = $('#cutoffPage');
const processButton = $('#processPdf');
const status = $('#status');
const summary = $('#summary');
const results = $('#results');

let loaded = null;
let objectUrls = [];

function clearDownloads() {
  objectUrls.forEach((url) => URL.revokeObjectURL(url));
  objectUrls = [];
  results.innerHTML = '';
}

function setStatus(message, type = 'info') {
  status.textContent = message;
  status.dataset.type = type;
}

function safeBaseName(name) {
  return String(name || 'skripsi')
    .replace(/\.pdf$/i, '')
    .normalize('NFKC')
    .replace(/[^\p{L}\p{N}._-]+/gu, '-')
    .replace(/^-+|-+$/g, '') || 'skripsi';
}

async function createPdf(source, pages) {
  const { PDFDocument } = window.PDFLib || {};
  if (!PDFDocument) throw new Error('Pustaka pemrosesan PDF gagal dimuat. Periksa koneksi internet lalu muat ulang halaman.');
  const output = await PDFDocument.create();
  if (pages.length) {
    const copied = await output.copyPages(source, pages.map((page) => page - 1));
    copied.forEach((page) => output.addPage(page));
  }
  return output.save();
}

function addDownload(label, description, bytes, filename) {
  const blob = new Blob([bytes], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  objectUrls.push(url);
  const card = document.createElement('article');
  card.className = 'download-card';
  card.innerHTML = `<div><strong>${label}</strong><p>${description}</p></div><a class="download-btn" download="${filename}">Unduh PDF</a>`;
  card.querySelector('a').href = url;
  results.appendChild(card);
}

function renderPlan(plan) {
  summary.hidden = false;
  summary.innerHTML = `
    <div class="summary-grid">
      <div><span>File 1 - Bagian awal</span><b>${plan.front.length} halaman</b><small>${compactPageList(plan.front)}</small></div>
      <div><span>File 2 - Halaman ganjil</span><b>${plan.odd.length} halaman</b><small>${compactPageList(plan.odd)}</small></div>
      <div><span>File 3 - Halaman genap</span><b>${plan.even.length} halaman</b><small>${compactPageList(plan.even)}</small></div>
    </div>`;
}

fileInput.addEventListener('change', async () => {
  clearDownloads();
  summary.hidden = true;
  loaded = null;
  const file = fileInput.files?.[0];
  if (!file) {
    setStatus('Pilih satu file PDF.', 'info');
    processButton.disabled = true;
    return;
  }
  if (file.type && file.type !== 'application/pdf' && !/\.pdf$/i.test(file.name)) {
    setStatus('File yang dipilih bukan PDF.', 'error');
    processButton.disabled = true;
    return;
  }

  try {
    setStatus('Membaca PDF…');
    const { PDFDocument } = window.PDFLib || {};
    if (!PDFDocument) throw new Error('Pustaka PDF belum tersedia. Muat ulang halaman saat koneksi internet aktif.');
    const bytes = new Uint8Array(await file.arrayBuffer());
    const doc = await PDFDocument.load(bytes, { ignoreEncryption: false });
    const totalPages = doc.getPageCount();
    if (totalPages < 2) throw new Error('PDF harus memiliki minimal 2 halaman.');
    loaded = { file, doc, totalPages };
    cutoffInput.max = String(totalPages - 1);
    if (Number(cutoffInput.value) >= totalPages) cutoffInput.value = String(Math.min(12, totalPages - 1));
    processButton.disabled = false;
    const plan = buildPdfSplitPlan(totalPages, Number(cutoffInput.value));
    renderPlan(plan);
    setStatus(`PDF siap: ${totalPages} halaman. Semua pemrosesan dilakukan di browser Anda.`, 'success');
  } catch (error) {
    loaded = null;
    processButton.disabled = true;
    setStatus(error?.message || 'PDF tidak dapat dibaca.', 'error');
  }
});

cutoffInput.addEventListener('input', () => {
  clearDownloads();
  if (!loaded) return;
  try {
    const plan = buildPdfSplitPlan(loaded.totalPages, Number(cutoffInput.value));
    renderPlan(plan);
    setStatus(`Pembagian siap: halaman 1-${plan.cutoff} menjadi file pertama.`, 'info');
  } catch (error) {
    summary.hidden = true;
    setStatus(error.message, 'error');
  }
});

processButton.addEventListener('click', async () => {
  if (!loaded) return;
  clearDownloads();
  processButton.disabled = true;
  try {
    const cutoff = Number(cutoffInput.value);
    const plan = buildPdfSplitPlan(loaded.totalPages, cutoff);
    renderPlan(plan);
    setStatus('Memisahkan PDF… jangan tutup halaman ini.', 'info');

    const [frontBytes, oddBytes, evenBytes] = await Promise.all([
      createPdf(loaded.doc, plan.front),
      createPdf(loaded.doc, plan.odd),
      createPdf(loaded.doc, plan.even),
    ]);

    const base = safeBaseName(loaded.file.name);
    addDownload('File 1 - Bagian awal', `Halaman 1-${cutoff}`, frontBytes, `${base}-01-halaman-1-${cutoff}.pdf`);
    addDownload('File 2 - Halaman ganjil', compactPageList(plan.odd, 12), oddBytes, `${base}-02-ganjil-setelah-${cutoff}.pdf`);
    addDownload('File 3 - Halaman genap', compactPageList(plan.even, 12), evenBytes, `${base}-03-genap-setelah-${cutoff}.pdf`);
    setStatus('Selesai. Tiga file PDF siap diunduh.', 'success');
  } catch (error) {
    setStatus(error?.message || 'Terjadi kesalahan saat memisahkan PDF.', 'error');
  } finally {
    processButton.disabled = !loaded;
  }
});

window.addEventListener('beforeunload', clearDownloads);
