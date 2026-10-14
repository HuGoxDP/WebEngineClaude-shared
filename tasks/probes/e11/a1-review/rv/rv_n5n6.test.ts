import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { Tag, Aim, Pick, clear, child, obj, world, prefabFrom, saveLink, saveExpand, reload, rebind, quiet, GameObject, AssetDatabase, Prefab } from "../vzw/zz_probe_common";
import { log } from "./log";

beforeEach(() => clear());
afterEach(() => AssetDatabase.clear());
const names = (g: GameObject) => Array.from({ length: g.transform.childCount }, (_, i) => child(g, i).name);

function pair() {
    const turret = prefabFrom(() => obj("Turret", "turret", obj("Barrel", "barrel"), obj("Light", "light")), "guid-turret");
    const tank = prefabFrom(() => obj("Tank", "tank", obj("Hull", "hull"), turret.instantiate()), "guid-tank");
    const t = tank.instantiate();
    const watcher = new GameObject("Watcher");
    watcher.addComponent(Aim).target = child(t, 1, 0); // Barrel in the copy
    watcher.addComponent(Pick).comp = child(t, 1).getComponent(Tag);
    child(t, 1, 1).transform.setSiblingIndex(0); // Light, Barrel
    return { turret, tank, t, watcher };
}

describe("N5: either half, then a link save", () => {
    for (const half of ["removed", "added"] as const) {
        test(`revert the ${half} half: one Turret, prefab order, link written, references follow, idempotent`, () => {
            const { tank, t, watcher } = pair();
            const w = quiet();
            const ch = tank.getChanges(t);
            const target = half === "removed" ? ch.removedChildren![0] : ch.addedChildren![0];
            w.restore();
            const w2 = quiet();
            tank.revertOverride(t, target);
            expect(names(t)).toEqual(["Hull", "Turret"]);
            expect(names(child(t, 1))).toEqual(["Barrel", "Light"]);
            expect(tank.getChanges(t)).toEqual({ overrides: [] });
            expect(watcher.getComponent(Aim)!.target).toBe(child(t, 1, 0));
            expect(watcher.getComponent(Pick)!.comp).toBe(child(t, 1).getComponent(Tag));
            const s = saveLink();
            const calls = w2.calls();
            w2.restore();
            expect(calls.filter(c => /reorder/i.test(c))).toEqual([]);
            expect(s.roots.find(r => r.name === "Tank")!.prefab!.changes).toEqual({ overrides: [] });
            const roots = reload(s);
            const t2 = roots.find(r => r.name === "Tank")!;
            const wt = roots.find(r => r.name === "Watcher")!;
            expect(wt.getComponent(Aim)!.target).toBe(child(t2, 1, 0));
            expect(JSON.stringify(saveLink())).toBe(JSON.stringify(s));
        });
    }
    test("pair reverted after a link round trip of the fallback", () => {
        const { tank } = pair();
        const w = quiet();
        const s = saveLink();
        const roots = reload(s);
        const t2 = roots.find(r => r.name === "Tank")!;
        expect(names(child(t2, 1))).toEqual(["Light", "Barrel"]);
        tank.revertOverride(t2, tank.getChanges(t2).removedChildren![0]);
        w.restore();
        expect(names(t2)).toEqual(["Hull", "Turret"]);
        expect(names(child(t2, 1))).toEqual(["Barrel", "Light"]);
        const wt = roots.find(r => r.name === "Watcher")!;
        expect(wt.getComponent(Aim)!.target).toBe(child(t2, 1, 0));
        expect(tank.getChanges(t2)).toEqual({ overrides: [] });
    });
});

