# A9 — Cut `v0.2.0`, the first real engine release

| | |
|---|---|
| Repo / branch | WebEngineTS |
| Model | **Sonnet** |
| Size | ½ day |
| Depends on | A1–A8 done and pushed, CI green; **owner decisions #1 and #2** (`OWNER-DECISIONS.md`) |
| Blocks | A10, A11 |

## Why

Every consumer runs `0.1.0-local.<timestamp>` packs. Such a stamp names nothing anyone can fetch or
look up, so a deployed platform cannot say which engine it serves, and per-scenario engine pinning is
impossible. `v0.2.0` is the first release a consumer can depend on by URL:
`https://github.com/HuGoxDP/WebEngineTS/releases/download/v0.2.0/WebEngineTS-0.2.0.tgz`.

## Read first

`README.md` → "Releasing" (the procedure; follow it exactly) and `.github/workflows/release.yml`
(what it refuses: a tag that is not `v` + `package.json` version, a version with no CHANGELOG
section, a non-empty `[Unreleased]`).

## Do

1. **Owner gate.** Do not tag unless `OWNER-DECISIONS.md` #1 (where the release commit lives —
   recommended: merge the claude branch into `main` first and tag on `main`) and #2 (cut it) are
   answered "yes" in that file or in the session by the owner.
2. On the commit to release: `npm version 0.2.0 --no-git-tag-version`.
3. `CHANGELOG.md`: rename `## [Unreleased]` to `## [0.2.0] - <today>` and open an empty
   `## [Unreleased]` above it. Add a short lead under `[0.2.0]`: "First release. Reads scene and
   prefab format versions 1 and 2 and refuses anything else; writes version 1 unless a file holds a
   prefab link." Check: `node scripts/changelog-section.mjs --require-empty-unreleased 0.2.0`.
4. Commit `package.json`, `package-lock.json`, `CHANGELOG.md` as `chore(release): v0.2.0`; push;
   wait for CI green on that commit.
5. `git tag -a v0.2.0 -m "WebEngineTS v0.2.0"` and `git push origin v0.2.0`.
6. Watch the release workflow. When it finishes, check the release has the five assets
   (`WebEngineTS-0.2.0.tgz`, `WebEngineTS.standalone.js`, `WebEngineTS.d.ts`,
   `basis_transcoder.js`, `basis_transcoder.wasm`) and that the tgz installs without a token:
   `mkdir /tmp/r && cd /tmp/r && npm init -y && npm install <the tgz URL>` and
   `node -e "import('WebEngineTS').then(m => console.log(m.BuildInfo.version))"` (or read
   `node_modules/WebEngineTS/package.json`).
7. Update the shared notes: `PLAN.md` §1.2 (step 6 done), `CHANGELOG.md` (WebEngineTS section: "v0.2.0
   released"), `ECOSYSTEM.md` "Getting an engine change into a consumer" (deployed consumers pin the
   release URL; `release:local` is for development).

## If the workflow refuses the tag

Delete it (`git push --delete origin v0.2.0 && git tag -d v0.2.0`), fix the commit, tag again — the
README describes this; a refused tag publishes nothing.

## Acceptance

The GitHub Release `v0.2.0` exists with its notes = the `[0.2.0]` section and the five assets; the
tgz installs anonymously; `BuildInfo.version` in it is `0.2.0`.

## Report back

Release URL, asset list with sizes, the install check output.
