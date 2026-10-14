import { test, expect, beforeEach, afterEach } from "vitest";
import { Tag, Aim, clear, child, obj, prefabFrom, quiet, GameObject, AssetDatabase } from "./zz_probe_common";
beforeEach(() => clear());
afterEach(() => AssetDatabase.clear());
test("barrel.revertOverride on an edit of the Fort-added Tag goes back to Fort's value", () => {
    const barrel = prefabFrom(() => obj("Barrel", "barrel"), "guid-barrel");
    const turret = prefabFrom(() => obj("Turret", "turret", barrel.instantiate()), "guid-turret");
    const tank = prefabFrom(() => obj("Tank", "tank", obj("Hull", "hull"), turret.instantiate()), "guid-tank");
    const fort = prefabFrom(() => {
        const t = tank.instantiate();
        const b = child(t, 1, 0);
        obj("Scope", "scope").transform.setParent(b.transform, false);
        b.addComponent(Tag).label = "added-by-fort";
        return obj("Fort", "fort", t);
    }, "guid-fort");
    const f = fort.instantiate();
    const B = child(f, 0, 1, 0);
    B.getComponents(Tag)[1].label = "E";
    child(B, 0).getComponent(Tag)!.label = "S";
    const ch = barrel.getChanges(B);
    for (const o of ch.overrides) barrel.revertOverride(B, o);
    expect(B.getComponents(Tag)[1].label).toBe("added-by-fort");
    expect(child(B, 0).getComponent(Tag)!.label).toBe("scope");
    expect(fort.getChanges(f)).toEqual({ overrides: [] });
    // and through turret / tank
    B.getComponents(Tag)[1].label = "E2";
    for (const o of tank.getChanges(child(f, 0)).overrides) tank.revertOverride(child(f, 0), o);
    expect(B.getComponents(Tag)[1].label).toBe("added-by-fort");
});
