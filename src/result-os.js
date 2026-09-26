import './result-os.css';
import {auditReports} from './analysis-audit.js';

const HISTORY='statistical_web_analysis_history_v1';
const PIN_STORE='statistical_web_result_pins_v1';

const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const fmt=(value,digits=2)=>Number.isFinite(Number(value))?Number(value).toLocaleString('id-ID',{minimumFractionDigits:digits,maximumFractionDigits:digits}):'—';

function testedTerms(report){
  return (report?.terms||[]).filter(term=>Number.isFinite(term?.p)&&!['Ulangan','Kelompok'].includes(String(term.label||'')));
}
function significance(report){
  const terms=testedTerms(report);
  if(!terms.length)return 'tn';
  const p=Math.min(...terms.map(term=>term.p));
  return p<.01?'**':p<.05?'*':'tn';
}
function minP(report){
  const terms=testedTerms(report);
  return terms.length?Math.min(...terms.map(term=>term.p)):NaN;
}
function significanceKey(report){
  const mark=significance(report);
  return mark==='**'?'ss':mark==='*'?'s':'tn';
}
function median(values){
  const list=values.filter(Number.isFinite).sort((a,b)=>a-b);
  if(!list.length)return NaN;
  const middle=Math.floor(list.length/2);
  return list.length%2?list[middle]:(list[middle-1]+list[middle])/2;
}
function readHistory(){
  try{
    const items=JSON.parse(localStorage.getItem(HISTORY)||'[]');
    return Array.isArray(items)?items.filter(item=>item&&Array.isArray(item.reports)):[];
  }catch{return [];}
}
function readPins(datasetName){
  try{
    const store=JSON.parse(localStorage.getItem(PIN_STORE)||'{}');
    return new Set(Array.isArray(store?.[datasetName])?store[datasetName]:[]);
  }catch{return new Set();}
}
function writePins(datasetName,pins){
  try{
    const store=JSON.parse(localStorage.getItem(PIN_STORE)||'{}');
    store[datasetName]=[...pins];
    localStorage.setItem(PIN_STORE,JSON.stringify(store));
  }catch{}
}
function reportMap(reports){return new Map((reports||[]).map(report=>[String(report.name),report]));}
function pLabel(value){return !Number.isFinite(value)?'—':value<.001?'<0,001':fmt(value,4);}
function renderInsights(reports,stale){
  const marks=reports.map(significance),ss=marks.filter(x=>x==='**').length,s=marks.filter(x=>x==='*').length,tn=marks.filter(x=>x==='tn').length;
  const cv=median(reports.map(report=>Number(report.cv)));
  const audit=auditReports(reports);
  const auditClass=audit.errors?'bad':audit.warnings?'warn':'good';
  const auditLabel=audit.errors?'Audit: ada masalah':audit.warnings?'Audit: perlu cek':'Audit: siap';
  return '<div class="result-os-insights">'+
    '<button type="button" data-os-filter="ss"><b>'+ss+'</b><span>sangat nyata</span></button>'+
    '<button type="button" data-os-filter="s"><b>'+s+'</b><span>nyata</span></button>'+
    '<button type="button" data-os-filter="tn"><b>'+tn+'</b><span>tidak nyata</span></button>'+
    '<span class="result-os-metric"><b>'+fmt(cv,2)+'%</b><span>median KK</span></span>'+
    '<span class="result-os-audit result-os-audit-'+auditClass+'">'+esc(auditLabel)+'</span>'+
    (stale?'<span class="result-os-audit result-os-audit-warn">Data berubah</span>':'')+
  '</div>';
}
function renderNavigator(reports,pins){
  return '<div class="result-os-navigator" aria-label="Navigator parameter">'+reports.map(report=>{
    const mark=significance(report),key=significanceKey(report),pinned=pins.has(String(report.name));
    return '<button type="button" data-os-nav="'+esc(report.name)+'" class="result-os-nav result-os-nav-'+key+(pinned?' is-pinned':'')+'">'+
      '<span>'+esc(report.name)+'</span><b>'+mark+'</b><small>'+pLabel(minP(report))+'</small>'+
    '</button>';
  }).join('')+'</div>';
}
function renderHeatmap(reports){
  const terms=[];
  for(const report of reports)for(const term of testedTerms(report))if(!terms.includes(term.label))terms.push(term.label);
  if(!terms.length)return '';
  const rows=reports.map(report=>{
    const map=new Map(testedTerms(report).map(term=>[term.label,term.p]));
    return '<tr><th>'+esc(report.name)+'</th>'+terms.map(label=>{
      const p=map.get(label),key=!Number.isFinite(p)?'na':p<.01?'ss':p<.05?'s':'tn';
      const mark=!Number.isFinite(p)?'—':p<.01?'**':p<.05?'*':'tn';
      return '<td class="result-heat-'+key+'" title="p '+pLabel(p)+'"><b>'+mark+'</b><small>'+pLabel(p)+'</small></td>';
    }).join('')+'</tr>';
  }).join('');
  return '<details class="result-os-panel result-os-heatmap"><summary>Heatmap signifikansi</summary><div class="table-scroll"><table class="result-table result-heatmap-table"><thead><tr><th>Parameter</th>'+terms.map(term=>'<th>'+esc(term)+'</th>').join('')+'</tr></thead><tbody>'+rows+'</tbody></table></div></details>';
}
function renderCompare(reports){
  const rows=reports.map((report,index)=>{
    const mark=significance(report);
    return '<tr data-os-compare-row="'+esc(report.name)+'"><td>'+esc(report.name)+'</td><td>'+fmt(report.grand,2)+'</td><td>'+fmt(report.cv,2)+'%</td><td><b>'+mark+'</b></td><td>'+pLabel(minP(report))+'</td></tr>';
  }).join('');
  const choices=reports.map((report,index)=>'<label><input type="checkbox" data-os-compare-choice="'+esc(report.name)+'" '+(index<Math.min(4,reports.length)?'checked':'')+'><span>'+esc(report.name)+'</span></label>').join('');
  return '<section class="result-os-panel result-os-compare" data-os-compare-panel><div class="result-os-panel-head"><div><b>Bandingkan parameter</b><small>Pilih maksimum 4 parameter</small></div></div><div class="result-os-compare-choices">'+choices+'</div><div class="table-scroll"><table class="result-table"><thead><tr><th>Parameter</th><th>Rataan</th><th>KK</th><th>Ket.</th><th>p minimum</th></tr></thead><tbody>'+rows+'</tbody></table></div></section>';
}
function renderDiff(reports,datasetName,resultVersion){
  const version=Number(resultVersion)||0;
  if(version<2)return '';
  const previous=readHistory().filter(item=>item.dataset===datasetName&&(Number(item.resultVersion)||0)<version).sort((a,b)=>(Number(b.resultVersion)||0)-(Number(a.resultVersion)||0))[0];
  if(!previous)return '';
  const before=reportMap(previous.reports),rows=[];
  for(const report of reports){
    const old=before.get(String(report.name));if(!old)continue;
    const dMean=Number(report.grand)-Number(old.grand),dCv=Number(report.cv)-Number(old.cv),oldSig=significance(old),newSig=significance(report),oldP=minP(old),newP=minP(report);
    rows.push('<tr><td>'+esc(report.name)+'</td><td>'+fmt(old.grand,2)+' → '+fmt(report.grand,2)+'</td><td class="'+(Math.abs(dMean)>1e-12?'changed':'')+'">'+(Number.isFinite(dMean)?(dMean>=0?'+':'')+fmt(dMean,2):'—')+'</td><td>'+fmt(old.cv,2)+'% → '+fmt(report.cv,2)+'%</td><td class="'+(oldSig!==newSig?'changed':'')+'">'+oldSig+' → '+newSig+'</td><td>'+pLabel(oldP)+' → '+pLabel(newP)+'</td></tr>');
  }
  if(!rows.length)return '';
  return '<details class="result-os-panel result-os-diff"><summary>Perubahan dari V'+esc(previous.resultVersion||'?')+' ke V'+esc(resultVersion)+'</summary><div class="table-scroll"><table class="result-table"><thead><tr><th>Parameter</th><th>Rataan</th><th>Δ Rataan</th><th>KK</th><th>Signifikansi</th><th>p minimum</th></tr></thead><tbody>'+rows.join('')+'</tbody></table></div></details>';
}
function resultSummaryText(reports,datasetName,resultVersion){
  const counts={'**':0,'*':0,'tn':0};reports.forEach(report=>{counts[significance(report)]++;});
  const lines=[
    datasetName+(resultVersion?' · V'+resultVersion:''),
    'Sangat nyata: '+counts['**']+' · nyata: '+counts['*']+' · tidak nyata: '+counts.tn,
    'Median KK: '+fmt(median(reports.map(report=>Number(report.cv))),2)+'%'
  ];
  for(const report of reports)lines.push(report.name+': '+significance(report)+' · p '+pLabel(minP(report))+' · KK '+fmt(report.cv,2)+'%');
  return lines.join('\n');
}
async function copyRich(html,text){
  if(navigator.clipboard&&window.ClipboardItem){
    const item=new ClipboardItem({'text/html':new Blob([html],{type:'text/html'}),'text/plain':new Blob([text],{type:'text/plain'})});
    await navigator.clipboard.write([item]);return;
  }
  if(navigator.clipboard?.writeText){await navigator.clipboard.writeText(text);return;}
  const area=document.createElement('textarea');area.value=text;area.style.position='fixed';area.style.opacity='0';document.body.append(area);area.select();document.execCommand('copy');area.remove();
}
function tableText(table){
  return [...table.rows].map(row=>[...row.cells].map(cell=>cell.innerText.replace(/\s+/g,' ').trim()).join('\t')).join('\n');
}
async function copyTable(button){
  const wrap=button.closest('.table-scroll'),table=wrap?.querySelector('table');if(!table)return;
  const clone=table.cloneNode(true);
  await copyRich('<table>'+clone.innerHTML+'</table>',tableText(table));
}
async function copyWord(container){
  const sections=[...container.querySelectorAll('.analysis-result')].filter(section=>!section.hidden&&!section.classList.contains('result-search-hidden'));
  const parts=[];
  for(const section of sections){
    const title=section.querySelector(':scope > h3')?.textContent?.replace(/(?:Ciutkan|Buka|★|☆)/g,'').trim();
    const bab4=section.querySelector('[data-bab4-table]');
    const interpretation=section.querySelector('[data-chapter-interpretation]');
    if(title)parts.push('<h2>'+esc(title)+'</h2>');
    if(bab4)parts.push(bab4.innerHTML);
    else{
      const anova=section.querySelector('.anova-table')?.closest('.table-scroll');
      if(anova)parts.push(anova.innerHTML);
      const posthoc=section.querySelector('.posthoc-table')?.closest('.table-scroll');
      if(posthoc)parts.push(posthoc.innerHTML);
    }
    if(interpretation)parts.push(interpretation.innerHTML);
  }
  const html='<div style="font-family:Arial,sans-serif;font-size:10pt;color:#000">'+parts.join('')+'</div>';
  const text=sections.map(section=>section.innerText).join('\n\n');
  await copyRich(html,text);
}
function roleForTable(wrap){
  const table=wrap.querySelector('table');if(!table)return 'technical';
  if(wrap.closest('[data-bab4-table]'))return 'bab4';
  if(wrap.closest('[data-os-compare-panel]'))return 'compare';
  if(table.classList.contains('result-heatmap-table'))return 'heatmap';
  if(table.classList.contains('anova-table'))return 'anova';
  if(table.classList.contains('posthoc-table')||table.classList.contains('contrast-summary-table')||table.classList.contains('contrast-calculation-table'))return 'posthoc';
  return 'technical';
}
function decorateTables(container){
  container.querySelectorAll('.table-scroll').forEach(wrap=>{
    const table=wrap.querySelector('table');if(!table)return;
    const cols=table.rows?.[0]?.cells?.length||0;
    table.classList.toggle('result-table-wide',cols>=8);
    table.classList.toggle('result-table-narrow',cols>0&&cols<=4);
    wrap.dataset.resultRole=roleForTable(wrap);
    if(wrap.querySelector(':scope > .result-os-copy-table'))return;
    const button=document.createElement('button');button.type='button';button.className='result-os-copy-table';button.textContent='⧉';button.title='Salin tabel';button.setAttribute('aria-label','Salin tabel ini');wrap.prepend(button);
  });
}
function installFieldPlotLinks(container){
  const data=globalThis.StatisticalWebData?.readActiveDataset?.();
  if(!data?.headers?.length||!data?.rows?.length)return;
  const idIndex=data.headers.findIndex(header=>/(^id$|petak|plot|unit|kode)/i.test(String(header||'')));
  if(idIndex<0)return;
  const ids=new Set(data.rows.map(row=>String(row[idIndex]??'').trim()).filter(Boolean));
  if(!ids.size)return;
  container.querySelectorAll('td,th').forEach(cell=>{
    if(cell.closest('.result-os-command,.result-os-navigator'))return;
    const value=String(cell.textContent||'').trim();
    if(!ids.has(value))return;
    cell.dataset.osFieldPlot=value;cell.classList.add('result-os-field-plot');cell.title='Buka plot '+value+' di Denah Lahan';cell.tabIndex=0;
  });
}
async function openFieldPlot(identifier){
  if(!globalThis.AgrotikFieldLayout)await import('./field-layout.js');
  return globalThis.AgrotikFieldLayout?.openPlot?.(identifier);
}
function setupPinButtons(container,datasetName,pins,grid,originalRank,state){
  const sections=[...container.querySelectorAll('.analysis-result')];
  const applyOrder=()=>{
    const list=[...sections];
    list.sort((a,b)=>{
      const ap=pins.has(a.dataset.parameter)?0:1,bp=pins.has(b.dataset.parameter)?0:1;if(ap!==bp)return ap-bp;
      if(state.smart){
        const rank={ss:0,s:1,tn:2};
        const diff=(rank[a.dataset.overallSignificance]??3)-(rank[b.dataset.overallSignificance]??3);if(diff)return diff;
      }
      return (originalRank.get(a.dataset.parameter)??9999)-(originalRank.get(b.dataset.parameter)??9999);
    });
    list.forEach(section=>grid.append(section));
    sections.forEach(section=>section.classList.toggle('result-pinned',pins.has(section.dataset.parameter)));
    container.querySelectorAll('[data-os-nav]').forEach(button=>button.classList.toggle('is-pinned',pins.has(button.dataset.osNav)));
  };
  for(const section of sections){
    const heading=section.querySelector(':scope > h3');if(!heading||heading.querySelector('[data-os-pin]'))continue;
    const button=document.createElement('button');button.type='button';button.className='result-pin-toggle';button.dataset.osPin=section.dataset.parameter;button.textContent=pins.has(section.dataset.parameter)?'★':'☆';button.title='Sematkan hasil ke atas';heading.append(button);
  }
  const pinHandler=event=>{
    const button=event.target.closest('[data-os-pin]');if(!button)return;
    event.preventDefault();event.stopPropagation();
    const name=button.dataset.osPin;
    if(pins.has(name))pins.delete(name);else pins.add(name);
    writePins(datasetName,pins);button.textContent=pins.has(name)?'★':'☆';applyOrder();
  };
  container.addEventListener('click',pinHandler);
  applyOrder();
  return {applyOrder,cleanup:()=>container.removeEventListener('click',pinHandler)};
}
function syncCompare(container){
  const selected=[...container.querySelectorAll('[data-os-compare-choice]:checked')].map(input=>input.dataset.osCompareChoice);
  container.querySelectorAll('[data-os-compare-row]').forEach(row=>{row.hidden=!selected.includes(row.dataset.osCompareRow);});
}
function jumpTarget(container,key){
  const active='.analysis-result:not([hidden]):not(.result-search-hidden)';
  const selectors={
    summary:'.result-os-insights, .analysis-summary',
    parameter:active,
    anova:active+' .anova-table',
    posthoc:active+' .posthoc-table, '+active+' .contrast-summary-table, '+active+' [data-decision-summary]',
    diagnostics:active+' .scientific-chart, '+active+' .result-technical-details',
    chart:active+' .scientific-chart',
    bab4:active+' [data-bab4-table]'
  };
  const choices=String(selectors[key]||'').split(',').map(item=>item.trim()).filter(Boolean);
  for(const selector of choices){const target=container.querySelector(selector);if(target)return target;}
  return null;
}

