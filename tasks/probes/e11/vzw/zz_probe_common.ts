import { vi } from "vitest";
import { GameObject } from "../../src/engine/core/GameObject";
import { Behaviour } from "../../src/engine/core/Behaviour";
import { SceneManager } from "../../src/engine/core/SceneManager";
import { Serializable, SerializedField } from "../../src/engine/core/reflection/Decorators";
import { FieldType } from "../../src/engine/core/reflection/Types";
import { SceneSerializer, type SerializedScene } from "../../src/engine/core/serialization/SceneSerializer";
import { Prefab } from "../../src/engine/core/serialization/Prefab";
import { AssetDatabase } from "../../src/engine/core/assets/AssetDatabase";

@Serializable({ typeName: "Probe.Tag" })
export class Tag extends Behaviour {
    @SerializedField() public label: string = "";
    @SerializedField() public count: number = 0;
}

@Serializable({ typeName: "Probe.Aim" })
export class Aim extends Behaviour {
    @SerializedField({ type: FieldType.GameObject })
    public target: GameObject | null = null;
}

@Serializable({ typeName: "Probe.Pick" })
export class Pick extends Behaviour {
    @SerializedField({ type: FieldType.Component })
    public comp: object | null = null;
}

export function clear(): void {
    for (const root of [...SceneManager.activeScene.getRootGameObjects()]) root.destroyImmediate();
}

export const child = (go: GameObject, ...path: number[]): GameObject =>
    path.reduce((cur, i) => cur.transform.getChild(i).gameObject, go);

export function obj(name: string, label: string, ...children: GameObject[]): GameObject {
    const go = new GameObject(name);
    go.addComponent(Tag).label = label;
    for (const c of children) c.transform.setParent(go.transform, false);
    return go;
}

export function prefabFrom(build: () => GameObject, guid: string): Prefab {
    const src = build();
    const p = Prefab.fromGameObject(src);
    src.destroyImmediate();
    AssetDatabase._bindGuid(guid, p);
    return p;
}

/** Replaces the prefab bound under `guid` with one read from edited JSON. */
export function rebind(guid: string, edit: (json: any) => void): Prefab {
    const current = AssetDatabase.get(guid) as Prefab;
    const json = JSON.parse(JSON.stringify(current.toJSON()));
    edit(json);
    const next = Prefab.fromJSON(json);
    AssetDatabase._bindGuid(guid, next);
    return next;
}

export const saveLink = (): SerializedScene =>
    SceneSerializer.serializeScene(SceneManager.activeScene, { prefabs: "link" });
export const saveExpand = (): SerializedScene =>
    SceneSerializer.serializeScene(SceneManager.activeScene);

export function reload(json: SerializedScene): GameObject[] {
    clear();
    return SceneSerializer.deserializeScene(JSON.parse(JSON.stringify(json)));
}

export function quiet(): { calls: () => string[]; restore: () => void } {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    return {
        calls: () => spy.mock.calls.map(c => String(c[0])),
        restore: () => spy.mockRestore(),
    };
}

/**
 * Barrel (two Tags + Aim) <- Turret (Tag + Aim -> its Barrel) <- Tank (Tag, Hull, Turret L, Turret R).
 */
export function world(): { barrel: Prefab; turret: Prefab; tank: Prefab } {
    const barrel = prefabFrom(() => {
        const b = obj("Barrel", "barrel");
        b.addComponent(Tag).label = "second";
        b.addComponent(Aim);
        return b;
    }, "guid-barrel");
    const turret = prefabFrom(() => {
        const b = barrel.instantiate();
        const t = obj("Turret", "turret", b);
        t.addComponent(Aim).target = b;
        return t;
    }, "guid-turret");
    const tank = prefabFrom(
        () => obj("Tank", "tank", obj("Hull", "hull"), turret.instantiate(), turret.instantiate()),
        "guid-tank",
    );
    return { barrel, turret, tank };
}

export { GameObject, SceneSerializer, Prefab, AssetDatabase, SceneManager };
