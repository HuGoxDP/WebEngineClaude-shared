/**
 * Adversarial probes against 2dd3207 (prefab instances as prefab plus changes).
 * Every test here asserts the correct behaviour and FAILS at HEAD.
 */
import { describe, test, expect, beforeEach, afterEach } from "vitest";
import {
    Tag, Aim, clear, child, obj, world, prefabFrom, saveLink, reload, quiet, rebind,
    GameObject, AssetDatabase, Prefab,
} from "./zz_probe_common";

beforeEach(() => clear());
afterEach(() => AssetDatabase.clear());

describe("F1 blocker: a nested instance that falls back to 'saved in full' inside a linked instance loses its interior", () => {
    test("children of a reordered nested Turret are gone after a link round trip", () => {
        const turret = prefabFrom(() => obj("Turret", "turret", obj("Barrel", "barrel"), obj("Light", "light")), "guid-turret");
        const tank = prefabFrom(() => obj("Tank", "tank", obj("Hull", "hull"), turret.instantiate()), "guid-tank");
        const t = tank.instantiate();
        child(t, 1, 1).transform.setSiblingIndex(0); // warns "saved in full"
        const w = quiet();
        const s1 = saveLink();
        w.restore();
        const [r] = reload(s1);
        const n = child(r, 1);
        expect([0, 1].filter(i => i < n.transform.childCount).map(i => child(n, i).name)).toEqual(["Light", "Barrel"]);
    });
});

describe("F2 blocker: changes composed into a nested link are lost when they target what the outer prefab added to it", () => {
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
    test("deleted Scope comes back", () => {
        const { tank } = setup();
        const t = tank.instantiate();
        child(t, 1, 1).destroyImmediate();
        const [r] = reload(saveLink());
        expect(child(r, 1).transform.childCount).toBe(1);
    });
    test("edit to the added Tag is lost", () => {
        const { tank } = setup();
        const t = tank.instantiate();
        child(t, 1).getComponents(Tag)[1].label = "EDITED";
        const [r] = reload(saveLink());
        expect(child(r, 1).getComponents(Tag)[1].label).toBe("EDITED");
    });
    test("edit inside the added Scope is lost (and warned about as 'no longer has')", () => {
        const { tank } = setup();
        const t = tank.instantiate();
        child(t, 1, 1).getComponent(Tag)!.label = "EDITED";
        const w = quiet();
        const [r] = reload(saveLink());
        w.restore();
        expect(child(r, 1, 1).getComponent(Tag)!.label).toBe("EDITED");
    });
    test("removed added Tag comes back", () => {
        const { tank } = setup();
        const t = tank.instantiate();
        const n = child(t, 1);
        n.removeComponent(n.getComponents(Tag)[1] as never);
        const [r] = reload(saveLink());
        expect(child(r, 1).getComponents(Tag).length).toBe(1);
    });
    test("same loss through a variant", () => {
        const { tank } = setup();
        const i = tank.instantiate();
        child(i, 1, 1).getComponent(Tag)!.label = "VARIANT";
        const v = Prefab.createVariant(tank, tank.getChanges(i), "TankV");
        const w = quiet();
        const vi = v.instantiate();
        w.restore();
        expect(child(vi, 1, 1).getComponent(Tag)!.label).toBe("VARIANT");
    });
});

describe("F3 major: ids for added objects are minted mid-walk, so earlier references are positional", () => {
    test("save -> load -> save is not idempotent", () => {
        const { tank } = world();
        const player = new GameObject("Player");
        const t = tank.instantiate();
        const flag = new GameObject("Flag");
        flag.transform.setParent(t.transform, false);
        player.addComponent(Aim).target = flag;
        const s1 = saveLink();
        reload(s1);
        expect(saveLink()).toEqual(s1);
    });
    test("the positional path loses its target when the prefab drops an earlier child", () => {
        const { tank } = world();
        const player = new GameObject("Player");
        const t = tank.instantiate();
        const flag = new GameObject("Flag");
        flag.transform.setParent(t.transform, false);
        player.addComponent(Aim).target = flag;
        const s1 = saveLink();
        rebind("guid-tank", json => { json.snapshot.children.splice(0, 1); });
        const [p] = reload(s1);
        expect(p.getComponent(Aim)!.target?.name).toBe("Flag");
    });
});

