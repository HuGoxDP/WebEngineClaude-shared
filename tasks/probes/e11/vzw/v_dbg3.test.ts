import { test, expect, beforeEach, afterEach } from "vitest";
import { Tag, Aim, Pick, clear, child, world, saveLink, reload, rebind, quiet, GameObject, AssetDatabase, SceneManager, Prefab } from "./zz_probe_common";
beforeEach(() => clear());
afterEach(() => AssetDatabase.clear());
const dump = (g: GameObject, d = 0): string => "  ".repeat(d) + g.name + (g.isPrefabAssetMissing ? " [MISSING]" : "") + "\n" + Array.from({ length: g.transform.childCount }, (_, i) => dump(child(g, i), d + 1)).join("");
for (const order of ["tank-then-turret", "turret-then-tank", "tank-only"]) test(order, () => {
    const { tank } = world();
    const a = tank.instantiate(); a.name = "A";
    const l1 = saveLink();
    const t = () => rebind("guid-tank", json => { json.snapshot.children.unshift({ name: "Antenna", active: true, transform: json.snapshot.transform, components: [], children: [], id: "ant01" }); });
    const u = () => rebind("guid-turret", json => { json.snapshot.children.unshift({ name: "Shield", active: true, transform: json.snapshot.transform, components: [], children: [], id: "sh01" }); });
    if (order === "tank-then-turret") { t(); u(); } else if (order === "turret-then-tank") { u(); t(); } else t();
    const w = quiet();
    const roots = reload(l1);
    const calls = w.calls();
    w.restore();
    console.log(order + "\n" + calls.join("\n") + "\n" + roots.map(r => dump(r)).join(""));
    console.log(dump((AssetDatabase.get("guid-tank") as Prefab).instantiate()));
});
