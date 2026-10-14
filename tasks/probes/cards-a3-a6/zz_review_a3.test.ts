import { describe, test, expect, beforeEach } from "vitest";
import { GameObject } from "../src/engine/core/GameObject";
import { EngineObject } from "../src/engine/core/EngineObject";
import { Behaviour } from "../src/engine/core/Behaviour";
import { ScriptableBehaviour } from "../src/engine/core/ScriptableBehaviour";
import { SceneManager } from "../src/engine/core/SceneManager";
import { LODGroup } from "../src/engine/core/components/LODGroup";
import { Animation } from "../src/engine/core/animation/Animation";
import { ParticleSystem } from "../src/engine/core/particles/ParticleSystem";
import { Canvas } from "../src/engine/core/ui/Canvas";
import { UIImage } from "../src/engine/core/ui/UIImage";
import { RectTransform } from "../src/engine/core/ui/RectTransform";
import { LayoutGroup, VerticalLayoutGroup } from "../src/engine/core/ui/LayoutGroup";
import { Selectable } from "../src/engine/core/ui/Selectable";
import { Button } from "../src/engine/core/ui/Button";

function clear(): void {
    for (const root of [...SceneManager.activeScene.getRootGameObjects()]) { try { root.destroyImmediate(); } catch { /* probe */ } }
}
beforeEach(() => clear());

class Tag extends Behaviour {}

