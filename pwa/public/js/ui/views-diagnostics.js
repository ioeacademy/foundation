import { listOutboxLineage, listStatements, getDeviceId } from '../storage.js';
import { syncOnce } from '../sync.js';
import { t } from './i18n-it.js';
import { escapeHtml, shortId } from './util.js';

export async function renderDiagnostics(main) {
  const deviceId = await getDeviceId();
  const lineageAll = await listOutboxLineage();
  const stmtAll = await listStatements();
  const lineagePending = lineageAll.filter(r => !r.syncedAt);
  const stmtPending = stmtAll.filter(r => !r.syncedAt);

  const recent = stmtAll.slice().sort((a, b) => (b.recordedAt || '').localeCompare(a.recordedAt || '')).slice(0, 30);

  main.innerHTML = `
    <h2>${t.diag_title}</h2>
    <div class="card">
      <p><strong>${t.diag_device}:</strong> <code>${escapeHtml(deviceId)}</code></p>
      <p>${t.diag_pending}: <strong>${lineagePending.length}</strong> lineage, <strong>${stmtPending.length}</strong> xAPI</p>
      <p>${t.diag_synced}: ${lineageAll.length - lineagePending.length} lineage, ${stmtAll.length - stmtPending.length} xAPI</p>
      <div class="row">
        <button class="primary" id="sync-now">${t.diag_sync_now}</button>
        <span id="sync-status" class="muted"></span>
      </div>
    </div>

    <div class="card">
      <h3>${t.diag_recent_statements}</h3>
      <div id="stmts">${
        recent.length === 0 ? '<p class="muted">Nessuno statement registrato.</p>' :
        recent.map(s => {
          const v = s.statement.verb.id.split('/').pop();
          const ok = s.statement.result?.success;
          const cls = ok === true ? 'ok' : (ok === false ? 'ko' : '');
          return `<div class="statement">
            <span class="verb">${escapeHtml(v)}</span> →
            <code>${escapeHtml(s.statement.object.id)}</code>
            ${ok !== undefined ? `<span class="${cls}"> [${ok ? 'corretto' : 'errato'}]</span>` : ''}
            <br><small class="muted">${escapeHtml(s.recordedAt)} · instance ${shortId(s.instanceId)} · ${s.syncedAt ? '✓ syncato' : '⏳ in attesa'}</small>
          </div>`;
        }).join('')
      }</div>
    </div>
  `;

  main.querySelector('#sync-now').addEventListener('click', async () => {
    const status = main.querySelector('#sync-status');
    status.textContent = '…';
    try {
      const r = await syncOnce();
      if (r.skipped) status.textContent = r.reason === 'offline' ? 'Offline.' : 'Niente da sincronizzare.';
      else status.textContent = `Inviati ${r.sent.lineage} lineage + ${r.sent.statements} xAPI. ${t.diag_sync_done}.`;
      setTimeout(() => renderDiagnostics(main), 600);
    } catch (e) {
      status.textContent = 'Errore: ' + e.message;
    }
  });
}
