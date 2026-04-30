import { listOutboxLineage, listStatements, markLineageSynced, markStatementsSynced, getDeviceId } from './storage.js';

export async function syncOnce() {
  if (!navigator.onLine) return { skipped: true, reason: 'offline' };
  const deviceId = await getDeviceId();
  const lineagePending = await listOutboxLineage({ unsyncedOnly: true });
  const stmtsPending = await listStatements({ unsyncedOnly: true });
  if (!lineagePending.length && !stmtsPending.length) {
    return { skipped: true, reason: 'nothing_to_sync' };
  }

  const payload = {
    deviceId,
    lineageEntries: lineagePending.map(({ syncedAt, ...rest }) => rest),
    statements: stmtsPending.map(({ syncedAt, ...rest }) => rest)
  };

  const res = await fetch('/api/v1/ingest', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!res.ok) throw new Error('Ingest fallito: ' + res.status);
  const data = await res.json();

  const now = new Date().toISOString();
  await markLineageSynced(lineagePending.map(e => e.eventId), now);
  await markStatementsSynced(stmtsPending.map(e => e.statementId), now);
  return {
    skipped: false,
    sent: { lineage: lineagePending.length, statements: stmtsPending.length },
    server: data
  };
}

export function startAutoSync(onChange) {
  const tick = async () => {
    try {
      const r = await syncOnce();
      onChange?.(r);
    } catch (e) {
      onChange?.({ error: e.message });
    }
  };
  window.addEventListener('online', tick);
  // also try on startup if already online
  if (navigator.onLine) setTimeout(tick, 800);
  // periodic fallback every 30s when online
  setInterval(() => { if (navigator.onLine) tick(); }, 30_000);
}
