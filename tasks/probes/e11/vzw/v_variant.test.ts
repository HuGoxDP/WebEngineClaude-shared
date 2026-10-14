import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { Tag, Aim, clear, child, obj, world, prefabFrom, saveLink, saveExpand, reload, rebind, quiet, GameObject, AssetDatabase, SceneManager, Prefab } from "./zz_probe_common";
beforeEach(() => clear());
afterEach(() => AssetDatabase.clear());

function variantWorld() {
    const w = world();
    const i = w.tank.instantiate();
    child(i, 2, 0).getComponent(Tag)!.label = "VAR";       // variant edits TurretR/Barrel
    const extra = new GameObject("Extra"); extra.transform.setParent(child(i, 1).transform, false); // variant adds under TurretL
    const v = Prefab.createVariant(w.tank, w.tank.getChanges(i), "TankV");
    i.destroyImmediate();
    AssetDatabase._bindGuid("guid-tankv", Prefab.fromJSON(JSON.parse(JSON.stringify(v.toJSON()))));
    return { ...w, v: AssetDatabase.get("guid-tankv") as Prefab };
}

describe("nested instance inside a variant instance", () => {
    test("fixture", () => {
        const { v } = variantWorld();
        const t = v.instantiate();
        expect(child(t, 2, 0).getComponent(Tag)!.label).toBe("VAR");
        expect(child(t, 1, 1).name).toBe("Extra");
        expect(v.getChanges(t)).toEqual({ overrides: [] });
    });
    test("getChanges of an untouched nested Turret inside the variant instance is empty", () => {
        const { v, turret } = variantWorld();
        const t = v.instantiate();
        expect(turret.getChanges(child(t, 2))).toEqual({ overrides: [] });
        expect(turret.getChanges(child(t, 1))).toEqual({ overrides: [] });
    });
    test("revert of nested Turret R keeps the variant's label", () => {
        const { v, turret } = variantWorld();
        const t = v.instantiate();
        child(t, 2, 0).getComponent(Tag)!.count = 3;
        turret.revert(child(t, 2));
        expect(child(t, 2, 0).getComponent(Tag)!.label).toBe("VAR");
        expect(child(t, 2, 0).getComponent(Tag)!.count).toBe(0);
        expect(v.getChanges(t)).toEqual({ overrides: [] });
    });
    test("revert of nested Turret L keeps the variant's added Extra", () => {
        const { v, turret } = variantWorld();
        const t = v.instantiate();
        child(t, 1, 0).getComponent(Tag)!.count = 3;
        turret.revert(child(t, 1));
        expect(child(t, 1).transform.childCount).toBe(2);
        expect(child(t, 1, 1).name).toBe("Extra");
        expect(v.getChanges(t)).toEqual({ overrides: [] });
    });
    test("applyInstance of nested Turret R writes only the scene's change", () => {
        const { v, turret } = variantWorld();
        const t = v.instantiate();
        child(t, 2, 0).getComponent(Tag)!.count = 3;
        turret.applyInstance(child(t, 2));
        const f = turret.instantiate();
        expect(child(f, 0).getComponent(Tag)!.label).toBe("barrel");
        expect(child(f, 0).getComponent(Tag)!.count).toBe(3);
    });
    test("link round trip of an edited variant instance is idempotent", () => {
        const { v } = variantWorld();
        const t = v.instantiate();
        child(t, 2, 0).getComponent(Tag)!.count = 3;
        child(t, 1, 1).getComponent(Tag);
        child(t, 1, 1).name = "ExtraRenamed";
        const s1 = saveLink();
        const [t2] = reload(s1);
        expect(saveLink()).toEqual(s1);
        expect(child(t2, 1, 1).name).toBe("ExtraRenamed");
        expect(child(t2, 2, 0).getComponent(Tag)!.label).toBe("VAR");
    });
});
