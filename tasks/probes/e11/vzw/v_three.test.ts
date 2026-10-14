import { describe, test, expect, beforeEach, afterEach } from "vitest";
import {
    Tag, Aim, clear, child, obj, world, prefabFrom, saveLink, saveExpand, reload, quiet, rebind,
    GameObject, AssetDatabase, Prefab, SceneSerializer, SceneManager,
} from "./zz_probe_common";

beforeEach(() => clear());
afterEach(() => AssetDatabase.clear());

/** Fort (Tag, Aim -> TankL/TurretR/Barrel) ⊃ TankL, TankR; Fort sets TankL/TurretR/Barrel label FORT; Tank sets TurretR/Barrel count 7. */
function fortWorld() {
    const w = world();
    // Tank prefab: TurretR's barrel count = 7
    const tank = rebind("guid-tank", () => {});
    void tank;
    const tankP = prefabFrom(() => {
        const t = w.tank.instantiate();
        child(t, 2, 0).getComponent(Tag)!.count = 7;
        return t;
    }, "guid-tank");
    const fort = prefabFrom(() => {
        const l = tankP.instantiate();
        const r = tankP.instantiate();
        l.name = "TankL"; r.name = "TankR";
        child(l, 2, 0).getComponent(Tag)!.label = "FORT";
        const f = obj("Fort", "fort", l, r);
        f.addComponent(Aim).target = child(l, 2, 0);
        return f;
    }, "guid-fort");
    return { ...w, tank: tankP, fort };
}

const deep = (f: GameObject) => child(f, 0, 2);       // Fort/TankL/TurretR
const deepBarrel = (f: GameObject) => child(f, 0, 2, 0);

describe("three levels", () => {
    test("fixture", () => {
        const { fort } = fortWorld();
        const f = fort.instantiate();
        expect(deepBarrel(f).getComponent(Tag)!.label).toBe("FORT");
        expect(deepBarrel(f).getComponent(Tag)!.count).toBe(7);
        expect(f.getComponent(Aim)!.target).toBe(deepBarrel(f));
        expect(deep(f).getComponent(Aim)!.target).toBe(deepBarrel(f));
        expect(fort.getChanges(f)).toEqual({ overrides: [] });
    });

    test("untouched deep turret, asked of its own prefab, has no changes", () => {
        const { fort, turret, tank } = fortWorld();
        const f = fort.instantiate();
        expect(turret.getChanges(deep(f))).toEqual({ overrides: [] });
        expect(turret.getOverrides(deep(f))).toEqual([]);
        expect(tank.getChanges(child(f, 0))).toEqual({ overrides: [] });
    });

    test("a scene edit three levels down is one field at every level", () => {
        const { fort, turret, tank } = fortWorld();
        const f = fort.instantiate();
        deepBarrel(f).getComponent(Tag)!.count = 5;
        const t = turret.getChanges(deep(f));
        expect(t.overrides.map(o => [o.field, o.value])).toEqual([["count", 5]]);
        expect(tank.getChanges(child(f, 0)).overrides.map(o => [o.field, o.value])).toEqual([["count", 5]]);
        expect(fort.getChanges(f).overrides.map(o => [o.field, o.value])).toEqual([["count", 5]]);
    });

    test("applyInstance on the deep turret writes only the scene's change into Turret", () => {
        const { fort, turret, tank } = fortWorld();
        const f = fort.instantiate();
        deepBarrel(f).getComponent(Tag)!.count = 5;
        turret.applyInstance(deep(f));
        const fresh = turret.instantiate();
        expect(child(fresh, 0).getComponent(Tag)!.label).toBe("barrel");
        expect(child(fresh, 0).getComponent(Tag)!.count).toBe(5);
        const t2 = tank.instantiate();
        expect(child(t2, 2, 0).getComponent(Tag)!.count).toBe(7);
        expect(child(t2, 1, 0).getComponent(Tag)!.count).toBe(5);
        const f2 = fort.instantiate();
        expect(deepBarrel(f2).getComponent(Tag)!.label).toBe("FORT");
        expect(deepBarrel(f2).getComponent(Tag)!.count).toBe(7);
    });

    test("revert on the deep turret goes back to what Fort and Tank set", () => {
        const { fort, turret } = fortWorld();
        const f = fort.instantiate();
        deepBarrel(f).getComponent(Tag)!.count = 5;
        deepBarrel(f).getComponent(Tag)!.label = "SCENE";
        deep(f).name = "Renamed";
        const fresh = turret.revert(deep(f));
        expect(fresh).toBe(deep(f));
        expect(fresh.name).toBe("Turret");
        expect(deepBarrel(f).getComponent(Tag)!.label).toBe("FORT");
        expect(deepBarrel(f).getComponent(Tag)!.count).toBe(7);
        expect(f.getComponent(Aim)!.target).toBe(deepBarrel(f));
        expect(deep(f).getComponent(Aim)!.target).toBe(deepBarrel(f));
        expect(fort.getChanges(f)).toEqual({ overrides: [] });
        expect(saveLink().roots[0].prefab!.changes).toEqual({ overrides: [] });
    });

    test("revertOverride on the deep turret goes back to Tank's 7", () => {
        const { fort, turret } = fortWorld();
        const f = fort.instantiate();
        deepBarrel(f).getComponent(Tag)!.count = 5;
        const o = turret.getChanges(deep(f)).overrides[0];
        turret.revertOverride(deep(f), o);
        expect(deepBarrel(f).getComponent(Tag)!.count).toBe(7);
        expect(fort.getChanges(f)).toEqual({ overrides: [] });
    });

    test("link and expand save -> load -> save are idempotent with deep edits", () => {
        const { fort } = fortWorld();
        const f = fort.instantiate();
        deepBarrel(f).getComponent(Tag)!.count = 5;
        new GameObject("Flag").transform.setParent(deepBarrel(f).transform, false);
        child(f, 1, 1).destroyImmediate();
        const p = new GameObject("Player");
        p.addComponent(Aim).target = child(deepBarrel(f), 0);
        const l1 = saveLink();
        reload(l1);
        const l2 = saveLink();
        expect(l2).toEqual(l1);
        const e1 = saveExpand();
        reload(e1);
        expect(saveExpand()).toEqual(e1);
        reload(l2);
        const [f3, p3] = SceneManager.activeScene.getRootGameObjects();
        expect(p3.getComponent(Aim)!.target?.name).toBe("Flag");
        expect(child(f3, 1).transform.childCount).toBe(2);
        expect(deepBarrel(f3).getComponent(Tag)!.count).toBe(5);
        expect(deepBarrel(f3).getComponent(Tag)!.label).toBe("FORT");
    });

    test("a Turret prefab edit reaches the deep turret through a link scene, except what Tank/Fort set", () => {
        const { fort } = fortWorld();
        const f = fort.instantiate();
        deepBarrel(f).getComponent(Tag)!.count = 5;
        const l1 = saveLink();
        rebind("guid-turret", json => { json.snapshot.components[0].fields.label = "TURRET2"; });
        const [f2] = reload(l1);
        expect(deep(f2).getComponent(Tag)!.label).toBe("TURRET2");
        expect(child(f2, 1, 1).getComponent(Tag)!.label).toBe("TURRET2");
        expect(deepBarrel(f2).getComponent(Tag)!.count).toBe(5);
        expect(deepBarrel(f2).getComponent(Tag)!.label).toBe("FORT");
    });
});
