# A7 — Backfill the engine CHANGELOG before the first release

| | |
|---|---|
| Repo / branch | WebEngineTS · `claude/scenario-platform-architecture-24f9fy` |
| Model | **Sonnet** |
| Size | ½ day |
| Depends on | A1–A6 landed (so their entries are already in `[Unreleased]`) |
| Blocks | A9 |

## Why

`CHANGELOG.md [Unreleased]` becomes the `v0.2.0` release notes (release.yml publishes that section).
It covers prefab instances/link mode, variants, `Texture.flipVertically`, `Cubemap.fromEquirectangular`
(Texture2D), diagnostics additions, D1–D3, the primitive winding / UV2 / colour-space fixes. It has
**nothing** on a month of shipped work. `release.yml` only checks that a section exists and that
`[Unreleased]` is empty, not that it is complete.

## Read first

- `CHANGELOG.md` — the header rules (lines 1–16: *Changed* for anything that moves a measured
  number; consumer-facing wording) and the whole `[Unreleased]` section, to match its style.
- The commits to cover, with `git show --stat <sha>` and the commit message (the messages are
  detailed; the diff is for checking claims):

| Commit | Date | What |
|---|---|---|
| `6ae2ac3` | 2026-09-10 | the last six components a saved scene was dropping |
| `a0e9127` | 2026-09-10 | curves, gradients and bursts survive a save |
| `bde23fc` | 2026-10-10 | E3 — meshes, materials and textures inside a model have ids |
| `7e69f88` | 2026-10-10 | E5 — materials, physic materials and prefabs as files with ids |
| `208c381` | 2026-10-10 | E6 unknown components kept (`MissingComponent`), E7 sibling and component order, E10 scene environment (`RenderSettings`) |
| `533ed95` | 2026-10-10 | E13 — Cinemachine and post-processing are scene data |

- `git log --oneline 0.1.0-baseline..HEAD` is not available (no tags); list everything since the last
  CHANGELOG-covered change instead: `git log --since=2026-09-05 --oneline --no-merges` and check each
  `feat`/`fix` against `[Unreleased]`. Anything user-visible that is missing gets an entry.

## Do

1. For each missing change: one bullet under *Added*, *Changed* or *Fixed*, written for a consumer
   (what they can now do or what behaves differently), naming the public API. One to three lines.
2. Anything that changes saved files or rendered output goes under *Changed* and says so (e.g. E7
   writes sibling/component order; E10 writes `renderSettings` into scenes; E13 writes Cinemachine and
   post-processing data).
3. Keep entries grouped as the file already groups them; no dates inside `[Unreleased]`.
4. Do not touch `[0.1.0]`.

## Acceptance

`node scripts/changelog-section.mjs Unreleased` (or the script's equivalent; read it) prints the
section without errors; every commit in the table above is represented; a reviewer can map each
bullet to a commit.

## Commits

`docs(changelog): record E3, E5, E6, E7, E10, E13 and the September serializer fixes`.

## Report back

The list of commits checked and which bullet covers each (or why none is needed).
