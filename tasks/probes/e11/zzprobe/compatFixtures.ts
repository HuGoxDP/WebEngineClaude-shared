// Shared between the bde23fc tree and the HEAD tree: identical file in both.
import { GameObject } from "../../src/engine/core/GameObject";
import { Behaviour } from "../../src/engine/core/Behaviour";
import { Component } from "../../src/engine/core/Component";
import { SceneManager } from "../../src/engine/core/SceneManager";
import { Vector3 } from "../../src/engine/core/math/Vector3";
import { Quaternion } from "../../src/engine/core/math/Quaternion";
import { Color } from "../../src/engine/core/math/Color";
import { Serializable, SerializedField, getAllFields } from "../../src/engine/core/reflection/Decorators";
import { TypeRegistry } from "../../src/engine/core/reflection/TypeRegistry";
import { FieldType } from "../../src/engine/core/reflection/Types";
import { Camera } from "../../src/engine/core/components/Camera";
import { DirectionalLight } from "../../src/engine/core/components/DirectionalLight";
import { PointLight } from "../../src/engine/core/components/PointLight";
import { RectTransform } from "../../src/engine/core/ui/RectTransform";
import { CanvasGroup } from "../../src/engine/core/ui/CanvasGroup";
import { LayoutElement } from "../../src/engine/core/ui/LayoutElement";
import { VerticalLayoutGroup } from "../../src/engine/core/ui/LayoutGroup";
import { ContentSizeFitter } from "../../src/engine/core/ui/ContentSizeFitter";
import { RectMask2D } from "../../src/engine/core/ui/RectMask2D";
import { UIImage } from "../../src/engine/core/ui/UIImage";
import { UIText } from "../../src/engine/core/ui/UIText";
import { Button } from "../../src/engine/core/ui/Button";
import { Toggle } from "../../src/engine/core/ui/Toggle";
import { ToggleGroup } from "../../src/engine/core/ui/ToggleGroup";
import { Slider } from "../../src/engine/core/ui/Slider";
import { Scrollbar } from "../../src/engine/core/ui/Scrollbar";
import { Canvas, CanvasRenderMode } from "../../src/engine/core/ui/Canvas";
import { CanvasScaler } from "../../src/engine/core/ui/CanvasScaler";
import { ScrollRect } from "../../src/engine/core/ui/ScrollRect";
import { Dropdown } from "../../src/engine/core/ui/Dropdown";
import { SpriteRenderer } from "../../src/engine/core/components/SpriteRenderer";
import { LODGroup } from "../../src/engine/core/components/LODGroup";
import { MeshFilter } from "../../src/engine/core/rendering/MeshFilter";
import { MeshRenderer } from "../../src/engine/core/rendering/MeshRenderer";
import { StandardMaterial } from "../../src/engine/core/graphics/StandardMaterial";
import { Mesh } from "../../src/engine/core/graphics/Mesh";
import { Rigidbody } from "../../src/engine/physics/Rigidbody";
import { BoxCollider } from "../../src/engine/physics/BoxCollider";
import { CinemachineVirtualCamera } from "../../src/engine/core/cinemachine/CinemachineVirtualCamera";
import { CinemachineBrain } from "../../src/engine/core/cinemachine/CinemachineBrain";
import { CinemachineOrbitalBody } from "../../src/engine/core/cinemachine/CinemachineOrbitalBody";
import { CinemachineFollowBody } from "../../src/engine/core/cinemachine/CinemachineFollowBody";
import { CinemachineHardLookAtAim } from "../../src/engine/core/cinemachine/CinemachineHardLookAtAim";
import { PostProcessVolume } from "../../src/engine/core/postprocessing/PostProcessVolume";
import { BloomEffect } from "../../src/engine/core/postprocessing/BloomEffect";
import { VignetteEffect } from "../../src/engine/core/postprocessing/VignetteEffect";
import { AssetDatabase } from "../../src/engine/core/assets/AssetDatabase";
import { RenderSettings } from "../../src/engine/core/RenderSettings";
import { MissingComponent, MissingValue } from "../../src/engine/core/serialization/MissingComponent";

export const OUT = "/tmp/claude-0/-home-user/18df1101-ad89-5883-a34b-4290928909de/scratchpad/myout";

@Serializable({ typeName: "Compat.Settings" })
export class CompatSettings {
    @SerializedField({ type: FieldType.GameObject })
    public anchor: GameObject | null = null;

