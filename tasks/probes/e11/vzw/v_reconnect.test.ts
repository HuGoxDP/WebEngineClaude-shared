import { test, expect, beforeEach, afterEach } from "vitest";
import { Tag, Aim, Pick, clear, child, obj, world, prefabFrom, saveLink, reload, quiet, GameObject, AssetDatabase } from "./zz_probe_common";
beforeEach(() => clear());
afterEach(() => AssetDatabase.clear());

test("an explicit null override survives reverting an unrelated removal (live)", () => {
    const { tank } = world();
    const t = tank.instantiate();
    child(t, 2).getComponent(Aim)!.target = null;          // explicit override: TurretR aims at nothing
    const before = tank.getChanges(t).overrides.map(o => [o.node, o.field, o.value]);
    child(t, 2, 0).destroyImmediate();                    // then the barrel is removed
    const ch = tank.getChanges(t);
    tank.revertOverride(t, ch.removedChildren![0]);
    expect(child(t, 2).getComponent(Aim)!.target).toBeNull();
    expect(tank.getChanges(t).overrides.map(o => [o.node, o.field, o.value])).toEqual(before);
});

test("an explicit null override survives reverting an unrelated removal (after a link round trip)", () => {
    const { tank } = world();
    const t = tank.instantiate();
    child(t, 2).getComponent(Aim)!.target = null;
    child(t, 2, 0).destroyImmediate();
    const [t2] = reload(saveLink());
    tank.revertOverride(t2, tank.getChanges(t2).removedChildren![0]);
    expect(child(t2, 2).getComponent(Aim)!.target).toBeNull();
});

test("an explicit null on a component reference survives reverting a removed component", () => {
    const barrel = prefabFrom(() => { const b = obj("Barrel", "barrel"); b.addComponent(Pick).comp = b.getComponent(Tag); return b; }, "guid-b");
    const i = barrel.instantiate();
    i.getComponent(Pick)!.comp = null;   // explicit override
    i.removeComponent(i.getComponent(Tag)!);
    const ch = barrel.getChanges(i);
    expect(ch.removedComponents?.length).toBe(1);
    barrel.revertOverride(i, ch.removedComponents![0]);
    expect(i.getComponent(Pick)!.comp).toBeNull();
});
