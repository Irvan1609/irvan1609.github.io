const $ = selector => document.querySelector(selector);
export function installAnalysisFlow() {
  installScientificWorkflow();
  document.querySelector('.design-options').insertAdjacentHTML('beforeend','<button data-design="fral"><b>Faktorial RAL</b><span>Dua faktor</span></button><button data-design="frak"><b>Faktorial RAK</b><span>Dua faktor dan kelompok</span></button><button data-design="split"><b>RPT / split-plot</b><span>Petak utama dan anak petak dalam RAK</span></button>');
  const choice = $('#analysisChoice');
  const panel=document.createElement('div');panel.id='analysisMenu';panel.className='nav-command-panel';panel.hidden=true;panel.setAttribute('role','group');panel.setAttribute('aria-label','Analisis data');
  [...choice.querySelectorAll('[data-design]')].forEach(button=>panel.append(button));$('.nav').after(panel);
  $('#openAnalysis').setAttribute('aria-controls','analysisMenu');$('#openAnalysis').setAttribute('aria-expanded','false');
  function closeAll() { ['analysisChoice','ralModal','rakModal'].forEach(id => $('#'+id).classList.remove('open'));panel.hidden=true;$('#openAnalysis').setAttribute('aria-expanded','false'); }
  $('#openAnalysis').addEventListener('click', () => { const opening=panel.hidden;document.dispatchEvent(new Event('close-navigation'));closeAll();panel.hidden=!opening;$('#openAnalysis').setAttribute('aria-expanded',String(opening)); });
  $('#closeAnalysisChoice').addEventListener('click', closeAll);
  choice.addEventListener('click', event => { if (event.target === choice) closeAll(); });
  panel.querySelectorAll('[data-design]').forEach(button => button.addEventListener('click', () => {
    closeAll(); openScientific(button.dataset.design);
  }));
  document.querySelectorAll('[data-back-design]').forEach(button => button.addEventListener('click', () => { closeAll();$('#openAnalysis').click(); }));
  document.addEventListener('keydown', event => { if (event.key === 'Escape') closeAll(); });
  ['#ralModal','#rakModal'].forEach(id => $(id).addEventListener('change', () => {
    $(id === '#ralModal' ? '#ralResult' : '#rakResult').innerHTML = '';
  }));
}
import {installScientificWorkflow,openScientific} from './scientific-workflow.js';
