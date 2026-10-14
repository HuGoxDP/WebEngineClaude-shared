import { test, expect, beforeEach, afterEach } from "vitest";
import { Tag, Aim, clear, child, obj, prefabFrom, saveLink, saveExpand, reload, quiet, GameObject, AssetDatabase, Prefab } from "./zz_probe_common";
beforeEach(() => clear());
afterEach(() => AssetDatabase.clear());
const names = (g: GameObject) => Array.from({ length: g.transform.childCount }, (_, i) => child(g, i).name);
function setup() {
    const turret = prefabFrom(() => obj("Turret", "turret", obj("Barrel", "barrel"), obj("Light", "light")), "guid-turret");
    const tank = prefabFrom(() => obj("Tank", "tank", obj("Hull", "hull"), turret.instantiate()), "guid-tank");
    return { turret, tank };
}
test("prefab made from an object holding a Tank whose nested Turret is reordered", () => {
    const { tank } = setup();
    const w = quiet();
    const fort = prefabFrom(() => {
        const t = tank.instantiate();
        child(t, 1, 1).transform.setSiblingIndex(0);
        child(t, 1, 0).getComponent(Tag)!.label = "L!";
        return obj("Fort", "fort", t);
    }, "guid-fort");
    const file = JSON.parse(JSON.stringify(fort.toJSON()));
    const f = Prefab.fromJSON(file).instantiate();
    expect(names(child(f, 0, 1))).toEqual(["Light", "Barrel"]);
    expect(child(f, 0, 1, 0).getComponent(Tag)!.label).toBe("L!");
    const fi = fort.instantiate();
    expect(fort.getChanges(fi)).toEqual({ overrides: [] });
    const s1 = saveLink();
    reload(s1);
    expect(saveLink()).toEqual(s1);
    w.restore();
});
test("variant from getChanges of a Tank instance whose nested Turret is reordered", () => {
    const { tank } = setup();
    const w = quiet();
    const t = tank.instantiate();
    child(t, 1, 1).transform.setSiblingIndex(0);
    const v = Prefab.createVariant(tank, tank.getChanges(t), "TankV");
    const vfile = JSON.parse(JSON.stringify(v.toJSON()));
    AssetDatabase._bindGuid("guid-tankv", Prefab.fromJSON(vfile));
    const vi = (AssetDatabase.get("guid-tankv") as Prefab).instantiate();
    expect(names(child(vi, 1))).toEqual(["Light", "Barrel"]);
    expect(names(vi)).toEqual(["Hull", "Turret"]);
    w.restore();
});
