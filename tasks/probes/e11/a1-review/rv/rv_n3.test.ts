import { describe, test, expect, vi } from "vitest";
import { log } from "./log";

/** A fresh module registry: a new session, with every static map empty. */
async function session() {
    vi.resetModules();
    const c = await import("../vzw/zz_probe_common");
    const { StandardMaterial } = await import("../../src/engine/core/graphics/StandardMaterial");
    const { MeshRenderer } = await import("../../src/engine/core/rendering/MeshRenderer");
    const { Color } = await import("../../src/engine/core/math/Color");
    c.clear();
    c.AssetDatabase.clear();
    const box = (name: string, mat: InstanceType<typeof StandardMaterial>) => {
        const go = c.obj(name, name.toLowerCase());
        go.addComponent(MeshRenderer).sharedMaterial = mat;
        return go;
    };
    const green = () => { const m = new StandardMaterial(); m.albedoColor = new Color(0, 1, 0, 1); return m; };
    const load = (guid: string, file: unknown) => {
        const p = c.Prefab.fromJSON(JSON.parse(JSON.stringify(file)));
        c.AssetDatabase._bindGuid(guid, p);
        return p;
    };
    const mat = (go: any) => go.getComponent(MeshRenderer)!.sharedMaterial as any;
    const rgb = (go: any) => { const a = mat(go).albedoColor; return [a.r, a.g, a.b]; };
    const loadScene = (json: unknown) => {
        const roots = c.SceneSerializer.deserializeScene(JSON.parse(JSON.stringify(json)));
        c.SceneSerializer.resolvePendingAssets();
        return roots;
    };
    return { ...c, StandardMaterial, MeshRenderer, Color, box, green, load, mat, rgb, loadScene };
}
const red = (file: any) => {
    const f = JSON.parse(JSON.stringify(file));
    f.snapshot.assets[0].fields.albedoColor = { $type: "Color", r: 1, g: 0, b: 0, a: 1 };
    if (f.snapshot.assets[0].fields.color) f.snapshot.assets[0].fields.color = { $type: "Color", r: 1, g: 0, b: 0, a: 1 };
    return f;
};

async function oneBoxScene() {
    const s = await session();
    const src = s.box("Box", s.green());
    const file = JSON.parse(JSON.stringify(s.Prefab.fromGameObject(src).toJSON()));
    src.destroyImmediate();
    s.load("guid-box", file).instantiate();
    const scene = JSON.parse(JSON.stringify(s.saveExpand()));
    return { file, scene };
}

describe("N3 of: prefab edited between save and load", () => {
    test("material edited: the scene keeps its own copy, honestly reported, and re-saves byte-identically", async () => {
        const { file, scene } = await oneBoxScene();
        log("n3", "scene assets", scene.assets);
        const s = await session();
        const p = s.load("guid-box", red(file));
        const [r] = s.loadScene(scene);
        expect(s.rgb(r)).toEqual([0, 1, 0]);
        const ch = p.getChanges(r);
        expect(ch.overrides.map((o: any) => `${o.component}.${o.field}`)).toEqual(["MeshRenderer.sharedMaterial"]);
        expect(JSON.stringify(s.saveExpand())).toBe(JSON.stringify(scene));
        const link = JSON.parse(JSON.stringify(s.saveLink()));
        const s3 = await session();
        s3.load("guid-box", red(file));
        const [r3] = s3.loadScene(link);
        expect(s3.rgb(r3)).toEqual([0, 1, 0]);
        expect(JSON.stringify(s3.saveLink())).toBe(JSON.stringify(link));
    });
    test("prefab edited elsewhere (Tag label) but not its material: still bound to the prefab's material", async () => {
        const { file, scene } = await oneBoxScene();
        const s = await session();
        const f = JSON.parse(JSON.stringify(file));
        f.snapshot.components.find((c: any) => c.type === "Probe.Tag").fields.label = "edited";
        const p = s.load("guid-box", f);
        const [r] = s.loadScene(scene);
        const fresh = p.instantiate();
        expect(s.mat(r)).toBe(s.mat(fresh));
        expect(p.getChanges(r).overrides.map((o: any) => `${o.component}.${o.field}`)).toEqual(["Probe.Tag.label"]);
        fresh.destroyImmediate();
        expect(JSON.stringify(s.saveExpand())).toBe(JSON.stringify(scene));
    });
});

