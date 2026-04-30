# Foundation PoC — Demo & Verification

## What this demonstrates

A Progressive Web App that lets a phone:

1. Download an HTML courseware **bundle** from a catalog server when online.
2. Re-share that bundle phone-to-phone over **WebRTC** (signaling exchanged via
   QR codes — no signaling server required), without internet.
3. Run the courseware in a sandboxed iframe and capture **xAPI** statements
   (`experienced`, `progressed`, `answered`, `completed`) from the lessons.
4. Track a per-device **lineage chain** for every copy that propagates through
   the network.
5. Opportunistically upload accumulated lineage + statements to the server
   when connectivity returns, and aggregate them in a small **dashboard**.

## Run it

Requirements: Node 20+ on macOS / Linux / Windows.

```bash
npm install
npm start                    # → http://localhost:3000
```

Open in a Chromium-based browser:

| URL | What |
| --- | --- |
| `http://localhost:3000/pwa/` | The PWA itself |
| `http://localhost:3000/dashboard/` | Aggregated analytics |
| `http://localhost:3000/api/v1/catalog` | Raw catalog JSON |

## End-to-end demo on a single laptop

> Open the PWA in **two profiles** (or one regular window + one
> incognito window) so the two instances have independent IndexedDB +
> service workers. We'll call them **A** and **B**.

### 1 · A: download from catalog

1. Open profile **A** at `/pwa/` and accept the SW registration reload.
2. Tab **Catalogo** → click **Installa** on *Introduzione all'Informatica*.
3. Tab **I miei corsi** — the course is listed with the lineage chip
   `🌐 server`.
4. Tab **Diagnostica** — note the **ID dispositivo** and that **1 lineage**
   event is pending.

### 2 · A → B: peer-to-peer transfer (developer textarea mode)

The QR + camera flow needs a phone camera. On a single laptop, use the
**Modalità sviluppatore** toggle to copy/paste the SDP offer/answer instead.

1. **A** → tab **Condividi**.
2. Pick the course, tick **Modalità sviluppatore**, click **Mostra QR (offerta)**.
3. Copy the contents of the *Offerta* textarea.
4. **B** → tab **Ricevi**, tick **Modalità sviluppatore**, click **Scansiona QR (offerta)**.
5. Paste the offer into the *Incolla l'offerta* textarea, click **Genera risposta**.
6. Copy the contents of the *Risposta* textarea.
7. **A** → paste it into *Incolla qui la risposta…* and click **Invia bundle**.
8. **B**'s progress bar fills, then shows `Bundle ricevuto e installato`.
9. **B** → tab **I miei corsi**: the same course is listed, lineage chip now
   shows `🌐 server · ← <8-char id of A>`.

### 3 · QR mode (use a real phone)

1. Visit `http://<your laptop IP>:3000/pwa/` from a phone on the same LAN.
   - WebRTC + camera need a *secure context*, so for LAN use, run behind
     `mkcert` + a small TLS proxy (out of scope for this PoC; on `localhost`
     the browser already treats the origin as secure).
2. On the laptop (sender) leave **Modalità sviluppatore** unchecked,
   click **Mostra QR (offerta)** — an animated QR plays.
3. On the phone (receiver) leave **Modalità sviluppatore** unchecked,
   click **Scansiona QR (offerta)** and point the camera at the laptop.
4. Once the offer is fully scanned, the phone displays its own animated QR
   (the answer). Point the laptop's webcam at it, or have the laptop
   user scan with a webcam.
5. The data channel opens and the bundle is transferred.

### 4 · B: complete a quiz, record xAPI

1. **B** → tab **I miei corsi** → **Apri**.
2. Click **Inizia → Vai al quiz**.
3. Answer all three questions and click **Invia**.
4. The **Statement registrati** counter at the bottom of the player view
   ticks up to ~8 (load + lesson views + 3 answered + 1 completed).

### 5 · Sync analytics back to the server

1. **B** → tab **Diagnostica** → **Sincronizza ora**.
2. Same on **A** (the lineage entry from step 1 is also pending there).

### 6 · Inspect the dashboard

`http://localhost:3000/dashboard/` shows:

