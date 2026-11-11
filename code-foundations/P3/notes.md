# P3 — pre-compressed static assets (notes)

Worker **W3**, 2026-11-11. Branch `P3-brotli-precompression` in virtual-lab + .claude-shared.
Row: **P3** (M2). Card: `tasks/E-growth.md` P3 — *"Pre-compress `.js`/`.wasm`/`.json` at image build
(`brotli -k`, `gzip -k`) and serve with `gzip_static`/`brotli_static` (or the `ngx_brotli`
module); measure the engine bundle over the wire before/after."*

## What landed (virtual-lab)

- `feat(lab): serve the static assets pre-compressed (P3)` (`0f638d1`):
  - `Dockerfile.frontend` (stage 2) runs `gzip -9 -k` over the static text assets the image ships
    (js/css/json/html/wasm), keeping the originals, which is how nginx's `gzip_static` finds a
    sibling `.gz`.
  - `nginx/nginx.conf` turns `gzip_static on`, next to the existing on-the-fly `gzip on` (the
    content-addressed archives and manifests that arrive at run time have no `.gz` sibling, so
    they keep the on-the-fly path).

## The measurement (over the wire, same machine)

Engine bundle `/assets/WebEngineTS.standalone.js` — the biggest immutable file the stack serves,
the one the player and the editor both pay for:

| | identity request | with `Accept-Encoding: gzip` |
|---|---|---|
| before (on-the-fly gzip) | 1,510,957 bytes | **473,875 bytes**, `Content-Encoding: gzip` |
| after (gzip -9 pre-compressed) | 1,516,574 bytes¹ | **393,306 bytes**, `Content-Encoding: gzip` |

¹ the bundle on `origin/main` was re-packed by another worker between the two measurements; the
compression comparison is level-vs-level, not content-vs-content.

**−80,569 bytes (−17%)** on the transfer. `gunzip` of the compressed body equals the identity
body byte for byte (sha-compared), and the identity request is unchanged.

## Brotli: not here (decision, with evidence)

`brotli_static` needs the `ngx_brotli` module, which the stock `nginx:alpine` image does not
carry (`nginx -V` in the image: no `--with-http_brotli`), and building a custom image for it is
a build-toolchain change of its own. The card offers the choice ("`gzip_static`/`brotli_static`
… or the module"); `gzip_static` is the half that ships with the stock image and covers every
agent that speaks `Accept-Encoding`. If brotli is wanted, it is a follow-up (a custom nginx
image or a CDN in front), not a one-liner.

## Open question (why there is no browser-level spec yet)

The wire behaviour is proven with `curl` (the ground truth for what nginx serves). An e2e spec
written the obvious way — Playwright's `request.get` and reading `content-encoding` — cannot
observe it: Playwright's fetch decompresses transparently (the header is stripped and the body
arrives inflated). Rewritten against the in-page `fetch` + resource timing, a real Chromium
still reports the identity bytes for the bundle (no `Content-Encoding`, full size) even with an
explicit `Accept-Encoding: gzip` header — while curl with the identical header gets the
pre-compressed file from the same URL in the same container. That discrepancy is unexplained at
the time of writing, so the spec was **not committed** (a test that cannot pass, or that passes
for the wrong reason, is worse than no test) and it is the first thing the follow-up should
settle — see the new ROADMAP row **P3b**.

## Checks

- No repo check gates on this change (the platform's check list is the backend unit + Docker DB
  suite; the browser e2e is explicitly "not a per-PR CI gate"). Both suites are green on this
  tree (288 unit / 1487 against the test DB, run for P5a on the same tree before this branch
  was cut from it).
- `docker build` of the frontend image with the new step succeeds; the compression step runs
  in ~1 s.
