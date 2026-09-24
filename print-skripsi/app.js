import { buildPdfSplitPlan, compactPageList, detectChapterOnePage } from '../src/pdf-split-plan.js';

const $ = (selector) => document.querySelector(selector);
const fileInput = $('#pdfFile');
const cutoffInput = $('#cutoffPage');
const processButton = $('#processPdf');
const downloadAllButton = $('#downloadAll');
const status = $('#status');
const summary = $('#summary');
const results = $('#results');
const detectionStatus = $('#detectionStatus');
const previewSection = $('#previewSection');
const previewCanvas = $('#previewCanvas');
const previewPageInput = $('#previewPage');
const previewInfo = $('#previewInfo');
const prevPageButton = $('#prevPage');
const nextPageButton = $('#nextPage');
const usePreviewPageButton = $('#usePreviewPage');

let loaded = null;
let objectUrls = [];
let generatedFiles = [];
let renderSerial = 0;

const PDFJS_WORKER = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
if (window.pdfjsLib?.GlobalWorkerOptions) {
  window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
}

function clearDownloads() {
  objectUrls.forEach((url) => URL.revokeObjectURL(url));
  objectUrls = [];
  generatedFiles = [];
  results.innerHTML = '';
  downloadAllButton.hidden = true;
}

function setStatus(message, type = 'info') {
  status.textContent = message;
  status.dataset.type = type;
}

function setDetection(message, state = 'warning') {
  detectionStatus.hidden = false;
  detectionStatus.textContent = message;
  detectionStatus.dataset.state = state;
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
  const copied = await output.copyPages(source, pages.map((page) => page - 1));
  copied.forEach((page) => output.addPage(page));
  return output.save();
}

