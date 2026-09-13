const $ = selector => document.querySelector(selector);
export function installAnalysisFlow() {
  installScientificWorkflow();
  document.querySelector('.design-options').insertAdjacentHTML('beforeend','<button data-design="fral"><b>Faktorial RAL</b><span>Dua faktor</span></button><button data-design="frak"><b>Faktorial RAK</b><span>Dua faktor dan kelompok</span></button><button data-design="split"><b>RPT / split-plot</b><span>Petak utama dan anak petak dalam RAK</span></button>');
  const choice = $('#analysisChoice');
  function closeAll() { ['analysisChoice','ralModal','rakModal'].forEach(id => $('#'+id).classList.remove('open')); }
  $('#openAnalysis').addEventListener('click', () => { closeAll(); choice.classList.add('open'); choice.querySelector('[data-design]').focus(); });
  $('#closeAnalysisChoice').addEventListener('click', closeAll);
  choice.addEventListener('click', event => { if (event.target === choice) closeAll(); });
  choice.querySelectorAll('[data-design]').forEach(button => button.addEventListener('click', () => {
    closeAll(); openScientific(button.dataset.design);
  }));
  document.querySelectorAll('[data-back-design]').forEach(button => button.addEventListener('click', () => { closeAll(); choice.classList.add('open'); }));
  document.addEventListener('keydown', event => { if (event.key === 'Escape') closeAll(); });
  ['#ralModal','#rakModal'].forEach(id => $(id).addEventListener('change', () => {
    $(id === '#ralModal' ? '#ralResult' : '#rakResult').innerHTML = '';
  }));
}
import {installScientificWorkflow,openScientific} from './scientific-workflow.js';
