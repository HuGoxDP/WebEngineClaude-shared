import { test, expect, vi } from "vitest";
import * as fs from "node:fs";
import { SceneSerializer } from "../../src/engine/core/serialization/SceneSerializer";
import { Prefab } from "../../src/engine/core/serialization/Prefab";
import { PrefabDiff } from "../../src/engine/core/serialization/PrefabOverride";
import { CompatFollow, OUT, clearScene, buildPrefabSource, dumpRoots } from "./compatFixtures";

// Triage (A5a, 2026-11-11): this probe "failed" on master before and after A5 because it was
// environment-coupled (a session-scratchpad OUT path) and its dump read pre-A5 fields — it
// printed `path` (written only where `node` is absent), so a node-addressed override read as
// "undefined null.field=value". The behavior it observes is correct on master: overrides carry
// `node` ids, a variant built from them applies, and `PrefabDiff.compare` does not mutate its
// input. Pinned here so it cannot rot; `treeVsInstanceSnapshot` is recorded but not asserted
// (open question for the serializer review — see the A5a notes).

test("getOverrides on objects without node ids", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const out: Record<string, unknown> = {};

    // 1. The object a prefab was made from, tweaked afterwards.
    clearScene();
    const tank = buildPrefabSource();
    const prefab = Prefab.fromGameObject(tank);
    const barrel = tank.transform.getChild(1).getChild(0).gameObject;
    barrel.getComponent(CompatFollow)!.weight = 42;
    tank.transform.getChild(0).gameObject.name = "HullRenamed";
    const overrides = prefab.getOverrides(tank);
    out.sourceOverrides = overrides.map(o => `node=${JSON.stringify(o.node)} path=${JSON.stringify(o.path)} ${o.component}.${o.field}=${JSON.stringify(o.value)}`);

    // A prefab made from a GameObject has node ids, so every override addresses by node and
    // carries no positional path (the PrefabOverride contract).
    for (const o of overrides) {
        expect(typeof o.node).toBe("string");
        expect((o.node as string).length).toBeGreaterThan(0);
        expect(o.path).toBeUndefined();
    }
    expect(overrides.map(o => o.field).sort()).toEqual(["name", "weight"]);

    // What a variant built from them gives.
    const variant = Prefab.createVariant(prefab, overrides, "V");
    const v = variant.instantiate();
    const d = dumpRoots([v]) as any[];
    out.variantInstance = {
        hullName: d[0].children[0].name,
        barrelWeight: d[0].children[1].children[0].components.find((c: any) => c.type === "Compat.Follow").fields.weight,
        rootTarget: d[0].components.find((c: any) => c.type === "Compat.Follow").fields.target,
        rootComp: d[0].components.find((c: any) => c.type === "Compat.Follow").fields.comp,
        rootGos: d[0].components.find((c: any) => c.type === "Compat.Follow").fields.gos,
    };

    // The variant applies both overrides, and the references inside it resolve.
    expect((out.variantInstance as any).hullName).toBe("HullRenamed");
    expect((out.variantInstance as any).barrelWeight).toBe(42);
    expect((out.variantInstance as any).rootTarget).toBeTruthy();
    expect((out.variantInstance as any).rootComp).toBeTruthy();

    // 2. Two plain snapshots of the same unchanged object, compared directly.
    clearScene();
    const a = buildPrefabSource();
    const snapA = SceneSerializer.serializeGameObject(a);
    const snapB = JSON.parse(JSON.stringify(snapA));
    const before = JSON.stringify(snapB);
    out.plainCompare = PrefabDiff.compare(snapA, snapB).length;
    out.plainCompareMutatedInput = JSON.stringify(snapB) !== before;

    expect(out.plainCompare).toBe(0);
    expect(out.plainCompareMutatedInput).toBe(false);

    // 3. A prefab file's tree against a plain snapshot of an instance-shaped object.
    const file = Prefab.fromGameObject(a).toJSON() as any;
    const loaded = Prefab.fromJSON(file);
    const inst = loaded.instantiate();
    const instSnap = SceneSerializer.serializeGameObject(inst);
    const before2 = JSON.stringify(instSnap);
    out.treeVsInstanceSnapshot = PrefabDiff.compare((loaded as any)._internalSnapshot, instSnap).length;
    out.compareMutatedInstanceSnapshot = JSON.stringify(instSnap) !== before2;

    expect(out.compareMutatedInstanceSnapshot).toBe(false);

    fs.writeFileSync(`${OUT}/probe-overrides.head.json`, JSON.stringify(out, null, 1));
});
