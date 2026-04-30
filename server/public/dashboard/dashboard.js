(async function () {
  const coursesList = document.getElementById('courses-list');
  const detail = document.getElementById('detail');
  const detailTitle = document.getElementById('detail-title');
  const lineageTree = document.getElementById('lineage-tree');
  const verbChart = document.getElementById('verb-chart');
  const recent = document.getElementById('recent');

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  }
  function shortId(s) { return s ? String(s).slice(0, 8) : '—'; }

  let activeCourseId = null;

  async function loadCourses() {
    const res = await fetch('/api/v1/stats/courses');
    const data = await res.json();
    coursesList.innerHTML = '';
    if (!data.courses.length) {
      coursesList.innerHTML = '<p class="muted">Nessun dato ancora ricevuto. Effettua un giro di demo dalla PWA.</p>';
      detail.hidden = true;
      return;
    }
    for (const c of data.courses) {
      const title = (c.title?.it || c.title?.en || c.id);
      const card = document.createElement('div');
      card.className = 'course-card';
      if (c.id === activeCourseId) card.classList.add('active');
      card.innerHTML = `
        <div>
          <div><strong>${escapeHtml(title)}</strong> <span class="muted">v${escapeHtml(c.version)}</span></div>
          <div class="muted">id: <code>${escapeHtml(c.id)}</code></div>
        </div>
        <div class="stats">
          <div class="stat"><div class="n">${c.copies}</div><div class="l">Copie</div></div>
          <div class="stat"><div class="n">${c.devices}</div><div class="l">Dispositivi</div></div>
          <div class="stat"><div class="n">${c.statements}</div><div class="l">Statement</div></div>
        </div>
      `;
      card.addEventListener('click', () => loadDetail(c.id, title));
      coursesList.appendChild(card);
    }
  }

  async function loadDetail(courseId, title) {
    activeCourseId = courseId;
    detail.hidden = false;
    detailTitle.textContent = title + ' · ' + courseId;
    document.querySelectorAll('.course-card').forEach(el => {
      el.classList.toggle('active', el.querySelector('code')?.textContent === courseId);
    });

    const [lineageRes, xapiRes] = await Promise.all([
      fetch(`/api/v1/stats/courses/${encodeURIComponent(courseId)}/lineage`).then(r => r.json()),
      fetch(`/api/v1/stats/courses/${encodeURIComponent(courseId)}/xapi`).then(r => r.json())
    ]);

    renderLineageTree(lineageRes.entries);
    renderVerbChart(xapiRes.verbs);
    renderRecent(xapiRes.recent);
  }

  function renderLineageTree(entries) {
    if (!entries.length) {
      lineageTree.innerHTML = '<p class="muted">Nessun evento di lineage.</p>';
      return;
    }
    // Build tree: nodes keyed by instanceId. Roots = entries with parentInstanceId === null.
    const byInstance = new Map();
    for (const e of entries) byInstance.set(e.instanceId, { entry: e, children: [] });
    for (const e of entries) {
      if (e.parentInstanceId && byInstance.has(e.parentInstanceId)) {
        byInstance.get(e.parentInstanceId).children.push(byInstance.get(e.instanceId));
      }
    }
    const roots = entries.filter(e => !e.parentInstanceId).map(e => byInstance.get(e.instanceId));

    // Layout: simple DFS with x = node count counter, y = depth.
    let xCounter = 0;
    const nodes = [];
    const edges = [];
    function layout(n, depth, parent) {
      const myChildren = n.children.slice();
      if (myChildren.length === 0) {
        n.x = xCounter++;
      } else {
        myChildren.forEach(ch => layout(ch, depth + 1, n));
        n.x = (myChildren[0].x + myChildren[myChildren.length - 1].x) / 2;
      }
      n.y = depth;
      nodes.push(n);
      if (parent) edges.push({ from: parent, to: n });
    }
    roots.forEach((r, i) => { if (i > 0) xCounter += 0.5; layout(r, 0, null); });

    const STEP_X = 110, STEP_Y = 90, PAD = 30;
    const maxX = Math.max(0, ...nodes.map(n => n.x));
    const maxY = Math.max(0, ...nodes.map(n => n.y));
    const w = (maxX * STEP_X) + 200;
    const h = (maxY + 1) * STEP_Y + 30;
    const parts = [`<svg viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg">`];
    for (const e of edges) {
      const x1 = PAD + e.from.x * STEP_X + 40, y1 = e.from.y * STEP_Y + 20;
      const x2 = PAD + e.to.x * STEP_X + 40, y2 = e.to.y * STEP_Y + 20;
      parts.push(`<path class="edge" d="M${x1},${y1+15} C${x1},${(y1+y2)/2} ${x2},${(y1+y2)/2} ${x2},${y2-15}"/>`);
    }
    for (const n of nodes) {
      const x = PAD + n.x * STEP_X, y = n.y * STEP_Y;
      const isRoot = n.entry.transport === 'server-download';
      const cls = isRoot ? 'node-server' : 'node-device';
      const labelDevice = isRoot ? '🌐' : shortId(n.entry.toDeviceId);
      const labelInstance = shortId(n.entry.instanceId);
      const date = (n.entry.sharedAt || '').slice(0, 16).replace('T', ' ');
      parts.push(`
        <g>
          <rect x="${x}" y="${y}" width="80" height="40" rx="8" class="${cls}">
            <title>${escapeHtml(n.entry.eventId)} · ${escapeHtml(n.entry.sharedAt)}</title>
          </rect>
          <text x="${x + 40}" y="${y + 17}" class="node-label" text-anchor="middle">${escapeHtml(labelDevice)}</text>
          <text x="${x + 40}" y="${y + 32}" class="node-label" text-anchor="middle" style="opacity:0.8">${escapeHtml(labelInstance)}</text>
          <text x="${x + 40}" y="${y + 55}" text-anchor="middle" font-size="10" fill="#666">${escapeHtml(date)}</text>
        </g>
      `);
    }
    parts.push('</svg>');
    lineageTree.innerHTML = parts.join('');
  }

  function renderVerbChart(verbs) {
    if (!verbs.length) { verbChart.innerHTML = '<p class="muted">Nessuno statement.</p>'; return; }
    const max = Math.max(...verbs.map(v => v.count));
    verbChart.innerHTML = verbs.map(v => {
      const short = v.verb.split('/').pop() || v.verb;
      const w = max > 0 ? Math.round(v.count / max * 100) : 0;
      return `<div class="bar-row">
        <span class="verb">${escapeHtml(short)}</span>
        <span class="bar"><div style="width:${w}%"></div></span>
        <span class="n">${v.count}</span>
      </div>`;
    }).join('');
  }

  function renderRecent(list) {
    if (!list.length) { recent.innerHTML = '<p class="muted">Nessuno statement recente.</p>'; return; }
    recent.innerHTML = list.map(r => {
      const verb = r.verb.split('/').pop() || r.verb;
      return `<div class="recent-row">
        ${escapeHtml(verb)} → ${escapeHtml(r.objectId)}
        <br><small>${escapeHtml(r.recordedAt)} · device ${shortId(r.deviceId)} · instance ${shortId(r.instanceId)}</small>
      </div>`;
    }).join('');
  }

  loadCourses();
  setInterval(loadCourses, 5000); // poll every 5s
})();
