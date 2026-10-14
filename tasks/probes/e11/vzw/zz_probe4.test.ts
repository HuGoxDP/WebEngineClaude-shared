import { describe, test, expect, beforeEach, afterEach } from "vitest";
import {
    Tag, Aim, Pick, clear, child, obj, world, saveLink, saveExpand, reload, quiet, rebind, prefabFrom,
    GameObject, SceneSerializer, Prefab, AssetDatabase, SceneManager,
} from "./zz_probe_common";

beforeEach(() => clear());
afterEach(() => AssetDatabase.clear());

describe("probe: revert / apply on nested instances", () => {
    test("revertOverride on a change two levels down restores it and leaves no change", () => {
        const { tank } = world();
        const t = tank.instantiate();
        const rb = child(t, 2, 0);
        rb.getComponents(Tag)[1].label = "R2";
        rb.getComponents(Tag)[0].count = 7;
        const changes = tank.getChanges(t);
        expect(changes.overrides.length).toBe(2);
        tank.revertOverride(t, changes.overrides.find(o => o.field === "label")!);
        expect(rb.getComponents(Tag)[1].label).toBe("second");
        expect(rb.getComponents(Tag)[0].count).toBe(7);
        expect(tank.getChanges(t).overrides.length).toBe(1);
    });

    test("revertOverride of an outward reference inside a nested instance (scope) restores the prefab's value", () => {
        const { tank } = world();
        const t = tank.instantiate();
        const left = child(t, 1);
        const lb = child(left, 0);
        left.getComponent(Aim)!.target = child(t, 0); // turret aims at Hull instead of its barrel
        const ch = tank.getChanges(t).overrides.find(o => o.field === "target")!;
        tank.revertOverride(t, ch);
        expect(left.getComponent(Aim)!.target).toBe(lb);
        expect(tank.getChanges(t)).toEqual({ overrides: [] });
    });

    test("revertOverride of an added child inside a nested instance", () => {
        const { tank } = world();
        const t = tank.instantiate();
        const scope = new GameObject("Scope");
        scope.transform.setParent(child(t, 2, 0).transform, false);
        const ch = tank.getChanges(t);
        expect(ch.addedChildren?.length).toBe(1);
        tank.revertOverride(t, ch.addedChildren![0]);
        expect(child(t, 2, 0).transform.childCount).toBe(0);
        expect(tank.getChanges(t)).toEqual({ overrides: [] });
    });

    test("revertOverride of a removed nested child rebuilds it as the Tank prefab has it", () => {
        const { tank } = world();
        const t = tank.instantiate();
        child(t, 2, 0).destroyImmediate(); // remove right barrel
        const ch = tank.getChanges(t);
        expect(ch.removedChildren?.length).toBe(1);
        tank.revertOverride(t, ch.removedChildren![0]);
        expect(child(t, 2).transform.childCount).toBe(1);
        expect(child(t, 2).getComponent(Aim)!.target).toBe(child(t, 2, 0));
        expect(tank.getChanges(t)).toEqual({ overrides: [] });
    });

    test("Prefab.revert on a nested instance keeps what the outer prefab set on it", () => {
        const { turret } = world();
        // Tank prefab whose right turret's barrel label is changed by the Tank prefab itself.
        const tank2 = prefabFrom(() => {
            const tt = obj("Tank", "tank", obj("Hull", "hull"), turret.instantiate());
            child(tt, 1, 0).getComponents(Tag)[1].label = "TANK";
            return tt;
        }, "guid-tank2");
        const t = tank2.instantiate();
        expect(child(t, 1, 0).getComponents(Tag)[1].label).toBe("TANK");
        expect(tank2.getChanges(t)).toEqual({ overrides: [] });
        // Revert the nested Turret through its own prefab.
        const nested = child(t, 1);
        nested.prefabSource!.revert(nested);
        clearDeferred();
        expect(tank2.getChanges(t)).toEqual({ overrides: [] });
    });

    test("applyInstance with a nested change, then another instance follows after a link reload", () => {
        const { tank } = world();
        const a = tank.instantiate();
        const b = tank.instantiate();
        const s0 = saveLink();
        child(a, 2, 0).getComponents(Tag)[1].label = "APPLIED";
        tank.applyInstance(a);
        expect(tank.getChanges(a)).toEqual({ overrides: [] });
        const [ra, rb] = reload(s0);
        expect(child(rb, 2, 0).getComponents(Tag)[1].label).toBe("APPLIED");
        expect(child(ra, 2, 0).getComponents(Tag)[1].label).toBe("APPLIED");
        // The prefab file round-trips.
        const json = tank.toJSON();
        const back = Prefab.fromJSON(JSON.parse(JSON.stringify(json)));
        AssetDatabase._bindGuid("guid-tank", back);
        const c = back.instantiate();
        expect(child(c, 2, 0).getComponents(Tag)[1].label).toBe("APPLIED");
        expect(back.getChanges(c)).toEqual({ overrides: [] });
    });

    test("applyInstance of a Tank that added a component to its nested barrel; prefab file round trip", () => {
        const { tank } = world();
        const a = tank.instantiate();
        child(a, 1, 0).addComponent(Tag).label = "extra";
        tank.applyInstance(a);
        const back = Prefab.fromJSON(JSON.parse(JSON.stringify(tank.toJSON())));
        AssetDatabase._bindGuid("guid-tank", back);
        const c = back.instantiate();
        expect(child(c, 1, 0).getComponents(Tag).map(t => t.label)).toEqual(["barrel", "second", "extra"]);
        expect(back.getChanges(c)).toEqual({ overrides: [] });
        // And the original live instance has no changes against the new prefab.
        expect(back.getChanges(a)).toEqual({ overrides: [] });
    });
});

