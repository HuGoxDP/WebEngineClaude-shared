import { describe, test, expect, beforeEach, afterEach } from "vitest";
import {
    Tag, Aim, Pick, clear, child, obj, world, saveLink, saveExpand, reload, quiet, rebind, prefabFrom,
    GameObject, SceneSerializer, Prefab, AssetDatabase, SceneManager,
} from "./zz_probe_common";
import { Vector3 } from "../../src/engine/core/math/Vector3";

beforeEach(() => clear());
afterEach(() => AssetDatabase.clear());

describe("probe: id minting order", () => {
    test("a reference written before the instance it points into mints its ids stays stable", () => {
        const { tank } = world();
        const player = new GameObject("Player");
        const t = tank.instantiate();
        const flag = new GameObject("Flag");
        flag.transform.setParent(t.transform, false);
        player.addComponent(Aim).target = flag;

        const s1 = saveLink();
        const ref1 = (s1.roots[0].components[0].fields as any).target;
        const [p2, t2] = reload(s1);
        expect(p2.getComponent(Aim)!.target).toBe(child(t2, 3));
        const s2 = saveLink();
        const ref2 = (s2.roots[0].components[0].fields as any).target;
        expect(ref2).toEqual(ref1);
        expect(s2).toEqual(s1);
    });

    test("the first save addresses an added object by id, so a prefab edit cannot retarget it", () => {
        const { tank } = world();
        const player = new GameObject("Player");
        const t = tank.instantiate();
        const flag = new GameObject("Flag");
        flag.transform.setParent(t.transform, false);
        player.addComponent(Aim).target = flag;
        const s1 = saveLink();

        // The Tank prefab gains a child in front.
        rebind("guid-tank", json => {
            json.snapshot.children.unshift({
                name: "Antenna", active: true,
                transform: { position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 }, scale: { x: 1, y: 1, z: 1 } },
                components: [], children: [], id: "antenna01",
            });
        });
        const [p2] = reload(s1);
        expect(p2.getComponent(Aim)!.target?.name).toBe("Flag");
    });

    test("inside a prefab: a reference to an object added to a nested instance, from an earlier sibling", () => {
        const { turret } = world();
        const root = new GameObject("Rig");
        const hull = new GameObject("Hull");
        hull.transform.setParent(root.transform, false);
        const inst = turret.instantiate();
        inst.transform.setParent(root.transform, false);
        const scope = new GameObject("Scope");
        scope.transform.setParent(child(inst, 0).transform, false); // under Barrel inside the Turret
        hull.addComponent(Aim).target = scope;

        const a = Prefab.fromGameObject(root);
        const b = Prefab.fromGameObject(root);
        const refA = (a.toJSON().snapshot!.children[0].components[0].fields as any).target;
        const refB = (b.toJSON().snapshot!.children[0].components[0].fields as any).target;
        expect(refA.path.slice(0, 2)).toEqual(refB.path.slice(0, 2));
        expect(typeof refA.path[refA.path.length - 1]).toBe("string");
    });
});

describe("probe: prefab edited after the scene was saved", () => {
    function scene() {
        const { tank } = world();
        const player = new GameObject("Player");
        const t = tank.instantiate();
        const right = child(t, 2);
        const rightBarrel = child(right, 0);
        player.addComponent(Aim).target = rightBarrel;
        rightBarrel.getComponents(Tag)[1].label = "R2";
        child(t, 1).getComponent(Aim)!.target = child(t, 0);
        return saveLink();
    }

    test("Turret gains a child before its Barrel", () => {
        const s1 = scene();
        rebind("guid-turret", json => {
            json.snapshot.children.unshift({
                name: "Shield", active: true,
                transform: { position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 }, scale: { x: 1, y: 1, z: 1 } },
                components: [], children: [], id: "shield01",
            });
        });
        const [player, t] = reload(s1);
        const right = child(t, 2);
        expect(right.transform.childCount).toBe(2);
        const rightBarrel = child(right, 1);
        expect(player.getComponent(Aim)!.target).toBe(rightBarrel);
        expect(rightBarrel.getComponents(Tag)[1].label).toBe("R2");
        expect(child(t, 1).getComponent(Aim)!.target).toBe(child(t, 0));
        // The turret's own reference to its barrel follows too.
        expect(right.getComponent(Aim)!.target).toBe(rightBarrel);
        // And nothing new is recorded as a change.
        const s2 = saveLink();
        expect(s2.roots[1]).toEqual(s1.roots[1]);
    });

    test("Tank gains a child before Hull", () => {
        const s1 = scene();
        rebind("guid-tank", json => {
            json.snapshot.children.unshift({
                name: "Antenna", active: true,
                transform: { position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 }, scale: { x: 1, y: 1, z: 1 } },
                components: [], children: [], id: "antenna01",
            });
        });
        const [player, t] = reload(s1);
        expect(child(t, 2).getComponent(Aim)!.target).toBe(child(t, 1));
        expect(player.getComponent(Aim)!.target).toBe(child(t, 3, 0));
        expect(saveLink().roots[1]).toEqual(s1.roots[1]);
    });

    test("Barrel removed from Turret, then put back", () => {
        const s1 = scene();
        const original = (AssetDatabase.get("guid-turret") as Prefab).toJSON();
        rebind("guid-turret", json => { json.snapshot.children = []; });
        const w = quiet();
        const [player, t] = reload(s1);
        expect(child(t, 2).transform.childCount).toBe(0);
        expect(player.getComponent(Aim)!.target).toBeNull();
        const s2 = saveLink();
        w.restore();
        AssetDatabase._bindGuid("guid-turret", Prefab.fromJSON(JSON.parse(JSON.stringify(original))));
        const [p3, t3] = reload(s2);
        expect(child(t3, 2, 0).getComponents(Tag)[1].label).toBe("R2");
    });

    test("Turret's root scale changed after Tank was made: an untouched Tank has no changes", () => {
        const { tank } = world();
        rebind("guid-turret", json => { json.snapshot.transform.scale = { x: 2, y: 2, z: 2 }; });
        const t = tank.instantiate();
        expect(child(t, 1).transform.localScale.x).toBeCloseTo(2);
        expect(tank.getChanges(t)).toEqual({ overrides: [] });
    });

    test("Turret's root scale changed after Tank was made: a link save of an untouched Tank records nothing", () => {
        const { tank } = world();
        tank.instantiate();
        const s0 = saveLink();
        rebind("guid-turret", json => { json.snapshot.transform.scale = { x: 2, y: 2, z: 2 }; });
        const [t] = reload(s0);
        expect(child(t, 1).transform.localScale.x).toBeCloseTo(2);
        const s1 = saveLink();
        expect(s1.roots[0].prefab!.changes).toEqual({ overrides: [] });
    });

    test("Turret's root deactivated after Tank was made: untouched Tank has no changes", () => {
        const { tank } = world();
        rebind("guid-turret", json => { json.snapshot.active = false; });
        const t = tank.instantiate();
        expect(child(t, 1).activeSelf).toBe(false);
        expect(tank.getChanges(t)).toEqual({ overrides: [] });
    });
});
