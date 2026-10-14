import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { Tag, Aim, Pick, clear, child, world, saveLink, saveExpand, reload, quiet, AssetDatabase, GameObject, SceneSerializer, Prefab } from "./zz_probe_common";

beforeEach(() => clear());
afterEach(() => AssetDatabase.clear());

test("a scene whose nested prefab is missing saves back what it read", () => {
    const { tank } = world();
    const player = new GameObject("Player");
    const t = tank.instantiate();
    child(t, 2, 0).getComponents(Tag)[1].label = "R2";
    child(t, 1).getComponent(Aim)!.target = child(t, 0);
    const s1 = saveLink();
    const turret = AssetDatabase.get("guid-turret")!;
    AssetDatabase._unbind(turret);
    const w = quiet();
    reload(s1);
    const s2 = saveLink();
    w.restore();
    expect(s2).toEqual(s1);
});

test("same, saved in expand mode then read back with the prefab present", () => {
    const { tank } = world();
    const player = new GameObject("Player");
    const t = tank.instantiate();
    child(t, 2, 0).getComponents(Tag)[1].label = "R2";
    player.addComponent(Aim).target = child(t, 2, 0);
    const s1 = saveLink();
    const turret = AssetDatabase.get("guid-turret")!;
    AssetDatabase._unbind(turret);
    const w = quiet();
    reload(s1);
    const e = saveExpand();
    w.restore();
    AssetDatabase._bindGuid("guid-turret", turret);
    const [p, t2] = reload(e);
    expect(child(t2, 2, 0).getComponents(Tag)[1].label).toBe("R2");
});

test("whole Tank prefab missing: link save is verbatim, references into it are reported", () => {
    const { tank } = world();
    const player = new GameObject("Player");
    const t = tank.instantiate();
    player.addComponent(Aim).target = child(t, 2, 0);
    const s1 = saveLink();
    AssetDatabase._unbind(tank);
    const w = quiet();
    reload(s1);
    const s2 = saveLink();
    const warned = w.calls();
    w.restore();
    expect(s2.roots[1]).toEqual(s1.roots[1]);
    expect(warned.some(m => m.includes("points into"))).toBe(true);
});
