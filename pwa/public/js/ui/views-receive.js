import { Peer } from '../webrtc/peer.js';
import { makeReceiver } from '../webrtc/transfer.js';
import { encodeSdpToFrames, FrameAssembler } from '../webrtc/signaling-qr.js';
import { AnimatedQR } from '../qr/encoder.js';
import { QRScanner } from '../qr/scanner.js';
import { installFromP2P } from '../bundle.js';
import { getDeviceId } from '../storage.js';
import { t } from './i18n-it.js';

export async function renderReceive(main, params, navigate) {
  main.innerHTML = `
    <h2>${t.receive_title}</h2>
    <div class="card">
      <div class="row">
        <button class="primary" id="start">${t.receive_scan_offer}</button>
        <label class="row" style="gap:0.3rem"><input type="checkbox" id="dev-mode"> ${t.share_dev_mode}</label>
      </div>
    </div>
    <div id="stage"></div>
  `;

  const stage = main.querySelector('#stage');
  let peer = null, qrAnim = null, scanner = null;

  main.querySelector('#start').addEventListener('click', async () => {
    const devMode = main.querySelector('#dev-mode').checked;
    if (peer) { peer.close(); peer = null; }
    if (qrAnim) { qrAnim.stop(); qrAnim = null; }
    if (scanner) { scanner.stop(); scanner = null; }
    peer = new Peer();

    if (devMode) {
      stage.innerHTML = `
        <div class="card">
          <h3>1. Incolla l'offerta</h3>
          <textarea id="offer-text" placeholder="${t.receive_paste_offer}"></textarea>
          <div class="row" style="margin-top:0.4rem">
            <button class="primary" id="apply-offer">${t.generate} risposta</button>
            <span id="offer-status" class="muted"></span>
          </div>
        </div>
        <div class="card" id="answer-card" style="display:none">
          <h3>2. Risposta (manda al mittente)</h3>
          <textarea id="answer-text" readonly></textarea>
          <div class="row" style="margin-top:0.4rem">
            <button class="secondary" id="copy-answer">${t.copy}</button>
          </div>
        </div>
        <div class="card" id="progress-card" style="display:none">
          <h3>${t.receive_progress}</h3>
          <div class="progress"><div id="bar" style="width:0%"></div></div>
          <p id="progress-label" class="muted">…</p>
        </div>
      `;
      stage.querySelector('#apply-offer').addEventListener('click', async () => {
        try {
          const obj = JSON.parse(stage.querySelector('#offer-text').value);
          const asm = new FrameAssembler();
          let r = null;
          for (const f of obj.frames) r = asm.ingest(f);
          if (!r?.sdp) throw new Error('Offerta incompleta');
          const answer = await peer.createAnswer(r.sdp);
          const answerFrames = encodeSdpToFrames(answer);
          stage.querySelector('#answer-card').style.display = '';
          stage.querySelector('#answer-text').value = JSON.stringify({ frames: answerFrames.frames });
          const dc = await peer.awaitDataChannel();
          attachReceiver(dc);  // attach onmessage BEFORE awaiting open
          await peer.awaitOpen();
        } catch (e) {
          stage.querySelector('#offer-status').textContent = 'Errore: ' + e.message;
        }
      });
      stage.querySelector('#copy-answer').addEventListener('click', () => {
        stage.querySelector('#answer-text').select();
        document.execCommand('copy');
      });
    } else {
      stage.innerHTML = `
        <div class="card scanner">
          <h3>1. Inquadra il QR del mittente</h3>
          <video id="scan-video" muted></video>
          <p id="scan-progress" class="muted">In attesa…</p>
        </div>
        <div class="card qr-container" id="answer-card" style="display:none">
          <h3>2. Mostra al mittente</h3>
          <canvas id="answer-qr"></canvas>
          <p class="muted" id="answer-info"></p>
        </div>
        <div class="card" id="progress-card" style="display:none">
          <h3>${t.receive_progress}</h3>
          <div class="progress"><div id="bar" style="width:0%"></div></div>
          <p id="progress-label" class="muted">…</p>
        </div>
      `;
      const asm = new FrameAssembler();
      scanner = new QRScanner(stage.querySelector('#scan-video'), async (frame) => {
        const r = asm.ingest(frame);
        if (r?.progress) {
          stage.querySelector('#scan-progress').textContent = `Ricevuti ${r.progress.have}/${r.progress.total} frame`;
        } else if (r?.sdp) {
          stage.querySelector('#scan-progress').textContent = 'Offerta completa.';
          scanner.stop();
          const answer = await peer.createAnswer(r.sdp);
          const answerFrames = encodeSdpToFrames(answer);
          stage.querySelector('#answer-card').style.display = '';
          stage.querySelector('#answer-info').textContent = `${answerFrames.frames.length} frame, animati`;
          qrAnim = new AnimatedQR(stage.querySelector('#answer-qr'), answerFrames.frames, { fps: 3 });
          qrAnim.start();
          const dc = await peer.awaitDataChannel();
          attachReceiver(dc);  // attach onmessage BEFORE awaiting open
          await peer.awaitOpen();
        }
      });
      try { await scanner.start(); }
      catch (e) { stage.querySelector('#scan-progress').textContent = 'Camera non disponibile: ' + e.message; }
    }

    function attachReceiver(dc) {
      const card = stage.querySelector('#progress-card');
      card.style.display = '';
      const bar = stage.querySelector('#bar');
      const label = stage.querySelector('#progress-label');
      let metaSeen = null;
      const onMsg = makeReceiver({
        onMeta: (m) => { metaSeen = m; label.textContent = `Bundle: ${m.courseId} v${m.courseVersion}`; },
        onProgress: ({ seq, total }) => {
          const pct = Math.round(seq / total * 100);
          bar.style.width = pct + '%';
          label.textContent = `${seq}/${total} chunk · ${pct}%`;
        },
        onComplete: async ({ meta, blob }) => {
          label.textContent = 'Verifica e installazione…';
          try {
            const deviceId = await getDeviceId();
            const result = await installFromP2P({
              blob,
              parentLineage: meta.lineage,
              deviceId,
              fromDeviceId: meta.senderDeviceId
            });
            label.innerHTML = `<strong>${t.receive_done}</strong> Catena: ${result.entry.parentInstanceId ? '…→' : ''}${result.entry.instanceId.slice(0,8)}`;
            if (qrAnim) qrAnim.stop();
            try { dc.send(JSON.stringify({ type: 'ack', ok: true })); } catch (_) {}
          } catch (e) {
            label.textContent = 'Errore: ' + e.message;
          }
        },
        onError: (e) => { label.textContent = 'Errore: ' + e.message; }
      });
      dc.onmessage = onMsg;
    }
  });
}