describe("F4 major: a nested root's scale/active is compared on the stale shell", () => {
    test("untouched Tank reports transform.scale on its Turrets after Turret's root scale changed", () => {
        const { tank } = world();
        rebind("guid-turret", json => { json.snapshot.transform.scale = { x: 2, y: 2, z: 2 }; });
        const t = tank.instantiate();
        expect(tank.getChanges(t)).toEqual({ overrides: [] });
    });
    test("reverting that phantom override shrinks the Turret back to the stale scale", () => {
        const { tank } = world();
        rebind("guid-turret", json => { json.snapshot.transform.scale = { x: 2, y: 2, z: 2 }; });
        const t = tank.instantiate();
        const o = tank.getChanges(t).overrides.find(x => x.field === "transform.scale");
        if (o) tank.revertOverride(t, o);
        expect(child(t, 1).transform.localScale.x).toBeCloseTo(2);
    });
});

describe("F5 major: nested-instance API ignores the outer prefab's changes to it", () => {
    function tank2() {
        const turret = prefabFrom(() => obj("Turret", "turret", obj("Barrel", "barrel")), "guid-turret");
        const tank = prefabFrom(() => {
            const inner = turret.instantiate();
            child(inner, 0).getComponent(Tag)!.label = "TANK";
            return obj("Tank", "tank", obj("Hull", "hull"), inner);
        }, "guid-tank");
        return { turret, tank };
    }
    test("applyInstance(nested) pushes the Tank's customisation into the Turret prefab", () => {
        const { turret, tank } = tank2();
        const t = tank.instantiate();
        child(t, 1, 0).getComponent(Tag)!.count = 5;
        turret.applyInstance(child(t, 1));
        expect(child(turret.instantiate(), 0).getComponent(Tag)!.label).toBe("barrel");
    });
    test("Prefab.revert(nested) drops the Tank's customisation", async () => {
        const { tank } = tank2();
        const t = tank.instantiate();
        const n = child(t, 1);
        n.prefabSource!.revert(n);
        await Promise.resolve();
        expect(child(t, 1, 0).getComponent(Tag)!.label).toBe("TANK");
    });
    test("getChanges(nested) lists the Tank's customisation as a change", () => {
        const { turret, tank } = tank2();
        const t = tank.instantiate();
        expect(turret.getChanges(child(t, 1)).overrides).toEqual([]);
    });
});

describe("F6 major: getChanges / getOverrides miss a reference out of the instance that a link save records", () => {
    test("barrel aims at a scene object", () => {
        const { tank } = world();
        const player = new GameObject("Player");
        const t = tank.instantiate();
        child(t, 2, 0).getComponent(Aim)!.target = player;
        const saved = saveLink().roots[1].prefab!.changes!.overrides.length;
        expect(tank.getChanges(t).overrides.length).toBe(saved);
    });
});

describe("F7 major: reverting a removed child leaves references to it dead, and they read as overrides", () => {
    test("Turret.Aim -> Barrel after the Barrel's removal is reverted", () => {
        const { tank } = world();
        const t = tank.instantiate();
        child(t, 2, 0).destroyImmediate();
        tank.revertOverride(t, tank.getChanges(t).removedChildren![0]);
        expect(child(t, 2).getComponent(Aim)!.target).toBe(child(t, 2, 0));
        expect(tank.getChanges(t)).toEqual({ overrides: [] });
    });
});

describe("F8 major: per-field nested overrides collapse to a whole-link override on save", () => {
    test("nested prefab missing for one session", () => {
        const { tank } = world();
        const t = tank.instantiate();
        child(t, 2, 0).getComponents(Tag)[1].label = "R2";
        const s1 = saveLink();
        AssetDatabase._unbind(AssetDatabase.get("guid-turret"));
        const w = quiet();
        reload(s1);
        const s2 = saveLink();
        w.restore();
        expect(s2.roots[0].prefab!.changes!.overrides.map(o => o.field)).not.toContain("prefab");
    });
    test("a nested change becomes unused after a nested prefab edit", () => {
        const { tank } = world();
        const t = tank.instantiate();
        child(t, 2, 0).getComponents(Tag)[1].label = "R2";
        const s1 = saveLink();
        rebind("guid-turret", json => { json.snapshot.children = []; json.snapshot.components = json.snapshot.components.filter((c: any) => c.type !== "Probe.Aim"); });
        const w = quiet();
        reload(s1);
        const s2 = saveLink();
        w.restore();
        expect(s2.roots[0].prefab!.changes!.overrides.map(o => o.field)).not.toContain("prefab");
    });
});
