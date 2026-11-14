# Claude review of C4 — the bundled engine and the script import rewrite (2026-11-14)

Read in W1's worktree **before its commit**: `WebEngineTSEditor` on `C4-editor-scripts-and-library`
(`a581a85` + the uncommitted tree at 2026-11-14T19:10Z), which removes the committed engine copy,
the import map and `externalDependencies` (C4r1, and the C4r3 boot cost), bundles the engine again,
publishes the app's engine namespace on `globalThis.__wetsEngine`, rewrites a script's
`"WebEngineTS"` imports into reads of that global (`rewriteEngineImports`), and imports only the
modules whose compiled code changed (`_loaded`).

The direction is right: one engine instance, nothing committed that `release:local` cannot refresh,
and no module waterfall on boot. Four defects in the new code, each reproduced with the function
copied verbatim into Node (`.workers/C/scratch/pass/rw.mjs`).

## F1. The import regex spans statements — a script that imports a sibling first does not load

`ENGINE_IMPORT_RE = /(import|export)\s+([\s\S]*?)(?:\s+from\s+)?(["'])(WebEngineTS)\3/g`.
The lazy `[\s\S]*?` starts at the **first** `import`/`export` in the file and runs on to the first
`"WebEngineTS"`, across any statements in between. The clause it captures is then not a binding
list, no binding matches, and the fallback `full.replace(target, "undefined")` emits invalid code.

Input (after the relative imports were already relinked):

```js
import { Stats } from "blob:http://x/1";
import { MonoBehaviour } from "WebEngineTS";
```

Output: `import { MonoBehaviour } from undefined;` — a SyntaxError, so the module fails to import and
the script's component is "Missing" in the editor. The same happens when a comment before the engine
import contains the word `import` or `export` (`// import order matters` → same output). Import
order is the author's choice and TypeScript does not sort imports, so this hits ordinary projects.

## F2. Default and `export *` forms are wrong

- `import WebEngine from "WebEngineTS"` → `const { WebEngine } = globalThis.__wetsEngine` →
  `undefined`. The engine's documented dual export (`WebEngineTS/CLAUDE.md`, "Dual Export
  Pattern") is a **default** namespace export; it is `globalThis.__wetsEngine.default`.
  `import WebEngine, { Vector3 } from "WebEngineTS"` gets the same wrong `WebEngine`.
- `export * from "WebEngineTS"` → `export * from undefined;` (SyntaxError).
- `import("WebEngineTS")` (dynamic) is not handled at all: a bare specifier inside a Blob module
  cannot resolve, so it throws at run time.

**Suggested shape** (fixes F1 and F2 together, and stays identical to the platform): build **one**
shim module per page load — a Blob URL whose source is
`const e = globalThis.__wetsEngine; export const { <every key of the namespace except default> } = e; export default e.default;`
(the key list from `Object.keys(engine)`) — and rewrite the bare specifier to that URL with the
engine's own token regex (`Scenario.ts:61`, `_ENGINE_IMPORT_RE`:
`/(?<![\w$.])(from\s*|import\s*\(?\s*)(["'])WebEngineTS\2/g`). Every import and export form,
default, namespace, `export *` and dynamic `import()` then works by construction, because the
browser does the binding, and the editor and the player share one rewrite rule.

## F3. Editing a module does not reach the modules that import it

`fresh` holds only the modules whose **own** compiled code changed (`script-runtime.service.ts`
~line 116), and only `fresh` is imported. With `Enemy.ts` importing `{ Base } from "./Base"`:
edit `Base.ts` → `Base` is re-imported and re-registered; `Enemy`'s code is unchanged, so `Enemy` is
not imported, and the registered `Enemy` class still extends the **old** `Base` (its old Blob URL).
The scene rebuild then instantiates an `Enemy` that ignores the edit until `Enemy.ts` itself is
edited or the page reloads. Same for a helper function or a constant module.

`fresh` must be closed under reverse dependencies: after `deps` is built, add every module that
reaches a fresh module through `deps`, transitively.

## F4. An unchanged dependency is evaluated again anyway

Every pass relinks **every** compiled module to a **new** Blob URL (the topological loop calls
`relink` for all of `compiled`). So when `Enemy` is fresh and `Base` is not, `Enemy`'s new Blob
imports `Base`'s new Blob URL — a URL the module map has never seen — and `Base` is evaluated again:
a second `Base` class is minted and its `@Serializable` decorator re-registers it, which is exactly
what the `_loaded` cache says it avoids, and `_classes`/`changed` never see it.

Keep the Blob URL of a module whose code **and** dependency closure are unchanged (store it beside
`_loaded`) and link fresh modules against it; revoke a URL only when its module is replaced or
leaves the project.

## Tests the fix needs (none exist yet in the tree)

- Unit, `rewriteEngineImports` (or the shim): sibling-first, comment-first, default, default + named,
  namespace, `export * from`, `export { X } from`, dynamic `import()`; each output must parse
  (`new Function` on a module-stripped body is not enough — import the Blob in the e2e, or parse
  with Babel in the unit test).
- e2e: a project with `Base.ts` + `Enemy.ts extends Base`; edit a method of `Base`, save, the
  `Enemy` component's behaviour/inspector shows the edit without touching `Enemy.ts` (fails on the
  current tree, F3).
- e2e or unit: edit `Enemy.ts` only — `Base`'s class object identity in `TypeRegistry` is unchanged
  (fails on the current tree, F4).
