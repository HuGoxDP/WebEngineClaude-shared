import { test } from "vitest";
import { GameObject } from "../src/engine/core/GameObject";
import { SceneManager } from "../src/engine/core/SceneManager";
import { ScriptableBehaviour } from "../src/engine/core/ScriptableBehaviour";

/* eslint-disable @typescript-eslint/no-explicit-any */
const proto: any = GameObject.prototype;
const current = proto._systemUpdate;
function legacy(this: any, order: number | null = null): void {
    if (!this._activeSelf) return;
    for (const component of this._components) {
        if (!(component instanceof ScriptableBehaviour)) continue;
        component._systemUpdate();
    }
    const count = this.transform.childCount;
    for (let i = 0; i < count; i++) this.transform.getChild(i).gameObject._systemUpdate(order);
}
function variant(this: any, order: number | null = null): void {
    if (!this._activeSelf) return;
    for (const component of this._components) {
        if (!(component instanceof ScriptableBehaviour)) continue;
        component._systemUpdate();
    }
    const transform = this.transform;
    const children = transform._children;
    if (children.length === 0) return;
    transform._childrenLent = true;
    for (let i = 0; i < children.length; i++) {
        const child = children[i];
        if (child._parent === transform && !child.gameObject._isDestroyed) child.gameObject._systemUpdate(order);
    }
}
const out = (...a: unknown[]) => process.stderr.write("BENCH " + a.map(String).join(" ") + "\n");

class Noop extends ScriptableBehaviour { public override update(): void { /* nothing */ } }

function build(roots: number, kids: number, depth: number, withScript: boolean): void {
    for (const r of [...SceneManager.activeScene.getRootGameObjects()]) r.destroyImmediate();
    const make = (parent: GameObject | null, d: number) => {
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
    for (let f = 0; f < frames; f++) scene._update();
    return performance.now() - t0;
}

test("bench one impl per process", () => {
    const impl = process.env.BENCH_IMPL ?? "current";
    const fn = impl === "legacy" ? legacy : impl === "variant" ? variant : current;
    proto._systemUpdate = fn;
    const shapes: Array<[string, number, number, number, boolean]> = [
        ["flat2000-empty", 1, 2000, 1, false],
        ["tree3410-empty", 10, 4, 4, false],
        ["tree3410-script", 10, 4, 4, true],
    ];
    const res: string[] = [];
    for (const [name, roots, kids, depth, script] of shapes) {
        build(roots, kids, depth, script);
        const frames = 500;
        time(300);
        const T: number[] = [];
        for (let rep = 0; rep < 9; rep++) T.push(time(frames));
        T.sort((a, b) => a - b);
        res.push(`${name}=${(T[4] / frames * 1000).toFixed(1)}`);
    }
    proto._systemUpdate = current;
    out(impl, res.join(" "));
});
