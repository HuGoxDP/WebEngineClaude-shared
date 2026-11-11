import { test, expect, vi } from "vitest";
import * as fs from "node:fs";
import { GameObject } from "../../src/engine/core/GameObject";
import { SceneManager } from "../../src/engine/core/SceneManager";
import { SceneSerializer } from "../../src/engine/core/serialization/SceneSerializer";
import { Prefab } from "../../src/engine/core/serialization/Prefab";
import { AssetDatabase } from "../../src/engine/core/assets/AssetDatabase";
import { StandardMaterial } from "../../src/engine/core/graphics/StandardMaterial";
import { MeshRenderer } from "../../src/engine/core/rendering/MeshRenderer";
import { Color } from "../../src/engine/core/math/Color";
import { OUT, clearScene } from "./compatFixtures";

// Triage (A5a, 2026-11-11): "failed" on master only through the environment coupling (OUT was
// one session's scratchpad; the URL read doubled the drive letter on Windows). The behavior it
// observes is the point of the scenario and is correct on master: the scene's own copy shadows
// the prefab's later edit (it stays green), while an instance made from the edited file is red.

test("prefab inline material shadowed by a scene copy", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    clearScene(); AssetDatabase.clear();
    const go = new GameObject("Box");
    const m = new StandardMaterial(); m.albedoColor = new Color(0, 1, 0, 1);
    go.addComponent(MeshRenderer).sharedMaterial = m;
    const v1 = Prefab.fromGameObject(go).toJSON() as any;
    clearScene();
    const p1 = Prefab.fromJSON(JSON.parse(JSON.stringify(v1)));
    p1.instantiate();
    const scene = SceneSerializer.serializeScene(SceneManager.activeScene);
    // The prefab file is edited: its material becomes red.
    const v2 = JSON.parse(JSON.stringify(v1));
    v2.snapshot.assets[0].fields.albedoColor = { $type: "Color", r: 1, g: 0, b: 0, a: 1 }; v2.snapshot.assets[0].fields.color = { $type: "Color", r: 1, g: 0, b: 0, a: 1 };
    // A new session: the scene is opened, then the edited prefab is instantiated.
    clearScene(); AssetDatabase.clear();
    SceneSerializer.deserializeScene(JSON.parse(JSON.stringify(scene)));
    SceneSerializer.resolvePendingAssets();
    const fresh = Prefab.fromJSON(v2).instantiate();
    const fm = fresh.getComponent(MeshRenderer)!.sharedMaterial as StandardMaterial | null;
    const c = fm?.albedoColor;
    const sceneMat = SceneManager.activeScene.getRootGameObjects()[0].getComponent(MeshRenderer)!.sharedMaterial as any;
    (globalThis as any).__dbg = { v2color: v2.snapshot.assets[0].fields.albedoColor, keys: Object.keys(v2.snapshot.assets[0].fields).slice(0,4), same: fm === sceneMat, sceneColor: sceneMat ? [sceneMat.albedoColor.r, sceneMat.albedoColor.g] : null };
    fs.writeFileSync(`${OUT}/probe-shadow.head.json`, JSON.stringify({
        sceneCarriesTable: (scene.assets ?? []).map((a: any) => a.guid), prefabTableGuid: v1.snapshot.assets[0].guid,
        freshInstanceColor: c ? [c.r, c.g, c.b] : null, dbg: (globalThis as any).__dbg,
    }));

    // The scene carries its own asset table (that is what shadows), the fresh instance takes the
    // edited prefab's red, and the two materials are distinct objects.
    expect((scene.assets ?? []).length).toBeGreaterThan(0);
    expect(c).not.toBeNull();
    expect([c!.r, c!.g, c!.b]).toEqual([1, 0, 0]);
    expect((globalThis as any).__dbg.same).toBe(false);
    expect((globalThis as any).__dbg.sceneColor).toEqual([0, 1]);
});
