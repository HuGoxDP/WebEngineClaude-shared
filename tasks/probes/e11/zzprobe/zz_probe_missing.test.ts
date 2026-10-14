import { test, vi } from "vitest";
import * as fs from "node:fs";
import { SceneManager } from "../../src/engine/core/SceneManager";
import { GameObject } from "../../src/engine/core/GameObject";
import { SceneSerializer } from "../../src/engine/core/serialization/SceneSerializer";
import { Prefab } from "../../src/engine/core/serialization/Prefab";
import { AssetDatabase } from "../../src/engine/core/assets/AssetDatabase";
import { SpriteRenderer } from "../../src/engine/core/components/SpriteRenderer";
import { CompatFollow, OUT, clearScene } from "./compatFixtures";

function makePrefab(): Prefab {
    clearScene();
    const root = new GameObject("Turret");
    root.addComponent(CompatFollow).weight = 5;
    const barrel = new GameObject("Barrel");
    barrel.transform.setParent(root.transform, false);
    barrel.addComponent(SpriteRenderer);
    const prefab = Prefab.fromGameObject(root);
    clearScene();
    return prefab;
}

test("missing prefab and versions", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const out: Record<string, unknown> = {};

    AssetDatabase.clear();
    const prefab = makePrefab();
    AssetDatabase._bindGuid("guid-turret", prefab);

    const inst = prefab.instantiate();
    inst.transform.getChild(0).gameObject.getComponent(CompatFollow) ?? null;
    inst.getComponent(CompatFollow)!.weight = 7; // an override
    const watcher = new GameObject("Watcher");
    const w = watcher.addComponent(CompatFollow);
    w.target = inst.transform.getChild(0).gameObject;          // into the instance
    w.comp = inst.getComponent(CompatFollow);                    // a component on the instance root
    w.gos = [inst];                                              // the instance root itself
    w.list = [inst.transform.getChild(0).gameObject.getComponent(SpriteRenderer)!];

    const linked = SceneSerializer.serializeScene(SceneManager.activeScene, { prefabs: "link" });
    out.linkedVersion = linked.version;
    out.watcherFieldsInFile = linked.roots[1].components[0].fields;

    // Open the file in a session where the prefab is not loaded.
    clearScene();
    AssetDatabase.clear();
    warn.mockClear();
    const roots = SceneSerializer.deserializeScene(JSON.parse(JSON.stringify(linked)));
    out.loadWarnings = warn.mock.calls.map(c => String(c[0]));
    const placeholder = roots[0];
    out.isPrefabAssetMissing = (placeholder as any).isPrefabAssetMissing;
    const lw = roots[1].getComponent(CompatFollow)!;
    out.afterLoad = { target: lw.target?.name ?? null, comp: lw.comp ? "set" : null, gos: lw.gos.map(g => g?.name ?? null), list: lw.list.map(x => x ? "set" : null) };

    warn.mockClear();
    const resavedLink = SceneSerializer.serializeScene(SceneManager.activeScene, { prefabs: "link" });
    const resavedExpand = SceneSerializer.serializeScene(SceneManager.activeScene);
    out.saveWarnings = warn.mock.calls.map(c => String(c[0]));
    out.placeholderLinkVerbatim = JSON.stringify(resavedLink.roots[0].prefab) === JSON.stringify(linked.roots[0].prefab);
    out.watcherFieldsAfterResave = resavedLink.roots[1].components[0].fields;
    out.expandVersion = resavedExpand.version;

    // Load the prefab again and reopen the resaved file: is anything gone for good?
    clearScene();
    AssetDatabase._bindGuid("guid-turret", prefab);
    const back = SceneSerializer.deserializeScene(JSON.parse(JSON.stringify(resavedLink)));
    const bw = back[1].getComponent(CompatFollow)!;
    out.afterPrefabReturns = {
        instanceWeight: back[0].getComponent(CompatFollow)?.weight ?? null,
        target: bw.target?.name ?? null, comp: bw.comp ? "set" : null, gos: bw.gos.map(g => g?.name ?? null), list: bw.list.map(x => x ? "set" : null),
    };

    // Versions.
    const tryLoad = (v: unknown): string => {
        try {
            clearScene();
            SceneSerializer.deserializeScene({ name: "X", version: v as 1, roots: [] });
            return "accepted";
        } catch (e) { return "refused: " + String((e as Error).message); }
    };
    out.versions = { v3: tryLoad(3), v2_5: tryLoad(2.5), s3: tryLoad("3"), v0: tryLoad(0), vNull: tryLoad(null), vMissing: tryLoad(undefined), v99: tryLoad(99) };
    try { Prefab.fromJSON({ name: "P", version: 3, snapshot: linked.roots[1] as any }); out.prefabV3 = "accepted"; }
    catch (e) { out.prefabV3 = "refused: " + String((e as Error).message); }
    try { SceneSerializer.deserializeGameObject({ ...(linked.roots[0] as any), version: 3 }); out.goV3 = "accepted (no version on a GameObject snapshot)"; }
    catch (e) { out.goV3 = "refused: " + String((e as Error).message); }

    fs.writeFileSync(`${OUT}/probe-missing.json`, JSON.stringify(out, null, 1));
});
