import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { Tag, Aim, Pick, clear, child, obj, world, prefabFrom, saveLink, saveExpand, reload, rebind, quiet, GameObject, AssetDatabase, Prefab, SceneSerializer } from "../vzw/zz_probe_common";
import { StandardMaterial } from "../../src/engine/core/graphics/StandardMaterial";
import { MeshRenderer } from "../../src/engine/core/rendering/MeshRenderer";
import { Color } from "../../src/engine/core/math/Color";
import { log } from "./log";

beforeEach(() => clear());
afterEach(() => AssetDatabase.clear());

function busy() {
    const { tank, turret, barrel } = world();
    const mat = new StandardMaterial(); mat.albedoColor = new Color(0.2, 0.4, 0.6, 1);
    const t = tank.instantiate();
    const hull = child(t, 0), L = child(t, 1), R = child(t, 2), lBarrel = child(t, 1, 0), rBarrel = child(t, 2, 0);
    hull.getComponent(Tag)!.count = 4;                                  // override
    lBarrel.getComponent(Tag)!.count = 8;                               // nested-nested override
    R.getComponent(Aim)!.target = lBarrel;                              // cross nested override
    hull.addComponent(Pick).comp = L.getComponent(Tag);                 // added component
    const tags = rBarrel.getComponents(Tag); rBarrel.removeComponent(tags[0]); // removed component
    const scope = new GameObject("Scope"); scope.transform.setParent(R.transform, false); // added under nested
    const flag = obj("Flag", "flag"); flag.transform.setParent(t.transform, false); flag.transform.setSiblingIndex(1);
    flag.addComponent(Aim).target = rBarrel;
    flag.addComponent(MeshRenderer).sharedMaterial = mat;
    const t2 = tank.instantiate();
    child(t2, 2).destroyImmediate();                                   // removed child (nested instance)
    const top = turret.instantiate();
    top.getComponent(Aim)!.target = hull;                              // top-level instance pointing into another
    const watcher = new GameObject("Watcher");
    watcher.addComponent(Aim).target = lBarrel;
    watcher.addComponent(Pick).comp = child(t2, 1).getComponent(Aim);
    watcher.addComponent(MeshRenderer).sharedMaterial = mat;
    return { tank, turret, barrel };
}

describe("idempotent save -> load -> save", () => {
    for (const mode of ["link", "expand"] as const) {
        test(`${mode}: a busy scene re-saves byte-identically twice`, () => {
            const w = quiet();
            busy();
            const save = mode === "link" ? saveLink : saveExpand;
            const s1 = JSON.stringify(save());
            reload(JSON.parse(s1));
            const s2 = JSON.stringify(save());
            reload(JSON.parse(s2));
            const s3 = JSON.stringify(save());
            log("idem", mode, "warns", w.calls());
            w.restore();
            if (s1 !== s2) log("idem", mode, "s1!=s2", s1.length, s2.length);
            expect(s2).toBe(s1);
            expect(s3).toBe(s2);
        });
    }
    test("expand then link equals link directly (same session, prefabs loaded)", () => {
        const w = quiet();
        busy();
        const l1 = JSON.stringify(saveLink());
        const e1 = JSON.stringify(saveExpand());
        reload(JSON.parse(e1));
        const l2 = JSON.stringify(saveLink());
        w.restore();
        if (l1 !== l2) log("idem", "l1", l1); if (l1 !== l2) log("idem", "l2", l2);
        expect(l2).toBe(l1);
    });
    test("link: unchanged scene re-saves byte-identically after the nested Turret prefab grows a child in front and the Tank prefab grows one in front", () => {
        const w = quiet();
        busy();
        const s1 = saveLink();
        rebind("guid-turret", json => { json.snapshot.children.unshift({ name: "Antenna", active: true, transform: json.snapshot.transform, components: [], children: [], id: "antT1" }); });
        rebind("guid-tank", json => { json.snapshot.children.unshift({ name: "Mast", active: true, transform: json.snapshot.transform, components: [], children: [], id: "mastT1" }); });
        reload(s1);
        const s2 = saveLink();
        log("idem", "growth warns", w.calls());
        w.restore();
        if (JSON.stringify(s2) !== JSON.stringify(s1)) { log("idem", "g1", JSON.stringify(s1)); log("idem", "g2", JSON.stringify(s2)); }
        expect(JSON.stringify(s2)).toBe(JSON.stringify(s1));
    });
});
