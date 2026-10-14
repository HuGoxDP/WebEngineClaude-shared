import { test, expect, beforeEach, afterEach } from "vitest";
import { Tag, Aim, Pick, clear, child, obj, world, prefabFrom, saveLink, saveExpand, reload, rebind, quiet, GameObject, AssetDatabase, SceneManager, Prefab } from "./zz_probe_common";
beforeEach(() => clear());
afterEach(() => AssetDatabase.clear());
test("added child with an outward ref, applied from a nested Turret into Turret", () => {
    const { tank, turret } = world();
    const t = tank.instantiate();
    const L = child(t, 1);
    const sight = new GameObject("Sight");
    sight.transform.setParent(L.transform, false);
    sight.addComponent(Aim).target = child(t, 0); // Hull
    turret.applyInstance(L);
    const file = turret.toJSON();
    const sightJson = file.snapshot!.children.find(c => c.name === "Sight")!;
    console.log("SIGHT", JSON.stringify(sightJson.components));
    // fresh scene: some unrelated roots, then a top-level turret
    clear();
    const decoy = obj("Decoy", "decoy", obj("DecoyKid", "kid"));
    const w = quiet();
    const fresh = turret.instantiate();
    console.log("TOP-LEVEL target ->", (child(fresh, 1).getComponent(Aim)!.target as any)?.name ?? null, w.calls());
    // and a tank instance: what does the new Turret content resolve to inside the Tank?
    const t2 = tank.instantiate();
    console.log("IN TANK target ->", (child(t2, 1, 1).getComponent(Aim)!.target as any)?.name ?? null, "/ R:", (child(t2, 2, 1).getComponent(Aim)!.target as any)?.name ?? null);
    // file round trip of the turret prefab
    const reread = Prefab.fromJSON(JSON.parse(JSON.stringify(file)));
    const f3 = reread.instantiate();
    console.log("REREAD target ->", (child(f3, 1).getComponent(Aim)!.target as any)?.name ?? null, w.calls().slice(-3));
    // a link-saved scene with a plain turret instance, reloaded
    clear();
    const t4 = turret.instantiate();
    const s = saveLink();
    const [r4] = reload(s);
    console.log("SCENE target ->", (child(r4, 1).getComponent(Aim)!.target as any)?.name ?? null, JSON.stringify(s.roots[0].prefab));
    w.restore();
});
