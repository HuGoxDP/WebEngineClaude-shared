import { test, expect, beforeEach, afterEach } from "vitest";
import { Tag, clear, child, world, AssetDatabase } from "./zz_probe_common";
import { Vector3 } from "../../src/engine/core/math/Vector3";
beforeEach(() => clear());
afterEach(() => AssetDatabase.clear());
test("revert keeps the instance's own position (a default override)", () => {
    const { tank } = world();
    const t = tank.instantiate();
    t.transform.localPosition = new Vector3(5, 0, 0);
    t.getComponent(Tag)!.label = "changed";
    const fresh = tank.revert(t);
    expect(fresh.transform.localPosition.x).toBeCloseTo(5);
});
