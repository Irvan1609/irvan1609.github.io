export function buildPdfSplitPlan(totalPages, cutoff) {
  if (!Number.isInteger(totalPages) || totalPages < 2) {
    throw new Error('PDF harus memiliki minimal 2 halaman.');
  }
  if (!Number.isInteger(cutoff) || cutoff < 1 || cutoff >= totalPages) {
    throw new Error(`Halaman terakhir sebelum pendahuluan harus antara 1 dan ${totalPages - 1}.`);
  }

  const front = [];
  const odd = [];
  const even = [];

  for (let page = 1; page <= totalPages; page += 1) {
    if (page <= cutoff) front.push(page);
    else if (page % 2 === 1) odd.push(page);
    else even.push(page);
  }

  return { totalPages, cutoff, front, odd, even };
}

export function compactPageList(pages, maxShown = 10) {
  if (!Array.isArray(pages) || pages.length === 0) return 'Tidak ada halaman';
  if (pages.length <= maxShown) return pages.join(', ');
  const head = pages.slice(0, Math.max(2, maxShown - 3));
  const tail = pages.slice(-2);
  return `${head.join(', ')}, …, ${tail.join(', ')}`;
}

function normalizePageText(text) {
  return String(text || '')
    .normalize('NFKC')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

/**
 * Scores whether extracted text looks like the real opening page of BAB I.
 * The score intentionally penalizes a table-of-contents page, because a TOC
 * commonly contains the phrase "BAB I PENDAHULUAN" before the actual chapter.
 */
export function scoreChapterOnePageText(text) {
  const normalized = normalizePageText(text);
  if (!normalized) return Number.NEGATIVE_INFINITY;

  const babIndex = normalized.search(/\bBAB\s+I\b/);
  const pendIndex = normalized.indexOf('PENDAHULUAN', Math.max(0, babIndex));
  if (babIndex < 0 || pendIndex < 0 || pendIndex - babIndex > 140) {
    return Number.NEGATIVE_INFINITY;
  }

  const lead = normalized.replace(/^(?:\d+|[IVXLCDM]+)\s+/, '').slice(0, 260);
  let score = 0;

  if (/^BAB\s+I\s+PENDAHULUAN\b/.test(lead)) score += 9;
  else if (babIndex <= 180) score += 5;
  else score += 2;

  if (pendIndex - babIndex <= 60) score += 2;
  if (/\b1\.1\b/.test(normalized.slice(Math.max(0, pendIndex), pendIndex + 240))) score += 1;

  if (/\bDAFTAR\s+ISI\b/.test(normalized)) score -= 12;
  if (/\bBAB\s+(?:II|III|IV|V)\b/.test(normalized)) score -= 5;
  if ((String(text).match(/\.{5,}/g) || []).length >= 2) score -= 5;

  return score;
}

export function detectChapterOnePage(pageTexts) {
  if (!Array.isArray(pageTexts) || pageTexts.length === 0) return null;

  let best = null;
  pageTexts.forEach((text, index) => {
    const score = scoreChapterOnePageText(text);
    if (!Number.isFinite(score)) return;
    if (!best || score > best.score) {
      best = { page: index + 1, cutoff: index, score };
    }
  });

  if (!best || best.score < 7 || best.page <= 1) return null;
  return {
    ...best,
    confidence: best.score >= 10 ? 'tinggi' : 'sedang',
  };
}
