import { test, vi } from "vitest";
import * as fs from "node:fs";
import { SceneSerializer } from "../../src/engine/core/serialization/SceneSerializer";
import { Prefab } from "../../src/engine/core/serialization/Prefab";
import { PrefabDiff } from "../../src/engine/core/serialization/PrefabOverride";
import { CompatFollow, OUT, clearScene, buildPrefabSource, dumpRoots } from "./compatFixtures";

const tag = fs.existsSync(new URL("../../src/engine/core/serialization/PrefabOverride.ts", import.meta.url).pathname)
    && fs.readFileSync(new URL("../../src/engine/core/serialization/PrefabOverride.ts", import.meta.url).pathname, "utf8").includes("compareChanges")
    ? "head" : "old";

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
    out.sourceOverrides = overrides.map(o => `${JSON.stringify(o.path)} ${o.component}.${o.field}=${JSON.stringify(o.value)}`);

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

    // 2. Two plain snapshots of the same unchanged object, compared directly.
    clearScene();
    const a = buildPrefabSource();
    const snapA = SceneSerializer.serializeGameObject(a);
    const snapB = JSON.parse(JSON.stringify(snapA));
    const before = JSON.stringify(snapB);
    out.plainCompare = PrefabDiff.compare(snapA, snapB).length;
    out.plainCompareMutatedInput = JSON.stringify(snapB) !== before;

    // 3. A prefab file's tree (legacy ids on HEAD) against a plain snapshot of an instance-shaped object.
    const file = Prefab.fromGameObject(a).toJSON() as any;
    const loaded = Prefab.fromJSON(file);
    const inst = loaded.instantiate();
    const instSnap = SceneSerializer.serializeGameObject(inst);
    const before2 = JSON.stringify(instSnap);
    out.treeVsInstanceSnapshot = PrefabDiff.compare((loaded as any)._internalSnapshot, instSnap).length;
    out.compareMutatedInstanceSnapshot = JSON.stringify(instSnap) !== before2;

    fs.writeFileSync(`${OUT}/probe-overrides.${tag}.json`, JSON.stringify(out, null, 1));
});
