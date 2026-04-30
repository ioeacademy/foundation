import { putStatement, getDeviceId } from '../storage.js';

let listenerInstalled = false;
let activeContext = null; // { iframeEl, courseId, instanceId, manifest, deviceId, onStatement }

export function bindActiveCourse(ctx) {
  activeContext = ctx;
  ensureListener();
}

export function clearActiveCourse() { activeContext = null; }

export function ensureListener() {
  if (listenerInstalled) return;
  listenerInstalled = true;
  window.addEventListener('message', async (ev) => {
    if (!activeContext) return;
    const data = ev.data;
    if (!data || data.type !== 'foundation.xapi') return;
    // Source check: compare against iframe.contentWindow dynamically (it may change as src reloads).
    const iframeEl = activeContext.iframeEl;
    if (iframeEl && ev.source !== iframeEl.contentWindow) return;

    const stmt = data.statement;
    if (!stmt || !stmt.id || !stmt.verb || !stmt.verb.id || !stmt.object || !stmt.object.id) return;

    const allow = activeContext.manifest.xapiVerbWhitelist;
    if (Array.isArray(allow) && allow.length && !allow.includes(stmt.verb.id)) return;

    if (!stmt.actor || !stmt.actor.account) {
      stmt.actor = { account: { homePage: 'foundation://device', name: activeContext.deviceId } };
    } else if (!stmt.actor.account.name || stmt.actor.account.name === 'self') {
      stmt.actor.account.name = activeContext.deviceId;
    }

    const rec = {
      statementId: stmt.id,
      deviceId: activeContext.deviceId,
      instanceId: activeContext.instanceId,
      courseId: activeContext.courseId,
      statement: stmt,
      recordedAt: stmt.timestamp || new Date().toISOString(),
      syncedAt: null
    };
    try {
      await putStatement(rec);
      activeContext.onStatement?.(rec);
    } catch (e) {
      console.error('xapi store error', e);
    }
  });
}

export async function ensureDeviceId() {
  return getDeviceId();
}
