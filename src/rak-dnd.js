(() => {
  const $ = (s) => document.querySelector(s);
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (m) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));

  function installStyles() {
    if ($('#rakDndStyles')) return;
    const style = document.createElement('style');
    style.id = 'rakDndStyles';
    style.textContent = `
      .rak-model{display:grid;grid-template-columns:minmax(190px,1fr) 36px minmax(210px,1.15fr);gap:14px;align-items:start}
      .rak-var-panel,.rak-role-panel{border:1px solid var(--border);background:#fff;border-radius:5px;min-height:330px}
      .rak-panel-title{font-size:12px;font-weight:650;color:#526171;background:#f1f4f7;border-bottom:1px solid var(--border);padding:9px 10px}
      .rak-variable-list{padding:8px;display:flex;flex-direction:column;gap:5px;max-height:390px;overflow:auto}
      .rak-chip{display:flex;align-items:center;gap:7px;padding:8px 9px;border:1px solid #cbd5df;border-radius:4px;background:#fff;color:#334455;font-size:13px;cursor:grab;user-select:none;touch-action:none}
      .rak-chip:hover{background:#f3f7fb;border-color:#8fb0ce}.rak-chip:active{cursor:grabbing}.rak-chip.dragging{opacity:.45}
      .rak-chip small{margin-left:auto;color:#8a96a3;font-size:10px}
      .rak-drop-panel{padding:10px;display:flex;flex-direction:column;gap:10px}
      .rak-role{border:1px dashed #aebdcb;border-radius:5px;background:#fafbfd;min-height:78px;padding:8px;transition:.12s}
      .rak-role.drag-over{border-color:var(--blue);background:#eef6ff;box-shadow:inset 0 0 0 1px var(--blue)}
      .rak-role-title{font-size:11px;font-weight:650;color:#647384;margin-bottom:6px}
      .rak-role-value{min-height:34px;display:flex;align-items:center;color:#98a3af;font-size:12px}
      .rak-role-value .rak-chip{width:100%;margin:0;cursor:default;background:#eef5fc;border-color:#a9c4dd;color:#214e76}
      .rak-arrow{display:flex;align-items:center;justify-content:center;color:#8291a0;font-size:22px;padding-top:155px}
      .rak-helper{margin-top:10px;padding:8px 10px;border:1px solid #dbe4ec;background:#f7f9fb;border-radius:5px;font-size:11px;color:#687787}
      .rak-hidden-selects{display:none!important}
      @media(max-width:700px){.rak-model{grid-template-columns:1fr}.rak-arrow{display:none}.rak-var-panel,.rak-role-panel{min-height:0}.rak-variable-list{max-height:210px}.rak-role{min-height:70px}}
    `;
    document.head.appendChild(style);
  }

  function headersFromApp() {
    // main.js keeps the active variables in the DOM only through its selects.
    // Read the option labels so this module does not depend on private state.
    const response = $('#rakResponse');
    if (!response) return [];
    const all = new Set();
    ['#rakResponse','#rakTreatment','#rakBlock'].forEach(id => document.querySelectorAll(`${id} option`).forEach(o => all.add(o.textContent)));
    return [...all];
  }

  function populateVariables() {
    const list = $('#rakVariableList');
    if (!list) return;
    const names = headersFromApp();
    list.innerHTML = names.length ? names.map(name => `<div class="rak-chip" draggable="true" data-variable="${esc(name)}">▦ ${esc(name)}<small>drag</small></div>`).join('') : '<div class="rak-helper">Tidak ada variabel. Kembali ke Data Editor dan masukkan dataset.</div>';
    list.querySelectorAll('.rak-chip[draggable="true"]').forEach(chip => {
      chip.addEventListener('dragstart', e => { chip.classList.add('dragging'); e.dataTransfer.effectAllowed='copy'; e.dataTransfer.setData('text/plain', chip.dataset.variable); });
      chip.addEventListener('dragend', () => chip.classList.remove('dragging'));
    });
  }

  function findOption(select, name) {
    return [...select.options].find(o => o.textContent === name);
  }

  function setRole(role, name) {
    const select = role === 'response' ? $('#rakResponse') : role === 'treatment' ? $('#rakTreatment') : $('#rakBlock');
    const value = $(`#rakRoleValue-${role}`);
    if (!select || !value) return;
    const option = findOption(select, name);
    if (!option) {
      const opt = document.createElement('option'); opt.value = ''; opt.textContent = name; select.appendChild(opt);
    }
    select.value = (findOption(select, name) || select.options[select.options.length-1]).value;
    value.innerHTML = `<div class="rak-chip">▦ ${esc(name)} <button type="button" data-clear-role="${role}" title="Hapus" style="margin-left:auto;border:0;background:transparent;color:#6c7b8a;cursor:pointer">✕</button></div>`;
    value.querySelector('[data-clear-role]').addEventListener('click', () => clearRole(role));
  }

  function clearRole(role) {
    const select = role === 'response' ? $('#rakResponse') : role === 'treatment' ? $('#rakTreatment') : $('#rakBlock');
    const value = $(`#rakRoleValue-${role}`);
    if (select) select.value = '';
    if (value) value.innerHTML = '<span>Tarik variabel ke sini</span>';
  }

  function bindDrop(role) {
    const zone = $(`#rakRole-${role}`);
    if (!zone) return;
    zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag-over'); e.dataTransfer.dropEffect='copy'; });
    zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
    zone.addEventListener('drop', e => {
      e.preventDefault(); zone.classList.remove('drag-over');
      const name = e.dataTransfer.getData('text/plain');
      if (name) setRole(role, name);
    });
  }

  function build() {
    installStyles();
    const modal = $('#rakModal');
    if (!modal || $('#rakDndRoot')) return;
    const body = modal.querySelector('.modal-body');
    if (!body) return;
    const oldGrid = body.querySelector('.form-grid');
    if (oldGrid) oldGrid.classList.add('rak-hidden-selects');
    const root = document.createElement('div');
    root.id = 'rakDndRoot';
    root.innerHTML = `
      <div class="rak-model">
        <div class="rak-var-panel">
          <div class="rak-panel-title">Variabel</div>
          <div id="rakVariableList" class="rak-variable-list"></div>
        </div>
        <div class="rak-arrow">→</div>
        <div class="rak-role-panel">
          <div class="rak-panel-title">Model RAK</div>
          <div class="rak-drop-panel">
            <div id="rakRole-response" class="rak-role"><div class="rak-role-title">RESPONSE VARIABLE(S)</div><div id="rakRoleValue-response" class="rak-role-value">Tarik peubah respons ke sini</div></div>
            <div id="rakRole-treatment" class="rak-role"><div class="rak-role-title">TREATMENT(S) / PERLAKUAN</div><div id="rakRoleValue-treatment" class="rak-role-value">Tarik perlakuan ke sini</div></div>
            <div id="rakRole-block" class="rak-role"><div class="rak-role-title">BLOCK / KELOMPOK / ULANGAN</div><div id="rakRoleValue-block" class="rak-role-value">Tarik kelompok ke sini</div></div>
          </div>
        </div>
      </div>
      <div class="rak-helper">💡 Seret nama variabel dari panel kiri ke <b>Response</b>, <b>Treatment</b>, atau <b>Block</b>. Klik ✕ pada variabel untuk mengosongkan pilihan.</div>
    `;
    body.insertBefore(root, body.firstChild);
    ['response','treatment','block'].forEach(bindDrop);
    modal.addEventListener('click', () => populateVariables(), { once:false });
    const originalOpen = window.openRAK;
    // openRAK is module-scoped, so use the visible Analyze controls as the refresh trigger.
    document.querySelectorAll('[data-menu="Analyze"],[data-mobile="Analyze"]').forEach(btn => btn.addEventListener('click', () => setTimeout(populateVariables, 30));
    document.querySelectorAll('#rakModal select').forEach(s => s.addEventListener('change', () => {
      const role = s.id === 'rakResponse' ? 'response' : s.id === 'rakTreatment' ? 'treatment' : 'block';
      const selected = s.options[s.selectedIndex];
      if (selected && selected.value !== '') setRole(role, selected.textContent);
    }));
    populateVariables();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build); else build();
})();
