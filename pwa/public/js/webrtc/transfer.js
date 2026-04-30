// Send/receive a course bundle (Blob) + lineage metadata over an RTCDataChannel.
// Wire protocol — every packet is a JSON header line followed by an optional binary chunk:
//   { type:'meta', courseId, courseVersion, manifestSize, blobSize, lineage:[...], senderDeviceId }
//   { type:'manifest-chunk', seq, total }   (next message is binary)
//   { type:'bundle-chunk',   seq, total }   (next message is binary)
//   { type:'done' }
//   { type:'ack', ok:true }
// We send small text frames for headers and binary frames for payload; the receiver
// keeps a tiny state machine: after a header expecting binary, the next message is binary.

const CHUNK = 16 * 1024;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function sendBlob(dc, blob, headerType, extra = {}, onProgress) {
  const total = Math.ceil(blob.size / CHUNK);
  for (let seq = 0; seq < total; seq++) {
    // Backpressure
    while (dc.bufferedAmount > 1_000_000) await sleep(20);
    const slice = blob.slice(seq * CHUNK, (seq + 1) * CHUNK);
    const ab = await slice.arrayBuffer();
    dc.send(JSON.stringify({ type: headerType, seq, total, ...extra }));
    dc.send(ab);
    onProgress?.({ seq: seq + 1, total, bytes: (seq + 1) * CHUNK });
  }
}

export async function sendBundle(dc, { manifest, blob, lineage, senderDeviceId, onProgress }) {
  const meta = {
    type: 'meta',
    courseId: manifest.id,
    courseVersion: manifest.version,
    blobSize: blob.size,
    lineage,
    senderDeviceId
  };
  dc.send(JSON.stringify(meta));
  await sendBlob(dc, blob, 'bundle-chunk', {}, onProgress);
  dc.send(JSON.stringify({ type: 'done' }));
}

export function makeReceiver({ onMeta, onProgress, onComplete, onError }) {
  let meta = null;
  let chunks = [];
  let received = 0;
  let expectBinary = false;
  let currentHeader = null;

  return function onMessage(ev) {
    try {
      if (typeof ev.data === 'string') {
        const msg = JSON.parse(ev.data);
        if (msg.type === 'meta') {
          meta = msg;
          chunks = [];
          received = 0;
          onMeta?.(meta);
        } else if (msg.type === 'bundle-chunk') {
          currentHeader = msg;
          expectBinary = true;
        } else if (msg.type === 'done') {
          const blob = new Blob(chunks, { type: 'application/zip' });
          onComplete?.({ meta, blob });
        } else if (msg.type === 'ack') {
          // sender-side ack handled separately
        }
      } else {
        if (expectBinary && currentHeader) {
          chunks.push(ev.data);
          received += ev.data.byteLength;
          onProgress?.({ seq: currentHeader.seq + 1, total: currentHeader.total, bytes: received });
          expectBinary = false;
          currentHeader = null;
        }
      }
    } catch (e) {
      onError?.(e);
    }
  };
}
