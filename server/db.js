import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, 'data');
fs.mkdirSync(dataDir, { recursive: true });

const dbPath = path.join(dataDir, 'analytics.sqlite');
export const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS devices (
  device_id TEXT PRIMARY KEY,
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS courses (
  course_id TEXT NOT NULL,
  version TEXT NOT NULL,
  manifest_json TEXT NOT NULL,
  bundle_path TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  content_hash TEXT NOT NULL,
  PRIMARY KEY(course_id, version)
);

CREATE TABLE IF NOT EXISTS lineage_events (
  event_id TEXT PRIMARY KEY,
  course_id TEXT NOT NULL,
  course_version TEXT NOT NULL,
  instance_id TEXT NOT NULL,
  parent_instance_id TEXT,
  from_device_id TEXT,
  to_device_id TEXT NOT NULL,
  shared_at TEXT NOT NULL,
  transport TEXT NOT NULL,
  location_json TEXT,
  ingested_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_lineage_course ON lineage_events(course_id);
CREATE INDEX IF NOT EXISTS idx_lineage_parent ON lineage_events(parent_instance_id);
CREATE INDEX IF NOT EXISTS idx_lineage_instance ON lineage_events(instance_id);

CREATE TABLE IF NOT EXISTS xapi_statements (
  statement_id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL,
  instance_id TEXT NOT NULL,
  course_id TEXT NOT NULL,
  verb TEXT NOT NULL,
  object_id TEXT NOT NULL,
  statement_json TEXT NOT NULL,
  recorded_at TEXT NOT NULL,
  ingested_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_xapi_course_verb ON xapi_statements(course_id, verb);
CREATE INDEX IF NOT EXISTS idx_xapi_instance ON xapi_statements(instance_id);
`;

db.exec(SCHEMA);

export function upsertDevice(deviceId, now) {
  db.prepare(`
    INSERT INTO devices(device_id, first_seen_at, last_seen_at)
    VALUES (?, ?, ?)
    ON CONFLICT(device_id) DO UPDATE SET last_seen_at = excluded.last_seen_at
  `).run(deviceId, now, now);
}

export function upsertCourse({ courseId, version, manifest, bundlePath, sizeBytes, contentHash }) {
  db.prepare(`
    INSERT INTO courses(course_id, version, manifest_json, bundle_path, size_bytes, content_hash)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(course_id, version) DO UPDATE SET
      manifest_json = excluded.manifest_json,
      bundle_path = excluded.bundle_path,
      size_bytes = excluded.size_bytes,
      content_hash = excluded.content_hash
  `).run(courseId, version, JSON.stringify(manifest), bundlePath, sizeBytes, contentHash);
}

export function listCourses() {
  return db.prepare(`SELECT course_id, version, manifest_json, size_bytes, content_hash FROM courses`)
    .all()
    .map(r => ({
      courseId: r.course_id,
      version: r.version,
      manifest: JSON.parse(r.manifest_json),
      sizeBytes: r.size_bytes,
      contentHash: r.content_hash
    }));
}

export function getCourse(courseId, version) {
  const row = db.prepare(`SELECT * FROM courses WHERE course_id = ? AND version = ?`).get(courseId, version);
  if (!row) return null;
  return {
    courseId: row.course_id,
    version: row.version,
    manifest: JSON.parse(row.manifest_json),
    bundlePath: row.bundle_path,
    sizeBytes: row.size_bytes,
    contentHash: row.content_hash
  };
}

export function getLatestCourse(courseId) {
  const rows = db.prepare(`SELECT * FROM courses WHERE course_id = ?`).all(courseId);
  if (!rows.length) return null;
  rows.sort((a, b) => semverCmp(b.version, a.version));
  const row = rows[0];
  return {
    courseId: row.course_id,
    version: row.version,
    manifest: JSON.parse(row.manifest_json),
    bundlePath: row.bundle_path,
    sizeBytes: row.size_bytes,
    contentHash: row.content_hash
  };
}

function semverCmp(a, b) {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pa[i] - pb[i];
  }
  return 0;
}
