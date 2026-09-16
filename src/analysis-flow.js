const $ = selector => document.querySelector(selector);
import {openAssociation} from './association-workflow.js';
import {openAdvanced} from './advanced-workflow.js';
import {openNextGen} from './nextgen-workflow.js';
import {openMixedModel} from './mixed-workflow.js';
export function installAnalysisFlow() {
  installScientificWorkflow();
  document.querySelector('.design-options').insertAdjacentHTML('beforeend','<button data-design="fral"><b>Faktorial RAL</b><span>Dua faktor</span></button><button data-design="frak"><b>Faktorial RAK</b><span>Dua faktor dan kelompok</span></button><button data-design="split"><b>RPT / split-plot</b><span>Petak utama dan anak petak dalam RAK</span></button>');
  const choice = $('#analysisChoice');
  const panel=document.createElement('div');panel.id='analysisMenu';panel.className='nav-command-panel';panel.hidden=true;panel.setAttribute('role','group');panel.setAttribute('aria-label','Analyze');
  [...choice.querySelectorAll('[data-design]')].forEach(button=>panel.append(button));$('.nav').after(panel);
  $('#openAnalysis').textContent='Analyze';
  panel.insertAdjacentHTML('beforeend','<button data-association="correlation"><b>Korelasi</b><span>Pearson / Spearman</span></button><button data-association="path"><b>Sidik lintas</b><span>Satu Y, beberapa X</span></button><button data-advanced="descriptive"><b>Statistik Deskriptif</b><span>Mean, SD, SE, CV, skewness</span></button><button data-nextgen="regression"><b>Regresi</b><span>Kurva linear, kuadratik, kubik</span></button><button data-nextgen="pca"><b>PCA + Biplot</b><span>Scree plot, loading, PC1–PC2</span></button><button data-nextgen="combined"><b>ANOVA Gabungan</b><span>Seimbang atau GLM tidak seimbang</span></button><button data-mixed><b>Mixed Model REML</b><span>Kelompok(Lokasi) efek acak</span></button><button data-advanced="genetic"><b>Parameter Genetik</b><span>H², KKG, KKP, kemajuan genetik</span></button><button data-nextgen="stability"><b>AMMI / GGE Biplot</b><span>Stabilitas genotipe multilokasi</span></button>');
  panel.querySelectorAll('[data-association]').forEach(button=>button.addEventListener('click',()=>{closeAll();openAssociation(button.dataset.association);}));
  panel.querySelectorAll('[data-advanced]').forEach(button=>button.addEventListener('click',()=>{closeAll();openAdvanced(button.dataset.advanced);}));
  panel.querySelectorAll('[data-nextgen]').forEach(button=>button.addEventListener('click',()=>{closeAll();openNextGen(button.dataset.nextgen);}));
  panel.querySelector('[data-mixed]').addEventListener('click',()=>{closeAll();openMixedModel();});
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
