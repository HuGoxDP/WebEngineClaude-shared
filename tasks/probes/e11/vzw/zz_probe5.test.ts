import { describe, test, expect, beforeEach, afterEach } from "vitest";
import {
    Tag, Aim, clear, child, obj, world, saveLink, prefabFrom, GameObject, AssetDatabase, SceneSerializer, SceneManager,
} from "./zz_probe_common";

beforeEach(() => clear());
afterEach(() => AssetDatabase.clear());

describe("probe: revert", () => {
    test("Prefab.revert on a nested instance keeps what the outer prefab set on it", async () => {
        const { turret } = world();
        const tank2 = prefabFrom(() => {
            const tt = obj("Tank", "tank", obj("Hull", "hull"), turret.instantiate());
            child(tt, 1, 0).getComponents(Tag)[1].label = "TANK";
            return tt;
        }, "guid-tank2");
        const t = tank2.instantiate();
        const nested = child(t, 1);
        child(nested, 0).getComponents(Tag)[0].count = 5; // the user's own change
        nested.prefabSource!.revert(nested);
        await Promise.resolve();
        expect(t.transform.childCount).toBe(2);
        expect(child(t, 1, 0).getComponents(Tag)[0].count).toBe(0);
        expect(child(t, 1, 0).getComponents(Tag)[1].label).toBe("TANK");
    });

    test("revert, then a save in the same task, writes the instance once", () => {
        const { tank } = world();
        const t = tank.instantiate();
        const fresh = tank.revert(t);
        const roots = SceneSerializer.serializeScene(SceneManager.activeScene).roots;
        expect(roots.length).toBe(1);
    });

    test("revertOverride of a removed nested child: references to it come back too", () => {
        const { tank } = world();
        const t = tank.instantiate();
        child(t, 2, 0).destroyImmediate(); // remove right barrel
        const ch = tank.getChanges(t);
        tank.revertOverride(t, ch.removedChildren![0]);
        const ref = child(t, 2).getComponent(Aim)!.target;
        expect(ref === child(t, 2, 0)).toBe(true);
        expect(tank.getChanges(t)).toEqual({ overrides: [] });
    });

    test("revertOverride of a removed component: a reference to it comes back", () => {
        const { tank } = world();
        const t = tank.instantiate();
        // Hull gets a Pick-like reference through the Turret's Aim? Use the barrel's Aim component removed.
        const rb = child(t, 2, 0);
        rb.removeComponent(rb.getComponent(Aim)! as never);
        const ch = tank.getChanges(t);
        expect(ch.removedComponents?.length).toBe(1);
        tank.revertOverride(t, ch.removedComponents![0]);
        expect(rb.getComponent(Aim)).not.toBeNull();
        expect(tank.getChanges(t)).toEqual({ overrides: [] });
    });

    test("revertOverride of an added component of a type the node already has removes the added one", () => {
        const { tank } = world();
        const t = tank.instantiate();
        const hull = child(t, 0);
        const added = hull.addComponent(Tag);
        added.label = "added";
        const ch = tank.getChanges(t);
        expect(ch.addedComponents?.length).toBe(1);
        tank.revertOverride(t, ch.addedComponents![0]);
        expect(hull.getComponents(Tag).map(c => c.label)).toEqual(["hull"]);
    });
});
