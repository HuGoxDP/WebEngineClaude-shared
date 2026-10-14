import { test, expect, beforeEach, afterEach } from "vitest";
import { Aim, clear, child, obj, world, rebind, quiet, GameObject, AssetDatabase, Prefab } from "./zz_probe_common";
beforeEach(() => clear());
afterEach(() => AssetDatabase.clear());
test("prefab: ref to an object added inside a nested instance is by id", () => {
    const { turret } = world();
    const src = (() => {
        const t = turret.instantiate();
        const scope = new GameObject("Scope");
        scope.transform.setParent(child(t, 0).transform, false);
        const hull = obj("Hull", "hull");
        hull.addComponent(Aim).target = scope;
        return obj("Tank", "tank", hull, t);
    })();
    const p = Prefab.fromGameObject(src);
    src.destroyImmediate();
    AssetDatabase._bindGuid("guid-tank2", p);
    const json = JSON.stringify(p.toJSON());
    const path = (p._resolvedTree().children[0].components.find(c => c.type === "Probe.Aim")!.fields.target as any).path;
    expect(json).toContain(`"${path[path.length - 1]}"`);
    expect(typeof path[path.length - 1]).toBe("string");
    rebind("guid-barrel", j => { j.snapshot.children.unshift({ name: "Extra", active: true, transform: j.snapshot.transform, components: [], children: [], id: "extra01" }); });
    const w = quiet();
    const i = p.instantiate();
    w.restore();
    expect(child(i, 0).getComponent(Aim)!.target?.name).toBe("Scope");
});
