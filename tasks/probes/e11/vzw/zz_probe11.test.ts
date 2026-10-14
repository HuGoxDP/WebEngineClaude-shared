import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { Tag, Aim, clear, child, obj, prefabFrom, saveLink, saveExpand, reload, quiet, AssetDatabase, GameObject, SceneSerializer, Prefab } from "./zz_probe_common";

beforeEach(() => clear());
afterEach(() => AssetDatabase.clear());

test("an outer prefab made while its nested prefab was not loaded: untouched instance, once it is loaded, has no changes", () => {
    const turret = prefabFrom(() => obj("Turret", "turret", obj("Barrel", "barrel")), "guid-turret");
    // The Tank is authored from a scene that was opened (expand mode) while Turret was not loaded.
    const inner = turret.instantiate();
    const e = SceneSerializer.serializeGameObject(inner);
    inner.destroyImmediate();
    AssetDatabase._unbind(turret);
    const loose = SceneSerializer.deserializeGameObject(e);
    const tankSrc = obj("Tank", "tank", obj("Hull", "hull"), loose);
    const tank = Prefab.fromGameObject(tankSrc);
    tankSrc.destroyImmediate();
    AssetDatabase._bindGuid("guid-tank", tank);
    AssetDatabase._bindGuid("guid-turret", turret);   // Turret available again
    const t = tank.instantiate();
    expect(tank.getChanges(t)).toEqual({ overrides: [] });
    const s = saveLink();
    expect(s.roots[0].prefab!.changes).toEqual({ overrides: [] });
});
