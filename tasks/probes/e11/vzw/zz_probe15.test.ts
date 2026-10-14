import { test, expect, beforeEach, afterEach } from "vitest";
import { Tag, Aim, clear, child, obj, prefabFrom, AssetDatabase, SceneManager, world } from "./zz_probe_common";
beforeEach(() => clear());
afterEach(() => AssetDatabase.clear());
test("revertOverride of a removed child in an instance that lives in a non-active scene", () => {
    const { tank } = world();
    const other = SceneManager.createScene("Other");
    const t = tank.instantiate(other);
    expect(t.scene).toBe(other);
    child(t, 0).destroyImmediate(); // Hull
    tank.revertOverride(t, tank.getChanges(t).removedChildren![0]);
    const hull = child(t, 0);
    expect(hull.name).toBe("Hull");
    expect(hull.scene).toBe(other);
});
test("Prefab.revert of an instance in a non-active scene", async () => {
    const { tank } = world();
    const other = SceneManager.createScene("Other2");
    const t = tank.instantiate(other);
    const fresh = tank.revert(t);
    expect(fresh.scene).toBe(other);
});
