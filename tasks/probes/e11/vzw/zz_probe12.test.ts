import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { Tag, Aim, clear, child, obj, prefabFrom, saveLink, reload, quiet, AssetDatabase, GameObject, SceneSerializer, Prefab } from "./zz_probe_common";
import { MeshRenderer } from "../../src/engine/core/rendering/MeshRenderer";
import { StandardMaterial } from "../../src/engine/core/graphics/StandardMaterial";

beforeEach(() => clear());
afterEach(() => AssetDatabase.clear());

test("an inline material given to an object inside a nested instance survives a link save in a fresh session", () => {
    const turret = prefabFrom(() => {
        const b = obj("Barrel", "barrel");
        b.addComponent(MeshRenderer);
        return obj("Turret", "turret", b);
    }, "guid-turret");
    const tank = prefabFrom(() => obj("Tank", "tank", obj("Hull", "hull"), turret.instantiate()), "guid-tank");
    const tankJson = JSON.parse(JSON.stringify(tank.toJSON()));
    const turretJson = JSON.parse(JSON.stringify(turret.toJSON()));
    const t = tank.instantiate();
    const mat = new StandardMaterial();
    mat.metallic = 0.42;
    child(t, 1, 0).getComponent(MeshRenderer)!.sharedMaterial = mat;
    const s1 = saveLink();
    // Fresh session: only the prefab files.
    AssetDatabase.clear();
    clear();
    AssetDatabase._bindGuid("guid-turret", Prefab.fromJSON(turretJson));
    AssetDatabase._bindGuid("guid-tank", Prefab.fromJSON(tankJson));
    const [r] = SceneSerializer.deserializeScene(JSON.parse(JSON.stringify(s1)));
    const back = child(r, 1, 0).getComponent(MeshRenderer)!.sharedMaterial as StandardMaterial | null;
    expect(back).toBeInstanceOf(StandardMaterial);
    expect(back!.metallic).toBeCloseTo(0.42);
    const s2 = saveLink();
    expect(s2.assets).toEqual(s1.assets);
});

test("left barrel aims at the right barrel (sibling nested instances), link round trip", () => {
    const turret = prefabFrom(() => {
        const b = obj("Barrel", "barrel");
        b.addComponent(Aim);
        return obj("Turret", "turret", b);
    }, "guid-turret");
    const tank = prefabFrom(() => obj("Tank", "tank", obj("Hull", "hull"), turret.instantiate(), turret.instantiate()), "guid-tank");
    const t = tank.instantiate();
    child(t, 1, 0).getComponent(Aim)!.target = child(t, 2, 0);
    child(t, 2, 0).getComponent(Aim)!.target = child(t, 1, 0);
    const s1 = saveLink();
    const [r] = reload(s1);
    expect(child(r, 1, 0).getComponent(Aim)!.target).toBe(child(r, 2, 0));
    expect(child(r, 2, 0).getComponent(Aim)!.target).toBe(child(r, 1, 0));
    expect(saveLink()).toEqual(s1);
    // Applied into the prefab, a new instance has the same wiring.
    tank.applyInstance(r);
    const n = tank.instantiate();
    expect(child(n, 1, 0).getComponent(Aim)!.target).toBe(child(n, 2, 0));
    expect(tank.getChanges(n)).toEqual({ overrides: [] });
});
