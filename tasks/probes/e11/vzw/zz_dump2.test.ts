import { test } from "vitest";
import { Aim, clear, child, world, GameObject, Prefab } from "./zz_probe_common";
test("dump", () => {
    clear();
    const { turret } = world();
    const root = new GameObject("Rig");
    const hull = new GameObject("Hull");
    hull.transform.setParent(root.transform, false);
    const inst = turret.instantiate();
    inst.transform.setParent(root.transform, false);
    const scope = new GameObject("Scope");
    scope.transform.setParent(child(inst, 0).transform, false);
    hull.addComponent(Aim).target = scope;
    const snap = Prefab.fromGameObject(root).toJSON().snapshot!;
    const strip = (n: any): any => { n.transform = "…"; n.children?.forEach(strip); return n; };
    strip(snap);
    require("fs").writeFileSync(process.env.OUT!, JSON.stringify(snap, null, 1));
});
