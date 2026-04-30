// Download / install / extract / verify course bundles.
import { putBundle, putInstance, getBundle, getInstance, getInstanceForCourse } from './storage.js';
import { newServerDownloadEntry, newP2pReceiveEntry, recordLineageEntry } from './lineage.js';

const JSZip = globalThis.JSZip;

async function sha256Hex(buf) {
  const h = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(h)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function computeContentHash(assets) {
  const canonical = [...assets]
    .sort((a, b) => a.path.localeCompare(b.path))
    .map(a => `${a.path}:${a.sha256}`)
    .join('\n');
  return 'sha256-' + await sha256Hex(new TextEncoder().encode(canonical));
}

export async function extractBundleBlob(blob) {
  const ab = await blob.arrayBuffer();
  const zip = await JSZip.loadAsync(ab);
  const manifestFile = zip.file('course.json');
  if (!manifestFile) throw new Error('Bundle senza course.json');
  const manifest = JSON.parse(await manifestFile.async('string'));

  const files = {};
  const verifyAssets = [];
  for (const a of manifest.assets) {
    const f = zip.file(a.path);
    if (!f) throw new Error(`Asset mancante: ${a.path}`);
    const content = await f.async('uint8array');
    const sha = await sha256Hex(content);
    if (sha !== a.sha256) throw new Error(`Hash mismatch su ${a.path}`);
    files[a.path] = content;
    verifyAssets.push({ path: a.path, sha256: sha });
  }
  const recomputed = await computeContentHash(verifyAssets);
  if (manifest.contentHash && manifest.contentHash !== recomputed) {
    throw new Error('contentHash non corrispondente al contenuto del bundle');
  }
  return { manifest, files };
}

export function bundleId(courseId, version) { return `${courseId}@${version}`; }

export async function installFromServer({ catalogEntry, deviceId }) {
  const res = await fetch(catalogEntry.bundleUrl);
  if (!res.ok) throw new Error('Download fallito: ' + res.status);
  const blob = await res.blob();
  const { manifest } = await extractBundleBlob(blob);

  const id = bundleId(manifest.id, manifest.version);
  await putBundle({
    id,
    courseId: manifest.id,
    version: manifest.version,
    manifest,
    blob,
    installedAt: new Date().toISOString()
  });

  const entry = newServerDownloadEntry({
    courseId: manifest.id,
    courseVersion: manifest.version,
    deviceId
  });
  await putInstance({
    instanceId: entry.instanceId,
    courseId: manifest.id,
    courseVersion: manifest.version,
    bundleId: id,
    lineage: [entry]
  });
  await recordLineageEntry(entry);
  return { manifest, instanceId: entry.instanceId };
}

export async function installFromP2P({ blob, parentLineage, deviceId, fromDeviceId }) {
  const { manifest } = await extractBundleBlob(blob);
  const id = bundleId(manifest.id, manifest.version);

  // Idempotency: if we already have a bundle for this course at this version,
  // we still record the new instance + lineage entry (a "copy" event), but don't re-store the blob.
  const existing = await getBundle(id);
  if (!existing) {
    await putBundle({
      id,
      courseId: manifest.id,
      version: manifest.version,
      manifest,
      blob,
      installedAt: new Date().toISOString()
    });
  }

  const parentLast = Array.isArray(parentLineage) && parentLineage.length
    ? parentLineage[parentLineage.length - 1]
    : null;
  const entry = newP2pReceiveEntry({
    courseId: manifest.id,
    courseVersion: manifest.version,
    deviceId,
    fromDeviceId,
    parentInstanceId: parentLast ? parentLast.instanceId : null
  });
  const fullLineage = [...(parentLineage || []), entry];
  await putInstance({
    instanceId: entry.instanceId,
    courseId: manifest.id,
    courseVersion: manifest.version,
    bundleId: id,
    lineage: fullLineage
  });
  await recordLineageEntry(entry);
  return { manifest, instanceId: entry.instanceId, entry };
}

export async function getInstalled(courseId) {
  const inst = await getInstanceForCourse(courseId);
  if (!inst) return null;
  const bundle = await getBundle(inst.bundleId);
  if (!bundle) return null;
  return { instance: inst, bundle };
}

export async function readyToShare(courseId) {
  return getInstalled(courseId);
}

export async function loadInstance(instanceId) {
  const inst = await getInstance(instanceId);
  if (!inst) return null;
  const bundle = await getBundle(inst.bundleId);
  if (!bundle) return null;
  return { instance: inst, bundle };
}
