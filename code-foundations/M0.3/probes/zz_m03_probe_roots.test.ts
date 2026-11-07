import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";
import { GameObject } from "../src/engine/core/GameObject";
import { EngineObject } from "../src/engine/core/EngineObject";
import { Behaviour } from "../src/engine/core/Behaviour";
import { ScriptableBehaviour } from "../src/engine/core/ScriptableBehaviour";
import { SceneManager } from "../src/engine/core/SceneManager";

const log: string[] = [];
class Rec extends ScriptableBehaviour {
    public act: (() => void) | null = null;
    public override update(): void { log.push(this.gameObject.name); const a = this.act; this.act = null; a?.(); }
}
function root(name: string): Rec { return new GameObject(name).addComponent(Rec); }
function clear(): void { for (const r of [...SceneManager.activeScene.getRootGameObjects()]) { try { r.destroyImmediate(); } catch { /**/ } } }
let errors: ReturnType<typeof vi.spyOn>;
beforeEach(() => { clear(); log.length = 0; errors = vi.spyOn(console, "error").mockImplementation(() => {}); });
afterEach(() => { errors.mockRestore(); clear(); });
const out = (...a: unknown[]) => process.stderr.write("PROBE " + a.map(String).join(" ") + "\n");
const frame = () => SceneManager.activeScene._update();

describe("P1 root destroyed mid-update", () => {
    test("A destroys itself: B must still update", () => {
        const a = root("A"); root("B"); root("C");
        frame(); log.length = 0;
        a.act = () => a.gameObject.destroyImmediate();
        frame();
        expect(log).toEqual(["A", "B", "C"]);
    });
    test("B destroys earlier A: C must still update", () => {
        const a = root("A"); const b = root("B"); root("C");
        frame(); log.length = 0;
        b.act = () => a.gameObject.destroyImmediate();
        frame();
        expect(log).toEqual(["A", "B", "C"]);
    });
    test("A destroys later B: B must not update, C must", () => {
        const a = root("A"); const b = root("B"); root("C");
        frame(); log.length = 0;
        a.act = () => b.gameObject.destroyImmediate();
        frame();
        expect(log).toEqual(["A", "C"]);
    });
    test("A reparents itself under later C: runs once", () => {
        const a = root("A"); root("B"); const c = root("C");
        frame(); log.length = 0;
        a.act = () => a.transform.setParent(c.transform);
        frame();
        expect(log.filter(n => n === "A").length).toBe(1);
        expect(log).toContain("B");
    });
    test("A moves itself to the end via setSiblingIndex: B runs once", () => {
        const a = root("A"); root("B"); root("C");
        frame(); log.length = 0;
        a.act = () => a.transform.setSiblingIndex(5);
        frame();
        expect(log).toEqual(["A", "B", "C"]);
    });
    test("root created during update: same frame?", () => {
        const a = root("A");
        frame(); log.length = 0;
        a.act = () => { root("N"); };
        frame();
        out("new root same frame:", JSON.stringify(log));
    });
});

describe("P2 zero-delay destroy of a throwing component", () => {
    test("destroy() -> microtask", async () => {
        class Fragile extends Behaviour { protected override onDestroy(): void { throw new Error("boom"); } }
        const go = new GameObject("x");
        const f = go.addComponent(Fragile);
        let unhandled: unknown = null;
        const h = (e: unknown) => { unhandled = e; };
        process.on("uncaughtException", h);
        f.destroy();
        await Promise.resolve(); await new Promise(r => setTimeout(r, 0));
        process.off("uncaughtException", h);
        out("microtask unhandled:", String(unhandled), "exists:", f.exists(), "logged:", errors.mock.calls.length);
    });
});

describe("P3 both onDisable and onDestroy throw", () => {
    test("which error survives", () => {
        class Both extends Behaviour {
            protected override onDisable(): void { throw new Error("disable"); }
            protected override onDestroy(): void { throw new Error("destroy"); }
        }
        const go = new GameObject("y");
        const b = go.addComponent(Both);
        let caught: unknown = null;
        try { b.destroyImmediate(); } catch (e) { caught = e; }
        out("both:", String(caught), "logged:", errors.mock.calls.map(c => String(c[1] ?? c[0])));
    });
});

describe("P6 isolateCallbackErrors=false and GameObject teardown", () => {
    test("error reaches nobody but console", () => {
        class Fragile extends Behaviour { protected override onDestroy(): void { throw new Error("boom"); } }
        ScriptableBehaviour.isolateCallbackErrors = false;
        try {
            const go = new GameObject("z");
            go.addComponent(Fragile);
            let threw = false;
            try { go.destroyImmediate(); } catch { threw = true; }
            out("strict mode GO teardown threw:", threw, "logged:", errors.mock.calls.length, "exists:", go.exists());
        } finally { ScriptableBehaviour.isolateCallbackErrors = true; }
    });
});
describe("P7 child moves itself under a later-walked parent", () => {
    test("runs twice?", () => {
        const top = root("top");
        const p1 = new GameObject("p1"); p1.transform.setParent(top.transform);
        const p2 = new GameObject("p2"); p2.transform.setParent(top.transform);
        const k = new GameObject("k").addComponent(Rec); k.transform.setParent(p1.transform);
        frame(); log.length = 0;
        k.act = () => k.transform.setParent(p2.transform);
        frame();
        out("child self-move:", JSON.stringify(log));
    });
});
