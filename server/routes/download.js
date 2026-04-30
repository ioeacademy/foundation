import { Router } from 'express';
import fs from 'node:fs';
import { getCourse, getLatestCourse } from '../db.js';

const router = Router();

router.get('/courses/:id/:version/bundle', (req, res) => {
  const course = getCourse(req.params.id, req.params.version);
  if (!course) return res.status(404).json({ error: 'course_not_found' });
  if (!fs.existsSync(course.bundlePath)) return res.status(500).json({ error: 'bundle_missing' });
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${course.courseId}-${course.version}.zip"`);
  res.setHeader('X-Content-Hash', course.contentHash);
  fs.createReadStream(course.bundlePath).pipe(res);
});

router.get('/courses/:id/bundle', (req, res) => {
  const course = getLatestCourse(req.params.id);
  if (!course) return res.status(404).json({ error: 'course_not_found' });
  if (!fs.existsSync(course.bundlePath)) return res.status(500).json({ error: 'bundle_missing' });
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${course.courseId}-${course.version}.zip"`);
  res.setHeader('X-Content-Hash', course.contentHash);
  res.setHeader('X-Course-Version', course.version);
  fs.createReadStream(course.bundlePath).pipe(res);
});

router.get('/courses/:id/manifest', (req, res) => {
  const course = getLatestCourse(req.params.id);
  if (!course) return res.status(404).json({ error: 'course_not_found' });
  res.json(course.manifest);
});

export default router;
