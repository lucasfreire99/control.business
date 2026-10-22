/* Roteador por hash e inicialização. */
const App = (() => {
  const view = document.getElementById('view');
  const ROUTES = ['painel', 'empresas', 'conferencia', 'ficha', 'matriz', 'relatorios', 'cobranca', 'equipe', 'config'];
  const EDIT_LABELS = new Set(['Nova empresa', 'Editar', 'Excluir', 'Salvar', 'Importar backup', 'Tudo OK', 'Marcar pendentes como OK',
    'Restaurar dados de exemplo', 'Apagar todos os dados', 'Limpar histórico']);

  function render() {
    const m = location.hash.replace(/^#\/?/, '').split('/');
    let name = ROUTES.includes(m[0]) ? m[0] : 'painel';
    if (name === 'equipe' && !Cloud.enabled) name = 'painel';
    view.textContent = '';
    const wide = !['config', 'equipe', 'cobranca'].includes(name);
    document.body.classList.toggle('wide', wide);
    try { Pages[name](view, m[1]); } catch (e) { console.error(e); view.append(UI.empty('Algo deu errado nesta tela', e.message)); }
    if (Store.isReadonly()) { // perfil "consulta": só visualiza e exporta
      view.querySelectorAll('button').forEach((b) => { if (EDIT_LABELS.has(b.textContent.trim())) b.hidden = true; });
      view.querySelectorAll('.tbl select.status-select, .tbl input, #c_org').forEach((el) => { el.disabled = true; });
    }
    document.querySelectorAll('#nav a').forEach((a) => {
      if (a.dataset.r === name) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
    const st = Store.state();
    document.getElementById('orgName').textContent = Cloud.enabled && Cloud.ws() ? Cloud.ws().name : st.org;
    document.title = name.charAt(0).toUpperCase() + name.slice(1) + ' · Controle de Documentação';
    window.scrollTo(0, 0);
  }

  // Mostra o sistema (depois do login, ou direto no modo local)
  function enter() {
    document.getElementById('auth').hidden = true;
    document.querySelector('.app').hidden = false;
    if (Cloud.enabled) {
      document.getElementById('cloudBox').hidden = false;
      document.querySelector('#nav a[data-r=equipe]').hidden = false;
      Cloud.renderBox();
    }
    render();
  }

  // "Ficha" e "Matriz anual" sem id abrem a primeira empresa
  document.getElementById('nav').addEventListener('click', (e) => {
    const a = e.target.closest('a'); if (!a) return;
    if (['ficha', 'matriz'].includes(a.dataset.r)) {
      const v = Store.state().empresas[0];
      if (v) { e.preventDefault(); location.hash = '#/' + a.dataset.r + '/' + v.id; }
    }
  });

  try { if (localStorage.getItem('docctrl.focus') === '1') document.body.classList.add('focus'); } catch (e) { /* sem armazenamento */ }

  // Tema: segue o sistema; o botão alterna e lembra a escolha
  const root = document.documentElement;
  try { const t = localStorage.getItem('docctrl.theme'); if (t) root.setAttribute('data-theme', t); } catch (e) { /* sem armazenamento */ }
  document.getElementById('themeBtn').addEventListener('click', () => {
    const dark = root.getAttribute('data-theme') ? root.getAttribute('data-theme') === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
    const next = dark ? 'light' : 'dark';
    root.setAttribute('data-theme', next);
    try { localStorage.setItem('docctrl.theme', next); } catch (e) { /* ignora */ }
  });

  window.addEventListener('hashchange', () => { if (!document.querySelector('.app').hidden) render(); });

  // Início
  if (Cloud.enabled) {
    document.querySelector('.app').hidden = true;
    Cloud.start().catch((e) => { console.error(e); document.getElementById('auth').hidden = false; document.getElementById('auth').textContent = 'Não foi possível conectar ao servidor: ' + Cloud.friendly(e); });
  } else {
    if (!Store.persistOk()) document.getElementById('banner').hidden = false;
    enter();
  }
  return { render, enter };
})();
