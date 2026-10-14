import { test, vi } from "vitest";
import * as fs from "node:fs";
import { SceneManager } from "../../src/engine/core/SceneManager";
import { SceneSerializer } from "../../src/engine/core/serialization/SceneSerializer";
import { Prefab } from "../../src/engine/core/serialization/Prefab";
import { OUT, clearScene, buildPrefabSource } from "./compatFixtures";

test("default-mode saves that come out as version 2", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const pose = { position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 }, scale: { x: 1, y: 1, z: 1 } };
    // A version-1 prefab file (no ids) with an unknown component that holds a reference.
    const legacy = {
        name: "Legacy",
        snapshot: {
            name: "Legacy", active: true, transform: pose,
            components: [{ type: "Ghost.Pointer", fields: { follow: { $type: "GameObjectRef", path: [0, 0] } } }],
            children: [{ name: "Kid", active: true, transform: pose, components: [], children: [] }],
        },
    };
    clearScene();
    const p = Prefab.fromJSON(JSON.parse(JSON.stringify(legacy)));
    p.instantiate();
    const scene = SceneSerializer.serializeScene(SceneManager.activeScene);
    const out: Record<string, unknown> = {
        legacyPrefabResaveVersion: (p.toJSON() as any).version ?? "absent",
        defaultSceneVersionWithLegacyPrefabInstance: scene.version,
        missingComponentDataInScene: scene.roots[0].components[0],
    };
    // A prefab made now from an object with an internal reference.
    clearScene();
    const made = Prefab.fromGameObject(buildPrefabSource());
    const file = made.toJSON();
    out.newPrefabFileVersion = (file as any).version ?? "absent";
    fs.writeFileSync(`${OUT}/head-made.prefab.json`, JSON.stringify(file));
    fs.writeFileSync(`${OUT}/probe-v2.json`, JSON.stringify(out, null, 1));
});
