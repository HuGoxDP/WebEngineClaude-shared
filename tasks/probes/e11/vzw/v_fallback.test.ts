import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { Tag, Aim, Pick, clear, child, obj, world, prefabFrom, saveLink, saveExpand, reload, rebind, quiet, GameObject, AssetDatabase, SceneManager, Prefab } from "./zz_probe_common";
beforeEach(() => clear());
afterEach(() => AssetDatabase.clear());

function setup() {
    const turret = prefabFrom(() => {
        const t = obj("Turret", "turret", obj("Barrel", "barrel"), obj("Light", "light"));
        t.addComponent(Aim).target = child(t, 0);
        return t;
    }, "guid-turret");
    const tank = prefabFrom(() => {
        const inner = turret.instantiate();
        const t = obj("Tank", "tank", obj("Hull", "hull"), inner);
        t.addComponent(Aim).target = child(inner, 1); // Tank aims at the Turret's Light
        child(t, 0).addComponent(Aim).target = child(inner, 0); // Hull aims at Barrel
        return t;
    }, "guid-tank");
    return { turret, tank };
}

describe("nested fallback (reordered nested instance inside a linked one)", () => {
    test("references into the fallback copy, from the outer prefab and from the scene, survive a link round trip, idempotently", () => {
        const { tank } = setup();
        const t = tank.instantiate();
        const nested = child(t, 1);
        child(nested, 1).transform.setSiblingIndex(0); // Light, Barrel
        child(nested, 0).getComponent(Tag)!.label = "LIGHT-EDIT";
        const p = new GameObject("Player");
        p.addComponent(Aim).target = child(nested, 1); // Barrel
        const w = quiet();
        const s1 = saveLink();
        const [t2, p2] = reload(s1);
        const s2 = saveLink();
        w.restore();
        const n2 = child(t2, 1);
        expect([child(n2, 0).name, child(n2, 1).name]).toEqual(["Light", "Barrel"]);
        expect(t2.getComponent(Aim)!.target).toBe(child(n2, 0));
        expect(child(t2, 0).getComponent(Aim)!.target).toBe(child(n2, 1));
        expect(n2.getComponent(Aim)!.target).toBe(child(n2, 1));
        expect(p2.getComponent(Aim)!.target).toBe(child(n2, 1));
        expect(child(n2, 0).getComponent(Tag)!.label).toBe("LIGHT-EDIT");
        expect(n2.isPrefabInstance).toBe(true);
        expect(s2).toEqual(s1);
    });

    test("the fallback copy, once loaded, is still an instance of Turret and getChanges/revert work on it", () => {
        const { tank, turret } = setup();
        const t = tank.instantiate();
        child(t, 1, 1).transform.setSiblingIndex(0);
        const w = quiet();
        const [t2] = reload(saveLink());
        const n2 = child(t2, 1);
        const ch = tank.getChanges(t2);
        console.log("CHANGES", JSON.stringify(ch).slice(0, 600));
        const fresh = turret.revert(n2);
        w.restore();
        expect([child(fresh, 0).name, child(fresh, 1).name]).toEqual(["Barrel", "Light"]);
        expect(t2.getComponent(Aim)!.target).toBe(child(fresh, 1));
        expect(child(t2, 0).getComponent(Aim)!.target).toBe(child(fresh, 0));
        expect(tank.getChanges(t2)).toEqual({ overrides: [] });
    });

    test("revertOverride of the removal half of the remove+add pair", () => {
        const { tank } = setup();
        const t = tank.instantiate();
        child(t, 1, 1).transform.setSiblingIndex(0);
        const w = quiet();
        const ch = tank.getChanges(t);
        expect(ch.removedChildren?.length).toBe(1);
        expect(ch.addedChildren?.length).toBe(1);
        tank.revertOverride(t, ch.removedChildren![0]);
        const names = Array.from({ length: t.transform.childCount }, (_, i) => child(t, i).name);
        const s = saveLink();
        w.restore();
        console.log("AFTER REVERT REMOVED: children", names, JSON.stringify(s.roots[0].prefab).slice(0, 400));
        // whatever the result, no two live nodes may carry one id in the Tank's namespace
        const ids = Array.from({ length: t.transform.childCount }, (_, i) => child(t, i).prefabNodeId);
        expect(new Set(ids).size).toBe(ids.length);
    });

    test("revertOverride of the added half of the remove+add pair", () => {
        const { tank } = setup();
        const t = tank.instantiate();
        child(t, 1, 1).transform.setSiblingIndex(0);
        const w = quiet();
        const ch = tank.getChanges(t);
        tank.revertOverride(t, ch.addedChildren![0]);
        const names = Array.from({ length: t.transform.childCount }, (_, i) => child(t, i).name);
        const ch2 = tank.getChanges(t);
        w.restore();
        console.log("AFTER REVERT ADDED: children", names, JSON.stringify(ch2).slice(0, 300));
    });
});
