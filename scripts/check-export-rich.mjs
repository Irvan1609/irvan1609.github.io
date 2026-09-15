import assert from 'node:assert/strict';
import {excelRichText} from '../src/excel-rich-text.js';
const text=value=>({nodeType:3,textContent:value});
const el=(tagName,...childNodes)=>({nodeType:1,tagName,childNodes});
const runs=excelRichText(el('TD',text('23.47'),el('SUP',text('ab')),el('SUB',text('xy')))).richText;
assert.deepEqual(runs.map(r=>[r.text,r.font.vertAlign]),[['23.47',undefined],['ab','superscript'],['xy','subscript']]);
assert.deepEqual(excelRichText(el('TD',text('7'),el('SUB',text('x')))).richText.map(r=>r.font.vertAlign),[undefined,'subscript']);
assert.equal(excelRichText(el('TD',el('SPAN',text('1,23')),el('SUP',text('a')),text(' / '),el('SUP',text('b')))).richText.map(r=>r.text).join(''),'1,23a / b');
console.log('Excel rich text: row/column notation, text order, decimal comma and multiple annotations preserved.');
