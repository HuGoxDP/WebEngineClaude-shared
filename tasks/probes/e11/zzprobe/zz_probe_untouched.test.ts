import { test, vi } from "vitest";
import * as fs from "node:fs";
import { Prefab } from "../../src/engine/core/serialization/Prefab";
import { SceneSerializer } from "../../src/engine/core/serialization/SceneSerializer";
import { CompatFollow, OUT, clearScene, buildPrefabSource } from "./compatFixtures";
const tag = fs.readFileSync(new URL("../../src/engine/core/serialization/PrefabOverride.ts", import.meta.url).pathname, "utf8").includes("compareChanges") ? "head" : "old";
test("untouched", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    clearScene();
    const go = buildPrefabSource();
    const prefab = Prefab.fromGameObject(go);
    const untouched = prefab.getOverrides(go).map(o => `${JSON.stringify(o.path)} ${o.component}.${o.field}`);
    // An old saved scene: a plain copy of the object, as Instantiate made it before this build.
    const copy = SceneSerializer.deserializeGameObject(SceneSerializer.serializeGameObject(go));
    (copy as any)._prefabInfo = undefined; delete (copy as any)._prefabInfo; // no-op on old
    copy.transform.getChild(1).getChild(0).gameObject.getComponent(CompatFollow)!.weight = 42;
    const plainCopy = prefab.getOverrides(copy).map(o => `${JSON.stringify(o.path)} ${o.component}.${o.field}=${JSON.stringify(o.value)}`);
    fs.writeFileSync(`${OUT}/probe-untouched.${tag}.json`, JSON.stringify({ untouched, plainCopy }, null, 1));
});