function addDownload(file) {
  const blob = new Blob([file.bytes], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  objectUrls.push(url);
  const card = document.createElement('article');
  card.className = 'download-card';
  card.innerHTML = `<div><strong>${file.label}</strong><p>${file.description}</p></div><a class="download-btn" download="${file.filename}">Unduh PDF</a>`;
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

function currentCutoffPlan() {
  if (!loaded) return null;
  return buildPdfSplitPlan(loaded.totalPages, Number(cutoffInput.value));
}

async function renderPreview(requestedPage) {
  if (!loaded?.pdfjsDoc) return;
  const pageNumber = Math.min(loaded.totalPages, Math.max(1, Number(requestedPage) || 1));
  const serial = ++renderSerial;
  previewPageInput.value = String(pageNumber);
  previewPageInput.max = String(loaded.totalPages);
  prevPageButton.disabled = pageNumber <= 1;
  nextPageButton.disabled = pageNumber >= loaded.totalPages;
  previewInfo.textContent = `Halaman PDF ${pageNumber} dari ${loaded.totalPages}.`;

  try {
    const page = await loaded.pdfjsDoc.getPage(pageNumber);
    if (serial !== renderSerial) return;
    const baseViewport = page.getViewport({ scale: 1.25 });
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    previewCanvas.width = Math.floor(baseViewport.width * ratio);
    previewCanvas.height = Math.floor(baseViewport.height * ratio);
    previewCanvas.style.width = `${Math.round(baseViewport.width)}px`;
    previewCanvas.style.height = `${Math.round(baseViewport.height)}px`;
    const context = previewCanvas.getContext('2d', { alpha: false });
    await page.render({
      canvasContext: context,
      viewport: baseViewport,
      transform: ratio === 1 ? null : [ratio, 0, 0, ratio, 0, 0],
    }).promise;
  } catch (error) {
    if (serial === renderSerial) {
      setStatus(`Preview tidak dapat dirender: ${error?.message || 'kesalahan tidak diketahui'}`, 'warning');
    }
  }
}

async function extractPageText(pdfjsDoc, pageNumber) {
  const page = await pdfjsDoc.getPage(pageNumber);
  const text = await page.getTextContent();
  return text.items.map((item) => item.str || '').join(' ');
}

async function detectChapterOne(pdfjsDoc, totalPages) {
  const pageTexts = Array(totalPages).fill('');
  const preferredLimit = Math.min(totalPages, 40);

  for (let page = 1; page <= preferredLimit; page += 1) {
    pageTexts[page - 1] = await extractPageText(pdfjsDoc, page);
    const candidate = detectChapterOnePage(pageTexts);
    if (candidate?.score >= 10 && candidate.page === page) return candidate;
  }

  for (let page = preferredLimit + 1; page <= totalPages; page += 1) {
    pageTexts[page - 1] = await extractPageText(pdfjsDoc, page);
  }
  return detectChapterOnePage(pageTexts);
}

async function loadPdfJs(bytes) {
  if (!window.pdfjsLib?.getDocument) return null;
  return window.pdfjsLib.getDocument({ data: bytes.slice() }).promise;
}

fileInput.addEventListener('change', async () => {
  clearDownloads();
  summary.hidden = true;
  previewSection.hidden = true;
  detectionStatus.hidden = true;
  loaded = null;
  renderSerial += 1;

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

    const pdfjsDoc = await loadPdfJs(bytes);
    loaded = { file, doc, pdfjsDoc, totalPages };
    cutoffInput.max = String(totalPages - 1);
    previewPageInput.max = String(totalPages);
    processButton.disabled = false;

    let cutoff = Number(cutoffInput.value);
    if (!Number.isInteger(cutoff) || cutoff < 1 || cutoff >= totalPages) cutoff = Math.min(12, totalPages - 1);

    if (pdfjsDoc) {
      previewSection.hidden = false;
      setStatus(`PDF siap: ${totalPages} halaman. Mencari awal BAB I Pendahuluan…`, 'info');
      try {
        const detected = await detectChapterOne(pdfjsDoc, totalPages);
        if (detected) {
          cutoff = detected.cutoff;
          cutoffInput.value = String(cutoff);
          setDetection(`Awal BAB I ditemukan pada halaman PDF ${detected.page}. Batas sementara diisi sampai halaman ${cutoff}. Cek lagi lewat preview sebelum diproses.`, 'success');
          await renderPreview(detected.page);
        } else {
          cutoffInput.value = String(cutoff);
          setDetection('Awal BAB I belum ditemukan dengan cukup jelas. Buka halaman awal BAB I lewat preview, lalu klik “Jadikan awal BAB I”.', 'warning');
          await renderPreview(Math.min(totalPages, cutoff + 1));
        }
      } catch (error) {
        cutoffInput.value = String(cutoff);
        setDetection(`Pencarian awal BAB I tidak selesai: ${error?.message || 'teks PDF tidak dapat dibaca'}. Tentukan batas lewat preview.`, 'warning');
        await renderPreview(Math.min(totalPages, cutoff + 1));
      }
    } else {
      cutoffInput.value = String(cutoff);
      setDetection('Preview dan pencarian awal BAB I tidak tersedia karena komponen PDF gagal dimuat. Batas masih bisa diisi manual.', 'warning');
    }

    renderPlan(currentCutoffPlan());
    setStatus(`PDF siap: ${totalPages} halaman. Verifikasi batas lalu klik “Proses dan pisahkan PDF”.`, 'success');
  } catch (error) {
    loaded = null;
    processButton.disabled = true;
    setStatus(error?.message || 'PDF tidak dapat dibaca.', 'error');
  }
});

cutoffInput.addEventListener('change', async () => {
  clearDownloads();
  if (!loaded) return;
  try {
    const plan = currentCutoffPlan();
    renderPlan(plan);
    if (loaded.pdfjsDoc) await renderPreview(Math.min(loaded.totalPages, plan.cutoff + 1));
    setStatus(`Batas manual: halaman 1-${plan.cutoff} menjadi file pertama. Preview diarahkan ke halaman setelah batas.`, 'info');
  } catch (error) {
    summary.hidden = true;
    setStatus(error.message, 'error');
  }
});

prevPageButton.addEventListener('click', () => renderPreview(Number(previewPageInput.value) - 1));
nextPageButton.addEventListener('click', () => renderPreview(Number(previewPageInput.value) + 1));
previewPageInput.addEventListener('change', () => renderPreview(Number(previewPageInput.value)));

usePreviewPageButton.addEventListener('click', async () => {
  if (!loaded) return;
  const chapterPage = Number(previewPageInput.value);
  if (!Number.isInteger(chapterPage) || chapterPage <= 1 || chapterPage > loaded.totalPages) {
    setStatus('Halaman awal BAB I harus berada antara halaman PDF 2 dan halaman terakhir.', 'error');
    return;
  }
  clearDownloads();
  cutoffInput.value = String(chapterPage - 1);
  const plan = currentCutoffPlan();
  renderPlan(plan);
  setDetection(`Batas dikonfirmasi manual: BAB I dimulai pada halaman PDF ${chapterPage}; file pertama berakhir pada halaman ${chapterPage - 1}.`, 'success');
  setStatus('Batas pemisahan diperbarui dari halaman preview.', 'success');
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

    const base = safeBaseName(loaded.file.name);
    const definitions = [
      { label: 'File 1 - Bagian awal', description: `Halaman 1-${cutoff}`, pages: plan.front, filename: `${base}-01-halaman-1-${cutoff}.pdf` },
      { label: 'File 2 - Halaman ganjil', description: compactPageList(plan.odd, 12), pages: plan.odd, filename: `${base}-02-ganjil-setelah-${cutoff}.pdf` },
      { label: 'File 3 - Halaman genap', description: compactPageList(plan.even, 12), pages: plan.even, filename: `${base}-03-genap-setelah-${cutoff}.pdf` },
    ];

    for (let i = 0; i < definitions.length; i += 1) {
      const definition = definitions[i];
      setStatus(`Membuat ${definition.label} (${i + 1}/3)…`, 'info');
      const bytes = await createPdf(loaded.doc, definition.pages);
      generatedFiles.push({ ...definition, bytes });
      addDownload(generatedFiles[generatedFiles.length - 1]);
    }

    downloadAllButton.hidden = false;
    setStatus('Selesai. Unduh satu per satu atau gunakan “Unduh 3 file sekaligus”.', 'success');
  } catch (error) {
    clearDownloads();
    setStatus(error?.message || 'Terjadi kesalahan saat memisahkan PDF.', 'error');
  } finally {
    processButton.disabled = !loaded;
  }
});

downloadAllButton.addEventListener('click', async () => {
  if (!generatedFiles.length) return;
  const JSZip = window.JSZip;
  if (!JSZip) {
    setStatus('Pustaka ZIP gagal dimuat. Tiga PDF tetap dapat diunduh satu per satu.', 'error');
    return;
  }
  downloadAllButton.disabled = true;
  try {
    setStatus('Menyiapkan ZIP berisi tiga PDF…', 'info');
    const zip = new JSZip();
    generatedFiles.forEach((file) => zip.file(file.filename, file.bytes));
    const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${safeBaseName(loaded?.file?.name)}-3-file-print.zip`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    setStatus('ZIP berhasil dibuat. Isinya adalah tiga PDF hasil pemisahan.', 'success');
  } catch (error) {
    setStatus(error?.message || 'ZIP tidak dapat dibuat.', 'error');
  } finally {
    downloadAllButton.disabled = false;
  }
});

window.addEventListener('beforeunload', clearDownloads);
