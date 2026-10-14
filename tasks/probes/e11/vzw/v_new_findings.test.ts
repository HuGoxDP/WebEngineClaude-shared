/**
 * Verifier probes against e6a8500. Each asserts the correct behaviour; the ones marked
 * "regression" pass at 2dd3207.
 */
import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { Tag, Aim, Pick, clear, child, obj, world, prefabFrom, saveLink, saveExpand, reload, rebind, quiet, GameObject, AssetDatabase, Prefab, SceneSerializer } from "./zz_probe_common";
import { StandardMaterial } from "../../src/engine/core/graphics/StandardMaterial";
import { MeshRenderer } from "../../src/engine/core/rendering/MeshRenderer";
import { Color } from "../../src/engine/core/math/Color";

beforeEach(() => clear());
afterEach(() => AssetDatabase.clear());
const names = (g: GameObject) => Array.from({ length: g.transform.childCount }, (_, i) => child(g, i).name);

describe("N1 regression (0f3bde1): nested applyInstance applies references that leave the instance inside added objects", () => {
    test("added child", () => {
        const { tank, turret } = world();
        const t = tank.instantiate();
        const sight = new GameObject("Sight");
        sight.transform.setParent(child(t, 1).transform, false);
        sight.addComponent(Aim).target = child(t, 0);
        turret.applyInstance(child(t, 1));
        expect(JSON.stringify(turret.toJSON())).not.toContain('"scope"');
        expect(child(tank.instantiate(), 2, 1).getComponent(Aim)!.target).toBeNull();
        clear();
        turret.instantiate();
        expect(saveLink().roots[0].prefab!.changes).toEqual({ overrides: [] });
    });
    test("added component", () => {
        const { tank, turret } = world();
        const t = tank.instantiate();
        child(t, 1, 0).addComponent(Pick).comp = child(t, 0).getComponent(Tag);
        turret.applyInstance(child(t, 1));
        expect(JSON.stringify(turret.toJSON())).not.toContain('"scope"');
    });
});

describe("N2 regression (4a192c7): reverting a removal overwrites an explicit null override", () => {
    test("GameObject reference", () => {
        const { tank } = world();
        const t = tank.instantiate();
        child(t, 2).getComponent(Aim)!.target = null;
        child(t, 2, 0).destroyImmediate();
        tank.revertOverride(t, tank.getChanges(t).removedChildren![0]);
        expect(child(t, 2).getComponent(Aim)!.target).toBeNull();
    });
    test("component reference", () => {
        const barrel = prefabFrom(() => { const b = obj("Barrel", "barrel"); b.addComponent(Pick).comp = b.getComponent(Tag); return b; }, "guid-b");
        const i = barrel.instantiate();
        i.getComponent(Pick)!.comp = null;
        i.removeComponent(i.getComponent(Tag)!);
        barrel.revertOverride(i, barrel.getChanges(i).removedComponents![0]);
        expect(i.getComponent(Pick)!.comp).toBeNull();
    });
});

describe("N3 regression (4417fd2): an expand-saved scene reopened in a new session detaches instances from the prefab's inline material", () => {
    test("no phantom sharedMaterial change, and a prefab edit still reaches the instance", () => {
        const go = new GameObject("Box");
        const m = new StandardMaterial(); m.albedoColor = new Color(0, 1, 0, 1);
        go.addComponent(MeshRenderer).sharedMaterial = m;
        const file = JSON.parse(JSON.stringify(Prefab.fromGameObject(go).toJSON()));
        go.destroyImmediate();
        AssetDatabase._bindGuid("guid-box", Prefab.fromJSON(JSON.parse(JSON.stringify(file))));
        (AssetDatabase.get("guid-box") as Prefab).instantiate();
        const e = JSON.parse(JSON.stringify(saveExpand()));
        clear(); AssetDatabase.clear();
        const p = Prefab.fromJSON(JSON.parse(JSON.stringify(file)));
        AssetDatabase._bindGuid("guid-box", p);
        const [r] = SceneSerializer.deserializeScene(e);
        SceneSerializer.resolvePendingAssets();
        expect(p.getChanges(r)).toEqual({ overrides: [] });
    });
});

describe("N4 (pre-existing): nested revert drops a sibling's override that points into the reverted instance", () => {
    test("TurretR aims at TurretL's barrel; revert TurretL", () => {
        const { tank, turret } = world();
        const t = tank.instantiate();
        child(t, 2).getComponent(Aim)!.target = child(t, 1, 0);
        turret.revert(child(t, 1));
        expect(child(t, 2).getComponent(Aim)!.target).toBe(child(t, 1, 0));
    });
});

describe("N5: reverting the removal half of a reorder's remove+add pair duplicates the nested instance", () => {
    test("no two live nodes share an id", () => {
        const turret = prefabFrom(() => obj("Turret", "turret", obj("Barrel", "barrel"), obj("Light", "light")), "guid-turret");
        const tank = prefabFrom(() => obj("Tank", "tank", obj("Hull", "hull"), turret.instantiate()), "guid-tank");
        const t = tank.instantiate();
        child(t, 1, 1).transform.setSiblingIndex(0);
        const w = quiet();
        tank.revertOverride(t, tank.getChanges(t).removedChildren![0]);
        w.restore();
        expect(names(t)).toEqual(["Hull", "Turret"]);
    });
});

describe("N6 (design): an added child's index is absolute", () => {
    test("after the prefab gains a child in front, an added last child stays last", () => {
        const { tank } = world();
        const t = tank.instantiate();
        new GameObject("Flag").transform.setParent(t.transform, false);
        const s = saveLink();
        rebind("guid-tank", json => { json.snapshot.children.unshift({ name: "Antenna", active: true, transform: json.snapshot.transform, components: [], children: [], id: "ant01" }); });
        const [t2] = reload(s);
        expect(names(t2)).toEqual(["Antenna", "Hull", "Turret", "Turret", "Flag"]);
    });
});