    @SerializedField()
    public gain: number = 1;
}

@Serializable({ typeName: "Compat.Follow" })
export class CompatFollow extends Behaviour {
    @SerializedField({ type: FieldType.GameObject })
    public target: GameObject | null = null;

    @SerializedField()
    public weight: number = 1;

    @SerializedField({ type: FieldType.Component })
    public comp: object | null = null;

    @SerializedField({ type: FieldType.Array, elementType: FieldType.Component })
    public list: object[] = [];

    @SerializedField({ type: FieldType.Array, elementType: FieldType.GameObject })
    public gos: (GameObject | null)[] = [];

    @SerializedField({ type: FieldType.Object })
    public settings: unknown = null;

    @SerializedField({ type: FieldType.Vector3 })
    public offset: Vector3 = new Vector3(0, 0, 0);
}

/** Everything the dump needs, independent of either serializer. */
export function clearScene(): void {
    for (const root of [...SceneManager.activeScene.getRootGameObjects()]) root.destroyImmediate();
    try { (Canvas as any)._reset?.(); } catch { /* ignore */ }
}

function round(n: unknown): unknown {
    return typeof n === "number" ? Math.round(n * 1e5) / 1e5 : n;
}

function namePath(go: GameObject): string {
    const parts: string[] = [];
    for (let t: any = go.transform; t !== null; t = t.parent) {
        const parent = t.parent;
        const idx = parent ? parent._children.indexOf(t) : SceneManager.activeScene.getRootGameObjects().indexOf(t.gameObject);
        parts.unshift(`${t.gameObject.name}[${idx}]`);
    }
    return parts.join("/");
}

function typeNameOf(c: object): string {
    if (c instanceof MissingComponent) return "Missing:" + c.originalType;
    return TypeRegistry.getTypeName(c) ?? (c as object).constructor.name;
}

export function makeDumper() {
    const ids = new Map<object, number>();
    const describe = (v: unknown, depth: number): unknown => {
        if (v === null || v === undefined) return v ?? null;
        if (typeof v !== "object") return round(v);
        if (Array.isArray(v)) return v.map(x => describe(x, depth));
        if (v instanceof GameObject) return "GO:" + namePath(v);
        if (v instanceof Component) {
            const owner = v.gameObject;
            const comps = (owner as any)._components as object[];
            const same = comps.filter(c => c.constructor === v.constructor);
            return `C:${namePath(owner)}:${typeNameOf(v)}#${same.indexOf(v)}`;
        }
        if (v instanceof MissingValue) return { missingValue: v.type, fields: v.fields };
        const ctor = (v as object).constructor;
        const name = ctor?.name ?? "Object";
        const isAsset = /Material|Texture|Mesh|Sprite/.test(name);
        if (isAsset) {
            if (!ids.has(v as object)) ids.set(v as object, ids.size);
            const head = `Asset:${name}#${ids.get(v as object)}`;
            if (depth > 1) return head;
            const fields = TypeRegistry.getTypeName(v) !== null ? getAllFields(ctor as any) : [];
            const out: Record<string, unknown> = { asset: head };
            for (const f of fields) if (f.serialize) out[f.name] = describe((v as any)[f.name], depth + 1);
            if (name === "Mesh") out.vertexCount = (v as any).vertexCount ?? null;
            return out;
        }
        if (depth > 4) return `<${name}>`;
        const fields = TypeRegistry.getTypeName(v) !== null ? getAllFields(ctor as any) : [];
        const out: Record<string, unknown> = { $c: name };
        if (fields.length > 0) {
            for (const f of fields) if (f.serialize) out[f.name] = describe((v as any)[f.name], depth + 1);
        } else {
            for (const k of Object.keys(v as object)) {
                if (k.startsWith("_") && !/^_[xyzwrgba]$/.test(k)) continue;
                const val = (v as any)[k];
                if (typeof val === "function") continue;
                out[k] = describe(val, depth + 1);
            }
        }
        return out;
    };

    const dumpGO = (go: GameObject): unknown => {
        const t = go.transform;
        const comps = ((go as any)._components as object[]).filter(c => c !== t);
        return {
            name: go.name,
            active: go.activeSelf,
            pos: [t.localPosition.x, t.localPosition.y, t.localPosition.z].map(round),
            rot: [t.localRotation.x, t.localRotation.y, t.localRotation.z, t.localRotation.w].map(round),
            scale: [t.localScale.x, t.localScale.y, t.localScale.z].map(round),
            world: [t.position.x, t.position.y, t.position.z].map(round),
            components: comps.map(c => {
                if (c instanceof MissingComponent) return { type: typeNameOf(c), fields: c.originalFields };
                const fields: Record<string, unknown> = {};
                for (const f of getAllFields(c.constructor as any)) {
                    if (!f.serialize) continue;
                    let val: unknown;
                    try { val = (c as any)[f.name]; } catch (e) { val = "THROW:" + String(e); }
                    fields[f.name] = describe(val, 0);
                }
                return { type: typeNameOf(c), fields };
            }),
            children: Array.from({ length: t.childCount }, (_, i) => dumpGO(t.getChild(i).gameObject)),
        };
    };
    return { dumpGO, describe };
}

