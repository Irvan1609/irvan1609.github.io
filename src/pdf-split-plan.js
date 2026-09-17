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
