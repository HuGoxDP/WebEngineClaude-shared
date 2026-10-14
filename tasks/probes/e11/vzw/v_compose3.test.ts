import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { Tag, Aim, Pick, clear, child, obj, prefabFrom, saveLink, saveExpand, reload, rebind, quiet, GameObject, AssetDatabase, SceneManager, Prefab, SceneSerializer } from "./zz_probe_common";
beforeEach(() => clear());
afterEach(() => AssetDatabase.clear());

/** Barrel <- Turret <- Tank; Fort holds a Tank and adds Scope (with Tag) under the Tank's Turret's Barrel, plus a Tag on that Barrel. */
function setup() {
    const barrel = prefabFrom(() => obj("Barrel", "barrel"), "guid-barrel");
    const turret = prefabFrom(() => obj("Turret", "turret", barrel.instantiate()), "guid-turret");
    const tank = prefabFrom(() => obj("Tank", "tank", obj("Hull", "hull"), turret.instantiate()), "guid-tank");
    const fort = prefabFrom(() => {
        const t = tank.instantiate();
        const b = child(t, 1, 0);
        obj("Scope", "scope").transform.setParent(b.transform, false);
        b.addComponent(Tag).label = "added-by-fort";
        const f = obj("Fort", "fort", t);
        f.addComponent(Aim).target = child(b, 0);
        return f;
    }, "guid-fort");
    return { barrel, turret, tank, fort };
}
const B = (f: GameObject) => child(f, 0, 1, 0);

describe("composition three levels deep", () => {
    test("fixture", () => {
        const { fort } = setup();
        const f = fort.instantiate();
        expect(child(B(f), 0).name).toBe("Scope");
        expect(B(f).getComponents(Tag).map(t => t.label)).toEqual(["barrel", "added-by-fort"]);
        expect(f.getComponent(Aim)!.target).toBe(child(B(f), 0));
        expect(fort.getChanges(f)).toEqual({ overrides: [] });
    });
    for (const [name, edit, check] of [
        ["delete Scope", (f: GameObject) => child(B(f), 0).destroyImmediate(), (f: GameObject) => { expect(B(f).transform.childCount).toBe(0); expect(f.getComponent(Aim)!.target).toBeNull(); }],
        ["edit added Tag", (f: GameObject) => { B(f).getComponents(Tag)[1].label = "E"; }, (f: GameObject) => expect(B(f).getComponents(Tag)[1].label).toBe("E")],
        ["edit inside Scope", (f: GameObject) => { child(B(f), 0).getComponent(Tag)!.label = "E"; }, (f: GameObject) => expect(child(B(f), 0).getComponent(Tag)!.label).toBe("E")],
        ["remove added Tag", (f: GameObject) => { B(f).removeComponent(B(f).getComponents(Tag)[1] as never); }, (f: GameObject) => expect(B(f).getComponents(Tag).length).toBe(1)],
        ["add under Scope", (f: GameObject) => { new GameObject("Dot").transform.setParent(child(B(f), 0).transform, false); }, (f: GameObject) => expect(child(B(f), 0, 0).name).toBe("Dot")],
    ] as const) {
        test(name + ": link round trip, idempotent, and a variant built from getChanges", () => {
            const { fort } = setup();
            const f = fort.instantiate();
            edit(f);
            const w = quiet();
            const s1 = saveLink();
            const [f2] = reload(s1);
            const s2 = saveLink();
            const calls = w.calls();
            w.restore();
            check(f2);
            expect(s2).toEqual(s1);
            expect(calls).toEqual([]);
            const v = Prefab.createVariant(fort, fort.getChanges(f2), "FortV");
            const vi = v.instantiate();
            check(vi);
        });
    }
    test("revertOverride of the instance's deletion of the Fort-added Scope rebuilds it and the Fort's reference to it", () => {
        const { fort } = setup();
        const f = fort.instantiate();
        child(B(f), 0).destroyImmediate();
        const ch = fort.getChanges(f);
        expect(ch.removedChildren?.length).toBe(1);
        fort.revertOverride(f, ch.removedChildren![0]);
        expect(child(B(f), 0).name).toBe("Scope");
        expect(f.getComponent(Aim)!.target).toBe(child(B(f), 0));
        expect(fort.getChanges(f)).toEqual({ overrides: [] });
    });
    test("barrel.getChanges on the deep barrel lists only the scene's change", () => {
        const { fort, barrel } = setup();
        const f = fort.instantiate();
        expect(barrel.getChanges(B(f))).toEqual({ overrides: [] });
        B(f).getComponents(Tag)[1].label = "E";
        const ch = barrel.getChanges(B(f));
        expect(ch.overrides.map(o => [o.component, o.componentIndex, o.field, o.value])).toEqual([["Probe.Tag", 1, "label", "E"]]);
        expect(ch.addedComponents ?? []).toEqual([]);
        expect(ch.addedChildren ?? []).toEqual([]);
        barrel.applyInstance(B(f));
        const fresh = barrel.instantiate();
        console.log("APPLIED barrel:", fresh.getComponents(Tag).map(t => t.label), fresh.transform.childCount);
    });
});

describe("serializeGameObject in link mode", () => {
    test("an earlier sibling's reference to an object added inside an instance is by id, and idempotent", () => {
        const barrel = prefabFrom(() => obj("Barrel", "barrel"), "guid-barrel");
        const turret = prefabFrom(() => obj("Turret", "turret", barrel.instantiate()), "guid-turret");
        const rig = new GameObject("Rig");
        const hull = obj("Hull", "hull"); hull.transform.setParent(rig.transform, false);
        const t = turret.instantiate(); t.transform.setParent(rig.transform, false);
        const flag = new GameObject("Flag"); flag.transform.setParent(child(t, 0).transform, false);
        hull.addComponent(Aim).target = flag;
        const s1 = SceneSerializer.serializeGameObject(rig, { prefabs: "link" });
        const ref = (s1.children[0].components.find(c => c.type === "Probe.Aim")!.fields as any).target;
        expect(typeof ref.path[ref.path.length - 1]).toBe("string");
        rig.destroyImmediate();
        const back = SceneSerializer.deserializeGameObject(JSON.parse(JSON.stringify(s1)));
        expect(child(back, 0).getComponent(Aim)!.target).toBe(child(back, 1, 0, 0));
        const s2 = SceneSerializer.serializeGameObject(back, { prefabs: "link" });
        expect(s2).toEqual(s1);
    });
});
