# A5 — the component-id format as it landed

Produced by running the writers (A5 Phase 2/3, engine `c82766b`), not written by hand: a
prefab whose `Hull` holds two `Tag`s ("first", "second"); an instance that removes the first,
overrides the surviving one, and is referenced by a `Part` on a `Player` of its own. The
prefab itself edits its second Tag's `label`; the instance's own value wins where it set one
and follows the edit where it did not.

## Where the ids appear

| Field | Where | Rule |
|---|---|---|
| `SerializedComponent.id` | prefab trees, link-mode instance interiors, prefab files | written only where the node itself has an `id` — never in a plain scene, which saves byte for byte as before |
| `ComponentRef.cid` | beside `component` + `index` | only in link passes, and only when the target node has an id; a ref to a plain-scene object or a `Transform` carries none |
| `PrefabOverride.componentId` | beside `component` + `componentIndex` | overrides only |
| `PrefabRemovedComponent.componentId` | beside `component` + `componentIndex` | removals only |
| an added component's `id` | inside `PrefabAddedComponent.component` | the instance's own, minted where the prefab's node already is |

A `cid` or `componentId` never makes a file version 2 by itself — it appears only where node
ids already do, and stripping every id changes nothing about what a file asks of its reader
(pinned by `tests/ComponentIdsFormat.test.ts`).

## The example, as the writer produces it

A link-mode instance — its prefab is `guid-doc`, its `Hull` node is `5glmp001`:

```json
{
  "guid": "guid-doc",
  "changes": {
    "overrides": [
      {
        "node": "5glmp001",
        "component": "FormatDoc.Tag",
        "componentIndex": 0,
        "componentId": "6bbiz003",
        "field": "label",
        "value": "mine"
      }
    ],
    "removedComponents": [
      {
        "node": "5glmp001",
        "component": "FormatDoc.Tag",
        "componentIndex": 0,
        "componentId": "9v13s002"
      }
    ]
  }
}
```

The removal names the prefab's first Tag by id (`9v13s002`, occurrence 0); the override names
the surviving second (`6bbiz003`). Both keep the readable `component` + `componentIndex` beside
the id, so a reader that knows nothing of ids reads the file exactly as it did before.

And the `ComponentRef` the `Player`'s `Part` carries, pointing into the instance's interior:

```json
{
  "$type": "ComponentRef",
  "path": [0, "5glmp001"],
  "component": "FormatDoc.Tag",
  "index": 0,
  "cid": "6bbiz003"
}
```

Its `path` names the node, its `cid` the component within it; the fallback beside it is the
same one as before. A file written before component ids has no `cid`, and reads by the
fallback; a `cid` that resolves to nothing — a component the file removed after the reference
was written — reads as null, never as the component that took its place.

## Ids that are not minted

A file read without component ids derives the same ones on every load, in `ensureIds`:
`~c:<nodeId>:<type>:<occurrence>`, counted per type after `_foldSingleCopies` — a tree saved
while a load had doubled a `RectTransform` reads back with exactly one RT id. They stay
in memory until the file is written with ids anyway, which writes minted ones.

An address a pre-one-per-object engine wrote to a second `RectTransform` or `Transform`
(index ≥ 1) retargets to the first on every read path, exactly as the fold reads the tree.
