import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';
import { upsertCourse } from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const COURSES_DIR = path.join(__dirname, 'courses');
const DATA_DIR = path.join(__dirname, 'data');

function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function walk(dir, base = dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, base, out);
    else out.push({ abs: full, rel: path.relative(base, full).replaceAll('\\', '/') });
  }
  return out;
}

export async function buildCourseBundle(courseFolderName) {
  const courseDir = path.join(COURSES_DIR, courseFolderName);
  const sourceManifestPath = path.join(courseDir, 'course.json');
  if (!fs.existsSync(sourceManifestPath)) {
    throw new Error(`course.json not found in ${courseDir}`);
  }
  const sourceManifest = JSON.parse(fs.readFileSync(sourceManifestPath, 'utf8'));
  const { id, version } = sourceManifest;

  const files = walk(courseDir).filter(f => f.rel !== 'course.json');
  const assets = files
    .map(f => {
      const buf = fs.readFileSync(f.abs);
      return { path: f.rel, sha256: sha256(buf), size: buf.length, _buf: buf };
    })
    .sort((a, b) => a.path.localeCompare(b.path));

  const canonical = assets.map(a => `${a.path}:${a.sha256}`).join('\n');
  const contentHash = 'sha256-' + sha256(Buffer.from(canonical));
  const sizeBytes = assets.reduce((s, a) => s + a.size, 0);

  const manifest = {
    ...sourceManifest,
    assets: assets.map(({ _buf, ...rest }) => rest),
    contentHash,
    sizeBytes,
    publisher: {
      name: sourceManifest.publisher?.name || 'Foundation',
      publishedAt: sourceManifest.publisher?.publishedAt || new Date().toISOString()
    }
  };

  const zip = new JSZip();
  zip.file('course.json', JSON.stringify(manifest, null, 2));
  for (const a of assets) zip.file(a.path, a._buf);
  const zipBuf = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });

  fs.mkdirSync(DATA_DIR, { recursive: true });
  const bundlePath = path.join(DATA_DIR, `${id}-${version}.zip`);
  fs.writeFileSync(bundlePath, zipBuf);

  upsertCourse({
    courseId: id,
    version,
    manifest,
    bundlePath,
    sizeBytes: zipBuf.length,
    contentHash
  });

  return { courseId: id, version, manifest, bundlePath, sizeBytes: zipBuf.length, contentHash };
}

export async function buildAllCourses() {
  const built = [];
  if (!fs.existsSync(COURSES_DIR)) return built;
  for (const entry of fs.readdirSync(COURSES_DIR, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (fs.existsSync(path.join(COURSES_DIR, entry.name, 'course.json'))) {
      built.push(await buildCourseBundle(entry.name));
    }
  }
  return built;
}
