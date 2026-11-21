# Research: SER1 — `Behaviour.enabled` must survive save, load, Instantiate and prefabs

One-line: a component switched off is saved as switched on, because nothing writes `enabled`. This
document fixes the facts and decides where `enabled` lives in the format; `plan.md` builds it.

**Date:** 2026-11-21 · **Status:** confirmed (decisions delegated to Claude, each with evidence) ·
**Base:** WebEngineTS `master` `c4a0119`; editor branch `B1-component-gizmos` `9c366f9` ·
**Still open:** nothing that blocks the build.

## 1. Facts

All paths are relative to `WebEngineTS/` unless named otherwise.

- **No serialized form.** `Behaviour._enabled` (`src/engine/core/Behaviour.ts:33`) has no `@SerializedField`. `grep -rn enabled src/engine/core/serialization/` finds nothing. So:
  - a disabled component reloads enabled;
  - `Instantiate` (save → load, `GameObject.ts:1297-1313`) enables every copy;
  - a prefab never records it.
- **The setter** (`Behaviour.ts:66-71`) returns early on no change. Otherwise it sets `_enabled` and runs `_onEnabledChanged()`, which fires `onEnable`/`onDisable` only on a real transition of `isActiveAndEnabled` (`_wasActiveAndEnabled` starts `false`).
- **Load order.**
  - `SceneSerializer._deserializeTree` builds the whole tree, applying fields through the setters (`_assign`, "a property with a setter is always assigned through it").
  - **Then** `_awakeLoaded` (`SceneSerializer.ts`, the "Runs `awake` and `onEnable` for everything a load built" pass) calls `GameObject._awakeComponent` for each component.
  - `_awakeComponent` (`GameObject.ts`):
    - runs `_systemAwake()` for a `ScriptableBehaviour` when the object is active, **whatever `enabled` is**;
    - runs `_onEnabledChanged()` only if `component.enabled`.
  - So a field write of `enabled = false` during load fires nothing, and the wake pass gives `awake` but no `onEnable`.
- **Field reflection.**
  - `getAllFields` (`src/engine/core/reflection/Decorators.ts:273-285`) walks the class chain base first and merges by name, so a field declared on `Behaviour` is applied first.
  - `@SerializedField` already decorates accessors (`MeshFilter.sharedMesh`).
  - `@HideInInspector()` exists (`Decorators.ts:256`).
  - The editor's inspector lists `getAllFields(...).filter(f => f.serialize && !f.hideInInspector)` (WebEngineTSEditor `app/src/app/panels/inspector/component-section.component.ts:365-366`).
- **Prefab overrides are per field.**
  - `PrefabOverride` = node + `component` type + `componentIndex`/`componentId` + `field` + `value` (`src/engine/core/serialization/PrefabOverride.ts:14-64`).
  - The diff walks **only the instance's keys** (`for (const field of Object.keys(comp.fields))`, :1454) and compares `original.fields[field]` with `PrefabDiff._equal`.
  - Apply is `target.fields[override.field] = override.value` (:534).
  - Added components are matched with `PrefabDiff._equal(there.fields, a.component.fields)` (:568).
  - GameObject-level `active` is already its own key, with `component: null` overrides.
- **Who is a Behaviour (37 subclasses):** every `ScriptableBehaviour`, `Renderer` (and so `MeshRenderer`), `Camera`, `Light`, `AudioSource`, `Collider` and its subclasses, `Rigidbody`. `PostEffect` is **not** one: it has its own serialized `enabled` (`PostEffect.ts:20-21`) and is untouched.
- **The editor is about to need it.** B1 (unmerged, `9c366f9`) adds `ViewportService.setComponentEnabled(...)`, which sets `comp.enabled`. Without SER1 the editor's switch is lost on save.
- **Static batching** disables its source renderers (`StaticBatchingUtility.ts:113-115`). Runtime only; see D-6.

## 2. Unity

Unity serializes `m_Enabled` in every Behaviour's data, beside its other properties. It is a prefab-overridable property like any other (`propertyPath: m_Enabled`). The inspector shows it as the header checkbox, not as a row. `MonoBehaviour.Awake` runs for a disabled component on an active GameObject, and `OnEnable` does not. (Scripting API `MonoBehaviour.Awake`, docs.unity.com, fetched 2026-11-21: "Unity calls Awake regardless of the value of Behaviour.enabled for the script component itself" and "Awake is called even if the script is a disabled component of an active GameObject.")

## 3. Decisions (binding)

**D-1 — `enabled` is an ordinary serialized field of `Behaviour`, hidden from the inspector field list.**
- Decorate the existing accessor: `@SerializedField({ type: FieldType.Boolean }) @HideInInspector() get enabled()`.
- It is written for every Behaviour, `true` or `false`, under `fields.enabled`.
- It is loaded through the setter during field application, before the wake pass, so a disabled component gets `awake` but no `onEnable`. That is Unity's order (§1, §2).
- Prefab overrides, `Instantiate` and link-mode files then carry it through the existing per-field machinery.
- **Rejected: a component-level key (`SerializedComponent.enabled`).** It would need new override, diff and apply code, and a second notion of "field" for the editor.
- **Rejected: writing it only when false.** The diff walks only the instance's keys, so an enabled instance of a prefab whose component is disabled would record no override and come back disabled.

**D-2 — Old files read as enabled, and do not churn prefab diffs.**
- A missing `fields.enabled` leaves the default `true`: the setter is never called. No format version bump: the structure is unchanged, and an older engine ignores the unknown field.
- In `PrefabDiff`, the prefab side's missing `enabled` on a Behaviour component counts as `true` at both comparison sites, the field loop (:1454) and the added-component match (:568). Otherwise every link-mode instance of a prefab saved before SER1 would grow a spurious `enabled: true` override.
- "Behaviour component" = `TypeRegistry.get(comp.type)` is a subclass of `Behaviour`. An unknown type is left as it is.

**D-3 — No inspector row.** `@HideInInspector()` keeps the inspector unchanged. The editor's switch is B1's own UI, which sets `comp.enabled` and is now saved. No editor change is needed for SER1.

**D-4 — `PostEffect.enabled` is untouched.** It is not a Behaviour, and its serialized field keeps working.

**D-5 — The lifecycle contract is pinned.** A disabled `ScriptableBehaviour` saved and loaded:
- gets `awake` once and `onEnable` zero times;
- switching it on after load fires `onEnable` once.

An enabled one is unchanged: `awake` then `onEnable`.

**D-6 — Out of scope.**
- Saving a scene during play after `StaticBatchingUtility.combine`: the sources are now saved disabled, while the batch mesh saves `null`. Batching is a runtime step, and the editor does not save play state.
- Unity's Rigidbody has no `enabled`. The engine's `Rigidbody` is a Behaviour; saving its flag is harmless.