export function enhanceResultOS(container,reports,options={}){
  if(!container||!reports?.length)return;
  if(typeof container._resultOsCleanup==='function')container._resultOsCleanup();
  container.classList.add('result-os-enhanced');
  for(const className of ['split-results-mode','important-results-mode','examiner-results-mode','focus-results-mode'])container.classList.remove(className);
  const datasetName=String(options.datasetName||reports[0]?.datasetName||'dataset');
  const resultVersion=String(options.resultVersion||reports[0]?.resultVersion||'');
  const pins=readPins(datasetName);
  const originalRank=new Map(reports.map((report,index)=>[String(report.name),index]));
  const state={smart:false,collapsedNs:false};
  const sections=[...container.querySelectorAll('.analysis-result')];
  let grid=container.querySelector('.result-os-grid');
  if(!grid){
    grid=document.createElement('div');grid.className='result-os-grid';
    const first=sections[0];if(first)first.parentNode.insertBefore(grid,first);
    sections.forEach(section=>grid.append(section));
  }

  const shell=document.createElement('section');shell.className='result-os-shell';shell.dataset.resultOs='';
  shell.innerHTML=
    '<div class="result-os-command">'+
      '<input type="search" data-os-search placeholder="Cari hasil…" aria-label="Cari pada hasil">'+
      '<details class="result-os-menu"><summary>Bagian</summary><div class="result-os-menu-body" role="navigation" aria-label="Bagian hasil">'+
        '<button type="button" data-os-jump="summary">Ringkasan</button><button type="button" data-os-jump="parameter">Parameter</button><button type="button" data-os-jump="anova">ANOVA</button><button type="button" data-os-jump="posthoc">Uji lanjut</button><button type="button" data-os-jump="diagnostics">Diagnostik</button><button type="button" data-os-jump="chart">Grafik</button><button type="button" data-os-jump="bab4">BAB IV</button>'+
      '</div></details>'+
      '<details class="result-os-menu"><summary>Tampilan</summary><div class="result-os-menu-body">'+
        '<button type="button" data-os-focus aria-pressed="false">Fokus parameter</button>'+
        '<button type="button" data-os-split aria-pressed="false">Dua kolom</button>'+
        '<button type="button" data-os-important aria-pressed="false">Hanya penting</button>'+
        '<button type="button" data-os-examiner aria-pressed="false">Mode penguji</button>'+
        '<button type="button" data-os-proxy="compare" aria-pressed="false">Bandingkan</button>'+
        '<button type="button" data-os-proxy="thesis" aria-pressed="false">Skripsi</button>'+
        '<button type="button" data-os-proxy="presentation" aria-pressed="false">Presentasi</button>'+
        '<button type="button" data-os-smart aria-pressed="false">Urutkan nyata</button>'+
        '<button type="button" data-os-collapse-ns aria-pressed="false">Ringkas tidak nyata</button>'+
      '</div></details>'+
    '</div>'+
    renderInsights(reports,!!options.stale)+
    renderNavigator(reports,pins)+
    '<div class="result-os-panels">'+renderCompare(reports)+renderHeatmap(reports)+renderDiff(reports,datasetName,resultVersion)+'</div>';
  const stale=container.querySelector('[data-stale-banner]');
  if(stale)stale.after(shell);else container.prepend(shell);

  decorateTables(container);
  installFieldPlotLinks(container);
  const pinSetup=setupPinButtons(container,datasetName,pins,grid,originalRank,state);
  const applyPinnedOrder=pinSetup.applyOrder;
  syncCompare(container);

  const focusSelect=container.querySelector('[data-result-focus]');
  const filterButtons=[...container.querySelectorAll('[data-result-filter]')];
  const modeProxy={compare:'[data-compare-mode]',thesis:'[data-thesis-table-mode]',presentation:'[data-presentation-mode]'};
  const syncModeButtons=()=>{
    const map={compare:'compare-parameters-mode',thesis:'thesis-table-mode',presentation:'presentation-results-mode'};
    container.querySelectorAll('[data-os-proxy]').forEach(button=>button.setAttribute('aria-pressed',String(container.classList.contains(map[button.dataset.osProxy]))));
    const focused=!!focusSelect?.value;container.classList.toggle('focus-results-mode',focused);
    const focusButton=container.querySelector('[data-os-focus]');if(focusButton)focusButton.setAttribute('aria-pressed',String(focused));
  };
  const applySearch=()=>{
    const query=String(container.querySelector('[data-os-search]')?.value||'').trim().toLowerCase();
    container.querySelectorAll('.analysis-result').forEach(section=>section.classList.toggle('result-search-hidden',!!query&&!section.textContent.toLowerCase().includes(query)));
  };
  let searchTimer=0;
  const clickHandler=async event=>{
    const fieldPlot=event.target.closest('[data-os-field-plot]');
    if(fieldPlot){event.preventDefault();await openFieldPlot(fieldPlot.dataset.osFieldPlot);return;}
    const nav=event.target.closest('[data-os-nav]');
    if(nav&&focusSelect){focusSelect.value=nav.dataset.osNav;focusSelect.dispatchEvent(new Event('change',{bubbles:true}));container.scrollTop=0;syncModeButtons();return;}
    const insight=event.target.closest('[data-os-filter]');
    if(insight){const target=filterButtons.find(button=>button.dataset.resultFilter===insight.dataset.osFilter);target?.click();return;}
    const jump=event.target.closest('[data-os-jump]');
    if(jump){jumpTarget(container,jump.dataset.osJump)?.scrollIntoView({behavior:'smooth',block:'start'});return;}
    const proxy=event.target.closest('[data-os-proxy]');
    if(proxy){container.querySelector(modeProxy[proxy.dataset.osProxy])?.click();setTimeout(syncModeButtons,0);return;}
    const focusButton=event.target.closest('[data-os-focus]');
    if(focusButton&&focusSelect){
      if(focusSelect.value)focusSelect.value='';
      else{
        const first=[...container.querySelectorAll('.analysis-result')].find(section=>!section.hidden&&!section.classList.contains('result-search-hidden'))||container.querySelector('.analysis-result');
        if(first)focusSelect.value=first.dataset.parameter;
      }
      focusSelect.dispatchEvent(new Event('change',{bubbles:true}));syncModeButtons();return;
    }
    const split=event.target.closest('[data-os-split]');
    if(split){
      if(focusSelect?.value){focusSelect.value='';focusSelect.dispatchEvent(new Event('change',{bubbles:true}));}
      const active=container.classList.toggle('split-results-mode');split.setAttribute('aria-pressed',String(active));return;
    }
    const important=event.target.closest('[data-os-important]');
    if(important){const active=container.classList.toggle('important-results-mode');important.setAttribute('aria-pressed',String(active));return;}
    const examiner=event.target.closest('[data-os-examiner]');
    if(examiner){
      const active=container.classList.toggle('examiner-results-mode');examiner.setAttribute('aria-pressed',String(active));
      if(active)container.querySelectorAll('.result-technical-details').forEach(details=>details.open=true);
      return;
    }
    const smart=event.target.closest('[data-os-smart]');
    if(smart){state.smart=!state.smart;smart.setAttribute('aria-pressed',String(state.smart));applyPinnedOrder();return;}
    const collapse=event.target.closest('[data-os-collapse-ns]');
    if(collapse){
      state.collapsedNs=!state.collapsedNs;collapse.setAttribute('aria-pressed',String(state.collapsedNs));
      container.querySelectorAll('.analysis-result[data-overall-significance="tn"]').forEach(section=>{
        section.classList.toggle('result-collapsed',state.collapsedNs);
        const toggle=section.querySelector('.result-collapse-toggle');if(toggle){toggle.textContent=state.collapsedNs?'Buka':'Ciutkan';toggle.setAttribute('aria-expanded',String(!state.collapsedNs));}
      });return;
    }
    const copy=event.target.closest('.result-os-copy-table');if(copy){await copyTable(copy);copy.textContent='Tersalin';setTimeout(()=>copy.textContent='Salin tabel',900);return;}
    if(event.target.closest('[data-os-copy-word]')){await copyWord(container);const button=event.target.closest('[data-os-copy-word]');button.textContent='Tersalin';setTimeout(()=>button.textContent='Salin Word',900);return;}
    if(event.target.closest('[data-os-share]')){
      const text=resultSummaryText(reports,datasetName,resultVersion);
      if(navigator.share){try{await navigator.share({title:'Hasil analisis '+datasetName,text});return;}catch(error){if(error?.name==='AbortError')return;}}
      await navigator.clipboard?.writeText(text);const button=event.target.closest('[data-os-share]');button.textContent='Disalin';setTimeout(()=>button.textContent='Bagikan',900);return;
    }
    if(event.target.closest('[data-os-history]')){document.querySelector('#analysisHistory')?.click();return;}
  };
  const inputHandler=event=>{
    if(!event.target.matches('[data-os-search]'))return;
    clearTimeout(searchTimer);searchTimer=setTimeout(applySearch,120);
  };
  const changeHandler=event=>{
    if(event.target.matches('[data-os-compare-choice]')){
      const checked=[...container.querySelectorAll('[data-os-compare-choice]:checked')];
      if(checked.length>4){event.target.checked=false;}
      syncCompare(container);return;
    }
    if(event.target.matches('[data-result-focus]'))syncModeButtons();
  };
  container.addEventListener('click',clickHandler);
  container.addEventListener('input',inputHandler);
  container.addEventListener('change',changeHandler);

  let touchStart=null;
  const touchStartHandler=event=>{const t=event.touches?.[0];if(t)touchStart={x:t.clientX,y:t.clientY,time:Date.now()};};
  const touchEndHandler=event=>{
    if(!touchStart)return;const t=event.changedTouches?.[0];if(!t)return;
    const dx=t.clientX-touchStart.x,dy=t.clientY-touchStart.y,dt=Date.now()-touchStart.time;touchStart=null;
    if(dt>700)return;
    if(Math.abs(dx)>65&&Math.abs(dx)>Math.abs(dy)*1.25){container.querySelector(dx<0?'[data-result-next]':'[data-result-prev]')?.click();}
  };
  if(container.id==='analysisDockResults'){
    container.addEventListener('touchstart',touchStartHandler,{passive:true});container.addEventListener('touchend',touchEndHandler,{passive:true});
  }

  const keyHandler=event=>{
    if(container.id!=='analysisDockResults')return;
    const dock=document.querySelector('#analysisResultDock');if(!dock||dock.hidden)return;
    if(event.target?.matches?.('input,textarea,select,[contenteditable="true"]'))return;
    if(event.key==='/'){event.preventDefault();container.querySelector('[data-os-search]')?.focus();return;}
    if(event.key==='j'||event.key==='J'){event.preventDefault();container.querySelector('[data-result-next]')?.click();return;}
    if(event.key==='k'||event.key==='K'){event.preventDefault();container.querySelector('[data-result-prev]')?.click();return;}
    if(event.key==='f'||event.key==='F'){event.preventDefault();container.querySelector('[data-os-focus]')?.click();return;}
    if(event.key==='c'||event.key==='C'){event.preventDefault();container.querySelector('[data-os-copy-word]')?.click();return;}
    if(event.key==='e'||event.key==='E'){event.preventDefault();container.querySelector('[data-result-action="export-all"]')?.click();return;}
  };
  document.addEventListener('keydown',keyHandler);

  let headStart=null;
  const head=document.querySelector('#analysisResultDock .analysis-dock-head');
  const headStartHandler=event=>{const t=event.touches?.[0];if(t)headStart={y:t.clientY,time:Date.now()};};
  const headEndHandler=event=>{const t=event.changedTouches?.[0];if(!headStart||!t)return;const dy=t.clientY-headStart.y,dt=Date.now()-headStart.time;headStart=null;if(dy>70&&dt<700)document.querySelector('#closeAnalysisDock')?.click();};
  if(container.id==='analysisDockResults'&&head){head.addEventListener('touchstart',headStartHandler,{passive:true});head.addEventListener('touchend',headEndHandler,{passive:true});}

  syncModeButtons();
  container._resultOsCleanup=()=>{
    clearTimeout(searchTimer);
    container.removeEventListener('click',clickHandler);container.removeEventListener('input',inputHandler);container.removeEventListener('change',changeHandler);
    container.removeEventListener('touchstart',touchStartHandler);container.removeEventListener('touchend',touchEndHandler);
    document.removeEventListener('keydown',keyHandler);
    pinSetup.cleanup();
    if(head){head.removeEventListener('touchstart',headStartHandler);head.removeEventListener('touchend',headEndHandler);}
  };
}