export function dumpRoots(roots: readonly GameObject[]): unknown {
    const d = makeDumper();
    return roots.map(r => d.dumpGO(r));
}

export function dumpRenderSettings(): unknown {
    return {
        fog: RenderSettings.fog,
        fogColor: [RenderSettings.fogColor.r, RenderSettings.fogColor.g, RenderSettings.fogColor.b, RenderSettings.fogColor.a].map(round),
        fogMode: RenderSettings.fogMode,
        fogStart: RenderSettings.fogStartDistance,
        fogEnd: RenderSettings.fogEndDistance,
        fogDensity: RenderSettings.fogDensity,
        ambient: [RenderSettings.ambientColor.r, RenderSettings.ambientColor.g, RenderSettings.ambientColor.b].map(round),
    };
}

// ---------------------------------------------------------------- scene builders

function child(name: string, parent: GameObject, pos?: [number, number, number]): GameObject {
    const go = new GameObject(name);
    go.transform.setParent(parent.transform, false);
    if (pos) go.transform.localPosition = new Vector3(...pos);
    return go;
}

/** References of every kind, across roots and into children, with offset parents. */
export function buildRefs(): void {
    const player = new GameObject("Player");
    const cam = new GameObject("Camera");
    const camComp = cam.addComponent(Camera);
    cam.transform.localPosition = new Vector3(0, 3, -10);

    const vehicle = new GameObject("Vehicle");
    vehicle.transform.localPosition = new Vector3(1, 2, 3);
    vehicle.transform.localRotation = Quaternion.euler(0, 90, 0);
    vehicle.transform.localScale = new Vector3(2, 2, 2);
    const wheelA = child("WheelA", vehicle, [0, 0.5, 0]);
    const wheelB = child("WheelB", vehicle, [0, 0.5, 1]);
    const bolt = child("Bolt", wheelB, [0.25, 0, 0]);
    bolt.transform.localRotation = Quaternion.euler(10, 20, 30);
    const imgA = wheelA.addComponent(SpriteRenderer);
    const imgB1 = wheelB.addComponent(SpriteRenderer);
    const imgB2 = wheelB.addComponent(SpriteRenderer);

    const f = player.addComponent(CompatFollow);
    f.target = cam;
    f.weight = 2.5;
    f.comp = camComp;
    f.list = [imgA, imgB2, imgB1, bolt.transform];
    f.gos = [bolt, null, wheelA];
    const s = new CompatSettings();
    s.anchor = bolt;
    s.gain = 0.75;
    f.settings = s;
    f.offset = new Vector3(1, 2, 3);

    const inner = wheelA.addComponent(CompatFollow);
    inner.target = player;
    inner.comp = imgB2;

    const light = new GameObject("Sun");
    light.addComponent(DirectionalLight).intensity = 1.7;
    const pl = child("Bulb", light, [0, 4, 0]).addComponent(PointLight);
    pl.range = 12;

    const rbGo = new GameObject("Crate");
    rbGo.transform.localPosition = new Vector3(5, 0, 0);
    rbGo.addComponent(BoxCollider);
    rbGo.addComponent(Rigidbody).mass = 3;
    child("Inactive", rbGo, [0, 1, 0]).setActive(false);
}

