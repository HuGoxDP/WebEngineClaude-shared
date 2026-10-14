import { describe, test, expect, beforeEach, afterEach } from "vitest";
import {
    Tag, Aim, Pick, clear, child, obj, prefabFrom, quiet,
    GameObject, AssetDatabase, Prefab, SceneSerializer, SceneManager,
} from "./zz_probe_common";
import { PrefabDiff } from "../../src/engine/core/serialization/PrefabOverride";
import { StandardMaterial } from "../../src/engine/core/graphics/StandardMaterial";
import { MeshRenderer } from "../../src/engine/core/rendering/MeshRenderer";
import { Color } from "../../src/engine/core/math/Color";

beforeEach(() => clear());
afterEach(() => AssetDatabase.clear());

function source(): GameObject {
    const hull = obj("Hull", "hull");
    const barrel = obj("Barrel", "barrel");
    const turretGo = obj("Turret", "turret", barrel);
    const tank = obj("Tank", "tank", hull, turretGo);
    tank.addComponent(Aim).target = barrel;
    tank.addComponent(Pick).comp = hull.getComponent(Tag);
    return tank;
}

/**
 * The prefab node an override addresses, by name. Since A1 (#10) an override names its node by id
 * alone and writes no `path` beside it, so these probes read the node, not a position.
 */
const nodeName = (prefab: Prefab, id: string | undefined): string | null => {
    const walk = (n: any): string | null => n.id === id ? n.name : n.children.map(walk).find((x: any) => x) ?? null;
    return walk(prefab._resolvedTree());
};

describe("#12 objects without node ids", () => {
    test("untouched source of a non-connected prefab has no overrides", () => {
        const go = source();
        const prefab = Prefab.fromGameObject(go);
        expect(prefab.getOverrides(go)).toEqual([]);
    });
    test("edits on the source are matched by position, and addressed by node id", () => {
        const go = source();
        const prefab = Prefab.fromGameObject(go);
        child(go, 1, 0).getComponent(Tag)!.count = 42;
        child(go, 0).name = "HullRenamed";
        const overrides = prefab.getOverrides(go);
        expect(overrides.map(o => `${nodeName(prefab, o.node)} ${o.field}`)).toEqual(["Hull name", "Barrel count"]);
        expect(overrides.filter(o => o.path !== undefined)).toEqual([]);
        const v = Prefab.createVariant(prefab, overrides).instantiate();
        expect(child(v, 0).name).toBe("HullRenamed");
        expect(child(v, 1, 0).getComponent(Tag)!.count).toBe(42);
        expect(v.getComponent(Aim)!.target).toBe(child(v, 1, 0));
        expect(v.getComponent(Pick)!.comp).toBe(child(v, 0).getComponent(Tag));
    });
    test("plain copy", () => {
        const go = source();
        const prefab = Prefab.fromGameObject(go);
        const copy = SceneSerializer.deserializeGameObject(SceneSerializer.serializeGameObject(go));
        child(copy, 1, 0).getComponent(Tag)!.count = 42;
        const fields = prefab.getOverrides(copy).map(o => `${nodeName(prefab, o.node)} ${o.field}`);
        expect(fields).toEqual(["Barrel count"]);
        expect(prefab.getChanges(copy)).toMatchObject({ overrides: [{ field: "count" }] });
        expect(prefab.getChanges(copy).addedChildren).toBeUndefined();
    });
    test("PrefabDiff.compare against an id-less snapshot", () => {
        const go = source();
        const prefab = Prefab.fromGameObject(go);
        child(go, 1, 0).getComponent(Tag)!.count = 42;
        const snap = SceneSerializer.serializeGameObject(go);
        const fields = PrefabDiff.compare(prefab._resolvedTree(), snap).map(o => `${nodeName(prefab, o.node)} ${o.field}`);
        expect(fields).toContain("Barrel count");
    });
});

describe("#13 inline material shadow", () => {
    test("scene first, then edited prefab", () => {
        const w = quiet();
        const go = new GameObject("Box");
        const m = new StandardMaterial(); m.albedoColor = new Color(0, 1, 0, 1);
        go.addComponent(MeshRenderer).sharedMaterial = m;
        const v1 = Prefab.fromGameObject(go).toJSON() as any;
        clear();
        Prefab.fromJSON(JSON.parse(JSON.stringify(v1))).instantiate();
        const scene = SceneSerializer.serializeScene(SceneManager.activeScene);
        const v2 = JSON.parse(JSON.stringify(v1));
        v2.snapshot.assets[0].fields.albedoColor = { $type: "Color", r: 1, g: 0, b: 0, a: 1 };
        v2.snapshot.assets[0].fields.color = { $type: "Color", r: 1, g: 0, b: 0, a: 1 };
        clear(); AssetDatabase.clear();
        SceneSerializer.deserializeScene(JSON.parse(JSON.stringify(scene)));
        const fresh = Prefab.fromJSON(v2).instantiate();
        const c = (fresh.getComponent(MeshRenderer)!.sharedMaterial as StandardMaterial).albedoColor;
        w.restore();
        expect([c.r, c.g, c.b]).toEqual([1, 0, 0]);
    });
});

describe("#14 placeholder component ref", () => {
    test("warns", () => {
        const prefab = prefabFrom(() => obj("Turret", "turret", obj("Barrel", "barrel")), "guid-turret");
        const inst = prefab.instantiate();
        inst.getComponent(Tag)!.count = 7;
        const watcher = new GameObject("Watcher");
        watcher.addComponent(Pick).comp = inst.getComponent(Tag);
        const linked = SceneSerializer.serializeScene(SceneManager.activeScene, { prefabs: "link" });
        clear(); AssetDatabase.clear();
        const w = quiet();
        SceneSerializer.deserializeScene(JSON.parse(JSON.stringify(linked)));
        const calls = w.calls();
        w.restore();
        expect(calls.some(c => c.includes("Pick.comp") || c.includes(".comp "))).toBe(true);
    });
});

describe("#15 default mode version", () => {
    test("placeholder gives version 2", () => {
        const w = quiet();
        SceneSerializer.deserializeScene({ name: "X", version: 2, roots: [{
            name: "P", active: true, components: [], children: [],
            transform: { position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 }, scale: { x: 1, y: 1, z: 1 } },
            prefab: { guid: "gone", changes: { overrides: [] } },
        }] });
        w.restore();
        expect(SceneSerializer.serializeScene(SceneManager.activeScene).version).toBe(2);
    });
});
