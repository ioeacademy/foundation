// QR scanner — opens camera, runs jsQR on each frame, fires onFrame for each unique decoded string.
const jsQR = globalThis.jsQR;

export class QRScanner {
  constructor(videoEl, onFrame) {
    this.video = videoEl;
    this.onFrame = onFrame;
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
    this.stream = null;
    this.running = false;
    this.recent = new Set();
  }

  async start() {
    this.stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' } },
      audio: false
    });
    this.video.srcObject = this.stream;
    this.video.setAttribute('playsinline', 'true');
    await this.video.play();
    this.running = true;
    this._loop();
  }

  _loop() {
    if (!this.running) return;
    const v = this.video;
    if (v.readyState >= 2 && v.videoWidth > 0) {
      const w = v.videoWidth, h = v.videoHeight;
      this.canvas.width = w; this.canvas.height = h;
      this.ctx.drawImage(v, 0, 0, w, h);
      const img = this.ctx.getImageData(0, 0, w, h);
      const code = jsQR(img.data, img.width, img.height, { inversionAttempts: 'attemptBoth' });
      if (code && code.data) {
        if (!this.recent.has(code.data)) {
          this.recent.add(code.data);
          // Cap memory: forget after a while
          if (this.recent.size > 256) {
            const it = this.recent.values();
            for (let i = 0; i < 64; i++) this.recent.delete(it.next().value);
          }
          this.onFrame(code.data);
        }
      }
    }
    requestAnimationFrame(() => this._loop());
  }

  stop() {
    this.running = false;
    if (this.stream) {
      for (const t of this.stream.getTracks()) t.stop();
      this.stream = null;
    }
  }
}
