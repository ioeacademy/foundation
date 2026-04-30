// Build, append, and serialize lineage chains.
import { appendOutboxLineage } from './storage.js';

function uuid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return 'id-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function newServerDownloadEntry({ courseId, courseVersion, deviceId }) {
  return {
    eventId: uuid(),
    courseId,
    courseVersion,
    instanceId: uuid(),
    parentInstanceId: null,
    fromDeviceId: null,
    toDeviceId: deviceId,
    sharedAt: new Date().toISOString(),
    transport: 'server-download'
  };
}

export function newP2pReceiveEntry({ courseId, courseVersion, deviceId, fromDeviceId, parentInstanceId }) {
  return {
    eventId: uuid(),
    courseId,
    courseVersion,
    instanceId: uuid(),
    parentInstanceId,
    fromDeviceId,
    toDeviceId: deviceId,
    sharedAt: new Date().toISOString(),
    transport: 'p2p-webrtc'
  };
}

export async function recordLineageEntry(entry) {
  await appendOutboxLineage(entry);
}
