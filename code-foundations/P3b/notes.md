# P3b — the browser-level proof of the pre-compressed serving (notes)

Worker **W3**, 2026-11-11. Branch `P3b-browser-compression-proof` in virtual-lab + .claude-shared.
Closes the open question left by P3 (`code-foundations/P3/notes.md`).

## The answer

The P3 "browser anomaly" was **not a serving bug** — it was the test harness:

- An in-page `fetch` under Playwright sends **no `Accept-Encoding` header at all**
  (captured on the wire: the request leaves without it), so nginx's identity answer is the
  correct one and proves nothing either way.
- Playwright's `request` context sends `Accept-Encoding: gzip` but **decompresses
  transparently** and strips `Content-Encoding` — both requests report 1,516,574 bytes.

Neither path can see the wire, which is what P3 changed. A raw `node:http` request can.

## What landed

`e2e/tests/compression.spec.ts` — the wire-level spec: `Content-Encoding: gzip` +
at least 2:1 smaller + `gunzip(body)` equals the identity body byte for byte
(`node:zlib`). Runs without a browser and without catalog content (the suite's
global-setup gate is the only thing it needs beyond the stack's health endpoint).

Verified: 3/3 green against a container built from this branch, through a temporary
local Playwright config (not committed, no artifacts left).

## What it deliberately does not claim

It cannot tell build-time `gzip -9` from nginx's on-the-fly gzip — both answer
`Content-Encoding: gzip`, and only the byte count (and the per-request CPU) differ.
The before/after measurement of that difference stays in the P3 notes
(473,875 → 393,306 bytes, −17%).
