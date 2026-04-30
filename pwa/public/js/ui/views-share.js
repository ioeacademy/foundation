import { listBundles, getDeviceId } from '../storage.js';
import { getInstalled } from '../bundle.js';
import { Peer } from '../webrtc/peer.js';
import { sendBundle } from '../webrtc/transfer.js';
import { encodeSdpToFrames, FrameAssembler } from '../webrtc/signaling-qr.js';
import { AnimatedQR } from '../qr/encoder.js';
import { QRScanner } from '../qr/scanner.js';
import { t } from './i18n-it.js';
import { escapeHtml, kb } from './util.js';

export async function renderShare(main, params = {}) {
  const bundles = await listBundles();
  if (!bundles.length) {
    main.innerHTML = `<h2>${t.share_title}</h2><div class="card muted">${t.share_no_courses}</div>`;
    return;
  }

  const preselect = params.courseId;
  const options = bundles.map(b => {
    const title = (b.manifest.title?.it || b.manifest.title?.en || b.courseId);
    const sel = b.courseId === preselect ? 'selected' : '';
    return `<option value="${escapeHtml(b.courseId)}" ${sel}>${escapeHtml(title)} · v${b.version} · ${kb(b.blob?.size || 0)}</option>`;
  }).join('');

  main.innerHTML = `
    <h2>${t.share_title}</h2>
    <div class="card">
      <label>${t.share_pick}</label>
      <select id="course-select" style="width:100%; padding:0.5rem; margin-top:0.4rem;">${options}</select>
      <div class="row" style="margin-top:0.6rem">
        <button class="primary" id="start">${t.share_show_offer}</button>
        <label class="row" style="gap:0.3rem"><input type="checkbox" id="dev-mode"> ${t.share_dev_mode}</label>
      </div>
    </div>
    <div id="stage"></div>
  `;

  const stage = main.querySelector('#stage');
  let peer = null;
  let qrAnim = null;
  let scanner = null;

  main.querySelector('#start').addEventListener('click', async () => {
    const courseId = main.querySelector('#course-select').value;
    const installed = await getInstalled(courseId);
    if (!installed) { alert('Corso non disponibile.'); return; }
    const devMode = main.querySelector('#dev-mode').checked;

    if (peer) { peer.close(); peer = null; }
    if (qrAnim) { qrAnim.stop(); qrAnim = null; }
    if (scanner) { scanner.stop(); scanner = null; }

    peer = new Peer();
    const dc = peer.createDataChannel('bundle');
    const offer = await peer.createOffer();
    const offerFrames = encodeSdpToFrames(offer);

    if (devMode) {
      stage.innerHTML = `
        <div class="card">
          <h3>1. Offerta (manda all'altro lato)</h3>
          <textarea id="offer-text" readonly></textarea>
          <div class="row" style="margin-top:0.4rem">
            <button class="secondary" id="copy-offer">${t.copy}</button>
            <span id="offer-status" class="muted"></span>
          </div>
        </div>
        <div class="card">
          <h3>2. Incolla la risposta</h3>
          <textarea id="answer-text" placeholder="${t.share_paste_answer}"></textarea>
          <div class="row" style="margin-top:0.4rem">
            <button class="primary" id="apply-answer">${t.share_send}</button>
            <span id="answer-status" class="muted"></span>
          </div>
        </div>
        <div class="card" id="progress-card" style="display:none">
          <h3>Trasferimento</h3>
          <div class="progress"><div id="bar" style="width:0%"></div></div>
          <p id="progress-label" class="muted">…</p>
        </div>
      `;
      stage.querySelector('#offer-text').value = JSON.stringify({ frames: offerFrames.frames });
      stage.querySelector('#copy-offer').addEventListener('click', () => {
        stage.querySelector('#offer-text').select();
        document.execCommand('copy');
        stage.querySelector('#offer-status').textContent = 'Copiato.';
      });
      stage.querySelector('#apply-answer').addEventListener('click', async () => {
        const txt = stage.querySelector('#answer-text').value.trim();
        if (!txt) return;
        try {
          const obj = JSON.parse(txt);
          const asm = new FrameAssembler();
          let result = null;
          for (const f of obj.frames) result = asm.ingest(f);
          if (!result || !result.sdp) throw new Error('Risposta incompleta');
          await peer.acceptAnswer(result.sdp);
          stage.querySelector('#answer-status').textContent = 'Risposta accettata, in attesa di canale…';
          await peer.awaitOpen();
          await sendNow(installed);
        } catch (e) {
          stage.querySelector('#answer-status').textContent = 'Errore: ' + e.message;
        }
      });
    } else {
      stage.innerHTML = `
        <div class="card qr-container">
          <h3>1. Mostra al ricevente</h3>
          <canvas id="offer-qr"></canvas>
          <p class="muted">Frame ${offerFrames.frames.length} totali · animati</p>
        </div>
        <div class="card scanner">
          <h3>2. Scansiona la risposta</h3>
          <video id="scan-video" muted></video>
          <p id="scan-progress" class="muted">In attesa…</p>
        </div>
        <div class="card" id="progress-card" style="display:none">
          <h3>Trasferimento</h3>
          <div class="progress"><div id="bar" style="width:0%"></div></div>
          <p id="progress-label" class="muted">…</p>
        </div>
      `;
      qrAnim = new AnimatedQR(stage.querySelector('#offer-qr'), offerFrames.frames, { fps: 3 });
      qrAnim.start();
      const asm = new FrameAssembler();
      scanner = new QRScanner(stage.querySelector('#scan-video'), async (frame) => {
        const r = asm.ingest(frame);
        if (r?.progress) {
          stage.querySelector('#scan-progress').textContent = `Ricevuti ${r.progress.have}/${r.progress.total} frame`;
        } else if (r?.sdp) {
          stage.querySelector('#scan-progress').textContent = 'Risposta completa, apertura canale…';
          scanner.stop();
          await peer.acceptAnswer(r.sdp);
          await peer.awaitOpen();
          await sendNow(installed);
        }
      });
      try { await scanner.start(); }
      catch (e) { stage.querySelector('#scan-progress').textContent = 'Camera non disponibile: ' + e.message; }
    }

    async function sendNow(installed) {
      if (qrAnim) qrAnim.stop();
      const card = stage.querySelector('#progress-card');
      const bar = stage.querySelector('#bar');
      const label = stage.querySelector('#progress-label');
      card.style.display = '';
      const deviceId = await getDeviceId();
      await sendBundle(dc, {
        manifest: installed.bundle.manifest,
        blob: installed.bundle.blob,
        lineage: installed.instance.lineage,
        senderDeviceId: deviceId,
        onProgress: ({ seq, total }) => {
          const pct = Math.round(seq / total * 100);
          bar.style.width = pct + '%';
          label.textContent = `${seq}/${total} chunk · ${pct}%`;
        }
      });
      label.textContent = 'Bundle inviato. Attendere conferma del destinatario.';
    }
  });
}
