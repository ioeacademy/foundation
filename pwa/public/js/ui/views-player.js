import { getInstalled } from '../bundle.js';
import { loadCourseIntoIframe } from '../courseware/runner.js';
import { bindActiveCourse, clearActiveCourse } from '../courseware/xapi-collector.js';
import { getDeviceId } from '../storage.js';
import { t } from './i18n-it.js';

let currentSession = null;

export async function renderPlayer(main, { courseId }, navigate) {
  if (currentSession) { currentSession.revoke?.(); currentSession = null; clearActiveCourse(); }

  main.innerHTML = `
    <div class="row" style="margin-bottom:0.5rem">
      <button class="secondary" id="back">${t.player_back}</button>
      <span id="player-title" class="muted"></span>
    </div>
    <iframe class="player-frame" id="frame" referrerpolicy="no-referrer"></iframe>
    <p class="muted" id="counter" style="margin-top:0.5rem">Statement registrati: 0</p>
  `;
  main.querySelector('#back').addEventListener('click', () => {
    if (currentSession) { currentSession.revoke?.(); currentSession = null; clearActiveCourse(); }
    navigate('library');
  });

  const installed = await getInstalled(courseId);
  if (!installed) {
    main.innerHTML = `<div class="card">Corso non trovato.</div>`;
    return;
  }
  // Ensure the service worker is controlling this page before we ask it to
  // serve courseware files from `/pwa/_course/<instanceId>/...`.
  if ('serviceWorker' in navigator && !navigator.serviceWorker.controller) {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) {
      main.innerHTML = `<div class="card">Service Worker non attivo. Ricarica la pagina (⌘/Ctrl-R) e riapri il corso.</div>`;
      return;
    }
  }
  const iframe = main.querySelector('#frame');
  const deviceId = await getDeviceId();
  let count = 0;
  // Bind the xAPI collector BEFORE we set iframe src — the courseware's initial
  // postMessage fires during parsing of the entry HTML, which is too early for
  // an iframe.onload listener.
  bindActiveCourse({
    iframeEl: iframe,
    manifest: installed.bundle.manifest,
    courseId: installed.bundle.courseId,
    instanceId: installed.instance.instanceId,
    deviceId,
    onStatement: () => {
      count++;
      const c = main.querySelector('#counter');
      if (c) c.textContent = `Statement registrati: ${count}`;
    }
  });

  const session = await loadCourseIntoIframe({
    blob: installed.bundle.blob,
    iframe,
    instanceId: installed.instance.instanceId
  });
  currentSession = session;
  const titleObj = session.manifest.title || {};
  main.querySelector('#player-title').textContent = (titleObj.it || titleObj.en || courseId) + ' · v' + session.manifest.version;
}
