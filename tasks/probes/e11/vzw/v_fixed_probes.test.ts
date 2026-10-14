import { test, expect, beforeEach, afterEach } from "vitest";
import { Aim, clear, child, obj, world, prefabFrom, quiet, AssetDatabase, GameObject, Prefab } from "./zz_probe_common";
import { PrefabDiff } from "../../src/engine/core/serialization/PrefabOverride";

beforeEach(() => clear());
afterEach(() => AssetDatabase.clear());

function findAll(node: unknown, name: string, out: any[] = []): any[] {
    if (Array.isArray(node)) { node.forEach(n => findAll(n, name, out)); return out; }
    if (node && typeof node === "object") {
        const o = node as any;
        if (o.name === name && "components" in o) out.push(o);
        for (const k of Object.keys(o)) findAll(o[k], name, out);
    }
    return out;
}

test("probe3 corrected: ref to an object added in a nested instance uses the id that object is written with", () => {
    const { turret } = world();
    const root = new GameObject("Rig");
    const hull = new GameObject("Hull");
    hull.transform.setParent(root.transform, false);
    const inst = turret.instantiate();
    inst.transform.setParent(root.transform, false);
    const scope = new GameObject("Scope");
    scope.transform.setParent(child(inst, 0).transform, false);
    hull.addComponent(Aim).target = scope;
    const snap = Prefab.fromGameObject(root).toJSON().snapshot!;
    const ref = (snap.children[0].components[0].fields as any).target;
    const scopes = findAll(snap, "Scope");
    expect(scopes.length).toBe(1);
    expect(ref.path[ref.path.length - 1]).toBe(scopes[0].id);
});

test("probe9 corrected (static import): getChanges on the outer instance describes something that rebuilds it", () => {
    const turret = prefabFrom(() => obj("Turret", "turret", obj("Barrel", "barrel"), obj("Light", "light")), "guid-turret");
    const tank = prefabFrom(() => obj("Tank", "tank", obj("Hull", "hull"), turret.instantiate()), "guid-tank");
    const t = tank.instantiate();
    child(t, 1, 1).transform.setSiblingIndex(0);
    const w = quiet();
    const changes = tank.getChanges(t);
    w.restore();
    const rebuilt = PrefabDiff.applyChanges(tank._resolvedTree(), changes);
    const nestedJson = rebuilt.children[1];
    expect(nestedJson.prefab?.changes !== undefined || nestedJson.children.length === 2).toBe(true);
    expect(nestedJson.children.map((c: any) => c.name)).toEqual(["Light", "Barrel"]);
});
