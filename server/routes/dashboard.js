import { Router } from 'express';
import { db, listCourses } from '../db.js';

const router = Router();

router.get('/stats/courses', (req, res) => {
  const courses = listCourses();
  const out = courses.map(c => {
    const copies = db.prepare(`
      SELECT COUNT(DISTINCT instance_id) AS n FROM lineage_events WHERE course_id = ?
    `).get(c.courseId).n;
    const statements = db.prepare(`
      SELECT COUNT(*) AS n FROM xapi_statements WHERE course_id = ?
    `).get(c.courseId).n;
    const devices = db.prepare(`
      SELECT COUNT(DISTINCT to_device_id) AS n FROM lineage_events WHERE course_id = ?
    `).get(c.courseId).n;
    return {
      id: c.courseId,
      version: c.version,
      title: c.manifest.title,
      sizeBytes: c.sizeBytes,
      copies,
      devices,
      statements
    };
  });
  res.json({ courses: out });
});

router.get('/stats/courses/:id/lineage', (req, res) => {
  const rows = db.prepare(`
    SELECT event_id, course_id, course_version, instance_id, parent_instance_id,
           from_device_id, to_device_id, shared_at, transport
    FROM lineage_events WHERE course_id = ? ORDER BY shared_at ASC
  `).all(req.params.id);
  res.json({
    courseId: req.params.id,
    entries: rows.map(r => ({
      eventId: r.event_id,
      courseId: r.course_id,
      courseVersion: r.course_version,
      instanceId: r.instance_id,
      parentInstanceId: r.parent_instance_id,
      fromDeviceId: r.from_device_id,
      toDeviceId: r.to_device_id,
      sharedAt: r.shared_at,
      transport: r.transport
    }))
  });
});

router.get('/stats/courses/:id/xapi', (req, res) => {
  const rows = db.prepare(`
    SELECT verb, COUNT(*) AS n FROM xapi_statements WHERE course_id = ? GROUP BY verb ORDER BY n DESC
  `).all(req.params.id);
  const recent = db.prepare(`
    SELECT statement_id, device_id, instance_id, verb, object_id, recorded_at
    FROM xapi_statements WHERE course_id = ? ORDER BY recorded_at DESC LIMIT 20
  `).all(req.params.id);
  res.json({
    courseId: req.params.id,
    verbs: rows.map(r => ({ verb: r.verb, count: r.n })),
    recent: recent.map(r => ({
      statementId: r.statement_id,
      deviceId: r.device_id,
      instanceId: r.instance_id,
      verb: r.verb,
      objectId: r.object_id,
      recordedAt: r.recorded_at
    }))
  });
});

export default router;
