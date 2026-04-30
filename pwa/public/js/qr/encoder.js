// Animated QR encoder: rotates through frames on a canvas at a fixed FPS.
// Uses qrcode-generator (global `qrcode`).

const qrcodeLib = globalThis.qrcode;

function renderToCanvas(canvas, text, modulesPx = 6) {
  // Try increasing typeNumbers until it fits with low ECC.
  let qr = null;
  for (let t = 4; t <= 40; t++) {
    try {
      const candidate = qrcodeLib(t, 'L');
      candidate.addData(text);
      candidate.make();
      qr = candidate;
      break;
    } catch (e) { /* too small, try bigger */ }
  }
  if (!qr) throw new Error('QR payload troppo grande');

  const count = qr.getModuleCount();
  const size = count * modulesPx;
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = '#000';
  for (let r = 0; r < count; r++) {
    for (let c = 0; c < count; c++) {
      if (qr.isDark(r, c)) {
        ctx.fillRect(c * modulesPx, r * modulesPx, modulesPx, modulesPx);
      }
    }
  }
  return { count };
}

export class AnimatedQR {
  constructor(canvas, frames, { fps = 3 } = {}) {
    this.canvas = canvas;
    this.frames = frames;
    this.fps = fps;
    this.timer = null;
    this.idx = 0;
  }
  start() {
    if (this.timer) return;
    const tick = () => {
      const frame = this.frames[this.idx % this.frames.length];
      renderToCanvas(this.canvas, frame);
      this.idx++;
    };
    tick();
    this.timer = setInterval(tick, Math.max(50, 1000 / this.fps));
  }
  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
  setFrames(frames) {
    this.frames = frames;
    this.idx = 0;
  }
}
