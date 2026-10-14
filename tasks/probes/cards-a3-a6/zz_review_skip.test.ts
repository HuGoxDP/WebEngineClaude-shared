import { test, expect } from "vitest";
import { GameObject } from "../../src/engine/core/GameObject";
import { ScriptableBehaviour } from "../../src/engine/core/ScriptableBehaviour";
class W extends ScriptableBehaviour { public n = 0; public f: (() => void) | null = null; public override update(): void { this.n++; this.f?.(); } }
test("skip", () => {
    for (const how of ["destroyImmediate", "removeComponent"]) {
        const go = new GameObject("g");
        const a = go.addComponent(W), b = go.addComponent(W), c = go.addComponent(W);
        a.f = () => { a.f = null; if (how === "destroyImmediate") a.destroyImmediate(); else go.removeComponent(a); };
        go._systemUpdate();
        process.stderr.write(`${how}: updates a=${a.n} b=${b.n} c=${c.n}\n`);
    }
    expect(true).toBe(true);
});
