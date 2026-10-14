import { test, expect, beforeEach, afterEach } from "vitest";
import { Tag, Aim, Pick, clear, child, world, saveLink, reload, rebind, quiet, GameObject, AssetDatabase, SceneManager, Prefab } from "./zz_probe_common";
beforeEach(() => clear());
afterEach(() => AssetDatabase.clear());
const dump = (g: GameObject, d = 0): string => "  ".repeat(d) + g.name + (g.isPrefabAssetMissing ? " [MISSING]" : "") + "\n" + Array.from({ length: g.transform.childCount }, (_, i) => dump(child(g, i), d + 1)).join("");
test("dbg", () => {
    const { tank } = world();
    const a = tank.instantiate(); a.name = "A";
    const l1 = saveLink();
    rebind("guid-turret", json => { json.snapshot.children.unshift({ name: "Shield", active: true, transform: json.snapshot.transform, components: [], children: [], id: "sh01" }); });
    console.log(JSON.stringify((AssetDatabase.get("guid-turret") as Prefab).toJSON()).slice(0, 2000));
    const w = quiet();
    const roots = reload(l1);
    console.log(w.calls().join("\n"));
    w.restore();
    console.log(roots.map(r => dump(r)).join(""));
    console.log(dump((AssetDatabase.get("guid-turret") as Prefab).instantiate()));
});
