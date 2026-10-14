import { describe, test, expect, beforeEach, afterEach } from "vitest";
import {
    Tag, Aim, Pick, clear, child, obj, world, saveLink, saveExpand, reload, quiet, rebind,
    GameObject, SceneSerializer, Prefab, AssetDatabase, SceneManager,
} from "./zz_probe_common";

beforeEach(() => clear());
afterEach(() => AssetDatabase.clear());

function build() {
    const { tank } = world();
    const player = new GameObject("Player");
    const aim = player.addComponent(Aim);
    const pick = player.addComponent(Pick);
    const t = tank.instantiate();
    const left = child(t, 1);
    const right = child(t, 2);
    const rightBarrel = child(right, 0);
    aim.target = rightBarrel;
    pick.comp = rightBarrel.getComponents(Tag)[1];
    rightBarrel.getComponent(Aim)!.target = player;
    left.getComponent(Aim)!.target = child(t, 0);
    rightBarrel.getComponents(Tag)[1].label = "R2";
    return { player, t };
}

function check(roots: GameObject[]) {
    const [player, t] = roots;
    const hull = child(t, 0);
    const left = child(t, 1);
    const right = child(t, 2);
    const leftBarrel = child(left, 0);
    const rightBarrel = child(right, 0);
    expect(player.getComponent(Aim)!.target).toBe(rightBarrel);
    expect(player.getComponent(Pick)!.comp).toBe(rightBarrel.getComponents(Tag)[1]);
    expect(rightBarrel.getComponent(Aim)!.target).toBe(player);
    expect(leftBarrel.getComponent(Aim)!.target).toBeNull();
    expect(left.getComponent(Aim)!.target).toBe(hull);
    expect(right.getComponent(Aim)!.target).toBe(rightBarrel);
    expect(rightBarrel.getComponents(Tag)[1].label).toBe("R2");
    expect(leftBarrel.getComponents(Tag)[1].label).toBe("second");
}

describe("probe: three levels, same prefab twice", () => {
    test("link: save -> load -> save is idempotent and references survive", () => {
        build();
        const s1 = saveLink();
        const roots = reload(s1);
        check(roots);
        const s2 = saveLink();
        expect(s2).toEqual(s1);
        check(reload(s2));
    });

    test("expand: save -> load -> save is idempotent and references survive", () => {
        build();
        const e1 = saveExpand();
        check(reload(e1));
        const e2 = saveExpand();
        expect(e2).toEqual(e1);
    });

    test("expand -> link -> expand gives back the expand file", () => {
        build();
        const e1 = saveExpand();
        reload(e1);
        const s1 = saveLink();
        check(reload(s1));
        expect(saveExpand()).toEqual(e1);
    });

    test("an untouched tank instance has no changes", () => {
        const { tank } = world();
        const t = tank.instantiate();
        expect(tank.getChanges(t)).toEqual({ overrides: [] });
        expect(tank.getOverrides(t).filter(o => o.field !== "transform.position")).toEqual([]);
    });
});

describe("probe: load into a scene that already has objects", () => {
    test("link file loaded after existing objects", () => {
        build();
        const s1 = saveLink();
        clear();
        new GameObject("Existing A");
        new GameObject("Existing B");
        const roots = SceneSerializer.deserializeScene(JSON.parse(JSON.stringify(s1)));
        check(roots);
    });
});
