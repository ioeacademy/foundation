import { Router } from 'express';
import { db, upsertDevice } from '../db.js';

const router = Router();

const insertLineage = db.prepare(`
  INSERT OR IGNORE INTO lineage_events
    (event_id, course_id, course_version, instance_id, parent_instance_id,
     from_device_id, to_device_id, shared_at, transport, location_json, ingested_at)
  VALUES (@eventId, @courseId, @courseVersion, @instanceId, @parentInstanceId,
          @fromDeviceId, @toDeviceId, @sharedAt, @transport, @locationJson, @ingestedAt)
`);

const insertStatement = db.prepare(`
  INSERT OR IGNORE INTO xapi_statements
    (statement_id, device_id, instance_id, course_id, verb, object_id,
     statement_json, recorded_at, ingested_at)
  VALUES (@statementId, @deviceId, @instanceId, @courseId, @verb, @objectId,
          @statementJson, @recordedAt, @ingestedAt)
`);

const ingestTx = db.transaction((deviceId, lineageEntries, statements, now) => {
  upsertDevice(deviceId, now);
  let lineageAccepted = 0, lineageDup = 0, stAccepted = 0, stDup = 0;

  for (const e of lineageEntries) {
    const r = insertLineage.run({
      eventId: e.eventId,
      courseId: e.courseId,
      courseVersion: e.courseVersion,
      instanceId: e.instanceId,
      parentInstanceId: e.parentInstanceId ?? null,
      fromDeviceId: e.fromDeviceId ?? null,
      toDeviceId: e.toDeviceId,
      sharedAt: e.sharedAt,
      transport: e.transport,
      locationJson: e.location ? JSON.stringify(e.location) : null,
      ingestedAt: now
    });
    if (r.changes === 1) lineageAccepted++; else lineageDup++;
  }

  for (const s of statements) {
    const r = insertStatement.run({
      statementId: s.statementId,
      deviceId: s.deviceId,
      instanceId: s.instanceId,
      courseId: s.courseId,
      verb: s.statement?.verb?.id || '',
      objectId: s.statement?.object?.id || '',
      statementJson: JSON.stringify(s.statement),
      recordedAt: s.recordedAt,
      ingestedAt: now
    });
    if (r.changes === 1) stAccepted++; else stDup++;
  }

  return { lineageAccepted, lineageDup, stAccepted, stDup };
});

router.post('/ingest', (req, res) => {
  const { deviceId, lineageEntries = [], statements = [] } = req.body || {};
  if (!deviceId || typeof deviceId !== 'string') {
    return res.status(400).json({ error: 'deviceId_required' });
  }
  if (!Array.isArray(lineageEntries) || !Array.isArray(statements)) {
    return res.status(400).json({ error: 'invalid_arrays' });
  }

  const now = new Date().toISOString();
  try {
    const r = ingestTx(deviceId, lineageEntries, statements, now);
    res.json({
      accepted: { lineage: r.lineageAccepted, statements: r.stAccepted },
      duplicates: { lineage: r.lineageDup, statements: r.stDup }
    });
  } catch (err) {
    console.error('ingest error', err);
    res.status(500).json({ error: 'ingest_failed', message: err.message });
  }
});

export default router;
