# Phase E — growth lanes (after Phase A; run beside the editor milestones)

Each item names its model, size and the condition to start. Write a full card (A-style) when one is
picked up; the bullets here are the card's *Do* outline. Reasons and sources: the vision document,
sections "Движок", "Каталог и облако", "Производительность".

---

## Platform lane (virtual-lab)

**P1 — LTI 1.3 for Moodle** *(Opus design → Sonnet; ~2 weeks; after B5 player isolation)*
- Backend as an LTI 1.3 tool (`ltijs` or a minimal OIDC + JWT implementation; decide with evidence of
  maintenance status). Dynamic Registration (Moodle adds the tool from one URL); Deep Linking (the
  teacher picks a scenario, the link pins the **archive sha256**, not the row); launch opens the player.
- Grades (AGS): needs an engine API for a scenario to report a result — design it with the engine owner
  (e.g. `ScenarioBehaviour.reportResult({ score: 0..1, completed })`), carried player → viewer by
  `postMessage`, then backend → AGS. Names and Roles only if a teacher view needs it.
- Safari: no third-party cookies → LTI Platform Storage (`lti.put_data`/`get_data` via postMessage),
  cookie fallback where the LMS lacks it.
- Privacy: store the LMS `sub` and context id, no names or emails unless a feature needs them;
  retention period; deletion on request. Write it into `docs/privacy.md`.

**P2 — Offline lessons** *(Sonnet; ~1 week; after A10)*
Cache-first Service Worker over `/scenarios/<sha256>.zip` and `/engine/<version>/…` (both immutable);
a "Підготувати урок" action that pre-caches chosen scenarios; `navigator.storage.persist()`; a web app
manifest so a school can install the viewer. Test in Safari: data is wiped after 7 days without a
visit; cross-origin frames get ~1/10 quota (relevant with B5's player origin — cache in the origin that
loads the archive).

**P3 — Brotli** *(Sonnet; ½ day)* Pre-compress `.js`/`.wasm`/`.json` at image build (`brotli -k`, `gzip
-k`) and serve with `gzip_static`/`brotli_static` (or the `ngx_brotli` module); measure the engine
bundle over the wire before/after.

**P4 — Per-scenario engine pinning** *(Sonnet; ~1 week; after B5)* Keep every engine version a
published row needs under `/engine/<version>/` with its `player.html`; the row records the engine its
archive was built for (`manifest.engineVersion` → nearest released minor); the viewer loads that
player. GC counts engine versions like archives.

**P5 — Backups and HTTPS** *(Sonnet + owner; 1–2 days)* A backup container: nightly `pg_dump` and a copy
of the archives and assets volumes, kept N days off the host; a written restore procedure **actually
run once** on a scratch stack. TLS on the production host (Caddy or certbot) — the editor's folder
access and publish keys need HTTPS. Server access is the owner's.

**P6 — Catalog covers** *(Sonnet; ½ day)* `image_url` for the ten production rows: screenshots taken
with `WebEngineTS/scripts/shoot.mjs`, stored content-addressed like archives.

**P7 — Confirm G2** *(Sonnet; ½ day)* Re-run `e2e/tests/streaming.spec.ts` printing `liveTextures` and
`textures`; expected: `liveTextures` differs, `textures` matches. Update `ENGINE-GAPS.md` G2.

---

## Engine lane (WebEngineTS)

**N1 — KTX2 without `'unsafe-eval'`** *(Sonnet; 2–3 days)* Rebuild `basis_transcoder.js/.wasm` from
Basis Universal v2.x with Emscripten `-sDYNAMIC_EXECUTION=0 -sEMBIND_AOT` (no `new Function`); ship it
in the release assets instead of three's copy; the platform's CSP then needs only `'wasm-unsafe-eval'`
(update `nginx/csp.conf` and the CSP test that pins "no unsafe-eval"). Measured win: Benchscene3
texture VRAM 200 → 69.3 MB with KTX2.