describe("N3 of: scene loaded before the prefab (the order assetReferences gives)", () => {
    test("assetReferences of an expand scene does not name the prefab", async () => {
        const { scene } = await oneBoxScene();
        const s = await session();
        log("n3", "assetReferences(expand scene) =", s.SceneSerializer.assetReferences(scene));
        expect(s.SceneSerializer.assetReferences(scene)).not.toContain("guid-box");
    });
    test("prefab loaded after the scene: instance follows the prefab's material, getChanges empty, link save carries no assets", async () => {
        const { file, scene } = await oneBoxScene();
        const s = await session();
        const [r] = s.loadScene(scene);
        const p = s.load("guid-box", file);
        s.SceneSerializer.resolvePendingAssets();
        const ch = p.getChanges(r);
        log("n3", "scene-first getChanges", ch);
        const link = s.saveLink();
        log("n3", "scene-first link assets", link.assets ?? null);
        expect(ch).toEqual({ overrides: [] });
        expect(link.assets ?? []).toEqual([]);
    });
});

describe("N3 of: two prefabs share content", () => {
    async function shared() {
        const s = await session();
        const m = s.green();
        const a = s.box("BoxA", m);
        const b = s.box("BoxB", m);
        const fa = JSON.parse(JSON.stringify(s.Prefab.fromGameObject(a).toJSON()));
        const fb = JSON.parse(JSON.stringify(s.Prefab.fromGameObject(b).toJSON()));
        a.destroyImmediate(); b.destroyImmediate();
        log("n3", "shared ids", fa.snapshot.assets.map((x: any) => x.guid), fb.snapshot.assets.map((x: any) => x.guid));
        s.load("guid-a", fa).instantiate();
        s.load("guid-b", fb).instantiate();
        const scene = JSON.parse(JSON.stringify(s.saveExpand()));
        log("n3", "shared scene assets", scene.assets);
        return { fa, fb, scene };
    }
    test("one material object in both prefabs; both loaded: both instances share it, no changes", async () => {
        const { fa, fb, scene } = await shared();
        const s = await session();
        const pa = s.load("guid-a", fa); const pb = s.load("guid-b", fb);
        const [ra, rb] = s.loadScene(scene);
        expect(pa.getChanges(ra)).toEqual({ overrides: [] });
        expect(pb.getChanges(rb)).toEqual({ overrides: [] });
        expect(JSON.stringify(s.saveExpand())).toBe(JSON.stringify(scene));
    });
    test("one material object in both prefabs; only B loaded: B's instance still binds to B's material", async () => {
        const { fb, scene } = await shared();
        const s = await session();
        const pb = s.load("guid-b", fb);
        const roots = s.loadScene(scene);
        const rb = roots.find((r: any) => r.name === "BoxB")!;
        const ch = pb.getChanges(rb);
        log("n3", "only-B getChanges", ch);
        expect(ch).toEqual({ overrides: [] });
    });
    test("two equal but distinct materials: each instance binds to its own prefab's", async () => {
        const s = await session();
        const a = s.box("BoxA", s.green()); const b = s.box("BoxB", s.green());
        const fa = JSON.parse(JSON.stringify(s.Prefab.fromGameObject(a).toJSON()));
        const fb = JSON.parse(JSON.stringify(s.Prefab.fromGameObject(b).toJSON()));
        a.destroyImmediate(); b.destroyImmediate();
        s.load("guid-a", fa).instantiate(); s.load("guid-b", fb).instantiate();
        const scene = JSON.parse(JSON.stringify(s.saveExpand()));
        const t = await session();
        const pa = t.load("guid-a", fa); const pb = t.load("guid-b", fb);
        const [ra, rb] = t.loadScene(scene);
        expect(pa.getChanges(ra)).toEqual({ overrides: [] });
        expect(pb.getChanges(rb)).toEqual({ overrides: [] });
        expect(t.mat(ra)).not.toBe(t.mat(rb));
        pa._resolvedTree(); // keep
        expect(JSON.stringify(t.saveExpand())).toBe(JSON.stringify(scene));
    });
    test("instance of A wearing B's material: link round trip binds to B's and is idempotent", async () => {
        const s = await session();
        const a = s.box("BoxA", s.green()); const b = s.box("BoxB", s.green());
        const fa = JSON.parse(JSON.stringify(s.Prefab.fromGameObject(a).toJSON()));
        const fb = JSON.parse(JSON.stringify(s.Prefab.fromGameObject(b).toJSON()));
        a.destroyImmediate(); b.destroyImmediate();
        const pa = s.load("guid-a", fa); const pb = s.load("guid-b", fb);
        const ia = pa.instantiate(); const ib = pb.instantiate();
        ia.getComponent(s.MeshRenderer)!.sharedMaterial = s.mat(ib);
        const link = JSON.parse(JSON.stringify(s.saveLink()));
        log("n3", "A-wears-B link", link);
        const t = await session();
        t.load("guid-a", fa); const tb = t.load("guid-b", fb);
        const [ra, rb] = t.loadScene(link);
        expect(t.mat(ra)).toBe(t.mat(rb));
        expect(tb.getChanges(rb)).toEqual({ overrides: [] });
        expect(JSON.stringify(t.saveLink())).toBe(JSON.stringify(link));
    });
});