describe("A3 review probes", () => {
    test("P1 a component added in a sibling's onDestroy during GameObject teardown is destroyed too", () => {
        let bred: Tag | null = null;
        class Breeder extends ScriptableBehaviour {
            public override onDestroy(): void { bred = this.gameObject.addComponent(Tag); }
        }
        const go = new GameObject("go");
        go.addComponent(Breeder);
        go.destroyImmediate();
        const found = EngineObject.FindObjectsOfType(Tag, true).filter(t => t === bred);
        process.stderr.write(["P1 bred.exists()", bred!.exists(), "FindObjectsOfType finds it", found.length, "listed", go.getAllComponents().length].map(x => typeof x === "string" ? x : JSON.stringify(x)).join(" ") + "\n");
        expect(bred!.exists()).toBe(false);
    });

    test("P2 throwing onDestroy via destroyImmediate, then destroy the object: zombie?", () => {
        class Fragile extends ScriptableBehaviour {
            public calls = 0;
            public override onDestroy(): void { this.calls++; throw new Error("cleanup failed"); }
        }
        const go = new GameObject("go");
        const f = go.addComponent(Fragile);
        try { f.destroyImmediate(); } catch { /* expected */ }
        let threw = false;
        try { go.destroyImmediate(); } catch { threw = true; }
        const found = EngineObject.FindObjectsOfType(Fragile, true).filter(x => x === f).length;
        process.stderr.write(["P2 f.exists()", f.exists(), "calls", f.calls, "goDestroyThrew", threw, "go.exists()", go.exists(), "found", found].map(x => typeof x === "string" ? x : JSON.stringify(x)).join(" ") + "\n");
    });

    test("P3 self destroyImmediate inside own onDestroy (re-entrancy)", () => {
        class Self extends ScriptableBehaviour {
            public calls = 0;
            public override onDestroy(): void { this.calls++; if (this.calls < 50) this.destroyImmediate(); }
        }
        const go = new GameObject("go");
        const s = go.addComponent(Self);
        s.destroyImmediate();
        process.stderr.write(["P3 calls", s.calls, "listed", go.getAllComponents().length].map(x => typeof x === "string" ? x : JSON.stringify(x)).join(" ") + "\n");
    });

    test("P4 registries: LODGroup / Animation / ParticleSystem / UI drivers emptied on component destroy and object destroy", () => {
        const counts = (): Record<string, number> => ({
            lod: (LODGroup as any)._activeInstances.size,
            anim: (Animation as any)._activeInstances.size,
            ps: (ParticleSystem as any)._activeInstances.size,
            canvas: (Canvas as any)._instances.length,
            layout: (LayoutGroup as any)._instances.length,
            sel: (Selectable as any)._instances.length,
        });
        const base = counts();
        const go = new GameObject("go");
        const lod = go.addComponent(LODGroup);
        const anim = go.addComponent(Animation);
        const ps = go.addComponent(ParticleSystem);
        const cgo = new GameObject("canvas");
        cgo.addComponent(Canvas);
        const ui = new GameObject("ui");
        ui.transform.setParent(cgo.transform);
        ui.addComponent(VerticalLayoutGroup);
        ui.addComponent(Button);
        const added = counts();
        process.stderr.write(["P4 base", JSON.stringify(base), "added", JSON.stringify(added)].map(x => typeof x === "string" ? x : JSON.stringify(x)).join(" ") + "\n");
        lod.destroyImmediate(); anim.destroyImmediate(); ps.destroyImmediate();
        const afterComp = counts();
        process.stderr.write(["P4 after component destroy", JSON.stringify(afterComp), "listed", go.getAllComponents().length].map(x => typeof x === "string" ? x : JSON.stringify(x)).join(" ") + "\n");
        ui.getComponent(Button)!.destroyImmediate();
        ui.getComponent(VerticalLayoutGroup)!.destroyImmediate();
        process.stderr.write(["P4 after UI component destroy", JSON.stringify(counts()), "ui listed", ui.getAllComponents().map(c => c.constructor.name)].map(x => typeof x === "string" ? x : JSON.stringify(x)).join(" ") + "\n");
        cgo.destroyImmediate();
        go.destroyImmediate();
        process.stderr.write(["P4 after object destroy", JSON.stringify(counts())].map(x => typeof x === "string" ? x : JSON.stringify(x)).join(" ") + "\n");
        expect(counts()).toEqual(base);
    });

    test("P5 UI teardown: RectTransform destroyed first, then UIImage, no RectTransform auto-added", () => {
        const cgo = new GameObject("canvas");
        cgo.addComponent(Canvas);
        const ui = new GameObject("ui");
        ui.transform.setParent(cgo.transform);
        ui.addComponent(RectTransform);
        ui.addComponent(UIImage);
        const rtsBefore = EngineObject.FindObjectsOfType(RectTransform, true).length;
        ui.getComponent(RectTransform)!.destroyImmediate();
        const listed = ui.getAllComponents().map(c => c.constructor.name);
        const img = ui.getComponent(UIImage)!;
        void img.rectTransform;
        const after = ui.getAllComponents().map(c => c.constructor.name);
        process.stderr.write(["P5 rts before", rtsBefore, "listed after RT destroy", listed, "after touching rectTransform", after].map(x => typeof x === "string" ? x : JSON.stringify(x)).join(" ") + "\n");
        cgo.destroyImmediate();
        const live = EngineObject.FindObjectsOfType(RectTransform, true).length;
        process.stderr.write(["P5 live RectTransforms after canvas destroy", live].map(x => typeof x === "string" ? x : JSON.stringify(x)).join(" ") + "\n");
    });

    test("P6 destroying a component during sendMessage / lateUpdate / fixedUpdate", () => {
        class W extends ScriptableBehaviour {
            public n = 0; public late = 0; public fixed = 0; public kill: (() => void) | null = null;
            public ping(): void { this.n++; this.kill?.(); }
            public override lateUpdate(): void { this.late++; this.kill?.(); }
            public override fixedUpdate(): void { this.fixed++; this.kill?.(); }
        }
        const go = new GameObject("go");
        const a = go.addComponent(W), b = go.addComponent(W), c = go.addComponent(W);
        a.kill = () => { a.kill = null; a.destroyImmediate(); };
        go.sendMessage("ping");
        process.stderr.write(["P6 sendMessage", a.n, b.n, c.n].map(x => typeof x === "string" ? x : JSON.stringify(x)).join(" ") + "\n");
        expect([b.n, c.n]).toEqual([1, 1]);
        const go2 = new GameObject("go2");
        const a2 = go2.addComponent(W), b2 = go2.addComponent(W), c2 = go2.addComponent(W);
        go2._systemUpdate();
        a2.kill = () => { a2.kill = null; a2.destroyImmediate(); };
        go2._systemLateUpdate();
        expect([b2.late, c2.late]).toEqual([1, 1]);
        const go3 = new GameObject("go3");
        const a3 = go3.addComponent(W), b3 = go3.addComponent(W), c3 = go3.addComponent(W);
        go3._systemUpdate();
        a3.kill = () => { a3.kill = null; a3.destroyImmediate(); };
        go3._systemFixedUpdate();
        expect([b3.fixed, c3.fixed]).toEqual([1, 1]);
    });

    test("P7 deferred destroy() of a component while its object is also destroyed the same frame", async () => {
        const go = new GameObject("go");
        const t = go.addComponent(Tag);
        t.destroy();
        go.destroy();
        await Promise.resolve();
        await Promise.resolve();
        expect(t.exists()).toBe(false);
        expect(go.exists()).toBe(false);
    });

    test("P8 SetActive(false) handler destroys sibling: onDisable loop over components", () => {
        const order: string[] = [];
        class D extends ScriptableBehaviour {
            public victim: D | null = null; public tagName = "";
            public override onDisable(): void { order.push("disable " + this.tagName); this.victim?.destroyImmediate(); this.victim = null; }
            public override onDestroy(): void { order.push("destroy " + this.tagName); }
        }
        const go = new GameObject("go");
        const a = go.addComponent(D); a.tagName = "a";
        const b = go.addComponent(D); b.tagName = "b";
        const c = go.addComponent(D); c.tagName = "c";
        a.victim = b;
        go.setActive(false);
        process.stderr.write(["P8", order.join(", ")].map(x => typeof x === "string" ? x : JSON.stringify(x)).join(" ") + "\n");
        expect(order).toContain("disable c");
    });
});
