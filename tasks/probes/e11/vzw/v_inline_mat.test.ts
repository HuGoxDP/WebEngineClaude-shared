import { test, expect, beforeEach, afterEach } from "vitest";
import { clear, child, saveLink, saveExpand, reload, quiet, GameObject, AssetDatabase, SceneManager, Prefab, SceneSerializer } from "./zz_probe_common";
import { StandardMaterial } from "../../src/engine/core/graphics/StandardMaterial";
import { MeshRenderer } from "../../src/engine/core/rendering/MeshRenderer";
import { Color } from "../../src/engine/core/math/Color";
beforeEach(() => clear());
afterEach(() => AssetDatabase.clear());

function makePrefabFile(): any {
    const go = new GameObject("Box");
    const m = new StandardMaterial(); m.albedoColor = new Color(0, 1, 0, 1);
    go.addComponent(MeshRenderer).sharedMaterial = m;
    const file = Prefab.fromGameObject(go).toJSON();
    go.destroyImmediate();
    return JSON.parse(JSON.stringify(file));
}

test("same session: expand save -> reload: instance shares the prefab material, no changes", () => {
    const p = Prefab.fromJSON(makePrefabFile());
    AssetDatabase._bindGuid("guid-box", p);
    p.instantiate();
    const e = saveExpand();
    const [r] = reload(e);
    const mr = r.getComponent(MeshRenderer)!;
    const pm = p.instantiate().getComponent(MeshRenderer)!.sharedMaterial;
    console.log("SAME SESSION shares:", mr.sharedMaterial === pm, "changes:", JSON.stringify(p.getChanges(r)));
});

test("new session (autosave reopened): prefab loaded first, then the expand-saved scene", () => {
    const file = makePrefabFile();
    let p = Prefab.fromJSON(JSON.parse(JSON.stringify(file)));
    AssetDatabase._bindGuid("guid-box", p);
    p.instantiate();
    const e = JSON.parse(JSON.stringify(saveExpand()));
    // new session
    clear(); AssetDatabase.clear();
    p = Prefab.fromJSON(JSON.parse(JSON.stringify(file)));
    AssetDatabase._bindGuid("guid-box", p);
    const [r] = SceneSerializer.deserializeScene(e);
    SceneSerializer.resolvePendingAssets();
    const ch = p.getChanges(r);
    console.log("NEW SESSION changes:", JSON.stringify(ch));
    const l = saveLink();
    console.log("NEW SESSION link save:", JSON.stringify(l.roots[0].prefab), "assets:", (l.assets ?? []).length);
    // prefab edited to red afterwards: does the reopened+link-saved instance follow?
    const edited = JSON.parse(JSON.stringify(file));
    edited.snapshot.assets[0].fields.albedoColor = { $type: "Color", r: 1, g: 0, b: 0, a: 1 };
    edited.snapshot.assets[0].fields.color = { $type: "Color", r: 1, g: 0, b: 0, a: 1 };
    clear(); AssetDatabase.clear();
    AssetDatabase._bindGuid("guid-box", Prefab.fromJSON(edited));
    const [r2] = SceneSerializer.deserializeScene(JSON.parse(JSON.stringify(l)));
    SceneSerializer.resolvePendingAssets();
    const c = (r2.getComponent(MeshRenderer)!.sharedMaterial as StandardMaterial).albedoColor;
    console.log("AFTER PREFAB EDIT color:", [c.r, c.g, c.b]);
});
