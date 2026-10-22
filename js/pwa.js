/* Instalar como app (PWA): registra o service worker e controla o botão "Instalar app". */
(() => {
  const btn = document.getElementById('installBtn');
  const standalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  let deferred = null;

  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch((e) => console.warn('Service worker não registrado:', e)));
  }
  if (!btn || standalone()) return;
  btn.hidden = false;

  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e; });
  window.addEventListener('appinstalled', () => { btn.hidden = true; deferred = null; UI.toast('App instalado', 'ok'); });

  btn.addEventListener('click', async () => {
    if (deferred) { deferred.prompt(); await deferred.userChoice; deferred = null; return; }
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    UI.modal({
      title: 'Instalar como app',
      body: h('div', null,
        ios
          ? h('ol', null, h('li', null, 'Abra este site no Safari.'), h('li', null, 'Toque em Compartilhar (quadrado com seta para cima).'), h('li', null, 'Escolha "Adicionar à Tela de Início" e confirme.'))
          : h('ol', null, h('li', null, 'No Chrome ou Edge no computador: clique no ícone de instalar na barra de endereço (ou menu ⋮ → "Instalar Controle de Documentação").'),
            h('li', null, 'No Android (Chrome): menu ⋮ → "Instalar app" ou "Adicionar à tela inicial".')),
        h('p', { class: 'muted' }, 'Se a opção não aparecer, confirme que está acessando pelo endereço https do site (não pelo arquivo salvo no computador).')),
      actions: [{ label: 'Entendi', primary: true }],
    });
  });
})();
