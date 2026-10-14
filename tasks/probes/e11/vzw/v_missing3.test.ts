import { test, expect, beforeEach, afterEach } from "vitest";
import { Tag, Aim, clear, child, obj, world, prefabFrom, saveLink, saveExpand, reload, rebind, quiet, GameObject, AssetDatabase, Prefab } from "./zz_probe_common";
beforeEach(() => clear());
afterEach(() => AssetDatabase.clear());
function fortWorld() {
    const w = world();
    const fort = prefabFrom(() => {
        const l = w.tank.instantiate();
        child(l, 2, 0).getComponent(Tag)!.label = "FORT";
        return obj("Fort", "fort", l);
    }, "guid-fort");
    return { ...w, fort };
}
for (const missing of ["guid-turret", "guid-barrel", "guid-tank"]) {
    test(`three levels, ${missing} missing for one session: changes come back per field`, () => {
        const { fort } = fortWorld();
        const f = fort.instantiate();
        child(f, 0, 2, 0).getComponent(Tag)!.count = 5;
        child(f, 0, 1, 0).getComponents(Tag)[1].label = "L2";
        const s1 = saveLink();
        const kept = AssetDatabase.get(missing)!;
        AssetDatabase._unbind(kept);
        const w = quiet();
        reload(s1);
        const s2 = saveLink();
        const e2 = saveExpand();
        AssetDatabase._bindGuid(missing, kept);
        const [f3] = reload(s2);
        const s3 = saveLink();
        w.restore();
        expect(s3).toEqual(s1);
        expect(child(f3, 0, 2, 0).getComponent(Tag)!.count).toBe(5);
        expect(child(f3, 0, 2, 0).getComponent(Tag)!.label).toBe("FORT");
        expect(child(f3, 0, 1, 0).getComponents(Tag)[1].label).toBe("L2");
        // the expand save made while missing also reads back
        const [f4] = reload(e2);
        expect(child(f4, 0, 2, 0).getComponent(Tag)!.count).toBe(5);
    });
}
