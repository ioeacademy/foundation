import { renderCatalog } from './ui/views-catalog.js';
import { renderLibrary } from './ui/views-library.js';
import { renderShare } from './ui/views-share.js';
import { renderReceive } from './ui/views-receive.js';
import { renderPlayer } from './ui/views-player.js';
import { renderDiagnostics } from './ui/views-diagnostics.js';
import { startAutoSync } from './sync.js';
import { t } from './ui/i18n-it.js';

const main = document.getElementById('main');
const tabs = document.getElementById('tabs');
const netBadge = document.getElementById('net');

function setNet() {
  if (navigator.onLine) {
    netBadge.className = 'net online';
    netBadge.textContent = t.net_online;
  } else {
    netBadge.className = 'net offline';
    netBadge.textContent = t.net_offline;
  }
}
setNet();
window.addEventListener('online', setNet);
window.addEventListener('offline', setNet);

function setActive(view) {
  for (const b of tabs.querySelectorAll('button')) {
    b.classList.toggle('active', b.dataset.view === view);
  }
}

async function navigate(view, params = {}) {
  setActive(view);
  switch (view) {
    case 'catalog': await renderCatalog(main); break;
    case 'library': await renderLibrary(main, navigate); break;
    case 'share': await renderShare(main, params); break;
    case 'receive': await renderReceive(main, params, navigate); break;
    case 'player': await renderPlayer(main, params, navigate); break;
    case 'diagnostics': await renderDiagnostics(main); break;
    default: await renderCatalog(main);
  }
}

for (const b of tabs.querySelectorAll('button')) {
  b.addEventListener('click', () => navigate(b.dataset.view));
}

navigate('catalog');

startAutoSync((evt) => {
  if (evt && !evt.skipped && evt.sent) {
    console.log('[sync] sent', evt.sent, 'server replied', evt.server);
  }
});

// Register the service worker. The SW serves courseware files from a virtual
// origin (`/pwa/_course/<instanceId>/...`); without it, the iframe player can't
// load anything, so we reload once on first registration to make sure the SW
// is the controller for this page.
if ('serviceWorker' in navigator) {
  (async () => {
    try {
      await navigator.serviceWorker.register('sw.js', { scope: '/pwa/' });
      await navigator.serviceWorker.ready;
      if (!navigator.serviceWorker.controller && !sessionStorage.getItem('foundation-sw-bootstrap')) {
        sessionStorage.setItem('foundation-sw-bootstrap', '1');
        location.reload();
      }
    } catch (e) { console.warn('SW reg failed', e); }
  })();
}
