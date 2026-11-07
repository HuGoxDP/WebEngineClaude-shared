import { test } from "vitest";
import { GameObject } from "../src/engine/core/GameObject";
import { SceneManager } from "../src/engine/core/SceneManager";
import { ScriptableBehaviour } from "../src/engine/core/ScriptableBehaviour";

/**
 * M0.3d walk cost (M0.3a probe + a reparenting shape): Scene._fixedUpdate + _update + _lateUpdate (one "frame" of the three
 * per-frame passes), median of 9 x 500 frames. Run the same file before and after the change,
 * one process per run: `npx vitest run tests/zz_m03d_probe_bench.test.ts`.
 */
const out = (...a: unknown[]) => process.stderr.write("BENCH " + a.map(String).join(" ") + "\n");

/** Each Update, moves the last root under the first and back next frame: catch-up work every frame. */
class Mover extends ScriptableBehaviour {
    public a: GameObject | null = null;
    public c: GameObject | null = null;
    private flip = false;
    public override update(): void {
        this.flip = !this.flip;
        this.c!.transform.setParent(this.flip ? this.a!.transform : null);
    }
}

class Noop extends ScriptableBehaviour {
    public override fixedUpdate(): void { /* nothing */ }
    public override update(): void { /* nothing */ }
    public override lateUpdate(): void { /* nothing */ }
}

function build(roots: number, kids: number, depth: number, withScript: boolean): void {
    for (const r of [...SceneManager.activeScene.getRootGameObjects()]) r.destroyImmediate();
    const make = (parent: GameObject | null, d: number): GameObject => {
        const go = new GameObject("n");
        if (withScript) go.addComponent(Noop);
        if (parent) go.transform.setParent(parent.transform);
        if (d > 0) for (let k = 0; k < kids; k++) make(go, d - 1);
        return go;
    };
    for (let r = 0; r < roots; r++) make(null, depth);
}

function time(frames: number): number {
    const scene = SceneManager.activeScene;
    const t0 = performance.now();
    for (let f = 0; f < frames; f++) { scene._fixedUpdate(); scene._update(); scene._lateUpdate(); }
    return performance.now() - t0;
}

test("bench", () => {
    const shapes: Array<[string, number, number, number, boolean]> = [
        ["flat2000-empty", 1, 2000, 1, false],
        ["tree3410-empty", 10, 4, 4, false],
        ["tree3410-script", 10, 4, 4, true],
    ];
    const res: string[] = [];
    {
        build(10, 4, 4, true);
        const roots = SceneManager.activeScene.getRootGameObjects();
        const m = roots[5].addComponent(Mover);
        m.a = roots[0]; m.c = roots[9];
        const frames = 500;
        time(300);
        const T: number[] = [];
        for (let rep = 0; rep < 9; rep++) T.push(time(frames));
        T.sort((a, b) => a - b);
        res.push(`tree3410-script-mover=${(T[4] / frames * 1000).toFixed(1)}us`);
    }
    for (const [name, roots, kids, depth, script] of shapes) {
        build(roots, kids, depth, script);
        const frames = 500;
        time(300);
        const heap0 = process.memoryUsage().heapUsed;
        const T: number[] = [];
        for (let rep = 0; rep < 9; rep++) T.push(time(frames));
        const heap1 = process.memoryUsage().heapUsed;
        T.sort((a, b) => a - b);
        res.push(`${name}=${(T[4] / frames * 1000).toFixed(1)}us(heapDelta ${((heap1 - heap0) / 1024).toFixed(0)}KB)`);
    }
    out(res.join(" "));
}, 120000);
