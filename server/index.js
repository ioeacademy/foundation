import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildAllCourses } from './bundle-builder.js';
import catalogRoutes from './routes/catalog.js';
import downloadRoutes from './routes/download.js';
import ingestRoutes from './routes/ingest.js';
import dashboardRoutes from './routes/dashboard.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;

const app = express();
app.use(express.json({ limit: '5mb' }));
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Device-Token');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.use('/api/v1', catalogRoutes);
app.use('/api/v1', downloadRoutes);
app.use('/api/v1', ingestRoutes);
app.use('/api/v1', dashboardRoutes);

app.use('/dashboard', express.static(path.join(__dirname, 'public', 'dashboard')));
app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard', 'index.html'));
});

app.use('/pwa', express.static(path.join(__dirname, '..', 'pwa', 'public'), {
  setHeaders(res, file) {
    if (file.endsWith('sw.js')) res.setHeader('Service-Worker-Allowed', '/');
  }
}));

app.get('/', (req, res) => res.redirect('/pwa/'));

const built = await buildAllCourses();
console.log(`[bundle] built ${built.length} course bundle(s):`,
  built.map(b => `${b.courseId}@${b.version} (${b.sizeBytes} B)`).join(', ') || '(none)');

app.listen(PORT, () => {
  console.log(`[server] listening on http://localhost:${PORT}`);
  console.log(`[server] PWA at      http://localhost:${PORT}/pwa/`);
  console.log(`[server] dashboard at http://localhost:${PORT}/dashboard`);
});
