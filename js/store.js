/* Camada de dados: estado, persistência em localStorage e regras de negócio.
   Modelo: empresas + 11 documentos fixos por mês. Não há cadastro de funcionários. */
const Store = (() => {
  const KEY = 'docctrl.v2';
  const OLD_KEY = 'docctrl.v1'; // versão anterior (com funcionários): só as empresas são aproveitadas

  const GROUPS = [
    { id: 'empresa', nome: 'Documentação da empresa exigida para Bernhoeft – mensal', curto: 'Empresa' },
    { id: 'colab', nome: 'Documentação do colaborador – mensal', curto: 'Colaborador' },
  ];
  // Checklist fixo. "curto" é o nome abreviado usado nas colunas da Conferência.
  const DOCS = [
    { id: 'e1', g: 'empresa', nome: 'Acordo/Convenção coletiva da Categoria', curto: 'Convenção coletiva' },
    { id: 'e2', g: 'empresa', nome: 'Declaração de subcontratação e quitação junto aos subcontratados', curto: 'Subcontratação' },
    { id: 'e3', g: 'empresa', nome: 'FOPAG - (Folha de pagamento analítica + Resumo com as bases de INSS e FGTS)', curto: 'FOPAG analítica' },
    { id: 'e4', g: 'empresa', nome: 'DARF pago + recibo de entrega do DCTFWeb e CND Federal atualizada', curto: 'DARF + DCTFWeb' },
    { id: 'e5', g: 'empresa', nome: 'GFD - Guia do FGTS Digital Mensal + Detalhamento da Guia (Relação de Trabalhadores) + Comprovante de Pagamento', curto: 'GFD (FGTS)' },
    { id: 'e6', g: 'empresa', nome: 'FOPAG - (Folha de pagamento para Autônomos e Sócios)', curto: 'FOPAG autônomos' },
    { id: 'e7', g: 'empresa', nome: 'Recolhimento do INSS - DARF pago + recibo de entrega e relatório de débitos DCTFWEB + Certidão da Receita Federal', curto: 'INSS (DARF)' },
    { id: 'e8', g: 'empresa', nome: 'Certidão Negativa de Débitos Relativos aos Tributos Federais e à Dívida Ativa da União', curto: 'CND Federal' },
    { id: 'c1', g: 'colab', nome: 'Cartão de Ponto com totalização de horas extras e/ou noturnas', curto: 'Cartão de ponto' },
    { id: 'c2', g: 'colab', nome: 'Comprovante de Pagamento de Salários', curto: 'Comprov. salários' },
    { id: 'c3', g: 'colab', nome: 'Acordo Individual de Banco de Horas (mensal ou semestral)', curto: 'Banco de horas' },
  ];
  const STATUS = ['OK', 'PENDENTE', 'N/A'];
  const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

  let S = null;
  let persistOk = true;
  let cloudHook = null;   // quando definido, grava na nuvem em vez do localStorage
  let readonly = false;   // perfil "consulta"
  const guard = () => { if (readonly) throw new Error('Seu perfil é somente consulta.'); };

  /* ---------- utilidades ---------- */
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const pad = (n) => String(n).padStart(2, '0');
  const today = () => { const d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
  const nowYm = () => today().slice(0, 7);
  function addMonths(ym, n) {
    const [y, m] = ym.split('-').map(Number);
    const t = y * 12 + (m - 1) + n;
    return Math.floor(t / 12) + '-' + pad((t % 12) + 1);
  }
  function monthsBetween(a, b) { const r = []; for (let m = a; m <= b; m = addMonths(m, 1)) r.push(m); return r; }
  const fmtYm = (ym) => ym.slice(5) + '/' + ym.slice(2, 4);
  const fmtYmLong = (ym) => MESES[Number(ym.slice(5)) - 1] + ' de ' + ym.slice(0, 4);
  const fmtDate = (d) => (d ? d.slice(8) + '/' + d.slice(5, 7) + '/' + d.slice(0, 4) : '');
  const isYm = (s) => /^\d{4}-(0[1-9]|1[0-2])$/.test(s || '');

  /* ---------- persistência ---------- */
  function seed() {
    const e = { id: uid(), nome: 'EMPRESA EXEMPLO LTDA', cnpj: '', contato: '', inicio: addMonths(nowYm(), -2), ativa: true };
    const st = { v: 2, org: 'Minha empresa', empresas: [e], registros: {}, log: [] };
    const prev = addMonths(nowYm(), -2);
    DOCS.forEach((d, i) => { st.registros[e.id + '|' + d.id + '|' + prev] = { status: 'OK' }; if (i < 6) st.registros[e.id + '|' + d.id + '|' + addMonths(prev, 1)] = { status: 'OK' }; });
    return st;
  }
  // Aceita o formato atual e converte o anterior (v1). Devolve null se não for um backup válido.
  function normalize(o) {
    if (!o || typeof o !== 'object' || !Array.isArray(o.empresas)) return null;
    let st;
    if (o.v === 2 && o.registros && typeof o.registros === 'object') st = o;
    else if (o.v === 1) st = { v: 2, org: o.org, empresas: o.empresas.map((e) => ({ id: e.id, nome: e.nome, cnpj: e.cnpj || '', contato: e.contato || '' })), registros: {}, log: o.log };
    else return null;
    st.org = st.org || 'Minha empresa';
    st.log = Array.isArray(st.log) ? st.log : [];
    st.empresas = st.empresas.filter((e) => e && e.id && e.nome).map((e) => ({
      id: e.id, nome: String(e.nome), cnpj: e.cnpj || '', contato: e.contato || '', email: e.email || '', telefone: e.telefone || '',
      inicio: isYm(e.inicio) ? e.inicio : nowYm(), ativa: e.ativa !== false,
    }));
    delete st.alertDias; delete st.funcionarios; delete st.vinculos;
    const ids = new Set(st.empresas.map((e) => e.id)), dids = new Set(DOCS.map((d) => d.id));
    Object.keys(st.registros).forEach((k) => {
      const [eid, did, comp] = k.split('|');
      if (!ids.has(eid) || !dids.has(did) || !isYm(comp)) { delete st.registros[k]; return; }
      const r = st.registros[k]; delete r.entrega; // a data de entrega não existe mais
      if (!Object.keys(r).length) delete st.registros[k];
    });
    return st;
  }
  function load() {
    try {
      let raw = localStorage.getItem(KEY), migrated = false;
      if (!raw) { raw = localStorage.getItem(OLD_KEY); migrated = !!raw; }
      if (raw) { const o = normalize(JSON.parse(raw)); if (o) { S = o; if (migrated) save(); return; } }
    } catch (e) { persistOk = false; }
    S = seed();
    save();
  }
  function save() {
    if (cloudHook) { cloudHook(); return; }
    try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { persistOk = false; }
  }
  function emptyState() { return { v: 2, org: 'Minha empresa', empresas: [], registros: {}, log: [] }; }
  // Troca o estado inteiro (dados vindos da nuvem). Não grava.
  function replaceState(obj) { S = normalize(obj) || emptyState(); }
  const snapshot = () => JSON.parse(JSON.stringify(S));
  function readLocal() {
    try { return normalize(JSON.parse(localStorage.getItem(KEY) || localStorage.getItem(OLD_KEY))); } catch (e) { return null; }
  }
  function log(m) { S.log.unshift({ t: new Date().toISOString(), m }); if (S.log.length > 300) S.log.length = 300; }

  /* ---------- consultas ---------- */
  const emp = (id) => S.empresas.find((e) => e.id === id);
  const doc = (id) => DOCS.find((d) => d.id === id);
  const docsDe = (g) => DOCS.filter((d) => d.g === g);
  const key = (eid, did, comp) => eid + '|' + did + '|' + comp;
  const getReg = (eid, did, comp) => S.registros[key(eid, did, comp)] || null;
  const ativas = () => S.empresas.filter((e) => e.ativa);

  // Status efetivo: '-' antes do início do controle, '' mês futuro sem registro, PENDENTE por padrão
  function statusOf(e, d, ym) {
    if (ym < e.inicio) return '-';
    const r = getReg(e.id, d.id, ym);
    if (r && r.status) return r.status;
    return ym > nowYm() ? '' : 'PENDENTE';
  }
  function setReg(e, d, ym, patch) { guard();
    const k = key(e.id, d.id, ym);
    const old = S.registros[k] || {};
    const next = Object.assign({}, old, patch);
    Object.keys(next).forEach((p) => { if (next[p] === '' || next[p] == null) delete next[p]; });
    if (Object.keys(next).length) S.registros[k] = next; else delete S.registros[k];
    if ('status' in patch && (old.status || '') !== (patch.status || '')) {
      log(e.nome + ' / ' + d.curto + ' (' + fmtYm(ym) + '): ' + (old.status || 'padrão') + ' → ' + (patch.status || 'padrão'));
    }
    save();
  }
  // Marca vários documentos de uma vez (ex.: tudo OK de uma empresa num mês)
  function setMany(e, ym, status, onlyPending) { guard();
    DOCS.forEach((d) => {
      const cur = statusOf(e, d, ym);
      if (cur === '-' || (onlyPending && cur !== 'PENDENTE')) return;
      const k = key(e.id, d.id, ym), old = S.registros[k] || {};
      if (status) S.registros[k] = Object.assign({}, old, { status }); else { const n = Object.assign({}, old); delete n.status; if (Object.keys(n).length) S.registros[k] = n; else delete S.registros[k]; }
    });
    log(e.nome + ' (' + fmtYm(ym) + '): ' + (onlyPending ? 'pendentes' : 'todos') + ' → ' + (status || 'padrão'));
    save();
  }
  function tally(list) {
    let ok = 0, na = 0, pend = 0;
    list.forEach((s) => { if (s === 'OK') ok++; else if (s === 'N/A') na++; else if (s === 'PENDENTE') pend++; });
    const app = ok + pend;
    return { ok, na, pend, app, pct: app ? ok / app : null };
  }
  const situacao = (t) => (t.app === 0 ? 'SEM ITENS' : t.pend === 0 ? 'COMPLETO' : 'PENDENTE');
  const statusesEmpresa = (e, ym) => DOCS.map((d) => statusOf(e, d, ym));

  // Pendências de todos os meses desde o início do controle até ym
  function pendencias(ym, flt = {}) {
    const rows = [];
    ativas().forEach((e) => {
      if (flt.empId && e.id !== flt.empId) return;
      if (e.inicio > ym) return;
      monthsBetween(e.inicio, ym).forEach((m) => DOCS.forEach((d) => { if (statusOf(e, d, m) === 'PENDENTE') rows.push({ e, d, comp: m }); }));
    });
    return rows.sort((a, b) => (a.comp < b.comp ? 1 : a.comp > b.comp ? -1 : a.e.nome.localeCompare(b.e.nome)));
  }

  /* ---------- gravação ---------- */
  function cleanRegs() {
    const ids = new Set(S.empresas.map((e) => e.id));
    Object.keys(S.registros).forEach((k) => { if (!ids.has(k.split('|')[0])) delete S.registros[k]; });
  }
  function saveEmpresa(e) { guard();
    const i = S.empresas.findIndex((x) => x.id === e.id);
    if (i >= 0) { S.empresas[i] = e; log('Empresa editada: ' + e.nome); } else { S.empresas.push(e); log('Empresa criada: ' + e.nome); }
    save();
  }
  function deleteEmpresa(id) { guard();
    const e = emp(id); if (!e) return;
    S.empresas = S.empresas.filter((x) => x.id !== id);
    cleanRegs(); log('Empresa excluída: ' + e.nome); save();
  }
  function setConfig(p) { guard(); Object.assign(S, p); save(); }
  function exportJson() { return JSON.stringify(S, null, 2); }
  function importJson(text) { guard();
    const o = normalize(JSON.parse(text));
    if (!o) throw new Error('Arquivo inválido: não é um backup deste sistema.');
    S = o; log('Backup importado'); save();
  }
  function resetSeed() { guard(); S = seed(); log('Dados de exemplo restaurados'); save(); }
  function clearAll() { guard();
    S = { v: 2, org: S.org, empresas: [], registros: {}, log: [] };
    log('Todos os dados foram apagados'); save();
  }
  function clearLog() { guard(); S.log = []; save(); }

  load();
  return {
    GROUPS, DOCS, STATUS, MESES, uid, today, nowYm, addMonths, monthsBetween, fmtYm, fmtYmLong, fmtDate, isYm,
    state: () => S, persistOk: () => persistOk,
    emp, doc, docsDe, getReg, statusOf, setReg, setMany, tally, situacao, statusesEmpresa, ativas, pendencias,
    saveEmpresa, deleteEmpresa, setConfig, exportJson, importJson, resetSeed, clearAll, clearLog,
    emptyState, replaceState, snapshot, readLocal,
    useCloud: (fn) => { cloudHook = fn; }, setReadonly: (b) => { readonly = !!b; }, isReadonly: () => readonly,
  };
})();
