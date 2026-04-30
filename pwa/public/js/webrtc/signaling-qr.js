// Compress + chunk SDP into framed strings suitable for QR encoding (or copy-paste).
// Frame format: FND|<sessionId>|<idx>|<total>|<base64chunk>

const pako = globalThis.pako;
const CHUNK = 800; // chars per QR frame (fits comfortably in QR v20 alphanumeric)

function b64UrlEncode(uint8) {
  let bin = '';
  for (let i = 0; i < uint8.length; i++) bin += String.fromCharCode(uint8[i]);
  return btoa(bin).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

function b64UrlDecode(str) {
  const pad = (4 - (str.length % 4)) % 4;
  const norm = str.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat(pad);
  const bin = atob(norm);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function uuidShort() {
  return Math.random().toString(36).slice(2, 8);
}

export function encodeSdpToFrames(sdpObj) {
  const json = JSON.stringify({ type: sdpObj.type, sdp: sdpObj.sdp });
  const compressed = pako.deflate(new TextEncoder().encode(json), { level: 9 });
  const b64 = b64UrlEncode(compressed);
  const sessionId = uuidShort();
  const total = Math.ceil(b64.length / CHUNK) || 1;
  const frames = [];
  for (let i = 0; i < total; i++) {
    const slice = b64.slice(i * CHUNK, (i + 1) * CHUNK);
    frames.push(`FND|${sessionId}|${i}|${total}|${slice}`);
  }
  return { sessionId, frames, totalBytes: compressed.length };
}

export function parseFrame(s) {
  if (typeof s !== 'string' || !s.startsWith('FND|')) return null;
  const parts = s.split('|');
  if (parts.length < 5) return null;
  const [, sessionId, idxStr, totalStr, ...rest] = parts;
  const chunk = rest.join('|');
  const idx = Number(idxStr);
  const total = Number(totalStr);
  if (!Number.isFinite(idx) || !Number.isFinite(total) || total <= 0) return null;
  return { sessionId, idx, total, chunk };
}

export class FrameAssembler {
  constructor() {
    this.sessions = new Map(); // sessionId -> { total, chunks: Map<idx, chunk> }
    this.completedSessions = new Set();
  }

  ingest(frameStr) {
    const f = parseFrame(frameStr);
    if (!f) return null;
    if (this.completedSessions.has(f.sessionId)) return null;
    let s = this.sessions.get(f.sessionId);
    if (!s) {
      s = { total: f.total, chunks: new Map() };
      this.sessions.set(f.sessionId, s);
    }
    s.chunks.set(f.idx, f.chunk);
    if (s.chunks.size === s.total) {
      const ordered = [];
      for (let i = 0; i < s.total; i++) {
        if (!s.chunks.has(i)) return { progress: { sessionId: f.sessionId, have: s.chunks.size, total: s.total } };
        ordered.push(s.chunks.get(i));
      }
      const b64 = ordered.join('');
      const inflated = pako.inflate(b64UrlDecode(b64));
      const json = new TextDecoder().decode(inflated);
      const sdpObj = JSON.parse(json);
      this.completedSessions.add(f.sessionId);
      this.sessions.delete(f.sessionId);
      return { sdp: sdpObj, sessionId: f.sessionId };
    }
    return { progress: { sessionId: f.sessionId, have: s.chunks.size, total: s.total } };
  }
}