**N2 — meshopt and KTX2 inside glTF** *(Sonnet; 1–2 days; after N1)* `ScenarioAssets` builds a bare
`GLTFLoader`: add `setMeshoptDecoder` and `setKTX2Loader` (Draco only if a content need appears — its
npm package has had no release since 2024-01). Then lift ScenarioCreator's rule 5 and add a `gltfpack`
step (`-cc` meshopt, `-tc` KTX2) to its builder.

**N3 — Rapier behind the physics API** *(Opus design → Sonnet; spike 3 days, then ~2 weeks)* cannon-es
has had no release since 2022-08. Spike: the benchmark harness on two physics-heavy scenes, cannon-es vs
`@dimforge/rapier3d-compat` (deterministic build), CPU ms/frame and bundle size. Only if it wins: a
backend switch under `Rigidbody`/`Collider`/`Joint` with the same public API; serialized fields shaped
after the `KHR_physics_rigid_bodies` / `KHR_collision_shapes` drafts. Avoid Jolt's multithreaded build
(needs cross-origin isolation, impossible inside an LMS iframe).

**N4 — Render adapter stage 1 → WebGPU** *(Opus; weeks)* `design/render-adapter-plan.md` stage 1
(resource handles) done whole, never in fragments. Then `WebGPURenderer` (it falls back to WebGL2 by
itself): port every `ShaderMaterial`, `onBeforeCompile` and post-processing pass to TSL; pin three's
version (its WebGPU API breaks almost every release). WebGL2 stays the default until WebGPU covers the
students' devices (missing on most Linux, Firefox Android, Intel Macs).

**N5 — Accessibility** *(Opus design → Sonnet; ~2 weeks)* A hidden DOM twin of the Canvas UI: each
`Selectable` (Button, Slider, Toggle, Dropdown, InputField, Scrollbar) mirrored by a native element
that screen readers and keyboards use, kept in sync by `EventSystem` focus/navigation (already exist);
an accessible name on `GameObject`; `ariaNotify` with a live-region fallback for state changes;
single-pointer alternatives for drags (WCAG 2.2 SC 2.5.7). Procurement needs it (DSTU EN 301 549; ADA
Title II deadlines 2027–2028).

**N6 — UV convention C3 / G4** *(Opus; after a visual harness)* `design/unity-coordinates-plan.md`;
changes every texture's orientation, so only with `design/coordinate-check/` run by eye.

**N7 — Canvas UI stage 1** *(Sonnet; when the editor's UI tools are scheduled)* Layout dirty flags →
rotation/scale → layout groups (`design/canvas-ui-roadmap.md`).

---

## Editor lane (WebEngineTSEditor)

**R1 — A project store outside Chromium** *(Opus design → Sonnet; ~1–2 weeks; decide before the first
real authors)* `showDirectoryPicker` exists only in Chrome/Edge. Add OPFS (all browsers) or a server
store on the platform, behind the same project-service interface; the folder on disk stays for authors
who keep projects in git. The server store is also what share links and co-editing need.

**R2 — Angular 19 → 21, zoneless** *(Sonnet; 2–3 days)* Align with the platform (signals, no zone.js);
the platform's `CLAUDE.md` "Angular conventions" is the target.

**R3 — Redeploy the editor container; hand-check the native folder picker once** *(owner + Sonnet)*

**R4 — Realtime co-editing** *(Opus; later, after R1 and D3)* Server-ordered, per-field last-writer-wins
keyed by stable object and component ids (Figma's model), reusing D3's command machinery. Not OT, not a
CRDT.

---

## Content lane (ScenarioCreator)

- **G2 fix**: stop shipping the redundant loose albedo textures for planets that have a `.glb`, or mark
  them `Lazy` in the manifest (`PLAN.md` §4.2). Sonnet, ½ day.
- **LOD texture variants' VRAM saving** — measure on a real GPU with the benchmark harness (owner's
  hardware).
- **DNA right-handedness and orbit direction** — a human looks (`PLAN.md` §1.1).
- **AtomStructure shows ~36 of 118 elements** — scope decision (owner).
