import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { Tag, Aim, Pick, clear, child, obj, prefabFrom, saveLink, saveExpand, reload, quiet, AssetDatabase, GameObject, SceneSerializer, Prefab } from "./zz_probe_common";

beforeEach(() => clear());
afterEach(() => AssetDatabase.clear());

test("a nested instance that can only be saved in full, inside a linked instance, keeps its contents", () => {
    const turret = prefabFrom(() => obj("Turret", "turret", obj("Barrel", "barrel"), obj("Light", "light")), "guid-turret");
    const tank = prefabFrom(() => obj("Tank", "tank", obj("Hull", "hull"), turret.instantiate()), "guid-tank");
    const t = tank.instantiate();
    const nested = child(t, 1);
    child(nested, 1).transform.setSiblingIndex(0); // Light before Barrel: not expressible as changes
    const w = quiet();
    const s1 = saveLink();
    const warned = w.calls();
    w.restore();
    const [r] = reload(s1);
    const n2 = child(r, 1);
    expect({ warned: warned.length > 0, kids: [0, 1].filter(i => i < n2.transform.childCount).map(i => child(n2, i).name), tag: n2.getComponent(Tag)?.label ?? null })
        .toEqual({ warned: true, kids: ["Light", "Barrel"], tag: "turret" });
});

test("same, getChanges on the outer instance describes something that rebuilds it", () => {
    const turret = prefabFrom(() => obj("Turret", "turret", obj("Barrel", "barrel"), obj("Light", "light")), "guid-turret");
    const tank = prefabFrom(() => obj("Tank", "tank", obj("Hull", "hull"), turret.instantiate()), "guid-tank");
    const t = tank.instantiate();
    child(t, 1, 1).transform.setSiblingIndex(0);
    const w = quiet();
    const changes = tank.getChanges(t);
    w.restore();
    const { PrefabDiff } = require("../../src/engine/core/serialization/PrefabOverride");
    const rebuilt = PrefabDiff.applyChanges(tank._resolvedTree(), changes);
    const nestedJson = rebuilt.children[1];
    expect(nestedJson.prefab?.changes !== undefined || nestedJson.children.length === 2).toBe(true);
});
