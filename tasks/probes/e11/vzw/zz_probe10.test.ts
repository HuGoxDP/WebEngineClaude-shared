import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { Tag, Aim, Pick, clear, child, obj, prefabFrom, saveLink, saveExpand, reload, quiet, AssetDatabase, GameObject, SceneSerializer, Prefab } from "./zz_probe_common";

beforeEach(() => clear());
afterEach(() => AssetDatabase.clear());

/** Turret(Barrel); Tank whose nested Turret has an added child Scope (Tag "scope") and an added Tag on its root. */
function setup() {
    const turret = prefabFrom(() => obj("Turret", "turret", obj("Barrel", "barrel")), "guid-turret");
    const tank = prefabFrom(() => {
        const inner = turret.instantiate();
        obj("Scope", "scope").transform.setParent(inner.transform, false);
        inner.addComponent(Tag).label = "added-by-tank";
        return obj("Tank", "tank", obj("Hull", "hull"), inner);
    }, "guid-tank");
    return { turret, tank };
}

test("fixture: the Tank prefab's nested Turret carries the Scope and the extra Tag", () => {
    const { tank } = setup();
    const t = tank.instantiate();
    const n = child(t, 1);
    expect(n.transform.childCount).toBe(2);
    expect(n.getComponents(Tag).map(c => c.label)).toEqual(["turret", "added-by-tank"]);
    expect(tank.getChanges(t)).toEqual({ overrides: [] });
});

test("A: an instance that deletes the Scope the Tank prefab added keeps it deleted after a link round trip", () => {
    const { tank } = setup();
    const t = tank.instantiate();
    child(t, 1, 1).destroyImmediate();
    const s1 = saveLink();
    const [r] = reload(s1);
    expect(child(r, 1).transform.childCount).toBe(1);
});

test("B: an instance that edits the Tag the Tank prefab added keeps its edit after a link round trip", () => {
    const { tank } = setup();
    const t = tank.instantiate();
    child(t, 1).getComponents(Tag)[1].label = "EDITED";
    const s1 = saveLink();
    const [r] = reload(s1);
    expect(child(r, 1).getComponents(Tag).map(c => c.label)).toEqual(["turret", "EDITED"]);
});

test("C: an instance that edits the Scope the Tank prefab added keeps its edit after a link round trip", () => {
    const { tank } = setup();
    const t = tank.instantiate();
    child(t, 1, 1).getComponent(Tag)!.label = "EDITED";
    const s1 = saveLink();
    const [r] = reload(s1);
    expect(child(r, 1, 1).getComponent(Tag)!.label).toBe("EDITED");
});

test("D: an instance that removes the Tag the Tank prefab added keeps it removed after a link round trip", () => {
    const { tank } = setup();
    const t = tank.instantiate();
    const n = child(t, 1);
    n.removeComponent(n.getComponents(Tag)[1] as never);
    const s1 = saveLink();
    const [r] = reload(s1);
    expect(child(r, 1).getComponents(Tag).map(c => c.label)).toEqual(["turret"]);
});

test("E: same edits through a variant of the Tank (composition at the variant level)", () => {
    const { tank } = setup();
    const i = tank.instantiate();
    child(i, 1, 1).getComponent(Tag)!.label = "VARIANT";
    const v = Prefab.createVariant(tank, tank.getChanges(i), "TankV");
    i.destroyImmediate();
    const vi = v.instantiate();
    expect(child(vi, 1, 1).getComponent(Tag)!.label).toBe("VARIANT");
});
