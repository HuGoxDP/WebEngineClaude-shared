import { test, expect, beforeEach, afterEach } from "vitest";
import { Tag, clear, child, world, saveLink, reload, quiet, rebind, AssetDatabase, Prefab } from "./zz_probe_common";
beforeEach(() => clear());
afterEach(() => AssetDatabase.clear());
test("a nested change that no longer applies keeps its per-field form through a save", () => {
    const { tank } = world();
    const t = tank.instantiate();
    child(t, 2, 0).getComponents(Tag)[1].label = "R2";
    const s1 = saveLink();
    rebind("guid-turret", json => { json.snapshot.children = []; });
    const w = quiet();
    reload(s1);
    const s2 = saveLink();
    w.restore();
    const fields = s2.roots[0].prefab!.changes!.overrides.map(o => o.field);
    expect(fields).not.toContain("prefab");
});
