import { test } from "vitest";
import { GameObject } from "../src/engine/core/GameObject";
import { ScriptableBehaviour } from "../src/engine/core/ScriptableBehaviour";
import { SceneManager } from "../src/engine/core/SceneManager";

/** The converse of M0.3a: an object moved, before its turn, under a parent already walked. */
const log: string[] = [];
class Rec extends ScriptableBehaviour {
    public act: (() => void) | null = null;
    public override update(): void { log.push(this.gameObject.name); const a = this.act; this.act = null; a?.(); }
}
test("moved before its turn under an already-walked root", () => {
    for (const r of [...SceneManager.activeScene.getRootGameObjects()]) r.destroyImmediate();
    const a = new GameObject("A").addComponent(Rec);
    const b = new GameObject("B").addComponent(Rec);
    const c = new GameObject("C").addComponent(Rec);
    SceneManager.activeScene._update(); log.length = 0;
    b.act = () => c.transform.setParent(a.transform);
    SceneManager.activeScene._update();
    process.stderr.write("PROBE converse: " + JSON.stringify(log) + "\n");
});
