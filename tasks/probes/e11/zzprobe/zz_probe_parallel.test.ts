import { test, expect, vi } from "vitest";
import { GameObject } from "../../src/engine/core/GameObject";
import { SceneManager } from "../../src/engine/core/SceneManager";
import { Resources, type IAssetSource } from "../../src/engine/core/assets/Resources";
import { AssetDatabase } from "../../src/engine/core/assets/AssetDatabase";
import { AssetFiles } from "../../src/engine/core/serialization/AssetFiles";
import { Prefab } from "../../src/engine/core/serialization/Prefab";
import { SceneSerializer } from "../../src/engine/core/serialization/SceneSerializer";
import { StandardMaterial } from "../../src/engine/core/graphics/StandardMaterial";
import { MeshRenderer } from "../../src/engine/core/rendering/MeshRenderer";

class SlowSource implements IAssetSource {
    constructor(private readonly _files: Map<string, string>) {}
    has(path: string): boolean { return this._files.has(path); }
    list(prefix = ""): string[] { return [...this._files.keys()].filter(p => p.startsWith(prefix)); }
    async readBytes(path: string): Promise<Uint8Array> {
        const file = this._files.get(path);
        if (file === undefined) throw new Error(`No such file: ${path}`);
        if (path.includes("slow")) await new Promise(r => setTimeout(r, 50));
        return new TextEncoder().encode(file);
    }
    async readText(path: string): Promise<string> { return new TextDecoder().decode(await this.readBytes(path)); }
    async getBlobUrl(path: string): Promise<string> { return `blob:${path}`; }
}

test("two unrelated parallel loads are not a cycle", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    AssetDatabase.clear();
    AssetDatabase.setManifest([
        { guid: "mat-slow", path: "assets/materials/slow.mat.json" },
        { guid: "prefab-turret", path: "assets/prefabs/turret.prefab.json" },
        { guid: "prefab-tank", path: "assets/prefabs/tank.prefab.json" },
    ]);
    // A material with a file, so the turret refers to it by id.
    const mat = new StandardMaterial();
    const matText = AssetFiles.toText(mat);
    AssetDatabase._bindGuid("mat-slow", mat);

    const turretSource = new GameObject("Turret");
    turretSource.addComponent(MeshRenderer).sharedMaterial = mat;
    new GameObject("Barrel").transform.setParent(turretSource.transform, false);
    const turret = Prefab.fromGameObject(turretSource);
    turretSource.destroyImmediate();
    AssetDatabase._bindGuid("prefab-turret", turret);

    const tankSource = new GameObject("Tank");
    turret.instantiate().transform.setParent(tankSource.transform, false);
    const tank = Prefab.fromGameObject(tankSource);
    tankSource.destroyImmediate();
    const turretText = AssetFiles.toText(turret);
    const tankText = AssetFiles.toText(tank);
    expect(SceneSerializer.assetReferences(JSON.parse(turretText).snapshot)).toContain("mat-slow");

    AssetDatabase.clearLoaded();
    Resources.useSource(new SlowSource(new Map([
        ["assets/materials/slow.mat.json", matText],
        ["assets/prefabs/turret.prefab.json", turretText],
        ["assets/prefabs/tank.prefab.json", tankText],
    ])));

    warn.mockClear();
    const turretLoad = Resources.load(Prefab, "prefabs/turret");
    const loadedTank = await Resources.load(Prefab, "prefabs/tank");
    const turretLoadedWhenTankResolved = AssetDatabase.isLoaded("prefab-turret");
    const inst = loadedTank.instantiate();
    const nested = inst.transform.getChild(0).gameObject;
    const report = {
        cycleWarnings: warn.mock.calls.map(c => String(c[0])).filter(s => s.includes("contains")),
        turretLoadedWhenTankResolved,
        nestedIsPlaceholder: nested.isPrefabAssetMissing,
        nestedChildCount: nested.transform.childCount,
        expandSaveVersion: SceneSerializer.serializeScene(SceneManager.activeScene).version,
    };
    await turretLoad;
    console.log("PARALLEL", JSON.stringify(report));
});
