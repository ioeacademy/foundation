# Foundation

Proof of Concept: peer-to-peer sharing of HTML courseware bundles between
phones, with provenance tracking and opportunistic xAPI analytics sync.
Built for offline / low-connectivity learning scenarios.

```bash
npm install
npm start                     # → http://localhost:3000
```

| URL | What |
| --- | --- |
| `/pwa/` | The installable PWA (run on two profiles to demo P2P) |
| `/dashboard/` | Aggregated lineage tree + xAPI charts |
| `/api/v1/catalog` | Catalog JSON consumed by the PWA |

End-to-end demo and architecture overview: [`docs/DEMO.md`](docs/DEMO.md).
