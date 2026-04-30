import { Router } from 'express';
import { listCourses } from '../db.js';

const router = Router();

router.get('/catalog', (req, res) => {
  const courses = listCourses().map(c => ({
    id: c.courseId,
    version: c.version,
    title: c.manifest.title,
    description: c.manifest.description,
    sizeBytes: c.sizeBytes,
    contentHash: c.contentHash,
    publisher: c.manifest.publisher,
    bundleUrl: `/api/v1/courses/${encodeURIComponent(c.courseId)}/${encodeURIComponent(c.version)}/bundle`
  }));
  res.json({ courses });
});

export default router;
