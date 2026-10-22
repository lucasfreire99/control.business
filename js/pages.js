/* Telas do sistema. Cada função recebe o elemento raiz e (opcional) um parâmetro de rota. */
const Pages = (() => {
  const S = Store;
  const link = (href, txt, cls) => h('a', { href, class: cls || '' }, txt);
  const go = (hash) => { location.hash = hash; };
  let painelYm = S.nowYm();
  let confYm = S.nowYm();
  let fichaYm = S.nowYm();
  let matrizAno = new Date().getFullYear();
  const R = { type: 'conferencia', empId: '', ym: S.nowYm(), from: '', to: S.nowYm(), ano: new Date().getFullYear() };
  const cls = (st) => UI.STATUS_CLASS[st];
  // Copiar texto: tenta a API moderna e, se o navegador bloquear, usa o método antigo (seleciona e copia)
  async function copyText(text) {
    try { if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(text); return true; } } catch (err) { /* tenta o plano B */ }
    const ta = document.createElement('textarea');
    ta.value = text; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;';
    document.body.append(ta); ta.focus(); ta.select(); ta.setSelectionRange(0, text.length);
    let ok = false; try { ok = document.execCommand('copy'); } catch (err) { ok = false; }
    ta.remove(); return ok;
  }
  // Botão de copiar com retorno visível ("Copiado ✓" ou aviso de falha)
  function copyBtn(label, getText, msg, opts = {}) {
    const b = h('button', { class: 'btn' + (opts.primary ? ' btn-primary' : ''), type: 'button', id: opts.id }, label);
    b.addEventListener('click', async () => {
      const txt = getText(); const ok = await copyText(txt);
      UI.toast(ok ? msg : 'Não foi possível copiar automaticamente. Selecione o texto e use Ctrl+C.', ok ? 'ok' : 'bad');
      if (ok) { b.textContent = 'Copiado ✓'; setTimeout(() => { b.textContent = label; }, 1800); }
    });
    return b;
  }

  function pageHead(title, sub, ...actions) {
    const withFocus = !['Configurações', 'Equipe', 'Cobrança'].includes(title);
    return h('div', { class: 'page-head' }, h('div', null, h('h1', null, title), sub ? h('p', { class: 'sub' }, sub) : null), h('div', { class: 'actions' }, withFocus ? focusBtn() : null, actions));
  }
  function needSetup(root) {
    if (S.state().empresas.length) return false;
    root.append(pageHead('Comece por aqui', 'Cadastre as empresas cuja documentação você precisa conferir.'),
      UI.empty('Nenhuma empresa cadastrada', 'Cadastre a primeira empresa. Os 11 documentos mensais já estão prontos para conferir.',
        h('div', { class: 'actions' }, link('#/empresas', 'Ir para Empresas', 'btn btn-primary'))));
    return true;
  }
  function empSelect(id, value, onChange, list) {
    const sel = h('select', { id, class: 'input' }, (list || S.state().empresas).map((e) => h('option', { value: e.id }, e.nome)));
    sel.value = value; sel.addEventListener('change', () => onChange(sel.value));
    return sel;
  }
  function monthNav(value, onChange, id) {
    const inp = h('input', { type: 'month', id, class: 'input', value, 'aria-label': 'Mês' });
    inp.addEventListener('change', () => { if (inp.value) onChange(inp.value); });
    return h('div', { class: 'month-nav' },
      h('button', { type: 'button', class: 'btn btn-icon', 'aria-label': 'Mês anterior', onclick: () => onChange(S.addMonths(inp.value || value, -1)) }, '‹'), inp,
      h('button', { type: 'button', class: 'btn btn-icon', 'aria-label': 'Próximo mês', onclick: () => onChange(S.addMonths(inp.value || value, 1)) }, '›'));
  }
  async function run(fn) {
    if (typeof ExcelJS === 'undefined') { UI.toast('A biblioteca de Excel não carregou. Confira a pasta js/vendor.', 'bad'); return; }
    try { await fn(); UI.toast('Arquivo Excel gerado', 'ok'); } catch (err) { console.error(err); UI.toast('Não foi possível gerar o Excel: ' + err.message, 'bad'); }
  }
  // Tela cheia: esconde o menu lateral para a tabela ocupar a janela toda (lembra a escolha)
  const focusBtn = () => {
    const on = () => document.body.classList.contains('focus');
    const b = h('button', { class: 'btn', type: 'button', id: 'focusBtn', title: 'Esconde ou mostra o menu lateral', onclick: () => {
      document.body.classList.toggle('focus');
      try { localStorage.setItem('docctrl.focus', on() ? '1' : '0'); } catch (e) { /* ignora */ }
      b.textContent = on() ? 'Mostrar menu' : 'Tela cheia';
    } }, on() ? 'Mostrar menu' : 'Tela cheia');
    return b;
  };
  const exportBtn = (fn, label) => h('button', { class: 'btn btn-primary', type: 'button', onclick: () => run(fn) }, label || 'Exportar Excel');
  const firstEmp = (id) => S.emp(id) || S.state().empresas[0];
  const legenda = 'OK = entregue · PENDENTE = falta entregar · N/A = não se aplica · "-" = antes do início do controle · "·" = mês futuro ainda não iniciado.';

  /* ================= PAINEL ================= */
  function painel(root) {
    const ym = painelYm;
    const rerender = () => { root.textContent = ''; painel(root); };
    root.append(pageHead('Painel', 'Situação da documentação em ' + S.fmtYmLong(ym) + '.', monthNav(ym, (v) => { painelYm = v; rerender(); }, 'painelMes')));
    if (needSetup(root)) return;

    const lista = S.ativas().filter((e) => e.inicio <= ym);
    const all = []; lista.forEach((e) => all.push(...S.statusesEmpresa(e, ym)));
    const t = S.tally(all), pend = S.pendencias(ym);
    const completas = lista.filter((e) => S.situacao(S.tally(S.statusesEmpresa(e, ym))) === 'COMPLETO').length;
    const kpi = (label, value, sub, c) => h('div', { class: 'kpi ' + (c || '') }, h('span', { class: 'kpi-label' }, label), h('strong', { class: 'num' }, value), h('span', { class: 'kpi-sub' }, sub));
    root.append(h('div', { class: 'kpis' },
      kpi('Concluído no mês', t.pct == null ? '–' : Math.round(t.pct * 100) + '%', t.ok + ' de ' + t.app + ' itens OK'),
      kpi('Empresas completas', completas + ' de ' + lista.length, 'sem nenhuma pendência no mês', lista.length && completas === lista.length ? 'good' : ''),
      kpi('Pendências até o mês', pend.length, 'itens a entregar (todos os meses)', pend.length ? 'bad' : 'good'),
      kpi('Empresas ativas', S.ativas().length, S.state().empresas.length - S.ativas().length + ' inativa(s)')));

    const rows = lista.map((e) => {
      const sts = S.statusesEmpresa(e, ym), tt = S.tally(sts);
      const pe = S.tally(S.DOCS.map((d, i) => (d.g === 'empresa' ? sts[i] : ''))), pc = S.tally(S.DOCS.map((d, i) => (d.g === 'colab' ? sts[i] : '')));
      return h('tr', null, h('td', null, h('strong', null, e.nome)), h('td', null, UI.progress(tt.pct)),
        h('td', { class: 'num c' }, pe.pend), h('td', { class: 'num c' }, pc.pend), h('td', { class: 'c' }, UI.situPill(S.situacao(tt))),
        h('td', { class: 'row-actions' }, link('#/ficha/' + e.id, 'Abrir', 'btn btn-sm')));
    });
    root.append(h('section', { class: 'block' }, h('h2', null, 'Por empresa'),
      rows.length ? UI.table([{ label: 'Empresa' }, { label: 'Concluído' }, { label: 'Pend. empresa', cls: 'c' }, { label: 'Pend. colaborador', cls: 'c' }, { label: 'Situação', cls: 'c' }, { label: '' }], rows)
        : UI.empty('Nenhuma empresa com controle neste mês', 'As empresas aparecem a partir do mês de início do controle.')));

    const pr = pend.slice(0, 15).map(({ e, d, comp }) => h('tr', null,
      h('td', null, e.nome), h('td', null, d.curto), h('td', { class: 'c num' }, S.fmtYm(comp)), h('td', { class: 'row-actions' }, link('#/ficha/' + e.id, 'Abrir', 'btn btn-sm'))));
    root.append(h('section', { class: 'block' }, h('h2', null, 'Pendências'),
      pend.length ? [UI.table([{ label: 'Empresa' }, { label: 'Documento' }, { label: 'Competência', cls: 'c' }, { label: '' }], pr),
        pend.length > 15 ? h('p', { class: 'muted' }, 'Mostrando 15 de ' + pend.length + '. A lista completa está em ', link('#/relatorios', 'Relatórios'), '.') : null]
        : UI.empty('Sem pendências', 'Todos os documentos até este mês estão OK ou não se aplicam.')));
  }

  /* ================= EMPRESAS ================= */
  function empresas(root) {
    const rerender = () => { root.textContent = ''; empresas(root); };
    root.append(pageHead('Empresas', 'Cada empresa é conferida mês a mês com o mesmo checklist de 11 documentos.', h('button', { class: 'btn btn-primary', type: 'button', onclick: () => empresaModal(null, rerender) }, 'Nova empresa')));
    const list = S.state().empresas;
    if (!list.length) { root.append(UI.empty('Nenhuma empresa cadastrada', 'Clique em "Nova empresa" para começar.')); return; }
    root.append(UI.table([{ label: 'Empresa' }, { label: 'CNPJ' }, { label: 'Contato' }, { label: 'Controle desde', cls: 'c' }, { label: 'Situação', cls: 'c' }, { label: '' }],
      list.map((e) => h('tr', null,
        h('td', null, h('strong', null, e.nome)), h('td', { class: 'mono' }, e.cnpj || '–'), h('td', null, e.contato || '–'),
        h('td', { class: 'c num' }, S.fmtYm(e.inicio)), h('td', { class: 'c' }, UI.pill(e.ativa ? 'Ativa' : 'Inativa', e.ativa ? 's-ok' : 's-na')),
        h('td', { class: 'row-actions' },
          link('#/ficha/' + e.id, 'Abrir', 'btn btn-sm'),
          h('button', { class: 'btn btn-sm', type: 'button', onclick: () => empresaModal(e, rerender) }, 'Editar'),
          h('button', { class: 'btn btn-sm btn-danger-ghost', type: 'button', onclick: async () => {
            if (await UI.confirm('Excluir a empresa "' + e.nome + '"? Todo o controle de documentos dela será apagado. Para só tirar das listas, marque como inativa.')) { S.deleteEmpresa(e.id); UI.toast('Empresa excluída'); rerender(); }
          } }, 'Excluir'))))));
  }
  function empresaModal(e, done) {
    const nome = h('input', { id: 'e_nome', class: 'input', value: e ? e.nome : '', maxlength: 80, autocomplete: 'off' });
    const cnpj = UI.mask(h('input', { id: 'e_cnpj', class: 'input mono', value: e ? e.cnpj : '', inputmode: 'numeric', placeholder: '00.000.000/0000-00' }), UI.fmtCnpj);
    const contato = h('input', { id: 'e_contato', class: 'input', value: e ? e.contato : '', maxlength: 120, placeholder: 'Nome, e-mail ou telefone' });
    const email = h('input', { id: 'e_email', class: 'input', type: 'email', value: e ? e.email || '' : '', maxlength: 120, placeholder: 'financeiro@empresa.com.br' });
    const tel = h('input', { id: 'e_tel', class: 'input', type: 'tel', value: e ? e.telefone || '' : '', maxlength: 20, placeholder: '(11) 91234-5678', inputmode: 'tel' });
    const inicio = h('input', { id: 'e_inicio', class: 'input', type: 'month', value: e ? e.inicio : S.nowYm() });
    const ativa = h('input', { type: 'checkbox', id: 'e_ativa', checked: e ? e.ativa : true });
    const err = h('p', { class: 'error', role: 'alert' });
    UI.modal({
      title: e ? 'Editar empresa' : 'Nova empresa',
      body: h('div', { class: 'form' }, UI.field('Nome da empresa *', nome), UI.field('CNPJ', cnpj), UI.field('Contato (nome)', contato), UI.field('E-mail para cobrança', email), UI.field('WhatsApp para cobrança', tel),
        UI.field('Controlar a partir de', inicio, 'Meses anteriores aparecem como "-" e não contam como pendência.'),
        h('label', { class: 'check' }, ativa, 'Empresa ativa (aparece no painel e nos relatórios)'), err),
      actions: [{ label: 'Cancelar' }, { label: 'Salvar', primary: true, onClick: () => {
        if (!nome.value.trim()) { err.textContent = 'Informe o nome da empresa.'; nome.focus(); return false; }
        if (cnpj.value && !UI.validCnpj(cnpj.value)) { err.textContent = 'CNPJ inválido. Confira os dígitos ou deixe em branco.'; cnpj.focus(); return false; }
        if (email.value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value.trim())) { err.textContent = 'E-mail inválido.'; email.focus(); return false; }
        if (tel.value && ![10, 11, 12, 13].includes(UI.digits(tel.value).length)) { err.textContent = 'WhatsApp inválido. Use DDD + número.'; tel.focus(); return false; }
        if (!S.isYm(inicio.value)) { err.textContent = 'Informe o mês de início do controle.'; inicio.focus(); return false; }
        S.saveEmpresa({ id: e ? e.id : S.uid(), nome: nome.value.trim(), cnpj: cnpj.value, contato: contato.value.trim(), email: email.value.trim(), telefone: tel.value.trim(), inicio: inicio.value, ativa: ativa.checked });
        UI.toast('Empresa salva', 'ok'); done();
      } }],
    });
  }

  /* ================= CONFERÊNCIA (todas as empresas no mês) ================= */
  function conferencia(root) {
    const ym = confYm;
    const rerender = () => { root.textContent = ''; conferencia(root); };
    root.append(pageHead('Conferência do mês', 'Todas as empresas e os 11 documentos de ' + S.fmtYmLong(ym) + '.',
      monthNav(ym, (v) => { confYm = v; rerender(); }, 'confMes'), exportBtn(() => Reports.conferencia(ym))));
    if (needSetup(root)) return;
    const lista = S.ativas().filter((e) => e.inicio <= ym);
    if (!lista.length) { root.append(UI.empty('Nenhuma empresa com controle neste mês', 'As empresas aparecem a partir do mês de início do controle.')); return; }
    const sums = [];
    const refresh = () => sums.forEach((f) => f());
    const grp = S.GROUPS.map((g) => ({ g, n: S.docsDe(g.id).length }));
    const head1 = h('tr', null, h('th', { class: 'sticky', rowspan: 2 }, 'Empresa'), grp.map(({ g, n }) => h('th', { class: 'c grp', colspan: n }, g.curto)), h('th', { class: 'c', rowspan: 2 }, 'Concluído'), h('th', { class: 'c', rowspan: 2 }, ''));
    const head2 = h('tr', null, S.DOCS.map((d) => h('th', { class: 'c doc-h', title: d.nome }, d.curto)));
    const rows = lista.map((e) => {
      const sumCell = h('td', { class: 'c num' });
      const upd = () => { const t = S.tally(S.statusesEmpresa(e, ym)); sumCell.textContent = t.pct == null ? '–' : Math.round(t.pct * 100) + '%'; sumCell.className = 'c num ' + (t.pct == null ? '' : t.pct === 1 ? 'good' : t.pct < 0.7 ? 'bad' : 'warn'); };
      sums.push(upd); upd();
      return h('tr', null, h('th', { class: 'sticky doc', scope: 'row' }, link('#/ficha/' + e.id, e.nome)),
        S.DOCS.map((d) => { const s = S.statusOf(e, d, ym); return h('td', { class: 'c' }, UI.statusSelect(s, (x) => { S.setReg(e, d, ym, { status: x }); refresh(); }, { allowBlank: s === '', label: e.nome + ' – ' + d.curto })); }),
        sumCell,
        h('td', { class: 'row-actions' }, h('button', { class: 'btn btn-sm', type: 'button', title: 'Marca como OK tudo o que está pendente neste mês', onclick: () => { S.setMany(e, ym, 'OK', true); rerender(); } }, 'Tudo OK')));
    });
    root.append(h('div', { class: 'table-wrap matrix conf' }, h('table', { class: 'tbl' }, h('thead', null, head1, head2), h('tbody', null, rows))));
    root.append(h('p', { class: 'muted' }, legenda + ' Passe o mouse sobre o título da coluna para ver o nome completo do documento. "Tudo OK" só altera o que está PENDENTE.'));
  }

  /* ================= FICHA (uma empresa, um mês) ================= */
  function docRow(e, d, ym, n, onChange) {
    const st = S.statusOf(e, d, ym), out = st === '-';
    const reg = S.getReg(e.id, d.id, ym) || {};
    const set = (patch) => { S.setReg(e, d, ym, patch); onChange(); };
    return h('tr', { class: out ? 'row-out' : '' },
      h('td', { class: 'num c' }, n), h('td', null, d.nome),
      h('td', { class: 'c' }, out ? UI.pill('-', 's-out') : UI.statusSelect(st, (x) => set({ status: x }), { allowBlank: st === '', label: d.curto })),
      h('td', { class: 'obs-cell' }, h('textarea', { class: 'input obs-area', rows: 3, disabled: out, maxlength: 600, placeholder: out ? '' : 'Escreva uma observação…', 'aria-label': 'Observação – ' + d.curto, onchange: (ev) => set({ obs: ev.target.value.trim() }) }, reg.obs || '')));
  }
  function ficha(root, eid) {
    if (needSetup(root)) return;
    const e = firstEmp(eid), ym = fichaYm;
    const status = h('div', { class: 'ficha-status' });
    const refresh = () => {
      const t = S.tally(S.statusesEmpresa(e, ym));
      status.textContent = '';
      status.append(h('div', null, h('span', { class: 'kpi-label' }, 'Progresso'), UI.progress(t.pct)), h('div', null, h('span', { class: 'kpi-label' }, 'Situação'), UI.situPill(S.situacao(t))),
        h('div', null, h('span', { class: 'kpi-label' }, 'Itens'), h('span', { class: 'num' }, t.ok + ' OK · ' + t.pend + ' pendente(s) · ' + t.na + ' N/A')));
    };
    root.append(pageHead(e.nome, (e.cnpj ? 'CNPJ ' + e.cnpj + ' · ' : '') + 'controle desde ' + S.fmtYm(e.inicio) + (e.ativa ? '' : ' · INATIVA'),
      link('#/matriz/' + e.id, 'Matriz anual', 'btn'), exportBtn(() => Reports.checklist(e.id, ym))));
    root.append(h('div', { class: 'toolbar' }, h('label', { class: 'field inline' }, h('span', { class: 'field-label' }, 'Empresa'), empSelect('ficha_emp', e.id, (id) => go('#/ficha/' + id))),
      h('label', { class: 'field inline' }, h('span', { class: 'field-label' }, 'Mês'), monthNav(ym, (m) => { fichaYm = m; root.textContent = ''; ficha(root, e.id); }, 'fichaMes')),
      h('button', { class: 'btn', type: 'button', onclick: () => { S.setMany(e, ym, 'OK', true); root.textContent = ''; ficha(root, e.id); } }, 'Marcar pendentes como OK')), status);
    refresh();
    if (ym < e.inicio) root.append(h('p', { class: 'note' }, 'O mês ' + S.fmtYm(ym) + ' é anterior ao início do controle desta empresa (' + S.fmtYm(e.inicio) + '), então aparece como "-".'));
    let n = 0;
    S.GROUPS.forEach((g) => {
      root.append(h('section', { class: 'block' }, h('h2', null, g.nome),
        UI.table([{ label: 'Nº', cls: 'c' }, { label: 'Documento' }, { label: 'Status', cls: 'c' }, { label: 'Observação' }],
          S.docsDe(g.id).map((d) => docRow(e, d, ym, ++n, refresh)), { class: 'ficha' })));
    });
  }

  /* ================= MATRIZ ANUAL (uma empresa, 12 meses) ================= */
  function matriz(root, eid) {
    if (needSetup(root)) return;
    const e = firstEmp(eid), ano = matrizAno, meses = Reports.monthsOf(ano);
    const anoIn = h('input', { type: 'number', id: 'matrizAno', class: 'input', value: ano, min: 2000, max: 2100, 'aria-label': 'Ano' });
    anoIn.addEventListener('change', () => { const n = Number(anoIn.value); if (n >= 2000 && n <= 2100) { matrizAno = n; root.textContent = ''; matriz(root, e.id); } });
    root.append(pageHead('Matriz anual', e.nome, link('#/ficha/' + e.id, 'Ficha do mês', 'btn'), exportBtn(() => Reports.matriz(e.id, ano))));
    root.append(h('div', { class: 'toolbar' }, h('label', { class: 'field inline' }, h('span', { class: 'field-label' }, 'Empresa'), empSelect('matriz_emp', e.id, (id) => go('#/matriz/' + id))),
      h('label', { class: 'field inline' }, h('span', { class: 'field-label' }, 'Ano'), anoIn)));
    const cur = S.nowYm();
    const sumPct = h('tr', { class: 'sum' }), sumPend = h('tr', { class: 'sum' });
    const refresh = () => {
      sumPct.textContent = ''; sumPend.textContent = '';
      sumPct.append(h('th', null, '% concluído no mês')); sumPend.append(h('th', null, 'Itens pendentes no mês'));
      meses.forEach((m) => {
        const t = S.tally(S.statusesEmpresa(e, m));
        sumPct.append(h('td', { class: 'c num ' + (t.pct == null ? '' : t.pct === 1 ? 'good' : t.pct < 0.7 ? 'bad' : 'warn') }, t.pct == null ? '' : Math.round(t.pct * 100) + '%'));
        sumPend.append(h('td', { class: 'c num ' + (t.app ? (t.pend ? 'bad' : 'good') : '') }, t.app ? t.pend : ''));
      });
    };
    const head = (g) => h('tr', null, h('th', { class: 'sticky' }, g.nome), meses.map((m) => h('th', { class: 'c num' + (m === cur ? ' now' : '') }, S.fmtYm(m))));
    const bodyRows = [];
    S.GROUPS.forEach((g) => {
      bodyRows.push(head(g));
      S.docsDe(g.id).forEach((d) => {
        bodyRows.push(h('tr', null, h('th', { class: 'sticky doc', scope: 'row' }, d.nome), meses.map((m) => {
          const s = S.statusOf(e, d, m);
          if (s === '-') return h('td', { class: 'c' }, UI.pill('-', 's-out'));
          return h('td', { class: 'c' }, UI.statusSelect(s, (x) => { S.setReg(e, d, m, { status: x }); refresh(); }, { allowBlank: s === '', label: d.curto + ' ' + S.fmtYm(m) }));
        })));
      });
    });
    refresh();
    root.append(h('div', { class: 'table-wrap matrix' }, h('table', { class: 'tbl' }, h('tbody', null, bodyRows, h('tr', { class: 'gap' }, h('td', { colspan: 13 })), sumPct, sumPend))));
    root.append(h('p', { class: 'muted' }, legenda));
  }

  /* ================= RELATÓRIOS ================= */
  const REPORTS = [
    { id: 'conferencia', nome: 'Conferência do mês', desc: 'Todas as empresas × 11 documentos em um mês. É a planilha para enviar ou arquivar.', fields: ['ym'] },
    { id: 'checklist', nome: 'Checklist da empresa', desc: 'Ficha de uma empresa em um mês, com status e observações.', fields: ['emp1', 'ym'] },
    { id: 'matriz', nome: 'Matriz anual', desc: 'Meses nas colunas e documentos nas linhas, para uma empresa.', fields: ['emp1', 'ano'] },
    { id: 'pendencias', nome: 'Pendências', desc: 'Itens PENDENTE de todos os meses até o mês escolhido.', fields: ['emp', 'ym'] },
    { id: 'resumo', nome: 'Resumo anual', desc: '% concluído por empresa, mês a mês.', fields: ['emp', 'ano'] },
    { id: 'dados', nome: 'Dados completos', desc: 'Uma linha por empresa, documento e mês. Serve de backup e para análises no Excel.', fields: ['emp', 'from', 'to'] },
  ];
  function relatorios(root) {
    if (needSetup(root)) return;
    const st = S.state();
    if (!R.emp1 || !S.emp(R.emp1)) R.emp1 = st.empresas[0].id;
    const rep = REPORTS.find((x) => x.id === R.type);
    const rerender = () => { root.textContent = ''; relatorios(root); };
    root.append(pageHead('Relatórios', 'Escolha o relatório, ajuste os filtros e exporte para Excel.'));
    const tabs = h('div', { class: 'tabs', role: 'tablist' }, REPORTS.map((r) => h('button', { type: 'button', role: 'tab', class: 'tab' + (r.id === R.type ? ' on' : ''), 'aria-selected': r.id === R.type, onclick: () => { R.type = r.id; rerender(); } }, r.nome)));
    const inp = (label, el) => h('label', { class: 'field inline' }, h('span', { class: 'field-label' }, label), el);
    const month = (key) => { const i = h('input', { type: 'month', class: 'input', id: 'r_' + key, value: R[key] }); i.addEventListener('change', () => { R[key] = i.value; rerender(); }); return i; };
    const F = {
      emp1: () => inp('Empresa', empSelect('r_emp1', R.emp1, (id) => { R.emp1 = id; rerender(); })),
      emp: () => { const s = h('select', { class: 'input', id: 'r_emp' }, h('option', { value: '' }, 'Todas as empresas'), st.empresas.map((e) => h('option', { value: e.id }, e.nome))); s.value = R.empId; s.addEventListener('change', () => { R.empId = s.value; rerender(); }); return inp('Empresa', s); },
      ym: () => inp(R.type === 'pendencias' ? 'Até o mês' : 'Mês', month('ym')),
      ano: () => { const i = h('input', { type: 'number', class: 'input', id: 'r_ano', value: R.ano, min: 2000, max: 2100 }); i.addEventListener('change', () => { R.ano = Number(i.value); rerender(); }); return inp('Ano', i); },
      from: () => inp('De', month('from')), to: () => inp('Até', month('to')),
    };
    const flt = () => ({ empId: R.empId, ym: R.ym, from: R.from, to: R.to, ano: R.ano });
    const filters = h('div', { class: 'toolbar' }, rep.fields.map((k) => F[k]()),
      h('button', { type: 'button', class: 'btn btn-primary', id: 'btnExport', onclick: () => {
        if (R.type === 'conferencia') return run(() => Reports.conferencia(R.ym));
        if (R.type === 'checklist') return run(() => Reports.checklist(R.emp1, R.ym));
        if (R.type === 'matriz') return run(() => Reports.matriz(R.emp1, R.ano));
        return run(() => Reports.exportReport(Reports.build[R.type](flt()), 'Relatorio - ' + rep.nome + ' - ' + S.today()));
      } }, 'Exportar Excel'));
    root.append(tabs, h('p', { class: 'muted' }, rep.desc), filters);

    const prev = h('section', { class: 'block' }, h('h2', null, 'Prévia'));
    if (['conferencia', 'checklist', 'matriz'].includes(R.type)) {
      const href = R.type === 'conferencia' ? '#/conferencia' : R.type === 'checklist' ? '#/ficha/' + R.emp1 : '#/matriz/' + R.emp1;
      prev.append(h('p', null, 'Este relatório usa o mesmo layout da tela. Abra ', link(href, R.type === 'conferencia' ? 'a conferência do mês' : R.type === 'checklist' ? 'a ficha' : 'a matriz anual'), ' para conferir antes de exportar.'));
    } else {
      const data = Reports.build[R.type](flt());
      prev.append(h('p', { class: 'muted' }, data.title));
      data.sheets.forEach((sh) => {
        if (!sh.rows.length) { prev.append(UI.empty('Nada para mostrar', 'Nenhum registro para os filtros escolhidos.')); return; }
        const isC = (k) => ['center', 'date', 'num', 'status', 'pct'].includes(k);
        const fmt = (val, c) => {
          if (c.kind === 'date') return S.fmtDate(val);
          if (c.kind === 'pct') return val == null ? '–' : UI.progress(val);
          if (c.kind === 'status') return val ? UI.pill(val, UI.STATUS_CLASS[val]) : '';
          return val;
        };
        prev.append(UI.table(sh.cols.map((c) => ({ label: c.label, cls: isC(c.kind) ? 'c' : '' })),
          sh.rows.slice(0, 100).map((r) => h('tr', null, r.map((val, i) => h('td', { class: isC(sh.cols[i].kind) ? 'c' : '' }, fmt(val, sh.cols[i]))))), { class: 'compact' }));
        if (sh.rows.length > 100) prev.append(h('p', { class: 'muted' }, 'Mostrando 100 de ' + sh.rows.length + ' linhas. O Excel exporta todas.'));
      });
    }
    root.append(prev);
  }

  /* ================= COBRANÇA ================= */
  const C = { empId: '', ym: S.addMonths(S.nowYm(), -1), antigos: false };
  function cobrancaTexto(e, ym, antigos) {
    const org = S.state().org;
    const meses = antigos ? S.monthsBetween(e.inicio > ym ? ym : e.inicio, ym) : [ym];
    const itens = []; // { g, d, m }
    meses.forEach((m) => S.DOCS.forEach((d) => { if (S.statusOf(e, d, m) === 'PENDENTE') itens.push({ d, m }); }));
    if (!itens.length) return null;
    const multi = antigos && new Set(itens.map((i) => i.m)).size > 1;
    const lines = (fmt) => {
      const out = [];
      S.GROUPS.forEach((g) => {
        const its = itens.filter((i) => i.d.g === g.id); if (!its.length) return;
        out.push('', fmt.head(g.nome));
        its.forEach((i, n) => out.push(fmt.item(i, n + 1)));
      });
      return out;
    };
    const comp = S.fmtYmLong(ym);
    const quando = multi ? 'a partir de ' + S.fmtYmLong(meses[0]) + ' até ' + comp : 'competência ' + comp;
    const itemTxt = (i, n, bullet) => (bullet ? '• ' : n + '. ') + i.d.nome + (multi ? ' (' + S.fmtYm(i.m) + ')' : '');
    const email = ['Prezados,', '', 'Em nossa conferência da documentação mensal de ' + e.nome + ', constam como pendentes de envio os documentos abaixo (' + quando + '):']
      .concat(lines({ head: (t) => t.toUpperCase() + ':', item: (i, n) => itemTxt(i, n, false) }),
        ['', 'Pedimos a gentileza de enviar os documentos pendentes o quanto antes, para que possamos concluir o envio à Bernhoeft dentro do prazo.', 'Caso algum documento já tenha sido enviado, desconsidere este aviso e nos informe para atualizarmos o controle.', '', 'Atenciosamente,', org]).join('\n');
    const wpp = ['Olá! Aqui é do departamento pessoal da *' + org + '*.', '', 'Na conferência da documentação de *' + e.nome + '* (' + quando + ') faltam estes documentos:']
      .concat(lines({ head: (t) => '*' + t + '*', item: (i, n) => itemTxt(i, n, true) }),
        ['', 'Consegue nos enviar o quanto antes? Se algum já foi enviado, é só avisar. Obrigado!']).join('\n');
    return { assunto: 'Pendência de documentação – ' + e.nome + ' – ' + (multi ? S.fmtYm(meses[0]) + ' a ' + S.fmtYm(ym) : S.fmtYm(ym)), email, wpp, total: itens.length };
  }
  function cobranca(root) {
    if (needSetup(root)) return;
    const st = S.state();
    if (!C.empId || !S.emp(C.empId)) C.empId = st.empresas[0].id;
    const e = S.emp(C.empId);
    const rerender = () => { root.textContent = ''; cobranca(root); };
    root.append(pageHead('Cobrança', 'Gere a mensagem com os documentos pendentes e envie por e-mail ou WhatsApp.'));
    const chk = h('input', { type: 'checkbox', id: 'cb_antigos', checked: C.antigos }); chk.addEventListener('change', () => { C.antigos = chk.checked; rerender(); });
    root.append(h('div', { class: 'toolbar' },
      h('label', { class: 'field inline' }, h('span', { class: 'field-label' }, 'Empresa'), empSelect('cb_emp', e.id, (id) => { C.empId = id; rerender(); })),
      h('label', { class: 'field inline' }, h('span', { class: 'field-label' }, 'Mês de competência'), monthNav(C.ym, (m) => { C.ym = m; rerender(); }, 'cb_mes')),
      h('label', { class: 'check self-end' }, chk, 'Incluir meses anteriores em atraso')));
    const t = cobrancaTexto(e, C.ym, C.antigos);
    if (!t) {
      root.append(UI.empty(C.ym < e.inicio ? 'Controle ainda não iniciado neste mês' : 'Nenhuma pendência', C.ym < e.inicio ? e.nome + ' é controlada a partir de ' + S.fmtYm(e.inicio) + '.' : 'Todos os documentos de ' + e.nome + ' em ' + S.fmtYmLong(C.ym) + ' estão OK ou não se aplicam.'));
      return;
    }
    root.append(h('p', { class: 'muted' }, t.total + ' documento(s) pendente(s). Você pode editar os textos antes de copiar ou enviar.'));

    // ----- e-mail
    const assunto = h('input', { class: 'input', id: 'cb_assunto', value: t.assunto });
    const corpo = h('textarea', { class: 'input obs-area msg-area', id: 'cb_email', rows: 14 }, t.email);
    const mail = e.email || '';
    root.append(h('section', { class: 'block' }, h('h2', null, 'E-mail'),
      h('p', { class: 'muted' }, mail ? 'Destinatário cadastrado: ' + mail : 'Esta empresa não tem e-mail cadastrado. Cadastre em Empresas → Editar.'),
      UI.field('Assunto', assunto), UI.field('Mensagem', corpo),
      h('div', { class: 'actions wrap' },
        copyBtn('Copiar mensagem', () => corpo.value, 'Mensagem copiada', { primary: true, id: 'cb_copy_email' }),
        copyBtn('Copiar assunto', () => assunto.value, 'Assunto copiado', { id: 'cb_copy_subj' }),
        copyBtn('Copiar assunto + mensagem', () => assunto.value + '\n\n' + corpo.value, 'Assunto e mensagem copiados'),
        h('a', { class: 'btn', id: 'cb_mailto', target: '_blank', rel: 'noopener', href: '#', onclick: (ev) => {
          ev.currentTarget.href = 'mailto:' + encodeURIComponent(mail).replace('%40', '@') + '?subject=' + encodeURIComponent(assunto.value) + '&body=' + encodeURIComponent(corpo.value);
        } }, 'Abrir no programa de e-mail'))));

    // ----- WhatsApp
    const wtxt = h('textarea', { class: 'input obs-area msg-area', id: 'cb_wpp', rows: 12 }, t.wpp);
    let num = UI.digits(e.telefone || ''); if (num && num.length <= 11) num = '55' + num;
    root.append(h('section', { class: 'block' }, h('h2', null, 'WhatsApp'),
      h('p', { class: 'muted' }, num ? 'Número cadastrado: ' + e.telefone : 'Esta empresa não tem WhatsApp cadastrado. O botão abre o WhatsApp para você escolher o contato.'),
      UI.field('Mensagem', wtxt),
      h('div', { class: 'actions wrap' },
        h('a', { class: 'btn btn-primary', id: 'cb_wa', target: '_blank', rel: 'noopener', href: '#', onclick: (ev) => {
          ev.currentTarget.href = 'https://wa.me/' + num + '?text=' + encodeURIComponent(wtxt.value);
        } }, 'Enviar pelo WhatsApp'),
        copyBtn('Copiar mensagem', () => wtxt.value, 'Mensagem copiada', { id: 'cb_copy_wpp' }))));
  }

  /* ================= CONFIGURAÇÕES ================= */
  function config(root) {
    const st = S.state();
    const rerender = () => { root.textContent = ''; config(root); };
    root.append(pageHead('Configurações', 'Dados, backup e histórico de alterações.'));
    const org = h('input', { id: 'c_org', class: 'input', value: st.org, maxlength: 80 });
    root.append(h('section', { class: 'block' }, h('h2', null, 'Geral'),
      h('div', { class: 'grid2' }, UI.field('Nome da sua empresa', org, 'Aparece nos arquivos Excel exportados.')),
      h('button', { class: 'btn btn-primary', type: 'button', onclick: () => { S.setConfig({ org: org.value.trim() || 'Minha empresa' }); UI.toast('Configurações salvas', 'ok'); } }, 'Salvar')));

    const file = h('input', { type: 'file', accept: 'application/json,.json', id: 'c_file', hidden: true });
    file.addEventListener('change', () => {
      const fl = file.files[0]; if (!fl) return;
      const rd = new FileReader();
      rd.onload = () => { try { S.importJson(String(rd.result)); UI.toast('Backup importado', 'ok'); rerender(); } catch (e) { UI.toast(e.message || 'Arquivo inválido', 'bad'); } };
      rd.readAsText(fl); file.value = '';
    });
    root.append(h('section', { class: 'block' }, h('h2', null, 'Dados e backup'),
      h('p', { class: 'muted' }, Cloud.enabled && Cloud.ws() ? 'Os dados ficam salvos na nuvem, na equipe "' + Cloud.ws().name + '". O backup abaixo é uma cópia extra que você guarda no seu computador.' : 'Os dados ficam salvos somente neste navegador. Limpar os dados do site apaga tudo, então exporte um backup com frequência.'),
      h('div', { class: 'actions wrap' },
        h('button', { class: 'btn', type: 'button', onclick: () => { UI.download('backup-controle-documentacao-' + S.today() + '.json', new Blob([S.exportJson()], { type: 'application/json' })); UI.toast('Backup exportado', 'ok'); } }, 'Exportar backup (JSON)'),
        h('button', { class: 'btn', type: 'button', onclick: () => file.click() }, 'Importar backup'), file,
        h('button', { class: 'btn', type: 'button', onclick: async () => { if (await UI.confirm('Substituir todos os dados por uma empresa de exemplo?', 'Substituir')) { S.resetSeed(); UI.toast('Dados de exemplo restaurados'); rerender(); } } }, 'Restaurar dados de exemplo'),
        h('button', { class: 'btn btn-danger-ghost', type: 'button', onclick: async () => { if (await UI.confirm('Apagar todas as empresas e registros? Esta ação não pode ser desfeita.', 'Apagar tudo')) { S.clearAll(); UI.toast('Dados apagados'); rerender(); } } }, 'Apagar todos os dados'))));

    root.append(h('section', { class: 'block' }, h('h2', null, 'Histórico de alterações',
      st.log.length ? h('button', { class: 'btn btn-sm', type: 'button', onclick: () => { S.clearLog(); rerender(); } }, 'Limpar histórico') : null),
      st.log.length ? UI.table([{ label: 'Quando' }, { label: 'O que mudou' }], st.log.slice(0, 100).map((l) => h('tr', null, h('td', { class: 'num nowrap' }, new Date(l.t).toLocaleString('pt-BR')), h('td', null, l.m))), { class: 'compact' })
        : UI.empty('Sem alterações registradas', 'Mudanças de status, cadastros e importações aparecem aqui.')));
  }

  /* ================= EQUIPE (modo online) ================= */
  async function equipe(root) {
    const ws = Cloud.ws();
    if (!ws) return;
    const isAdmin = ws.role === 'admin';
    const rerender = () => { root.textContent = ''; equipe(root); };
    root.append(pageHead('Equipe', ws.name + ' · seu perfil: ' + Cloud.ROLE_NAME[ws.role]));
    const box = h('div', { class: 'block' }, h('p', { class: 'muted' }, 'Carregando…'));
    root.append(box);
    let list;
    try { list = await Cloud.members(); } catch (e) { box.textContent = ''; box.append(h('p', { class: 'error' }, Cloud.friendly(e))); return; }
    const me = Cloud.user().id;
    box.textContent = '';
    box.append(h('h2', null, 'Pessoas (' + list.length + ')'));
    box.append(UI.table([{ label: 'E-mail' }, { label: 'Perfil' }, { label: 'Desde', cls: 'c' }, { label: '' }], list.map((m) => {
      let perfil;
      if (isAdmin) {
        perfil = h('select', { class: 'input input-sm', 'aria-label': 'Perfil de ' + m.email },
          Object.entries(Cloud.ROLE_NAME).map(([v, t]) => h('option', { value: v, selected: v === m.role }, t)));
        perfil.value = m.role;
        perfil.addEventListener('change', async () => {
          try { await Cloud.setRole(m.user_id, perfil.value); UI.toast('Perfil alterado', 'ok'); } catch (e) { UI.toast(Cloud.friendly(e), 'bad'); rerender(); }
        });
      } else perfil = UI.pill(Cloud.ROLE_NAME[m.role], m.role === 'admin' ? 's-ok' : m.role === 'editor' ? 's-warn' : 's-na');
      return h('tr', null, h('td', null, h('strong', null, m.email), m.user_id === me ? h('span', { class: 'muted' }, ' (você)') : null), h('td', null, perfil),
        h('td', { class: 'c num' }, S.fmtDate((m.created_at || '').slice(0, 10))),
        h('td', { class: 'row-actions' }, isAdmin && m.user_id !== me ? h('button', { class: 'btn btn-sm btn-danger-ghost', type: 'button', onclick: async () => {
          if (await UI.confirm('Remover ' + m.email + ' da equipe? Essa pessoa perde o acesso aos dados.', 'Remover')) {
            try { await Cloud.removeMember(m.user_id); UI.toast('Pessoa removida'); rerender(); } catch (e) { UI.toast(Cloud.friendly(e), 'bad'); }
          }
        } }, 'Remover') : null));
    })));
    box.append(h('p', { class: 'muted' }, 'Administrador: gerencia a equipe e altera dados. Editor: altera dados. Consulta: só visualiza e exporta.'));

    if (isAdmin) {
      const codeInput = h('input', { class: 'input mono', id: 'invCode', readOnly: true, value: '…', 'aria-label': 'Código de convite' });
      Cloud.inviteCode().then((c) => { codeInput.value = Cloud.fmtCode(c); }).catch((e) => { codeInput.value = Cloud.friendly(e); });
      box.append(h('section', { class: 'block' }, h('h2', null, 'Convidar pessoas'),
        h('p', { class: 'muted' }, 'Peça para a pessoa criar uma conta, escolher "Entrar na equipe" e digitar este código. Ela entra como Editor e você pode mudar o perfil acima. Se o código vazar, gere outro.'),
        h('div', { class: 'toolbar' }, h('div', { class: 'field inline' }, codeInput),
          h('button', { class: 'btn', type: 'button', onclick: async () => {
            try { await navigator.clipboard.writeText(codeInput.value.replace(/\s/g, '')); UI.toast('Código copiado', 'ok'); } catch (e) { codeInput.select(); UI.toast('Selecione e copie o código'); }
          } }, 'Copiar'),
          h('button', { class: 'btn', type: 'button', onclick: async () => {
            if (await UI.confirm('Gerar um novo código? O código atual deixa de funcionar para novos convites.', 'Gerar novo')) {
              try { codeInput.value = Cloud.fmtCode(await Cloud.regenCode()); UI.toast('Novo código gerado', 'ok'); } catch (e) { UI.toast(Cloud.friendly(e), 'bad'); }
            }
          } }, 'Gerar novo código'))));
    }
    box.append(h('section', { class: 'block' }, h('h2', null, 'Sair ou apagar'),
      h('div', { class: 'actions wrap' },
        h('button', { class: 'btn btn-danger-ghost', type: 'button', onclick: async () => {
          if (await UI.confirm('Sair da equipe "' + ws.name + '"? Você perde o acesso aos dados dela.', 'Sair da equipe')) {
            try { await Cloud.leave(); } catch (e) { UI.toast(Cloud.friendly(e), 'bad'); }
          }
        } }, 'Sair da equipe'),
        isAdmin ? h('button', { class: 'btn btn-danger-ghost', type: 'button', onclick: async () => {
          if (await UI.confirm('Apagar a equipe "' + ws.name + '" e TODOS os dados dela para todas as pessoas? Não dá para desfazer.', 'Apagar equipe')) {
            try { await Cloud.deleteWorkspace(); } catch (e) { UI.toast(Cloud.friendly(e), 'bad'); }
          }
        } }, 'Apagar equipe') : null)));
  }

  return { cobranca, painel, empresas, conferencia, ficha, matriz, relatorios, config, equipe };
})();
