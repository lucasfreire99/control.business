/* Helpers de interface: criação de elementos, modal, confirmação, toast, máscaras. */
function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  let value;
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'value') value = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'checked' || k === 'disabled' || k === 'selected' || k === 'hidden' || k === 'readOnly') el[k] = !!v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  if (value !== undefined) el.value = value;
  return el;
}

const UI = (() => {
  /* ---------- toast ---------- */
  let toastTimer;
  function toast(msg, kind) {
    let t = document.getElementById('toast');
    if (!t) { t = h('div', { id: 'toast', role: 'status', 'aria-live': 'polite' }); document.body.append(t); }
    t.textContent = msg; t.className = 'toast show ' + (kind || '');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.className = 'toast'; }, 2800);
  }

  /* ---------- modal ---------- */
  function modal({ title, body, actions = [], wide = false }) {
    const prevFocus = document.activeElement;
    const overlay = h('div', { class: 'overlay' });
    const close = () => { overlay.remove(); document.removeEventListener('keydown', onKey); if (prevFocus && prevFocus.focus) prevFocus.focus(); };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    const foot = h('div', { class: 'modal-foot' }, actions.map((a) =>
      h('button', {
        type: 'button', class: 'btn ' + (a.primary ? 'btn-primary' : a.danger ? 'btn-danger' : ''),
        onclick: () => { const r = a.onClick ? a.onClick() : undefined; if (r !== false) close(); },
      }, a.label)));
    const box = h('div', { class: 'modal' + (wide ? ' wide' : ''), role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
      h('div', { class: 'modal-head' }, h('h2', null, title), h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Fechar', onclick: close }, '×')),
      h('div', { class: 'modal-body' }, body), foot);
    overlay.append(box);
    overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) close(); });
    document.body.append(overlay);
    document.addEventListener('keydown', onKey);
    const first = box.querySelector('input,select,textarea') || box.querySelector('.btn-primary');
    if (first) first.focus();
    return close;
  }
  function confirm(message, okLabel = 'Excluir') {
    return new Promise((resolve) => {
      let done = false;
      const fin = (v) => { if (!done) { done = true; resolve(v); } };
      const close = modal({
        title: 'Confirmar', body: h('p', null, message),
        actions: [{ label: 'Cancelar', onClick: () => fin(false) }, { label: okLabel, danger: true, onClick: () => fin(true) }],
      });
      // fechar por Esc / fundo conta como cancelar
      const obs = new MutationObserver(() => { if (!document.querySelector('.overlay')) { fin(false); obs.disconnect(); } });
      obs.observe(document.body, { childList: true });
    });
  }

  /* ---------- formatação e validação ---------- */
  const digits = (s) => (s || '').replace(/\D/g, '');
  function fmtCpf(s) { const d = digits(s).slice(0, 11); return d.replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2'); }
  function fmtCnpj(s) { const d = digits(s).slice(0, 14); return d.replace(/(\d{2})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1/$2').replace(/(\d{4})(\d{1,2})$/, '$1-$2'); }
  function validCpf(s) {
    const d = digits(s); if (d.length !== 11 || /^(\d)\1+$/.test(d)) return false;
    for (const n of [9, 10]) { let sum = 0; for (let i = 0; i < n; i++) sum += Number(d[i]) * (n + 1 - i); const dv = ((sum * 10) % 11) % 10; if (dv !== Number(d[n])) return false; }
    return true;
  }
  function validCnpj(s) {
    const d = digits(s); if (d.length !== 14 || /^(\d)\1+$/.test(d)) return false;
    for (const n of [12, 13]) {
      const w = n === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
      let sum = 0; for (let i = 0; i < n; i++) sum += Number(d[i]) * w[i];
      const r = sum % 11, dv = r < 2 ? 0 : 11 - r; if (dv !== Number(d[n])) return false;
    }
    return true;
  }
  function mask(input, fn) { input.addEventListener('input', () => { input.value = fn(input.value); }); return input; }

  /* ---------- componentes ---------- */
  const STATUS_CLASS = { 'OK': 's-ok', 'PENDENTE': 's-pend', 'N/A': 's-na', '-': 's-out', '': 's-blank' };
  function statusSelect(value, onChange, opts = {}) {
    const sel = h('select', { class: 'status-select ' + STATUS_CLASS[value], 'aria-label': opts.label || 'Status', disabled: opts.disabled },
      opts.allowBlank ? h('option', { value: '' }, '·') : null,
      Store.STATUS.map((s) => h('option', { value: s, selected: s === value }, s)));
    sel.value = value;
    sel.addEventListener('change', () => { sel.className = 'status-select ' + STATUS_CLASS[sel.value]; onChange(sel.value); });
    return sel;
  }
  const pill = (txt, cls) => h('span', { class: 'pill ' + (cls || '') }, txt);
  const situPill = (s) => pill(s, s === 'COMPLETO' ? 's-ok' : s === 'PENDENTE' ? 's-pend' : 's-na');
  function progress(pct) {
    const p = pct == null ? 0 : Math.round(pct * 100);
    return h('div', { class: 'progress', title: pct == null ? 'Sem itens' : p + '%' },
      h('div', { class: 'bar' }, h('i', { style: 'width:' + p + '%' })), h('span', { class: 'num' }, pct == null ? '–' : p + '%'));
  }
  function field(label, input, hint) {
    return h('label', { class: 'field' }, h('span', { class: 'field-label' }, label), input, hint ? h('span', { class: 'hint' }, hint) : null);
  }
  function empty(title, text, action) {
    return h('div', { class: 'empty' }, h('h3', null, title), h('p', null, text), action || null);
  }
  function table(cols, rows, opts = {}) {
    return h('div', { class: 'table-wrap' }, h('table', { class: 'tbl ' + (opts.class || '') },
      h('thead', null, h('tr', null, cols.map((c) => h('th', { class: c.cls || '' }, c.label)))),
      h('tbody', null, rows)));
  }
  function download(filename, blob) {
    const url = URL.createObjectURL(blob);
    const a = h('a', { href: url, download: filename });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  return { toast, modal, confirm, fmtCpf, fmtCnpj, validCpf, validCnpj, digits, mask, statusSelect, pill, situPill, progress, field, empty, table, download, STATUS_CLASS };
})();
