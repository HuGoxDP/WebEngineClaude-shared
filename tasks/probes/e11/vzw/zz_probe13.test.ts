import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { Tag, Aim, clear, child, obj, prefabFrom, saveLink, reload, quiet, AssetDatabase, GameObject, SceneSerializer, Prefab } from "./zz_probe_common";

beforeEach(() => clear());
afterEach(() => AssetDatabase.clear());

test("applying a nested instance to its own prefab applies only what the scene changed", () => {
    const turret = prefabFrom(() => obj("Turret", "turret", obj("Barrel", "barrel")), "guid-turret");
    const tank = prefabFrom(() => {
        const inner = turret.instantiate();
        child(inner, 0).getComponent(Tag)!.label = "TANK";   // the Tank prefab's own change to its Turret
        return obj("Tank", "tank", obj("Hull", "hull"), inner);
    }, "guid-tank");
    const t = tank.instantiate();
    const nested = child(t, 1);
    child(nested, 0).getComponent(Tag)!.count = 5;            // the scene's change
    turret.applyInstance(nested);
    const fresh = turret.instantiate();
    expect({ label: child(fresh, 0).getComponent(Tag)!.label, count: child(fresh, 0).getComponent(Tag)!.count })
        .toEqual({ label: "barrel", count: 5 });
});

test("revertOverride with a change from getOverrides on a nested whole-link override", () => {
    const turret = prefabFrom(() => obj("Turret", "turret", obj("Barrel", "barrel")), "guid-turret");
    const other = prefabFrom(() => obj("Other", "other"), "guid-other");
    const tank = prefabFrom(() => obj("Tank", "tank", obj("Hull", "hull"), turret.instantiate()), "guid-tank");
    const t = tank.instantiate();
    child(t, 1, 0).getComponent(Tag)!.label = "X";
    const ov = tank.getOverrides(t).find(o => o.field === "label")!;
    tank.revertOverride(t, ov);
    expect(child(t, 1, 0).getComponent(Tag)!.label).toBe("barrel");
});
