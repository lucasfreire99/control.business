/* Modo online (Supabase): login, equipes, sincronização e atualização automática.
   Se js/config.js estiver sem URL/chave, o site roda no modo local (localStorage) como antes. */
const Cloud = (() => {
  const cfg = window.APP_CONFIG || {};
  const enabled = !!(cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY && window.supabase && window.supabase.createClient);

  let sb = null, user = null, memberships = [], ws = null, base = null;
  let gen = 0, saving = false, dirty = false, timer = null, pollTimer = null, status = 'saved', lastErr = '', pollBound = false;

  const authEl = () => document.getElementById('auth');
  const appEl = () => document.querySelector('.app');
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const lsGet = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* ignora */ } };

  /* ---------- mensagens de erro em português ---------- */
  function friendly(err) {
    const m = (err && err.message) || String(err || '');
    const map = [
      [/Invalid login credentials/i, 'E-mail ou senha incorretos.'],
      [/Email not confirmed/i, 'Confirme seu e-mail pelo link que enviamos antes de entrar.'],
      [/User already registered/i, 'Este e-mail já tem conta. Use "Entrar".'],
      [/Password should be at least/i, 'A senha precisa ter pelo menos 6 caracteres.'],
      [/rate limit|too many/i, 'Muitas tentativas. Aguarde alguns minutos e tente de novo.'],
      [/Unable to validate email|invalid format|valid email/i, 'Digite um e-mail válido.'],
      [/codigo_invalido/, 'Código de convite inválido. Confira com o administrador da equipe.'],
      [/limite_de_equipes/, 'Você já administra o máximo de equipes (5).'],
      [/somente_admin/, 'Só administradores podem fazer isso.'],
      [/somente_consulta/, 'Seu perfil é somente consulta.'],
      [/ultimo_admin/, 'A equipe precisa de pelo menos um administrador.'],
      [/sem_acesso/, 'Você não tem acesso a esta equipe.'],
      [/dados_grandes/, 'Os dados passaram do tamanho máximo permitido.'],
      [/nome_obrigatorio/, 'Informe o nome da equipe.'],
      [/Failed to fetch|NetworkError|network/i, 'Sem conexão com a internet ou com o servidor.'],
    ];
    for (const [re, txt] of map) if (re.test(m)) return txt;
    return m || 'Algo deu errado. Tente de novo.';
  }

  /* ---------- telas de entrada ---------- */
  function shell(...kids) {
    const a = authEl(); a.textContent = ''; a.hidden = false; appEl().hidden = true;
    a.append(h('div', { class: 'auth-card' }, h('div', { class: 'auth-brand' }, h('strong', null, 'Controle de Documentação'), h('span', null, 'Terceirizados por empresa e por mês')), ...kids));
  }
  function showError(msg) {
    shell(h('p', { class: 'error' }, msg), h('div', { class: 'actions' }, h('button', { class: 'btn btn-primary', type: 'button', onclick: () => location.reload() }, 'Tentar de novo')));
  }

  function showAuth(mode = 'login', notice = '') {
    const isNew = mode === 'signup';
    const email = h('input', { id: 'au_email', class: 'input', type: 'email', autocomplete: 'email', required: true });
    const pass = h('input', { id: 'au_pass', class: 'input', type: 'password', autocomplete: isNew ? 'new-password' : 'current-password', required: true, minlength: 6 });
    const msg = h('p', { class: 'error', role: 'alert' }, '');
    const ok = h('p', { class: 'ok-msg', role: 'status' }, notice);
    const btn = h('button', { class: 'btn btn-primary btn-block', type: 'submit' }, isNew ? 'Criar conta' : 'Entrar');
    const form = h('form', { class: 'form', novalidate: true }, UI.field('E-mail', email), UI.field(isNew ? 'Senha (mínimo 6 caracteres)' : 'Senha', pass), msg, ok, btn);
    form.addEventListener('submit', async (ev) => {
      ev.preventDefault(); msg.textContent = ''; ok.textContent = '';
      if (!email.value.trim() || !pass.value) { msg.textContent = 'Preencha e-mail e senha.'; return; }
      btn.disabled = true; btn.textContent = 'Aguarde…';
      try {
        if (isNew) {
          const { data, error } = await sb.auth.signUp({ email: email.value.trim(), password: pass.value, options: { emailRedirectTo: location.origin + location.pathname } });
          if (error) throw error;
          if (data.user && data.user.identities && data.user.identities.length === 0) throw new Error('User already registered');
          if (data.session) { user = data.session.user; await afterLogin(); return; }
          showAuth('login', 'Conta criada. Enviamos um link de confirmação para ' + email.value.trim() + '. Depois de confirmar, volte aqui e entre.');
          return;
        }
        const { data, error } = await sb.auth.signInWithPassword({ email: email.value.trim(), password: pass.value });
        if (error) throw error;
        user = data.user; await afterLogin();
      } catch (e) { msg.textContent = friendly(e); btn.disabled = false; btn.textContent = isNew ? 'Criar conta' : 'Entrar'; }
    });
    const forgot = h('button', { type: 'button', class: 'link-btn', onclick: async () => {
      if (!email.value.trim()) { msg.textContent = 'Digite seu e-mail acima e clique de novo.'; return; }
      const { error } = await sb.auth.resetPasswordForEmail(email.value.trim(), { redirectTo: location.origin + location.pathname });
      if (error) { msg.textContent = friendly(error); return; }
      msg.textContent = ''; ok.textContent = 'Se este e-mail tiver conta, enviamos um link para criar uma nova senha.';
    } }, 'Esqueci minha senha');
    shell(h('div', { class: 'tabs', role: 'tablist' },
      h('button', { type: 'button', role: 'tab', class: 'tab' + (!isNew ? ' on' : ''), onclick: () => showAuth('login') }, 'Entrar'),
      h('button', { type: 'button', role: 'tab', class: 'tab' + (isNew ? ' on' : ''), onclick: () => showAuth('signup') }, 'Criar conta')),
      form, isNew ? null : forgot);
    email.focus();
  }

  function showNewPassword() {
    const p = h('input', { id: 'np_pass', class: 'input', type: 'password', autocomplete: 'new-password', minlength: 6 });
    const err = h('p', { class: 'error', role: 'alert' });
    UI.modal({
      title: 'Criar nova senha', body: h('div', { class: 'form' }, UI.field('Nova senha (mínimo 6 caracteres)', p), err),
      actions: [{ label: 'Cancelar' }, { label: 'Salvar senha', primary: true, onClick: () => {
        if (p.value.length < 6) { err.textContent = 'A senha precisa ter pelo menos 6 caracteres.'; return false; }
        sb.auth.updateUser({ password: p.value }).then(({ error }) => UI.toast(error ? friendly(error) : 'Senha alterada.', error ? 'bad' : 'ok'));
      } }],
    });
  }

  function showSetup(inApp) {
    const local = Store.readLocal();
    const hasLocal = !!(local && (local.empresas.length));
    const name = h('input', { id: 'su_name', class: 'input', maxlength: 80, placeholder: 'Ex.: Minha Empresa Ltda', value: local && local.org !== 'Minha empresa' ? local.org : '' });
    const src = h('select', { id: 'su_src', class: 'input' }, h('option', { value: 'vazia' }, 'Começar vazia'),
      hasLocal ? h('option', { value: 'local' }, 'Levar os dados deste navegador (' + local.empresas.length + ' empresa(s))') : null);
    const code = h('input', { id: 'su_code', class: 'input mono', placeholder: 'Código de convite', autocomplete: 'off' });
    const err1 = h('p', { class: 'error', role: 'alert' }), err2 = h('p', { class: 'error', role: 'alert' });
    const b1 = h('button', { class: 'btn btn-primary', type: 'button' }, 'Criar equipe');
    const b2 = h('button', { class: 'btn', type: 'button' }, 'Entrar na equipe');
    b1.addEventListener('click', async () => {
      err1.textContent = ''; if (!name.value.trim()) { err1.textContent = 'Informe o nome da equipe.'; return; }
      b1.disabled = true;
      try {
        const data = src.value === 'local' ? local : Store.emptyState();
        const { data: id, error } = await sb.rpc('create_workspace', { p_name: name.value.trim(), p_data: data });
        if (error) throw error;
        await loadMemberships(); await openWorkspace(id);
      } catch (e) { err1.textContent = friendly(e); b1.disabled = false; }
    });
    b2.addEventListener('click', async () => {
      err2.textContent = ''; if (!code.value.trim()) { err2.textContent = 'Digite o código que o administrador enviou.'; return; }
      b2.disabled = true;
      try {
        const { data: id, error } = await sb.rpc('join_workspace', { p_code: code.value });
        if (error) throw error;
        await loadMemberships(); await openWorkspace(id);
      } catch (e) { err2.textContent = friendly(e); b2.disabled = false; }
    });
    shell(
      h('h2', { class: 'auth-title' }, 'Escolha sua equipe'),
      h('p', { class: 'muted' }, 'Uma equipe reúne os dados da sua empresa. Todos que entrarem nela veem as mesmas informações.'),
      h('section', { class: 'form auth-sec' }, h('h3', null, 'Criar uma equipe nova'), UI.field('Nome da equipe', name), UI.field('Dados iniciais', src), err1, b1),
      h('section', { class: 'form auth-sec' }, h('h3', null, 'Ou entrar em uma equipe existente'), UI.field('Código de convite', code), err2, b2),
      h('div', { class: 'actions auth-foot' },
        inApp ? h('button', { class: 'btn', type: 'button', onclick: () => App.enter() }, 'Voltar') : null,
        h('button', { class: 'btn btn-sm', type: 'button', onclick: signOut }, 'Sair (' + (user ? user.email : '') + ')')));
  }

  /* ---------- sessão, equipes ---------- */
  async function loadMemberships() {
    const { data, error } = await sb.from('workspace_members').select('workspace_id, role, workspaces(id, name)').eq('user_id', user.id);
    if (error) throw error;
    memberships = (data || []).map((m) => ({ id: m.workspace_id, role: m.role, name: (m.workspaces && m.workspaces.name) || 'Equipe' }));
  }
  async function afterLogin() {
    try { await loadMemberships(); } catch (e) { return showError(friendly(e)); }
    if (!memberships.length) return showSetup(false);
    const last = lsGet('docctrl.ws');
    await openWorkspace((memberships.find((m) => m.id === last) || memberships[0]).id);
  }
  async function openWorkspace(id) {
    const m = memberships.find((x) => x.id === id) || { role: 'consulta', name: 'Equipe' };
    const { data, error } = await sb.from('workspaces').select('id, name, data, version').eq('id', id).single();
    if (error) return showError(friendly(error));
    stopTimers(); Store.useCloud(null); Store.setReadonly(false);
    Store.replaceState(data.data);
    ws = { id, name: data.name, role: m.role, version: data.version };
    base = Store.snapshot(); dirty = false; saving = false; status = 'saved';
    Store.setReadonly(m.role === 'consulta'); Store.useCloud(markDirty);
    document.body.classList.toggle('readonly', m.role === 'consulta');
    lsSet('docctrl.ws', id);
    startPolling(); App.enter();
  }
  function stopTimers() { clearTimeout(timer); clearInterval(pollTimer); }
  function teardown() {
    stopTimers(); Store.useCloud(null); Store.setReadonly(false); Store.replaceState(Store.emptyState());
    ws = null; user = null; memberships = []; base = null; dirty = false; saving = false;
    document.body.classList.remove('readonly');
  }
  async function signOut() {
    clearTimeout(timer);
    if (dirty && ws) { try { await flush(); } catch (e) { /* segue */ } }
    await sb.auth.signOut(); teardown(); showAuth('login');
  }

  /* ---------- gravação ---------- */
  function setStatus(s) {
    status = s;
    const el = document.getElementById('syncStatus'); if (!el) return;
    el.className = 'sync ' + s;
    el.textContent = s === 'saved' ? 'Tudo salvo' : s === 'error' ? 'Não salvou. Tentando de novo…' : 'Salvando…';
    el.title = s === 'error' ? lastErr : '';
  }
  function markDirty() { gen++; dirty = true; setStatus('pending'); clearTimeout(timer); timer = setTimeout(flush, 800); }
  async function flush() {
    if (!ws || saving || !dirty) return;
    saving = true; const myGen = gen; const snap = Store.snapshot(); setStatus('saving');
    try {
      const { data, error } = await sb.rpc('save_workspace', { p_id: ws.id, p_expected: ws.version, p_data: snap });
      if (error) throw error;
      ws.version = data; base = snap; saving = false;
      if (gen === myGen) { dirty = false; setStatus('saved'); } else { flush(); }
    } catch (e) {
      saving = false;
      const msg = (e && e.message) || '';
      if (msg.includes('conflito_de_versao')) return resolveConflict();
      if (msg.includes('somente_consulta') || msg.includes('sem_acesso')) { UI.toast(friendly(e), 'bad'); return reloadFromServer(true); }
      lastErr = friendly(e); setStatus('error'); clearTimeout(timer); timer = setTimeout(flush, 10000);
    }
  }
  async function resolveConflict() {
    const { data, error } = await sb.from('workspaces').select('data, version').eq('id', ws.id).single();
    if (error) { lastErr = friendly(error); setStatus('error'); clearTimeout(timer); timer = setTimeout(flush, 10000); return; }
    const r = Merge.merge3(base, Store.state(), data.data);
    Store.replaceState(r.data); ws.version = data.version; base = clone(data.data);
    dirty = true; gen++;
    App.render();
    UI.toast(r.conflicts.length ? 'Outra pessoa alterou os mesmos itens: ficou a versão dela em ' + r.conflicts.length + ' item(ns).' : 'Alterações de outra pessoa foram mescladas com as suas.', r.conflicts.length ? 'bad' : 'ok');
    flush();
  }

  /* ---------- atualização automática ---------- */
  function startPolling() {
    clearInterval(pollTimer); pollTimer = setInterval(poll, 20000);
    if (!pollBound) {
      pollBound = true;
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') poll(); });
      window.addEventListener('beforeunload', (e) => { if (dirty || saving) { e.preventDefault(); e.returnValue = ''; } });
    }
  }
  async function poll() {
    if (!ws || dirty || saving || document.visibilityState !== 'visible' || document.querySelector('.overlay')) return;
    const { data, error } = await sb.from('workspaces').select('version').eq('id', ws.id).single();
    if (error) {
      if (error.code === 'PGRST116') { UI.toast('Você não faz mais parte desta equipe.', 'bad'); await afterLogin(); }
      return;
    }
    if (!data || data.version <= ws.version || dirty || saving) return;
    await reloadFromServer(false);
  }
  async function reloadFromServer(silent) {
    const { data, error } = await sb.from('workspaces').select('data, version').eq('id', ws.id).single();
    if (error) return;
    try { await loadMemberships(); const m = memberships.find((x) => x.id === ws.id); if (m) { ws.role = m.role; Store.setReadonly(m.role === 'consulta'); document.body.classList.toggle('readonly', m.role === 'consulta'); } } catch (e) { /* mantém */ }
    Store.replaceState(data.data); ws.version = data.version; base = Store.snapshot(); dirty = false; setStatus('saved');
    App.render(); renderBox();
    if (!silent) UI.toast('Dados atualizados por outra pessoa.');
  }

  /* ---------- barra lateral e equipe ---------- */
  const ROLE_NAME = { admin: 'Administrador', editor: 'Editor', consulta: 'Consulta' };
  function renderBox() {
    const box = document.getElementById('cloudBox'); if (!box || !ws) return;
    box.textContent = '';
    const sel = memberships.length > 1
      ? h('select', { class: 'input input-sm', id: 'wsSwitch', 'aria-label': 'Trocar de equipe', onchange: async (ev) => { await flushNow(); await openWorkspace(ev.target.value); } },
        memberships.map((m) => h('option', { value: m.id, selected: m.id === ws.id }, m.name)))
      : h('strong', { class: 'ws-name' }, ws.name);
    box.append(sel,
      h('span', { class: 'ws-meta' }, user.email + ' · ' + ROLE_NAME[ws.role]),
      h('span', { id: 'syncStatus', class: 'sync ' + status }, status === 'saved' ? 'Tudo salvo' : status === 'error' ? 'Não salvou. Tentando de novo…' : 'Salvando…'),
      h('div', { class: 'actions' },
        h('button', { class: 'btn btn-sm', type: 'button', onclick: () => showSetup(true) }, 'Nova equipe'),
        h('button', { class: 'btn btn-sm', type: 'button', onclick: signOut }, 'Sair')));
    if (ws.role === 'consulta') box.append(h('span', { class: 'ws-meta' }, 'Você só pode visualizar e exportar.'));
  }
  async function flushNow() { clearTimeout(timer); if (dirty) await flush(); }

  async function members() {
    const { data, error } = await sb.from('workspace_members').select('user_id, email, role, created_at').eq('workspace_id', ws.id).order('created_at');
    if (error) throw error; return data || [];
  }
  async function rpc(name, args) { const { data, error } = await sb.rpc(name, args); if (error) throw error; return data; }
  const fmtCode = (c) => (c || '').replace(/(.{4})/g, '$1 ').trim();

  return {
    enabled, start: async () => {
      sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
      sb.auth.onAuthStateChange((event) => { if (event === 'PASSWORD_RECOVERY') setTimeout(showNewPassword, 0); });
      const { data } = await sb.auth.getSession();
      if (data && data.session) { user = data.session.user; await afterLogin(); } else showAuth('login');
    },
    renderBox, signOut, friendly, fmtCode, ROLE_NAME,
    user: () => user, ws: () => ws, role: () => (ws ? ws.role : null),
    members, flushNow,
    setRole: (uid, role) => rpc('set_member_role', { p_id: ws.id, p_user: uid, p_role: role }),
    removeMember: (uid) => rpc('remove_member', { p_id: ws.id, p_user: uid }),
    inviteCode: () => rpc('get_invite_code', { p_id: ws.id }),
    regenCode: () => rpc('regenerate_invite_code', { p_id: ws.id }),
    leave: async () => { await rpc('remove_member', { p_id: ws.id, p_user: user.id }); await loadMemberships(); if (memberships.length) await openWorkspace(memberships[0].id); else { teardown(); showSetup(false); } },
    deleteWorkspace: async () => { await rpc('delete_workspace', { p_id: ws.id }); await loadMemberships(); stopTimers(); if (memberships.length) await openWorkspace(memberships[0].id); else { Store.useCloud(null); Store.replaceState(Store.emptyState()); ws = null; showSetup(false); } },
    refreshMemberships: loadMemberships,
  };
})();