export function buildUI(): void {
    const root = new GameObject("UIRoot");
    const canvas = root.addComponent(Canvas);
    canvas.renderMode = CanvasRenderMode.ScreenSpaceOverlay;
    root.addComponent(CanvasScaler);
    root.addComponent(RectTransform);

    const panel = child("Panel", root);
    const prt = panel.addComponent(RectTransform);
    prt.anchoredPosition.set(10, 20);
    panel.addComponent(CanvasGroup).alpha = 0.5;
    panel.addComponent(VerticalLayoutGroup);
    panel.addComponent(ContentSizeFitter);
    panel.addComponent(RectMask2D);

    const btnGo = child("Button", panel);
    btnGo.addComponent(RectTransform);
    btnGo.addComponent(LayoutElement).preferredHeight = 40;
    const btn = btnGo.addComponent(Button);
    const bg = child("Bg", btnGo);
    bg.addComponent(RectTransform);
    btn.targetGraphic = bg.addComponent(UIImage);
    const label = child("Label", btnGo);
    label.addComponent(RectTransform);
    label.addComponent(UIText).text = "Press";

    const group = child("Group", panel).addComponent(ToggleGroup);
    for (const n of ["T1", "T2"]) {
        const tg = child(n, group.gameObject);
        tg.addComponent(RectTransform);
        tg.addComponent(Toggle).group = group;
    }

    const sliderGo = child("Slider", panel);
    sliderGo.addComponent(RectTransform);
    const slider = sliderGo.addComponent(Slider);
    slider.value = 0.3;

    const scrollGo = child("Scroll", panel);
    scrollGo.addComponent(RectTransform);
    const scroll = scrollGo.addComponent(ScrollRect);
    const content = child("Content", scrollGo);
    scroll.content = content.addComponent(RectTransform);
    const barGo = child("Bar", scrollGo);
    barGo.addComponent(RectTransform);
    const bar = barGo.addComponent(Scrollbar);
    scroll.verticalScrollbar = bar;

    const ddGo = child("Dropdown", panel);
    ddGo.addComponent(RectTransform);
    const dd = ddGo.addComponent(Dropdown);
    (dd as any).options = ["a", "b", "c"];
}

export function buildLOD(): { mat: StandardMaterial } {
    const root = new GameObject("Rock");
    root.transform.localPosition = new Vector3(-4, 1, 2);
    const group = root.addComponent(LODGroup);
    group.size = 3;
    const mat = new StandardMaterial();
    mat.albedoColor = new Color(0.8, 0.3, 0.1, 1);
    mat.metallic = 0.25;
    const renderers: MeshRenderer[] = [];
    for (const [i, n] of ["High", "Mid", "Low"].entries()) {
        const c = child(n, root, [0, i, 0]);
        c.addComponent(MeshFilter).sharedMesh = Mesh.createCube(1 + i);
        const r = c.addComponent(MeshRenderer);
        r.sharedMaterial = mat;
        renderers.push(r);
    }
    const spr = child("Sprite", root).addComponent(SpriteRenderer);
    group.setLODs([
        { screenRelativeTransitionHeight: 0.5, renderers: [renderers[0], spr] },
        { screenRelativeTransitionHeight: 0.2, renderers: [renderers[1]] },
        { screenRelativeTransitionHeight: 0.05, renderers: [renderers[2]] },
    ]);

    const other = new GameObject("Other");
    const mat2 = new StandardMaterial();
    mat2.albedoColor = new Color(0, 0, 1, 1);
    other.addComponent(MeshRenderer).sharedMaterial = mat2;
    const again = child("Again", other);
    again.addComponent(MeshRenderer).sharedMaterial = mat;
    return { mat };
}

export function buildCine(): void {
    const player = new GameObject("Player");
    player.transform.localPosition = new Vector3(3, 0, 3);
    const head = child("Head", player, [0, 1.7, 0]);
    const camGo = new GameObject("MainCam");
    camGo.addComponent(Camera);
    camGo.addComponent(CinemachineBrain).defaultBlendTime = 1.25;
    const rig = new GameObject("Rig");
    const vcam = rig.addComponent(CinemachineVirtualCamera);
    vcam.priority = 7;
    vcam.follow = player.transform;
    vcam.lookAt = head.transform;
    rig.addComponent(CinemachineFollowBody).offset = new Vector3(0, 2, -5);
    rig.addComponent(CinemachineHardLookAtAim);
    const orbit = new GameObject("Orbit");
    orbit.addComponent(CinemachineVirtualCamera).priority = 3;
    const ob = orbit.addComponent(CinemachineOrbitalBody);
    ob.orbitCenter = new Vector3(1, 2, 3);
    ob.distance = 12;
}

