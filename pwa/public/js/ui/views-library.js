import { listInstances, listBundles, deleteBundle } from '../storage.js';
import { t } from './i18n-it.js';
import { kb, escapeHtml, shortId } from './util.js';

export async function renderLibrary(main, navigate) {
  const bundles = await listBundles();
  const instances = await listInstances();
  if (!bundles.length) {
    main.innerHTML = `<h2>${t.library_title}</h2>
      <div class="card muted">${t.library_empty}</div>`;
    return;
  }
  const byCourse = new Map();
  for (const inst of instances) {
    if (!byCourse.has(inst.courseId)) byCourse.set(inst.courseId, []);
    byCourse.get(inst.courseId).push(inst);
  }

  const html = [`<h2>${t.library_title}</h2>`];
  for (const b of bundles) {
    const insts = byCourse.get(b.courseId) || [];
    const titleObj = b.manifest.title || {};
    const title = titleObj.it || titleObj.en || b.courseId;
    const lineageHtml = insts.map(inst => {
      const chips = inst.lineage.map((entry, i) => {
        const cls = entry.transport === 'server-download' ? 'lineage-chip server'
                  : (i === inst.lineage.length - 1 ? 'lineage-chip self' : 'lineage-chip');
        const label = entry.transport === 'server-download'
          ? `🌐 server`
          : `← ${shortId(entry.fromDeviceId)}`;
        return `<span class="${cls}" title="${escapeHtml(entry.eventId)}">${label}</span>`;
      }).join('<span class="muted"> · </span>');
      return `<div class="muted" style="margin:0.4rem 0">${t.lineage_chain}: ${chips}</div>`;
    }).join('');

    html.push(`
      <div class="card" data-course="${escapeHtml(b.courseId)}">
        <h3>${escapeHtml(title)}</h3>
        <p class="muted">v${b.version} · ${kb(b.blob?.size || 0)}</p>
        ${lineageHtml}
        <div class="row">
          <button class="primary open">${t.open}</button>
          <button class="secondary share">${t.share}</button>
          <button class="danger delete">Elimina</button>
        </div>
      </div>
    `);
  }
  main.innerHTML = html.join('');
  for (const card of main.querySelectorAll('.card[data-course]')) {
    const courseId = card.dataset.course;
    card.querySelector('.open').addEventListener('click', () => navigate('player', { courseId }));
    card.querySelector('.share').addEventListener('click', () => navigate('share', { courseId }));
    card.querySelector('.delete').addEventListener('click', async () => {
      if (!confirm('Eliminare questo corso?')) return;
      const bundle = bundles.find(b => b.courseId === courseId);
      if (bundle) await deleteBundle(bundle.id);
      renderLibrary(main, navigate);
    });
  }
}
