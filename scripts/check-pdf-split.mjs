import assert from 'node:assert/strict';
import { buildPdfSplitPlan, compactPageList, detectChapterOnePage, scoreChapterOnePageText } from '../src/pdf-split-plan.js';

const plan = buildPdfSplitPlan(74, 12);
assert.deepEqual(plan.front, Array.from({ length: 12 }, (_, i) => i + 1));
assert.equal(plan.odd.length, 31);
assert.equal(plan.even.length, 31);
assert.deepEqual(plan.odd.slice(0, 4), [13, 15, 17, 19]);
assert.deepEqual(plan.odd.slice(-3), [69, 71, 73]);
assert.deepEqual(plan.even.slice(0, 4), [14, 16, 18, 20]);
assert.deepEqual(plan.even.slice(-3), [70, 72, 74]);
assert.equal(new Set([...plan.front, ...plan.odd, ...plan.even]).size, 74);
assert.equal([...plan.front, ...plan.odd, ...plan.even].length, 74);
assert.equal(compactPageList([1, 2, 3]), '1, 2, 3');
assert.match(compactPageList(plan.odd), /13, 15/);

const oddCutoff = buildPdfSplitPlan(20, 11);
assert.deepEqual(oddCutoff.odd.slice(0, 2), [13, 15]);
assert.deepEqual(oddCutoff.even.slice(0, 2), [12, 14]);
assert.throws(() => buildPdfSplitPlan(1, 1));
assert.throws(() => buildPdfSplitPlan(74, 0));
assert.throws(() => buildPdfSplitPlan(74, 74));
assert.throws(() => buildPdfSplitPlan(74, 12.5));

const pageTexts = Array(15).fill('');
pageTexts[8] = 'ix DAFTAR ISI Nomor urut Halaman BAB I PENDAHULUAN........................................1 1.1 Latar Belakang........1 BAB II METODE PENELITIAN........6 BAB III PEMBAHASAN........23';
pageTexts[12] = '1 BAB I PENDAHULUAN 1.1. Latar Belakang Cabai rawit merupakan salah satu komoditas hortikultura strategis di Indonesia.';
const detected = detectChapterOnePage(pageTexts);
assert.equal(detected?.page, 13);
assert.equal(detected?.cutoff, 12);
assert.equal(detected?.confidence, 'tinggi');
assert.ok(scoreChapterOnePageText(pageTexts[12]) > scoreChapterOnePageText(pageTexts[8]));
assert.equal(detectChapterOnePage(['DAFTAR ISI BAB I PENDAHULUAN.....1 BAB II METODE.....7']), null);

console.log('PDF split plan OK: 74-page thesis with cutoff 12 -> 12 front, 31 odd, 31 even pages; BAB I detector selects physical page 13 and ignores the TOC occurrence.');
