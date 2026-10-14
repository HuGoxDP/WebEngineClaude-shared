import { test, expect, beforeEach, afterEach } from "vitest";
import { Tag, clear, child, obj, prefabFrom, AssetDatabase } from "./zz_probe_common";
beforeEach(() => clear());
afterEach(() => AssetDatabase.clear());
test("getChanges on an untouched nested instance, asked of its own prefab", () => {
    const turret = prefabFrom(() => obj("Turret", "turret", obj("Barrel", "barrel")), "guid-turret");
    const tank = prefabFrom(() => {
        const inner = turret.instantiate();
        child(inner, 0).getComponent(Tag)!.label = "TANK";
        return obj("Tank", "tank", obj("Hull", "hull"), inner);
    }, "guid-tank");
    const t = tank.instantiate();
    expect(tank.getChanges(t)).toEqual({ overrides: [] });
    expect(turret.getChanges(child(t, 1)).overrides.map(o => `${o.field}=${o.value}`)).toEqual([]);
});
