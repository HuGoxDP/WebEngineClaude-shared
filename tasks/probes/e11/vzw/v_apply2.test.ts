import { test, expect, beforeEach, afterEach } from "vitest";
import { Tag, Aim, Pick, clear, child, obj, world, prefabFrom, saveLink, reload, quiet, GameObject, AssetDatabase, Prefab } from "./zz_probe_common";
beforeEach(() => clear());
afterEach(() => AssetDatabase.clear());
test("nested applyInstance: a reference to an object the scene added inside the nested-nested Barrel", () => {
    const { tank, turret } = world();
    const t = tank.instantiate();
    const L = child(t, 1);
    const tip = new GameObject("Tip"); tip.transform.setParent(child(L, 0).transform, false);
    L.getComponent(Aim)!.target = tip;
    turret.applyInstance(L);
    const file = JSON.parse(JSON.stringify(turret.toJSON()));
    const re = Prefab.fromJSON(file);
    AssetDatabase._bindGuid("guid-turret", re);
    const f = re.instantiate();
    expect(child(f, 0, 0).name).toBe("Tip");
    expect(f.getComponent(Aim)!.target).toBe(child(f, 0, 0));
    // the Tank: both turrets now carry a Tip, L's (scene) aim still at its own Tip
    const t2 = tank.instantiate();
    expect(child(t2, 1, 0, 0).name).toBe("Tip");
    expect(child(t2, 2).getComponent(Aim)!.target).toBe(child(t2, 2, 0, 0));
    // the scene instance: after apply, getChanges of the tank instance is empty
    const w = quiet();
    expect(tank.getChanges(t)).toEqual({ overrides: [] });
    w.restore();
});
test("nested applyInstance of a scene scale change on the nested root", () => {
    const { tank, turret } = world();
    const t = tank.instantiate();
    const L = child(t, 1);
    L.transform.localScale = L.transform.localScale.clone().set(2, 2, 2);
    expect(turret.getChanges(L).overrides.map(o => o.field)).toEqual(["transform.scale"]);
    turret.applyInstance(L);
    expect(turret.instantiate().transform.localScale.x).toBe(2);
    expect(tank.getChanges(t)).toEqual({ overrides: [] });
});
