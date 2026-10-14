import { test, expect, beforeEach, afterEach } from "vitest";
import { Tag, Aim, Pick, clear, child, obj, world, prefabFrom, saveLink, saveExpand, reload, rebind, quiet, GameObject, AssetDatabase, SceneManager, Prefab } from "./zz_probe_common";
beforeEach(() => clear());
afterEach(() => AssetDatabase.clear());
const names = (g: GameObject) => Array.from({ length: g.transform.childCount }, (_, i) => child(g, i).name);

test("same prefab twice: remove one nested Turret, add a third, cross refs, both modes idempotent", () => {
    const { tank, turret } = world();
    const t = tank.instantiate();
    const third = turret.instantiate(); third.name = "Turret3";
    third.transform.setParent(t.transform, false);
    child(third, 0).getComponents(Tag)[1].label = "T3";
    child(t, 1).getComponent(Aim)!.target = child(third, 0);   // L -> third's barrel
    third.getComponent(Aim)!.target = child(t, 1, 0);           // third -> L's barrel
    child(t, 2).destroyImmediate();                              // remove R
    const p = new GameObject("Player");
    p.addComponent(Aim).target = child(third, 0);
    const w = quiet();
    const l1 = saveLink();
    const [t2, p2] = reload(l1);
    const l2 = saveLink();
    expect(l2).toEqual(l1);
    expect(names(t2)).toEqual(["Hull", "Turret", "Turret3"]);
    const th2 = child(t2, 2);
    expect(th2.isPrefabInstance).toBe(true);
    expect(th2.prefabSource).toBe(AssetDatabase.get("guid-turret"));
    expect(child(t2, 1).getComponent(Aim)!.target).toBe(child(th2, 0));
    expect(th2.getComponent(Aim)!.target).toBe(child(t2, 1, 0));
    expect(p2.getComponent(Aim)!.target).toBe(child(th2, 0));
    expect(child(th2, 0).getComponents(Tag)[1].label).toBe("T3");
    const e1 = saveExpand();
    reload(e1);
    expect(saveExpand()).toEqual(e1);
    // added Turret3 is an instance: its own revert puts it back in place
    const [t3] = reload(l1);
    const fresh = turret.revert(child(t3, 2));
    expect(names(t3)).toEqual(["Hull", "Turret", "Turret3"]);
    expect(child(fresh, 0).getComponents(Tag)[1].label).toBe("second");
    expect(turret.getChanges(fresh).overrides.filter(o => o.field !== "name")).toEqual([]);
    // revert the removal of R
    const ch = tank.getChanges(t3);
    tank.revertOverride(t3, ch.removedChildren![0]);
    expect(names(t3)).toEqual(["Hull", "Turret", "Turret", "Turret3"]);
    w.restore();
});