- **Corsi**: a row per course with **Copie** (distinct instance ids),
  **Dispositivi**, and **Statement** counts.
- Selecting the course reveals:
  - The **catena di propagazione** rendered as an SVG tree:
    `🌐 server` root → instance held by A → instance held by B.
  - A bar chart of xAPI verb counts.
  - The most recent statements with verb / object / device.

### 7 · Offline test

1. In **B**'s DevTools, set network throttling to **Offline**.
2. Replay the course (the bundle is in IndexedDB; the courseware is served
   by the SW from the local Cache).
3. Watch new statements pile up in **Diagnostica** with `⏳ in attesa`.
4. Restore network — `sync.js` listens to the `online` event and uploads
   automatically. Refresh the dashboard.

## Architecture quick map

```
server/
  index.js                     Express bootstrap, serves /api/v1, /pwa, /dashboard
  bundle-builder.js            Zips server/courses/<id>/ into .zip + manifest
  db.js                        SQLite schema (devices, courses, lineage_events, xapi_statements)
  routes/{catalog,download,ingest,dashboard}.js
  courses/sample-cs101/        Demo course (HTML + xapi-bridge.js)
  public/dashboard/            Static HTML/JS/CSS for the analytics dashboard

pwa/public/
  index.html, sw.js, manifest.webmanifest, icons/, css/, vendor/
  js/storage.js                IndexedDB wrapper (bundles, instances, statements, outbox)
  js/bundle.js                 Download / install / hash-verify / record lineage
  js/lineage.js                Build server-download or P2P-receive entries
  js/sync.js                   Opportunistic upload to /api/v1/ingest
  js/courseware/runner.js      Extract bundle into a per-instance Cache served via SW
  js/courseware/xapi-collector.js  postMessage → IndexedDB
  js/qr/{encoder,scanner}.js   Animated QR (qrcode-generator) + scanner (jsQR)
  js/webrtc/peer.js            RTCPeerConnection wrapper, non-trickle ICE
  js/webrtc/transfer.js        Chunked Blob send/receive over RTCDataChannel
  js/webrtc/signaling-qr.js    gzip + base64 + chunked frames for SDP-over-QR
  js/ui/views-*.js             Catalog, Library, Share, Receive, Player, Diagnostics

shared/
  schemas/                     JSON Schemas (manifest, lineage entry, xAPI, ingest)
  constants.js                 Verb whitelist + protocol constants
```

## Known limitations / production hardening

- **No authentication** on `POST /api/v1/ingest`. Add a per-device token before
  any production deployment.
- **`allow-same-origin` in the iframe sandbox** is required so the courseware
  iframe is controlled by the host's service worker. The bundle is hash-verified
  before it ever runs, but a stricter deployment should serve courseware from
  a separate sub-origin (e.g. `course.example.com`).
- **Clock skew on `sharedAt`**: lineage uses sender's local clock; mostly fine
  for ordering within a tree but not safe for cross-device global ordering.
- **STUN-only WebRTC**: works on the same LAN or with public addresses;
  symmetric NAT requires a TURN server (intentionally out of scope).
- **QR payload limit**: SDP up to ~3 KB compresses to ~600–800 bytes which fits
  one QR frame. For very large SDPs (lots of ICE candidates), the encoder
  splits across multiple animated frames automatically.
- **Course bundles in IndexedDB** are stored as `Blob` — Chromium and Firefox
  store the underlying bytes efficiently; iOS Safari has historically been
  flakier with large blobs in IndexedDB.

## Troubleshooting

| Symptom | Cause / Fix |
| --- | --- |
| `Service Worker non attivo` when opening a course | First visit registered the SW but didn't reload. Ctrl-R / Cmd-R the PWA. |
| `Camera non disponibile` in Share/Receive | Browser blocks `getUserMedia` on non-secure origins. Use `localhost` or HTTPS. |
| QR scanner times out at "Ricevuti N/M frame" | Receiver didn't see all frames — keep the codes in view a bit longer or use **Modalità sviluppatore**. |
| Dashboard shows 0 copies after a successful share | Both peers need to have synced (or at least one of them). Hit *Sincronizza ora* in **Diagnostica**. |