function clearDeferred(): void {
    // Run end-of-frame destruction, if the engine exposes it.
    const EO = (globalThis as any).__EngineObject;
    if (EO?._processDestroyQueue) EO._processDestroyQueue();
}

describe("probe: variants of variants", () => {
    function chain() {
        const base = prefabFrom(() => obj("Bot", "base", obj("Arm", "arm")), "guid-base");
        const i1 = base.instantiate();
        child(i1, 0).getComponent(Tag)!.label = "v1-arm";
        const v1 = Prefab.createVariant(base, base.getChanges(i1), "V1");
        i1.destroyImmediate();
        AssetDatabase._bindGuid("guid-v1", v1);
        const i2 = v1.instantiate();
        i2.getComponent(Tag)!.count = 2;
        new GameObject("Leg").transform.setParent(i2.transform, false);
        const v2 = Prefab.createVariant(v1, v1.getChanges(i2), "V2");
        i2.destroyImmediate();
        AssetDatabase._bindGuid("guid-v2", v2);
        return { base, v1, v2 };
    }

    test("V2 instance looks right", () => {
        const { v2 } = chain();
        const i = v2.instantiate();
        expect(child(i, 0).getComponent(Tag)!.label).toBe("v1-arm");
        expect(i.getComponent(Tag)!.count).toBe(2);
        expect(child(i, 1).name).toBe("Leg");
        expect(v2.getChanges(i)).toEqual({ overrides: [] });
    });

    test("files round trip and edits to the base reach V2", () => {
        const { base, v1, v2 } = chain();
        const jb = JSON.parse(JSON.stringify(base.toJSON()));
        const j1 = JSON.parse(JSON.stringify(v1.toJSON()));
        const j2 = JSON.parse(JSON.stringify(v2.toJSON()));
        expect(j1.base).toBe("guid-base");
        expect(j2.base).toBe("guid-v1");
        AssetDatabase.clear();
        jb.snapshot.components[0].fields.label = "BASE2";
        AssetDatabase._bindGuid("guid-base", Prefab.fromJSON(jb));
        AssetDatabase._bindGuid("guid-v1", Prefab.fromJSON(j1));
        const r2 = Prefab.fromJSON(j2);
        AssetDatabase._bindGuid("guid-v2", r2);
        const i = r2.instantiate();
        expect(i.getComponent(Tag)!.label).toBe("BASE2");
        expect(child(i, 0).getComponent(Tag)!.label).toBe("v1-arm");
        expect(child(i, 1).name).toBe("Leg");
        expect(r2.getChanges(i)).toEqual({ overrides: [] });
    });

    test("a V2 instance in a link scene round-trips; applyInstance on V2 keeps V1's changes", () => {
        const { v1, v2 } = chain();
        const i = v2.instantiate();
        child(i, 0).getComponent(Tag)!.count = 9;
        const s1 = saveLink();
        const [r] = reload(s1);
        expect(child(r, 0).getComponent(Tag)!.count).toBe(9);
        expect(saveLink()).toEqual(s1);
        v2.applyInstance(r);
        const fresh = v2.instantiate();
        expect(child(fresh, 0).getComponent(Tag)!.count).toBe(9);
        expect(child(fresh, 0).getComponent(Tag)!.label).toBe("v1-arm");
        // V1 untouched
        const one = v1.instantiate();
        expect(child(one, 0).getComponent(Tag)!.count).toBe(0);
    });
});
