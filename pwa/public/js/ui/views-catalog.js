import { fetchCatalog } from '../catalog.js';
import { installFromServer, getInstalled } from '../bundle.js';
import { getDeviceId } from '../storage.js';
import { t } from './i18n-it.js';
import { kb } from './util.js';

export async function renderCatalog(main) {
  main.innerHTML = `<h2>${t.catalog_title}</h2><div id="catalog-list" class="muted">…</div>`;
  const list = main.querySelector('#catalog-list');
  let courses;
  try {
    courses = await fetchCatalog();
  } catch (e) {
    list.innerHTML = `<div class="card">${t.catalog_load_error}</div>`;
    return;
  }
  if (!courses.length) {
    list.innerHTML = `<div class="card muted">${t.catalog_empty}</div>`;
    return;
  }
  const deviceId = await getDeviceId();
  list.innerHTML = '';
  for (const c of courses) {
    const installed = await getInstalled(c.id);
    const card = document.createElement('div');
    card.className = 'card';
    const title = (c.title && (c.title.it || c.title.en)) || c.id;
    const desc = (c.description && (c.description.it || c.description.en)) || '';
    card.innerHTML = `
      <h3>${escapeHtml(title)}</h3>
      <p class="muted">${escapeHtml(desc)}</p>
      <p class="muted">${t.size}: ${kb(c.sizeBytes)} · v${c.version}</p>
      <div class="row"></div>
    `;
    const btnRow = card.querySelector('.row');
    if (installed) {
      const span = document.createElement('span');
      span.textContent = '✓ ' + t.installed;
      span.className = 'muted';
      btnRow.appendChild(span);
    } else {
      const btn = document.createElement('button');
      btn.className = 'primary';
      btn.textContent = t.install;
      btn.addEventListener('click', async () => {
        btn.disabled = true; btn.textContent = t.installing;
        try {
          await installFromServer({ catalogEntry: c, deviceId });
          renderCatalog(main); // refresh
        } catch (e) {
          alert('Errore: ' + e.message);
          btn.disabled = false; btn.textContent = t.install;
        }
      });
      btnRow.appendChild(btn);
    }
    list.appendChild(card);
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}
