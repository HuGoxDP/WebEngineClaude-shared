import { test, expect, vi } from "vitest";
import * as fs from "node:fs";
import { Prefab } from "../../src/engine/core/serialization/Prefab";
import { SceneSerializer } from "../../src/engine/core/serialization/SceneSerializer";
import { CompatFollow, OUT, clearScene, buildPrefabSource } from "./compatFixtures";

// Triage (A5a, 2026-11-11): "failed" on master only through the environment coupling (OUT was
// one session's scratchpad; the URL read doubled the drive letter on Windows). What it observes
// is correct on master: an unchanged object produces no overrides, and a plain deserialized copy
// (no prefab info of its own) still yields node-addressed overrides for the two fields that
// differ from the prefab.

test("untouched", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    clearScene();
    const go = buildPrefabSource();
    const prefab = Prefab.fromGameObject(go);
    const untouched = prefab.getOverrides(go).map(o => `node=${JSON.stringify(o.node)} ${o.component}.${o.field}`);
    // An unchanged object has nothing to override.
    expect(untouched).toEqual([]);

    // An old saved scene: a plain copy of the object, as Instantiate made it before this build.
    const copy = SceneSerializer.deserializeGameObject(SceneSerializer.serializeGameObject(go));
    (copy as any)._prefabInfo = undefined; delete (copy as any)._prefabInfo; // no-op on old
    copy.transform.getChild(1).getChild(0).gameObject.getComponent(CompatFollow)!.weight = 42;
    const copyOverrides = prefab.getOverrides(copy);
    const plainCopy = copyOverrides.map(o => `node=${JSON.stringify(o.node)} ${o.component}.${o.field}=${JSON.stringify(o.value)}`);
    fs.writeFileSync(`${OUT}/probe-untouched.head.json`, JSON.stringify({ untouched, plainCopy }, null, 1));

    // The weight change is an override; the material asset reference the deserialized copy holds
    // is the other. Both address by node.
    expect(copyOverrides.map(o => o.field).sort()).toEqual(["sharedMaterial", "weight"]);
    for (const o of copyOverrides) {
        expect(typeof o.node).toBe("string");
        expect((o.node as string).length).toBeGreaterThan(0);
    }
});