describe("N6: after", () => {
    test("the 'after' sibling removed in the instance (live), then the prefab grows in front: order survives", () => {
        const { tank } = world();
        const t = tank.instantiate();
        const flag = new GameObject("Flag");
        flag.transform.setParent(t.transform, false);
        flag.transform.setSiblingIndex(1); // Hull, Flag, TurretL, TurretR
        const s1 = saveLink();
        log("n6", "s1 added", s1.roots[0].prefab!.changes.addedChildren);
        const [t1] = reload(s1);
        child(t1, 0).destroyImmediate(); // remove Hull: Flag, TurretL, TurretR
        const s2 = saveLink();
        log("n6", "s2 changes", s2.roots[0].prefab!.changes.addedChildren, s2.roots[0].prefab!.changes.removedChildren);
        const [t2] = reload(s2);
        expect(names(t2)).toEqual(["Flag", "Turret", "Turret"]);
        expect(JSON.stringify(saveLink())).toBe(JSON.stringify(s2));
        rebind("guid-tank", json => { json.snapshot.children.unshift({ name: "Antenna", active: true, transform: json.snapshot.transform, components: [], children: [], id: "ant01" }); });
        const [t3] = reload(s2);
        log("n6", "after growth", names(t3));
        expect(names(t3).filter(n => n !== "Antenna")).toEqual(["Flag", "Turret", "Turret"]);
    });
    test("an added child inside a nested instance stays after the nested prefab child it followed when that prefab grows in front", () => {
        const { tank } = world();
        const t = tank.instantiate();
        const scope = new GameObject("Scope");
        scope.transform.setParent(child(t, 1).transform, false); // Barrel, Scope
        const s = saveLink();
        log("n6", "nested added", JSON.stringify(s.roots[0].prefab!.changes.addedChildren));
        rebind("guid-turret", json => { json.snapshot.children.unshift({ name: "Antenna", active: true, transform: json.snapshot.transform, components: [], children: [], id: "ant02" }); });
        // Tank's file nests Turret by link: rebuild Tank against the new Turret.
        const [t2] = reload(s);
        expect(names(child(t2, 1))).toEqual(["Antenna", "Barrel", "Scope"]);
        expect(names(child(t2, 2))).toEqual(["Antenna", "Barrel"]);
    });
    test("an added child after a sibling the outer prefab adds to a nested instance, after the scene removes the nested prefab's child", () => {
        const turret = prefabFrom(() => obj("Turret", "turret", obj("Barrel", "barrel"), obj("Light", "light")), "guid-turret");
        const tank = prefabFrom(() => {
            const tu = turret.instantiate();
            const sc = obj("Scope", "scope");
            sc.transform.setParent(tu.transform, false);
            sc.transform.setSiblingIndex(1); // Barrel, Scope, Light
            return obj("Tank", "tank", obj("Hull", "hull"), tu);
        }, "guid-tank");
        const t = tank.instantiate();
        expect(names(child(t, 1))).toEqual(["Barrel", "Scope", "Light"]);
        child(t, 1, 0).destroyImmediate(); // Scope, Light
        const flag = new GameObject("Flag");
        flag.transform.setParent(child(t, 1).transform, false);
        flag.transform.setSiblingIndex(0); // Flag, Scope, Light
        const s = saveLink();
        log("n6", "outer-added changes", JSON.stringify(s.roots[0].prefab!.changes));
        const [t2] = reload(s);
        expect(names(child(t2, 1))).toEqual(["Flag", "Scope", "Light"]);
        expect(JSON.stringify(saveLink())).toBe(JSON.stringify(s));
    });
    test("several added children around prefab children survive a prefab growing children in two places, idempotently", () => {
        const { tank } = world();
        const t = tank.instantiate();
        const add = (n: string, i: number) => { const g = new GameObject(n); g.transform.setParent(t.transform, false); g.transform.setSiblingIndex(i); };
        add("F0", 0); add("F1", 2); add("F2", 3); add("F3", 6); // F0 Hull F1 F2 TL TR F3 -> wait indices
        const before = names(t);
        log("n6", "before", before);
        const s = saveLink();
        rebind("guid-tank", json => {
            json.snapshot.children.unshift({ name: "Antenna", active: true, transform: json.snapshot.transform, components: [], children: [], id: "ant03" });
            json.snapshot.children.splice(2, 0, { name: "Radar", active: true, transform: json.snapshot.transform, components: [], children: [], id: "rad03" });
        });
        const [t2] = reload(s);
        log("n6", "after", names(t2));
        expect(names(t2).filter(n => n !== "Antenna" && n !== "Radar")).toEqual(before);
        const s2 = saveLink();
        const n2 = names(t2);
        const [t3] = reload(s2);
        expect(names(t3)).toEqual(n2);
        expect(JSON.stringify(saveLink())).toBe(JSON.stringify(s2));
    });
});
