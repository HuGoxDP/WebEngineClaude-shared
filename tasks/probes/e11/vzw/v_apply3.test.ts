import { test, expect, beforeEach, afterEach } from "vitest";
import { Tag, Aim, clear, child, world, quiet, saveLink, reload, AssetDatabase } from "./zz_probe_common";
beforeEach(() => clear());
afterEach(() => AssetDatabase.clear());
test("after nested apply, what does the outer instance report, and does a reload clear it", () => {
    const { tank, turret } = world();
    const t = tank.instantiate();
    const L = child(t, 1);
    L.transform.localScale = L.transform.localScale.clone().set(2, 2, 2);
    turret.applyInstance(L);
    console.log("TANK CHANGES", JSON.stringify(tank.getChanges(t)));
    console.log("TURRET CHANGES on L", JSON.stringify(turret.getChanges(L)));
    const s = saveLink();
    console.log("LINK", JSON.stringify(s.roots[0].prefab));
    const [t2] = reload(s);
    console.log("RELOADED scale L", child(t2, 1).transform.localScale.x, "R", child(t2, 2).transform.localScale.x, JSON.stringify(tank.getChanges(t2)));
});
test("same for a top-level turret instance (control)", () => {
    const { turret } = world();
    const i = turret.instantiate();
    i.transform.localScale = i.transform.localScale.clone().set(2, 2, 2);
    turret.applyInstance(i);
    console.log("TOP CHANGES", JSON.stringify(turret.getChanges(i)));
});
