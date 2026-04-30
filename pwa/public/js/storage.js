// Tiny IndexedDB wrapper. No external deps.

const DB_NAME = 'foundation-pwa';
const DB_VERSION = 1;

let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('bundles')) {
        db.createObjectStore('bundles', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('instances')) {
        const s = db.createObjectStore('instances', { keyPath: 'instanceId' });
        s.createIndex('courseId', 'courseId', { unique: false });
      }
      if (!db.objectStoreNames.contains('statements')) {
        const s = db.createObjectStore('statements', { keyPath: 'statementId' });
        s.createIndex('synced', 'syncedAt', { unique: false });
        s.createIndex('courseId', 'courseId', { unique: false });
      }
      if (!db.objectStoreNames.contains('outboxLineage')) {
        const s = db.createObjectStore('outboxLineage', { keyPath: 'eventId' });
        s.createIndex('synced', 'syncedAt', { unique: false });
      }
      if (!db.objectStoreNames.contains('device')) {
        db.createObjectStore('device', { keyPath: 'key' });
      }
    };
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
  });
  return dbPromise;
}

function tx(storeNames, mode) {
  return openDb().then(db => db.transaction(storeNames, mode));
}

function reqAsync(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function getDeviceId() {
  const t = await tx('device', 'readwrite');
  const store = t.objectStore('device');
  const existing = await reqAsync(store.get('id'));
  if (existing) return existing.value;
  const id = (crypto.randomUUID && crypto.randomUUID()) ||
    ('dev-' + Math.random().toString(36).slice(2) + Date.now().toString(36));
  await reqAsync(store.put({ key: 'id', value: id }));
  return id;
}

export async function putBundle(record) {
  // record: { id (composite courseId@version), courseId, version, manifest, blob, installedAt }
  const t = await tx('bundles', 'readwrite');
  await reqAsync(t.objectStore('bundles').put(record));
}

export async function getBundle(id) {
  const t = await tx('bundles', 'readonly');
  return reqAsync(t.objectStore('bundles').get(id));
}

export async function listBundles() {
  const t = await tx('bundles', 'readonly');
  return reqAsync(t.objectStore('bundles').getAll());
}

export async function deleteBundle(id) {
  const t = await tx(['bundles', 'instances'], 'readwrite');
  await reqAsync(t.objectStore('bundles').delete(id));
  // also remove instances that referenced this bundleId
  const idx = t.objectStore('instances').index('courseId');
  const courseId = id.split('@')[0];
  const insts = await reqAsync(idx.getAll(courseId));
  for (const inst of insts) {
    await reqAsync(t.objectStore('instances').delete(inst.instanceId));
  }
}

export async function putInstance(inst) {
  // inst: { instanceId, courseId, courseVersion, lineage:[entries], bundleId }
  const t = await tx('instances', 'readwrite');
  await reqAsync(t.objectStore('instances').put(inst));
}

export async function getInstance(instanceId) {
  const t = await tx('instances', 'readonly');
  return reqAsync(t.objectStore('instances').get(instanceId));
}

export async function getInstanceForCourse(courseId) {
  const t = await tx('instances', 'readonly');
  const idx = t.objectStore('instances').index('courseId');
  const all = await reqAsync(idx.getAll(courseId));
  return all[0] || null;
}

export async function listInstances() {
  const t = await tx('instances', 'readonly');
  return reqAsync(t.objectStore('instances').getAll());
}

export async function putStatement(rec) {
  const t = await tx('statements', 'readwrite');
  await reqAsync(t.objectStore('statements').put(rec));
}

export async function listStatements({ unsyncedOnly = false } = {}) {
  const t = await tx('statements', 'readonly');
  const all = await reqAsync(t.objectStore('statements').getAll());
  return unsyncedOnly ? all.filter(r => !r.syncedAt) : all;
}

export async function markStatementsSynced(ids, when) {
  const t = await tx('statements', 'readwrite');
  for (const id of ids) {
    const cur = await reqAsync(t.objectStore('statements').get(id));
    if (cur) {
      cur.syncedAt = when;
      await reqAsync(t.objectStore('statements').put(cur));
    }
  }
}

export async function appendOutboxLineage(entry) {
  const t = await tx('outboxLineage', 'readwrite');
  await reqAsync(t.objectStore('outboxLineage').put({ ...entry, syncedAt: null }));
}

export async function listOutboxLineage({ unsyncedOnly = false } = {}) {
  const t = await tx('outboxLineage', 'readonly');
  const all = await reqAsync(t.objectStore('outboxLineage').getAll());
  return unsyncedOnly ? all.filter(r => !r.syncedAt) : all;
}

export async function markLineageSynced(ids, when) {
  const t = await tx('outboxLineage', 'readwrite');
  for (const id of ids) {
    const cur = await reqAsync(t.objectStore('outboxLineage').get(id));
    if (cur) {
      cur.syncedAt = when;
      await reqAsync(t.objectStore('outboxLineage').put(cur));
    }
  }
}
