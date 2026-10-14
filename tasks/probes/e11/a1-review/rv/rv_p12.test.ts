import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { Tag, Aim, Pick, clear, child, obj, GameObject, AssetDatabase, Prefab, SceneSerializer } from "../zzprobe/zz_probe_common";
import { PrefabDiff } from "../../src/engine/core/serialization/PrefabOverride";
beforeEach(() => clear());
afterEach(() => AssetDatabase.clear());
function source(): GameObject {
    const hull = obj("Hull", "hull"); const barrel = obj("Barrel", "barrel");
    const turretGo = obj("Turret", "turret", barrel); const tank = obj("Tank", "tank", hull, turretGo);
    tank.addComponent(Aim).target = barrel; tank.addComponent(Pick).comp = hull.getComponent(Tag);
    return tank;
}
const nodeName = (prefab: Prefab, id: string | undefined) => {
    const walk = (n: any): string | null => n.id === id ? n.name : n.children.map(walk).find((x: any) => x) ?? null;
    return walk(prefab._resolvedTree());
};
describe("#12 without path: same semantics, addressed by node", () => {
    test("edits on the source", () => {
        const go = source(); const prefab = Prefab.fromGameObject(go);
        child(go, 1, 0).getComponent(Tag)!.count = 42; child(go, 0).name = "HullRenamed";
        const ov = prefab.getOverrides(go);
        expect(ov.map(o => `${nodeName(prefab, o.node)} ${o.field}`)).toEqual(["Hull name", "Barrel count"]);
        const v = Prefab.createVariant(prefab, ov).instantiate();
        expect(child(v, 0).name).toBe("HullRenamed"); expect(child(v, 1, 0).getComponent(Tag)!.count).toBe(42);
        expect(v.getComponent(Aim)!.target).toBe(child(v, 1, 0)); expect(v.getComponent(Pick)!.comp).toBe(child(v, 0).getComponent(Tag));
    });
    test("plain copy", () => {
        const go = source(); const prefab = Prefab.fromGameObject(go);
        const copy = SceneSerializer.deserializeGameObject(SceneSerializer.serializeGameObject(go));
        child(copy, 1, 0).getComponent(Tag)!.count = 42;
        expect(prefab.getOverrides(copy).map(o => `${nodeName(prefab, o.node)} ${o.field}`)).toEqual(["Barrel count"]);
        expect(prefab.getChanges(copy).addedChildren).toBeUndefined();
    });
    test("compare against an id-less snapshot", () => {
        const go = source(); const prefab = Prefab.fromGameObject(go);
        child(go, 1, 0).getComponent(Tag)!.count = 42;
        const ov = PrefabDiff.compare(prefab._resolvedTree(), SceneSerializer.serializeGameObject(go));
        expect(ov.map(o => `${nodeName(prefab, o.node)} ${o.field}`)).toContain("Barrel count");
    });
});
