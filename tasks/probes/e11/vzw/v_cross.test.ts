import { describe, test, expect, beforeEach, afterEach } from "vitest";
import {
    Tag, Aim, Pick, clear, child, obj, world, prefabFrom, saveLink, saveExpand, reload, quiet, rebind,
    GameObject, AssetDatabase, Prefab, SceneSerializer, SceneManager,
} from "./zz_probe_common";

beforeEach(() => clear());
afterEach(() => AssetDatabase.clear());

describe("same prefab twice, cross references", () => {
    test("nested revert of TurretL keeps TurretR's scene override that points into TurretL", () => {
        const { tank, turret } = world();
        const t = tank.instantiate();
        const L = child(t, 1), R = child(t, 2);
        R.getComponent(Aim)!.target = child(L, 0);   // scene override: R aims at L's barrel
        child(L, 0).getComponent(Tag)!.label = "dirty";
        const before = tank.getChanges(t).overrides.filter(o => o.field === "target").length;
        expect(before).toBe(1);
        turret.revert(L);
        const L2 = child(t, 1);
        expect(child(L2, 0).getComponent(Tag)!.label).toBe("barrel");
        // R's override was not reverted: it should still point at L's (new) barrel
        const tgt = R.getComponent(Aim)!.target;
        expect(tgt === null ? "null" : (tgt as any).exists?.() === false ? "destroyed" : tgt.name).toBe("Barrel");
        expect(tgt).toBe(child(L2, 0));
    });

    test("revertOverride of a removed nested child keeps a sibling's scene override into it? (it was nulled by removal)", () => {
        const { tank } = world();
        const t = tank.instantiate();
        const L = child(t, 1), R = child(t, 2);
        R.getComponent(Aim)!.target = child(L, 0);
        const s = saveLink();
        reload(s);
        const [t2] = SceneManager.activeScene.getRootGameObjects();
        expect(child(t2, 2).getComponent(Aim)!.target).toBe(child(t2, 1, 0));
        expect(saveLink()).toEqual(s);
    });

    test("two top-level instances referencing each other, both ways, plus added objects", () => {
        const { tank } = world();
        const a = tank.instantiate(); a.name = "A";
        const b = tank.instantiate(); b.name = "B";
        const flagB = new GameObject("FlagB"); flagB.transform.setParent(child(b, 2, 0).transform, false); // added inside nested
        const flagA = new GameObject("FlagA"); flagA.transform.setParent(a.transform, false);
        child(a, 1).getComponent(Aim)!.target = flagB;            // A -> B's added
        child(b, 1).getComponent(Aim)!.target = child(a, 0);      // B -> A's Hull
        child(a, 2, 0).getComponent(Aim)!.target = flagA;         // inside A -> A's added
        flagA.addComponent(Aim).target = child(b, 2, 0);          // A's added -> B's barrel
        flagB.addComponent(Pick).comp = child(a, 1).getComponent(Aim);  // B's added -> component in A
        const p = new GameObject("Player");
        p.addComponent(Aim).target = flagB;
        const l1 = saveLink();
        reload(l1);
        const l2 = saveLink();
        expect(l2).toEqual(l1);
        const [a2, b2, p2] = SceneManager.activeScene.getRootGameObjects();
        expect(child(a2, 1).getComponent(Aim)!.target?.name).toBe("FlagB");
        expect(child(a2, 1).getComponent(Aim)!.target).toBe(child(b2, 2, 0, 0));
        expect(child(b2, 1).getComponent(Aim)!.target).toBe(child(a2, 0));
        expect(child(a2, 2, 0).getComponent(Aim)!.target).toBe(child(a2, 3));
        expect(child(a2, 3).getComponent(Aim)!.target).toBe(child(b2, 2, 0));
        expect(child(b2, 2, 0, 0).getComponent(Pick)!.comp).toBe(child(a2, 1).getComponent(Aim));
        expect(p2.getComponent(Aim)!.target).toBe(child(b2, 2, 0, 0));
        // shape change in Tank and Turret prefabs: all references follow
        rebind("guid-tank", json => { json.snapshot.children.unshift({ name: "Antenna", active: true, transform: json.snapshot.transform, components: [], children: [], id: "ant01" }); });
        rebind("guid-turret", json => { json.snapshot.children.unshift({ name: "Shield", active: true, transform: json.snapshot.transform, components: [], children: [], id: "sh01" }); });
        const w = quiet();
        const [a3, b3, p3] = reload(l1);
        w.restore();
        expect(child(a3, 2).getComponent(Aim)!.target?.name).toBe("FlagB");
        expect(child(b3, 2).getComponent(Aim)!.target?.name).toBe("Hull");
        expect(child(a3, 3, 1).getComponent(Aim)!.target?.name).toBe("FlagA");
        expect(child(a3, 4).getComponent(Aim)!.target).toBe(child(b3, 3, 1));
        expect(p3.getComponent(Aim)!.target?.name).toBe("FlagB");
        // expand round trip
        const e1 = saveExpand();
        reload(e1);
        expect(saveExpand()).toEqual(e1);
    });

    test("getChanges lists A's outward reference, revertOverride puts back the prefab's value", () => {
        const { tank } = world();
        const a = tank.instantiate();
        const b = tank.instantiate();
        child(a, 1).getComponent(Aim)!.target = child(b, 0);
        const ch = tank.getChanges(a).overrides;
        expect(ch.map(o => o.field)).toEqual(["target"]);
        tank.revertOverride(a, ch[0]);
        expect(child(a, 1).getComponent(Aim)!.target).toBe(child(a, 1, 0));
        expect(tank.getChanges(a)).toEqual({ overrides: [] });
    });
});

describe("applyInstance on a nested instance with references leaving it inside added things", () => {
    test("an added child whose component points out of the nested instance", () => {
        const { tank, turret } = world();
        const t = tank.instantiate();
        const L = child(t, 1);
        const sight = new GameObject("Sight");
        sight.transform.setParent(L.transform, false);
        sight.addComponent(Aim).target = child(t, 0); // Hull: outside the Turret, inside the Tank
        turret.applyInstance(L);
        const file = JSON.stringify(turret.toJSON());
        expect(file).not.toContain('"scope"');
        clear();
        const decoy = new GameObject("Decoy");
        new GameObject("DecoyKid").transform.setParent(decoy.transform, false);
        const fresh = turret.instantiate();
        const s = child(fresh, 1);
        expect(s.name).toBe("Sight");
        expect(s.getComponent(Aim)!.target).toBeNull();
    });

    test("an added component whose field points out of the nested instance", () => {
        const { tank, turret } = world();
        const t = tank.instantiate();
        const L = child(t, 1);
        child(L, 0).addComponent(Pick).comp = child(t, 0).getComponent(Tag);
        turret.applyInstance(L);
        const file = JSON.stringify(turret.toJSON());
        expect(file).not.toContain('"scope"');
        clear();
        const fresh = turret.instantiate();
        expect(child(fresh, 0).getComponent(Pick)!.comp).toBeNull();
    });
});
