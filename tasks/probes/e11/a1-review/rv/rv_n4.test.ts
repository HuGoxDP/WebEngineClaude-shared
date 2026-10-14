import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { Tag, Aim, Pick, clear, child, obj, world, prefabFrom, saveLink, reload, quiet, GameObject, AssetDatabase, Prefab } from "../vzw/zz_probe_common";
import { Serializable, SerializedField } from "../../src/engine/core/reflection/Decorators";
import { FieldType } from "../../src/engine/core/reflection/Types";
import { Behaviour } from "../../src/engine/core/Behaviour";

@Serializable({ typeName: "Rv.Box" })
class RvBox { @SerializedField({ type: FieldType.GameObject }) public go: GameObject | null = null; }
@Serializable({ typeName: "Rv.Multi" })
class Multi extends Behaviour {
    @SerializedField({ type: FieldType.Array, elementType: FieldType.GameObject }) public gos: (GameObject | null)[] = [];
    @SerializedField({ type: FieldType.Array, elementType: FieldType.Component }) public comps: (object | null)[] = [];
    @SerializedField({ type: FieldType.Object }) public box: unknown = null;
}

beforeEach(() => clear());
afterEach(() => AssetDatabase.clear());

describe("N4: same prefab nested twice, references from outside every instance", () => {
    test("revert the whole Tank: a watcher on TurretR's Barrel stays on TurretR's (not TurretL's)", () => {
        const { tank } = world();
        const t = tank.instantiate();
        const watcher = new GameObject("Watcher");
        const m = watcher.addComponent(Multi);
        m.gos = [child(t, 2, 0), child(t, 1, 0), child(t, 2)];
        m.comps = [child(t, 2, 0).getComponent(Aim), child(t, 2).getComponent(Tag)];
        const box = new RvBox(); box.go = child(t, 2, 0); m.box = box;
        child(t, 0).getComponent(Tag)!.count = 5; // some override
        const fresh = tank.revert(t);
        expect(m.gos[0]).toBe(child(fresh, 2, 0));
        expect(m.gos[1]).toBe(child(fresh, 1, 0));
        expect(m.gos[2]).toBe(child(fresh, 2));
        expect(m.comps[0]).toBe(child(fresh, 2, 0).getComponent(Aim));
        expect(m.comps[1]).toBe(child(fresh, 2).getComponent(Tag));
        expect((m.box as RvBox).go).toBe(child(fresh, 2, 0));
    });
    test("revert TurretL nested: a watcher on TurretR's Barrel is not touched, one on TurretL's follows", () => {
        const { tank, turret } = world();
        const t = tank.instantiate();
        const watcher = new GameObject("Watcher");
        const m = watcher.addComponent(Multi);
        const rBarrel = child(t, 2, 0);
        m.gos = [rBarrel, child(t, 1, 0)];
        turret.revert(child(t, 1));
        expect(m.gos[0]).toBe(rBarrel);
        expect(m.gos[1]).toBe(child(t, 1, 0));
        expect(m.gos[1]!.exists()).toBe(true);
    });
});

describe("N4: a reference to an object the instance added, which the revert takes away", () => {
    test("added child in front of Hull, never compared (no node id yet): watcher must not end up on Hull", () => {
        const { tank } = world();
        const t = tank.instantiate();
        const flag = new GameObject("Flag");
        flag.transform.setParent(t.transform, false);
        flag.transform.setSiblingIndex(0);
        const watcher = new GameObject("Watcher");
        watcher.addComponent(Aim).target = flag;
        const w = quiet();
        const fresh = tank.revert(t);
        w.restore();
        // Flag is gone: the honest result is null (+ a warning), not the Hull.
        expect(watcher.getComponent(Aim)!.target).not.toBe(child(fresh, 0));
        expect(watcher.getComponent(Aim)!.target).toBeNull();
    });
    test("added grandchild in front of a prefab child (no node id yet): watcher must not end up on the prefab child", () => {
        const { tank } = world();
        const t = tank.instantiate();
        const scope = new GameObject("Scope");
        scope.transform.setParent(child(t, 1).transform, false);
        scope.transform.setSiblingIndex(0);
        const watcher = new GameObject("Watcher");
        watcher.addComponent(Aim).target = scope;
        const w = quiet();
        const fresh = tank.revert(t);
        w.restore();
        expect(watcher.getComponent(Aim)!.target).not.toBe(child(fresh, 1, 0));
        expect(watcher.getComponent(Aim)!.target).toBeNull();
    });
    test("same, nested revert of TurretL", () => {
        const { tank, turret } = world();
        const t = tank.instantiate();
        const scope = new GameObject("Scope");
        scope.transform.setParent(child(t, 1).transform, false);
        scope.transform.setSiblingIndex(0);
        const watcher = new GameObject("Watcher");
        watcher.addComponent(Aim).target = scope;
        const w = quiet();
        turret.revert(child(t, 1));
        w.restore();
        expect(watcher.getComponent(Aim)!.target).not.toBe(child(t, 1, 0));
        expect(watcher.getComponent(Aim)!.target).toBeNull();
    });
});

describe("N4: component occurrence when a sibling of the same type was removed", () => {
    test("Barrel has two Tags; the instance removed the first; a watcher on the second keeps the second", () => {
        const { tank } = world();
        const t = tank.instantiate();
        const barrel = child(t, 1, 0);
        const tags = barrel.getComponents(Tag);
        expect(tags.map(x => x.label)).toEqual(["barrel", "second"]);
        barrel.removeComponent(tags[0]);
        const watcher = new GameObject("Watcher");
        watcher.addComponent(Pick).comp = tags[1];
        const w = quiet();
        const fresh = tank.revert(t);
        w.restore();
        const held = watcher.getComponent(Pick)!.comp as Tag | null;
        expect(held === null ? null : held.label).toBe("second");
    });
    test("same after a link save/load (the live state the editor sees after reopening)", () => {
        const { tank } = world();
        const t = tank.instantiate();
        const barrel = child(t, 1, 0);
        const tags = barrel.getComponents(Tag);
        barrel.removeComponent(tags[0]);
        new GameObject("Watcher").addComponent(Pick).comp = tags[1];
        const roots = reload(saveLink());
        const t2 = roots.find(r => r.name === "Tank")!;
        const watcher = roots.find(r => r.name === "Watcher")!;
        expect((watcher.getComponent(Pick)!.comp as Tag).label).toBe("second");
        const w = quiet();
        tank.revert(t2);
        w.restore();
        const held = watcher.getComponent(Pick)!.comp as Tag | null;
        expect(held === null ? null : held.label).toBe("second");
    });
});

describe("N4: references survive a link round trip after the revert", () => {
    test("save -> load -> revert -> save -> load keeps the watcher on the rebuilt TurretR barrel", () => {
        const { tank } = world();
        const t = tank.instantiate();
        new GameObject("Watcher").addComponent(Aim).target = child(t, 2, 0);
        child(t, 2, 0).getComponent(Tag)!.count = 3;
        const roots = reload(saveLink());
        const t2 = roots.find(r => r.name === "Tank")!;
        tank.revert(t2);
        const s = saveLink();
        const roots2 = reload(s);
        const t3 = roots2.find(r => r.name === "Tank")!;
        const watcher = roots2.find(r => r.name === "Watcher")!;
        expect(watcher.getComponent(Aim)!.target).toBe(child(t3, 2, 0));
        expect(saveLink()).toEqual(s);
    });
});