export function buildPost(): void {
    const go = new GameObject("Post");
    const volume = go.addComponent(PostProcessVolume);
    volume.effects = [
        new BloomEffect({ intensity: 2, threshold: 0.6, radius: 0.9 }),
        new VignetteEffect({ intensity: 0.8, smoothness: 0.2, color: new Color(0.1, 0, 0.2, 1) }),
    ];
    volume.effects[1].enabled = false;
}

/** A material with a file behind it, and one without. */
export function buildMaterials(): void {
    const fileMat = new StandardMaterial();
    fileMat.albedoColor = new Color(1, 0, 0, 1);
    AssetDatabase._bind("materials/red.mat.json", fileMat);
    const inlineMat = new StandardMaterial();
    inlineMat.albedoColor = new Color(0, 1, 0, 1);

    const a = new GameObject("FileBacked");
    a.addComponent(MeshRenderer).sharedMaterial = fileMat;
    const b = new GameObject("Inline");
    b.addComponent(MeshRenderer).sharedMaterial = inlineMat;
    const c = child("InlineChild", b, [0, 1, 0]);
    c.addComponent(MeshRenderer).sharedMaterial = inlineMat;

    RenderSettings.fog = true;
    RenderSettings.fogDensity = 0.05;
    RenderSettings.ambientColor = new Color(0.2, 0.3, 0.4, 1);
}

/** A scene with an unknown component and an unknown nested value, written by hand. */
export const UNKNOWN_SCENE = {
    name: "Unknown",
    version: 1,
    roots: [
        {
            name: "Holder", active: true,
            transform: { position: { x: 1, y: 2, z: 3 }, rotation: { x: 0, y: 0, z: 0, w: 1 }, scale: { x: 1, y: 1, z: 1 } },
            components: [
                {
                    type: "Ghost.Script",
                    fields: {
                        speed: 4.5,
                        follow: { $type: "GameObjectRef", path: [0, 0] },
                        other: { $type: "ComponentRef", path: [1], component: "Compat.Follow", index: 0 },
                        mat: { $type: "AssetRef", guid: "deadbeefdeadbeefdeadbeefdeadbeef", path: "materials/missing.mat.json" },
                    },
                },
                {
                    type: "Compat.Follow",
                    fields: {
                        target: { $type: "GameObjectRef", path: [1] },
                        weight: 3,
                        comp: { $type: "ComponentRef", path: [0], component: "Ghost.Script", index: 0 },
                        list: [],
                        gos: [],
                        settings: { $type: "Nested", type: "Ghost.Nested", fields: { a: 1, ref: { $type: "GameObjectRef", path: [0, 0] } } },
                        offset: { $type: "Vector3", x: 0, y: 0, z: 0 },
                    },
                },
            ],
            children: [
                {
                    name: "Kid", active: true,
                    transform: { position: { x: 0, y: 1, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 }, scale: { x: 1, y: 1, z: 1 } },
                    components: [], children: [],
                },
            ],
        },
        {
            name: "Target", active: false,
            transform: { position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 }, scale: { x: 1, y: 1, z: 1 } },
            components: [{ type: "Compat.Follow", fields: { weight: 9 } }],
            children: [],
        },
    ],
};

/** A hierarchy with internal references, for prefab files. */
export function buildPrefabSource(): GameObject {
    const tank = new GameObject("Tank");
    tank.transform.localPosition = new Vector3(4, 0, 4);
    const hull = child("Hull", tank, [0, 0.5, 0]);
    const turret = child("Turret", tank, [0, 1, 0]);
    turret.transform.localRotation = Quaternion.euler(0, 45, 0);
    const barrel = child("Barrel", turret, [0, 0, 1.5]);
    const aim = tank.addComponent(CompatFollow);
    aim.target = barrel;
    aim.comp = hull.addComponent(SpriteRenderer);
    aim.gos = [turret, hull];
    const s = new CompatSettings();
    s.anchor = turret;
    aim.settings = s;
    const mat = new StandardMaterial();
    mat.albedoColor = new Color(0.4, 0.5, 0.6, 1);
    hull.addComponent(MeshRenderer).sharedMaterial = mat;
    barrel.addComponent(CompatFollow).target = tank;
    return tank;
}