describe("N3 of: variant and nested", () => {
    test("variant instance in an expand scene binds to the base's material across sessions", async () => {
        const s = await session();
        const src = s.box("Box", s.green());
        const fbase = JSON.parse(JSON.stringify(s.Prefab.fromGameObject(src).toJSON()));
        src.destroyImmediate();
        const base = s.load("guid-box", fbase);
        const probe = base.instantiate();
        probe.getComponent(s.Tag)!.count = 9;
        const v = s.Prefab.createVariant(base, base.getChanges(probe));
        probe.destroyImmediate();
        s.AssetDatabase._bindGuid("guid-var", v);
        const fvar = JSON.parse(JSON.stringify(v.toJSON()));
        v.instantiate();
        const scene = JSON.parse(JSON.stringify(s.saveExpand()));
        const t = await session();
        t.load("guid-box", fbase); const tv = t.load("guid-var", fvar);
        const [r] = t.loadScene(scene);
        expect(tv.getChanges(r)).toEqual({ overrides: [] });
        expect(JSON.stringify(t.saveExpand())).toBe(JSON.stringify(scene));
    });
    test("nested Box inside a Tank prefab, expand scene, next session: Tank instance has no changes", async () => {
        const s = await session();
        const src = s.box("Box", s.green());
        const fbox = JSON.parse(JSON.stringify(s.Prefab.fromGameObject(src).toJSON()));
        src.destroyImmediate();
        const box = s.load("guid-box", fbox);
        const tsrc = s.obj("Tank", "tank", box.instantiate());
        const ftank = JSON.parse(JSON.stringify(s.Prefab.fromGameObject(tsrc).toJSON()));
        tsrc.destroyImmediate();
        s.load("guid-tank", ftank).instantiate();
        const scene = JSON.parse(JSON.stringify(s.saveExpand()));
        log("n3", "nested scene assets", scene.assets, "tank file assets", ftank.snapshot.assets ?? null);
        const t = await session();
        t.load("guid-box", fbox); const tt = t.load("guid-tank", ftank);
        const [r] = t.loadScene(scene);
        expect(tt.getChanges(r)).toEqual({ overrides: [] });
        expect(JSON.stringify(t.saveExpand())).toBe(JSON.stringify(scene));
        const link = t.saveLink();
        expect(link.assets ?? []).toEqual([]);
    });
});

describe("N3 of: survives what happens to the prefab after the scene is open", () => {
    test("bound to the prefab's material, prefab then unbound (unloaded): the expand save still says what it copies", async () => {
        const { file, scene } = await oneBoxScene();
        const s = await session();
        const p = s.load("guid-box", file);
        s.loadScene(scene);
        s.AssetDatabase._unbind(p);
        const again = JSON.parse(JSON.stringify(s.saveExpand()));
        log("n3", "after unbind assets of", again.assets?.map((a: any) => a.of ?? null));
        expect(again.assets?.[0]?.of).toEqual(scene.assets[0].of);
    });
    test("AssetDatabase.clearLoaded between load and save", async () => {
        const { file, scene } = await oneBoxScene();
        const s = await session();
        s.load("guid-box", file);
        s.loadScene(scene);
        s.AssetDatabase.clearLoaded();
        const again = JSON.parse(JSON.stringify(s.saveExpand()));
        log("n3", "after clearLoaded assets", again.assets?.map((a: any) => ({ guid: a.guid, of: a.of ?? null })), "orig", scene.assets.map((a: any) => ({ guid: a.guid, of: a.of ?? null })));
        expect(again.assets?.[0]?.of).toEqual(scene.assets[0].of);
    });
});
