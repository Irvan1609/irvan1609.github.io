const $ = selector => document.querySelector(selector);
export function installAnalysisFlow() {
  const choice = $('#analysisChoice');
  function closeAll() { ['analysisChoice','ralModal','rakModal'].forEach(id => $('#'+id).classList.remove('open')); }
  $('#openAnalysis').addEventListener('click', () => { closeAll(); choice.classList.add('open'); choice.querySelector('[data-design]').focus(); });
  $('#closeAnalysisChoice').addEventListener('click', closeAll);
  choice.addEventListener('click', event => { if (event.target === choice) closeAll(); });
  choice.querySelectorAll('[data-design]').forEach(button => button.addEventListener('click', () => {
    closeAll(); document.dispatchEvent(new Event('open-analysis-'+button.dataset.design));
  }));
  document.querySelectorAll('[data-back-design]').forEach(button => button.addEventListener('click', () => { closeAll(); choice.classList.add('open'); }));
  document.addEventListener('keydown', event => { if (event.key === 'Escape') closeAll(); });
  ['#ralModal','#rakModal'].forEach(id => $(id).addEventListener('change', () => {
    $(id === '#ralModal' ? '#ralResult' : '#rakResult').innerHTML = '';
  }));
}
