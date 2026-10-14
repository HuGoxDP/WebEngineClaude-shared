import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { Tag, Aim, clear, child, world, saveLink, reload, AssetDatabase } from "./zz_probe_common";

beforeEach(() => clear());
afterEach(() => AssetDatabase.clear());

test("after reverting a removed child, the instance has no changes and a link save records none", () => {
    const { tank } = world();
    const t = tank.instantiate();
    child(t, 2, 0).destroyImmediate();
    tank.revertOverride(t, tank.getChanges(t).removedChildren![0]);
    const after = tank.getChanges(t);
    const s = saveLink();
    expect({ after: after.overrides.map(o => `${o.node} ${o.component}.${o.field}=${JSON.stringify(o.value)}`),
             saved: s.roots[0].prefab!.changes!.overrides.map(o => `${o.node} ${o.component}.${o.field}=${JSON.stringify(o.value)}`) })
        .toEqual({ after: [], saved: [] });
});
